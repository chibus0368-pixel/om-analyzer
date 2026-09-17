/**
 * Value-add lens.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Both halves of the platform assumed a stabilized, income-producing asset,
 * and they failed in opposite directions on the same half-empty deal:
 *
 *   - The scoring model graded in-place income quality. A 50%-vacant building
 *     lost points in the vacancy category, lost the "occupancy >= 95" check
 *     buried inside the tenant category, and failed DSCR / debt-yield in the
 *     cashflow category. It earned that back in exactly one place, worth about
 *     1.7 points of the final 100. Priced-for-the-vacancy deals scored in the
 *     30s no matter how good the basis was.
 *
 *   - Quick Screen took `expenses.noi_om` as Year 1 NOI. On a value-add
 *     listing that field is usually the broker's STABILIZED pro forma, while
 *     the ask is the vacant price. Dividing one by the other produced a
 *     fictitious going-in cap (13%+ on real deals), and since the exit cap is
 *     anchored to the going-in cap, the fiction was never punished. Bear cases
 *     printed above 20%.
 *
 * So the score said "pass" while the returns said "outstanding", on the same
 * deal, for opposite reasons. Neither number was answering the question a
 * value-add buyer is actually asking, which is not "how good is the income
 * today" but "am I buying this far enough below what it's worth stabilized to
 * get paid for the work".
 *
 * WHAT THIS MODULE DOES
 *
 * 1. `resolveNoiBasis` separates in-place NOI from stabilized NOI, and detects
 *    when the OM's stated NOI is really a stabilized pro forma. Underwriting
 *    runs on in-place; stabilized becomes the upside case.
 *
 * 2. `computeValueAddLens` scores the deal on BASIS: the discount to
 *    stabilized value net of what lease-up costs, price against replacement
 *    cost, and price against the asset class's own $/SF band.
 *
 * 3. `reweightForLens` moves weight out of the categories that measure
 *    stabilized income quality and into that basis score, so a vacant building
 *    bought right stops being graded as a broken stabilized building.
 *
 * This module is pure and has no Firestore or React dependency, so both the
 * server score engine and the client Quick Screen consume the same numbers.
 */

import {
  getAssetProfile,
  leaseUpCostPerUnitFor,
  stabilizedOccupancyPctFor,
  replacementCostFor,
  type AssetType,
  type UnitType,
} from "./asset-profiles";

/* ────────────────────────────────────────────────────────────
   NOI basis
   ──────────────────────────────────────────────────────────── */

export type NoiBasisKind =
  /** Confirmed in-place: the rent roll supports it, the building is already
   *  stabilized, or the user said so in Deal Inputs. */
  | "in_place"
  /** Confirmed pro forma: the rent roll can't produce it, or the implied cap
   *  is so far past the asset class band that nothing else explains it. */
  | "stated_is_stabilized"
  /** Materially vacant with no rent roll to check against. We ASSUME the OM
   *  quoted a pro forma, because that is what value-add listings do, and
   *  because assuming otherwise is how a 3.9% real cap prints as a 20% IRR.
   *  Flagged so the user can flip it in Deal Inputs. */
  | "assumed_stabilized"
  /** Not enough information to tell them apart. */
  | "unknown";

export interface NoiBasis {
  kind: NoiBasisKind;
  /** What the building earns today. Underwrite Year 1 on this. */
  inPlaceNoi: number | null;
  /** What it earns once leased to the asset class's stabilized occupancy. */
  stabilizedNoi: number | null;
  /** Occupancy this asset class is considered stabilized at. */
  stabilizedOccPct: number;
  /** Cap implied by the STATED noi against the ask. Diagnostic only. */
  statedImpliedCapPct: number | null;
  /** Plain-language explanation of the call, for the UI and the audit trail. */
  reason: string;
}

