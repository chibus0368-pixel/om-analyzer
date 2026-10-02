import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { groupAnonymousUsers, groupEmailLeads, groupSavePrompt, type AnonUserRow, type LeadRow } from "@/lib/bot-trials";

/**
 * Access for an outside agent (grokbot). /api/bot/usage and /api/bot/leads read;
 * /api/bot/actions writes (email, social, contact notes) with its own guardrails.
 *
 * Auth: `Authorization: Bearer <BOT_API_KEY>` where BOT_API_KEY is set in
 * Vercel. Unset key = the endpoints are off. Rotate the key to cut access.
 */
export function checkBotKey(req: NextRequest): NextResponse | null {
  const key = process.env.BOT_API_KEY || process.env.SCOREOM_BOT_KEY || "";
  if (key.length < 24) return NextResponse.json({ error: "Bot access is not enabled" }, { status: 503 });
  const h = req.headers.get("authorization") || "";
  const got = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const a = Buffer.from(got), b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export const NO_STORE = { "Cache-Control": "no-store" };
const DAY = 86400000;
const TZ = "America/Chicago";

export function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  return 0;
}
const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);
export const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** How long after the first upload a second one must come to count as "came back" (not the same sitting). */
export const RETURN_MIN_GAP_MS = 60 * 60 * 1000;
export const RETURN_WINDOW_MS = 14 * DAY;

export interface Member {
  uid: string;
  email: string;
  name: string;
  company: string | null;
  signedUpAt: number;
  lastActiveAt: number;
  source: string;              // utm_source, "direct", "referral" (no UTMs, outside site) or "untracked" (signed up before tracking)
  medium: string | null;
  campaign: string | null;
  content: string | null;
  referrerHost: string | null;
  sourceTracked: boolean;
  uploads: number[];           // OM upload times, ascending (copies excluded)
  firstUploadAt: number;
  returnedAt: number;          // first upload >= 1h and <= 14d after the first, else 0
  unsubscribed: boolean;
}

/** Registered (non-anonymous, enabled) users with their upload history and signup source. */
export async function loadMembers(): Promise<Member[]> {
  const db = getAdminDb();
  const auth = getAdminAuth();
  const authUsers: import("firebase-admin/auth").UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, pageToken);
    authUsers.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken && authUsers.length < 50000);

  const [usersSnap, propsSnap, supSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("workspace_properties").select("userId", "ownerId", "createdAt", "duplicatedFrom", "propertyName").get(),
    db.collection("marketing_suppressions").get().catch(() => null),
  ]);

  const docs = new Map<string, any>();
  usersSnap.docs.forEach(d => docs.set(d.id, d.data()));
  const suppressed = new Set<string>();
  supSnap?.docs.forEach(d => { const e = d.data().email; if (e) suppressed.add(String(e).toLowerCase()); });

  const uploads = new Map<string, number[]>();
  propsSnap.docs.forEach(d => {
    const x = d.data();
    const uid = x.userId || x.ownerId;
    if (!uid || x.duplicatedFrom) return;
    if (typeof x.propertyName === "string" && /\(Copy\)\s*$/.test(x.propertyName)) return;
    const t = toMs(x.createdAt);
    if (!t) return;
    const arr = uploads.get(uid) || [];
    arr.push(t);
    uploads.set(uid, arr);
  });

  const out: Member[] = [];
  for (const u of authUsers) {
    if (u.disabled || !u.email) continue;
    if (!u.providerData || u.providerData.length === 0) continue; // anonymous trial visitors
    const doc = docs.get(u.uid) || {};
    const ups = (uploads.get(u.uid) || []).sort((a, b) => a - b);
    const first = ups[0] || 0;
    const ret = first ? ups.find(t => t - first >= RETURN_MIN_GAP_MS && t - first <= RETURN_WINDOW_MS) || 0 : 0;
    // New field: attribution {utm_source, utm_campaign, utm_content, landing_path, referrer_host, first_seen_at}.
    // Legacy field (first day of tracking only): signupSource {source, medium, campaign, content, referrer}.
    const at = doc.attribution;
    const legacy = doc.signupSource;
    const attr = at
      ? { source: at.utm_source || (at.referrer_host ? "referral" : "direct"), medium: at.utm_medium || null, campaign: at.utm_campaign || null, content: at.utm_content || null, referrer: at.referrer_host || null }
      : legacy?.source
        ? { source: legacy.source, medium: legacy.medium || null, campaign: legacy.campaign || null, content: legacy.content || null, referrer: legacy.referrer || null }
        : null;
    out.push({
      uid: u.uid,
      email: u.email.toLowerCase(),
      name: doc.fullName || u.displayName || [doc.firstName, doc.lastName].filter(Boolean).join(" ") || "",
      company: doc.company || null,
      signedUpAt: toMs(doc.registeredAt) || toMs(doc.createdAt) || toMs(u.metadata.creationTime),
      lastActiveAt: toMs(u.metadata.lastSignInTime) || toMs(doc.lastLoginAt),
      source: attr?.source || "untracked",
      medium: attr?.medium || null,
      campaign: attr?.campaign || null,
      content: attr?.content || null,
      referrerHost: attr?.referrer || null,
      sourceTracked: !!attr,
      uploads: ups,
      firstUploadAt: first,
      returnedAt: ret,
      unsubscribed: suppressed.has(u.email.toLowerCase()),
    });
  }
  return out;
}

