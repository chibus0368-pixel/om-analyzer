/**
 * loadOmText
 *
 * Server-side helper that loads the most recent OM document text for a
 * property. Used by the deal-coach chat and location-intel routes to feed
 * Perplexity raw OM excerpts as additional grounding (on top of the
 * structured extracted_fields).
 *
 * Strategy:
 *   1. If `workspace_om_text/{propertyId}` exists with a recent (<= 90 day)
 *      cached `text`, return it. Pure Firestore read, fast.
 *   2. Otherwise, find the latest non-archived OM doc in
 *      `workspace_documents` for this property (any of: docCategory='om',
 *      most recent uploadedAt). Download the file from Storage and run
 *      pdf-parse. Cache the result in workspace_om_text/{propertyId} so
 *      future calls don't redo the extraction.
 *   3. Cap text at 60,000 chars (~15k tokens) so it never blows the
 *      Perplexity context window.
 *
 * Returns null if no OM doc exists or text extraction fails. Callers
 * should treat that as "no OM context" and fall back to extracted_fields.
 */

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const TEXT_CAP = 60_000;

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = String((result as any)?.text || "").trim();
    return text.slice(0, TEXT_CAP);
  } catch (err: any) {
    console.warn("[load-om-text] pdf-parse failed:", err?.message);
    return "";
  }
}

export async function loadOmText(propertyId: string): Promise<string | null> {
  if (!propertyId) return null;
  const db = getAdminDb();

  // 1. Check cache
  try {
    const cacheSnap = await db.collection("workspace_om_text").doc(propertyId).get();
    if (cacheSnap.exists) {
      const c = cacheSnap.data() as any;
      const age = Date.now() - new Date(c?.refreshedAt || 0).getTime();
      if (age < CACHE_TTL_MS && typeof c?.text === "string" && c.text.length > 200) {
        return c.text;
      }
    }
  } catch { /* fall through */ }

  // 2. Find latest OM doc
  let storagePath: string | null = null;
  try {
    const docsSnap = await db
      .collection("workspace_documents")
      .where("propertyId", "==", propertyId)
      .get();
    if (docsSnap.empty) return null;
    const candidates = docsSnap.docs
      .map((d) => d.data() as any)
      .filter((d) => !d.isDeleted && !d.isArchived && d.storagePath)
      // Prefer docCategory='om' but fall back to anything
      .sort((a, b) => {
        const aOm = a.docCategory === "om" ? 1 : 0;
        const bOm = b.docCategory === "om" ? 1 : 0;
        if (aOm !== bOm) return bOm - aOm;
        return String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || ""));
      });
    if (candidates.length === 0) return null;
    storagePath = candidates[0].storagePath;
  } catch (err: any) {
    console.warn("[load-om-text] doc lookup failed:", err?.message);
    return null;
  }
  if (!storagePath) return null;

  // 3. Download + extract
  try {
    const bucket = getAdminStorage().bucket();
    const gcsFile = bucket.file(storagePath);
    const [exists] = await gcsFile.exists();
    if (!exists) return null;
    const [buffer] = await gcsFile.download();
    const text = await extractPdfText(buffer);
    if (!text || text.length < 200) return null;

    // Cache it
    await db
      .collection("workspace_om_text")
      .doc(propertyId)
      .set({
        propertyId,
        text,
        refreshedAt: new Date().toISOString(),
        storagePath,
        textLength: text.length,
      })
      .catch((e) => console.warn("[load-om-text] cache write failed:", e?.message));

    return text;
  } catch (err: any) {
    console.warn("[load-om-text] storage/extract failed:", err?.message);
    return null;
  }
}