export interface NoiBasisInput {
  statedNoi: number | null;
  purchasePrice: number | null;
  occupancyPct: number | null;
  assetType: AssetType | null | undefined;
  /**
   * Sum of actual contract rents from the rent roll, when we have one. This is
   * the strongest in-place signal available and overrides the heuristic below.
   */
  rentRollBaseRent?: number | null;
  /**
   * User's call from Deal Inputs, which beats every heuristic here. Set this
   * when someone has read the OM and knows which number they're looking at.
   */
  userBasis?: "in_place" | "stabilized" | null;
}

/**
 * How far above the asset class's own cap band a stated NOI has to imply
 * before we stop believing it is in-place income. A genuinely in-place NOI on
 * a half-empty building priced for that vacancy lands INSIDE or BELOW the
 * band. A stabilized NOI measured against a vacant price lands far above it.
 * 200bps of headroom keeps a merely well-priced stabilized deal from tripping
 * the detector.
 */
const STABILIZED_NOI_CAP_HEADROOM_PCT = 2.0;

/**
 * Occupancy has to be at least this many points below the asset class's
 * stabilized level before any of this engages. A building 3 points light is
 * frictional vacancy, not a business plan.
 */
const MATERIAL_VACANCY_GAP_PTS = 8;

export function resolveNoiBasis(input: NoiBasisInput): NoiBasis {
  const { statedNoi, purchasePrice, occupancyPct, assetType, rentRollBaseRent, userBasis } = input;
  const profile = getAssetProfile(assetType);
  const stabilizedOccPct = stabilizedOccupancyPctFor(assetType);

  const statedImpliedCapPct =
    statedNoi && purchasePrice && statedNoi > 0 && purchasePrice > 0
      ? (statedNoi / purchasePrice) * 100
      : null;

  const nothing: NoiBasis = {
    kind: "unknown",
    inPlaceNoi: statedNoi && statedNoi > 0 ? statedNoi : null,
    stabilizedNoi: null,
    stabilizedOccPct,
    statedImpliedCapPct,
    reason: "Not enough data to separate in-place from stabilized income.",
  };

  if (!statedNoi || statedNoi <= 0) return nothing;

  // A human who has read the OM outranks every heuristic below.
  if (userBasis && occupancyPct != null && Number.isFinite(occupancyPct)) {
    const occ = Math.max(occupancyPct, 1);
    if (userBasis === "stabilized") {
      return {
        kind: "stated_is_stabilized",
        inPlaceNoi: statedNoi * (occ / stabilizedOccPct),
        stabilizedNoi: statedNoi,
        stabilizedOccPct,
        statedImpliedCapPct,
        reason: "Marked as a stabilized pro forma in Deal Inputs.",
      };
    }
    return {
      kind: "in_place",
      inPlaceNoi: statedNoi,
      stabilizedNoi: statedNoi * (stabilizedOccPct / occ),
      stabilizedOccPct,
      statedImpliedCapPct,
      reason: "Marked as in-place income in Deal Inputs.",
    };
  }
  if (occupancyPct == null || !Number.isFinite(occupancyPct)) {
    return {
      ...nothing,
      kind: "in_place",
      inPlaceNoi: statedNoi,
      reason: "Occupancy not stated; treating the OM NOI as in-place income.",
    };
  }

  const vacancyGapPts = stabilizedOccPct - occupancyPct;

  // Fully (or near enough) leased: stated NOI is in-place by definition and
  // there is no stabilization gap to speak of.
  if (vacancyGapPts < MATERIAL_VACANCY_GAP_PTS) {
    return {
      kind: "in_place",
      inPlaceNoi: statedNoi,
      stabilizedNoi: statedNoi,
      stabilizedOccPct,
      statedImpliedCapPct,
      reason: `${occupancyPct.toFixed(0)}% occupied is at or near the ${stabilizedOccPct}% stabilized level for ${profile.label.toLowerCase()}; in-place and stabilized income are the same number.`,
    };
  }

  // Materially vacant. Now the hard part.
  //
  // From (NOI, price, occupancy) alone these two deals are INDISTINGUISHABLE:
  //
  //   A. $200K in-place on a 50% building asked at $2.8M -> 7.1% going-in cap,
  //      and $368K once stabilized. A genuinely excellent deal.
  //   B. $200K STABILIZED quoted on the same building at the same ask -> the
  //      building really earns $109K, a 3.9% going-in cap. A bad deal.
  //
  // Both print a 7.1% cap. The information to separate them is not in those
  // three numbers, so we do not pretend otherwise. We look for evidence, and
  // where there is none we take the conservative reading and say we did.

  // Evidence 1, strongest: an actual rent roll. If the contract rents on the
  // ground can't support the stated NOI before a dollar of expense, the stated
  // NOI is not in-place. This is proof, not inference.
  if (rentRollBaseRent && rentRollBaseRent > 0) {
    const maxPlausibleInPlaceNoi = rentRollBaseRent * (1 - profile.opexRatioDefault);
    if (statedNoi > maxPlausibleInPlaceNoi * 1.25) {
      return {
        kind: "stated_is_stabilized",
        inPlaceNoi: maxPlausibleInPlaceNoi,
        stabilizedNoi: statedNoi,
        stabilizedOccPct,
        statedImpliedCapPct,
        reason: `Contract rents on the rent roll ($${Math.round(rentRollBaseRent).toLocaleString()}) can't produce the stated NOI of $${Math.round(statedNoi).toLocaleString()}. Treating the OM figure as a stabilized pro forma and underwriting $${Math.round(maxPlausibleInPlaceNoi).toLocaleString()} in-place.`,
      };
    }
    return {
      kind: "in_place",
      inPlaceNoi: statedNoi,
      stabilizedNoi: statedNoi * (stabilizedOccPct / Math.max(occupancyPct, 1)),
      stabilizedOccPct,
      statedImpliedCapPct,
      reason: `Rent roll confirms the stated NOI as in-place at ${occupancyPct.toFixed(0)}% occupancy. Stabilized at ${stabilizedOccPct}% would be about $${Math.round(statedNoi * (stabilizedOccPct / Math.max(occupancyPct, 1))).toLocaleString()}.`,
    };
  }

  // Evidence 2: a cap so far past the class band that in-place income is the
  // only reading that doesn't work. Nobody prices a half-empty strip center at
  // a genuine 13% in-place cap.
  const capCeiling = profile.capBandHighPct + STABILIZED_NOI_CAP_HEADROOM_PCT;
  const inPlaceFromGrossDown = statedNoi * (occupancyPct / stabilizedOccPct);
  if (statedImpliedCapPct != null && capCeiling > 0 && statedImpliedCapPct > capCeiling) {
    return {
      kind: "stated_is_stabilized",
      inPlaceNoi: inPlaceFromGrossDown,
      stabilizedNoi: statedNoi,
      stabilizedOccPct,
      statedImpliedCapPct,
      reason: `The OM NOI against the ask implies a ${statedImpliedCapPct.toFixed(1)}% going-in cap on a building that is ${occupancyPct.toFixed(0)}% occupied, well past the ${profile.capBandDesc}. That is a stabilized pro forma, not in-place income. Underwriting $${Math.round(inPlaceFromGrossDown).toLocaleString()} in-place and carrying $${Math.round(statedNoi).toLocaleString()} as the stabilized case.`,
    };
  }

  // No evidence either way. Assume pro forma, because that is what value-add
  // listings quote, and because the cost of being wrong is asymmetric: read a
  // pro forma as in-place and a 3.9% cap underwrites as a 20% IRR. Read
  // in-place as pro forma and the deal looks better than we scored it, which
  // the user finds out by opening the OM.
  return {
    kind: "assumed_stabilized",
    inPlaceNoi: inPlaceFromGrossDown,
    stabilizedNoi: statedNoi,
    stabilizedOccPct,
    statedImpliedCapPct,
    reason: `${occupancyPct.toFixed(0)}% occupied with no rent roll to check the OM's NOI against. Value-add listings usually quote a stabilized pro forma, so that is the assumption here: $${Math.round(inPlaceFromGrossDown).toLocaleString()} in-place, $${Math.round(statedNoi).toLocaleString()} stabilized. If the OM's number is in-place income, set it in Deal Inputs and the underwriting will follow.`,
  };
}