export const memberIso = iso;

/** Internal test traffic (utm_source=test) is excluded from all reports. */
export const isTestSource = (s: string | null | undefined) => (s || "").trim().toLowerCase() === "test";
export const DAY_MS = DAY;

/**
 * Trial activity that never became an account, for the window starting at
 * `from` (ms): anonymous trial users (users docs still at tier "anonymous")
 * and email-only leads (anonymous_trials docs at tier "lead"), each grouped by
 * first-touch source. Read-only; returns counts only.
 */
export async function loadTrials(from: number) {
  const db = getAdminDb();
  const [anonSnap, leadSnap, propsSnap] = await Promise.all([
    db.collection("users").where("tier", "==", "anonymous").get(),
    db.collection("anonymous_trials").where("tier", "==", "lead").get(),
    db.collection("workspace_properties").select("userId", "ownerId", "createdAt", "duplicatedFrom", "propertyName").get(),
  ]);

  // Same counting rule as loadMembers: duplicated copies don't count as uploads.
  const uploads = new Map<string, number>();
  propsSnap.docs.forEach(d => {
    const x = d.data();
    const uid = x.userId || x.ownerId;
    if (!uid || x.duplicatedFrom) return;
    if (typeof x.propertyName === "string" && /\(Copy\)\s*$/.test(x.propertyName)) return;
    if (!toMs(x.createdAt)) return;
    uploads.set(uid, (uploads.get(uid) || 0) + 1);
  });

  const anon: AnonUserRow[] = [];
  anonSnap.docs.forEach(d => {
    const x = d.data();
    if (toMs(x.createdAt) < from) return;
    anon.push({ attribution: x.attribution, uploads: uploads.get(d.id) || 0 });
  });
  const leads: LeadRow[] = [];
  leadSnap.docs.forEach(d => {
    const x = d.data();
    if (toMs(x.createdAt) < from) return;
    leads.push({ attribution: x.attribution });
  });

  const anonymous_users = groupAnonymousUsers(anon);
  const email_leads = groupEmailLeads(leads);
  return {
    totals: {
      anonymous_users: anonymous_users.reduce((n, g) => n + g.users, 0),
      anonymous_users_with_1plus_upload: anonymous_users.reduce((n, g) => n + g.users_with_1plus_upload, 0),
      email_leads: email_leads.reduce((n, g) => n + g.leads, 0),
    },
    anonymous_users,
    email_leads,
  };
}

/**
 * "Save this deal" card funnel for users first shown the card in the window
 * starting at `from` (ms). Read-only; counts only.
 */
export async function loadSavePrompt(from: number) {
  const snap = await getAdminDb().collection("users").where("savePrompt.shownAt", ">=", new Date(from)).get();
  return groupSavePrompt(snap.docs.map(d => {
    const x = d.data();
    const sp = x.savePrompt || {};
    return { attribution: x.attribution, shown: !!sp.shownAt, dismissed: !!sp.dismissedAt, signedUp: !!sp.signedUpAt };
  }));
}
