"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DealQuickScreen, {
  buildInput as buildQuickScreenInput,
  type StandardizedBaseline,
} from "@/components/workspace/DealQuickScreen";
import OmReversePricing from "@/components/workspace/OmReversePricing";
import RentRollDetailAnalysis from "@/components/workspace/RentRollDetailAnalysis";
import FinancialsSummary from "@/components/workspace/FinancialsSummary";
import SectionHeader from "@/components/workspace/SectionHeader";
import { runQuickScreen } from "@/lib/analysis/quick-screen";
import { generateUnderwritingXLSX, generateBriefDownload } from "@/lib/workspace/generate-files";
import { DEFAULT_UNDERWRITING } from "@/lib/types/workspace";
import { DOC_CATEGORY_LABELS } from "@/lib/workspace/types";
import type {
  Property as InternalProperty,
  ExtractedField as InternalExtractedField,
  DocCategory,
} from "@/lib/workspace/types";

/**
 * PublicDealAnalysis
 *
 * The full "<Asset> Model / Deal Analysis" block from the logged-in
 * workspace, rendered on the public emailed landing page (/p/[id]).
 *
 * It reuses the exact same four components the Pro property page uses, so a
 * recipient who never signs in still sees the same numbers the sender sees:
 *
 *   Deal Quick Screen  - scoring, back-of-napkin scenarios, ways it works/dies
 *   Offer Scenarios    - OM reverse pricing / bid range solve
 *   Rent Roll          - tenant-level lease diagnostics (hidden for land)
 *   Financials         - pro forma summary
 *
 * Differences from the workspace version, all deliberate:
 *   - No Deal Inputs drawer, no field editing, no re-upload. The recipient
 *     is a reader, not an operator, and none of those paths would have an
 *     auth context anyway.
 *   - workspaceId is nulled on the property we hand down so
 *     useUnderwritingDefaults skips its Firestore read and falls back to
 *     DEFAULT_UNDERWRITING. Public visitors have no auth context, and this
 *     also keeps the math identical across every shared deal.
 *   - Source documents download through /api/p/[propertyId]/download, which
 *     verifies the doc belongs to this property before streaming bytes.
 */

const C = {
  primary: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  ghost: "rgba(0,0,0,0.06)",
  border: "#E2E8F0",
  radius: 12,
};

export interface PublicDocument {
  id: string;
  originalFilename: string;
  docCategory?: string;
  fileExt?: string;
  fileSizeBytes?: number;
  hasFile: boolean;
}

export interface PublicDealAnalysisProps {
  propertyId: string;
  property: any;
  fields: any[];
  brief: string;
  documents: PublicDocument[];
}

type ProTab = "quick-screen" | "om-reverse-pricing" | "rent-roll" | "financials";

function assetLabel(wsType: string): string {
  const t = (wsType || "").toLowerCase();
  if (t === "multifamily") return "Multifamily";
  if (t === "retail") return "Retail";
  if (t === "industrial") return "Industrial";
  if (t === "office") return "Office";
  if (t === "land") return "Land";
  return "Asset";
}