/* ────────────────────────────────────────────────────────────
   The lens
   ──────────────────────────────────────────────────────────── */

export interface ValueAddLensInput {
  purchasePrice: number | null;
  occupancyPct: number | null;
  assetType: AssetType | null | undefined;
  unitType: UnitType;
  /** Building SF, or unit count for multifamily. */
  unitsOrSf: number | null;
  pricePerUnitOrSf?: number | null;
  yearBuilt?: number | null;
  /** Institutional vs small-operator changes the replacement-cost anchor. */
  institutional?: boolean;
  noi: NoiBasis;
}

export interface ValueAddLens {
  /** Whether the deal should be graded on basis instead of in-place income. */
  active: boolean;
  reason: string;
  /** Value once stabilized, at the midpoint of the asset class cap band. */
  stabilizedValue: number | null;
  stabilizedCapPct: number | null;
  /** TI, leasing commissions and a year of foregone income on the vacant space. */
  leaseUpCost: number | null;
  /**
   * The number that actually matters: what you'd clear at stabilized value
   * after paying the ask AND funding the lease-up, as a share of that value.
   */
  marginPct: number | null;
  /** 0-100. Feeds the scoring model as its own weighted category. */
  basisScore: number | null;
  notes: string[];
}

/** Interpolate a 0-100 score across an ordered list of [input, score] anchors. */
function interpolateScore(value: number, anchors: [number, number][]): number {
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0 || 1);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

