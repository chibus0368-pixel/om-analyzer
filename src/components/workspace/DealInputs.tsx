"use client";

/**
 * Deal Inputs - the single manual-data surface for a property.
 *
 * Why this exists: extraction is never perfect. Before this module, an OM
 * that parsed without an asking price (or without a unit count / SF / acreage)
 * produced three separate dead-end cards that told the user to "re-upload a
 * more detailed OM". That is a wall, not a workflow. Every analysis in the
 * app runs off the same tiny set of core numbers, so the fix is one shared
 * layer that lets the user type those numbers wherever they hit the wall,
 * and edit them later when extraction got something wrong.
 *
 * Three surfaces, one schema:
 *   1. InputsNeededCard - drops into the spot where an analysis would have
 *      shown an empty state. Lists exactly what's missing, with the fields
 *      already known checked off, and runs the analysis the moment the
 *      blanks are filled.
 *   2. DealInputsDrawer - always-available editor for every core input,
 *      whether or not it's blank. Shows where each value came from and lets
 *      the user revert an edit back to the OM value.
 *   3. DealInputsButton - the persistent entry point, with a badge when
 *      required inputs are missing.
 *
 * Persistence is delegated to the page via onSaveFields / onRevertField so
 * this module stays free of Firestore imports and can be dropped into any
 * tab component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Property, ExtractedField } from "@/lib/workspace/types";

/* ── Design tokens (shared with the analysis tabs) ─────── */
const C = {
  primary: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  amber: "#D97706",
  amberBg: "#FFFBEB",
  blue: "#2563EB",
  radius: 12,
};

/* ══════════════════════════════════════════════════════════ */
/*  SCHEMA                                                    */
/* ══════════════════════════════════════════════════════════ */

export type InputFmt = "dollar" | "pct" | "number" | "text";
export type InputSection = "pricing" | "size" | "income" | "assumptions";

export interface DealInputDef {
  /** `${group}.${name}` - stable identity for React keys and change maps. */
  key: string;
  group: string;
  name: string;
  label: string;
  fmt: InputFmt;
  section: InputSection;
  /** Analysis cannot run without this one. */
  required?: boolean;
  /** Short "why we ask" line shown under the field in the drawer. */
  hint?: string;
  placeholder?: string;
  /** Other field names in the same group that also satisfy this input. */
  altNames?: string[];
  /** Property-doc fallbacks, checked in order, when no field row exists. */
  propKeys?: string[];
  /** Suffix rendered inside the input (e.g. "SF", "acres", "units"). */
  suffix?: string;
}

const SECTION_META: Record<InputSection, { label: string; blurb: string }> = {
  pricing: { label: "Pricing", blurb: "What the seller is asking and how it's priced." },
  size: { label: "Size & Physical", blurb: "The denominator for every per-unit metric." },
  income: { label: "Income", blurb: "What the property actually earns today." },
  assumptions: { label: "Broker Assumptions", blurb: "The OM's own projections, used only to critique them. Your underwriting baseline lives in workspace settings." },
};

function def(d: Omit<DealInputDef, "key">): DealInputDef {
  return { ...d, key: `${d.group}.${d.name}` };
}

/**
 * The core input set, specialized by asset type. Only `required: true`
 * entries gate analysis; everything else sharpens it.
 */
