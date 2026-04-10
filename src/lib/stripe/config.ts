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
  isLifetimeLimit?: boolean;   // true = total ever, false/undefined = per month
  trialDays?: number;          // Stripe trial_period_days
  stripePriceId: string | null; // null for free
  features: string[];
}

export const ANONYMOUS_LIMIT = 2; // analyses before signup required

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    tier: "free",
    priceMonthly: 0,
    uploadLimit: 5,
    isLifetimeLimit: true,     // 5 deals total, no monthly reset
    stripePriceId: null,
    features: [
      "5 deal analyses (total)",
      "Save deals to workspace",
      "Deal Signals scoring",
      "First-pass brief download",
      "Downloadable XLS worksheets of analysis",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tier: "pro",
    priceMonthly: 40,
    uploadLimit: 100,
    trialDays: 7,
    stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
    features: [
      "Up to 100 deals/month",
      "Save & organize deals",
      "Deal Signals scoring",
      "Downloadable XLS worksheets of analysis",
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
    trialDays: 7,
    stripePriceId: process.env.STRIPE_PRICE_PRO_PLUS_MONTHLY || null,
    features: [
      "Up to 200 deals/month",
      "Everything in Pro",
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
