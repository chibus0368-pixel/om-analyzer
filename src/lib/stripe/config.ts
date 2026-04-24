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

export const ANONYMOUS_LIMIT = 2; // free trial analyses before signup is prompted
export const LEAD_LIMIT = 5;       // legacy email-only "lead" tier - kept for in-flight users

export const PLANS: Record<string, PlanConfig> = {
  anonymous: {
    id: "anonymous",
    name: "Trial",
    tier: "anonymous",
    priceMonthly: 0,
    uploadLimit: 2,
    isLifetimeLimit: true,     // 2 deals total, no monthly reset - signup is the gate
    stripePriceId: null,
    features: [
      "2 free deal analyses",
      "Full Pro property page",
      "First-pass brief download",
      "Downloadable XLS underwriting",
    ],
  },
  free: {
    id: "free",
    name: "Free",
    tier: "free",
    priceMonthly: 0,
    uploadLimit: 7,
    isLifetimeLimit: false,    // 7 deals per month for signed-up users
    stripePriceId: null,
    features: [
      "7 deal analyses per month",
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
      "100 deal analyses/month",
      "Save deals to workspace",
      "Deal Signals scoring",
      "Downloadable XLS worksheets of analysis",
      "First-pass brief download",
      "Pro DealBoard with history",
      "Interactive property map",
      "Deal comparison scoreboard",
      "Location Intelligence",
      "White-label shareable links",
    ],
  },
  pro_plus: {
    id: "pro_plus",
    name: "Pro+",
    tier: "pro_plus",
    priceMonthly: 100,
    uploadLimit: 500,
    trialDays: 7,
    stripePriceId: process.env.STRIPE_PRICE_PRO_PLUS_MONTHLY || null,
    features: [
      "500 deal analyses/month",
      "Everything in Pro",
      "Strategy Analysis exports (Core / Value-Add / Opportunistic)",
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
