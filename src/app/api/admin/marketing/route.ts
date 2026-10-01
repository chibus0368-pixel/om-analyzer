import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, bad, emailKey, pkcePair, randomId, unauthorized, verifyAdmin, SITE_URL } from "@/lib/marketing/server";
import { describeSegment, loadContacts, segmentRecipients, type Segment } from "@/lib/marketing/contacts";
import { MARKETING_FROM, renderEmail, resendClient, type EmailContent } from "@/lib/marketing/email";
import { DEFAULT_WELCOME_DRIP, sendBroadcast, sendTest, type Broadcast, type Drip } from "@/lib/marketing/campaigns";
import { PLATFORMS, authorizeUrl, platformConfigured, publishPost, redirectUri, type Platform, type SocialPost } from "@/lib/marketing/social";
import { runMarketing } from "@/lib/marketing/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const now = () => new Date().toISOString();
const list = async (coll: string, limit = 200) => {
  const s = await getAdminDb().collection(coll).orderBy("createdAt", "desc").limit(limit).get();
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return unauthorized();
  const view = req.nextUrl.searchParams.get("view") || "overview";
  const db = getAdminDb();
  try {
    if (view === "contacts") {
      const contacts = await loadContacts();
      return NextResponse.json({ contacts });
    }
    if (view === "broadcasts") return NextResponse.json({ broadcasts: await list(COLL.broadcasts) });
    if (view === "drips") {
      const drips = await list(COLL.drips);
      const enr = await db.collection(COLL.enrollments).get();
      const counts: Record<string, { enrolled: number; done: number }> = {};
      enr.docs.forEach(d => { const x = d.data(); const c = counts[x.dripId] ||= { enrolled: 0, done: 0 }; c.enrolled++; if (x.done) c.done++; });
      return NextResponse.json({ drips: drips.map((d: any) => ({ ...d, counts: counts[d.id] || { enrolled: 0, done: 0 } })) });
    }
    if (view === "social") {
      const [posts, accSnap] = await Promise.all([list(COLL.social), db.collection(COLL.accounts).get()]);
      const accounts = Object.fromEntries(accSnap.docs.map(d => { const a = d.data(); return [d.id, { username: a.username || null, connectedAt: a.connectedAt || null, expiresAt: a.expiresAt || null }]; }));
      const config = Object.fromEntries(PLATFORMS.map(p => [p, { configured: platformConfigured(p), redirectUri: redirectUri(p) }]));
      return NextResponse.json({ posts, accounts, config });
    }
    // overview / status
    let domain: any = null;
    const resend = resendClient();
    if (resend) {
      try {
        const want = (MARKETING_FROM.match(/@([^>\s]+)/)?.[1] || "scoreom.com").toLowerCase();
        const r: any = await resend.domains.list();
        if (r.error) {
          // The Resend SDK returns errors instead of throwing. A send-only API key
          // can't list domains, which previously fell through to "not added".
          const msg = String(r.error.message || r.error.name || "unknown error");
          const restricted = /restricted|only send|permission/i.test(msg) || r.error.name === "restricted_api_key";
          domain = { name: want, status: restricted ? "unchecked" : "error", error: msg, restrictedKey: restricted };
        } else {
          const all = r.data?.data || r.data || [];
          const d = all.find((x: any) => x.name?.toLowerCase() === want);
          domain = d ? { name: d.name, status: d.status } : { name: want, status: "not added", seen: all.map((x: any) => x.name) };
        }
      } catch (e: any) { domain = { error: e?.message }; }
    }
    const [latest, sup] = await Promise.all([
      db.collection(COLL.runs).doc("latest").get(),
      db.collection(COLL.suppressions).count().get().catch(() => null),
    ]);
    return NextResponse.json({
      status: {
        resendKey: !!resend,
        from: MARKETING_FROM,
        domain,
        cronSecret: !!process.env.CRON_SECRET,
        openai: !!process.env.OPENAI_API_KEY,
        siteUrl: SITE_URL,
        suppressions: sup?.data().count ?? 0,
        lastRun: latest.exists ? latest.data() : null,
      },
    });
  } catch (e: any) {
    return bad(e?.message || "Failed", 500);
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return unauthorized();
  const db = getAdminDb();
  let body: any;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  const a = body.action as string;

  try {
    switch (a) {
      // ── Email ──
      case "segmentCount": {
        const contacts = await loadContacts();
        const r = segmentRecipients(contacts, body.segment as Segment);
        return NextResponse.json({ count: r.length, label: describeSegment(body.segment), sample: r.slice(0, 8).map(c => c.email) });
      }
      case "preview": {
        const r = renderEmail(body.content as EmailContent, { firstName: "Brody", name: "Brody Buss", email: admin.email });
        return NextResponse.json(r);
      }
      case "testEmail": {
        const res = await sendTest(body.content as EmailContent, body.to || admin.email);
        return NextResponse.json(res);
      }
      case "saveBroadcast": {
        const b = body.broadcast as Broadcast;
        if (!b.subject?.trim()) return bad("Subject is required");
        const data: any = {
          name: b.name || "", subject: b.subject, preheader: b.preheader || "", body: b.body || "",
          ctaLabel: b.ctaLabel || "", ctaUrl: b.ctaUrl || "", segment: b.segment || { audience: "all" },
          status: b.status === "scheduled" ? "scheduled" : "draft", scheduledAt: b.scheduledAt || null, updatedAt: now(),
        };
        if (b.id) {
          const cur = await db.collection(COLL.broadcasts).doc(b.id).get();
          if (cur.exists && ["sending", "sent"].includes(cur.data()!.status)) return bad("This broadcast has already gone out");
          await db.collection(COLL.broadcasts).doc(b.id).set(data, { merge: true });
          return NextResponse.json({ id: b.id });
        }
        const ref = await db.collection(COLL.broadcasts).add({ ...data, createdAt: now(), stats: null });
        return NextResponse.json({ id: ref.id });
      }
      case "sendBroadcast": {
        const stats = await sendBroadcast(body.id);
        return NextResponse.json({ stats });
      }
      case "deleteBroadcast": {
        const cur = await db.collection(COLL.broadcasts).doc(body.id).get();
        if (cur.exists && ["sending", "sent"].includes(cur.data()!.status)) return bad("Sent broadcasts are kept for the record");
        await db.collection(COLL.broadcasts).doc(body.id).delete();
        return NextResponse.json({ ok: true });
      }
      case "saveDrip": {
        const d = body.drip as Drip;
        if (!d.name?.trim() || !d.steps?.length) return bad("A drip needs a name and at least one step");
        const data: any = { name: d.name, trigger: d.trigger || "signup", active: !!d.active, includeExisting: !!d.includeExisting, steps: d.steps, updatedAt: now() };
        if (d.id) {
          const cur = await db.collection(COLL.drips).doc(d.id).get();
          if (d.active && !cur.data()?.active) data.startFrom = now();
          await db.collection(COLL.drips).doc(d.id).set(data, { merge: true });
          return NextResponse.json({ id: d.id });
        }
        const ref = await db.collection(COLL.drips).add({ ...data, startFrom: d.active ? now() : null, createdAt: now() });
        return NextResponse.json({ id: ref.id });
      }
      case "seedWelcome": {
        const ref = await db.collection(COLL.drips).add({ ...DEFAULT_WELCOME_DRIP, startFrom: null, createdAt: now(), updatedAt: now() });
        return NextResponse.json({ id: ref.id });
      }
      case "deleteDrip": {
        await db.collection(COLL.drips).doc(body.id).delete();
        const enr = await db.collection(COLL.enrollments).where("dripId", "==", body.id).get();
        let wb = db.batch(); let n = 0;
        for (const e of enr.docs) { wb.delete(e.ref); if (++n % 400 === 0) { await wb.commit(); wb = db.batch(); } }
        if (n % 400 !== 0) await wb.commit();
        return NextResponse.json({ ok: true });
      }
      case "suppress":
      case "unsuppress": {
        const email = String(body.email || "").toLowerCase().trim();
        if (!email) return bad("Email required");
        const ref = db.collection(COLL.suppressions).doc(emailKey(email));
        if (a === "suppress") await ref.set({ email, reason: "admin", at: now() });
        else await ref.delete();
        return NextResponse.json({ ok: true });
      }

      // ── Social ──
      case "savePost": {
        const p = body.post as SocialPost;
        if (!p.channels?.length) return bad("Pick at least one channel");
        const data: any = {
          text: p.text || "", textByChannel: p.textByChannel || {}, mediaUrl: p.mediaUrl || (p.mediaUrls?.[0] ?? null), mediaUrls: (p.mediaUrls || []).filter(Boolean).length > 1 ? (p.mediaUrls || []).filter(Boolean) : null, mediaType: (p.mediaUrl || p.mediaUrls?.length) ? (p.mediaType || "image") : null,
          channels: p.channels, tiktokPrivacy: p.tiktokPrivacy || null,
          status: p.status === "scheduled" ? "scheduled" : "draft", scheduledAt: p.scheduledAt || null, updatedAt: now(),
        };
        if (p.id) {
          await db.collection(COLL.social).doc(p.id).set(data, { merge: true });
          return NextResponse.json({ id: p.id });
        }
        const ref = await db.collection(COLL.social).add({ ...data, results: {}, createdAt: now() });
        return NextResponse.json({ id: ref.id });
      }
      case "loadLaunchSet": {
        const { LAUNCH_SET } = await import("@/lib/marketing/launch-set");
        const batch = db.batch();
        for (const post of LAUNCH_SET) {
          batch.set(db.collection(COLL.social).doc(), { ...post, status: "draft", results: {}, createdAt: now(), updatedAt: now() });
        }
        await batch.commit();
        return NextResponse.json({ added: LAUNCH_SET.length });
      }
      case "publishPost": {
        const post = await publishPost(body.id);
        return NextResponse.json({ post });
      }
      case "deletePost": {
        await db.collection(COLL.social).doc(body.id).delete();
        return NextResponse.json({ ok: true });
      }
      case "connect": {
        const p = body.platform as Platform;
        if (!PLATFORMS.includes(p)) return bad("Unknown platform");
        if (!platformConfigured(p)) return bad(`Add the ${p} app keys in Vercel first`);
        const state = randomId(18);
        const { verifier, challenge } = pkcePair();
        await db.collection(COLL.oauthStates).doc(state).set({ platform: p, verifier, uid: admin.uid, createdAt: now() });
        return NextResponse.json({ url: authorizeUrl(p, state, challenge) });
      }
      case "disconnect": {
        await db.collection(COLL.accounts).doc(body.platform).delete();
        return NextResponse.json({ ok: true });
      }

      // ── Shared ──
      case "runNow":
        return NextResponse.json(await runMarketing("manual"));
      case "aiDraft":
        return NextResponse.json(await aiDraft(body.kind, body.prompt || "", body.channels || []));
      default:
        return bad("Unknown action");
    }
  } catch (e: any) {
    return bad(e?.message || "Failed", 500);
  }
}

async function aiDraft(kind: "email" | "post", prompt: string, channels: string[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: key });
  const product = "ScoreOM (www.scoreom.com) is a pre-diligence tool for commercial real estate investors. Upload an offering memorandum (OM), rent roll or T-12 and in about a minute it extracts the numbers, rebuilds NOI with vacancy and reserves, and scores each deal 0-100 on consistent criteria and models. Deals sit on DealBoards you can rank, share and email. Audience: CRE investors, acquisition analysts, brokers and lenders who receive many OMs.";
  const style = "Voice: direct, plain-English, credible to experienced CRE investors. No hype, no emojis unless asked, never use em dashes. Use hyphens or commas instead.";
  const sys = kind === "email"
    ? `${product}\n${style}\nWrite a marketing email. Return JSON {subject, preheader, body, ctaLabel, ctaUrl}. body uses light markdown (blank-line paragraphs, "- " bullets, **bold**). Personalize with {{firstName|there}} in the greeting. Sign off as Brody. Keep it under 170 words.`
    : `${product}\n${style}\nWrite a social post. Return JSON {text, x, instagram, tiktok}. text is a general version. x must be under 270 characters and avoid links (links cost more to post via the API). instagram can be longer with 3-6 relevant hashtags at the end. tiktok is a short caption with 3-5 hashtags. Only channels requested need to be strong: ${channels.join(", ") || "x, instagram, tiktok"}.`;
  const r = await client.chat.completions.create({
    model: process.env.MARKETING_AI_MODEL || "gpt-4o",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: sys }, { role: "user", content: prompt || "Introduce ScoreOM." }],
    temperature: 0.7,
  });
  const out = JSON.parse(r.choices[0]?.message?.content || "{}");
  const strip = (v: any) => typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").replace(/–/g, "-") : v;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, strip(v)]));
}