export function computeValueAddLens(input: ValueAddLensInput): ValueAddLens {
  const {
    purchasePrice, occupancyPct, assetType, unitType, unitsOrSf,
    pricePerUnitOrSf, yearBuilt, institutional, noi,
  } = input;

  const profile = getAssetProfile(assetType);
  const idle: ValueAddLens = {
    active: false,
    reason: "Stabilized asset; graded on in-place income.",
    stabilizedValue: null,
    stabilizedCapPct: null,
    leaseUpCost: null,
    marginPct: null,
    basisScore: null,
    notes: [],
  };

  // Land has no income to stabilize; the lens is meaningless there.
  if (assetType === "land") return idle;
  if (!purchasePrice || purchasePrice <= 0) return idle;
  if (occupancyPct == null || !Number.isFinite(occupancyPct)) return idle;

  const vacancyGapPts = noi.stabilizedOccPct - occupancyPct;
  const isValueAdd =
    vacancyGapPts >= MATERIAL_VACANCY_GAP_PTS ||
    noi.kind === "stated_is_stabilized" ||
    noi.kind === "assumed_stabilized";
  if (!isValueAdd) return idle;

  const notes: string[] = [];

  // Stabilized value at the midpoint of the class cap band. Midpoint rather
  // than the tight end so we aren't handing out credit for an exit that only
  // works at the best cap the class has printed.
  const stabilizedCapPct = (profile.capBandLowPct + profile.capBandHighPct) / 2;
  const stabilizedValue =
    noi.stabilizedNoi && noi.stabilizedNoi > 0 && stabilizedCapPct > 0
      ? noi.stabilizedNoi / (stabilizedCapPct / 100)
      : null;

  // Cost to get there: TI/LC on the vacant space, plus a year of the income
  // you don't collect while leasing it.
  let leaseUpCost: number | null = null;
  if (unitsOrSf && unitsOrSf > 0) {
    const vacantUnits = unitsOrSf * Math.max(0, (noi.stabilizedOccPct - occupancyPct) / 100);
    const tiLc = vacantUnits * leaseUpCostPerUnitFor(assetType, unitType);
    const foregoneYear =
      noi.stabilizedNoi != null && noi.inPlaceNoi != null
        ? Math.max(0, noi.stabilizedNoi - noi.inPlaceNoi)
        : 0;
    leaseUpCost = tiLc + foregoneYear;
    notes.push(
      `Lease-up charged at $${Math.round(tiLc).toLocaleString()} of TI/LC on ${Math.round(vacantUnits).toLocaleString()} vacant ${unitType === "units" ? "units" : "SF"} plus one year of foregone income.`,
    );
  }

  const marginPct =
    stabilizedValue && stabilizedValue > 0
      ? ((stabilizedValue - purchasePrice - (leaseUpCost ?? 0)) / stabilizedValue) * 100
      : null;

  /* ── Basis score ──
     Three questions, in order of how much they decide the deal:
       1. Is the spread to stabilized value wide enough to pay for the work
          and still leave a return? (60%)
       2. Is the price under what it would cost to build? (25%)
       3. Is the price under the class's own $/SF band? (15%)
     Any component we can't measure drops out and the rest are renormalized,
     so a thin OM doesn't silently score as a bad one. */
  const parts: { weight: number; score: number }[] = [];

  if (marginPct != null) {
    parts.push({
      weight: 60,
      score: interpolateScore(marginPct, [
        [-10, 0], [0, 20], [10, 45], [20, 70], [30, 88], [40, 100],
      ]),
    });
    notes.push(
      marginPct > 0
        ? `Ask plus lease-up sits ${marginPct.toFixed(0)}% below stabilized value at a ${stabilizedCapPct.toFixed(2)}% cap.`
        : `Ask plus lease-up is ${Math.abs(marginPct).toFixed(0)}% ABOVE stabilized value at a ${stabilizedCapPct.toFixed(2)}% cap. The seller is charging for work you have to do.`,
    );
  }

  const replacementPerUnit = replacementCostFor(
    profile.key, unitType, institutional ? "institutional" : "small-operator",
  );
  const ppu = pricePerUnitOrSf ?? (unitsOrSf && unitsOrSf > 0 ? purchasePrice / unitsOrSf : null);
  if (ppu && ppu > 0 && replacementPerUnit > 0) {
    const vsReplacementPct = (ppu / replacementPerUnit) * 100;
    parts.push({
      weight: 25,
      score: interpolateScore(vsReplacementPct, [
        [35, 100], [50, 88], [65, 70], [80, 48], [100, 25], [120, 0],
      ]),
    });
    notes.push(
      `Ask is ${vsReplacementPct.toFixed(0)}% of estimated replacement cost ($${Math.round(replacementPerUnit).toLocaleString()}/${profile.priceUnitLabel}).`,
    );
  }

  if (ppu && ppu > 0 && profile.pricePerUnitMin && profile.pricePerUnitMax) {
    const span = profile.pricePerUnitMax - profile.pricePerUnitMin;
    const positionPct = span > 0 ? ((ppu - profile.pricePerUnitMin) / span) * 100 : 50;
    parts.push({
      weight: 15,
      score: interpolateScore(positionPct, [[0, 100], [25, 80], [50, 55], [75, 30], [100, 10]]),
    });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const basisScore =
    totalWeight > 0
      ? Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight)
      : null;

  if (yearBuilt && yearBuilt < 1985) {
    notes.push(`Built ${yearBuilt}; confirm roof, envelope and mechanicals before trusting the lease-up budget.`);
  }

  return {
    active: true,
    reason:
      noi.kind === "stated_is_stabilized"
        ? `${occupancyPct.toFixed(0)}% occupied and the OM NOI reads as a stabilized pro forma. Graded on basis, not on in-place income.`
        : noi.kind === "assumed_stabilized"
        ? `${occupancyPct.toFixed(0)}% occupied, OM NOI assumed to be a pro forma. Graded on basis, not on in-place income.`
        : `${occupancyPct.toFixed(0)}% occupied against a ${noi.stabilizedOccPct}% stabilized level for ${profile.label.toLowerCase()}. Graded on basis, not on in-place income.`,
    stabilizedValue,
    stabilizedCapPct,
    leaseUpCost,
    marginPct,
    basisScore,
    notes,
  };
}

