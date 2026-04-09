import Stripe from "stripe";

// ── Stripe server-side client ───────────────────────────────
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

// ── Plan definitions ────────────────────────────────────────
export interface PlanConfig {
  id: string;
  name: string;
  tier: "free" | "pro" | "pro_plus";
  priceMonthly: number;       // dollars
  uploadLimit: number;
  stripePriceId: string | null; // null for free
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    tier: "free",
    priceMonthly: 0,
    uploadLimit: 2,
    stripePriceId: null,
    features: [
      "2 deal analyses",
      "Standard PDF extraction",
      "Basic Deal Signals score",
      "First-pass brief",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tier: "pro",
    priceMonthly: 40,
    uploadLimit: 40,
    stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
    features: [
      "Up to 40 deals/month",
      "Save & organize deals",
      "Deal Signals scoring",
      "6-sheet Excel workbook",
      "Workspace + history",
      "Property map",
      "Scoreboard",
      "Location Intelligence",
      "White-label shareable links",
    ],
  },
  pro_plus: {
    id: "pro_plus",
    name: "Pro+",
    tier: "pro_plus",
    priceMonthly: 100,
    uploadLimit: 200,
    stripePriceId: process.env.STRIPE_PRICE_PRO_PLUS_MONTHLY || null,
    features: [
      "Up to 200 deals/month",
      "Everything in Pro",
      "Advanced Location Intelligence",
      "Bulk portfolio uploads",
      "Advanced exports",
      "Priority processing",
      "Custom branding",
    ],
  },
};

// ── Helpers ─────────────────────────────────────────────────
export function getPlanByTier(tier: string): PlanConfig {
  return PLANS[tier] || PLANS.free;
}

export function getUploadLimit(tier: string): number {
  return getPlanByTier(tier).uploadLimit;
}
