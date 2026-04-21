"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  getProperty, getProjectDocuments, getPropertyExtractedFields,
  getProjectOutputs, getPropertyNotes, createDocument, logActivity, updateProperty, deleteProperty,
  getWorkspaceProperties,
} from "@/lib/workspace/firestore";
import type { Property, ProjectDocument, ExtractedField, ProjectOutput, Note, DocCategory } from "@/lib/workspace/types";
import { DOC_CATEGORY_LABELS, ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { AnalysisTypeIcon } from "@/lib/workspace/AnalysisTypeIcon";
import { generateUnderwritingXLSX, generateBriefDownload, generateStrategyLensXLSX } from "@/lib/workspace/generate-files";
import { renderPropertyEmailHTML } from "@/lib/workspace/email-property-html";
import { extractTextFromFiles } from "@/lib/workspace/file-reader";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";
import Link from "next/link";

import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import PropertyHeroImage from "@/components/workspace/PropertyHeroImage";
import DealQuickScreen from "@/components/workspace/DealQuickScreen";
import OmReversePricing from "@/components/workspace/OmReversePricing";
import DealVerdictBox from "@/components/workspace/DealVerdictBox";
import RentRollDetailAnalysis from "@/components/workspace/RentRollDetailAnalysis";

/* ── Design tokens ─────────────────────────────────────── */
const C = {
  primary: "#84CC16",
  primaryText: "#4D7C0F",
  primaryContainer: "#84CC16",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  tertiary: "#785800",
  gold: "#C49A3C",
  bg: "#F7F8FA",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
};

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

/* ── File extension icon helper ─────────────────────── */
function fileIcon(ext: string) {
  if (ext === "pdf") return { bg: "#F0FDF4", color: "#15803D", label: "PDF" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "#D1FAE5", color: "#059669", label: "XLS" };
  if (["doc", "docx"].includes(ext)) return { bg: "#DBEAFE", color: "#2563EB", label: "DOC" };
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return { bg: "#FEF3C7", color: "#D97706", label: "IMG" };
  return { bg: C.surfLow, color: C.secondary, label: ext.toUpperCase() };
}

/* ── Helpers ────────────────────────────────────────────── */
function guessCategory(filename: string): DocCategory {
  const lower = filename.toLowerCase();
  if (lower.includes("om") || lower.includes("offering") || lower.includes("memorandum")) return "om";
  if (lower.includes("flyer") || lower.includes("brochure")) return "flyer";
  if (lower.includes("rent") && lower.includes("roll")) return "rent_roll";
  if (lower.includes("t12") || lower.includes("t-12") || lower.includes("trailing")) return "t12";
  if (lower.includes("underwriting") || lower.includes("proforma")) return "underwriting";
  if (lower.includes("lease")) return "lease";
  if (/\.(png|jpg|jpeg|webp)$/i.test(lower)) return "image";
  return "misc";
}

function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmt$(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(val: any): string { return val ? `${Number(val).toFixed(2)}%` : "--"; }
function fmtX(val: any): string { return val ? `${Number(val).toFixed(2)}x` : "--"; }
function fmtSF(val: any): string { return val ? `${Math.round(Number(val)).toLocaleString()} SF` : "--"; }

/* ── Source type for field labels ────────────────────────── */
type SourceType = "from_om" | "calculated" | "needs_review" | "user_confirmed" | "user_adjusted";

function SourceTag({ type }: { type: SourceType }) {
  const config: Record<SourceType, { label: string; bg: string; color: string }> = {
    from_om: { label: "From OM", bg: "#EEF2FF", color: "#4338CA" },
    calculated: { label: "Calculated", bg: "#F0FDF4", color: "#15803D" },
    needs_review: { label: "Needs Review", bg: "#FEF3C7", color: "#92400E" },
    user_confirmed: { label: "User Confirmed", bg: "#D1FAE5", color: "#065F46" },
    user_adjusted: { label: "User Adjusted", bg: "#DBEAFE", color: "#1E40AF" },
  };
  const c = config[type];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
      padding: "2px 7px", borderRadius: 4, background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

/* ── Property image card ─────────────────────────────── */
// Thin wrapper around the shared PropertyHeroImage component so the detail
// page uses the same hero → Places → Street View → satellite → placeholder
// cascade as the dashboard card. The shared component also persists Places
// photos back to Firestore via `persistPropertyId`.
function PropertyImage({ heroImageUrl, location, address, propertyName, propertyId }: {
  heroImageUrl?: string; location: string; address: string; propertyName: string; propertyId?: string;
}) {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, overflow: "hidden", borderRadius: C.radius }}>
      <PropertyHeroImage
        heroImageUrl={heroImageUrl}
        address={address}
        location={location}
        propertyName={propertyName}
        persistPropertyId={propertyId}
        style={{ minHeight: 200 }}
      />
    </div>
  );
}

/* ── Metric tooltip ──────────────────────────────────── */
function MetricTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    }
    setShow(true);
  };

  return (
    <span ref={iconRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "help" }}>
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {show && pos && (
        <span style={{
          position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)",
          background: "#1E293B", color: "#F1F5F9", fontSize: 11, lineHeight: 1.45, padding: "8px 11px",
          borderRadius: 6, whiteSpace: "normal", width: 220, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none",
        }}>
          {text}
          <span style={{ position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1E293B" }} />
        </span>
      )}
    </span>
  );
}

/* ── Asset type pill (read-only) ─────────────────────────
   Was a dropdown that let users override the auto-classified asset
   type. Removed because the override only changed the score — the
   rest of the analysis (signals, brief, benchmarks) stayed the same,
   which made the feature feel broken ("I changed the lens but only
   the number moved"). Until we wire a full re-analysis through the
   selected type's model, we lock to auto-detect and render the
   pill as a static label.

   The props stay the same so callers don't need to change; the
   onChanged/propertyId/userId props are intentionally unused. */
function AssetTypePill({
  currentType,
}: {
  currentType: string;
  propertyId: string;
  onChanged: (newType: string) => Promise<void> | void;
  userId: string;
}) {
  const current = (currentType || "retail") as keyof typeof ANALYSIS_TYPE_LABELS;
  const color = ANALYSIS_TYPE_COLORS[current] || "#6B7280";
  const label = ANALYSIS_TYPE_LABELS[current] || "Retail";
  return (
    <span
      title="Auto-detected asset type"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 6,
        background: `${color}15`, color, border: `1px solid ${color}40`,
        fontSize: 11, fontWeight: 600, fontFamily: "inherit", lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  );
}

/* ── Model Lens Banner ───────────────────────────────────
   Primary affordance that tells the user which scoring
   model produced this property's score. Re-uses the pill's
   re-score logic via a "Change model" dropdown. Rendered
   full-width at the top of the property content area so the
   lens is unmissable on mixed-type DealBoards. */
function ModelLensBanner({
  currentType,
}: {
  currentType: string;
  propertyId: string;
  onChanged: (newType: string) => Promise<void> | void;
  userId: string;
}) {
  // Dropdown removed - was a "Change model" affordance that re-scored but
  // did not re-run signals, benchmarks, or the brief against the selected
  // type. That made the override feel broken. Banner now just surfaces
  // which model produced the score.
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = (currentType || "retail") as keyof typeof ANALYSIS_TYPE_LABELS;
  const label = ANALYSIS_TYPE_LABELS[current] || "Retail";

  return (
    <div ref={wrapRef} className="pd-model-lens-banner" style={{
      position: "relative", display: "flex", alignItems: "center",
      gap: 10, padding: "9px 16px", marginBottom: 20,
      background: "#F8FAFC",
      border: "1px solid #E2E8F0",
      borderRadius: 10,
      fontFamily: "inherit",
    }}>
      <AnalysisTypeIcon type={current} size={16} color="#64748B" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748B" }}>
          Scored with
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748B" }}>
          Model (auto-detected)
        </span>
      </div>
    </div>
  );
}

/* ── Email This Property button + modal ────────────────── */
/*
   Lets a signed-in user email the formatted property page + XLSX/DOC
   attachments to a recipient. Body is HTML rendered via
   renderPropertyEmailHTML; attachments are generated client-side using
   the same generators behind the Workbook/Brief download buttons.
   Server route: /api/workspace/email-property  */