/* ────────────────────────────────────────────────────────────
   Applying the lens to a weighted scoring model
   ──────────────────────────────────────────────────────────── */

/** Weight the basis category carries once the lens is active. */
export const BASIS_CATEGORY_WEIGHT = 22;

/**
 * Categories that grade stabilized income quality. On a value-add deal these
 * are measuring the thing the buyer is deliberately not paying for, so the
 * lens takes weight out of them proportionally and gives it to basis. They
 * still count — a vacant building with a broken rent roll is still worse than
 * a vacant building with a clean one — they just stop dominating.
 */
export const INCOME_QUALITY_CATEGORIES = ["cashflow", "tenant", "rollover", "vacancy"] as const;

/**
 * Move `basisWeight` points out of `dampen` (pro rata) and return the new
 * weight map plus the freed weight. Total weight is preserved, so the score
 * stays on the same 0-100 scale and bands don't shift underneath the user.
 */
export function reweightForLens<T extends string>(
  weights: Record<T, number>,
  // Deliberately `string[]` and not `T[]`: typing it as T makes TypeScript
  // infer T from the dampen list too, narrowing the returned weight map to
  // just the dampened keys and losing every category we did not touch.
  dampen: readonly string[],
  basisWeight: number = BASIS_CATEGORY_WEIGHT,
): { weights: Record<T, number>; basisWeight: number } {
  const w = weights as Record<string, number>;
  const pool = dampen.reduce((s, k) => s + (w[k] ?? 0), 0);
  if (pool <= 0) return { weights: { ...weights }, basisWeight: 0 };

  // Never take more than 60% of the income-quality weight. Even on a shell,
  // how the existing income behaves is worth something.
  const taken = Math.min(basisWeight, pool * 0.6);
  const next: Record<string, number> = { ...w };
  for (const k of dampen) {
    const cur = next[k] ?? 0;
    next[k] = cur - taken * (cur / pool);
  }
  return { weights: next as Record<T, number>, basisWeight: taken };
}

