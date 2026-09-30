import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/**
 * Read-only access for an outside agent (grokbot).
 *
 * Auth: `Authorization: Bearer <BOT_API_KEY>` where BOT_API_KEY is set in
 * Vercel. Unset key = the endpoints are off. Rotate the key to cut access.
 * These routes only read. Nothing here sends email or changes data.
 */
export function checkBotKey(req: NextRequest): NextResponse | null {
  const key = process.env.BOT_API_KEY || "";
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
  source: string;
  medium: string | null;
  campaign: string | null;
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
    const src = doc.signupSource;
    out.push({
      uid: u.uid,
      email: u.email.toLowerCase(),
      name: doc.fullName || u.displayName || [doc.firstName, doc.lastName].filter(Boolean).join(" ") || "",
      company: doc.company || null,
      signedUpAt: toMs(doc.registeredAt) || toMs(doc.createdAt) || toMs(u.metadata.creationTime),
      lastActiveAt: toMs(u.metadata.lastSignInTime) || toMs(doc.lastLoginAt),
      source: src?.source || "untracked",
      medium: src?.medium || null,
      campaign: src?.campaign || null,
      sourceTracked: !!src?.source,
      uploads: ups,
      firstUploadAt: first,
      returnedAt: ret,
      unsubscribed: suppressed.has(u.email.toLowerCase()),
    });
  }
  return out;
}

export const memberIso = iso;
export const DAY_MS = DAY;