function EmailPropertyButton({
  property, fields, brief, wsType, scoreTotal, scoreBand, user,
}: {
  property: any;
  fields: any[];
  brief: string;
  wsType: any;
  scoreTotal: number | null;
  scoreBand: string | null;
  user: any;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Pre-fill subject when the modal opens
  useEffect(() => {
    if (open) {
      const name = property?.propertyName || "Property";
      setSubject(`${name} - Deal Signals`);
      setError(null);
      setSuccess(false);
    }
  }, [open, property?.propertyName]);

  const senderName: string = user?.displayName || "";
  const senderEmail: string = user?.email || "";

  async function handleSend() {
    setError(null);
    setSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject can't be empty.");
      return;
    }
    setSending(true);
    try {
      // 1. Generate attachments client-side (reuses existing ExcelJS CDN + DOC builder)
      const xlsxResult = await generateUnderwritingXLSX(property.propertyName, fields, wsType, { returnBlob: true });
      const briefResult = generateBriefDownload(property.propertyName, brief, fields, wsType, { returnBlob: true });

      if (!xlsxResult || !briefResult) {
        throw new Error("Failed to build attachments");
      }

      // 2. Render HTML body
      const origin = (typeof window !== "undefined" && window.location?.origin) || "https://dealsignals.app";
      const propertyUrl = property?.id ? `${origin}/workspace/properties/${property.id}` : undefined;
      const html = renderPropertyEmailHTML({
        propertyName: property.propertyName,
        address: property.address1,
        city: property.city,
        state: property.state,
        analysisType: wsType,
        dealScore: scoreTotal ?? undefined,
        grade: scoreBand ?? undefined,
        fields,
        brief,
        senderName,
        senderEmail,
        note: note.trim(),
        heroImageUrl: property?.heroImageUrl,
        propertyUrl,
      });

      // 3. POST as multipart
      const fd = new FormData();
      fd.append("to", to.trim());
      fd.append("subject", subject.trim());
      fd.append("html", html);
      fd.append("fromName", senderName);
      fd.append("fromEmail", senderEmail);
      fd.append("note", note.trim());
      fd.append("xlsx", xlsxResult.blob, xlsxResult.filename);
      fd.append("brief", briefResult.blob, briefResult.filename);

      const res = await fetch("/api/workspace/email-property", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Send failed (${res.status})`);
      }
      setSuccess(true);
      // auto-close after a brief confirmation
      setTimeout(() => { setOpen(false); setTo(""); setNote(""); setSuccess(false); }, 1600);
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="dl-btn"
        title="Email this property (with Workbook + Brief attached)"
        style={{
          padding: "6px 14px", borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.12)", background: "#F9FAFB",
          color: "#111827", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        {/* Envelope icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
        Email
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !sending) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(6,8,15,0.55)",
            zIndex: 2147483000, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
          <div style={{
            width: "100%", maxWidth: 520, background: "#FFFFFF", borderRadius: 14,
            boxShadow: "0 10px 40px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "inherit",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Email this property</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Formatted page + Workbook + Brief attached</div>
              </div>
              <button onClick={() => !sending && setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 22, color: "#9CA3AF", cursor: sending ? "not-allowed" : "pointer", lineHeight: 1, padding: 4 }}
                aria-label="Close">×</button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Recipient</label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="colleague@company.com"
                  disabled={sending}
                  style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB",
                    borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: sending ? "#F9FAFB" : "#FFFFFF",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={sending}
                  style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB",
                    borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: sending ? "#F9FAFB" : "#FFFFFF",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  Add a note <span style={{ color: "#9CA3AF", fontWeight: 500 }}>(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Thoughts, context, or what you want them to look at..."
                  disabled={sending}
                  style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #D1D5DB",
                    borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: sending ? "#F9FAFB" : "#FFFFFF",
                    resize: "vertical", boxSizing: "border-box",
                  }}
                />
              </div>

              {senderEmail && (
                <div style={{ fontSize: 11, color: "#6B7280" }}>
                  Sent from <strong>Deal Signals</strong>. Replies will go to <strong>{senderEmail}</strong>.
                </div>
              )}

              {error && (
                <div style={{ padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: "#991B1B" }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ padding: "10px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 12, color: "#166534", fontWeight: 600 }}>
                  Email sent.
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", background: "#F9FAFB", borderTop: "1px solid #F0F2F5", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => !sending && setOpen(false)}
                disabled={sending}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB",
                  background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600,
                  cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || success}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: sending || success ? "#9CA3AF" : "#DC3545", color: "#FFFFFF",
                  fontSize: 13, fontWeight: 700, cursor: sending || success ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}>
                {sending ? "Sending..." : success ? "Sent" : "Send"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Inline price editor for metrics strip ─────────────── */
function PurchasePriceInline({ priceState }: { priceState: ReturnType<typeof usePurchasePriceOverride> }) {
  const { activePrice, omPrice, isOverridden, setPrice, reset } = priceState;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  function startEdit() {
    setInputVal(activePrice ? String(activePrice) : "");
    setEditing(true);
  }
  function commitEdit() {
    const n = Number(inputVal.replace(/[^0-9.]/g, ""));
    if (n > 0) setPrice(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.primaryText }}>$</span>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
          placeholder="e.g. 14650000"
          style={{
            fontSize: 18, fontWeight: 700, color: "#0F172A", background: "rgba(132,204,22,0.06)",
            border: "1px solid rgba(132,204,22,0.3)", borderRadius: 6, padding: "2px 8px",
            outline: "none", width: "100%", fontFamily: "'Inter', sans-serif",
            fontVariantNumeric: "tabular-nums",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div onClick={startEdit} style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: isOverridden ? "#3B82F6" : "#0F172A", fontVariantNumeric: "tabular-nums" }}>
          {fmt$(activePrice)}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>
      {isOverridden && (
        <button onClick={reset} style={{
          fontSize: 9, color: "#3B82F6", background: "none", border: "none",
          cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: 0,
          textDecoration: "underline",
        }}>reset</button>
      )}
    </div>
  );
}

/* ── Score badge (Deal Signals) ─────────────────────────── */
function DealSignalBadge({ score, band }: { score: number | null; band: string }) {
  if (!score) return null;
  const b = band.toLowerCase().replace(/_/g, " ");
  const isGreen = b === "strong buy" || b === "buy" || b === "strong_buy";
  const isYellow = b === "hold" || b === "neutral";
  const color = isGreen ? "#4D7C0F" : isYellow ? "#D97706" : "#DC2626";
  const bgColor = isGreen ? "#ECFCCB" : isYellow ? "#FEF3C7" : "#FDE8EA";
  // Use the same human-readable labels as the dealboard so "hold" and
  // "neutral" render consistently across pages. The dealboard shows "Neutral"
  // for the hold band — match that here instead of the raw "Hold" string.
  const bandLabels: Record<string, string> = {
    "strong buy": "Strong Buy",
    "buy": "Buy",
    "hold": "Neutral",
    "neutral": "Neutral",
    "pass": "Pass",
    "strong reject": "Strong Reject",
  };
  const displayBand = bandLabels[b] || band.replace(/_/g, " ");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 92, height: 92, borderRadius: "50%",
        background: `conic-gradient(${color} ${(score / 100) * 360}deg, ${C.ghost} 0deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 74, height: 74, borderRadius: "50%", background: C.surfLowest,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums",
        }}>{score}</div>
      </div>
      <span style={{
        marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 0.8, color, padding: "3px 10px", borderRadius: 4, background: bgColor,
      }}>{displayBand}</span>
    </div>
  );
}

/* ── Editable property name (inline click-to-edit) ──── */
/* ── Location Intel Map (Leaflet) ─────────────────────── */
function LocationIntelMap({ mapData }: { mapData: any }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !mapData?.center || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default || await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !mapRef.current) return;

        const map = L.map(mapRef.current, {
          center: [mapData.center.lat, mapData.center.lng],
          zoom: 14,
          zoomControl: true,
          scrollWheelZoom: false,
        });
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OSM &amp; CARTO",
          maxZoom: 19,
        }).addTo(map);

        // Property marker (large, centered)
        const propIcon = L.divIcon({
          className: "",
          html: `<div style="width:24px;height:24px;background:#4338CA;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([mapData.center.lat, mapData.center.lng], { icon: propIcon })
          .addTo(map)
          .bindPopup(`<b>Subject Property</b>`);

        // Category colors
        const catColors: Record<string, string> = {
          anchors: "#DC2626",
          restaurants: "#EA580C",
          retail: "#2563EB",
          services: "#059669",
          fitness_rec: "#7C3AED",
          education: "#CA8A04",
          automotive: "#6B7280",
          other: "#9CA3AF",
        };

        // Nearby places markers
        for (const p of (mapData.nearbyPlaces || [])) {
          if (!p.lat || !p.lng) continue;
          const color = catColors[p.category] || "#9CA3AF";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:10px;height:10px;background:${color};border:1.5px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([p.lat, p.lng], { icon })
            .addTo(map)
            .bindPopup(`<b>${p.name}</b>${p.rating ? `<br>${p.rating}★` : ""}`);
        }

        // Development markers (orange diamonds)
        for (const d of (mapData.developments || [])) {
          if (!d.lat || !d.lng) continue;
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:12px;height:12px;background:#F59E0B;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          L.marker([d.lat, d.lng], { icon })
            .addTo(map)
            .bindPopup(`<b>${d.name}</b>${d.address ? `<br>${d.address}` : ""}<br><i>Development</i>`);
        }

        // Draw 1-mile radius circle
        L.circle([mapData.center.lat, mapData.center.lng], {
          radius: 1609, // 1 mile in meters
          color: "#6366F1",
          weight: 1.5,
          opacity: 0.5,
          fillColor: "#6366F1",
          fillOpacity: 0.04,
          dashArray: "6 4",
        }).addTo(map);

        // Fit to 1-mile radius bounds
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        console.error("[LocationIntelMap] Failed to load:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapData]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

function EditablePropertyName({ name, propertyId, onSave }: { name: string; propertyId: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setValue(name); return; }
    try {
      await updateProperty(propertyId, { propertyName: trimmed } as any);
      onSave(trimmed);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
    } catch { /* continue */ }
    setEditing(false);
  }

  if (editing) {
    return (
      <input ref={inputRef} value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(name); } }}
        style={{
          fontSize: 24, fontWeight: 700, color: C.onSurface, background: C.surfLow,
          border: `1px solid ${C.ghost}`, borderRadius: 8, padding: "4px 12px",
          margin: 0, lineHeight: 1.2, width: "100%", outline: "none",
          fontFamily: "'Inter', sans-serif",
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setEditing(true)}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.onSurface, margin: 0, lineHeight: 1.3, fontFamily: "'Inter', sans-serif", letterSpacing: "-0.3px" }}>{name}</h1>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.4 }}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*  PURCHASE PRICE OVERRIDE - recalculate price-sensitive    */
/*  metrics live when user adjusts the purchase price        */
/* ══════════════════════════════════════════════════════════ */
function usePurchasePriceOverride(omPrice: number | null) {
  const [override, setOverride] = useState<number | null>(null);
  const activePrice = override ?? omPrice;
  const isOverridden = override !== null && override !== omPrice;

  const reset = useCallback(() => setOverride(null), []);
  const setPrice = useCallback((val: number | null) => setOverride(val), []);

  return { activePrice, omPrice, override, isOverridden, setPrice, reset };
}

function PurchasePriceControl({ priceState }: {
  priceState: ReturnType<typeof usePurchasePriceOverride>;
}) {
  const { activePrice, omPrice, isOverridden, setPrice, reset } = priceState;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  function startEdit() {
    setInputVal(activePrice ? String(activePrice) : "");
    setEditing(true);
  }

  function commitEdit() {
    const n = Number(inputVal.replace(/[^0-9.]/g, ""));
    if (n > 0) setPrice(n);
    setEditing(false);
  }

  return (
    <div style={{
      background: C.surfLowest, borderRadius: 10, padding: "16px 20px",
      border: `1.5px solid ${isOverridden ? "#3B82F6" : C.ghostBorder}`,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.secondary }}>
          Purchase Price
        </span>
        {isOverridden && <SourceTag type="user_adjusted" />}
      </div>

      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.primaryText }}>$</span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            style={{
              fontSize: 24, fontWeight: 800, color: C.primaryText, background: C.surfLow,
              border: `1px solid ${C.ghost}`, borderRadius: 6, padding: "2px 8px",
              outline: "none", width: "100%", fontFamily: "'Inter', sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>
      ) : (
        <div onClick={startEdit} style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontSize: 28, fontWeight: 800, color: C.primaryText,
            fontVariantNumeric: "tabular-nums", letterSpacing: -0.5,
          }}>
            {fmt$(activePrice)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
      )}

      <p style={{ fontSize: 11, color: C.secondary, margin: "6px 0 0", lineHeight: 1.4 }}>
        Adjust purchase price to see how top-line metrics change.
      </p>

      {isOverridden && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            Original OM value: {fmt$(omPrice)}
          </span>
          <button onClick={reset} style={{
            fontSize: 11, color: "#3B82F6", background: "none", border: "none",
            cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: 0,
            textDecoration: "underline",
          }}>
            Reset to OM value
          </button>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════ */
/*  MAIN PAGE COMPONENT                                      */
/* ══════════════════════════════════════════════════════════ */
export default function PropertyDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const propertyId = params.id as string;
  // Workspace-level underwriting baseline. `updatedAt` drives the
  // auto-recalc-on-stale useEffect below so we reuse the same fetch.
  const { updatedAt: defaultsUpdatedAt } = useUnderwritingDefaults(
    (activeWorkspace?.id as string | undefined) || null
  );

  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<Property | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [outputs, setOutputs] = useState<ProjectOutput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [reparseStatus, setReparseStatus] = useState("");
  const [deepResearchLoading, setDeepResearchLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState<any>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const [siblingProps, setSiblingProps] = useState<Property[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load sibling properties in workspace for sidebar navigation
  // Uses the current property's workspaceId to find true siblings,
  // falling back to activeWorkspace.id if property hasn't loaded yet.
  useEffect(() => {
    if (!user) return;
    const wsId = (property as any)?.workspaceId || activeWorkspace?.id;
    if (!wsId) return;
    getWorkspaceProperties(user.uid, wsId).then(props => {
      setSiblingProps(props);
    }).catch(() => {});
    // Use stable primitives - object refs change every render and cause infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id, (property as any)?.workspaceId]);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      console.log("[PropertyDetail] loadData start, propertyId:", propertyId);
      const p = await getProperty(propertyId);
      console.log("[PropertyDetail] getProperty result:", p ? p.propertyName : "null");
      setProperty(p);
      if (p) {
        const [docs, extFields, outs, nts] = await Promise.all([
          getProjectDocuments(p.projectId, propertyId),
          getPropertyExtractedFields(propertyId),
          getProjectOutputs(p.projectId),
          getPropertyNotes(propertyId),
        ]);
        console.log("[PropertyDetail] loaded:", { docs: docs.length, fields: extFields.length, outputs: outs.length, notes: nts.length });
        setDocuments(docs);
        setFields(extFields);
        setOutputs(outs.filter(o => o.propertyId === propertyId));
        setNotes(nts);
      }
    } catch (err) {
      console.error("[PropertyDetail] loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch user tier for feature gating.
  // Uses a one-shot fetch instead of an onAuthStateChanged listener to avoid
  // leaking listeners: every mount used to register a new listener that was
  // never unsubscribed, so after 3-4 property page visits there were 3-4
  // stale listeners all firing duplicate /api/workspace/usage calls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const fbUser = auth.currentUser;
        if (fbUser) {
          const token = await fbUser.getIdToken();
          const res = await fetch("/api/workspace/usage", { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok && !cancelled) {
            const data = await res.json();
            setUserTier(data.tier || "free");
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Load cached deep research on mount — disabled while Location Intel
  // is hidden from the UI. Leaving the fetch in place would still burn
  // a Firestore read per page load for a section no one can see.
  useEffect(() => {
    if (!propertyId) return;
    if (true) return; // Location Intel disabled
    fetch(`/api/workspace/deep-research?propertyId=${propertyId}`)
      .then(r => r.json())
      .then(data => { if (data.exists !== false && data.sections) setDeepResearch(data); })
      .catch(() => {});
  }, [propertyId]);

  // Auto-run location research — disabled while Location Intel is hidden.
  useEffect(() => {
    if (!propertyId || !property) return;
    if (true) return; // Location Intel disabled
    if (deepResearch) return; // already have data
    if (deepResearchLoading) return;
    const addr = [property.address1, property.city, property.state].filter(Boolean).join(", ") || property.propertyName;
    if (!addr) return;
    // Don't auto-run while the deal is still being processed
    const procStatus = (property as any)?.processingStatus || "";
    if (procStatus && procStatus !== "complete") return;

    let cancelled = false;
    setDeepResearchLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/workspace/deep-research", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            propertyName: property.propertyName,
            address: addr,
            analysisType: (property as any).analysisType || "",
          }),
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setDeepResearch(data);
        }
      } catch { /* silent — fall back to manual button */ }
      if (!cancelled) setDeepResearchLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, property?.id, deepResearch]);

  // Auto-poll while property is still processing
  // NOTE: Must be before conditional early returns to satisfy React Rules of Hooks
  // Optimization: only fetch the property doc (lightweight) to check status,
  // then do full loadData() only when processing completes.
  const processingStatus = (property as any)?.processingStatus || "";
  useEffect(() => {
    if (!processingStatus || processingStatus === "complete") return;
    let prevStatus = processingStatus;
    const interval = setInterval(async () => {
      try {
        const p = await getProperty(propertyId);
        if (!p) return;
        const newStatus = (p as any).processingStatus || "";
        setProperty(p); // Update status badge without full reload
        // Only do the expensive full reload when processing finishes
        if (newStatus === "complete" && prevStatus !== "complete") {
          loadData();
        }
        prevStatus = newStatus;
      } catch { /* ignore polling errors */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [processingStatus, loadData, propertyId]);

  /* ── Auto-recalc score when stale vs workspace defaults ─
     The server scorer is the single source of truth. Trigger it when:
       - the property has no persisted score yet, or
       - the property's last-scored-at is older than the workspace's
         last defaults save.
     Quiet best-effort: one POST, then refetch the property doc.
     Skips while processing is in-flight (the pipeline already scores on
     complete) and when there's no usable field data yet. */
  useEffect(() => {
    if (!property || !user || !propertyId) return;
    if (processingStatus && processingStatus !== "complete") return;
    if (!fields || fields.length === 0) return;

    const persistedScore = (property as any)?.scoreTotal;
    const scoredAt = (property as any)?.scoredAt as string | undefined;
    const needsScore = persistedScore == null;
    const isStale =
      !!scoredAt &&
      !!defaultsUpdatedAt &&
      new Date(scoredAt).getTime() < new Date(defaultsUpdatedAt).getTime();
    if (!needsScore && !isStale) return;

    const analysisType =
      (property as any)?.analysisType ||
      activeWorkspace?.analysisType ||
      "retail";
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/workspace/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, userId: user.uid, analysisType }),
        });
        if (cancelled) return;
        const fresh = await getProperty(propertyId);
        if (!cancelled && fresh) setProperty(fresh);
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    propertyId,
    user?.uid,
    (property as any)?.scoreTotal,
    (property as any)?.scoredAt,
    defaultsUpdatedAt,
    processingStatus,
    fields.length,
  ]);

  /* ── File upload handler ────────────────────────────── */
  async function handleFileUpload(fileList: FileList) {
    if (!fileList.length || !property || !user) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const storedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `workspace/${user.uid}/${property.projectId}/${propertyId}/inputs/${storedName}`;
      try {
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed", null, reject, async () => {
            await getDownloadURL(uploadTask.snapshot.ref);
            await createDocument({
              projectId: property.projectId, userId: user.uid, propertyId,
              originalFilename: file.name, storedFilename: storedName, fileExt: ext,
              mimeType: file.type, fileSizeBytes: file.size, storagePath,
              docCategory: guessCategory(file.name), parserStatus: "uploaded",
              isArchived: false, isDeleted: false,
              uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            resolve();
          });
        });
      } catch (err) { console.error(err); }
    }

    setReparsing(true);
    try {
      const updatedDocs = await getProjectDocuments(property.projectId, propertyId);
      setDocuments(updatedDocs);
      const newFiles = Array.from(fileList);
      const extractedText = await extractTextFromFiles(newFiles);
      // Prefer the property's own analysisType (set at classification / manual override).
      // Falls back to the workspace type, then retail. This prevents re-parse from
      // overwriting a multifamily property in a "retail" workspace with retail parsing.
      const analysisType = (property as any)?.analysisType || activeWorkspace?.analysisType || "retail";
      const parseRes = await fetch("/api/workspace/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: property.projectId, propertyId, userId: user.uid, documentText: extractedText, analysisType }),
      });
      const parseData = await parseRes.json().catch(() => ({}));
      // Run generate + score after successful parse
      if (parseData.success && parseData.fieldsExtracted > 0) {
        try { await fetch("/api/workspace/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, parsedData: parseData.fields }) }); } catch { /* non-blocking */ }
        try { await fetch("/api/workspace/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, analysisType }) }); } catch { /* non-blocking */ }
      }
      const newFields = await getPropertyExtractedFields(propertyId);
      setFields(newFields);
    } catch (err) { console.error("[file-add] Parse pipeline failed:", err); }
    setReparsing(false);
    setUploading(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
  }

  /* ── Re-analyze handler ─────────────────────────────── */
  async function handleReAnalyze() {
    if (!property || !user || reparsing) return;
    setReparsing(true);
    setReparseStatus("Downloading files from storage...");
    try {
      const fileObjects: File[] = [];
      for (const doc of documents) {
        if (!doc.storagePath) continue;
        try {
          const fileStorageRef = ref(storage, doc.storagePath);
          const url = await getDownloadURL(fileStorageRef);
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          fileObjects.push(new File([blob], doc.originalFilename || `file.${doc.fileExt}`, { type: doc.mimeType || blob.type }));
        } catch (dlErr) { console.warn(`[re-analyze] Failed to download ${doc.originalFilename}:`, dlErr); }
      }
      if (fileObjects.length === 0) { setReparseStatus("No files could be downloaded."); setReparsing(false); return; }

      setReparseStatus(`Extracting text from ${fileObjects.length} file(s)...`);
      const extractedText = await extractTextFromFiles(fileObjects);
      if (!extractedText || extractedText.trim().length < 50) { setReparseStatus("Could not extract usable text."); setReparsing(false); return; }

      setReparseStatus("Scanning deal data...");
      // Prefer the property's own analysisType (set at classification / manual override).
      const analysisType = (property as any)?.analysisType || activeWorkspace?.analysisType || "retail";
      const parseRes = await fetch("/api/workspace/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: property.projectId, propertyId, userId: user.uid, documentText: extractedText, analysisType }),
      });
      const parseData = await parseRes.json();

      if (parseData.success && parseData.fieldsExtracted > 0) {
        setReparseStatus("Generating output files...");
        try { await fetch("/api/workspace/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, parsedData: parseData.fields }) }); } catch { /* non-blocking */ }
        setReparseStatus("Calculating Deal Signals...");
        try { await fetch("/api/workspace/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, analysisType }) }); } catch { /* non-blocking */ }
        setReparseStatus(`Complete - ${parseData.fieldsExtracted} fields extracted.`);
      } else {
        setReparseStatus("Scan returned limited data.");
      }
      await loadData();
    } catch (err: any) {
      console.error("Re-analyze failed:", err);
      setReparseStatus(`Failed: ${err?.message || "unknown error"}`);
    }
    setReparsing(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
    setTimeout(() => setReparseStatus(""), 6000);
  }

  /* ── Loading / not found states ─────────────────────── */
  if (loading) return (
    <div style={{ padding: 60, textAlign: "center", color: C.secondary }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${C.ghost}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Loading deal...
    </div>
  );
  if (!property) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.onSurface }}>Property not found</h2>
      <Link href="/workspace" style={{ color: C.gold, fontSize: 13 }}>Back to dashboard</Link>
    </div>
  );

  /* ── Derived data ───────────────────────────────────── */
  const g = (group: string, name: string) => gf(fields, group, name);
  const location = [property.address1, property.city, property.state].filter(Boolean).join(", ");
  const brief = String(notes.find(n => n.noteType === "investment_thesis")?.content || "");
  const hasData = fields.length > 0;
  const encodedAddress = encodeURIComponent(location || property.propertyName);
  // Prefer the property's own analysisType (set by classification or manual override).
  // This is the key fix that lets a multifamily OM render MF UI even when it lives
  // in a retail-typed workspace.
  const wsType = ((property as any)?.analysisType as string) || activeWorkspace?.analysisType || "retail";

  const scoreTotal = (property as any).scoreTotal || null;
  const scoreBand = (property as any).scoreBand || "";

  /* Count pulled / calculated / review items */
  const omPurchasePrice = Number(g("pricing_deal_terms", "asking_price")) || null;

  return (
    <div className="pd-outer" style={{ display: "flex", minHeight: 0 }}>
      {/* Let the outer layout handle scrolling so sidebar's position:sticky snaps to the viewport, not a nested scroller */}
      <div className="pd-scroll" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start" }}>
        {/* ── Main Content ──────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
        <PropertyDetailInner
          property={property} setProperty={setProperty} propertyId={propertyId}
          fields={fields} notes={notes} documents={documents} outputs={outputs}
          hasData={hasData} brief={brief} location={location} encodedAddress={encodedAddress}
          wsType={wsType} scoreTotal={scoreTotal} scoreBand={scoreBand}
          processingStatus={processingStatus}
          omPurchasePrice={omPurchasePrice} activeWorkspace={activeWorkspace}
          handleFileUpload={handleFileUpload} handleReAnalyze={handleReAnalyze}
          reparsing={reparsing} reparseStatus={reparseStatus} uploading={uploading}
          fileRef={fileRef} g={g}
          user={user}
          deepResearchLoading={deepResearchLoading} setDeepResearchLoading={setDeepResearchLoading}
          deepResearch={deepResearch} setDeepResearch={setDeepResearch}
          feedbackSent={feedbackSent} setFeedbackSent={setFeedbackSent}
          reviewExpanded={reviewExpanded} setReviewExpanded={setReviewExpanded}
          userTier={userTier}
        />
        </div>

      {/* ── Property Sidebar (right) ───────────────────────
         Sticky + internally scrollable. Two things the previous version got
         wrong when a dealboard had 20+ properties:
           1. top:0 and maxHeight:calc(100vh - 32px) ignored the 64px
              workspace header, so the top chunk of the list sat behind the
              header and the bottom got clipped off-screen.
           2. overscroll-behavior wasn't set, so when the list reached its
              top/bottom, the wheel event bubbled to the page and the
              sidebar content you were trying to reach scrolled away with it.
         Fix: offset for the header, reserve matching space at the bottom,
         and contain scroll chaining so hovering the column always scrolls
         the column.                                                       */}
      {siblingProps.length > 1 && (
        <div
          className="pd-sidebar"
          style={{
            width: 260, minWidth: 260, background: "#fff", borderLeft: "1px solid rgba(0,0,0,0.06)",
            flexShrink: 0,
            // Nudge the sticky top up and shrink max-height so the last
            // property row is always reachable above any OS / in-page UI
            // chrome that was clipping the bottom of the list.
            position: "sticky", top: 16, alignSelf: "flex-start",
            // Scroll container height is (100vh - 64px header). Subtract
            // the top:16 offset plus ~16px bottom breathing room so the
            // last row in a long property list isn't clipped below the
            // visible area.
            maxHeight: "calc(100vh - 96px)", overflowY: "auto",
            borderRadius: 12,
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
          }}
        >
          <div style={{ padding: "14px 14px 8px", borderBottom: "1px solid #F0F2F5" }}>
            <Link href={`/workspace?ws=${activeWorkspace?.slug || "default-dealboard"}`} style={{
              fontSize: 13, fontWeight: 700, color: "#111827", textDecoration: "none",
              display: "block", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {activeWorkspace?.name || "DealBoard"}
            </Link>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Properties ({siblingProps.length})
            </div>
          </div>
          <div style={{
            // Extra bottom padding guarantees the last property row lifts
            // above the sticky column's lower edge; without it the final
            // entry was sitting flush with the scroll end and felt clipped.
            padding: "8px 8px 64px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {siblingProps.map(sp => {
              const isActive = sp.id === propertyId;
              const spScore = (sp as any).scoreTotal || 0;
              // Match the detail-page badge: color by Signal Band, not a raw
              // numeric threshold. Falls back to numeric if band is missing.
              const spBandNorm = ((sp as any).scoreBand || "").toLowerCase().replace(/_/g, " ");
              const spSColor = spBandNorm === "strong buy" || spBandNorm === "buy"
                ? "#4D7C0F"
                : spBandNorm === "hold" || spBandNorm === "neutral"
                  ? "#D97706"
                  : spBandNorm === "pass" || spBandNorm === "strong reject"
                    ? "#DC2626"
                    : spScore >= 75 ? "#4D7C0F" : spScore >= 50 ? "#D97706" : "#DC2626";
              const spHero = (sp as any).heroImageUrl;
              const spName = cleanDisplayName(sp.propertyName, sp.address1, sp.city, sp.state);
              const spCity = [sp.city, sp.state].filter(Boolean).join(", ");
              const spProcessing = (sp as any).processingStatus;
              const spIsProcessing = spProcessing && spProcessing !== "complete";
              const spType = ((sp as any).analysisType as string) || activeWorkspace?.analysisType || "retail";
              const spTypeLabel = ANALYSIS_TYPE_LABELS[spType as keyof typeof ANALYSIS_TYPE_LABELS] || "Retail";
              return (
                <div
                  key={sp.id}
                  onClick={() => router.push(`/workspace/properties/${sp.id}`)}
                  title={`Scored with ${spTypeLabel} model`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: 8, cursor: "pointer",
                    background: isActive ? "rgba(132,204,22,0.06)" : "transparent",
                    border: "1px solid",
                    borderColor: isActive ? "rgba(132,204,22,0.15)" : "transparent",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? "rgba(132,204,22,0.06)" : "transparent"; }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                    background: "#F3F4F6", border: "1px solid rgba(0,0,0,0.04)",
                  }}>
                    {spHero ? (
                      <img src={spHero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /></svg>
                      </div>
                    )}
                  </div>
                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: isActive ? 700 : 600,
                      color: isActive ? "#111827" : "#374151",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {spName}
                    </div>
                    {spCity && (
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {spCity}
                      </div>
                    )}
                    {spIsProcessing ? (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3,
                        fontSize: 9, fontWeight: 600, color: "#2563EB",
                        background: "rgba(37,99,235,0.06)", padding: "1px 6px", borderRadius: 3,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          border: "1.5px solid rgba(37,99,235,0.3)", borderTopColor: "#2563EB",
                          animation: "spin 0.8s linear infinite",
                        }} />
                        Processing
                      </div>
                    ) : spScore > 0 ? (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3,
                        fontSize: 9, fontWeight: 700,
                        color: spSColor,
                      }}>
                        Score: {spScore}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*  INNER RENDER - split so usePurchasePriceOverride works   */
/* ══════════════════════════════════════════════════════════ */
function PropertyDetailInner({
  property, setProperty, propertyId, fields, notes, documents, outputs,
  hasData, brief, location, encodedAddress, wsType, scoreTotal, scoreBand,
  processingStatus,
  omPurchasePrice, activeWorkspace, handleFileUpload, handleReAnalyze, reparsing, reparseStatus,
  uploading, fileRef, g, user,
  deepResearchLoading, setDeepResearchLoading, deepResearch, setDeepResearch,
  feedbackSent, setFeedbackSent, reviewExpanded, setReviewExpanded,
  userTier,
}: any) {

  /* ── Pro Analysis tabs ─────────────────────────────────
     URL-backed so a link into ?tab=om-reverse-pricing lands on that tab.
     The tab bar sits directly below the hero; below it the existing
     property detail sections continue to render as "Deal Details".     */
  type ProTab = "quick-screen" | "om-reverse-pricing" | "rent-roll";
  const [activeProTab, setActiveProTab] = useState<ProTab>(() => {
    if (typeof window === "undefined") return "quick-screen";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "om-reverse-pricing") return "om-reverse-pricing";
    if (t === "rent-roll") return "rent-roll";
    return "quick-screen";
  });
  const routerForTabs = useRouter();
  const selectProTab = useCallback((next: ProTab) => {
    setActiveProTab(next);
    // Keep the URL in sync with a shallow push so refresh + share both land
    // on the selected tab. router.push preserves auth state (CLAUDE.md rule).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      routerForTabs.push(`${url.pathname}${url.search}`, { scroll: false });
    }
  }, [routerForTabs]);

  const priceState = usePurchasePriceOverride(omPurchasePrice);
  const { activePrice } = priceState;

  /* ── Calculated metrics that react to purchase price ── */
  const noiOm = Number(g("expenses", "noi_om")) || 0;
  const bldgSf = Number(g("property_basics", "building_sf")) || 0;
  const intRate = Number(g("debt_assumptions", "interest_rate")) || 7.25;
  const amortYrs = Number(g("debt_assumptions", "amortization_years")) || 25;
  const ltvPct = (Number(g("debt_assumptions", "ltv")) || 65) / 100;
  const closingPct = 0.02;

  const calc = useMemo(() => {
    const price = activePrice || 0;
    if (!price) return null;

    const capRate = noiOm > 0 ? (noiOm / price) * 100 : null;
    const priceSf = bldgSf > 0 ? price / bldgSf : null;
    const loanAmt = price * ltvPct;
    const downPayment = price * (1 - ltvPct);
    const closingCosts = price * closingPct;
    const totalEquity = downPayment + closingCosts;
    const mRate = (intRate / 100) / 12;
    const annualDS = loanAmt > 0 ? (loanAmt * mRate) / (1 - Math.pow(1 + mRate, -12 * amortYrs)) * 12 : 0;
    const dscr = annualDS > 0 && noiOm > 0 ? noiOm / annualDS : null;
    const cashOnCash = totalEquity > 0 && noiOm > 0 ? ((noiOm - annualDS) / totalEquity) * 100 : null;
    const debtYield = loanAmt > 0 && noiOm > 0 ? (noiOm / loanAmt) * 100 : null;

    return { capRate, priceSf, loanAmt, totalEquity, annualDS, dscr, cashOnCash, debtYield };
  }, [activePrice, noiOm, bldgSf, intRate, amortYrs, ltvPct]);

  /* ── Pulled from OM fields ─────────────────────────── */
  const pulledFields = useMemo(() => {
    if (wsType === "land") return [
      { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")), key: "asking_price" },
      { label: "Total Acres", value: g("property_basics", "lot_acres") || "--", key: "lot_acres" },
      { label: "Zoning", value: g("land_zoning", "current_zoning") || "--", key: "zoning" },
      { label: "Planned Use", value: g("land_zoning", "planned_use") || "--", key: "planned_use" },
      { label: "Road Access", value: g("land_access", "road_access") || "--", key: "road_access" },
      { label: "Water", value: g("land_utilities", "water") === true ? "Yes" : g("land_utilities", "water") === false ? "No" : "--", key: "water" },
      { label: "Sewer", value: g("land_utilities", "sewer") === true ? "Yes" : g("land_utilities", "sewer") === false ? "No" : "--", key: "sewer" },
      { label: "Flood Zone", value: g("property_basics", "flood_zone") || "--", key: "flood_zone" },
    ].filter(f => f.value !== "--" && f.value !== null);

    return [
      { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")), key: "asking_price" },
      { label: "GLA", value: fmtSF(g("property_basics", "building_sf")), key: "building_sf" },
      { label: "Occupancy", value: fmtPct(g("property_basics", "occupancy_pct")), key: "occupancy_pct" },
      { label: "Base Rent", value: fmt$(g("income", "base_rent")), key: "base_rent" },
      { label: "NOI (Stated)", value: fmt$(g("expenses", "noi_om")), key: "noi_om" },
      { label: "Cap Rate (Stated)", value: fmtPct(g("pricing_deal_terms", "cap_rate_om")), key: "cap_rate_om" },
      { label: "Year Built", value: g("property_basics", "year_built") || "--", key: "year_built" },
      { label: "Tenant Count", value: g("property_basics", "tenant_count") || "--", key: "tenant_count" },
      { label: "WALE", value: g("property_basics", "wale_years") ? `${g("property_basics", "wale_years")} yrs` : (g("rent_roll", "wale") ? `${g("rent_roll", "wale")} yrs` : "--"), key: "wale" },
      { label: "CAM Expenses", value: fmt$(g("expenses", "cam_expenses")), key: "cam_expenses" },
      { label: "Property Taxes", value: fmt$(g("expenses", "property_taxes")), key: "property_taxes" },
      { label: "Insurance", value: fmt$(g("expenses", "insurance")), key: "insurance" },
    ].filter(f => f.value !== "--" && f.value !== null);
  }, [fields, wsType]);

  /* ── Calculated fields (depend on purchase price) ──── */
  const calculatedFields = useMemo(() => {
    if (!calc || wsType === "land") return [];
    const out: { label: string; value: string; tooltip: string; priceAffected: boolean }[] = [];
    if (calc.capRate !== null) out.push({ label: "Cap Rate", value: `${calc.capRate.toFixed(2)}%`, tooltip: "NOI ÷ Purchase Price", priceAffected: true });
    if (calc.priceSf !== null) out.push({ label: "Price / SF", value: `$${calc.priceSf.toFixed(0)}/SF`, tooltip: "Purchase Price ÷ GLA", priceAffected: true });
    if (calc.dscr !== null) out.push({ label: "DSCR", value: `${calc.dscr.toFixed(2)}x`, tooltip: "NOI ÷ Annual Debt Service", priceAffected: true });
    if (calc.cashOnCash !== null) out.push({ label: "Cash-on-Cash", value: `${calc.cashOnCash.toFixed(1)}%`, tooltip: "Pre-tax cash flow ÷ Total equity invested", priceAffected: true });
    if (calc.debtYield !== null) out.push({ label: "Debt Yield", value: `${calc.debtYield.toFixed(2)}%`, tooltip: "NOI ÷ Loan Amount", priceAffected: true });
    if (calc.totalEquity > 0) out.push({ label: "Equity Required", value: fmt$(calc.totalEquity), tooltip: "Down payment + closing costs", priceAffected: true });
    if (calc.loanAmt > 0) out.push({ label: "Loan Amount", value: fmt$(calc.loanAmt), tooltip: `Based on ${(ltvPct * 100).toFixed(0)}% LTV`, priceAffected: true });
    if (calc.annualDS > 0) out.push({ label: "Debt Service", value: fmt$(calc.annualDS), tooltip: "Annual mortgage payment", priceAffected: true });
    return out;
  }, [calc, wsType, ltvPct]);

  /* ── Review items ──────────────────────────────────── */
  const reviewItems = useMemo(() => {
    const items: string[] = [];
    if (wsType === "land") return items;

    const mgmt = g("expenses", "management_fee");
    const reserves = g("expenses", "reserves");
    const totalExp = g("expenses", "total_expenses");
    const noiOmVal = g("expenses", "noi_om");
    const noiAdj = g("expenses", "noi_adjusted");
    const vacancy = g("income", "vacancy_allowance");
    const wale = g("rent_roll", "wale") || g("rent_roll", "weighted_avg_lease_term");
    const capStated = g("pricing_deal_terms", "cap_rate_om");

    if (!mgmt || Number(mgmt) === 0) items.push("No management fee in OM - typically 3–6% of EGI");
    if (!reserves || Number(reserves) === 0) items.push("No capital reserves listed - typically $0.15–0.25/SF");
    if (!vacancy || Number(vacancy) === 0) items.push("No vacancy allowance - typical underwriting uses 3–5%");
    if (!totalExp || Number(totalExp) === 0) items.push("No operating expenses listed - verify NNN reimbursements");
    if (noiOmVal && noiAdj && Math.abs(Number(noiAdj) - Number(noiOmVal)) > 1000) {
      items.push("NOI appears in more than one form - verify which is correct");
    }
    if (wale && Number(wale) < 5) items.push(`Short WALE (${Number(wale).toFixed(1)} yrs) - lease rollover risk ahead`);
    if (capStated && calc?.capRate) {
      const stated = Number(capStated);
      const calculated = calc.capRate;
      if (Math.abs(stated - calculated) > 0.3) {
        items.push(`Stated cap rate (${stated.toFixed(2)}%) differs from calculated (${calculated.toFixed(2)}%) - reconcile`);
      }
    }

    // Tenant rent roll reconciliation
    const tenantFields = fields.filter((f: ExtractedField) => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
    const tenantRents = tenantFields.map((f: ExtractedField) => {
      const num = f.fieldName.match(/^tenant_(\d+)_name$/)?.[1];
      return num ? Number(g("rent_roll", `tenant_${num}_rent`)) || 0 : 0;
    });
    const totalTenantRent = tenantRents.reduce((s: number, v: number) => s + v, 0);
    const baseRent = Number(g("income", "base_rent")) || 0;
    if (totalTenantRent > 0 && baseRent > 0 && Math.abs(totalTenantRent - baseRent) / baseRent > 0.1) {
      items.push("Summary rent and rent roll totals may not fully reconcile");
    }

    return items;
  }, [fields, wsType, calc]);

  /* ── Tenants ────────────────────────────────────────── */
  const tenants = useMemo(() => {
    const tenantFields = fields.filter((f: ExtractedField) => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
    return tenantFields.map((f: ExtractedField) => {
      const num = f.fieldName.match(/^tenant_(\d+)_name$/)?.[1];
      if (!num) return null;
      return {
        name: String(f.normalizedValue || f.rawValue),
        sf: g("rent_roll", `tenant_${num}_sf`),
        rent: g("rent_roll", `tenant_${num}_rent`),
        type: g("rent_roll", `tenant_${num}_type`),
        end: g("rent_roll", `tenant_${num}_lease_end`),
        status: g("rent_roll", `tenant_${num}_status`),
      };
    }).filter(Boolean);
  }, [fields]);

  /* ── Signals ────────────────────────────────────────── */
  const signals = useMemo(() => {
    return (wsType === "land" ? [
      ["Overall", g("signals", "overall_signal")],
      ["Pricing", g("signals", "pricing_signal")],
      ["Location", g("signals", "location_signal")],
      ["Zoning", g("signals", "zoning_signal")],
    ] : [
      ["Overall", g("signals", "overall_signal")],
      ["Cap Rate", g("signals", "cap_rate_signal")],
      ["DSCR", g("signals", "dscr_signal")],
      ["Occupancy", g("signals", "occupancy_signal")],
      ["Basis / Price", g("signals", "basis_signal")],
      ["Tenant Quality", g("signals", "tenant_quality_signal")],
    ]).filter(([, v]) => v);
  }, [fields, wsType]);

  /* Data counts */
  const pulledCount = pulledFields.length;
  const calcCount = calculatedFields.length;
  const reviewCount = reviewItems.length;

  /* ═══════════════════════════════════════════════════════ */
  /*  RENDER                                                 */
  /* ═══════════════════════════════════════════════════════ */
  return (
    <div className="pd-inner" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <style>{`
        .pd-accordion > summary::-webkit-details-marker { display: none; }
        .pd-accordion > summary::marker { content: ""; }
        .pd-accordion > summary:hover { background: #F3F4F6 !important; }
        .pd-accordion[open] .pd-chev { transform: rotate(180deg); }
      `}</style>
      {(property as any)?.dealStructure === "syndication" && (
        <div style={{
          background: "#FEF3C7",
          border: "1px solid #FCD34D",
          borderRadius: 8,
          padding: "12px 16px",
          margin: "12px 0",
          color: "#78350F",
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          <strong>Heads up:</strong> This looks like an LP/GP syndication offering
          {(property as any)?.dealStructureReason ? ` (matched: ${(property as any).dealStructureReason})` : ""}.
          DealSignals is built for direct-asset underwriting, so the standard CRE analysis
          below may not fully apply. Full syndication (LP/GP) support is on our roadmap.
        </div>
      )}
      <style>{`
        .card-hover { transition: all 0.2s cubic-bezier(0.4,0,0.2,1); }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(21,27,43,0.08); }
        .dl-btn { transition: all 0.15s ease; }
        .dl-btn:hover { background: ${C.surfLow} !important; border-color: ${C.gold} !important; }
        .doc-row { transition: all 0.12s ease; }
        .doc-row:hover { background: ${C.surfLow} !important; }
        .section-row { transition: background 0.15s ease; }
        .section-row:hover { background: ${C.surfLow} !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeHighlight { 0% { background: #DBEAFE; } 100% { background: transparent; } }

        /* ─── Mobile-only elements (hidden on desktop) ─── */
        .pd-mobile-score-card { display: none; }
        .pd-mobile-hero { display: none; }

        /* ─── Desktop-only: hide the legacy prop-header so the     */
        /*     modal-style hero (.pd-desktop-hero) owns the top.    */
        /*     On mobile the old header still renders so users      */
        /*     can rename inline beneath the mobile hero image.     */
        @media (min-width: 769px) {
          .pd-prop-header { display: none !important; }
          /* Drop the image column inside the summary card on       */
          /* desktop — the hero carries the image now. The score    */
          /* panel stays; its own border-left is fine since the     */
          /* column is the only thing to the right of the text.     */
          .pd-summary-image .pd-summary-image-photo { display: none !important; }
          .pd-summary-image { width: 200px !important; }
        }

        /* ─── Mobile responsive ─── */
        @media (max-width: 768px) {
          .pd-outer { flex-direction: column !important; }
          .pd-sidebar { display: none !important; }
          .pd-inner { padding: 0 !important; }

          /* Show mobile-only elements */
          .pd-mobile-hero { display: block !important; }
          /* Hide the desktop modal-style hero on mobile */
          .pd-desktop-hero { display: none !important; }

          /* Collapse the redundant upper score card on mobile — the
             DealSignal Score strip below it carries the same info. */
          .pd-mobile-score-card { display: none !important; }

          /* Hide the full-width "Scored with … Model (auto-detected)"
             banner on mobile. On mobile the model is shown as a small
             pill overlay on the hero image instead. */
          .pd-model-lens-banner { display: none !important; }

          /* Score strip reflow: stack the metric chips under the verdict. */
          .pd-score-strip { padding: 16px 18px !important; gap: 14px !important; margin: 12px 16px 16px !important; }
          .pd-score-strip-metrics { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }

          /* Full-bleed hero on mobile */
          .pd-mobile-hero { margin: 0 -10px !important; }
          .pd-mobile-hero img { width: 100%; height: 200px; object-fit: cover; display: block; }

          /* Property header - compact */
          .pd-prop-header { padding: 14px 16px 0 !important; margin-bottom: 0 !important; }
          .pd-prop-name { font-size: 22px !important; }
          .pd-prop-location { font-size: 13px !important; }
          .pd-dl-buttons { display: none !important; }

          /* Mobile score card - the signature look */
          .pd-mobile-score-card {
            margin: 12px 16px !important; padding: 0 !important;
            background: #FFFFFF !important; border-radius: 14px !important;
            border: 1px solid rgba(0,0,0,0.06) !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            overflow: hidden !important;
          }

          /* Summary card - hide the image panel on mobile (hero is separate) */
          .pd-summary-card { flex-direction: column !important; margin: 0 16px 16px !important; border-radius: 14px !important; }
          .pd-summary-image { display: none !important; }
          .pd-summary-text { padding: 16px !important; }
          .pd-summary-text > div:first-child { font-size: 17px !important; }
          .pd-summary-text p { font-size: 13px !important; line-height: 1.65 !important; }

          /* Metrics strip - 2×2 grid */
          .pd-metrics-strip { flex-wrap: wrap !important; gap: 0 !important; margin: 0 16px 16px !important; border-radius: 14px !important; }
          .pd-metrics-strip > div { flex: 1 1 48% !important; min-width: 0 !important; padding: 12px 14px !important; }

          /* Signals - stack */
          .pd-signal-cards { flex-direction: column !important; gap: 8px !important; padding: 0 16px !important; }
          .pd-signal-cards > div { min-width: 0 !important; }

          /* Section headers */
          .pd-section-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; padding: 0 16px !important; }

          /* Tables - prevent horizontal scroll, hide less-critical columns */
          .pd-table-wrap { overflow-x: hidden !important; margin: 0 16px !important; }
          /* Tenant Summary: hide Type (4th) & Lease End (5th) cols */
          .pd-table-wrap table thead th:nth-child(n+4),
          .pd-table-wrap table tbody td:nth-child(n+4),
          .pd-table-wrap table tfoot td:nth-child(n+4) { display: none !important; }
          .pd-table-wrap table { min-width: 0 !important; font-size: 11px !important; }
          .pd-table-wrap table th,
          .pd-table-wrap table td { padding: 8px 10px !important; }
          /* Sale Price Scenarios: hide DSCR (4th) & Cash-on-Cash (5th) cols */
          .pd-scenarios-table thead th:nth-child(n+4),
          .pd-scenarios-table tbody td:nth-child(n+4) { display: none !important; }
          .pd-scenarios-table { font-size: 11px !important; }
          .pd-scenarios-table th,
          .pd-scenarios-table td { padding: 8px 10px !important; }

          /* Download buttons */
          .dl-btn { font-size: 10px !important; padding: 5px 10px !important; }
        }
        @media (max-width: 480px) {
          .pd-mobile-hero img { height: 170px; }
          .pd-prop-name { font-size: 20px !important; }
          .pd-metrics-strip > div { flex: 1 1 48% !important; padding: 10px 12px !important; }
        }
      `}</style>

      {/* ── Breadcrumb ──────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.secondary }}>
          <Link href={`/workspace?ws=${activeWorkspace?.slug || "default-dealboard"}`} style={{ color: C.primaryText, fontWeight: 600, textDecoration: "none" }}>
            {activeWorkspace?.name || "DealBoard"}
          </Link>
          <span style={{ margin: "0 6px", opacity: 0.4 }}>/</span>
          <span style={{ color: C.onSurface, fontWeight: 500 }}>{property.propertyName}</span>
        </div>
      </div>

      {/* ── Processing Status Banner ─────────────────────── */}
      {processingStatus && processingStatus !== "complete" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
          background: "rgba(37, 99, 235, 0.06)", border: "1px solid rgba(37, 99, 235, 0.15)",
          borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: `3px solid rgba(37, 99, 235, 0.15)`, borderTopColor: "#2563EB",
            animation: "spin 0.8s linear infinite", flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af" }}>
              {processingStatus === "parsing" ? "Extracting data from documents…" :
               processingStatus === "generating" ? "Generating analysis report…" :
               processingStatus === "scoring" ? "Running scoring models…" :
               "Processing deal…"}
            </div>
            <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 2 }}>
              This page will update automatically when analysis is complete.
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  MOBILE HERO IMAGE (hidden on desktop)              */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="pd-mobile-hero" style={{ position: "relative" }}>
        {(property as any).heroImageUrl ? (
          <img src={(property as any).heroImageUrl} alt={property.propertyName} />
        ) : (
          <div style={{ height: 200, background: "linear-gradient(135deg, #F3F4F6, #E5E7EB)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 48, opacity: 0.25 }}>📍</span>
          </div>
        )}
        {/* Asset-type pill overlay — replaces the full-width
            "Scored with … Model (auto-detected)" banner on mobile. */}
        {(() => {
          const t = ((property as any).analysisType as string) || wsType || "retail";
          const label = ANALYSIS_TYPE_LABELS[t as keyof typeof ANALYSIS_TYPE_LABELS] || "Retail";
          return (
            <span style={{
              position: "absolute", top: 12, left: 16,
              display: "inline-flex", alignItems: "center",
              padding: "6px 12px", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 0.8,
              color: "#fff", background: "rgba(15,23,42,0.55)",
              backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
              borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)",
            }}>
              {label} Model
            </span>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  1a. DESKTOP HERO — modal-style full-width image     */}
      {/*      with title + address overlaid                   */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="pd-desktop-hero" style={{
        position: "relative", overflow: "hidden", borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.05)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        marginBottom: 16, height: 280, background: "#0F172A",
      }}>
        {/* Image layer */}
        <div style={{ position: "absolute", inset: 0 }}>
          <PropertyImage
            heroImageUrl={(property as any).heroImageUrl}
            location={location}
            address={location}
            propertyName={property.propertyName}
            propertyId={property.id}
          />
        </div>
        {/* Legibility gradient */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.82) 100%)",
        }} />

        {/* Top-left: asset type pill (small, over image) */}
        <div style={{ position: "absolute", top: 16, left: 20, zIndex: 2 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 0.8,
            color: "#fff", background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6,
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          }}>
            {ANALYSIS_TYPE_LABELS[wsType as keyof typeof ANALYSIS_TYPE_LABELS] || wsType} Model
          </span>
        </div>

        {/* Top-right: download buttons (desktop only, kept on darker backdrop) */}
        {hasData && (
          <div className="pd-hero-dl" style={{
            position: "absolute", top: 14, right: 14, zIndex: 2,
            display: "flex", gap: 8, flexShrink: 0,
          }}>
            <button
              onClick={async () => { try { await generateUnderwritingXLSX(property.propertyName, fields, wsType); } catch (e: any) { alert("XLSX failed: " + (e?.message || "unknown")); } }}
              className="dl-btn"
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid #A7F3D0", background: "#ECFDF5",
                color: "#065F46", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Workbook
              <span style={{ padding: "1px 5px", background: "#D1FAE5", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#065F46" }}>XLSX</span>
            </button>
            <button
              onClick={() => generateBriefDownload(property.propertyName, brief, fields, wsType)}
              className="dl-btn"
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid #BFDBFE", background: "#EFF6FF",
                color: "#1E40AF", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Brief
              <span style={{ padding: "1px 5px", background: "#DBEAFE", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#1E40AF" }}>DOC</span>
            </button>
            {userTier === "pro_plus" ? (
              <button
                onClick={async () => { try { await generateStrategyLensXLSX(property.propertyName, fields, wsType); } catch (e: any) { alert("Strategy XLS failed: " + (e?.message || "unknown")); } }}
                className="dl-btn"
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: `1px solid ${C.ghostBorder}`, background: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
                  color: "#92400E", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Strategy
                <span style={{ padding: "1px 5px", background: "#FCD34D", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#78350F" }}>PRO+</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm("Strategy Analysis is a Pro+ feature. Upgrade to unlock detailed Core / Value-Add / Opportunistic analysis for every deal.\n\nGo to upgrade page?")) {
                    window.location.href = "/workspace?upgrade=true";
                  }
                }}
                className="dl-btn"
                title="Upgrade to Pro+ to unlock Strategy Analysis"
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid #E5E7EB", background: "#F3F4F6",
                  color: "#9CA3AF", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Strategy
                <span style={{ padding: "1px 5px", background: "#E5E7EB", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#6B7280" }}>PRO+</span>
              </button>
            )}
            {user && (
              <EmailPropertyButton
                property={property}
                fields={fields}
                brief={brief}
                wsType={wsType}
                scoreTotal={scoreTotal}
                scoreBand={scoreBand}
                user={user}
              />
            )}
          </div>
        )}

        {/* Bottom-left: title + address over gradient */}
        <div style={{
          position: "absolute", bottom: 20, left: 24, right: 24, zIndex: 2,
          color: "#fff",
        }}>
          {(() => {
            // Shared rename handler used by both the title click and the
            // explicit pencil button. The pencil is what makes the
            // rename affordance legible over the hero image — a hover-only
            // affordance is invisible on mobile and the bare title alone
            // gave no signal that it was editable.
            const renameTitle = (e: any) => {
              e?.stopPropagation?.();
              const next = prompt("Rename deal", property.propertyName);
              if (next && next.trim() && next.trim() !== property.propertyName) {
                updateProperty(propertyId, { propertyName: next.trim() } as any)
                  .then(() => {
                    setProperty((prev: Property | null) => prev ? { ...prev, propertyName: next.trim() } : prev);
                    if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
                  })
                  .catch(() => {});
              }
            };
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
                <h1
                  onClick={renameTitle}
                  style={{
                    fontSize: 28, fontWeight: 800, color: "#fff", margin: 0,
                    lineHeight: 1.15, letterSpacing: "-0.3px", textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    fontFamily: "'Inter', sans-serif", cursor: "pointer", maxWidth: "100%",
                  }}
                >
                  {cleanDisplayName(property.propertyName, property.address1, property.city, property.state)}
                </h1>
                <button
                  onClick={renameTitle}
                  title="Rename deal"
                  aria-label="Rename deal"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.35)",
                    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                    cursor: "pointer", color: "#fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }}
                >
                  {/* Pencil icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              </div>
            );
          })()}
          {location && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ fontSize: 14, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)", fontWeight: 500 }}>{location}</span>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`} target="_blank" rel="noopener noreferrer"
                title="Open in Google Maps"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 11, color: "#fff", textDecoration: "none",
                  padding: "3px 10px", background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6,
                  fontWeight: 600, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Google Maps
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  DEAL VERDICT                                       */}
      {/*  Single source of truth for the Buy / Neutral / Pass */}
      {/*  read. The Pro Analysis tabs below each render a     */}
      {/*  slim repeat of this same verdict so the signal      */}
      {/*  is never lost when a tab is shared in isolation.    */}
      {/* ═══════════════════════════════════════════════════ */}
      <DealVerdictBox
        property={property}
        fields={fields}
        variant="main"
        brief={brief}
        scoreTotal={scoreTotal}
        scoreBand={scoreBand || null}
      />

      {/* ═══════════════════════════════════════════════════ */}
      {/*  PRO ANALYSIS SUB-SECTION                           */}
      {/*  Tabs + content are wrapped in a single card so the */}
      {/*  whole block reads as one sub-section. The tab row  */}
      {/*  sits flush on top of the content panel and the     */}
      {/*  active tab visually merges into the panel below    */}
      {/*  (file-folder metaphor).                            */}
      {/*  Each tab owns one concern:                         */}
      {/*    Quick Screen       - scoring + reasons           */}
      {/*    OM Reverse Pricing - pricing solve               */}
      {/*    Rent Roll          - tenant-level lease detail   */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="pd-pro-section" style={{
        marginBottom: 28,
        background: "#FFFFFF",
        border: `1px solid ${C.ghost}`,
        borderRadius: C.radius,
        boxShadow: "0 2px 10px rgba(15,23,43,0.05)",
        overflow: "hidden",
      }}>
        {/* Tab strip - file folder style. `marginBottom: -1` on the active
           tab lets its bottom edge overlap the strip's border so it appears
           to flow directly into the white content panel below. */}
        <div className="pd-pro-tabs" style={{
          display: "flex",
          alignItems: "flex-end",
          background: "#F9FAFB",
          borderBottom: `1px solid ${C.ghost}`,
          padding: "8px 12px 0",
          gap: 2,
        }}>
          {[
            { id: "quick-screen" as const, label: "Deal Quick Screen", ready: true },
            { id: "om-reverse-pricing" as const, label: "Offer Scenarios", ready: true },
            { id: "rent-roll" as const, label: "Rent Roll", ready: true },
          ].map(tab => {
            const isActive = tab.id === activeProTab;
            return (
              <button
                key={tab.id}
                onClick={() => selectProTab(tab.id)}
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
                {/* Accent bar on the active tab reinforces the folder metaphor */}
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
                {tab.label}
                {!tab.ready && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: "#FEF3C7",
                    color: "#92400E",
                    textTransform: "uppercase",
                  }}>Soon</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content panel - same white surface as the active tab so the two
           read as one continuous card. */}
        <div className="pd-pro-panel" style={{ padding: "20px 20px 22px" }}>
          {activeProTab === "quick-screen" && (
            <DealQuickScreen property={property} fields={fields} />
          )}

          {activeProTab === "om-reverse-pricing" && (
            <OmReversePricing property={property} fields={fields} />
          )}

          {activeProTab === "rent-roll" && (
            <>
              {wsType !== "land" && tenants.length > 0 ? (
            <>
            {/* Mirror the Deal Details rent roll layout exactly so both views
               render identically. Change in one, change in both.              */}
            <div style={{
              background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
              border: `1px solid rgba(0,0,0,0.06)`,
            }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#F9FAFB" }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Rent Roll</h3>
              </div>
              <div className="pd-table-wrap" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Tenant</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>SF</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Annual Rent</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Lease End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t: any, i: number) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#FFFFFF" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 600, color: C.onSurface }}>{t.name}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt$(t.rent)}</td>
                        <td style={{ padding: "8px 12px", color: C.secondary }}>{t.type || "--"}</td>
                        <td style={{ padding: "8px 12px", color: C.secondary }}>{t.end || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {tenants.length > 1 && (() => {
                    const totalSf = tenants.reduce((sum: number, t: any) => sum + (Number(t.sf) || 0), 0);
                    const totalRent = tenants.reduce((sum: number, t: any) => sum + (Number(t.rent) || 0), 0);
                    return (
                      <tfoot>
                        <tr style={{ background: "#F9FAFB", borderTop: `2px solid rgba(0,0,0,0.04)` }}>
                          <td style={{ padding: "8px 16px", fontWeight: 700, color: C.onSurface }}>Total ({tenants.length} tenants)</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.onSurface }}>{totalSf > 0 ? totalSf.toLocaleString() : "--"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.onSurface }}>{totalRent > 0 ? fmt$(totalRent) : "--"}</td>
                          <td colSpan={2} style={{ padding: "8px 12px", color: C.secondary, fontSize: 11 }}>
                            {totalSf > 0 && totalRent > 0 ? `Avg $${(totalRent / totalSf).toFixed(2)}/SF` : ""}
                          </td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
            <RentRollDetailAnalysis property={property} fields={fields} wsType={wsType} />
            </>
          ) : (
            <div style={{
              background: C.surfLowest, border: `1px dashed rgba(0,0,0,0.08)`,
              borderRadius: C.radius, padding: 32, textAlign: "center",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 6 }}>
                {wsType === "land" ? "Rent roll does not apply to land deals" : "No tenants extracted yet"}
              </div>
              <div style={{ fontSize: 12, color: C.secondary, maxWidth: 420, margin: "0 auto", lineHeight: 1.5 }}>
                {wsType === "land"
                  ? "Land deals have no rent roll. Use the Quick Screen tab for basis-driven triage."
                  : "Upload a rent roll (XLS/PDF) or an OM with a tenant table on the Deal Details section and tenants will populate here automatically."}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  1. PROPERTY HEADER (mobile only - desktop uses     */}
      {/*     the modal-style hero above)                      */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="pd-prop-header" style={{ marginBottom: 20 }}>
        {/* Top row: name + download buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 4 }}>
          <EditablePropertyName
            name={cleanDisplayName(property.propertyName, property.address1, property.city, property.state)}
            propertyId={propertyId}
            onSave={(newName: string) => setProperty((prev: Property | null) => prev ? { ...prev, propertyName: newName } : prev)}
          />
          {hasData && (
            <div className="pd-dl-buttons" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {/*
                Download CTAs: tint each button in its format's canonical hue
                (Excel-green for the XLSX, Word-blue for the brief DOC) so they
                scan as "this is a spreadsheet" / "this is a document" at a
                glance instead of a row of identical grey pills. Soft tinted
                background + matching border keeps them readable and in-brand
                with the lime green accents elsewhere on the page.
              */}
              <button
                onClick={async () => { try { await generateUnderwritingXLSX(property.propertyName, fields, wsType); } catch (e: any) { alert("XLSX failed: " + (e?.message || "unknown")); } }}
                className="dl-btn"
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid #A7F3D0",
                  background: "#ECFDF5",
                  color: "#065F46", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Workbook
                <span style={{ padding: "1px 5px", background: "#D1FAE5", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#065F46" }}>XLSX</span>
              </button>
              <button
                onClick={() => generateBriefDownload(property.propertyName, brief, fields, wsType)}
                className="dl-btn"
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid #BFDBFE",
                  background: "#EFF6FF",
                  color: "#1E40AF", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Brief
                <span style={{ padding: "1px 5px", background: "#DBEAFE", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#1E40AF" }}>DOC</span>
              </button>
              {/* Strategy Analysis - Pro+ only */}
              {userTier === "pro_plus" ? (
                <button
                  onClick={async () => { try { await generateStrategyLensXLSX(property.propertyName, fields, wsType); } catch (e: any) { alert("Strategy XLS failed: " + (e?.message || "unknown")); } }}
                  className="dl-btn"
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    border: `1px solid ${C.ghostBorder}`, background: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
                    color: "#92400E", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Strategy
                  <span style={{ padding: "1px 5px", background: "#FCD34D", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#78350F" }}>PRO+</span>
                </button>
              ) : (
                // Locked state: render as a muted/disabled-looking button so it
                // doesn't compete with the active downloads. Still clickable -
                // the click routes to the upgrade flow - just visually gated.
                <button
                  onClick={() => {
                    if (confirm("Strategy Analysis is a Pro+ feature. Upgrade to unlock detailed Core / Value-Add / Opportunistic analysis for every deal.\n\nGo to upgrade page?")) {
                      window.location.href = "/workspace?upgrade=true";
                    }
                  }}
                  className="dl-btn"
                  title="Upgrade to Pro+ to unlock Strategy Analysis"
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#F3F4F6",
                    color: "#9CA3AF", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                  {/* Lock icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Strategy
                  <span style={{ padding: "1px 5px", background: "#E5E7EB", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#6B7280" }}>PRO+</span>
                </button>
              )}
              {/* Email this property (all tiers) */}
              {user && (
                <EmailPropertyButton
                  property={property}
                  fields={fields}
                  brief={brief}
                  wsType={wsType}
                  scoreTotal={scoreTotal}
                  scoreBand={scoreBand}
                  user={user}
                />
              )}
            </div>
          )}
        </div>
        {location && (
          <div className="pd-prop-location" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>{location}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`} target="_blank" rel="noopener noreferrer"
              title="Open in Google Maps"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, color: C.secondary, textDecoration: "none",
                padding: "3px 10px", background: C.surfLow, borderRadius: 6,
                fontWeight: 500, border: `1px solid ${C.ghostBorder}`,
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Google Maps
            </a>
          </div>
        )}
      </div>

      {/* Model Lens Banner removed — the asset-type is already conveyed
          by the pill overlay on the hero image and the score card, so the
          full-width "Scored with … Model (auto-detected)" row was
          redundant and taking up prime real estate. */}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  MOBILE SCORE + KEY METRICS CARD (hidden on desktop)*/}
      {/* ═══════════════════════════════════════════════════ */}
      {scoreTotal && (() => {
        const b = scoreBand.toLowerCase().replace(/_/g, " ");
        const isGreen = b === "strong buy" || b === "buy";
        const isYellow = b === "hold" || b === "neutral";
        const sColor = isGreen ? "#4D7C0F" : isYellow ? "#D97706" : "#DC2626";
        const mobileCapRate = calc?.capRate ? `${calc.capRate.toFixed(2)}%` : (property.cardCapRate ? `${Number(property.cardCapRate).toFixed(2)}%` : null);
        const mobileSf = property.cardBuildingSf || property.buildingSf;
        const mobileSfStr = mobileSf ? (mobileSf >= 1000 ? `${(mobileSf / 1000).toFixed(mobileSf >= 10000 ? 0 : 1)}K SF` : `${mobileSf.toLocaleString()} SF`) : null;
        return (
          <div className="pd-mobile-score-card">
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {/* Left: Score gauge */}
              <div style={{ flex: "0 0 140px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 12px", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B7280", marginBottom: 8 }}>Signal Score</div>
                <div style={{
                  width: 76, height: 76, borderRadius: "50%", position: "relative",
                  background: `conic-gradient(${sColor} ${(scoreTotal / 100) * 360}deg, rgba(0,0,0,0.06) 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: "50%", background: "#FFFFFF",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: sColor, lineHeight: 1 }}>{Math.round(scoreTotal)}</span>
                  </div>
                </div>
                <span style={{
                  marginTop: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: sColor,
                }}>{((): string => {
                  const key = scoreBand.toLowerCase().replace(/_/g, " ");
                  const map: Record<string, string> = { "strong buy": "Strong Buy", "buy": "Buy", "hold": "Neutral", "neutral": "Neutral", "pass": "Pass", "strong reject": "Strong Reject" };
                  return map[key] || scoreBand.replace(/_/g, " ");
                })()}</span>
              </div>
              {/* Right: Key metrics - stacked */}
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                {mobileCapRate && (
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)", borderRight: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280", marginBottom: 3 }}>Cap Rate</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: "monospace" }}>{mobileCapRate}</div>
                  </div>
                )}
                {mobileSfStr && (
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280", marginBottom: 3 }}>Size</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: "monospace" }}>{mobileSfStr}</div>
                  </div>
                )}
                {property.cardNoi && (
                  <div style={{ padding: "12px 14px", borderRight: mobileCapRate ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280", marginBottom: 3 }}>NOI</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: "monospace" }}>{fmt$(property.cardNoi)}</div>
                  </div>
                )}
                {property.cardAskingPrice && (
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280", marginBottom: 3 }}>Asking Price</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: "monospace" }}>{fmt$(property.cardAskingPrice)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}


      {/* Land metrics strip */}
      {hasData && wsType === "land" && (() => {
        const landMetrics = [
          { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")) },
          { label: "Price / Acre", value: g("pricing_deal_terms", "price_per_acre") ? fmt$(g("pricing_deal_terms", "price_per_acre")) : "--" },
          { label: "Acres", value: g("property_basics", "lot_acres") || "--" },
          { label: "Zoning", value: g("land_zoning", "current_zoning") || "--" },
        ].filter(c => c.value !== "--");
        return (
          <div className="pd-metrics-strip" style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {landMetrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < landMetrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Multifamily metrics strip */}
      {hasData && wsType === "multifamily" && (() => {
        const unitCount = g("multifamily_addons", "unit_count");
        const avgRent = g("multifamily_addons", "avg_rent_per_unit");
        const avgSf = g("multifamily_addons", "avg_sf_per_unit");
        const vacancy = g("multifamily_addons", "vacancy_rate");
        const occupancyVal = vacancy !== null && vacancy !== undefined && vacancy !== "" && !isNaN(Number(vacancy))
          ? `${(100 - Number(vacancy)).toFixed(1)}%`
          : "--";
        const valueAdd = g("multifamily_addons", "value_add_signal");
        const mfMetrics = [
          { label: "Units", value: unitCount ? Number(unitCount).toLocaleString() : "--" },
          { label: "Unit Mix", value: g("multifamily_addons", "unit_mix") || "--" },
          { label: "Avg Rent", value: avgRent ? `${fmt$(avgRent)}/mo` : "--" },
          { label: "Avg SF", value: avgSf ? `${Math.round(Number(avgSf)).toLocaleString()} SF` : "--" },
          { label: "Occupancy", value: occupancyVal },
          { label: "Value-Add", value: valueAdd ? String(valueAdd).replace(/_/g, " ") : "--" },
        ].filter(c => c.value !== "--");
        if (mfMetrics.length === 0) return null;
        return (
          <div className="pd-metrics-strip" style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {mfMetrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < mfMetrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums", textTransform: m.label === "Value-Add" ? "capitalize" : "none" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Industrial metrics strip */}
      {hasData && wsType === "industrial" && (() => {
        const clearHeight = g("industrial_addons", "clear_height");
        const loadingCount = g("industrial_addons", "loading_count");
        const loadingType = g("industrial_addons", "loading_type");
        const officePct = g("industrial_addons", "office_finish_pct");
        const lotAcres = g("industrial_addons", "lot_acres") || g("property_basics", "lot_acres") || g("property_basics", "land_acres");
        const sprinklered = g("industrial_addons", "sprinklered");
        const railServed = g("industrial_addons", "rail_served");
        const rentPerSf = g("industrial_addons", "rent_per_sf");
        const indMetrics = [
          { label: "Clear Height", value: clearHeight ? `${Number(clearHeight).toFixed(0)}'` : "--" },
          { label: "Loading", value: loadingCount && loadingType ? `${loadingCount} ${String(loadingType).replace(/_/g, " ")}` : loadingCount ? String(loadingCount) : "--" },
          { label: "Office Finish", value: officePct !== null && officePct !== undefined && officePct !== "" ? `${Number(officePct).toFixed(0)}%` : "--" },
          { label: "Lot Size", value: lotAcres ? `${Number(lotAcres).toFixed(2)} ac` : "--" },
          { label: "Rent / SF", value: rentPerSf ? `${fmt$(rentPerSf)}/SF` : "--" },
          { label: "Sprinklered", value: sprinklered === true || sprinklered === "true" || sprinklered === "yes" ? "Yes" : sprinklered === false || sprinklered === "false" || sprinklered === "no" ? "No" : "--" },
          { label: "Rail Served", value: railServed === true || railServed === "true" || railServed === "yes" ? "Yes" : railServed === false || railServed === "false" || railServed === "no" ? "No" : "--" },
        ].filter(c => c.value !== "--");
        if (indMetrics.length === 0) return null;
        return (
          <div className="pd-metrics-strip" style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {indMetrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < indMetrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Office metrics strip */}
      {hasData && wsType === "office" && (() => {
        const parkingRatio = g("office_addons", "parking_ratio");
        const suiteCount = g("office_addons", "suite_count");
        const buildingClass = g("office_addons", "building_class");
        const floorCount = g("office_addons", "floor_count");
        const tiLc = g("office_addons", "ti_lc_signal");
        const medical = g("office_addons", "medical_flag");
        const offMetrics = [
          { label: "Class", value: buildingClass ? String(buildingClass).toUpperCase() : "--" },
          { label: "Floors", value: floorCount ? String(floorCount) : "--" },
          { label: "Suites", value: suiteCount ? String(suiteCount) : "--" },
          { label: "Parking Ratio", value: parkingRatio ? `${Number(parkingRatio).toFixed(2)} / 1k SF` : "--" },
          { label: "TI/LC", value: tiLc ? String(tiLc).replace(/_/g, " ") : "--" },
          { label: "Medical", value: medical === true || medical === "true" || medical === "yes" ? "Yes" : medical === false || medical === "false" || medical === "no" ? "No" : "--" },
        ].filter(c => c.value !== "--");
        if (offMetrics.length === 0) return null;
        return (
          <div className="pd-metrics-strip" style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {offMetrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < offMetrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums", textTransform: m.label === "TI/LC" ? "capitalize" : "none" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}


      {/* Sale Price Scenarios panel moved to OM Reverse Pricing tab. */}

      {/* Rent Roll table moved to dedicated Rent Roll tab above. */}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  8. SOURCE DOCUMENTS                                */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{
        background: "#FFFFFF", borderRadius: C.radius, border: `1px solid rgba(0,0,0,0.06)`,
        padding: 20, marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: documents.length > 0 ? 14 : 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>
                Source Documents
              </h3>
              <span style={{ fontSize: 11, color: C.secondary, fontWeight: 500 }}>({documents.length})</span>
              {(reparsing || reparseStatus) && (
                <span style={{ fontSize: 11, color: reparseStatus.includes("failed") || reparseStatus.includes("Could not") ? "#DC2626" : "#2563EB", fontWeight: 500 }}>
                  {reparseStatus || "Scanning..."}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Only show Re-analyze if: property has docs but no extracted fields (scan failed/incomplete) */}
            {documents.length > 0 && !hasData && (
              <button onClick={handleReAnalyze} style={{
                padding: "8px 14px", background: C.surfLow, border: `1px solid rgba(0,0,0,0.06)`,
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: reparsing ? "not-allowed" : "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", color: C.secondary,
                opacity: reparsing ? 0.5 : 1,
              }}>
                {reparsing ? "Scanning..." : "Re-analyze"}
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} style={{
              padding: "8px 18px", background: "#0F172A",
              color: "#ffffff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              boxShadow: `0 2px 8px rgba(15, 23, 42, 0.22)`,
            }}>
              {uploading ? "Uploading..." : "+ Add Files"}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
            onChange={(e: any) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }} />
        </div>

        {/* Accepted file types hint */}
        {documents.length === 0 && (
          <div style={{ padding: "12px 16px", background: "#F9FAFB", borderRadius: 8, marginBottom: 10, border: `1px solid rgba(0,0,0,0.04)` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>What to upload</div>
            <div style={{ fontSize: 11, color: C.secondary, lineHeight: 1.6 }}>
              <strong>Best:</strong> Offering Memorandum (PDF) - one complete OM is enough for a full analysis.
            </div>
            <div style={{ fontSize: 11, color: C.secondary, lineHeight: 1.6 }}>
              <strong>Also accepted:</strong> Flyers, Rent Rolls (XLS), T-12 operating statements, Lease abstracts, Site plans, Property images.
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {["PDF", "XLS", "XLSX", "DOCX", "CSV"].map(ext => (
                <span key={ext} style={{ padding: "2px 6px", background: ext === "PDF" ? "#84CC16" : "#F3F4F6", color: ext === "PDF" ? "#0F172A" : C.secondary, borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {documents.map((doc: ProjectDocument) => {
              const fi = fileIcon(doc.fileExt || "");
              return (
                <button key={doc.id} className="doc-row"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const fileStorageRef = ref(storage, doc.storagePath);
                      const url = await getDownloadURL(fileStorageRef);
                      window.open(url, "_blank");
                    } catch { alert("Could not open file."); }
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "#F9FAFB", borderRadius: 8,
                    border: `1px solid rgba(0,0,0,0.04)`, cursor: "pointer", fontFamily: "inherit",
                    width: "100%", textAlign: "left",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: fi.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: fi.color }}>{fi.label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.onSurface }}>{doc.originalFilename}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.secondary, fontVariantNumeric: "tabular-nums" }}>
                    {doc.fileSizeBytes ? `${(doc.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  9. FEEDBACK MODULE                                 */}
      {/* ═══════════════════════════════════════════════════ */}
      {hasData && (
        <div style={{
          background: "#F3F4F6", borderRadius: C.radius, padding: "16px 24px",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16, textAlign: "center",
        }}>
          {!feedbackSent ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, margin: "0 0 10px" }}>Was this useful?</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setFeedbackSent(true)} style={{
                  padding: "6px 20px", borderRadius: 6, border: `1px solid rgba(0,0,0,0.06)`,
                  background: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Yes</button>
                <button onClick={() => setFeedbackSent(true)} style={{
                  padding: "6px 20px", borderRadius: 6, border: `1px solid rgba(0,0,0,0.06)`,
                  background: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>No</button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Thanks for the feedback.</p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  EMPTY STATE                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      {!hasData && documents.length === 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, border: `2px dashed #D8DFE9`,
          padding: 60, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ fontSize: 16, color: C.onSurface, fontWeight: 600, margin: "0 0 6px" }}>No deal data yet</p>
          <p style={{ fontSize: 13, color: C.secondary, margin: "0 0 8px", maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
            Upload an Offering Memorandum (PDF) to extract pricing, tenancy, income, and lease data automatically.
          </p>
          <p style={{ fontSize: 11, color: C.secondary, margin: "0 0 20px", opacity: 0.7 }}>
            Also accepts: flyers, rent rolls (XLS), T-12s, leases, and property images.
          </p>
          <button onClick={() => fileRef.current?.click()} style={{
            padding: "12px 28px", background: "#0F172A",
            color: "#ffffff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 12px rgba(15, 23, 42, 0.22)`,
          }}>
            Upload Documents
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  DANGER ZONE                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{
        marginTop: 32, marginBottom: 32, padding: "16px 24px",
        background: "#FEF2F2", borderRadius: C.radius, border: "1px solid #FECACA",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", marginBottom: 2 }}>Delete Deal</div>
          <div style={{ fontSize: 12, color: "#DC2626" }}>Permanently remove this deal and all associated data.</div>
        </div>
        <button onClick={async (e) => {
          if (!confirm(`Delete "${property.propertyName}"? This cannot be undone.`)) return;
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = "Deleting...";
          btn.style.opacity = "0.6";
          try {
            await deleteProperty(propertyId, property.projectId || "workspace-default");
            window.dispatchEvent(new Event("workspace-properties-changed"));
            // Brief visual confirmation before redirect
            btn.textContent = "Deleted";
            btn.style.background = "#059669";
            setTimeout(() => { window.location.href = "/workspace"; }, 400);
          } catch (err) {
            console.error("[delete] Failed:", err);
            btn.disabled = false;
            btn.textContent = "Delete Deal";
            btn.style.opacity = "1";
            alert("Failed to delete deal. Please try again.");
          }
        }} style={{
          padding: "8px 20px", background: "#DC2626", color: "#fff", border: "none",
          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
          transition: "all 0.2s ease",
        }}>
          Delete Deal
        </button>
      </div>
    </div>
  );
}
