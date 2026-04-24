import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const db = () => getAdminDb();

/**
 * Public Property Teaser API - no auth required.
 * Returns limited property data for the teaser/conversion page:
 * name, location, hero image, score, key metrics, executive summary, signals.
 * Does NOT return full extracted fields, documents, or notes.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

    // Fetch the property document
    const propDoc = await db().collection("workspace_properties").doc(propertyId).get();
    if (!propDoc.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const prop = propDoc.data()!;

    // Fetch extracted fields (limited subset for teaser)
    const fieldsSnap = await db()
      .collection("workspace_properties")
      .doc(propertyId)
      .collection("extracted_fields")
      .get();

    const allFields = fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Only return fields from specific groups needed for teaser display
    const teaserGroups = new Set([
      "property_basics",
      "pricing_deal_terms",
      "expenses",
      "signals",
      "returns",
      "debt_assumptions",
    ]);
    const teaserFields = allFields.filter((f: any) => teaserGroups.has(f.fieldGroup));

    // Build the teaser response
    const teaser = {
      id: propDoc.id,
      propertyName: prop.propertyName || "Untitled Property",
      heroImageUrl: prop.heroImageUrl || null,
      analysisType: prop.analysisType || "retail",
      brief: prop.brief || null,
      overallScore: prop.overallScore || null,
      scoreBreakdown: prop.scoreBreakdown || null,
      createdAt: prop.createdAt?._seconds ? new Date(prop.createdAt._seconds * 1000).toISOString() : null,
      // Limited fields for metrics display
      fields: teaserFields,
      // Counts to show what they're missing
      totalFieldCount: allFields.length,
    };

    return NextResponse.json(teaser, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err: any) {
    console.error("[Public Property API] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
