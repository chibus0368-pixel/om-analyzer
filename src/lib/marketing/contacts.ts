import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { COLL, emailKey, toIso } from "./server";

export type ContactType = "user" | "lead" | "subscriber";

export interface Contact {
  email: string;
  name: string;
  firstName: string;
  type: ContactType;
  uid?: string;
  tier: string;
  deals: number;
  createdAt: string;
  lastActiveAt: string;
  source: string;
  unsubscribed: boolean;
}

export interface Segment {
  audience: "all" | "users" | "leads";
  tiers?: string[];            // users only: free, pro, pro_plus
  deals?: "any" | "none" | "some";
  signedUpWithinDays?: number | null;
  inactiveForDays?: number | null;
  includeEmails?: string;      // comma/newline separated extra addresses (must still exist as contacts)
}

const DAY = 86400000;

function firstNameOf(name: string, email: string): string {
  const n = (name || "").trim().split(/\s+/)[0];
  if (n) return n.charAt(0).toUpperCase() + n.slice(1);
  return "";
}

/**
 * Unified contact list: registered (non-anonymous, enabled) Firebase users,
 * captured leads, and confirmed newsletter subscribers. De-duplicated by
 * email; a registered user wins over a lead with the same address.
 */
export async function loadContacts(): Promise<Contact[]> {
  const db = getAdminDb();
  const auth = getAdminAuth();

  const authUsers: import("firebase-admin/auth").UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, pageToken);
    authUsers.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken && authUsers.length < 20000);

  const [propsSnap, usersSnap, leadsSnap, subsSnap, supSnap] = await Promise.all([
    db.collection("workspace_properties").select("userId", "ownerId").get(),
    db.collection("users").get(),
    db.collection("leads").get(),
    db.collection("subscribers").where("status", "==", "confirmed").get().catch(() => null),
    db.collection(COLL.suppressions).get(),
  ]);

  const deals = new Map<string, number>();
  propsSnap.docs.forEach(d => {
    const x = d.data();
    const uid = x.userId || x.ownerId;
    if (uid) deals.set(uid, (deals.get(uid) || 0) + 1);
  });
  const tiers = new Map<string, string>();
  usersSnap.docs.forEach(d => tiers.set(d.id, d.data().tier || "free"));
  const suppressed = new Set<string>();
  supSnap.docs.forEach(d => { const e = d.data().email; if (e) suppressed.add(String(e).toLowerCase()); });

  const byEmail = new Map<string, Contact>();

  for (const u of authUsers) {
    if (!u.email || u.disabled) continue;
    if (!u.providerData || u.providerData.length === 0) continue; // anonymous trial users
    const email = u.email.toLowerCase();
    const name = u.displayName || "";
    byEmail.set(email, {
      email, name, firstName: firstNameOf(name, email), type: "user", uid: u.uid,
      tier: tiers.get(u.uid) || "free",
      deals: deals.get(u.uid) || 0,
      createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : "",
      lastActiveAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : "",
      source: u.providerData[0]?.providerId || "email",
      unsubscribed: suppressed.has(email),
    });
  }

  const addLead = (raw: any, type: ContactType) => {
    const email = String(raw.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || byEmail.has(email)) return;
    const name = raw.name || raw.firstName || "";
    byEmail.set(email, {
      email, name, firstName: firstNameOf(name, email), type,
      tier: "none", deals: 0,
      createdAt: toIso(raw.createdAt),
      lastActiveAt: toIso(raw.updatedAt || raw.lastSeenAt || raw.createdAt),
      source: raw.lastSource || raw.source || type,
      unsubscribed: suppressed.has(email) || raw.status === "unsubscribed",
    });
  };
  leadsSnap.docs.forEach(d => addLead(d.data(), "lead"));
  subsSnap?.docs.forEach(d => addLead(d.data(), "subscriber"));

  return [...byEmail.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function matchSegment(c: Contact, s: Segment, now = Date.now()): boolean {
  if (s.audience === "users" && c.type !== "user") return false;
  if (s.audience === "leads" && c.type === "user") return false;
  if (s.tiers && s.tiers.length && c.type === "user" && !s.tiers.includes(c.tier)) return false;
  if (s.deals === "none" && c.deals > 0) return false;
  if (s.deals === "some" && c.deals === 0) return false;
  if (s.signedUpWithinDays && c.createdAt && now - new Date(c.createdAt).getTime() > s.signedUpWithinDays * DAY) return false;
  if (s.inactiveForDays && c.lastActiveAt && now - new Date(c.lastActiveAt).getTime() < s.inactiveForDays * DAY) return false;
  return true;
}

export function segmentRecipients(contacts: Contact[], s: Segment): Contact[] {
  const extra = new Set((s.includeEmails || "").split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));
  return contacts.filter(c => !c.unsubscribed && (matchSegment(c, s) || extra.has(c.email)));
}

export function describeSegment(s: Segment): string {
  const parts: string[] = [s.audience === "all" ? "Everyone" : s.audience === "users" ? "Registered users" : "Leads + subscribers"];
  if (s.tiers?.length) parts.push(`plan: ${s.tiers.join("/")}`);
  if (s.deals === "none") parts.push("no deals yet");
  if (s.deals === "some") parts.push("has deals");
  if (s.signedUpWithinDays) parts.push(`joined in last ${s.signedUpWithinDays}d`);
  if (s.inactiveForDays) parts.push(`inactive ${s.inactiveForDays}d+`);
  return parts.join(", ");
}

export { emailKey };
