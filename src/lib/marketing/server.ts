import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminAuth } from "@/lib/firebase-admin";

/**
 * Shared server helpers for the admin Marketing engine (email + social).
 * Everything under /api/admin/marketing is admin-only; the cron runner and
 * OAuth callbacks authenticate separately.
 */

export const ADMIN_EMAIL = "chibus0368@gmail.com";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.scoreom.com").replace(/\/$/, "");

export const COLL = {
  broadcasts: "marketing_broadcasts",
  drips: "marketing_drips",
  enrollments: "marketing_drip_enrollments",
  sends: "marketing_sends",
  suppressions: "marketing_suppressions",
  social: "marketing_social_posts",
  accounts: "marketing_social_accounts",
  oauthStates: "marketing_oauth_states",
  runs: "marketing_runs",
} as const;

export async function verifyAdmin(req: NextRequest): Promise<{ uid: string; email: string } | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(h.slice(7));
    if (decoded.email !== ADMIN_EMAIL) return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/** Cron / scheduler auth: Vercel Cron bearer, or x-admin-secret for manual runs. */
export function verifyCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const adminSecret = req.headers.get("x-admin-secret");
  return !!(adminSecret && process.env.ADMIN_SECRET && adminSecret === process.env.ADMIN_SECRET);
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Firestore Timestamp | ISO string | Date | millis -> ISO string ("" if missing). */
export function toIso(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (typeof v._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return "";
}

export function emailKey(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function secret(): string {
  return process.env.MARKETING_SECRET || process.env.CRON_SECRET || process.env.ADMIN_SECRET || "scoreom-marketing";
}

export function unsubToken(email: string): string {
  return crypto.createHmac("sha256", secret()).update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function verifyUnsubToken(email: string, token: string): boolean {
  const expected = unsubToken(email);
  return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function unsubUrl(email: string): string {
  return `${SITE_URL}/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
}

export function unsubApiUrl(email: string): string {
  return `${SITE_URL}/api/marketing/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
}

export function randomId(n = 24): string {
  return crypto.randomBytes(n).toString("base64url");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomId(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
