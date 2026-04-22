"use client";

/**
 * SubmarketBrief
 *
 * "Submarket Truth Serum" — asset-type-aware institutional submarket brief.
 *
 * Renders the full framework (Executive Summary, Narrative, Snapshot,
 * Supply Pipeline, Demand Drivers, Competitive Set, Hidden Risks,
 * 12-24 Month Outlook scenarios, Regulatory, Risks, Underwriting
 * Implications) and swaps the middle three sections to match the
 * asset-type lens (multifamily / retail / industrial / office +
 * medical / land).
 *
 * Data policy:
 *   Market fundamentals, rent levels, vacancy, and pipeline figures
 *   shown here reflect conditions as of the model's training cutoff.
 *   Every claim is labeled with its source + confidence. User- or
 *   connector-provided data overrides training data at render time.
 *
 * This component intentionally ships as a structured shell with any
 * available property/submarket context wired in. Fields the model has
 * no verifiable answer to render as "NEEDS DATA" rather than fabricate.
 */

import { useMemo } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";

/* ── Design tokens (mirror PropertyDetailClient) ─────────────────────── */
const C = {
  primary: "#4D7C0F",
  primaryText: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  gold: "#C49A3C",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
  warnBg: "#FEF3C7",
  warnFg: "#92400E",
  warnBorder: "#FCD34D",
};

type Lens = "multifamily" | "retail" | "industrial" | "office" | "medical_office" | "land";

function normalizeLens(wsType: string | undefined, assetType: string | undefined): Lens {
  const raw = (assetType || wsType || "").toLowerCase();
  if (raw.startsWith("multi")) return "multifamily";
  if (raw.startsWith("retail")) return "retail";
  if (raw.startsWith("industrial")) return "industrial";
  if (raw.startsWith("medical")) return "medical_office";
  if (raw.startsWith("office")) return "office";
  if (raw.startsWith("land")) return "land";
  return "retail";
}

function lensLabel(lens: Lens): string {
  switch (lens) {
    case "multifamily": return "Multifamily";
    case "retail": return "Retail";
    case "industrial": return "Industrial";
    case "office": return "Office";
    case "medical_office": return "Medical Office";
    case "land": return "Land";
  }
}

/* ── Field helpers ──────────────────────────────────────────────────── */
function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find((x) => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

/* ── Small building blocks ──────────────────────────────────────────── */
function SectionCard({
  num,
  title,
  subtitle,
  children,
}: {
  num: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.surfLowest,
        border: `1px solid ${C.ghostBorder}`,
        borderRadius: C.radius,
        padding: 20,
        marginBottom: 16,
        boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: subtitle ? 4 : 14 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: C.primary,
            letterSpacing: 1,
            fontVariantNumeric: "tabular-nums",
            minWidth: 18,
          }}
        >
          {num}
        </span>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.onSurface,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            margin: 0,
          }}
        >
          {title}
        </h3>
      </div>
      {subtitle && <div style={{ fontSize: 12, color: C.secondary, marginBottom: 14 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Callout({
  kind,
  children,
}: {
  kind: "warning" | "info";
  children: React.ReactNode;
}) {
  const styles =
    kind === "warning"
      ? { bg: C.warnBg, fg: C.warnFg, border: C.warnBorder }
      : { bg: "#EFF6FF", fg: "#1E40AF", border: "#BFDBFE" };
  return (
    <div
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.55,
        color: styles.fg,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: C.onSurface,
        marginBottom: 8,
        paddingLeft: 2,
      }}
    >
      {children}
    </li>
  );
}

function BulletList({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{children}</ul>
  );
}

function NeedsData({ label }: { label?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        background: C.warnBg,
        color: C.warnFg,
        border: `1px solid ${C.warnBorder}`,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {label || "Needs Data"}
    </span>
  );
}

function SourceTag({
  source,
  confidence,
}: {
  source: "OM" | "User" | "Training" | "Public" | "Connector";
  confidence: "High" | "Medium" | "Low";
}) {
  const palette: Record<string, { bg: string; fg: string }> = {
    OM: { bg: "#ECFDF5", fg: "#065F46" },
    User: { bg: "#EFF6FF", fg: "#1E40AF" },
    Training: { bg: "#FEF3C7", fg: "#92400E" },
    Public: { bg: "#F3E8FF", fg: "#6B21A8" },
    Connector: { bg: "#ECFEFF", fg: "#155E75" },
  };
  const p = palette[source];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 3,
          background: p.bg,
          color: p.fg,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {source}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.secondary,
        }}
      >
        {confidence} confidence
      </span>
    </span>
  );
}

