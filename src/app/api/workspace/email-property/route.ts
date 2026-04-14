import { NextRequest, NextResponse } from "next/server";
import { sendEmail, EmailAttachment } from "@/lib/email";

/**
 * Email-property route — send a formatted property page via email,
 * with optional XLSX/DOC attachments, using Resend.
 *
 * Request: multipart/form-data
 *   - to: string (recipient email)
 *   - subject: string
 *   - html: string (rendered property page HTML)
 *   - fromName: string (sender's display name; used in From + ReplyTo)
 *   - fromEmail: string (sender's email; used as ReplyTo)
 *   - note: string (optional personal note from sender; already baked into html)
 *   - xlsx: File (optional — Underwriting Workbook)
 *   - brief: File (optional — Brief DOC)
 *
 * Returns: { success: boolean, messageId?: string, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const to = String(form.get("to") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const html = String(form.get("html") || "");
    const fromName = String(form.get("fromName") || "").trim();
    const fromEmail = String(form.get("fromEmail") || "").trim();

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    // Size cap for safety — Resend max ~40MB, we enforce 15MB to be safe.
    const MAX_BYTES = 15 * 1024 * 1024;

    const attachments: EmailAttachment[] = [];

    const xlsxFile = form.get("xlsx");
    if (xlsxFile && xlsxFile instanceof File && xlsxFile.size > 0) {
      if (xlsxFile.size > MAX_BYTES) {
        return NextResponse.json({ error: "XLSX attachment too large (>15MB)" }, { status: 413 });
      }
      const buf = Buffer.from(await xlsxFile.arrayBuffer());
      attachments.push({
        filename: xlsxFile.name || "Underwriting.xlsx",
        content: buf,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    const briefFile = form.get("brief");
    if (briefFile && briefFile instanceof File && briefFile.size > 0) {
      if (briefFile.size > MAX_BYTES) {
        return NextResponse.json({ error: "Brief attachment too large (>15MB)" }, { status: 413 });
      }
      const buf = Buffer.from(await briefFile.arrayBuffer());
      attachments.push({
        filename: briefFile.name || "Brief.doc",
        content: buf,
        contentType: "application/msword",
      });
    }

    // Reply-To is the logged-in user so recipient replies go back to sender.
    const replyTo = fromEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)
      ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
      : undefined;

    const result = await sendEmail(
      to,
      subject,
      html,
      undefined,
      undefined,
      undefined,
      { replyTo, attachments: attachments.length ? attachments : undefined }
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Email send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (e: any) {
    console.error("[email-property] error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
