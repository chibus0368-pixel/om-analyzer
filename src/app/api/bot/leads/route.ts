import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkBotKey, loadMembers, memberIso, toMs, NO_STORE, DAY_MS } from "@/lib/bot-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/leads?days=90
 * Read-only contact list for drafting follow-ups. Brody sends them; nothing
 * here sends email. People who unsubscribed are flagged, not hidden, so the
 * drafts can skip them.
 */
export async function GET(req: NextRequest) {
  const denied = checkBotKey(req);
  if (denied) return denied;
  try {
    const days = Math.min(3650, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 90));
    const from = Date.now() - days * DAY_MS;

    const [members, leadsSnap, notesSnap] = await Promise.all([
      loadMembers(),
      getAdminDb().collection("leads").get().catch(() => null),
      getAdminDb().collection("contact_notes").get().catch(() => null),
    ]);
    const notes = new Map<string, any>();
    notesSnap?.docs.forEach(d => { const x = d.data(); if (x.email) notes.set(String(x.email).toLowerCase(), x); });

    const seen = new Set<string>();
    const rows: any[] = [];
    for (const m of members) {
      if (m.signedUpAt < from) continue;
      seen.add(m.email);
      rows.push({
        type: "account",
        name: m.name || null,
        email: m.email,
        company: m.company,
        signedUpAt: memberIso(m.signedUpAt),
        source: m.source,
        campaign: m.campaign,
        deals: m.uploads.length,
        firstUploadAt: memberIso(m.firstUploadAt),
        lastUploadAt: memberIso(m.uploads[m.uploads.length - 1] || 0),
        lastActiveAt: memberIso(m.lastActiveAt),
        unsubscribed: m.unsubscribed,
      });
    }
    leadsSnap?.docs.forEach(d => {
      const x = d.data();
      const email = String(x.email || "").trim().toLowerCase();
      const t = toMs(x.createdAt);
      if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (t && t < from)) return;
      seen.add(email);
      rows.push({
        type: "lead",
        name: x.name || [x.firstName, x.lastName].filter(Boolean).join(" ") || null,
        email,
        company: x.company || null,
        signedUpAt: memberIso(t),
        source: x.lastSource || x.source || null,
        campaign: null,
        deals: 0,
        firstUploadAt: null,
        lastUploadAt: null,
        lastActiveAt: memberIso(toMs(x.updatedAt || x.lastSeenAt)),
        unsubscribed: x.status === "unsubscribed",
      });
    });
    for (const r of rows) {
      const n = notes.get(r.email);
      const emails = (n?.log || []).filter((l: any) => l.type === "email" && l.status === "sent");
      r.tags = n?.tags || [];
      r.followUpStatus = n?.status || null;
      r.nextFollowUpAt = n?.nextFollowUpAt || null;
      r.lastEmailedAt = emails.length ? emails[emails.length - 1].at : null;
      r.lastNote = n?.notes?.length ? n.notes[n.notes.length - 1].text : null;
    }
    rows.sort((a, b) => String(b.signedUpAt || "").localeCompare(String(a.signedUpAt || "")));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      window: { days, from: new Date(from).toISOString() },
      note: "Skip anyone with unsubscribed: true. Use /api/bot/actions (sendEmail, updateContact) to follow up and record it.",
      count: rows.length,
      leads: rows,
    }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[bot/leads]", err?.message);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500, headers: NO_STORE });
  }
}
