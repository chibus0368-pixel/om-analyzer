/**
 * Suggested asking price for unpriced ("subject to offer", "call for
 * pricing") deals.
 *
 * Many OMs, especially on multi-tenant retail, never state a price. Every
 * analysis in the app is priced against the asking price, so a blank price
 * used to be a dead end. Instead we offer a recommendation: NOI capitalized
 * at the workspace's Target Cap Rate (Settings > Default Underwriting
 * Assumptions). The user can accept it with one click or type their own.
 *
 * This is a recommendation only. It is never written to the deal unless the
 * user accepts it, so it can't masquerade as a broker-stated number.
 */

export type SuggestedPriceNoiSource = "noi_om" | "noi_adjusted" | "noi_t12";

export interface SuggestedPrice {
  /** Rounded to the nearest $10,000. */
  price: number;
  noi: number;
  noiSource: SuggestedPriceNoiSource;
  noiLabel: string;
  capRatePct: number;
}

const NOI_LABELS: Record<SuggestedPriceNoiSource, string> = {
  noi_om: "stated NOI",
  noi_adjusted: "adjusted NOI",
  noi_t12: "trailing 12 NOI",
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param noiCandidates NOI values in priority order. The first positive one wins.
 * @param targetCapPct  Going-in cap rate as a percent (7 = 7.00%).
 */
export function suggestAskingPrice(
  noiCandidates: Partial<Record<SuggestedPriceNoiSource, unknown>>,
  targetCapPct: number | null | undefined,
): SuggestedPrice | null {
  const cap = num(targetCapPct);
  if (cap <= 0 || cap >= 30) return null;
  const order: SuggestedPriceNoiSource[] = ["noi_om", "noi_adjusted", "noi_t12"];
  for (const src of order) {
    const noi = num(noiCandidates[src]);
    if (noi > 0) {
      const raw = noi / (cap / 100);
      return {
        price: Math.round(raw / 10_000) * 10_000,
        noi,
        noiSource: src,
        noiLabel: NOI_LABELS[src],
        capRatePct: cap,
      };
    }
  }
  return null;
}
