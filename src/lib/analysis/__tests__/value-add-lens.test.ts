import {
  resolveNoiBasis,
  computeValueAddLens,
  reweightForLens,
  INCOME_QUALITY_CATEGORIES,
} from "../value-add-lens";

/**
 * The deal that started this: a 20,000 SF retail strip at 50% leased, asked
 * at $1.5M. The OM quotes the STABILIZED NOI of $200K; the building actually
 * earns about $100K today. Before the lens, Quick Screen read $200K/$1.5M as
 * a 13.3% going-in cap and printed a 22% bear case, while the scoring model
 * graded the same deal in the 30s.
 */
const HALF_EMPTY_STRIP = {
  statedNoi: 200_000,
  purchasePrice: 1_500_000,
  occupancyPct: 50,
  assetType: "retail" as const,
};

describe("resolveNoiBasis", () => {
  it("catches a stabilized pro forma quoted against a vacant price", () => {
    const b = resolveNoiBasis(HALF_EMPTY_STRIP);
    expect(b.kind).toBe("stated_is_stabilized");
    expect(b.stabilizedNoi).toBe(200_000);
    // 50% occupied against retail's 92% stabilized level.
    expect(b.inPlaceNoi).toBeCloseTo(200_000 * (50 / 92), 0);
    expect(b.statedImpliedCapPct).toBeCloseTo(13.33, 1);
  });

  it("leaves a fully leased deal alone", () => {
    const b = resolveNoiBasis({
      statedNoi: 100_000, purchasePrice: 1_400_000, occupancyPct: 100, assetType: "retail",
    });
    expect(b.kind).toBe("in_place");
    expect(b.inPlaceNoi).toBe(100_000);
    expect(b.stabilizedNoi).toBe(100_000);
  });

  it("assumes pro forma when materially vacant and nothing can confirm otherwise", () => {
    // 60% occupied, $100K against a $1.3M ask = 7.7% cap, inside retail's
    // 6.5-8.0% band. The cap tell can't fire, and there is no rent roll, so
    // in-place and pro forma are indistinguishable from these three numbers.
    // We take the conservative reading and flag it as an assumption.
    const b = resolveNoiBasis({
      statedNoi: 100_000, purchasePrice: 1_300_000, occupancyPct: 60, assetType: "retail",
    });
    expect(b.kind).toBe("assumed_stabilized");
    expect(b.stabilizedNoi).toBe(100_000);
    expect(b.inPlaceNoi).toBeCloseTo(100_000 * (60 / 92), 0);
    expect(b.reason).toMatch(/Deal Inputs/);
  });

  it("flips back to in-place when the rent roll backs the OM number", () => {
    // Same deal, but contract rents of $128K comfortably support a $100K NOI.
    const b = resolveNoiBasis({
      statedNoi: 100_000, purchasePrice: 1_300_000, occupancyPct: 60,
      assetType: "retail", rentRollBaseRent: 128_000,
    });
    expect(b.kind).toBe("in_place");
    expect(b.inPlaceNoi).toBe(100_000);
    expect(b.stabilizedNoi!).toBeGreaterThan(100_000);
  });

  it("lets a human override the assumption from Deal Inputs", () => {
    const b = resolveNoiBasis({
      statedNoi: 100_000, purchasePrice: 1_300_000, occupancyPct: 60,
      assetType: "retail", userBasis: "in_place",
    });
    expect(b.kind).toBe("in_place");
    expect(b.inPlaceNoi).toBe(100_000);
  });

  it("believes the rent roll over the OM headline", () => {
    // Contract rents of $130K can't produce a $200K NOI at any expense ratio.
    const b = resolveNoiBasis({ ...HALF_EMPTY_STRIP, rentRollBaseRent: 130_000 });
    expect(b.kind).toBe("stated_is_stabilized");
    expect(b.inPlaceNoi).toBeCloseTo(130_000 * (1 - 0.22), 0);
  });

  it("survives a missing occupancy without inventing one", () => {
    const b = resolveNoiBasis({ ...HALF_EMPTY_STRIP, occupancyPct: null });
    expect(b.kind).toBe("in_place");
    expect(b.inPlaceNoi).toBe(200_000);
  });
});