/* ────────────────────────────────────────────────────────────
   Adapters
   ──────────────────────────────────────────────────────────── */

/**
 * Field maps come in two shapes in this codebase: the retail path in
 * score-engine stores `{ value, confidence }` per key, the scoring-models
 * path stores the raw value. Unwrap both.
 */
function readNum(fields: Record<string, any>, ...keys: string[]): number | null {
  for (const k of keys) {
    let v = fields[k];
    if (v !== null && v !== undefined && typeof v === "object" && "value" in v) v = v.value;
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readStr(fields: Record<string, any>, ...keys: string[]): string | null {
  for (const k of keys) {
    let v = fields[k];
    if (v !== null && v !== undefined && typeof v === "object" && "value" in v) v = v.value;
    if (v === null || v === undefined || v === "") continue;
    return String(v);
  }
  return null;
}

/** Sum the contract rents actually listed on the rent roll, if there is one. */
function sumRentRoll(fields: Record<string, any>): number | null {
  let total = 0;
  let found = 0;
  for (const key of Object.keys(fields)) {
    if (!/^rent_roll\.tenant_\d+_rent$/.test(key)) continue;
    const n = readNum(fields, key);
    if (n != null && n > 0) { total += n; found++; }
  }
  if (found > 0) return total;
  return readNum(fields, "income.base_rent", "rent_roll.total_rent", "income.total_rent");
}

export function assetTypeFromAnalysisType(analysisType: string | null | undefined): AssetType {
  switch ((analysisType || "").toLowerCase()) {
    case "retail": return "retail";
    case "industrial": return "industrial";
    case "office": return "office";
    case "medical_office": return "medical_office";
    case "mixed_use": return "mixed_use";
    case "multifamily": return "multifamily";
    case "land": return "land";
    default: return "other";
  }
}

/**
 * Build the NOI basis + lens straight off a flat extracted-field map. Both the
 * server score engine and the client Quick Screen call this, so a deal can
 * never be scored on one basis and underwritten on another.
 */
export function lensFromFieldMap(
  fields: Record<string, any>,
  analysisType: string | null | undefined,
): { noi: NoiBasis; lens: ValueAddLens } {
  const assetType = assetTypeFromAnalysisType(analysisType);
  const unitType: UnitType = assetType === "multifamily" ? "units" : "sf";

  const purchasePrice = readNum(
    fields,
    "pricing_deal_terms.asking_price",
    "pricing_deal_terms.purchase_price",
    "pricing_deal_terms.list_price",
  );
  const statedNoi = readNum(
    fields,
    "expenses.noi_om",
    "expenses.noi",
    "expenses.noi_adjusted",
    "expenses.net_operating_income",
  );
  const occupancyPct = readNum(
    fields,
    "property_basics.occupancy_pct",
    "property_basics.occupancy",
  );
  const unitsOrSf =
    unitType === "units"
      ? readNum(fields, "multifamily_addons.unit_count", "property_basics.unit_count")
      : readNum(fields, "property_basics.building_sf", "property_basics.gla");
  const pricePerUnitOrSf = readNum(
    fields,
    unitType === "units" ? "pricing_deal_terms.price_per_unit" : "pricing_deal_terms.price_per_sf",
    "pricing_deal_terms.price_psf",
  );
  const yearBuilt = readNum(fields, "property_basics.year_built");

  const rawBasis = readStr(fields, "underwriting.noi_basis")?.toLowerCase();
  const userBasis =
    rawBasis === "in_place" || rawBasis === "in-place" ? "in_place" :
    rawBasis === "stabilized" || rawBasis === "pro_forma" || rawBasis === "proforma" ? "stabilized" :
    null;

  const noi = resolveNoiBasis({
    statedNoi,
    purchasePrice,
    occupancyPct,
    assetType,
    rentRollBaseRent: sumRentRoll(fields),
    userBasis,
  });

  const lens = computeValueAddLens({
    purchasePrice,
    occupancyPct,
    assetType,
    unitType,
    unitsOrSf,
    pricePerUnitOrSf,
    yearBuilt,
    noi,
  });

  return { noi, lens };
}

/* ────────────────────────────────────────────────────────────
   Applying the lens to a category list
   ──────────────────────────────────────────────────────────── */

export interface LensCategory {
  name: string;
  weight: number;
  score: number;
  explanation: string;
}

/**
 * Category names vary per asset model ("Income Quality", "Occupancy
 * Stability", "Tenant Mix", "Lease Rollover"...), so match on meaning rather
 * than maintaining a per-model list that will drift.
 */
export function isIncomeQualityCategory(name: string): boolean {
  return /income|cash\s*flow|tenant|lease|occupanc|rollover|vacanc/i.test(name);
}

/**
 * Reweight a scored category list for a value-add deal and append the basis
 * category. Total weight is preserved so the 0-100 scale and the score bands
 * stay put. Returns the original list untouched when the lens is idle.
 */
export function applyLensToCategories(
  categories: LensCategory[],
  lens: ValueAddLens,
): { categories: LensCategory[]; totalScore: number } {
  const recompute = (cats: LensCategory[]) => {
    const w = cats.reduce((s, c) => s + c.weight, 0);
    return w > 0 ? Math.round(cats.reduce((s, c) => s + c.score * c.weight, 0) / w) : 0;
  };

  if (!lens.active || lens.basisScore == null) {
    return { categories, totalScore: recompute(categories) };
  }

  const dampenNames = categories.filter(c => isIncomeQualityCategory(c.name)).map(c => c.name);
  const weightMap: Record<string, number> = {};
  categories.forEach(c => { weightMap[c.name] = c.weight; });

  const { weights, basisWeight } = reweightForLens(weightMap, dampenNames);
  if (basisWeight <= 0) {
    return { categories, totalScore: recompute(categories) };
  }

  const next: LensCategory[] = categories.map(c => ({ ...c, weight: weights[c.name] ?? c.weight }));
  next.push({
    name: "Basis / Value-Add Margin",
    weight: basisWeight,
    score: lens.basisScore,
    explanation: [lens.reason, ...lens.notes].join(" "),
  });

  return { categories: next, totalScore: recompute(next) };
}
