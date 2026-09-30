import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkBotKey, NO_STORE } from "@/lib/bot-access";
import { COLL, emailKey, randomId } from "@/lib/marketing/server";
import { loadContacts, segmentRecipients, describeSegment, type Segment } from "@/lib/marketing/contacts";
import { renderEmail, sendMarketing, type EmailContent } from "@/lib/marketing/email";
import { sendBroadcast, sendTest } from "@/lib/marketing/campaigns";
import { PLATFORMS, publishPost, type Platform } from "@/lib/marketing/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Write access for grokbot. POST JSON { action, ...params }.
 * Auth: Authorization: Bearer <BOT_API_KEY>.
 *
 * Guardrails (cheap insurance, not approval steps):
 *  - Email only goes to people already in ScoreOM (accounts, leads, subscribers), never cold addresses.
 *  - Unsubscribed people are always skipped.
 *  - Daily cap on emails grokbot sends (BOT_DAILY_EMAIL_LIMIT, default 300).
 *  - Nothing already sent or published can be deleted. No account connect/disconnect.
 *  - Every call is logged to bot_actions, and everything grokbot creates is tagged createdBy: "grokbot".
 */
const BOT = "grokbot";
const NOTES = "contact_notes";
const LOG = "bot_actions";
const now = () => new Date().toISOString();
const DAILY_EMAILS = Number(process.env.BOT_DAILY_EMAIL_LIMIT) || 300;
const ACTIONS = [
  "listBroadcasts", "saveBroadcast", "previewSegment", "sendBroadcast", "deleteBroadcast", "testEmail", "sendEmail",
  "listPosts", "savePost", "publishPost", "deletePost",
  "getContact", "updateContact",
] as const;

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status, headers: NO_STORE });
const ok = (data: any) => NextResponse.json(data, { headers: NO_STORE });
const str = (v: any, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const cleanDashes = (v: string) => v.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");

function content(x: any): EmailContent | string {
  const subject = cleanDashes(str(x?.subject, 200).trim());
  const body = cleanDashes(str(x?.body, 20000));
  if (!subject) return "subject is required";
  if (!body.trim()) return "body is required";
  const ctaUrl = str(x?.ctaUrl, 500);
  if (ctaUrl && !/^https:\/\//.test(ctaUrl)) return "ctaUrl must start with https://";
  return { subject, body, preheader: cleanDashes(str(x?.preheader, 200)), ctaLabel: str(x?.ctaLabel, 60), ctaUrl };
}

function segment(x: any): Segment {
  const s: Segment = { audience: ["all", "users", "leads"].includes(x?.audience) ? x.audience : "all" };
  if (Array.isArray(x?.tiers)) s.tiers = x.tiers.map(String).slice(0, 5);
  if (["any", "none", "some"].includes(x?.deals)) s.deals = x.deals;
  if (Number(x?.signedUpWithinDays) > 0) s.signedUpWithinDays = Number(x.signedUpWithinDays);
  if (Number(x?.inactiveForDays) > 0) s.inactiveForDays = Number(x.inactiveForDays);
  if (typeof x?.includeEmails === "string") s.includeEmails = x.includeEmails.slice(0, 5000);
  return s;
}

const dayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** Reserve n email sends against today's cap. Returns remaining before reserving, or throws. */
async function reserveEmails(n: number) {
  const db = getAdminDb();
  const ref = db.collection("bot_usage").doc(dayId());
  return db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data()?.emails || 0;
    if (cur + n > DAILY_EMAILS) throw new Error(`Daily email cap reached: ${cur} of ${DAILY_EMAILS} used today, this needs ${n}. Raise BOT_DAILY_EMAIL_LIMIT in Vercel if you want more.`);
    tx.set(ref, { emails: cur + n, updatedAt: now() }, { merge: true });
    return DAILY_EMAILS - cur;
  });
}
async function releaseEmails(n: number) {
  if (n <= 0) return;
  const db = getAdminDb();
  const ref = db.collection("bot_usage").doc(dayId());
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data()?.emails || 0;
    tx.set(ref, { emails: Math.max(0, cur - n), updatedAt: now() }, { merge: true });
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const denied = checkBotKey(req);
  if (denied) return denied;
  return ok({
    actions: ACTIONS,
    dailyEmailLimit: DAILY_EMAILS,
    usedToday: (await getAdminDb().collection("bot_usage").doc(dayId()).get()).data()?.emails || 0,
    docs: "POST { action, ... } to this URL. See the comment block in src/app/api/bot/actions/route.ts or the ScoreOM grokbot guide.",
  });
}