describe("computeValueAddLens", () => {
  const base = {
    purchasePrice: 1_500_000,
    occupancyPct: 50,
    assetType: "retail" as const,
    unitType: "sf" as const,
    unitsOrSf: 20_000,
    yearBuilt: 1998,
  };

  it("engages on a materially vacant deal and rewards a real discount", () => {
    const noi = resolveNoiBasis(HALF_EMPTY_STRIP);
    const lens = computeValueAddLens({ ...base, noi });
    expect(lens.active).toBe(true);
    // Stabilized value at retail's 7.25% band midpoint on $200K NOI.
    expect(lens.stabilizedValue).toBeCloseTo(200_000 / 0.0725, -3);
    expect(lens.marginPct).toBeGreaterThan(0);
    expect(lens.basisScore).toBeGreaterThan(50);
  });

  it("stays out of the way on a stabilized deal", () => {
    const noi = resolveNoiBasis({
      statedNoi: 100_000, purchasePrice: 1_400_000, occupancyPct: 96, assetType: "retail",
    });
    const lens = computeValueAddLens({
      ...base, purchasePrice: 1_400_000, occupancyPct: 96, noi,
    });
    expect(lens.active).toBe(false);
    expect(lens.basisScore).toBeNull();
  });

  it("punishes a vacant deal priced as if it were already stabilized", () => {
    // Same building, seller asking full stabilized value.
    const noi = resolveNoiBasis({ ...HALF_EMPTY_STRIP, purchasePrice: 2_800_000 });
    const lens = computeValueAddLens({ ...base, purchasePrice: 2_800_000, noi });
    expect(lens.active).toBe(true);
    expect(lens.marginPct!).toBeLessThan(0);
    expect(lens.basisScore!).toBeLessThan(35);
  });

  it("charges the deal for lease-up rather than crediting the gap as free", () => {
    const noi = resolveNoiBasis(HALF_EMPTY_STRIP);
    const lens = computeValueAddLens({ ...base, noi });
    // 42 points of vacancy across 20,000 SF at $25/SF TI/LC, plus a year of
    // the income being foregone.
    expect(lens.leaseUpCost!).toBeGreaterThan(20_000 * 0.42 * 25);
  });

  it("never engages on land", () => {
    const noi = resolveNoiBasis({ ...HALF_EMPTY_STRIP, assetType: "land" });
    const lens = computeValueAddLens({
      ...base, assetType: "land", noi,
    });
    expect(lens.active).toBe(false);
  });
});

describe("reweightForLens", () => {
  const RETAIL_WEIGHTS = {
    pricing: 15, cashflow: 15, upside: 10, tenant: 12, rollover: 10,
    vacancy: 8, location: 10, physical: 8, redevelopment: 5, confidence: 7,
  };

  it("preserves total weight so score bands don't move under the user", () => {
    const { weights, basisWeight } = reweightForLens(
      RETAIL_WEIGHTS, INCOME_QUALITY_CATEGORIES,
    );
    const total = Object.values(weights).reduce((s, w) => s + w, 0) + basisWeight;
    expect(total).toBeCloseTo(100, 6);
  });

  it("takes weight only from the income-quality categories", () => {
    const { weights } = reweightForLens(RETAIL_WEIGHTS, INCOME_QUALITY_CATEGORIES);
    expect(weights.pricing).toBe(15);
    expect(weights.location).toBe(10);
    expect(weights.cashflow).toBeLessThan(15);
    expect(weights.vacancy).toBeLessThan(8);
  });

  it("leaves income quality with real weight rather than zeroing it", () => {
    const { weights } = reweightForLens(RETAIL_WEIGHTS, INCOME_QUALITY_CATEGORIES);
    const remaining = INCOME_QUALITY_CATEGORIES.reduce((s, k) => s + weights[k], 0);
    const original = INCOME_QUALITY_CATEGORIES.reduce((s, k) => s + RETAIL_WEIGHTS[k], 0);
    expect(remaining).toBeGreaterThanOrEqual(original * 0.4);
  });
});
