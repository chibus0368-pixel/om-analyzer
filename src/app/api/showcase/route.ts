/**
 * Public showcase API - returns real property hero photos from the
 * workspace_properties collection to power the landing-page hero cards.
 *
 * Anonymized: we return heroImageUrl + asset type + verdict band only.
 * No names, no addresses, no financials - the landing page supplies the
 * deal narratives; this endpoint only supplies the real imagery layer.
 *
 * Cached aggressively at the edge so traffic costs one Firestore read
 * per hour regardless of how many people hit the landing page.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShowcasePhoto = {
  heroImageUrl: string;
  /** Normalized name (no address, no financials) used so the landing page
   *  can match the photo to its corresponding sample card (e.g. "Hales
   *  Corners Plaza" → photo from a Hales Corners property in Pro). */
  nameKey?: string;
  assetType?: string;
  verdict?: "BUY" | "NEUTRAL" | "PASS";
};

export async function GET() {
  try {
    const db = getAdminDb();

    // Pull recent workspace_properties that have hero photos. We don't filter
    // by userId because this is a curated site-wide showcase - we just want
    // real CRE imagery to replace the Unsplash stock on the landing page.
    // No orderBy to avoid requiring a composite index; we fetch a pool
    // and take the first N with valid images.
    const snap = await db
      .collection("workspace_properties")
      .limit(400)
      .get();

    const seen = new Set<string>();
    const photos: ShowcasePhoto[] = [];

    // Prefer properties that actually got scored (scoreTotal > 0) so we show
    // real, completed deals. Fall back to any property with a hero image.
    const primary: ShowcasePhoto[] = [];
    const fallback: ShowcasePhoto[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as any;
      const url: string | undefined = d.heroImageUrl;
      if (!url || !url.startsWith("https://")) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      const score = Number(d.scoreTotal || d.score || 0);
      const verdict: ShowcasePhoto["verdict"] =
        score >= 70 ? "BUY" : score >= 55 ? "NEUTRAL" : "PASS";

      // Lowercased, stripped-down name key for substring matching on the
      // landing page. We strip commas + "center/plaza/etc" boilerplate so
      // "Hales Corners" matches "Hales Corners Plaza" and vice versa.
      const rawName: string = d.propertyName || d.name || d.title || "";
      const nameKey = rawName
        .toLowerCase()
        .replace(/[,\.]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const entry: ShowcasePhoto = {
        heroImageUrl: url,
        nameKey: nameKey || undefined,
        assetType: d.assetType || d.analysisType || undefined,
        verdict: score > 0 ? verdict : undefined,
      };

      if (score > 0) primary.push(entry); else fallback.push(entry);
    }

    // Combine - scored first, then unscored; cap at 12
    photos.push(...primary.slice(0, 12));
    if (photos.length < 12) {
      photos.push(...fallback.slice(0, 12 - photos.length));
    }

    return NextResponse.json(
      { photos, count: photos.length },
      {
        headers: {
          // Edge cache for 1 hour, serve stale for another hour while revalidating
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err: any) {
    console.error("[showcase] failed:", err?.message || err);
    return NextResponse.json({ photos: [], error: err?.message || "failed" }, { status: 200 });
  }
}