function fmtBytes(n?: number): string {
  if (!n || !Number.isFinite(n)) return "";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function PublicDealAnalysis({
  propertyId, property, fields, brief, documents,
}: PublicDealAnalysisProps) {
  const wsType: string = (property?.analysisType as string) || "retail";

  // The analysis components expect the internal Property / ExtractedField
  // shapes. The server page hands down the raw Firestore rows, which already
  // match at runtime. Nulling workspaceId is what keeps the underwriting
  // baseline on DEFAULT_UNDERWRITING (see header comment).
  const internalProperty = useMemo<InternalProperty>(
    () => ({ ...(property as InternalProperty), id: propertyId, workspaceId: undefined }),
    [property, propertyId],
  );
  const internalFields = useMemo<InternalExtractedField[]>(
    () => (fields || []) as InternalExtractedField[],
    [fields],
  );

  const g = useCallback((group: string, name: string): any => {
    const f = internalFields.find(x => x.fieldGroup === group && x.fieldName === name);
    if (!f) return null;
    return f.isUserOverridden ? f.userOverrideValue : (f.normalizedValue ?? f.rawValue);
  }, [internalFields]);

  const omPurchasePrice = Number(g("pricing_deal_terms", "asking_price")) || null;
  const hasPricing = !!omPurchasePrice;

  const tenantRows = useMemo(() => {
    return internalFields
      .filter(f => f.fieldGroup === "rent_roll" && /^tenant_\d+_name$/.test(f.fieldName))
      .map(f => {
        const num = f.fieldName.match(/^tenant_(\d+)_name$/)?.[1];
        if (!num) return null;
        return {
          name: String(f.isUserOverridden ? f.userOverrideValue : (f.normalizedValue ?? f.rawValue) ?? ""),
          sf: g("rent_roll", `tenant_${num}_sf`),
          rent: g("rent_roll", `tenant_${num}_rent`),
          type: g("rent_roll", `tenant_${num}_type`),
          end: g("rent_roll", `tenant_${num}_lease_end`),
          status: g("rent_roll", `tenant_${num}_status`),
        };
      })
      .filter((t): t is NonNullable<typeof t> => !!t && !!t.name);
  }, [internalFields, g]);

  // Which tabs earn a slot. A tab with nothing behind it is suppressed
  // rather than shown as an empty "waiting on inputs" panel - the recipient
  // has no way to supply those inputs.
  const tabs = useMemo(() => {
    const defs: { id: ProTab; label: string; short: string; visible: boolean }[] = [
      { id: "quick-screen", label: "Deal Quick Screen", short: "Screen", visible: hasPricing },
      { id: "om-reverse-pricing", label: "Offer Scenarios", short: "Offer", visible: hasPricing },
      { id: "rent-roll", label: "Rent Roll", short: "Rent", visible: wsType !== "land" && tenantRows.length > 0 },
      { id: "financials", label: "Financials", short: "Financials", visible: true },
    ];
    return defs.filter(d => d.visible);
  }, [hasPricing, wsType, tenantRows.length]);

  // URL-backed so a link into ?tab=om-reverse-pricing lands on that tab.
  // history.replaceState rather than the router: this page is public and
  // static, and a router push would kick off a needless RSC round trip.
  const [activeTab, setActiveTab] = useState<ProTab>("quick-screen");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab") as ProTab | null;
    if (t && tabs.some(x => x.id === t)) setActiveTab(t);
    else if (tabs.length && !tabs.some(x => x.id === "quick-screen")) setActiveTab(tabs[0].id);
    // Run once against the initial tab set; later tab-set changes are
    // handled by the fallback effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the active tab isn't in the visible set (e.g. a land deal), fall back.
  useEffect(() => {
    if (tabs.length && !tabs.some(t => t.id === activeTab)) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  const selectTab = useCallback((next: ProTab) => {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, []);

  /* ── Downloads ─────────────────────────────────────────
     Both the Workbook and the Brief are generated in the browser from the
     same generators the workspace uses, so the recipient's copy is byte-for
     byte the same artifact the sender would have downloaded. Nothing is
     fetched from a protected endpoint. */
  const quickScreenReport = useMemo(() => {
    if (!internalProperty || !internalFields.length) return null;
    const baseline: StandardizedBaseline = {
      ltvPct: DEFAULT_UNDERWRITING.ltv,
      interestRatePct: DEFAULT_UNDERWRITING.interestRate,
      amortYears: DEFAULT_UNDERWRITING.amortYears,
      holdYears: DEFAULT_UNDERWRITING.holdYears,
      targetLeveredIrrPct: DEFAULT_UNDERWRITING.targetLeveredIrr,
    };
    const input = buildQuickScreenInput(internalProperty, internalFields, baseline);
    if (!input) return null;
    try {
      return runQuickScreen(input);
    } catch {
      return null;
    }
  }, [internalProperty, internalFields]);

  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  const downloadWorkbook = useCallback(async () => {
    setDlError(null);
    setXlsxBusy(true);
    try {
      await generateUnderwritingXLSX(
        property?.propertyName || "Property",
        internalFields,
        wsType as any,
      );
    } catch (e: any) {
      setDlError(`Workbook failed: ${e?.message || "unknown error"}`);
    } finally {
      setXlsxBusy(false);
    }
  }, [property?.propertyName, internalFields, wsType]);

  const downloadBrief = useCallback(() => {
    setDlError(null);
    try {
      generateBriefDownload(
        property?.propertyName || "Property",
        brief || "",
        internalFields,
        wsType as any,
        { quickScreen: quickScreenReport, tenants: tenantRows },
      );
    } catch (e: any) {
      setDlError(`Brief failed: ${e?.message || "unknown error"}`);
    }
  }, [property?.propertyName, brief, internalFields, wsType, quickScreenReport, tenantRows]);

  const sourceDocs = documents.filter(d => d.hasFile);

  if (!tabs.length) return null;

  return (
    <>
      {/* Responsive + print rules. Scoped with .pda- so nothing here can
          reach the marketing sections above. */}
      <style>{`
        .pda-tab-mobile { display: none; }
        @media (max-width: 640px) {
          .pda-panel { padding: 14px 12px 16px !important; }
          .pda-tabs { padding: 6px 8px 0 !important; overflow-x: auto; }
          .pda-tab { padding: 9px 12px 10px !important; font-size: 11px !important; white-space: nowrap; }
          .pda-tab-desktop { display: none; }
          .pda-tab-mobile { display: inline; }
          .pda-panel table { font-size: 11px !important; }
          .pda-panel .pda-scroll { overflow-x: auto; }
        }
        @media print {
          .pda-tabs, .pda-downloads { display: none !important; }
        }
      `}</style>

      <SectionHeader
        eyebrow={`${assetLabel(wsType)} Model`}
        title="Deal Analysis"
        subtitle="The same underwriting the sender sees inside DealSignals."
        topGap={16}
        bottomGap={14}
      />

      <div style={{
        marginBottom: 24,
        background: "#FFFFFF",
        border: `1px solid ${C.ghost}`,
        borderRadius: C.radius,
        boxShadow: "0 2px 10px rgba(15,23,43,0.05)",
        overflow: "hidden",
      }}>
        {/* Tab strip - file-folder style, matching the workspace. The active
            tab's -1px bottom margin lets its edge overlap the strip border so
            it reads as flowing into the panel below. */}
        <div className="pda-tabs" style={{
          display: "flex",
          alignItems: "flex-end",
          background: "#F9FAFB",
          borderBottom: `1px solid ${C.ghost}`,
          padding: "8px 12px 0",
          gap: 2,
        }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                className="pda-tab"
                onClick={() => selectTab(tab.id)}
                style={{
                  position: "relative",
                  padding: "10px 18px 11px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  background: isActive ? "#FFFFFF" : "transparent",
                  color: isActive ? C.onSurface : C.secondary,
                  border: `1px solid ${isActive ? C.ghost : "transparent"}`,
                  borderBottom: isActive ? "1px solid #FFFFFF" : "1px solid transparent",
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(15,23,43,0.04)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {isActive && (
                  <span aria-hidden style={{
                    position: "absolute",
                    top: -1, left: -1, right: -1,
                    height: 2,
                    background: C.primary,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }} />
                )}
                <span className="pda-tab-desktop">{tab.label}</span>
                <span className="pda-tab-mobile">{tab.short}</span>
              </button>
            );
          })}
        </div>

        {/* Content panel - same white surface as the active tab. */}
        <div className="pda-panel pda-scroll" style={{ padding: "20px 20px 22px" }}>
          {activeTab === "quick-screen" && (
            <DealQuickScreen property={internalProperty} fields={internalFields} />
          )}

          {activeTab === "om-reverse-pricing" && (
            <OmReversePricing property={internalProperty} fields={internalFields} />
          )}

          {activeTab === "rent-roll" && (
            <RentRollDetailAnalysis
              property={internalProperty}
              fields={internalFields}
              wsType={wsType}
            />
          )}

          {activeTab === "financials" && (
            <FinancialsSummary
              property={internalProperty}
              fields={internalFields}
              wsType={wsType}
              omPurchasePrice={omPurchasePrice}
            />
          )}
        </div>
      </div>

      {/* ── Downloads ─────────────────────────────────── */}
      <div className="pda-downloads" style={{
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: C.radius,
        padding: "18px 20px 20px",
        marginBottom: 24,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.secondary,
          textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12,
        }}>
          Downloads
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            onClick={downloadWorkbook}
            disabled={xlsxBusy}
            style={{
              ...dlBtn,
              opacity: xlsxBusy ? 0.6 : 1,
              cursor: xlsxBusy ? "wait" : "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
            </svg>
            {xlsxBusy ? "Building workbook..." : "Underwriting Workbook (XLSX)"}
          </button>

          <button onClick={downloadBrief} style={dlBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            Deal Brief (DOC)
          </button>
        </div>

        {dlError && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#B91C1C" }}>{dlError}</div>
        )}

        {sourceDocs.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.secondary,
              textTransform: "uppercase", letterSpacing: 0.6,
              margin: "20px 0 10px", paddingTop: 16, borderTop: `1px solid ${C.border}`,
            }}>
              Source Documents
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sourceDocs.map(doc => (
                // Plain anchor with `download` so the save happens directly
                // off the user's click gesture - a fetch-then-blob round trip
                // gets popup-blocked in Safari.
                <a
                  key={doc.id}
                  href={`/api/p/${propertyId}/download?doc=${encodeURIComponent(doc.id)}`}
                  download={doc.originalFilename || true}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    textDecoration: "none",
                    color: C.onSurface,
                    background: "#FCFCFD",
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                    padding: "3px 6px", borderRadius: 4,
                    background: "#F1F5F9", color: C.secondary,
                    textTransform: "uppercase", minWidth: 34, textAlign: "center",
                  }}>
                    {(doc.fileExt || "file").replace(".", "")}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>
                    {doc.originalFilename}
                  </span>
                  <span style={{ fontSize: 11, color: C.secondary, whiteSpace: "nowrap" }}>
                    {[
                      doc.docCategory ? (DOC_CATEGORY_LABELS[doc.docCategory as DocCategory] || doc.docCategory) : "",
                      fmtBytes(doc.fileSizeBytes),
                    ].filter(Boolean).join(" · ")}
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const dlBtn = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#F9FAFB",
  color: "#111827",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
} as const;
