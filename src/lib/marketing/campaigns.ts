import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, emailKey } from "./server";
import { loadContacts, segmentRecipients, type Contact, type Segment } from "./contacts";
import { sendMarketing, type EmailContent, type SendItem } from "./email";

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface Broadcast extends EmailContent {
  id?: string;
  name?: string;
  segment: Segment;
  status: BroadcastStatus;
  scheduledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sentAt?: string | null;
  stats?: { recipients: number; sent: number; failed: number; skipped: number };
  lastError?: string | null;
}

export type DripCondition = "always" | "no_deals" | "has_deals" | "free";

export interface DripStep extends EmailContent {
  delayDays: number;
  onlyIf?: DripCondition;
}

export interface Drip {
  id?: string;
  name: string;
  trigger: "signup" | "lead";
  active: boolean;
  includeExisting?: boolean;
  startFrom?: string | null;
  steps: DripStep[];
  createdAt?: string;
  updatedAt?: string;
}

const DAY = 86400000;

export async function sendBroadcast(id: string, contacts?: Contact[], deadlineMs = 240000) {
  const db = getAdminDb();
  const ref = db.collection(COLL.broadcasts).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Broadcast not found");
  const b = snap.data() as Broadcast;
  if (b.status === "sent") return b.stats;
  const list = contacts || await loadContacts();
  const recipients = segmentRecipients(list, b.segment);
  await ref.update({ status: "sending", updatedAt: new Date().toISOString() });
  const items: SendItem[] = recipients.map(c => ({ contact: c, content: b, kind: "broadcast", refId: id }));
  const res = await sendMarketing(items, { deadlineMs });
  const prev = b.stats || { recipients: 0, sent: 0, failed: 0, skipped: 0 };
  const finished = res.errors.length === 0;
  const stats = { recipients: recipients.length, sent: prev.sent + res.sent, failed: res.failed, skipped: res.skipped };
  await ref.update({
    status: finished ? "sent" : (res.sent === 0 && res.failed > 0 ? "failed" : "sending"),
    stats,
    sentAt: finished ? new Date().toISOString() : null,
    lastError: res.errors[0] || null,
    updatedAt: new Date().toISOString(),
  });
  return stats;
}

export async function sendTest(content: EmailContent, to: string) {
  const c: Contact = {
    email: to, name: "Brody", firstName: "Brody", type: "user", tier: "free", deals: 0,
    createdAt: "", lastActiveAt: "", source: "test", unsubscribed: false,
  };
  return sendMarketing([{ contact: c, content, kind: "test", refId: "test" }]);
}

function conditionOk(c: Contact, cond?: DripCondition): boolean {
  if (!cond || cond === "always") return true;
  if (cond === "no_deals") return c.deals === 0;
  if (cond === "has_deals") return c.deals > 0;
  if (cond === "free") return c.type !== "user" || c.tier === "free";
  return true;
}

