import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { sendEmail } from '@/lib/email';

interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

interface ContactMessageDoc {
  name: string;
  email: string;
  message: string;
  createdAt: Timestamp;
  ipAddress?: string;
  userAgent?: string;
  status: 'new' | 'read' | 'responded';
}

/**
 * POST /api/contact
 * Handle contact form submissions
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ContactPayload = await request.json();
    const { name, email, message } = body;

    // Validate inputs
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required' },
        { status: 400 }
      );
    }

    if (!message || !message.trim() || message.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Message must be at least 10 characters' },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedMessage = sanitizeInput(message);

    // Get client IP for spam detection
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                      request.headers.get('x-client-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Store message in Firestore (Admin SDK - bypasses security rules).
    // The Firestore write is best-effort: if it fails for any reason (missing
    // service account key, network blip, etc.) we still want the email to go
    // out. The email IS the source of truth - Firestore is just an audit log.
    let messageId = 'pending';
    try {
      const messageDoc: ContactMessageDoc = {
        name: sanitizedName,
        email: sanitizedEmail,
        message: sanitizedMessage,
        createdAt: Timestamp.now(),
        ipAddress,
        userAgent,
        status: 'new',
      };
      const docRef = await getAdminDb().collection('contact_messages').add(messageDoc);
      messageId = docRef.id;
    } catch (firestoreErr) {
      console.error('[contact] Firestore write failed (continuing with email):', firestoreErr);
    }

    // Send notification email to admin (support@dealsignals.app by default).
    // Reply-To is set to the submitter's address so hitting "Reply" in Gmail
    // goes straight back to the prospect instead of to the no-reply sender.
    const adminEmail = process.env.ADMIN_EMAIL_ADDRESS || 'support@dealsignals.app';
    const adminNotificationHtml = generateAdminNotificationEmail(
      sanitizedName,
      sanitizedEmail,
      sanitizedMessage,
      messageId
    );

    const adminResult = await sendEmail(
      adminEmail,
      `New Contact Form Submission from ${sanitizedName}`,
      adminNotificationHtml,
      undefined,
      undefined,
      undefined,
      { replyTo: sanitizedEmail }
    );

    // If the admin email failed, surface that as a 500 so the user knows to
    // retry (otherwise we'd silently lose their message).
    if (!adminResult.success) {
      console.error('[contact] Admin notification failed:', adminResult.error);
      return NextResponse.json(
        { success: false, error: 'Unable to deliver your message right now. Please email support@dealsignals.app directly.' },
        { status: 500 }
      );
    }

    // Send confirmation to user. Reply-To points to support@ so if the
    // customer replies to the confirmation, it lands in the human mailbox.
    // This is best-effort - if it fails, the admin already has the message.
    const userConfirmationHtml = generateUserConfirmationEmail(sanitizedName);
    const userResult = await sendEmail(
      sanitizedEmail,
      'We Received Your Message - Deal Signals',
      userConfirmationHtml,
      undefined,
      undefined,
      undefined,
      { replyTo: adminEmail }
    );
    if (!userResult.success) {
      console.warn('[contact] User confirmation failed (non-fatal):', userResult.error);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your message. We will get back to you soon!',
        messageId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contact form error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize user input to prevent XSS and script injection.
 * Escapes HTML entities rather than stripping characters, preserving user intent.
 */
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .slice(0, 1000); // Limit length to prevent abuse
}

/**
 * Generate admin notification email
 */
