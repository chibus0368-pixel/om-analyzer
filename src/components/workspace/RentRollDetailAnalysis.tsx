"use client";

/**
 * RentRollDetailAnalysis
 *
 * Sits directly under the Rent Roll table in the Rent Roll tab.
 *
 * Rules:
 *   - Do NOT fabricate data. No placeholder values dressed up as numbers.
 *   - Each section renders only when the underlying data is sufficient to
 *     produce a real, defensible number. Otherwise the section is suppressed.
 *   - If nothing can be computed, the whole panel collapses to a single
 *     one-line notice.
 *
 * Implements the asset-type-aware master prompt: core metrics, rollover,
 * mark-to-market, concentration, WALT, asset-specific flags, MTM exposure,
 * data-quality grade, quick take.
 */

import { useMemo } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";

/* Design tokens */
const C = {
  primary: "#84CC16",
  primaryText: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  good: "#059669",
  warn: "#D97706",
  bad: "#DC2626",
  info: "#2563EB",
  radius: 12,
};

/* Helpers */
function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmt$(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "";
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${Math.round(val).toLocaleString()}`;
  return `$${val.toFixed(0)}`;
}
function fmtPct(val: number | null | undefined, digits = 1): string {
  if (val == null || !Number.isFinite(val)) return "";
  return `${val.toFixed(digits)}%`;
}
function fmtNum(val: number | null | undefined, digits = 0): string {
  if (val == null || !Number.isFinite(val)) return "";
  return val.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function fmtYrs(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "";
  return `${val.toFixed(1)} yrs`;
}

function parseDate(input: any): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^(mtm|m-?t-?m|month[-\s]?to[-\s]?month|holdover|expired|--)$/i.test(s)) return null;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime()) && iso.getFullYear() > 1900 && iso.getFullYear() < 2200) return iso;
  const my = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (my) return new Date(Number(my[2]), Number(my[1]) - 1, 1);
  const mdyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdyy) {
    const yr = Number(mdyy[3]);
    return new Date(yr + (yr < 50 ? 2000 : 1900), Number(mdyy[1]) - 1, Number(mdyy[2]));
  }
  return null;
}
function isMTM(input: any): boolean {
  if (!input) return false;
  return /^(mtm|m-?t-?m|month[-\s]?to[-\s]?month|holdover)$/i.test(String(input).trim());
}

/* Building blocks */
function SectionCard({
  title, subtitle, children, accent,
}: { title: string; subtitle?: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: C.surfLowest,
      border: `1px solid ${C.ghostBorder}`,
      borderRadius: C.radius,
      padding: 18,
      marginBottom: 12,
      boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: subtitle ? 4 : 10 }}>
        {accent && <span style={{ width: 4, height: 16, borderRadius: 2, background: accent, display: "inline-block" }} />}
        <h4 style={{
          fontSize: 12, fontWeight: 800, color: C.onSurface,
          textTransform: "uppercase", letterSpacing: 0.7, margin: 0,
        }}>{title}</h4>
      </div>
      {subtitle && <div style={{ fontSize: 11.5, color: C.secondary, marginBottom: 10, lineHeight: 1.5 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function StatTile({ label, value, note, tone }: {
  label: string; value: string; note?: string;
  tone?: "good" | "warn" | "bad" | "info" | "neutral";
}) {
  const color =
    tone === "good" ? C.good :
    tone === "warn" ? C.warn :
    tone === "bad" ? C.bad :
    tone === "info" ? C.info :
    C.onSurface;
  return (
    <div style={{
      flex: "1 1 140px", minWidth: 130,
      padding: "12px 14px",
      background: "#FAFAFA",
      border: `1px solid ${C.ghostBorder}`,
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 0.6, color: C.secondary, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800, color, lineHeight: 1.1,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {note && <div style={{ fontSize: 10.5, color: C.secondary, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F9FAFB" }}>
            {head.map((h, i) => (
              <th key={i} style={{
                padding: "7px 10px", textAlign: i === 0 ? "left" : "right",
                fontWeight: 700, color: C.secondary, fontSize: 10,
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: `1px solid ${C.ghost}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: `1px solid ${C.ghostBorder}` }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "7px 10px",
                  textAlign: ci === 0 ? "left" : "right",
                  color: C.onSurface,
                  fontWeight: ci === 0 ? 600 : 500,
                  fontVariantNumeric: "tabular-nums",
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Types */
interface TenantRow {
  idx: number;
  name: string;
  sf: number | null;
  rent: number | null;
  rentPsf: number | null;
  type: string | null;
  status: string | null;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  leaseEndRaw: string | null;
  isMTM: boolean;
}

