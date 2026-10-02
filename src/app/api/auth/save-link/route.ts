import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.scoreom.com").replace(/\/$/, "");

/**
 * POST /api/auth/save-link
 * Sent right after a trial user creates an account from the "Save this deal"
 * card with only an email address. Emails them a link to set a password so
 * they can get back to the saved deal from any device. The link is a standard
 * Firebase password-reset link for the caller's own (just created) account.
 *
 * Auth: Bearer ID token of the new account. No body.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const email = user.email;
    if (!email || !user.providerData.some((p) => p.providerId === "password")) {
      return NextResponse.json({ error: "No email account to send a link for" }, { status: 400 });
    }
    // One email per account, and only for accounts created from the card,
    // so this can't be used to spam an inbox.
    const ref = getAdminDb().collection("users").doc(decoded.uid);
    const sp = (await ref.get()).data()?.savePrompt || {};
    if (!sp.signedUpAt) return NextResponse.json({ error: "Not a save-prompt signup" }, { status: 400 });
    if (sp.linkSentAt) return NextResponse.json({ ok: true, alreadySent: true });

    const link = await adminAuth.generatePasswordResetLink(email, { url: `${SITE_URL}/workspace/login` });
    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <h2 style="font-size:20px;margin:0 0 12px">Your deal is saved</h2>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Your ScoreOM account is ready and the deal you just screened is in your DealBoard. Set a password so you can come back to it from any device.</p>
  <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#65A30D;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px">Set my password</a></p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 8px">After that, sign in any time at <a href="${SITE_URL}/workspace/login" style="color:#4D7C0F">${SITE_URL.replace(/^https?:\/\//, "")}/workspace/login</a> with this email address.</p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">If you didn't ask for this, you can ignore this email.</p>
</div>`;
    const result = await sendEmail(email, "Your ScoreOM deal is saved. Set a password to come back to it", html);
    if (!result.success) {
      console.warn("[save-link] email failed:", result.error);
      return NextResponse.json({ error: "Could not send the email" }, { status: 502 });
    }
    await ref.update({ "savePrompt.linkSentAt": new Date() });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[save-link]", err?.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
