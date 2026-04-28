import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/deal-coach/save-field
 *
 * Persists a single extracted-field value into Firestore so the
 * property page reads it the next time it loads. Used by the CRE
 * Chatbot when the user answers a missing-data question.
 *
 * Body: { propertyId, group, name, value, source? }
 *   - group + name = the canonical field key (e.g. "property_basics" + "building_sf")
 *   - value = whatever the user told the bot, coerced to string for storage
 *   - source = display label for where this came from (default: "deal_coach_chat")
 *
 * Behavior:
 *   - Looks up an existing extracted_fields row by (propertyId, group, name).
 *     If found, updates it with isUserOverridden=true + userOverrideValue.
 *     If not found, creates a new row.
 *   - Always sets isUserConfirmed=true so the value sticks even if the
 *     parser later runs again with a different number.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(auth.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const propertyId: string = String(body?.propertyId || "");
  const group: string = String(body?.group || "").trim();
  const name: string = String(body?.name || "").trim();
  const rawValue = body?.value;
  const source: string = String(body?.source || "deal_coach_chat");

  if (!propertyId || !group || !name) {
    return NextResponse.json({ error: "propertyId, group, and name required" }, { status: 400 });
  }
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return NextResponse.json({ error: "value required" }, { status: 400 });
  }

  const db = getAdminDb();
  const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!propSnap.exists) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  const prop = propSnap.data() as any;
  if (prop.userId && prop.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Coerce to string for rawValue, keep a normalized number where the
  // value parses cleanly (so downstream readers that expect numbers
  // still work without re-parsing).
  const stringValue = String(rawValue).trim();
  const numericTry = Number(stringValue.replace(/[$,%\s]/g, ""));
  const normalized: any = Number.isFinite(numericTry) && stringValue.match(/[\d.]/) ? numericTry : stringValue;

  const now = new Date().toISOString();

  try {
    // Find an existing row to update (so we don't accumulate duplicates).
    const existingSnap = await db
      .collection("workspace_extracted_fields")
      .where("propertyId", "==", propertyId)
      .where("fieldGroup", "==", group)
      .where("fieldName", "==", name)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const ref = existingSnap.docs[0].ref;
      await ref.update({
        rawValue: stringValue,
        normalizedValue: normalized,
        isUserOverridden: true,
        isUserConfirmed: true,
        userOverrideValue: normalized,
        sourceLocator: source,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, fieldId: ref.id, updated: true });
    }

    // No row yet — create one.
    const projectId = prop.projectId || "workspace-default";
    const newRef = db.collection("workspace_extracted_fields").doc();
    await newRef.set({
      propertyId,
      projectId,
      documentId: "",
      fieldGroup: group,
      fieldName: name,
      rawValue: stringValue,
      normalizedValue: normalized,
      confidenceScore: 1.0,
      extractionMethod: source,
      sourceLocator: source,
      isUserConfirmed: true,
      isUserOverridden: true,
      userOverrideValue: normalized,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, fieldId: newRef.id, updated: false });
  } catch (err: any) {
    console.error("[deal-coach/save-field] error:", err?.message);
    return NextResponse.json({ error: err?.message || "Save failed" }, { status: 500 });
  }
}
