import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase-admin";
import { scoreBandLabel } from "@/lib/workspace/score-band-labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public single-deal page.
 *
 * URL: /p/[propertyId]
 *
 * Used by emailed property links so the recipient lands on a clean
 * marketing-style page with just THIS deal's info, no workspace shell,
 * no auto-anon-signin, no signup wall. Strong CTA at the bottom
 * routes to the marketing homepage so they can learn what DealSignals
 * does before deciding to sign up.
 *
 * What's exposed (curated):
 *   - Property name, address, hero image, asset type, score band
 *   - Key card metrics (price, cap, NOI, SF, occupancy)
 *   - First-pass investment brief if present
 *   - "Powered by DealSignals" footer + homepage CTA
 *
 * What's NOT exposed:
 *   - Source documents (no PDF download links)
 *   - Full rent roll (just summary tenant count)
 *   - Underwriting workbook generator
 *   - Anything that would require a session
 */

interface Props {
  params: Promise<{ propertyId: string }>;
}

function fmtMoney(v: any): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString()}`;
  return `$${Math.round(n)}`;
}
function fmtPct(v: any): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2)}%`;
}
function fmtSF(v: any): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.round(n).toLocaleString()} SF`;
}

const C = {
  ink: "#0F172A",
  surface: "#FFFFFF",
  pageBg: "#F7F8FC",
  border: "#E2E8F0",
  muted: "#64748B",
  lime: "#4D7C0F",
  limeBg: "rgba(132,204,22,0.08)",
  limeBorder: "rgba(132,204,22,0.35)",
};

export default async function PublicPropertyPage({ params }: Props) {
  const { propertyId } = await params;
  if (!propertyId) notFound();

  const db = getAdminDb();
  const snap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!snap.exists) notFound();
  const prop = snap.data() as any;

  // Pull a curated subset of extracted_fields - we only want the
  // fields that drive the public display, not every parsed row.
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

  // Brief (the parsed investment thesis) - look it up from notes.
  let briefBody = "";
  try {
    const notesSnap = await db
      .collection("workspace_notes")
      .where("propertyId", "==", propertyId)
      .get();
    const briefDoc = notesSnap.docs.find((d) => {
      const data = d.data() as any;
      return data?.noteType === "investment_thesis" || data?.isPinned;
    });
    if (briefDoc) {
      const c = (briefDoc.data() as any)?.content;
      briefBody = typeof c === "string" ? c.slice(0, 3000) : "";
    }
  } catch { /* non-fatal */ }

  const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
  const verdict = scoreBandLabel(prop.scoreBand);
  const score = Number(prop.scoreTotal) || null;
  const verdictColor =
    prop.scoreBand === "strong_buy" ? "#059669" :
    prop.scoreBand === "buy" ? "#2563EB" :
    prop.scoreBand === "hold" ? "#D97706" :
    prop.scoreBand === "pass" ? "#EA580C" :
    prop.scoreBand === "strong_reject" ? "#DC2626" :
    "#6B7280";

  // Card metric resolution - prefer top-level card fields, fall back
  // to extracted_fields, fall back to nothing.
  const askPrice = fmtMoney(prop.cardAskingPrice ?? fields["pricing_deal_terms.asking_price"]);
  const capRate = fmtPct(prop.cardCapRate ?? fields["pricing_deal_terms.cap_rate_om"]);
  const noi = fmtMoney(prop.cardNoi ?? fields["expenses.noi_om"]);
  const sf = fmtSF(prop.cardBuildingSf ?? prop.buildingSf ?? fields["property_basics.building_sf"]);
  const occ = fmtPct(prop.occupancyPct ?? fields["property_basics.occupancy_pct"]);
  const yearBuilt = fields["property_basics.year_built"] || prop.yearBuilt || null;

  const metrics: { label: string; value: string }[] = [];
  if (askPrice) metrics.push({ label: "Asking Price", value: askPrice });
  if (capRate) metrics.push({ label: "Cap Rate", value: capRate });
  if (noi) metrics.push({ label: "NOI", value: noi });
  if (sf) metrics.push({ label: "Building SF", value: sf });
  if (occ) metrics.push({ label: "Occupancy", value: occ });
  if (yearBuilt) metrics.push({ label: "Year Built", value: String(yearBuilt) });

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: "'Inter', system-ui, sans-serif", color: C.ink }}>
      {/* ── Top nav: logo + Learn more link ── */}
      <header style={{
        background: C.ink, padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 30, width: "auto" }} />
        </a>
        <a
          href="/"
          style={{
            padding: "6px 14px", borderRadius: 999,
            background: "rgba(132,204,22,0.18)",
            border: "1px solid rgba(132,204,22,0.4)",
            color: "#FFFFFF",
            textDecoration: "none", fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
          }}
        >
          What is DealSignals? →
        </a>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        {/* Hero image */}
        {prop.heroImageUrl && (
          <div style={{
            height: 220, borderRadius: 14, overflow: "hidden", marginBottom: 18,
            background: `url(${prop.heroImageUrl}) center/cover no-repeat`,
            border: `1px solid ${C.border}`,
          }} />
        )}

        {/* Verdict pill + property name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          {verdict && (
            <span style={{
              padding: "5px 12px", borderRadius: 999,
              background: verdictColor, color: "#FFFFFF",
              fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase",
            }}>
              {verdict}{score ? ` · ${score}/100` : ""}
            </span>
          )}
          {prop.analysisType && (
            <span style={{
              padding: "5px 12px", borderRadius: 999,
              background: C.limeBg, color: C.lime,
              border: `1px solid ${C.limeBorder}`,
              fontSize: 11, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase",
            }}>
              {prop.analysisType}
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          {prop.propertyName || "Property"}
        </h1>
        <p style={{ fontSize: 14, color: C.muted, margin: "0 0 24px" }}>
          {addr || ""}
        </p>

        {/* Metric grid */}
        {metrics.length > 0 && (
          <section style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 24,
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16,
            }}>
              {metrics.map((m) => (
                <div key={m.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, fontFamily: "'Inter', monospace" }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Investment brief */}
        {briefBody && (
          <section style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
              First-Pass Investment Brief
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>
              {briefBody}
            </div>
          </section>
        )}

        {/* CTA section - the whole point of this page */}
        <section style={{
          background: "linear-gradient(135deg, #0F172A, #1E293B)",
          color: "#FFFFFF",
          borderRadius: 16,
          padding: "28px 24px",
          textAlign: "center",
          marginTop: 32,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
            Powered by DealSignals
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            See how this analysis was generated
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "0 auto 18px", maxWidth: 460, lineHeight: 1.55 }}>
            DealSignals turns commercial real estate offering memorandums into structured underwriting in under a minute. Cap rate analysis, score, brief, downloadable workbook — all from a PDF.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 26px",
              background: "#84CC16",
              color: "#0F172A",
              textDecoration: "none",
              borderRadius: 999,
              fontWeight: 800, fontSize: 14,
              letterSpacing: 0.2,
              boxShadow: "0 6px 18px rgba(132,204,22,0.35)",
            }}
          >
            Visit DealSignals.app →
          </a>
        </section>
      </main>

      <footer style={{
        textAlign: "center", padding: "24px", color: C.muted, fontSize: 11, borderTop: `1px solid ${C.border}`, background: C.surface,
      }}>
        Shared via DealSignals — analysis for informational purposes only.
      </footer>
    </div>
  );
}