/** Enroll new contacts into active drips and send any steps that are due. */
export async function processDrips(contacts: Contact[], deadlineMs = 120000) {
  const db = getAdminDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const byEmail = new Map(contacts.map(c => [c.email, c]));
  const dripsSnap = await db.collection(COLL.drips).where("active", "==", true).get();
  const report: { drip: string; enrolled: number; sent: number; errors: string[] }[] = [];

  for (const d of dripsSnap.docs) {
    const drip = { id: d.id, ...(d.data() as Drip) };
    if (!drip.steps?.length) continue;
    const enrSnap = await db.collection(COLL.enrollments).where("dripId", "==", drip.id).get();
    const enrolled = new Map(enrSnap.docs.map(e => [e.data().email as string, { ref: e.ref, ...e.data() } as any]));

    // 1) enroll
    const start = drip.includeExisting ? 0 : new Date(drip.startFrom || drip.createdAt || nowIso).getTime();
    const eligible = contacts.filter(c =>
      !c.unsubscribed && !enrolled.has(c.email) &&
      (drip.trigger === "signup" ? c.type === "user" : c.type !== "user") &&
      (!c.createdAt || new Date(c.createdAt).getTime() >= start));
    let wb = db.batch(); let n = 0;
    for (const c of eligible) {
      const ref = db.collection(COLL.enrollments).doc(`${drip.id}_${emailKey(c.email)}`);
      const doc = { dripId: drip.id, email: c.email, enrolledAt: nowIso, nextStep: 0, nextAt: new Date(now + (drip.steps[0].delayDays || 0) * DAY).toISOString(), done: false };
      wb.set(ref, doc); enrolled.set(c.email, { ref, ...doc }); n++;
      if (n % 400 === 0) { await wb.commit(); wb = db.batch(); }
    }
    if (n % 400 !== 0) await wb.commit();

    // 2) due steps
    const items: SendItem[] = [];
    const advance: { ref: any; next: number; enrolledAt: string }[] = [];
    const finish: any[] = [];
    for (const e of enrolled.values()) {
      if (e.done || !e.nextAt || new Date(e.nextAt).getTime() > now) continue;
      const c = byEmail.get(e.email);
      if (!c || c.unsubscribed) { finish.push(e.ref); continue; }
      let step = e.nextStep as number;
      // skip steps whose condition no longer applies
      while (step < drip.steps.length && !conditionOk(c, drip.steps[step].onlyIf)) step++;
      if (step >= drip.steps.length) { finish.push(e.ref); continue; }
      items.push({ contact: c, content: drip.steps[step], kind: "drip", refId: drip.id, step });
      advance.push({ ref: e.ref, next: step + 1, enrolledAt: e.enrolledAt });
    }
    const res = items.length ? await sendMarketing(items, { deadlineMs }) : { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
    if (res.errors.length === 0) {
      let b2 = db.batch(); let k = 0;
      for (const a of advance) {
        const nextAt = a.next < drip.steps.length ? new Date(new Date(a.enrolledAt).getTime() + (drip.steps[a.next].delayDays || 0) * DAY).toISOString() : null;
        b2.update(a.ref, { nextStep: a.next, nextAt, done: a.next >= drip.steps.length, lastSentAt: nowIso });
        if (++k % 400 === 0) { await b2.commit(); b2 = db.batch(); }
      }
      for (const r of finish) { b2.update(r, { done: true }); if (++k % 400 === 0) { await b2.commit(); b2 = db.batch(); } }
      if (k % 400 !== 0) await b2.commit();
    }
    report.push({ drip: drip.name, enrolled: n, sent: res.sent, errors: res.errors });
  }
  return report;
}

export async function processScheduledBroadcasts(contacts: Contact[]) {
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const [sched, sending] = await Promise.all([
    db.collection(COLL.broadcasts).where("status", "==", "scheduled").get(),
    db.collection(COLL.broadcasts).where("status", "==", "sending").get(),
  ]);
  const due = [...sched.docs.filter(d => (d.data().scheduledAt || "") <= nowIso), ...sending.docs];
  const out: any[] = [];
  for (const d of due) {
    try { out.push({ id: d.id, ...(await sendBroadcast(d.id, contacts, 150000)) }); }
    catch (e: any) { out.push({ id: d.id, error: e?.message }); }
  }
  return out;
}

export const DEFAULT_WELCOME_DRIP: Drip = {
  name: "Welcome series",
  trigger: "signup",
  active: false,
  includeExisting: false,
  steps: [
    {
      delayDays: 2, onlyIf: "no_deals",
      subject: "Got an OM sitting in your inbox?",
      preheader: "Takes about a minute.",
      body: "Hi {{firstName|there}},\n\nYou haven't run a deal through ScoreOM yet. Pick any OM you received this week and drop it in. You'll get the numbers you check first, a rebuilt NOI and a 100-point score in about a minute.\n\nBrody",
      ctaLabel: "Score an OM", ctaUrl: "https://www.scoreom.com/workspace/upload",
    },
    {
      delayDays: 5, onlyIf: "has_deals",
      subject: "Get more out of your DealBoard",
      preheader: "Ranking, sharing and sharper reads.",
      body: "Hi {{firstName|there}},\n\nA few things investors use most once a few deals are in:\n\n- **Rank** every deal on your board by score, cap rate or price\n- **Add the rent roll and T-12** to a deal and re-analyze for a sharper read\n- **Share** a DealBoard link with partners or lenders\n\nBrody",
      ctaLabel: "Open your DealBoard", ctaUrl: "https://www.scoreom.com/workspace",
    },
    {
      delayDays: 10, onlyIf: "always",
      subject: "Quick question, {{firstName|there}}",
      preheader: "One reply helps a lot.",
      body: "Hi {{firstName|there}},\n\nYou've had ScoreOM for about a week and a half. What's the one thing that would make it more useful on the deals you're looking at?\n\nJust hit reply. I read every one.\n\nBrody",
    },
  ],
};