export async function POST(req: NextRequest) {
  const denied = checkBotKey(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  const action = String(body?.action || "");
  if (!(ACTIONS as readonly string[]).includes(action)) return bad(`Unknown action. Use one of: ${ACTIONS.join(", ")}`);

  const db = getAdminDb();
  const log = (result: any) => db.collection(LOG).add({
    action, at: now(),
    params: JSON.parse(JSON.stringify({ ...body, action: undefined, body: body.body ? `[${String(body.body).length} chars]` : undefined })),
    result: typeof result === "object" ? JSON.parse(JSON.stringify(result)) : result,
  }).catch(() => {});

  try {
    const res = await run(action, body);
    await log(res);
    return ok(res);
  } catch (e: any) {
    const msg = e?.message || "Failed";
    await log({ error: msg });
    return bad(msg, /cap reached/.test(msg) ? 429 : /not found/i.test(msg) ? 404 : 400);
  }
}

async function run(action: string, b: any): Promise<any> {
  const db = getAdminDb();
  switch (action) {
    // ── Email ─────────────────────────────────────────────
    case "listBroadcasts": {
      const s = await db.collection(COLL.broadcasts).orderBy("createdAt", "desc").limit(50).get();
      return { broadcasts: s.docs.map(d => { const x = d.data(); return { id: d.id, name: x.name, subject: x.subject, status: x.status, scheduledAt: x.scheduledAt || null, sentAt: x.sentAt || null, stats: x.stats || null, segment: x.segment, createdBy: x.createdBy || "brody" }; }) };
    }
    case "previewSegment": {
      const seg = segment(b.segment);
      const r = segmentRecipients(await loadContacts(), seg);
      return { count: r.length, label: describeSegment(seg), sample: r.slice(0, 10).map(c => c.email) };
    }
    case "saveBroadcast": {
      // Draft by default. status "scheduled" + scheduledAt (ISO) lets the cron send it.
      const c = content(b);
      if (typeof c === "string") throw new Error(c);
      const seg = segment(b.segment);
      const scheduled = b.status === "scheduled";
      if (scheduled && (!b.scheduledAt || isNaN(Date.parse(b.scheduledAt)))) throw new Error("scheduledAt (ISO time) is required to schedule");
      if (scheduled) {
        const n = segmentRecipients(await loadContacts(), seg).length;
        await reserveEmails(n);
      }
      const data: any = { name: str(b.name, 120), ...c, segment: seg, status: scheduled ? "scheduled" : "draft", scheduledAt: scheduled ? new Date(b.scheduledAt).toISOString() : null, updatedAt: now() };
      if (b.id) {
        const cur = await db.collection(COLL.broadcasts).doc(String(b.id)).get();
        if (!cur.exists) throw new Error("Broadcast not found");
        if (["sending", "sent"].includes(cur.data()!.status)) throw new Error("This broadcast has already gone out");
        await cur.ref.set(data, { merge: true });
        return { id: cur.id, status: data.status };
      }
      const ref = await db.collection(COLL.broadcasts).add({ ...data, createdBy: BOT, createdAt: now(), stats: null });
      return { id: ref.id, status: data.status };
    }
    case "sendBroadcast": {
      const ref = db.collection(COLL.broadcasts).doc(String(b.id || ""));
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Broadcast not found");
      const x = snap.data()!;
      if (x.status === "sent") return { stats: x.stats, note: "Already sent" };
      const n = segmentRecipients(await loadContacts(), x.segment).length;
      if (x.status !== "scheduled") await reserveEmails(n); // scheduled ones reserved when scheduled
      const stats = await sendBroadcast(ref.id);
      return { stats };
    }
    case "deleteBroadcast": {
      const ref = db.collection(COLL.broadcasts).doc(String(b.id || ""));
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Broadcast not found");
      if (["sending", "sent"].includes(snap.data()!.status)) throw new Error("Sent broadcasts are kept for the record");
      await ref.delete();
      return { ok: true };
    }
    case "testEmail": {
      // Sends a [TEST] copy to Brody only.
      const c = content(b);
      if (typeof c === "string") throw new Error(c);
      return await sendTest(c, "chibus0368@gmail.com");
    }
    case "sendEmail": {
      // One-to-one follow-up to someone already in ScoreOM. Same template, footer and unsubscribe as broadcasts.
      const c = content(b);
      if (typeof c === "string") throw new Error(c);
      const to = String(b.to || "").trim().toLowerCase();
      const contact = (await loadContacts()).find(x => x.email === to);
      if (!contact) throw new Error("Not found: that address is not an account, lead or subscriber in ScoreOM");
      if (contact.unsubscribed) throw new Error("That person unsubscribed. Not sending.");
      await reserveEmails(1);
      const refId = str(b.refId, 60).replace(/[^\w-]/g, "") || randomId(10);
      const r = await sendMarketing([{ contact, content: c, kind: "followup", refId }]);
      if (r.sent === 0) await releaseEmails(1);
      await db.collection(NOTES).doc(emailKey(to)).set({
        email: to, updatedAt: now(),
        log: (await db.collection(NOTES).doc(emailKey(to)).get()).data()?.log?.concat([{ at: now(), by: BOT, type: "email", subject: c.subject, status: r.sent ? "sent" : r.skipped ? "duplicate" : "failed" }]).slice(-50)
          || [{ at: now(), by: BOT, type: "email", subject: c.subject, status: r.sent ? "sent" : r.skipped ? "duplicate" : "failed" }],
      }, { merge: true });
      return { ...r, refId, note: r.skipped ? "Already sent with this refId, skipped" : undefined };
    }

    // ── Social ────────────────────────────────────────────
    case "listPosts": {
      const s = await db.collection(COLL.social).orderBy("createdAt", "desc").limit(50).get();
      const acc = await db.collection(COLL.accounts).get();
      return {
        connected: acc.docs.map(d => d.id),
        posts: s.docs.map(d => { const x = d.data(); return { id: d.id, text: x.text, channels: x.channels, status: x.status, scheduledAt: x.scheduledAt || null, mediaUrl: x.mediaUrl || null, results: x.results || {}, createdBy: x.createdBy || "brody" }; }),
      };
    }
    case "savePost": {
      const channels = (Array.isArray(b.channels) ? b.channels : []).filter((c: any) => PLATFORMS.includes(c)) as Platform[];
      if (!channels.length) throw new Error(`channels must include one of: ${PLATFORMS.join(", ")}`);
      const text = cleanDashes(str(b.text, 5000));
      const tbc: Record<string, string> = {};
      for (const p of PLATFORMS) if (typeof b.textByChannel?.[p] === "string") tbc[p] = cleanDashes(b.textByChannel[p].slice(0, 5000));
      if (!text.trim() && !Object.keys(tbc).length) throw new Error("text is required");
      if (channels.includes("x") && (tbc.x || text).length > 280) throw new Error("X text must be 280 characters or less (set textByChannel.x)");
      const urls = (Array.isArray(b.mediaUrls) ? b.mediaUrls : b.mediaUrl ? [b.mediaUrl] : []).map(String).filter((u: string) => /^https:\/\//.test(u)).slice(0, 10);
      if (channels.includes("instagram") && !urls.length) throw new Error("Instagram posts need an image: set mediaUrl (public https JPEG)");
      const scheduled = b.status === "scheduled";
      if (scheduled && (!b.scheduledAt || isNaN(Date.parse(b.scheduledAt)))) throw new Error("scheduledAt (ISO time) is required to schedule");
      const data: any = {
        text, textByChannel: tbc, mediaUrl: urls[0] || null, mediaUrls: urls.length > 1 ? urls : null,
        mediaType: urls.length ? (b.mediaType === "video" ? "video" : "image") : null, channels, tiktokPrivacy: null,
        status: scheduled ? "scheduled" : "draft", scheduledAt: scheduled ? new Date(b.scheduledAt).toISOString() : null, updatedAt: now(),
      };
      if (b.id) {
        const cur = await db.collection(COLL.social).doc(String(b.id)).get();
        if (!cur.exists) throw new Error("Post not found");
        if (["publishing", "published", "partial", "processing"].includes(cur.data()!.status)) throw new Error("This post has already gone out");
        await cur.ref.set(data, { merge: true });
        return { id: cur.id, status: data.status };
      }
      const ref = await db.collection(COLL.social).add({ ...data, results: {}, createdBy: BOT, createdAt: now() });
      return { id: ref.id, status: data.status };
    }
    case "publishPost": {
      const snap = await db.collection(COLL.social).doc(String(b.id || "")).get();
      if (!snap.exists) throw new Error("Post not found");
      const post = await publishPost(snap.id);
      return { id: snap.id, status: post.status, results: post.results };
    }
    case "deletePost": {
      const ref = db.collection(COLL.social).doc(String(b.id || ""));
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Post not found");
      if (!["draft", "scheduled", "failed"].includes(snap.data()!.status)) throw new Error("Published posts are kept for the record");
      await ref.delete();
      return { ok: true };
    }

    // ── Contacts: notes, tags, follow-up status ───────────
    case "getContact": {
      const email = String(b.email || "").trim().toLowerCase();
      const snap = await db.collection(NOTES).doc(emailKey(email)).get();
      return { email, ...(snap.exists ? snap.data() : { tags: [], status: null, notes: [], log: [] }) };
    }
    case "updateContact": {
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("email is required");
      const ref = db.collection(NOTES).doc(emailKey(email));
      const cur = (await ref.get()).data() || {};
      let tags: string[] = Array.isArray(cur.tags) ? cur.tags : [];
      if (Array.isArray(b.tags)) tags = b.tags.map((t: any) => str(t, 40).toLowerCase()).filter(Boolean);
      if (Array.isArray(b.addTags)) tags = [...new Set([...tags, ...b.addTags.map((t: any) => str(t, 40).toLowerCase()).filter(Boolean)])];
      if (Array.isArray(b.removeTags)) tags = tags.filter(t => !b.removeTags.includes(t));
      const notes = Array.isArray(cur.notes) ? cur.notes : [];
      if (typeof b.note === "string" && b.note.trim()) notes.push({ at: now(), by: BOT, text: cleanDashes(b.note.slice(0, 2000)) });
      const data: any = { email, tags: tags.slice(0, 30), notes: notes.slice(-100), updatedAt: now() };
      if (typeof b.status === "string") data.status = str(b.status, 40);
      if (typeof b.nextFollowUpAt === "string") data.nextFollowUpAt = isNaN(Date.parse(b.nextFollowUpAt)) ? null : new Date(b.nextFollowUpAt).toISOString();
      await ref.set(data, { merge: true });
      return { ...cur, ...data };
    }
  }
  throw new Error("Unknown action");
}