export function getDealInputDefs(assetType: string | undefined | null): DealInputDef[] {
  const t = (assetType || "").toLowerCase();
  const isLand = t === "land";
  const isMf = t === "multifamily";

  const pricing: DealInputDef[] = [
    def({
      group: "pricing_deal_terms", name: "asking_price", label: "Asking Price",
      fmt: "dollar", section: "pricing", required: true,
      placeholder: "14,500,000", propKeys: ["cardAskingPrice"],
      hint: "The number every scenario is priced against. Type 14.5m as shorthand.",
    }),
    def({
      group: "pricing_deal_terms", name: "cap_rate_om", label: "Cap Rate (as marketed)",
      fmt: "pct", section: "pricing", placeholder: "6.5", propKeys: ["cardCapRate"],
      hint: "The broker's stated cap. We check it against your own NOI, not the other way round.",
    }),
  ];

  const size: DealInputDef[] = [];
  if (isLand) {
    size.push(def({
      group: "property_basics", name: "lot_acres", label: "Acres",
      fmt: "number", section: "size", required: true, suffix: "acres",
      placeholder: "12.4", altNames: ["land_acres", "usable_acres", "lot_size"],
      propKeys: ["landAcres", "cardTotalAcres"],
      hint: "Land is priced per acre, so this is the size input that unlocks the math.",
    }));
    size.push(def({
      group: "property_basics", name: "usable_acres", label: "Usable Acres",
      fmt: "number", section: "size", suffix: "acres", placeholder: "9.8",
      hint: "Net of wetlands, easements, and setbacks. Drives buildable-acre pricing.",
    }));
    size.push(def({
      group: "property_basics", name: "zoning", label: "Zoning",
      fmt: "text", section: "size", placeholder: "C-2 / PUD",
    }));
  } else if (isMf) {
    size.push(def({
      group: "multifamily_addons", name: "unit_count", label: "Unit Count",
      fmt: "number", section: "size", required: true, suffix: "units",
      placeholder: "180", propKeys: ["suiteCount"],
      hint: "Multifamily is priced per unit, so this is the size input that unlocks the math.",
    }));
    size.push(def({
      group: "property_basics", name: "building_sf", label: "Building SF",
      fmt: "number", section: "size", suffix: "SF", placeholder: "162,000",
      propKeys: ["buildingSf", "cardBuildingSf"],
    }));
  } else {
    size.push(def({
      group: "property_basics", name: "building_sf", label: "Building SF",
      fmt: "number", section: "size", required: true, suffix: "SF",
      placeholder: "24,500", propKeys: ["buildingSf", "cardBuildingSf"],
      hint: "The denominator for price/SF, rent/SF, and replacement-cost checks.",
    }));
  }

  size.push(def({
    group: "property_basics", name: "year_built", label: "Year Built",
    fmt: "number", section: "size", placeholder: "1998", propKeys: ["yearBuilt"],
    hint: "Sets the CapEx reserve floor. Older assets get charged more.",
  }));
  if (!isLand) {
    size.push(def({
      group: "property_basics", name: "occupancy_pct", label: "Occupancy",
      fmt: "pct", section: "size", placeholder: "95", propKeys: ["occupancyPct"],
    }));
  }

  const income: DealInputDef[] = isLand ? [] : [
    def({
      group: "expenses", name: "noi_om", label: "NOI (as marketed)",
      fmt: "dollar", section: "income", placeholder: "940,000",
      altNames: ["noi_adjusted"], propKeys: ["cardNoi"],
      hint: "Year-1 NOI the OM leads with. Leave blank and we'll derive it from price and cap.",
    }),
    def({
      group: "expenses", name: "noi_t12", label: "NOI (trailing 12)",
      fmt: "dollar", section: "income", placeholder: "870,000",
      hint: "Actual trailing performance. The single most useful number you can add.",
    }),
    def({
      group: "expenses", name: "noi_pro_forma", label: "NOI (pro forma)",
      fmt: "dollar", section: "income", placeholder: "1,050,000",
    }),
    def({
      group: "expenses", name: "gross_rent", label: "Gross Rent",
      fmt: "dollar", section: "income", placeholder: "1,100,000",
    }),
    ...(isMf ? [def({
      group: "multifamily_addons", name: "avg_rent_per_unit", label: "Avg Rent / Unit",
      fmt: "dollar", section: "income", placeholder: "1,450", suffix: "/mo",
    })] : []),
  ];

  const assumptions: DealInputDef[] = [
    def({ group: "projections", name: "rent_growth", label: "Rent Growth", fmt: "pct", section: "assumptions", placeholder: "3.0" }),
    def({ group: "projections", name: "expense_growth", label: "Expense Growth", fmt: "pct", section: "assumptions", placeholder: "2.5" }),
    def({ group: "projections", name: "exit_cap", label: "Exit Cap", fmt: "pct", section: "assumptions", placeholder: "6.75" }),
    def({ group: "projections", name: "vacancy", label: "Vacancy", fmt: "pct", section: "assumptions", placeholder: "5.0" }),
  ];

  return [...pricing, ...size, ...income, ...assumptions];
}

/* ══════════════════════════════════════════════════════════ */
/*  VALUE READING                                             */
/* ══════════════════════════════════════════════════════════ */

export type ValueSource = "om" | "manual" | "property" | "none";

export interface InputValue {
  value: string | null;
  source: ValueSource;
  /** The field row backing this value, when one exists. */
  field?: ExtractedField;
  /** The extracted value sitting underneath a user override, if different. */
  omValue?: string | null;
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || s === "--" || s === "0" || s === "N/A";
}