function generateAdminNotificationEmail(
  name: string,
  email: string,
  message: string,
  messageId: string
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dealsignals.app';
  const dashboardUrl = `${appUrl}/admin/messages/${messageId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Inbound - Deal Signals</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F5F5F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
    <tr>
      <td style="padding: 32px 28px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <tr>
            <td style="text-align: center; padding-bottom: 18px; border-bottom: 3px solid #06080F;">
              <img src="${appUrl}/logo.png" alt="Deal Signals" width="200" style="max-width: 200px; height: auto; display: inline-block;" />
              <p style="margin: 8px 0 0 0; color: #C49A3C; font-size: 11px; font-weight: bold; letter-spacing: 1.5px;">ADMIN NOTIFICATION</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 28px 32px;">
        <p style="margin: 0 0 4px 0; color: #DC3545; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.2px;">New inbound</p>
        <h2 style="margin: 0 0 20px 0; color: #06080F; font-size: 20px;">Contact form submission</h2>

        <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E5E5; border-radius: 6px; border-left: 4px solid #DC3545;">
          <tr>
            <td style="padding: 18px 20px;">
              <p style="margin: 0 0 10px 0; font-size: 13px;"><strong style="color: #666;">From:</strong> <span style="color: #06080F;">${name}</span></p>
              <p style="margin: 0 0 10px 0; font-size: 13px;"><strong style="color: #666;">Email:</strong> <a href="mailto:${email}" style="color: #DC3545; text-decoration: none;">${email}</a></p>
              <p style="margin: 0 0 14px 0; font-size: 13px;"><strong style="color: #666;">Submission ID:</strong> <span style="color: #06080F; font-family: 'SF Mono', Menlo, monospace; font-size: 12px;">${messageId}</span></p>

              <div style="margin: 16px 0 0 0; padding: 16px; background-color: #F5F5F5; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #C49A3C; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.2px;">Message</p>
                <p style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; color: #333; line-height: 1.65;">${message}</p>
              </div>

              <p style="margin: 22px 0 0 0;">
                <a href="${dashboardUrl}" style="background-color: #DC3545; color: #FFFFFF; padding: 11px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold; font-size: 13px;">Open in Dashboard</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin: 20px 0 0 0; color: #999; font-size: 11px;">Reply to this email to respond directly to ${name}.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generate user confirmation email
 */
function generateUserConfirmationEmail(name: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dealsignals.app';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Message Received - Deal Signals</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F5F5F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
    <tr>
      <td style="padding: 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <tr>
            <td style="text-align: center; padding-bottom: 18px; border-bottom: 3px solid #06080F;">
              <a href="${appUrl}" style="text-decoration: none;">
                <img src="${appUrl}/logo.png" alt="Deal Signals" width="220" style="max-width: 220px; height: auto; display: inline-block;" />
              </a>
              <p style="margin: 8px 0 0 0; color: #C49A3C; font-size: 12px; font-weight: bold; letter-spacing: 1px;">MARKET INTELLIGENCE</p>
            </td>
          </tr>
        </table>

        <p style="margin: 24px 0 6px 0; color: #C49A3C; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; text-align: center;">Message received</p>
        <h2 style="margin: 0 0 20px 0; color: #06080F; text-align: center; font-size: 24px; letter-spacing: -0.01em;">Thanks, ${name}. We've got it.</h2>

        <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.7; color: #333;">
          Your message is in front of the Deal Signals team. We read every inbound and we'll get back to you inside one business day, usually much faster.
        </p>

        <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.7; color: #333;">
          If you're in the middle of a deal and need a quick screen while you wait, you can upload an OM right now and the platform will hand you a Deal Score in about 3 minutes.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
          <tr>
            <td style="text-align: center;">
              <a href="${appUrl}/workspace" style="background-color: #DC3545; color: #FFFFFF; padding: 13px 32px; font-weight: bold; font-size: 14px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Open My Workspace
              </a>
            </td>
          </tr>
        </table>

        <p style="margin: 24px 0 0 0; font-size: 13px; color: #666; line-height: 1.6;">
          The Deal Signals team
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #E5E5E5;">
          <tr>
            <td style="font-size: 11px; color: #999; text-align: center; padding: 16px 0;">
              <p style="margin: 4px 0;">&copy; ${new Date().getFullYear()} Deal Signals. All rights reserved.</p>
              <p style="margin: 4px 0;">Mequon, Wisconsin &middot; <a href="${appUrl}" style="color: #999; text-decoration: none;">dealsignals.app</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
