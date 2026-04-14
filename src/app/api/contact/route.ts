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
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/messages/${messageId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 40px 20px; background-color: #f5f5f5;">
        <h2 style="margin: 0 0 20px 0; color: #06080F;">New Contact Form Submission</h2>

        <div style="background-color: white; padding: 20px; border-left: 4px solid #DC3545;">
          <p style="margin: 0 0 15px 0;"><strong>From:</strong> ${name}</p>
          <p style="margin: 0 0 15px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0 0 15px 0;"><strong>Submission ID:</strong> ${messageId}</p>

          <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #06080F;">Message:</h3>
            <p style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">
              ${message}
            </p>
          </div>

          <p style="margin: 20px 0 0 0;">
            <a href="${dashboardUrl}" style="background-color: #DC3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View in Dashboard
            </a>
          </p>
        </div>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Message Received</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 40px 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 40px;">
          <h1 style="margin: 0 0 20px 0; color: #06080F; text-align: center;">Thank You!</h1>

          <p style="margin: 0 0 15px 0; font-size: 16px;">
            Hi ${name},
          </p>

          <p style="margin: 0 0 15px 0; font-size: 16px; line-height: 1.6;">
            We've received your message and appreciate you reaching out to us.
            Our team will review your message and get back to you as soon as possible,
            typically within 24 hours.
          </p>

          <p style="margin: 0 0 15px 0; font-size: 16px; line-height: 1.6;">
            If you need immediate assistance, please don't hesitate to reach out
            on our social media channels or call our support line.
          </p>

          <p style="margin: 30px 0 0 0; font-size: 14px; color: #666;">
            Best regards,<br/>
            The Deal Signals Team
          </p>
        </div>

        <div style="text-align: center; padding-top: 20px; font-size: 12px; color: #999;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Deal Signals. All rights reserved.</p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