export function readInput(
  fields: ExtractedField[],
  property: Property | null | undefined,
  d: DealInputDef,
): InputValue {
  const names = [d.name, ...(d.altNames || [])];
  for (const n of names) {
    const f = fields.find(x => x.fieldGroup === d.group && x.fieldName === n);
    if (!f) continue;
    const under = f.normalizedValue ?? f.rawValue;
    const active = f.isUserOverridden ? f.userOverrideValue : under;
    if (isBlank(active)) continue;
    return {
      value: String(active),
      source: f.isUserOverridden ? "manual" : "om",
      field: f,
      omValue: isBlank(under) ? null : String(under),
    };
  }
  for (const pk of d.propKeys || []) {
    const pv = (property as any)?.[pk];
    if (!isBlank(pv)) return { value: String(pv), source: "property" };
  }
  return { value: null, source: "none" };
}

export interface InputsStatus {
  defs: DealInputDef[];
  values: Record<string, InputValue>;
  missingRequired: DealInputDef[];
  filledCount: number;
  totalCount: number;
}

export function readAllInputs(
  fields: ExtractedField[],
  property: Property | null | undefined,
  assetType?: string | null,
): InputsStatus {
  const defs = getDealInputDefs(assetType ?? (property as any)?.analysisType);
  const values: Record<string, InputValue> = {};
  let filled = 0;
  for (const d of defs) {
    const v = readInput(fields, property, d);
    values[d.key] = v;
    if (v.value) filled++;
  }
  return {
    defs,
    values,
    missingRequired: defs.filter(d => d.required && !values[d.key].value),
    filledCount: filled,
    totalCount: defs.length,
  };
}

/* ══════════════════════════════════════════════════════════ */
/*  NUMBER PARSING + FORMATTING                               */
/* ══════════════════════════════════════════════════════════ */

/**
 * Forgiving number parser. People paste "$14.5M", type "14,500,000", or
 * hammer out "1.2k". All three should mean the same thing rather than
 * bouncing with a validation error.
 */
export function parseLooseNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[$,\s%]/g, "");
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)([kmb])?$/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === "k") n *= 1_000;
  else if (m[2] === "m") n *= 1_000_000;
  else if (m[2] === "b") n *= 1_000_000_000;
  return n;
}

export function formatForFmt(n: number, fmt: InputFmt): string {
  if (fmt === "dollar") {
    return n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
      : `$${Math.round(n).toLocaleString()}`;
  }
  if (fmt === "pct") return `${n}%`;
  return Math.round(n) === n ? n.toLocaleString() : n.toLocaleString();
}

/** Human echo shown under an input so the user can see what we parsed. */
function echoFor(raw: string, d: DealInputDef): string | null {
  if (!raw.trim() || d.fmt === "text") return null;
  const n = parseLooseNumber(raw);
  if (n === null) return "Not a number we can read";
  const formatted = formatForFmt(n, d.fmt);
  // Only echo when the parse did real work (shorthand, commas, symbols).
  if (formatted.replace(/[$,%]/g, "") === raw.trim().replace(/[$,%]/g, "")) return null;
  return `Reads as ${formatted}${d.suffix && d.fmt !== "pct" ? ` ${d.suffix}` : ""}`;
}

/** The canonical string we persist: plain digits, no symbols. */
function toStoredValue(raw: string, d: DealInputDef): string {
  if (d.fmt === "text") return raw.trim();
  const n = parseLooseNumber(raw);
  return n === null ? raw.trim() : String(n);
}

/**
 * What goes inside the input box. The "$" prefix and "%" suffix are drawn
 * as adornments beside the field, so the value itself must not carry them
 * or you get "$$14,500,000" and "6.5%%".
 */
function inputDisplay(v: string, d: DealInputDef): string {
  if (d.fmt === "text") return v;
  const n = parseLooseNumber(v);
  if (n === null) return v;
  return d.fmt === "pct" ? String(n) : n.toLocaleString();
}

/** What goes in read-only chips and labels: fully formatted, symbols on. */
function displayValue(v: string, d: DealInputDef): string {
  if (d.fmt === "text") return v;
  const n = parseLooseNumber(v);
  if (n === null) return v;
  if (d.fmt === "dollar") return `$${Math.round(n).toLocaleString()}`;
  if (d.fmt === "pct") return `${n}%`;
  return n.toLocaleString();
}

/* ══════════════════════════════════════════════════════════ */
/*  SHARED PIECES                                             */
/* ══════════════════════════════════════════════════════════ */