export interface RentRollDetailAnalysisProps {
  property: Property;
  fields: ExtractedField[];
  wsType: string;
}

export default function RentRollDetailAnalysis({
  property, fields, wsType,
}: RentRollDetailAnalysisProps) {
  void property;
  const g = (group: string, name: string) => gf(fields, group, name);

  /* Parse tenant rows */
  const rows = useMemo<TenantRow[]>(() => {
    const nameFields = fields.filter(f =>
      f.fieldGroup === "rent_roll" && /^tenant_\d+_name$/.test(f.fieldName)
    );
    return nameFields
      .map(f => {
        const m = f.fieldName.match(/^tenant_(\d+)_name$/);
        if (!m) return null;
        const i = Number(m[1]);
        const name = String(f.normalizedValue || f.rawValue || "").trim();
        if (!name) return null;
        const endRaw = g("rent_roll", `tenant_${i}_lease_end`);
        const sfNum = Number(g("rent_roll", `tenant_${i}_sf`));
        const rentNum = Number(g("rent_roll", `tenant_${i}_rent`));
        const psfNum = Number(g("rent_roll", `tenant_${i}_rent_psf`));
        const row: TenantRow = {
          idx: i,
          name,
          sf: Number.isFinite(sfNum) && sfNum > 0 ? sfNum : null,
          rent: Number.isFinite(rentNum) && rentNum > 0 ? rentNum : null,
          rentPsf: Number.isFinite(psfNum) && psfNum > 0 ? psfNum : null,
          type: g("rent_roll", `tenant_${i}_type`) || null,
          status: g("rent_roll", `tenant_${i}_status`) || null,
          leaseStart: parseDate(g("rent_roll", `tenant_${i}_lease_start`)),
          leaseEnd: parseDate(endRaw),
          leaseEndRaw: endRaw ? String(endRaw) : null,
          isMTM: isMTM(endRaw) || isMTM(g("rent_roll", `tenant_${i}_status`)),
        };
        return row;
      })
      .filter((r): r is TenantRow => !!r);
  }, [fields]);

  const bldgSfRaw = Number(g("property_basics", "building_sf"));
  const buildingSf = Number.isFinite(bldgSfRaw) && bldgSfRaw > 0 ? bldgSfRaw : null;

  const rentsKnown = rows.filter(r => r.rent != null);
  const sfKnown = rows.filter(r => r.sf != null);
  const leaseEndKnown = rows.filter(r => r.leaseEnd != null || r.isMTM);

  const totalRent = rentsKnown.reduce((s, r) => s + (r.rent || 0), 0);
  const totalSf = sfKnown.reduce((s, r) => s + (r.sf || 0), 0);
  const hasRent = rentsKnown.length > 0 && totalRent > 0;
  const hasSf = sfKnown.length > 0 && totalSf > 0;

  const avgRentPsf = hasRent && hasSf ? totalRent / totalSf : null;
  const physOcc = buildingSf != null && hasSf ? Math.min(100, (totalSf / buildingSf) * 100) : null;

  const mtmCount = rows.filter(r => r.isMTM).length;
  const mtmRent = rows.filter(r => r.isMTM).reduce((s, r) => s + (r.rent || 0), 0);
  const mtmRentPct = hasRent ? (mtmRent / totalRent) * 100 : null;

  /* Rollover schedule */
  const rollover = useMemo(() => {
    if (leaseEndKnown.length === 0) return null;
    const today = new Date();
    const thisYear = today.getFullYear();
    const buckets: Array<{ label: string; rent: number; sf: number; count: number }> = [];
    const mtmBucket = { label: "MTM / Holdover", rent: 0, sf: 0, count: 0 };
    const beyond = { label: "Beyond Year 5", rent: 0, sf: 0, count: 0 };
    const expired = { label: "Already Expired", rent: 0, sf: 0, count: 0 };
    for (let i = 0; i < 5; i++) {
      buckets.push({ label: `Year ${i + 1} (${thisYear + i})`, rent: 0, sf: 0, count: 0 });
    }
    rows.forEach(r => {
      if (r.isMTM) {
        mtmBucket.rent += r.rent || 0; mtmBucket.sf += r.sf || 0; mtmBucket.count += 1;
        return;
      }
      if (!r.leaseEnd) return;
      const yr = r.leaseEnd.getFullYear();
      const delta = yr - thisYear;
      if (r.leaseEnd < today) {
        expired.rent += r.rent || 0; expired.sf += r.sf || 0; expired.count += 1;
      } else if (delta >= 0 && delta < 5) {
        buckets[delta].rent += r.rent || 0; buckets[delta].sf += r.sf || 0; buckets[delta].count += 1;
      } else {
        beyond.rent += r.rent || 0; beyond.sf += r.sf || 0; beyond.count += 1;
      }
    });
    return { buckets, mtmBucket, beyond, expired };
  }, [rows, leaseEndKnown.length]);

  const rollover12Pct = rollover && hasRent
    ? (((rollover.buckets[0]?.rent || 0) + rollover.mtmBucket.rent + rollover.expired.rent) / totalRent) * 100
    : null;

  /* WALT */
  const walt = useMemo(() => {
    const today = new Date();
    let numR = 0, denR = 0, numS = 0, denS = 0;
    rows.forEach(r => {
      let yrs: number;
      if (r.isMTM) yrs = 0.25;
      else if (!r.leaseEnd) return;
      else yrs = Math.max(0, (r.leaseEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      if ((r.rent || 0) > 0) { numR += yrs * (r.rent || 0); denR += (r.rent || 0); }
      if ((r.sf || 0) > 0) { numS += yrs * (r.sf || 0); denS += (r.sf || 0); }
    });
    return {
      byRent: denR > 0 ? numR / denR : null,
      bySf: denS > 0 ? numS / denS : null,
    };
  }, [rows]);

  /* Concentration risk */
  const concentration = useMemo(() => {
    if (!hasRent) return null;
    const sorted = rentsKnown.slice().sort((a, b) => (b.rent || 0) - (a.rent || 0));
    if (sorted.length === 0) return null;
    const top1 = sorted[0];
    const top1Pct = ((top1.rent || 0) / totalRent) * 100;
    const top3Pct = (sorted.slice(0, 3).reduce((s, r) => s + (r.rent || 0), 0) / totalRent) * 100;
    const top5Pct = (sorted.slice(0, 5).reduce((s, r) => s + (r.rent || 0), 0) / totalRent) * 100;
    const top10Pct = (sorted.slice(0, 10).reduce((s, r) => s + (r.rent || 0), 0) / totalRent) * 100;
    return {
      top1, top1Pct, top3Pct, top5Pct, top10Pct,
      top5: sorted.slice(0, Math.min(5, sorted.length)),
      singleTenantRisk: top1Pct > 20,
      top3Risk: top3Pct > 50,
      tenantsCounted: sorted.length,
    };
  }, [rentsKnown, hasRent, totalRent]);

  /* Mark-to-market */
  const mtm = useMemo(() => {
    const marketRentPsf =
      Number(g("retail_addons", "market_rent_psf")) ||
      Number(g("industrial_addons", "rent_per_sf")) ||
      Number(g("office_addons", "asking_rent_psf")) ||
      null;
    const mrPsfUsable = marketRentPsf && Number.isFinite(marketRentPsf) && marketRentPsf > 0
      ? marketRentPsf : null;
    if (!mrPsfUsable || !hasRent || !hasSf) return null;
    let below = 0, above = 0, belowSf = 0, aboveSf = 0;
    rows.forEach(r => {
      if (!r.rent || !r.sf) return;
      const inPlacePsf = r.rentPsf || r.rent / r.sf;
      if (inPlacePsf < mrPsfUsable) { below += (mrPsfUsable - inPlacePsf) * r.sf; belowSf += r.sf; }
      else if (inPlacePsf > mrPsfUsable) { above += (inPlacePsf - mrPsfUsable) * r.sf; aboveSf += r.sf; }
    });
    const net = below - above;
    const lossToLease = totalRent > 0 ? (net / totalRent) * 100 : null;
    return { reference: mrPsfUsable, below, above, belowSf, aboveSf, net, lossToLease };
  }, [fields, rows, totalRent, hasRent, hasSf]);

  /* Data quality */
  const dq = useMemo(() => {
    if (rows.length === 0) return null;
    let issues = 0, cells = 0;
    const flags: string[] = [];
    let mr = 0, ms = 0, me = 0;
    rows.forEach(r => {
      cells += wsType === "multifamily" ? 3 : 4;
      if (!r.name) issues++;
      if (r.rent == null) { issues++; mr++; }
      if (wsType !== "multifamily" && r.sf == null) { issues++; ms++; }
      if (!r.leaseEnd && !r.isMTM) { issues++; me++; }
    });
    if (mr > 0) flags.push(`${mr} tenant${mr > 1 ? "s" : ""} missing rent`);
    if (ms > 0) flags.push(`${ms} tenant${ms > 1 ? "s" : ""} missing SF`);
    if (me > 0) flags.push(`${me} tenant${me > 1 ? "s" : ""} missing lease end`);
    const pct = cells > 0 ? (issues / cells) * 100 : 0;
    const grade = pct < 5 ? "A" : pct < 15 ? "B" : "C";
    return { grade, pct, flags };
  }, [rows, wsType]);

  /* Asset-specific flags */
  const assetFlags = useMemo(() => {
    const notes: string[] = [];
    if (wsType === "retail") {
      const anchor = concentration?.top1;
      if (anchor && buildingSf != null && anchor.sf) {
        const glaPct = (anchor.sf / buildingSf) * 100;
        if (glaPct > 15) notes.push(`${anchor.name} occupies ${glaPct.toFixed(0)}% of GLA; confirm co-tenancy clauses.`);
      }
      if (concentration?.singleTenantRisk)
        notes.push(`Top tenant is ${concentration.top1Pct.toFixed(0)}% of rent (>20% threshold).`);
      if (walt.byRent != null && walt.byRent < 3 && rows.length >= 3)
        notes.push(`Rent-weighted WALT ${walt.byRent.toFixed(1)} yrs is below the 3-yr retail floor.`);
    }
    if (wsType === "industrial") {
      if (concentration && concentration.top1Pct > 50)
        notes.push(`Single tenant is ${concentration.top1Pct.toFixed(0)}% of rent; effectively a single-credit bet.`);
      if (walt.byRent != null && walt.byRent < 3 && rows.length > 0)
        notes.push(`Rent-weighted WALT ${walt.byRent.toFixed(1)} yrs is short for industrial; renewal risk elevated.`);
      if (rows.length === 1) notes.push("Single-tenant industrial: diligence credit, residual value, and re-tenant downtime.");
    }
    if (wsType === "office") {
      const med = g("office_addons", "medical_flag");
      const isMed = med === true || med === "true" || med === "yes";
      if (rollover12Pct != null && rollover12Pct > 15)
        notes.push(`${rollover12Pct.toFixed(0)}% of rent rolls in the next 12 months; TI + leasing costs will hit cash flow.`);
      if (walt.byRent != null && walt.byRent < 3)
        notes.push(`Short WALT ${walt.byRent.toFixed(1)} yrs amplifies leasing-cost drag.`);
      if (isMed) notes.push("Medical office: tenant stickiness is high (build-out sunk cost, referral base).");
    }
    if (wsType === "multifamily") {
      const unitCount = Number(g("multifamily_addons", "unit_count")) || null;
      const vacancy = Number(g("multifamily_addons", "vacancy_rate"));
      if (unitCount && rows.length > 0 && rows.length < unitCount)
        notes.push(`Rent roll shows ${rows.length} rows vs ${unitCount} units. Confirm vacant units are included.`);
      if (Number.isFinite(vacancy) && vacancy > 10)
        notes.push(`Vacancy ${vacancy.toFixed(1)}% is elevated; diagnose concessions or submarket softness.`);
    }
    if (wsType === "land") {
      notes.push("Land income (ground leases, parking, billboards) is secondary to land value.");
      notes.push("Prioritize zoning, entitlements, and development constraints over rent-roll analytics.");
    }
    return notes;
  }, [wsType, rows, concentration, walt, rollover12Pct, buildingSf, fields]);

  /* Quick Take */
  const quickTake = useMemo(() => {
    const parts: string[] = [];
    if (concentration?.singleTenantRisk || (concentration && concentration.top3Pct > 50)) {
      parts.push(`Income is concentrated (top tenant ${concentration.top1Pct.toFixed(0)}%, top 3 ${concentration.top3Pct.toFixed(0)}%); durability hinges on those credits.`);
    } else if (walt.byRent != null && walt.byRent >= 5) {
      parts.push(`Income looks durable: ${walt.byRent.toFixed(1)}-yr rent-weighted WALT with no single tenant over 20%.`);
    } else if (walt.byRent != null) {
      parts.push(`Moderate durability at ${walt.byRent.toFixed(1)}-yr WALT; near-term renewals drive outcome.`);
    }
    if (rollover12Pct != null && rollover12Pct >= 20) {
      parts.push(`Risk is front-loaded: ${rollover12Pct.toFixed(0)}% of rent rolls in the next 12 months.`);
    } else if (mtmRentPct != null && mtmRentPct >= 15) {
      parts.push(`${mtmRentPct.toFixed(0)}% of rent is month-to-month; that is the key lever.`);
    }
    if (mtm?.lossToLease != null && mtm.lossToLease > 5) {
      parts.push(`${mtm.lossToLease.toFixed(0)}% loss-to-lease vs market is capturable at renewal.`);
    } else if (mtm?.lossToLease != null && mtm.lossToLease < -5) {
      parts.push(`In-place rent sits ${Math.abs(mtm.lossToLease).toFixed(0)}% above market; assume renewal cuts.`);
    }
    if (parts.length === 0 && dq && dq.grade === "C") {
      parts.push("Data gaps (grade C) limit the analysis; clean the rent roll before underwriting hard.");
    }
    return parts.slice(0, 3).join(" ");
  }, [concentration, walt, rollover12Pct, mtmRentPct, mtm, dq]);

  /* Render */
  if (rows.length === 0) {
    return (
      <div style={{
        marginTop: 14,
        padding: 14,
        background: C.surfLowest,
        border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius,
        fontSize: 12,
        color: C.secondary,
      }}>
        Detail Analysis is unavailable until tenants are parsed from the rent roll or OM.
      </div>
    );
  }

  const coreTiles: Array<{ label: string; value: string; note?: string; tone?: "warn" | "bad" | "good" | "neutral" }> = [];
  coreTiles.push({
    label: wsType === "multifamily" ? "Units on Rent Roll" : "Tenants",
    value: fmtNum(rows.length),
  });
  if (hasRent) coreTiles.push({ label: "Total In-Place Rent", value: fmt$(totalRent) });
  if (wsType === "multifamily" && hasRent) {
    coreTiles.push({ label: "Avg Rent / Unit", value: `${fmt$(totalRent / rows.length / 12)}/mo` });
  } else if (avgRentPsf != null) {
    coreTiles.push({ label: "Avg Rent / SF", value: `$${avgRentPsf.toFixed(2)}` });
  }
  if (physOcc != null) {
    coreTiles.push({
      label: "Physical Occupancy",
      value: fmtPct(physOcc),
      note: buildingSf ? `${fmtNum(totalSf)} / ${fmtNum(buildingSf)} SF` : undefined,
    });
  }
  if (rollover12Pct != null) {
    coreTiles.push({
      label: "12-Mo Rollover (% rent)",
      value: fmtPct(rollover12Pct),
      tone: rollover12Pct > 15 ? "warn" : "neutral",
      note: rollover12Pct > 15 ? "Above 15% threshold" : undefined,
    });
  }
  if (mtmCount > 0) {
    coreTiles.push({
      label: "MTM / Holdover",
      value: mtmRentPct != null ? `${mtmCount} (${fmtPct(mtmRentPct)} rent)` : `${mtmCount}`,
      tone: mtmRentPct != null && mtmRentPct > 15 ? "warn" : "neutral",
    });
  }

  const showCore = coreTiles.length > 1;
  const showRollover = !!rollover && (
    rollover.buckets.some(b => b.count > 0) || rollover.expired.count > 0 || rollover.mtmBucket.count > 0 || rollover.beyond.count > 0
  );
  const showConcentration = !!concentration && concentration.tenantsCounted >= 2;
  const showWalt = walt.byRent != null || walt.bySf != null;
  const showMtm = !!mtm;
  const showAsset = assetFlags.length > 0;
  const showMtmExposure = mtmCount > 0;
  const showDq = !!dq && (dq.grade !== "A" || dq.flags.length > 0);
  const showQuickTake = quickTake.trim().length > 0;

  const anythingToShow = showCore || showRollover || showConcentration || showWalt
    || showMtm || showAsset || showMtmExposure || showDq || showQuickTake;

  if (!anythingToShow) {
    return (
      <div style={{
        marginTop: 14,
        padding: 14,
        background: C.surfLowest,
        border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius,
        fontSize: 12,
        color: C.secondary,
      }}>
        Tenants parsed, but not enough rent, SF, or lease-end data to produce a Detail Analysis for this property.
      </div>
    );
  }

  const assetLabel: Record<string, string> = {
    retail: "Retail",
    industrial: "Industrial",
    office: "Office / Medical",
    multifamily: "Multifamily",
    land: "Land",
  };
  const detectedLabel = assetLabel[wsType] || "General CRE";

  return (
    <div style={{ marginTop: 48 }}>
      {/* Prominent section break. Clear visual separation from the rent
          roll table above, large headline, with the detected asset-type
          module surfaced as a small eyebrow tag. */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap",
        padding: "0 2px 14px 2px",
        marginBottom: 18,
        borderBottom: `2px solid ${C.primaryText}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
            textTransform: "uppercase", color: C.primaryText, marginBottom: 6,
          }}>{detectedLabel} Module</div>
          <h2 style={{
            margin: 0,
            fontSize: 30, fontWeight: 800, letterSpacing: -0.5,
            color: C.onSurface, lineHeight: 1.1,
            fontFamily: "'Inter', sans-serif",
          }}>Detail Analysis</h2>
          <div style={{ fontSize: 12.5, color: C.secondary, fontWeight: 500, marginTop: 6 }}>
            Tenant-level diagnostics across {rows.length} tenant{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {showCore && (
        <SectionCard title="Core Metrics" accent={C.primaryText}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {coreTiles.map((t, i) => (
              <StatTile key={i} label={t.label} value={t.value} note={t.note} tone={t.tone} />
            ))}
          </div>
        </SectionCard>
      )}

      {showRollover && rollover && (
        <SectionCard
          title="Rollover Schedule (Next 5 Years)"
          subtitle="Leases grouped by expiration year. Expired and MTM rows are separated because they behave like rollover today."
          accent={C.info}
        >
          <MiniTable
            head={["Period", "Tenants", "SF", "Annual Rent", "% of Rent"]}
            rows={[
              ...rollover.buckets
                .filter(b => b.count > 0)
                .map(b => [
                  b.label,
                  b.count,
                  b.sf > 0 ? fmtNum(b.sf) : "",
                  b.rent > 0 ? fmt$(b.rent) : "",
                  hasRent && b.rent > 0 ? fmtPct((b.rent / totalRent) * 100) : "",
                ]),
              ...(rollover.expired.count > 0 ? [[
                rollover.expired.label,
                rollover.expired.count,
                rollover.expired.sf > 0 ? fmtNum(rollover.expired.sf) : "",
                rollover.expired.rent > 0 ? fmt$(rollover.expired.rent) : "",
                hasRent && rollover.expired.rent > 0 ? fmtPct((rollover.expired.rent / totalRent) * 100) : "",
              ]] : []),
              ...(rollover.mtmBucket.count > 0 ? [[
                rollover.mtmBucket.label,
                rollover.mtmBucket.count,
                rollover.mtmBucket.sf > 0 ? fmtNum(rollover.mtmBucket.sf) : "",
                rollover.mtmBucket.rent > 0 ? fmt$(rollover.mtmBucket.rent) : "",
                hasRent && rollover.mtmBucket.rent > 0 ? fmtPct((rollover.mtmBucket.rent / totalRent) * 100) : "",
              ]] : []),
              ...(rollover.beyond.count > 0 ? [[
                rollover.beyond.label,
                rollover.beyond.count,
                rollover.beyond.sf > 0 ? fmtNum(rollover.beyond.sf) : "",
                rollover.beyond.rent > 0 ? fmt$(rollover.beyond.rent) : "",
                hasRent && rollover.beyond.rent > 0 ? fmtPct((rollover.beyond.rent / totalRent) * 100) : "",
              ]] : []),
            ]}
          />
        </SectionCard>
      )}

      {showMtm && mtm && (
        <SectionCard
          title="Mark-to-Market"
          subtitle={`Compared against reference market rent of $${mtm.reference.toFixed(2)}/SF.`}
          accent={C.good}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {mtm.below > 0 && (
              <StatTile label="Below-Market Upside" value={fmt$(mtm.below)}
                note={mtm.belowSf ? `${fmtNum(mtm.belowSf)} SF below market` : undefined} tone="good" />
            )}
            {mtm.above > 0 && (
              <StatTile label="Above-Market Exposure" value={fmt$(mtm.above)}
                note={mtm.aboveSf ? `${fmtNum(mtm.aboveSf)} SF above market` : undefined} tone="bad" />
            )}
            {(mtm.below > 0 || mtm.above > 0) && (
              <StatTile label="Net Loss-to-Lease" value={fmt$(mtm.net)}
                tone={mtm.net > 0 ? "good" : mtm.net < 0 ? "bad" : "neutral"} />
            )}
            {mtm.lossToLease != null && (
              <StatTile label="Loss-to-Lease %" value={fmtPct(mtm.lossToLease)}
                tone={mtm.lossToLease > 0 ? "good" : mtm.lossToLease < 0 ? "bad" : "neutral"}
                note="Assumes 75% renewal capture" />
            )}
          </div>
        </SectionCard>
      )}

      {showConcentration && concentration && (
        <SectionCard title="Concentration Risk" accent={C.warn}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <StatTile label="Top Tenant % of Rent" value={fmtPct(concentration.top1Pct)}
              tone={concentration.singleTenantRisk ? "bad" : "neutral"}
              note={concentration.top1?.name || undefined} />
            {concentration.tenantsCounted >= 3 && (
              <StatTile label="Top 3 % of Rent" value={fmtPct(concentration.top3Pct)}
                tone={concentration.top3Risk ? "bad" : "neutral"}
                note={concentration.top3Risk ? "Above 50% threshold" : undefined} />
            )}
            {concentration.tenantsCounted >= 5 && (
              <StatTile label="Top 5 % of Rent" value={fmtPct(concentration.top5Pct)} />
            )}
            {concentration.tenantsCounted >= 10 && (
              <StatTile label="Top 10 % of Rent" value={fmtPct(concentration.top10Pct)} />
            )}
          </div>
          <MiniTable
            head={["Tenant", "SF", "Annual Rent", "% of Rent"]}
            rows={concentration.top5.map(t => [
              t.name,
              t.sf ? fmtNum(t.sf) : "",
              fmt$(t.rent),
              fmtPct(((t.rent || 0) / totalRent) * 100),
            ])}
          />
        </SectionCard>
      )}

      {showWalt && (
        <SectionCard title="WALT (Weighted Average Lease Term)" accent={C.info}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {walt.byRent != null && <StatTile label="Rent-Weighted WALT" value={fmtYrs(walt.byRent)} />}
            {walt.bySf != null && <StatTile label="SF-Weighted WALT" value={fmtYrs(walt.bySf)} />}
          </div>
        </SectionCard>
      )}

      {showAsset && (
        <SectionCard title={`${detectedLabel} Flags`} accent={C.primaryText}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.onSurface, lineHeight: 1.6 }}>
            {assetFlags.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </SectionCard>
      )}

      {showMtmExposure && (
        <SectionCard title="MTM / Holdover Exposure" accent={C.warn}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <StatTile label="MTM Tenants" value={fmtNum(mtmCount)} />
            <StatTile label="% of Tenants" value={fmtPct((mtmCount / rows.length) * 100)} />
            {mtmRentPct != null && (
              <StatTile label="% of In-Place Rent" value={fmtPct(mtmRentPct)}
                tone={mtmRentPct > 15 ? "warn" : "neutral"} />
            )}
            {mtmRentPct != null && (
              <StatTile label="Classification"
                value={mtmRentPct > 20 ? "Risk" : mtmRentPct > 10 ? "Flexible" : "Holdover-only"} />
            )}
          </div>
        </SectionCard>
      )}

      {showDq && dq && (
        <SectionCard title="Data Quality" accent={C.secondary}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{
              padding: "8px 16px",
              background: dq.grade === "A" ? "#DCFCE7" : dq.grade === "B" ? "#FEF3C7" : "#FEE2E2",
              color: dq.grade === "A" ? "#065F46" : dq.grade === "B" ? "#92400E" : "#991B1B",
              border: `1px solid ${dq.grade === "A" ? "#86EFAC" : dq.grade === "B" ? "#FCD34D" : "#FCA5A5"}`,
              borderRadius: 8,
              fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: "center",
            }}>{dq.grade}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: C.onSurface, fontWeight: 600 }}>
                {fmtPct(dq.pct)} of rent-roll cells have gaps
              </div>
              {dq.flags.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: C.secondary, lineHeight: 1.6 }}>
                  {dq.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {showQuickTake && (
        <div style={{
          background: "#0F172A",
          color: "#F8FAFC",
          borderRadius: C.radius,
          padding: "14px 18px",
          marginBottom: 4,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: 1,
            textTransform: "uppercase", color: C.primary, marginBottom: 6,
          }}>Quick Take</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, fontWeight: 500 }}>
            {quickTake}
          </div>
        </div>
      )}
    </div>
  );
}
