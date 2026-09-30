import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, SITE_URL, emailKey, unsubApiUrl, unsubUrl, sleep } from "./server";
import type { Contact } from "./contacts";

// @ts-ignore - resend is a runtime dependency
let ResendCtor: any; try { ResendCtor = require("resend").Resend; } catch { ResendCtor = null; }

export interface EmailContent {
  subject: string;
  preheader?: string;
  body: string;        // lightweight markdown
  ctaLabel?: string;
  ctaUrl?: string;
}

export const MARKETING_FROM = process.env.MARKETING_FROM_ADDRESS || "ScoreOM <hello@scoreom.com>";
export const MARKETING_REPLY_TO = process.env.MARKETING_REPLY_TO || "";
const ADDRESS = process.env.MARKETING_PHYSICAL_ADDRESS || "ScoreOM, Mequon, Wisconsin, USA";

function resendKey(): string {
  return process.env.RESEND_API_KEY || process.env.EMAIL_SERVICE_API_KEY || "";
}
export function resendClient(): any {
  const key = resendKey();
  if (!key || !ResendCtor) return null;
  return new ResendCtor(key);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function mergeTags(text: string, c: Pick<Contact, "firstName" | "email" | "name">): string {
  return text.replace(/\{\{\s*(\w+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g, (_m, key: string, fallback?: string) => {
    const v = key === "firstName" ? c.firstName : key === "name" ? c.name : key === "email" ? c.email : "";
    return v || (fallback ?? "");
  });
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#4d7c0f;font-weight:600;">$1</a>');
}

/** Lightweight markdown: paragraphs, # headings, - bullets, **bold**, [links](url). */
export function markdownToHtml(md: string): string {
  const blocks = md.replace(/\r/g, "").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    if (/^#{1,3}\s/.test(b)) {
      return `<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">${inline(b.replace(/^#{1,3}\s+/, ""))}</h2>`;
    }
    const lines = b.split("\n");
    if (lines.every(l => /^[-*]\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:15px;line-height:1.6;">${lines.map(l => `<li style="margin:0 0 6px;">${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.65;">${lines.map(inline).join("<br/>")}</p>`;
  }).join("\n");
}

function markdownToText(md: string): string {
  return md.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/^#{1,3}\s+/gm, "");
}

export function renderEmail(content: EmailContent, c: Pick<Contact, "firstName" | "email" | "name">): { subject: string; html: string; text: string } {
  const subject = mergeTags(content.subject, c);
  const body = mergeTags(content.body, c);
  const pre = content.preheader ? mergeTags(content.preheader, c) : "";
  const unsub = unsubUrl(c.email);
  const cta = content.ctaLabel && content.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:10px;background:#84CC16;">
        <a href="${esc(content.ctaUrl)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#0f172a;text-decoration:none;border-radius:10px;">${esc(mergeTags(content.ctaLabel, c))}</a>
      </td></tr></table>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
    <tr><td style="background:#0f172a;border-radius:14px 14px 0 0;padding:20px 28px;">
      <a href="${SITE_URL}" style="text-decoration:none;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Score<span style="color:#84CC16;">OM</span></a>
    </td></tr>
    <tr><td style="background:#ffffff;padding:30px 28px 24px;border-radius:0 0 14px 14px;">
      ${markdownToHtml(body)}
      ${cta}
    </td></tr>
    <tr><td style="padding:18px 8px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
      You're getting this because you signed up for or tried ScoreOM.<br/>
      ${esc(ADDRESS)}<br/>
      <a href="${unsub}" style="color:#64748b;">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = `${markdownToText(body)}${content.ctaUrl ? `\n\n${content.ctaLabel || "Open"}: ${content.ctaUrl}` : ""}\n\n--\n${ADDRESS}\nUnsubscribe: ${unsub}`;
  return { subject, html, text };
}

export interface SendItem { contact: Contact; content: EmailContent; kind: "broadcast" | "drip" | "test" | "followup"; refId: string; step?: number }
export interface SendSummary { sent: number; failed: number; skipped: number; errors: string[] }

/**
 * Send marketing emails through Resend's batch API (100 per call), with
 * one-click List-Unsubscribe headers. Idempotent per (refId, step, email):
 * a send already logged in marketing_sends is skipped, so an interrupted
 * broadcast can resume safely.
 */
export async function sendMarketing(items: SendItem[], opts: { deadlineMs?: number } = {}): Promise<SendSummary> {
  const out: SendSummary = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const resend = resendClient();
  if (!resend) { out.errors.push("RESEND_API_KEY is not set"); out.failed = items.length; return out; }
  const db = getAdminDb();
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;

  const logId = (it: SendItem) => `${it.kind}_${it.refId}_${it.step ?? 0}_${emailKey(it.contact.email)}`;

  // Skip already-sent (not for tests)
  const pending: SendItem[] = [];
  for (let i = 0; i < items.length; i += 300) {
    const chunk = items.slice(i, i + 300);
    const refs = chunk.filter(c => c.kind !== "test").map(c => db.collection(COLL.sends).doc(logId(c)));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const done = new Set(snaps.filter(s => s.exists && s.data()?.status === "sent").map(s => s.id));
    chunk.forEach(c => { if (c.kind !== "test" && done.has(logId(c))) out.skipped++; else pending.push(c); });
  }

  for (let i = 0; i < pending.length; i += 100) {
    if (Date.now() > deadline) { out.errors.push("Stopped early (time limit); the rest will go out on the next run."); break; }
    const batch = pending.slice(i, i + 100);
    const payloads = batch.map(it => {
      const r = renderEmail(it.content, it.contact);
      return {
        from: MARKETING_FROM,
        to: it.contact.email,
        subject: it.kind === "test" ? `[TEST] ${r.subject}` : r.subject,
        html: r.html,
        text: r.text,
        ...(MARKETING_REPLY_TO ? { reply_to: MARKETING_REPLY_TO } : {}),
        headers: {
          "List-Unsubscribe": `<${unsubApiUrl(it.contact.email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });
    let ids: string[] = [];
    let error = "";
    try {
      const res = await resend.batch.send(payloads);
      if (res.error) error = res.error.message || String(res.error);
      else ids = (res.data?.data || res.data || []).map((d: any) => d.id);
    } catch (e: any) {
      error = e?.message || String(e);
    }
    const wb = db.batch();
    batch.forEach((it, j) => {
      if (it.kind === "test") return;
      wb.set(db.collection(COLL.sends).doc(logId(it)), {
        email: it.contact.email, kind: it.kind, refId: it.refId, step: it.step ?? 0,
        status: error ? "failed" : "sent", messageId: ids[j] || null, error: error || null,
        at: new Date().toISOString(),
      });
    });
    await wb.commit();
    if (error) { out.failed += batch.length; out.errors.push(error); }
    else out.sent += batch.length;
    if (i + 100 < pending.length) await sleep(600); // stay under Resend's rate limit
  }
  return out;
}