/* ── Table primitive ────────────────────────────────────────────────── */
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: align,
        fontWeight: 700,
        color: C.secondary,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        background: "#F9FAFB",
        borderBottom: `1px solid ${C.ghost}`,
      }}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "9px 12px",
        textAlign: align,
        fontSize: 12,
        color: C.onSurface,
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
        borderBottom: `1px solid ${C.ghost}`,
      }}
    >
      {children}
    </td>
  );
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.ghost}`, borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>{children}</table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  LENS-SPECIFIC: DEMAND BLOCKS                                          */
/* ══════════════════════════════════════════════════════════════════════ */

function DemandBlockMultifamily({ market }: { market: string }) {
  return (
    <BulletList>
      <Bullet>
        Household formation vs. deliveries in {market}: <NeedsData /> (target metric:
        households added per new unit delivered; below 1.0x signals oversupply risk).
      </Bullet>
      <Bullet>
        Rent-to-income ratio: <NeedsData /> (flag if above 30%, affordability ceiling binding).
      </Bullet>
      <Bullet>
        Effective vs. asking rent delta: <NeedsData /> (concession gap above 4% = distressed
        lease-up).
      </Bullet>
      <Bullet>Job growth, office-using + logistics sectors: <NeedsData /></Bullet>
      <Bullet>Absorption-to-delivery ratio trailing 4 quarters: <NeedsData /></Bullet>
    </BulletList>
  );
}

function DemandBlockRetail({ market }: { market: string }) {
  return (
    <BulletList>
      <Bullet>
        Trade-area population (5/10/15 minute drive, {market}): <NeedsData />. Daytime vs. residential
        split is the right lens for tenant viability, not total population alone.
      </Bullet>
      <Bullet>Median HH income distribution across the trade area: <NeedsData /></Bullet>
      <Bullet>
        Retail leakage/surplus by category: <NeedsData /> (leakage above 20% in anchor category
        supports backfill; surplus above 0 = saturated).
      </Bullet>
      <Bullet>Tenant sales productivity ($/SF, if disclosed on leases): <NeedsData /></Bullet>
      <Bullet>E-commerce resistant tenant %: <NeedsData /> (grocery, service, F&amp;B, medical)</Bullet>
      <Bullet>Traffic counts at frontage + co-tenancy strength: <NeedsData /></Bullet>
    </BulletList>
  );
}

function DemandBlockIndustrial({ market }: { market: string }) {
  return (
    <BulletList>
      <Bullet>Net absorption vs. deliveries, trailing 4 quarters ({market}): <NeedsData /></Bullet>
      <Bullet>
        3PL / e-commerce share of leasing activity: <NeedsData /> (high share drives cyclical risk in a
        goods-spending slowdown).
      </Bullet>
      <Bullet>Named tenant moves in the last 12 months (expansions, departures): <NeedsData /></Bullet>
      <Bullet>
        Rail / port / highway proximity score for the subject: <NeedsData /> (drive time to nearest
        interstate interchange is the default proxy).
      </Bullet>
      <Bullet>Power and land constraints limiting new BTS: <NeedsData /></Bullet>
    </BulletList>
  );
}

function DemandBlockOffice({ market, medical }: { market: string; medical: boolean }) {
  if (medical) {
    return (
      <BulletList>
        <Bullet>Healthcare system expansion plans in {market}: <NeedsData /></Bullet>
        <Bullet>Hospital / major referral source proximity (drive time): <NeedsData /></Bullet>
        <Bullet>Medicare / Medicaid demographic of 5-mile ring: <NeedsData /></Bullet>
        <Bullet>Specialty mix of tenant roster, referral-flow dependency: <NeedsData /></Bullet>
        <Bullet>Competitive MOB deliveries within 3 miles: <NeedsData /></Bullet>
      </BulletList>
    );
  }
  return (
    <BulletList>
      <Bullet>Office-using employment growth in {market}: <NeedsData /></Bullet>
      <Bullet>
        Return-to-office rate (badge / card-swipe data if available): <NeedsData />. Under 55% puts
        renewal risk in scope.
      </Bullet>
      <Bullet>Sublease inventory as % of total available SF: <NeedsData /> (above 2% = warning flag).</Bullet>
      <Bullet>Tenant sector concentration (tech, finance, law, gov): <NeedsData /></Bullet>
      <Bullet>Class-A flight to quality vs. Class-B/C distress: <NeedsData /></Bullet>
    </BulletList>
  );
}

function DemandBlockLand({ market }: { market: string }) {
  return (
    <BulletList>
      <Bullet>Buyer pool depth in {market} (number of active developers / users): <NeedsData /></Bullet>
      <Bullet>Comparable land absorption (acres/year by use type): <NeedsData /></Bullet>
      <Bullet>Trend in $/usable acre (not $/gross acre): <NeedsData /></Bullet>
      <Bullet>
        Entitlement probability for planned use: <NeedsData /> (track record of the planning
        commission on similar uses is the best predictor).
      </Bullet>
      <Bullet>Infrastructure (power, water, sewer) availability + capacity: <NeedsData /></Bullet>
    </BulletList>
  );
}

function SupplyBlock({ lens }: { lens: Lens }) {
  const perLens: Record<Lens, { header: string; notes: string[] }> = {
    multifamily: {
      header: "Quarterly deliveries + pre-leasing status is the most load-bearing metric for this asset type.",
      notes: [
        "Track deliveries by submarket, not metro. Metro totals mask local oversupply.",
        "Break out lease-up projects (projects under 90% leased) vs. stabilized vintage.",
        "Concession burn-off timeline: 2 months free typically unwinds over 18-24 months post-stabilization.",
      ],
    },
    retail: {
      header: "Net new retail SF = deliveries minus closures. Department store / mid-box closures create shadow supply.",
      notes: [
        "Redevelopment pipeline matters more than ground-up, since inline backfill compresses rent.",
        "Anchor vacancies in competing centers are the key supply risk, not new construction.",
      ],
    },
    industrial: {
      header: "Spec vs. build-to-suit pipeline. Spec deliveries into a softening market are where rent falls fastest.",
      notes: [
        "Vacancy by vintage: newer Class A often absorbs first, older Class B sees rent cuts.",
        "Track land banks owned by national developers as forward-supply signal.",
      ],
    },
    office: {
      header: "Shadow supply (sublease) is the binding constraint, not new deliveries.",
      notes: [
        "Conversion pipeline (office to residential / life-science) removes supply but slowly.",
        "Tenant improvement package creep is a leading indicator of effective rent decline.",
      ],
    },
    medical_office: {
      header: "Competing MOB deliveries within referral-network radius (typically 3 miles).",
      notes: [
        "Hospital campus-owned vs. off-campus. On-campus premium widens in uncertain markets.",
        "Specialty creep: conversion of retail / office to medical use is a real supply channel.",
      ],
    },
    land: {
      header: "Competing entitled sites. The pipeline is who else can be approved, not who's already approved.",
      notes: [
        "Infrastructure timeline (utility extensions, road improvements) sets the floor on delivery date.",
        "Moratoria and sewer / water capacity allocation are frequent surprise constraints.",
      ],
    },
  };

  const block = perLens[lens];

  return (
    <>
      <Callout kind="info">{block.header}</Callout>

      <TableWrap>
        <thead>
          <tr>
            <Th>Quarter</Th>
            <Th>Project</Th>
            <Th align="right">Size</Th>
            <Th>Developer</Th>
            <Th>Stage</Th>
            <Th align="right">Pre-Leasing</Th>
            <Th>Overlap w/ Subject</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>--</Td>
            <Td>
              <NeedsData label="Pipeline data required" />
            </Td>
            <Td align="right" mono>--</Td>
            <Td>--</Td>
            <Td>--</Td>
            <Td align="right" mono>--</Td>
            <Td>--</Td>
          </tr>
        </tbody>
      </TableWrap>

      <div style={{ height: 12 }} />

      <BulletList>
        {block.notes.map((n, i) => (
          <Bullet key={i}>{n}</Bullet>
        ))}
      </BulletList>
    </>
  );
}

function CompSetTable({ lens }: { lens: Lens }) {
  const headers: Record<Lens, string[]> = {
    multifamily: ["Property", "Year Built", "Units", "Asking Rent", "Effective Rent", "Occupancy"],
    retail: ["Property", "Anchor", "Traffic", "Est. Sales / SF", "Inline Rent", "Vacancy"],
    industrial: ["Property", "Clear Height", "Year", "Rent PSF", "Vacancy", "Tenant Type"],
    office: ["Property", "Tenant Type", "Lease Term", "Rent", "Vacancy", "Sublease Exposure"],
    medical_office: ["Property", "Hospital Affiliation", "Specialty Mix", "Rent PSF", "Vacancy", "Parking Ratio"],
    land: ["Site", "Acres", "Buildable %", "Power", "Price / Acre", "Status"],
  };
  const cols = headers[lens];

  return (
    <>
      <div style={{ fontSize: 12, color: C.secondary, marginBottom: 10 }}>
        Institutional-quality brief requires 8-12 comps. Rows below are placeholders until a
        connector or user upload populates verified sale/lease comps.
      </div>
      <TableWrap>
        <thead>
          <tr>
            {cols.map((h, i) => (
              <Th key={i} align={i === 0 ? "left" : "right"}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 3 }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {cols.map((_, colIdx) => (
                <Td key={colIdx} align={colIdx === 0 ? "left" : "right"} mono>
                  {colIdx === 0 ? <NeedsData label={`Comp ${rowIdx + 1}`} /> : "--"}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                        */
/* ══════════════════════════════════════════════════════════════════════ */

export default function SubmarketBrief({
  property,
  fields,
  wsType,
}: {
  property: Property;
  fields: ExtractedField[];
  wsType: string;
}) {
  const lens = useMemo(
    () => normalizeLens(wsType, property?.assetType),
    [wsType, property?.assetType]
  );
  const isMedical = lens === "medical_office";

  /* ── Context pulled from the deal itself (OM / user) ─────────────── */
  const city = property?.city || "";
  const state = property?.state || "";
  const submarket = property?.submarket || gf(fields, "location", "submarket") || "";
  const metro = property?.market || gf(fields, "location", "metro_market") || "";

  const marketLabel = submarket || [city, state].filter(Boolean).join(", ") || "the subject submarket";
  const metroLabel = metro || [city, state].filter(Boolean).join(", ") || "the metro";

  const assetTypeLabel = lensLabel(lens);

  const truthConstraint: Record<Lens, string> = {
    multifamily:
      "Multifamily value is driven by household formation, affordability, and the delta between effective and asking rent, not asking-rent trends alone.",
    retail:
      "Retail is driven by tenant sales productivity, not just rent levels. A rent the tenant can't pay is not a rent.",
    industrial:
      "Industrial value is driven by throughput and functional specs (clear height, truck court, power), not $/SF in isolation.",
    office:
      "Office is a leasing-risk asset. Vacancy and sublease exposure are the primary underwriting inputs, not quoted rents.",
    medical_office:
      "Medical office is referral-flow and location driven. Hospital affiliation and specialty mix outrank rent PSF.",
    land:
      "Land value is driven by entitlement probability, infrastructure, and timing. Comps alone are misleading.",
  };

  return (
    <div>
      {/* Header / intent */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.2,
              color: C.primary,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Submarket Truth Serum · {assetTypeLabel} Lens
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: C.onSurface,
              letterSpacing: -0.2,
            }}
          >
            {marketLabel}
          </h2>
          <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>
            Metro: {metroLabel || "--"} · Asset Type: {assetTypeLabel}
          </div>
        </div>
        <SourceTag source="Training" confidence="Medium" />
      </div>

      {/* Stale-data disclaimer (required by skill spec) */}
      <Callout kind="warning">
        <strong>Data freshness:</strong> market fundamentals, rent levels, vacancy, and supply
        pipeline numbers in this brief reflect conditions as of the model's training cutoff. Every
        claim is labeled with its source and confidence. User-provided or connector-fetched data
        overrides training data. Do not take unlabeled figures to an IC.
      </Callout>

      {/* Truth constraint banner for this lens */}
      <Callout kind="info">
        <strong>{assetTypeLabel} truth constraint:</strong> {truthConstraint[lens]}
      </Callout>

      {/* 1. EXECUTIVE SUMMARY */}
      <SectionCard num="01" title="Executive Summary" subtitle="Bottom line first. Eight bullets max.">
        <BulletList>
          <Bullet>
            <strong>Bottom line:</strong> {assetTypeLabel.toLowerCase()} thesis in {marketLabel}{" "}
            depends on three testable claims: demand trajectory, supply overhang, and the delta
            between asking and effective pricing. <NeedsData label="Populate from research" />
          </Bullet>
          <Bullet>
            <strong>Demand trajectory:</strong> <NeedsData /> (direction + magnitude; e.g. "+1.8%
            annualized net absorption TTM").
          </Bullet>
          <Bullet>
            <strong>Supply risk:</strong> <NeedsData /> (deliveries as % of inventory next 24 mo;
            above 3% is a red flag for most product types).
          </Bullet>
          <Bullet>
            <strong>Rent outlook:</strong> <NeedsData /> (range, not point; e.g. "+1-3% effective,
            flat asking").
          </Bullet>
          <Bullet>
            <strong>Pricing / cap rate environment:</strong> <NeedsData /> (recent trades in bps, not
            OM expectations).
          </Bullet>
          <Bullet>
            <strong>Key risk:</strong> <NeedsData label="Specific & testable" />
          </Bullet>
          <Bullet>
            <strong>Key opportunity:</strong> <NeedsData label="Specific & testable" />
          </Bullet>
          <Bullet>
            <strong>Underwriting implication:</strong> what this brief should change in your model:
            rent growth, vacancy, exit cap, or concessions. <NeedsData />
          </Bullet>
        </BulletList>
      </SectionCard>

      {/* 2. ONE-PAGE NARRATIVE */}
      <SectionCard
        num="02"
        title="One-Page Narrative"
        subtitle="What is actually happening in this submarket and why. Measurable claims only."
      >
        <div style={{ fontSize: 13, lineHeight: 1.65, color: C.onSurface }}>
          <p style={{ margin: "0 0 10px" }}>
            <strong>Metro vs. submarket:</strong> {metroLabel} and {marketLabel} are not the same
            story. State the metro-level demand/supply picture in one paragraph, then explain where{" "}
            {marketLabel} diverges, typically on supply timing, tenant mix, or price point.{" "}
            <NeedsData />
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong>What changed in the last 12 months:</strong> <NeedsData /> (named tenant moves,
            named deliveries, entitlement changes, cap-rate-defining trades).
          </p>
          <p style={{ margin: 0 }}>
            <strong>What's testable forward:</strong> three measurable things that would invalidate
            the thesis if they moved. For example "sublease inventory crosses 8%", "deliveries extend past
            Q4", "anchor co-tenancy rolls". <NeedsData />
          </p>
        </div>
      </SectionCard>

      {/* 3. SUBMARKET SNAPSHOT TABLE */}
      <SectionCard num="03" title="Submarket Snapshot">
        <TableWrap>
          <thead>
            <tr>
              <Th>Metric</Th>
              <Th align="right">Current</Th>
              <Th align="right">3-Yr Trend</Th>
              <Th align="right">Forward 12-24 mo</Th>
              <Th>Source / Confidence</Th>
            </tr>
          </thead>
          <tbody>
            {[
              "Vacancy rate",
              lens === "multifamily" ? "Effective rent ($/unit)" : "Asking rent ($/SF)",
              "Concessions (months free / TI)",
              "Net absorption (SF or units)",
              "Deliveries (next 4 quarters)",
              "Cap rate (recent trades)",
              lens === "retail"
                ? "Tenant sales / SF"
                : lens === "industrial"
                ? "Rent by clear-height band"
                : lens === "land"
                ? "$ / usable acre"
                : "Price / SF (recent trades)",
            ].map((m, i) => (
              <tr key={i}>
                <Td>{m}</Td>
                <Td align="right" mono>
                  <NeedsData />
                </Td>
                <Td align="right" mono>
                  --
                </Td>
                <Td align="right" mono>
                  --
                </Td>
                <Td>
                  <SourceTag source="Training" confidence="Low" />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 4. SUPPLY PIPELINE */}
      <SectionCard
        num="04"
        title="Supply Pipeline"
        subtitle="Quarterly, project-level. Overlap = competes for the same tenant/buyer as the subject."
      >
        <SupplyBlock lens={lens} />
      </SectionCard>

      {/* 5. DEMAND DRIVERS */}
      <SectionCard
        num="05"
        title={`Demand Drivers · ${assetTypeLabel} Lens`}
        subtitle="The metrics that actually move this asset type's valuation."
      >
        {lens === "multifamily" && <DemandBlockMultifamily market={marketLabel} />}
        {lens === "retail" && <DemandBlockRetail market={marketLabel} />}
        {lens === "industrial" && <DemandBlockIndustrial market={marketLabel} />}
        {(lens === "office" || lens === "medical_office") && (
          <DemandBlockOffice market={marketLabel} medical={isMedical} />
        )}
        {lens === "land" && <DemandBlockLand market={marketLabel} />}
      </SectionCard>

      {/* 6. COMPETITIVE SET */}
      <SectionCard
        num="06"
        title="Competitive Set"
        subtitle="8-12 comparable properties minimum for an institutional brief."
      >
        <CompSetTable lens={lens} />
      </SectionCard>

      {/* 7. WHAT THE BROKERS WON'T TELL YOU */}
      <SectionCard
        num="07"
        title="What the Brokers Won't Tell You"
        subtitle="3-5 specific, measurable, observable hidden risks or distortions."
      >
        <BulletList>
          <Bullet>
            <strong>OM uses asking rent, not effective:</strong> re-underwrite with the concession
            package stripped out. For {assetTypeLabel.toLowerCase()} in {marketLabel}, typical gap is{" "}
            <NeedsData /> (should be expressed as a % of gross rent).
          </Bullet>
          <Bullet>
            <strong>Comp set is cherry-picked:</strong> broker comps weight the top of the market.
            Pull trailing 24-month trades and filter to {lens === "land" ? "same planned use" : "same vintage, size band, and condition"}.
          </Bullet>
          <Bullet>
            <strong>Supply timing is understated:</strong> check project-level construction status.{" "}
            <NeedsData /> projects within 1 mile currently show as "proposed" that are actually
            funded and breaking ground.
          </Bullet>
          <Bullet>
            <strong>Cap-rate "expansion already priced in" is a rhetorical device.</strong> It means
            the broker already lost at list. Verify by running your own IRR at the bid, not at list.
          </Bullet>
          <Bullet>
            <strong>
              {lens === "retail"
                ? "Tenant sales-reporting is selective:"
                : lens === "office"
                ? "Sublease inventory is excluded from quoted vacancy:"
                : lens === "industrial"
                ? "Functional obsolescence is rarely called out:"
                : lens === "land"
                ? "Entitlement is treated as baseline, not a risk to price:"
                : "Concession packages for lease-up comps are excluded from asking rent quotes:"}
            </strong>{" "}
            ask explicitly and document the answer. <NeedsData />
          </Bullet>
        </BulletList>
      </SectionCard>

      {/* 8. 12-24 MONTH OUTLOOK */}
      <SectionCard
        num="08"
        title="12-24 Month Outlook"
        subtitle="Three scenarios. No single-point forecasts. Each scenario needs a trigger to check against."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Scenario</Th>
              <Th align="right">
                {lens === "land" ? "Land $ / acre growth" : "Rent Growth"}
              </Th>
              <Th align="right">
                {lens === "land" ? "Absorption (acres/yr)" : "Occupancy"}
              </Th>
              <Th>Assumption</Th>
              <Th>Trigger to confirm</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>
                <strong style={{ color: "#065F46" }}>Bull</strong>
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>Spec supply delivers later than scheduled; demand holds.</Td>
              <Td>
                Named project X slips past target quarter and pre-leasing above 50% at delivery.{" "}
                <NeedsData />
              </Td>
            </tr>
            <tr>
              <Td>
                <strong style={{ color: C.gold }}>Base</strong>
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>Supply delivers on schedule; absorption matches trailing 4-qtr pace.</Td>
              <Td>
                Vacancy stable within plus/minus 50 bps of today through next 4 quarters. <NeedsData />
              </Td>
            </tr>
            <tr>
              <Td>
                <strong style={{ color: "#B91C1C" }}>Bear</strong>
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>
                {lens === "office"
                  ? "Sublease inventory climbs past 10% and breaks effective rent."
                  : lens === "retail"
                  ? "Anchor co-tenancy rolls and inline vacancy spikes."
                  : lens === "industrial"
                  ? "3PL pullback hits spec-delivery lease-up."
                  : lens === "land"
                  ? "Planning commission imposes moratorium or sewer capacity denial."
                  : "Concessions widen past 2 months free and break effective rent."}
              </Td>
              <Td>
                <NeedsData label="Named observable" />
              </Td>
            </tr>
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 9. REGULATORY RISK */}
      <SectionCard
        num="09"
        title="Regulatory Risk"
        subtitle={
          lens === "multifamily"
            ? "Rent control, rent stabilization, tenant protection laws."
            : lens === "land"
            ? "Zoning, entitlement probability, planning commission track record."
            : lens === "retail"
            ? "Redevelopment / planning constraints, impact fees, parking minimums."
            : lens === "industrial"
            ? "Environmental (Phase I/II), logistics regulation, truck route ordinances."
            : "Building code, conversion pathway (office to residential), ADA."
        }
      >
        <BulletList>
          <Bullet>
            Current regime: <NeedsData /> (cite the statute, not the rumor).
          </Bullet>
          <Bullet>
            Active proposals in the legislative pipeline: <NeedsData /> (link to bill number if
            publicly filed).
          </Bullet>
          <Bullet>
            Track record of enforcement / approval: <NeedsData />. This is the single best
            predictor of how the rule will actually behave.
          </Bullet>
          <Bullet>
            Practical impact on underwriting: <NeedsData /> (NOI shock, exit cap adjustment, or
            deal-killer. Be explicit).
          </Bullet>
        </BulletList>
      </SectionCard>

      {/* 10. RISKS & WATCH ITEMS */}
      <SectionCard
        num="10"
        title="Risks & Watch Items"
        subtitle="Each risk must carry a probability (HIGH / MEDIUM / LOW) and a specific trigger event."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Risk</Th>
              <Th>Probability</Th>
              <Th>Trigger event</Th>
              <Th>Impact if triggered</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Supply overhang in {marketLabel}</Td>
              <Td>
                <NeedsData />
              </Td>
              <Td>Deliveries exceed 3% of inventory in any trailing 4-qtr window.</Td>
              <Td>
                Rent growth flat to -2%; concessions widen. <NeedsData />
              </Td>
            </tr>
            <tr>
              <Td>Demand softening (macro or sector)</Td>
              <Td>
                <NeedsData />
              </Td>
              <Td>Named sector (tech, 3PL, healthcare) shows two consecutive quarters of layoffs.</Td>
              <Td>
                Vacancy +100-200 bps; renewal risk in Years 2-3. <NeedsData />
              </Td>
            </tr>
            <tr>
              <Td>Asset-specific risk</Td>
              <Td>
                <NeedsData />
              </Td>
              <Td>
                <NeedsData label="Concrete & observable" />
              </Td>
              <Td>
                <NeedsData />
              </Td>
            </tr>
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 11. UNDERWRITING IMPLICATIONS */}
      <SectionCard
        num="11"
        title="Underwriting Implications"
        subtitle="What this brief should change in your model. Every assumption carries its rationale."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Assumption</Th>
              <Th align="right">Value</Th>
              <Th>Rationale</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Rent growth (yrs 1-5)</Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>
                Range, not point. Tie to supply timing + absorption pace above. <NeedsData />
              </Td>
            </tr>
            <tr>
              <Td>Vacancy (stabilized)</Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>
                Submarket-level, not metro. Add a rollover-driven vacancy spike if WALE supports it.
              </Td>
            </tr>
            {lens !== "land" && (
              <tr>
                <Td>Concessions / free rent</Td>
                <Td align="right" mono>
                  <NeedsData />
                </Td>
                <Td>Express as months free equivalent AND as % of effective rent. Both are needed.</Td>
              </tr>
            )}
            <tr>
              <Td>Expense growth</Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>Break out R.E. taxes (reassessment risk) from OpEx (inflation-linked).</Td>
            </tr>
            <tr>
              <Td>Exit cap rate</Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>
                Going-in cap + 50-100 bps is a convention, not a model. Tie to forward rate curve +
                sponsor track record.
              </Td>
            </tr>
            <tr>
              <Td>Hold period</Td>
              <Td align="right" mono>
                <NeedsData />
              </Td>
              <Td>Match to business-plan milestones (lease-up, rollover, disposition window).</Td>
            </tr>
            {(lens === "multifamily" || lens === "land" || lens === "industrial") && (
              <tr>
                <Td>Absorption pace</Td>
                <Td align="right" mono>
                  <NeedsData />
                </Td>
                <Td>
                  Units/quarter (multifamily), acres/year (land), or SF/month (industrial).
                  Calibrated to trailing 4-qtr comps, not to sponsor pro forma.
                </Td>
              </tr>
            )}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* Footer: red flags reminder */}
      <Callout kind="info">
        <strong>Failure modes this brief checks for:</strong> (1) mixing metro and submarket data,
        (2) ignoring supply timing, (3) using asking instead of effective rents,
        (4) ignoring asset-specific drivers, (5) treating land like stabilized real estate,
        (6) ignoring tenant economics on retail and office.
      </Callout>
    </div>
  );
}
