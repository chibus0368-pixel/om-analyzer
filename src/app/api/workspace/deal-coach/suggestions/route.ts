import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/deal-coach/suggestions?propertyId=<id>
 *
 * Returns 4-6 starter questions tailored to the specific deal:
 * asset type AND deal specifics (cap rate, occupancy, tenant count,
 * score band, presence of a stated NOI, etc). Falls back to the
 * static asset-type list if context isn't loaded yet.
 *
 * Cheap, no LLM call - rule-based templating from extracted fields.
 * Re-fetched whenever the chat panel opens so suggestions reflect
 * the deal's current state.
 */
export async function GET(req: NextRequest) {
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

  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  const db = getAdminDb();
  const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!propSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const prop = propSnap.data() as any;
  if (prop.userId && prop.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fieldsSnap = await db
    .collection("workspace_extracted_fields")
    .where("propertyId", "==", propertyId)
    .get();
  const fields: Record<string, any> = {};
  fieldsSnap.docs.forEach((d) => {
    const data = d.data() as any;
    fields[`${data.fieldGroup}.${data.fieldName}`] = data.isUserOverridden
      ? data.userOverrideValue
      : (data.normalizedValue ?? data.rawValue);
  });

  const at = String(prop.analysisType || "").toLowerCase();
  const askPrice = Number(prop.cardAskingPrice || fields["pricing_deal_terms.asking_price"] || 0);
  const cap = Number(prop.cardCapRate || fields["pricing_deal_terms.cap_rate_om"] || 0);
  const occ = Number(prop.occupancyPct || fields["property_basics.occupancy_pct"] || 0);
  const noi = Number(prop.cardNoi || fields["expenses.noi_om"] || 0);
  const sf = Number(prop.cardBuildingSf || prop.buildingSf || fields["property_basics.building_sf"] || 0);
  const tenantCount = (() => {
    let c = 0;
    for (let i = 1; i <= 50; i++) if (fields[`rent_roll.tenant_${i}_name`]) c++;
    return c;
  })();
  const score = Number(prop.scoreTotal || 0);
  const band = String(prop.scoreBand || "").toLowerCase();
  const hasMarket = !!(prop.city || prop.market);
  const cityLabel = prop.city || prop.market || "this submarket";

  const out: string[] = [];

  // ── Asset-type-specific openers ──
  if (at === "land") {
    out.push("What are the top 3 highest-and-best uses for this site?");
    out.push("What's a defensible bid range based on $/acre comps?");
    if (askPrice > 0) out.push(`Walk me through an entitlement strategy assuming I close at $${(askPrice / 1_000_000).toFixed(2)}M.`);
    out.push("What surrounding business mix would justify retail here?");
  } else if (at === "multifamily") {
    if (tenantCount > 0 || occ > 0) out.push(`How does ${occ ? `${occ.toFixed(0)}% occupancy` : "this rent roll"} stack up against ${cityLabel} comps?`);
    out.push("What's the loss-to-lease here and how do I close it?");
    if (cap > 0) out.push(`Is a ${cap.toFixed(2)}% cap aggressive for ${cityLabel} multifamily?`);
    out.push("Draft a bid that hits a 7% yield-on-cost.");
  } else if (at === "industrial") {
    if (tenantCount > 0) out.push("Which tenants are flight risks and why?");
    if (sf > 0) out.push(`Is the price/SF reasonable for ${sf.toLocaleString()} SF in ${cityLabel}?`);
    out.push("Walk me through a value-add scenario at 10% below asking.");
    out.push("What would a logistics-focused buyer pay vs an owner-user?");
  } else if (at === "office") {
    if (occ > 0) out.push(`How does ${occ.toFixed(0)}% occupancy compare to ${cityLabel} office trends?`);
    out.push("What's the path to stabilization here?");
    if (tenantCount > 0) out.push("Which tenants are flight risks and why?");
    out.push("Run a what-if at 75% occupancy and 1pt cap expansion.");
  } else {
    // retail + default
    if (tenantCount > 0) out.push(`Summarize the ${tenantCount}-tenant rent roll risk in 4 bullets.`);
    if (cap > 0 && hasMarket) out.push(`Is a ${cap.toFixed(2)}% cap aggressive for ${cityLabel} retail?`);
    if (askPrice > 0) out.push(`Draft an LOI 8% below the $${(askPrice / 1_000_000).toFixed(2)}M ask with 60-day inspection.`);
    out.push("What 3 things would most worry an institutional buyer here?");
  }

  // ── Deal-specific add-ons (regardless of asset type) ──
  if (band && band !== "strong_buy" && band !== "buy") {
    out.push(`The score is ${score} (${band.replace("_", " ")}). What would push it into Buy territory?`);
  }
  if (askPrice > 0 && cap > 0 && noi > 0) {
    out.push(`At what price would the deal pencil to a 1.30x DSCR with 65% LTV?`);
  }
  if (tenantCount > 0) {
    out.push("Which lease expirations create the biggest mark-to-market risk?");
  }

  // Always-useful peer comparison if there are likely peers in the workspace
  out.push("How does this compare to the rest of my dealboard?");

  // Dedup + cap at 6
  const seen = new Set<string>();
  const uniq = out.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  }).slice(0, 6);

  return NextResponse.json({ suggestions: uniq, generatedAt: new Date().toISOString() });
}