export function SourceChip({ source }: { source: ValueSource }) {
  if (source === "none") {
    return (
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
        padding: "2px 6px", borderRadius: 4, background: C.amberBg, color: "#92400E",
      }}>Missing</span>
    );
  }
  const isManual = source === "manual";
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
      padding: "2px 6px", borderRadius: 4,
      background: isManual ? "#DBEAFE" : "#EEF2FF",
      color: isManual ? "#1E40AF" : "#4338CA",
    }}>{isManual ? "You added" : "From OM"}</span>
  );
}

/** One labelled input with unit adornment, parse echo, and revert. */
function InputRow({
  d, current, draft, onChange, onRevert, autoFocus, onEnter, compact,
}: {
  d: DealInputDef;
  current: InputValue;
  draft: string | undefined;
  onChange: (v: string) => void;
  onRevert?: () => void;
  autoFocus?: boolean;
  onEnter?: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Focus and scroll together. Opening the drawer on a specific field
  // (from a "+ Building SF" chip, say) should land the cursor in that
  // field, not leave the user hunting for it in a long list.
  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* older browsers */ }
  }, [autoFocus]);

  const shown = draft !== undefined ? draft : (current.value ? inputDisplay(current.value, d) : "");
  const dirty = draft !== undefined && toStoredValue(draft, d) !== (current.value || "");
  const echo = draft !== undefined ? echoFor(draft, d) : null;
  const canRevert = !!onRevert && current.source === "manual" && !!current.omValue;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
        <label htmlFor={`di-${d.key}`} style={{ fontSize: 12, fontWeight: 600, color: C.onSurface }}>
          {d.label}
        </label>
        {d.required && <span title="Required to run the analysis" style={{ color: C.amber, fontSize: 12, lineHeight: 1 }}>*</span>}
        {!compact && <SourceChip source={dirty ? "manual" : current.source} />}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        border: `1px solid ${dirty ? C.primary : "rgba(0,0,0,0.12)"}`,
        background: dirty ? "rgba(77,124,15,0.04)" : C.surfLowest,
        borderRadius: 8, padding: "0 10px",
        transition: "border-color 0.15s, background 0.15s",
      }}>
        {d.fmt === "dollar" && <span style={{ fontSize: 13, color: C.secondary, flexShrink: 0 }}>$</span>}
        <input
          id={`di-${d.key}`}
          ref={ref}
          type="text"
          inputMode={d.fmt === "text" ? "text" : "decimal"}
          value={shown}
          placeholder={d.placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); onEnter?.(); }
          }}
          style={{
            flex: 1, minWidth: 0, fontSize: 13, padding: "9px 0",
            border: "none", outline: "none", background: "transparent",
            fontFamily: "inherit", color: C.onSurface, fontVariantNumeric: "tabular-nums",
          }}
        />
        {d.fmt === "pct" && <span style={{ fontSize: 13, color: C.secondary, flexShrink: 0 }}>%</span>}
        {d.suffix && d.fmt !== "pct" && (
          <span style={{ fontSize: 11, color: C.secondary, flexShrink: 0 }}>{d.suffix}</span>
        )}
      </div>

      {(echo || (!compact && d.hint) || canRevert) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {echo && <span style={{ fontSize: 11, color: echo.startsWith("Not") ? "#DC2626" : C.primary, fontWeight: 600 }}>{echo}</span>}
          {!echo && !compact && d.hint && (
            <span style={{ fontSize: 11, color: C.secondary, lineHeight: 1.4 }}>{d.hint}</span>
          )}
          {canRevert && (
            <button
              type="button"
              onClick={onRevert}
              style={{
                fontSize: 11, color: C.blue, background: "none", border: "none", padding: 0,
                cursor: "pointer", fontFamily: "inherit", fontWeight: 600, textDecoration: "underline",
              }}
            >
              Revert to OM ({displayValue(current.omValue as string, d)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*  SHARED HANDLER CONTRACT                                   */
/* ══════════════════════════════════════════════════════════ */

export interface DealInputsHandlers {
  /** Persist a batch of values. One write pass, one re-score. */
  onSaveFields?: (entries: { group: string; name: string; value: string }[]) => Promise<void>;
  /** Drop a user override so the extracted value takes over again. */
  onRevertField?: (group: string, name: string) => Promise<void>;
  /** Open the full Deal Inputs editor. */
  onOpenAllInputs?: () => void;
  /** Open the file picker so the user can add a better document instead. */
  onUploadDocs?: () => void;
}

/* Price / cap / NOI form a triangle: any two give the third. When the user
 * has supplied two, offering the third as one click beats making them do
 * the arithmetic in another tab. */
function deriveTriangle(
  get: (key: string) => string,
): { key: string; label: string; value: number; from: string } | null {
  const price = parseLooseNumber(get("pricing_deal_terms.asking_price"));
  const cap = parseLooseNumber(get("pricing_deal_terms.cap_rate_om"));
  const noi = parseLooseNumber(get("expenses.noi_om"));
  const ok = (n: number | null) => n !== null && n > 0;

  if (ok(price) && ok(cap) && !ok(noi)) {
    return { key: "expenses.noi_om", label: "NOI", value: Math.round((price as number) * (cap as number) / 100), from: "asking price x cap rate" };
  }
  if (ok(price) && ok(noi) && !ok(cap)) {
    return { key: "pricing_deal_terms.cap_rate_om", label: "Cap rate", value: Math.round((noi as number) / (price as number) * 10000) / 100, from: "NOI / asking price" };
  }
  if (ok(cap) && ok(noi) && !ok(price)) {
    return { key: "pricing_deal_terms.asking_price", label: "Asking price", value: Math.round((noi as number) / ((cap as number) / 100)), from: "NOI / cap rate" };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════ */
/*  1. INPUTS NEEDED CARD                                     */
/*     Renders where an analysis would otherwise dead-end.    */
/* ══════════════════════════════════════════════════════════ */

export interface InputsNeededCardProps extends DealInputsHandlers {
  property: Property;
  fields: ExtractedField[];
  /** e.g. "Offer Scenarios" */
  analysisName: string;
  /** One line on what the analysis will give them once it runs. */
  promise?: string;
  icon?: string;
  /** Optional extras surfaced under "sharpens the read". */
  extraKeys?: string[];
}

export function InputsNeededCard({
  property, fields, analysisName, promise, icon = "🧮", extraKeys,
  onSaveFields, onRevertField, onOpenAllInputs, onUploadDocs,
}: InputsNeededCardProps) {
  const status = useMemo(
    () => readAllInputs(fields, property, (property as any)?.analysisType),
    [fields, property],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const required = status.defs.filter(d => d.required);

  // The optional inputs worth nudging: caller-specified, else the cap /
  // NOI pair that makes the first pass meaningfully better.
  const extras = useMemo(() => {
    const keys = extraKeys && extraKeys.length
      ? extraKeys
      : ["pricing_deal_terms.cap_rate_om", "expenses.noi_om", "property_basics.year_built", "property_basics.occupancy_pct"];
    return status.defs.filter(d => keys.includes(d.key) && !d.required);
  }, [status.defs, extraKeys]);

  const getEffective = useCallback((key: string) => {
    if (drafts[key] !== undefined) return drafts[key];
    return status.values[key]?.value || "";
  }, [drafts, status.values]);

  const stillMissing = required.filter(d => !parseLooseNumber(getEffective(d.key)) && !getEffective(d.key).trim());
  const readyToRun = stillMissing.length === 0;
  const triangle = deriveTriangle(getEffective);

  const dirtyEntries = useMemo(() => {
    const out: { group: string; name: string; value: string }[] = [];
    for (const d of status.defs) {
      const raw = drafts[d.key];
      if (raw === undefined) continue;
      const stored = toStoredValue(raw, d);
      if (!stored || stored === (status.values[d.key].value || "")) continue;
      out.push({ group: d.group, name: d.name, value: stored });
    }
    return out;
  }, [drafts, status.defs, status.values]);

  async function run() {
    if (!onSaveFields || dirtyEntries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveFields(dirtyEntries);
      setDrafts({});
      setEditingKey(null);
    } catch (e: any) {
      setError(e?.message || "Could not save those values. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const firstMissingKey = stillMissing[0]?.key;

  return (
    <div style={{
      background: C.surfLowest, border: `1px solid ${C.ghost}`,
      borderRadius: C.radius, padding: 0, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
    }}>
      {/* Header: what's blocked and how close we are */}
      <div style={{
        padding: "18px 20px 16px",
        background: "linear-gradient(180deg, #FCFDFB 0%, #FFFFFF 100%)",
        borderBottom: `1px solid ${C.ghostBorder}`,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 22, lineHeight: 1.2 }} aria-hidden>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 4 }}>
              {stillMissing.length === 0
                ? `${analysisName} is ready to run`
                : `Add ${stillMissing.length} number${stillMissing.length === 1 ? "" : "s"} to run ${analysisName}`}
            </div>
            <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5 }}>
              {promise || "Fill these in and the analysis runs immediately."} Anything you type is saved to this deal and used everywhere, and a future re-scan won&apos;t overwrite it.
            </div>
          </div>
          <div style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.secondary,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingTop: 2,
          }}>
            {required.length - stillMissing.length} / {required.length} ready
          </div>
        </div>

        {/* Progress segments - one per required input */}
        <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {required.map(d => {
            const done = !!getEffective(d.key).trim();
            return (
              <div key={d.key} title={d.label} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: done ? C.primary : "rgba(0,0,0,0.08)",
                transition: "background 0.2s",
              }} />
            );
          })}
        </div>
      </div>

      {/* Body: required inputs */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {required.map(d => {
            const cur = status.values[d.key];
            const isEditing = editingKey === d.key || !cur.value || drafts[d.key] !== undefined;
            if (!isEditing) {
              // Already known: show it, checked off, one click from editing.
              return (
                <div key={d.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8,
                  background: "#F7FEE7", border: "1px solid rgba(77,124,15,0.18)",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {d.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                      {displayValue(cur.value as string, d)}{d.suffix && d.fmt !== "pct" ? ` ${d.suffix}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingKey(d.key); setDrafts(p => ({ ...p, [d.key]: inputDisplay(cur.value as string, d) })); }}
                    style={{
                      fontSize: 11, fontWeight: 600, color: C.blue, background: "none",
                      border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, flexShrink: 0,
                    }}
                  >Edit</button>
                </div>
              );
            }
            return (
              <InputRow
                key={d.key}
                d={d}
                current={cur}
                draft={drafts[d.key]}
                autoFocus={d.key === firstMissingKey}
                onChange={v => setDrafts(p => ({ ...p, [d.key]: v }))}
                onEnter={() => { if (readyToRun) run(); }}
                onRevert={onRevertField ? () => onRevertField(d.group, d.name) : undefined}
              />
            );
          })}
        </div>

        {/* Derived-value nudge: two of price / cap / NOI gives the third */}
        {triangle && (
          <button
            type="button"
            onClick={() => {
              const d = status.defs.find(x => x.key === triangle.key);
              if (d) setDrafts(p => ({ ...p, [triangle.key]: inputDisplay(String(triangle.value), d) }));
              setShowExtras(true);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 14, width: "100%",
              padding: "9px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
              background: "#EFF6FF", border: "1px solid rgba(37,99,235,0.18)", fontFamily: "inherit",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" />
            </svg>
            <span style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.4 }}>
              <strong>{triangle.label} works out to {formatForFmt(triangle.value, triangle.key.includes("cap_rate") ? "pct" : "dollar")}</strong>
              {" "}from {triangle.from}. Click to fill it in.
            </span>
          </button>
        )}

        {/* Optional inputs that sharpen the read */}
        {extras.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowExtras(s => !s)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, background: "none",
                border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, color: C.secondary,
                textTransform: "uppercase", letterSpacing: 0.6,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showExtras ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
              Optional, but sharpens the read
            </button>
            {showExtras && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 12 }}>
                {extras.map(d => (
                  <InputRow
                    key={d.key}
                    d={d}
                    current={status.values[d.key]}
                    draft={drafts[d.key]}
                    compact
                    onChange={v => setDrafts(p => ({ ...p, [d.key]: v }))}
                    onEnter={() => { if (readyToRun) run(); }}
                    onRevert={onRevertField ? () => onRevertField(d.group, d.name) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={run}
            disabled={!readyToRun || saving || dirtyEntries.length === 0}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: readyToRun && dirtyEntries.length > 0 ? C.onSurface : "rgba(15,23,43,0.12)",
              color: readyToRun && dirtyEntries.length > 0 ? "#fff" : "rgba(15,23,43,0.45)",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: readyToRun && dirtyEntries.length > 0 && !saving ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", gap: 8,
              transition: "background 0.15s",
            }}
          >
            {saving && (
              <span style={{
                width: 13, height: 13, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.45)", borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite", display: "inline-block",
              }} />
            )}
            {saving ? "Running..." : `Run ${analysisName}`}
          </button>

          {onOpenAllInputs && (
            <button
              type="button"
              onClick={onOpenAllInputs}
              style={{
                padding: "10px 16px", borderRadius: 8, background: "#fff",
                border: `1px solid rgba(0,0,0,0.12)`, fontSize: 13, fontWeight: 600,
                color: C.onSurface, cursor: "pointer", fontFamily: "inherit",
              }}
            >Edit all deal inputs</button>
          )}

          {onUploadDocs && (
            <button
              type="button"
              onClick={onUploadDocs}
              style={{
                padding: "10px 4px", background: "none", border: "none",
                fontSize: 12, fontWeight: 600, color: C.secondary,
                cursor: "pointer", fontFamily: "inherit", textDecoration: "underline",
              }}
            >or add a document</button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*  2. DEAL INPUTS DRAWER                                     */
/*     Always available, whether or not anything is missing.  */
/* ══════════════════════════════════════════════════════════ */

export interface DealInputsDrawerProps extends DealInputsHandlers {
  open: boolean;
  onClose: () => void;
  property: Property;
  fields: ExtractedField[];
  /** Scroll straight to this input and focus it. */
  focusKey?: string | null;
}

export function DealInputsDrawer({
  open, onClose, property, fields, focusKey,
  onSaveFields, onRevertField, onUploadDocs,
}: DealInputsDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const status = useMemo(
    () => readAllInputs(fields, property, (property as any)?.analysisType),
    [fields, property],
  );

  const dirtyEntries = useMemo(() => {
    const out: { group: string; name: string; value: string }[] = [];
    for (const d of status.defs) {
      const raw = drafts[d.key];
      if (raw === undefined) continue;
      const stored = toStoredValue(raw, d);
      // Empty is not a change: saving blank would be a no-op downstream, so
      // counting it would make the Save button lie about what it will do.
      // Undoing an edit is what "Revert to OM" is for.
      if (!stored || stored === (status.values[d.key].value || "")) continue;
      out.push({ group: d.group, name: d.name, value: stored });
    }
    return out;
  }, [drafts, status.defs, status.values]);

  const close = useCallback(() => {
    setDrafts({});
    setError(null);
    onClose();
  }, [onClose]);

  // Esc closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  useEffect(() => { if (!open) { setDrafts({}); setError(null); } }, [open]);

  async function save() {
    if (!onSaveFields || dirtyEntries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveFields(dirtyEntries);
      setDrafts({});
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2600);
    } catch (e: any) {
      setError(e?.message || "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !open) return null;

  const sections: InputSection[] = ["pricing", "size", "income", "assumptions"];
  const missing = status.missingRequired;

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deal inputs"
      style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", justifyContent: "flex-end" }}
    >
      {/* Backdrop */}
      <div
        onClick={close}
        style={{ position: "absolute", inset: 0, background: "rgba(13,13,20,0.42)", backdropFilter: "blur(2px)" }}
      />

      {/* Panel */}
      <div
        className="di-panel"
        style={{
          position: "relative",
          width: "min(460px, 100vw)",
          height: "100%",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(15,23,43,0.16)",
          animation: "diSlideIn 0.22s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.ghost}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.onSurface }}>Deal Inputs</div>
              <div style={{ fontSize: 12, color: C.secondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {property.propertyName || property.address1 || "This deal"}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close deal inputs"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 6,
                borderRadius: 6, lineHeight: 0, flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{ fontSize: 12, color: C.secondary, marginTop: 10, lineHeight: 1.5 }}>
            Edit anything the scan got wrong, or fill in what it missed. Your values take
            priority over extracted ones and survive a re-scan.
          </div>

          {missing.length > 0 && (
            <div style={{
              marginTop: 12, padding: "9px 12px", borderRadius: 8,
              background: C.amberBg, border: "1px solid rgba(217,119,6,0.22)",
              fontSize: 12, color: "#92400E", lineHeight: 1.45,
            }}>
              <strong>Analysis is blocked</strong> until you add{" "}
              {missing.map((m, i) => (
                <span key={m.key}>
                  {i > 0 ? (i === missing.length - 1 ? " and " : ", ") : ""}
                  <strong>{m.label.toLowerCase()}</strong>
                </span>
              ))}.
            </div>
          )}
        </div>

        {/* Scrolling body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px", overscrollBehavior: "contain" }}>
          {sections.map(sec => {
            const defs = status.defs.filter(d => d.section === sec);
            if (defs.length === 0) return null;
            return (
              <div key={sec} style={{ marginTop: 18 }}>
                <div style={{
                  position: "sticky", top: 0, background: "#fff", paddingTop: 4, paddingBottom: 8, zIndex: 1,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, color: C.primary,
                    textTransform: "uppercase", letterSpacing: 0.7,
                  }}>{SECTION_META[sec].label}</div>
                  <div style={{ fontSize: 11, color: C.secondary, marginTop: 3, lineHeight: 1.45 }}>
                    {SECTION_META[sec].blurb}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {defs.map(d => (
                    <InputRow
                      key={d.key}
                      d={d}
                      current={status.values[d.key]}
                      draft={drafts[d.key]}
                      autoFocus={focusKey === d.key}
                      onChange={v => setDrafts(p => ({ ...p, [d.key]: v }))}
                      onEnter={save}
                      onRevert={onRevertField ? async () => {
                        setDrafts(p => { const n = { ...p }; delete n[d.key]; return n; });
                        await onRevertField(d.group, d.name);
                      } : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {onUploadDocs && (
            <div style={{
              marginTop: 24, padding: "12px 14px", borderRadius: 8,
              background: "#FAFAFA", border: "1px dashed rgba(0,0,0,0.10)",
            }}>
              <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5 }}>
                Have a rent roll, T-12, or a fuller OM?{" "}
                <button
                  type="button"
                  onClick={onUploadDocs}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: C.primary,
                    textDecoration: "underline",
                  }}
                >Add a document</button>{" "}
                and we&apos;ll fill the rest in for you.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: "12px 20px",
          borderTop: `1px solid ${C.ghost}`, background: "#FCFCFD",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <button
            type="button"
            onClick={save}
            disabled={dirtyEntries.length === 0 || saving}
            style={{
              flex: 1, padding: "11px 18px", borderRadius: 8, border: "none",
              background: dirtyEntries.length > 0 ? C.onSurface : "rgba(15,23,43,0.10)",
              color: dirtyEntries.length > 0 ? "#fff" : "rgba(15,23,43,0.42)",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: dirtyEntries.length > 0 && !saving ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {saving && (
              <span style={{
                width: 13, height: 13, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.45)", borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite", display: "inline-block",
              }} />
            )}
            {saving
              ? "Saving and recalculating..."
              : dirtyEntries.length === 0
                ? (savedAt ? "Saved. Analysis updated." : "No changes yet")
                : `Save ${dirtyEntries.length} change${dirtyEntries.length === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={close}
            style={{
              padding: "11px 16px", borderRadius: 8, background: "#fff",
              border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, fontWeight: 600,
              color: C.onSurface, cursor: "pointer", fontFamily: "inherit",
            }}
          >{dirtyEntries.length > 0 ? "Discard" : "Done"}</button>
        </div>

        {error && (
          <div style={{
            position: "absolute", left: 20, right: 20, bottom: 70,
            padding: "9px 12px", borderRadius: 8, background: "#FEF2F2",
            border: "1px solid rgba(220,38,38,0.24)", fontSize: 12, color: "#991B1B",
          }}>{error}</div>
        )}
      </div>

      <style>{`
        @keyframes diSlideIn { from { transform: translateX(24px); opacity: 0.4; } to { transform: none; opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 520px) {
          .di-panel { width: 100vw !important; }
        }
      `}</style>
    </div>
  );

  return createPortal(body, document.body);
}

/* ══════════════════════════════════════════════════════════ */
/*  3. ENTRY POINT BUTTON                                     */
/* ══════════════════════════════════════════════════════════ */

export function DealInputsButton({
  property, fields, onClick, compact,
}: {
  property: Property;
  fields: ExtractedField[];
  onClick: () => void;
  compact?: boolean;
}) {
  const status = useMemo(
    () => readAllInputs(fields, property, (property as any)?.analysisType),
    [fields, property],
  );
  const missingRequired = status.missingRequired.length;
  const blanks = status.totalCount - status.filledCount;

  return (
    <button
      type="button"
      onClick={onClick}
      title="Add or edit the numbers this deal is analyzed on"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: compact ? "6px 10px" : "7px 12px",
        borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        background: missingRequired > 0 ? C.amberBg : "#fff",
        border: `1px solid ${missingRequired > 0 ? "rgba(217,119,6,0.35)" : "rgba(0,0,0,0.12)"}`,
        color: missingRequired > 0 ? "#92400E" : C.onSurface,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      {compact ? "Inputs" : "Deal Inputs"}
      {missingRequired > 0 ? (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999,
          background: "rgba(217,119,6,0.16)",
        }}>{missingRequired} needed</span>
      ) : blanks > 0 ? (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
          background: "rgba(0,0,0,0.05)", color: C.secondary,
        }}>{blanks} blank</span>
      ) : null}
    </button>
  );
}
