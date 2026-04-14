// @ts-ignore - resend may not be installed in all environments
let Resend: any;
try { Resend = require('resend').Resend; } catch { Resend = null; }

/**
 * Email payload for sending emails
 */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

/**
 * Result from email service
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Template data for rendering
 */
export interface TemplateData {
  [key: string]: unknown;
}

// Initialize Resend client lazily to avoid build-time errors when key is missing
let _resend: any = null;
function getResend(): any {
  if (!_resend && Resend) {
    const apiKey = process.env.EMAIL_SERVICE_API_KEY || process.env.RESEND_API_KEY || '';
    _resend = new Resend(apiKey);
  }
  return _resend;
}

/**
 * Default email configuration
 *
 * The `from` address is resolved defensively: if any env var still carries a
 * legacy nnntriplenet.com sender (from the old newsletter project that used
 * to share this repo), we ignore it and fall back to the canonical
 * DealSignals sender. This prevents stale Vercel env vars from leaking a
 * wrong "From" line into production emails while the env vars get cleaned up.
 */
function resolveDefaultFrom(): string {
  const raw = process.env.EMAIL_FROM_ADDRESS;
  if (raw && !/nnntriplenet/i.test(raw)) return raw;
  return 'Deal Signals <no-reply@dealsignals.app>';
}
const DEFAULT_FROM = resolveDefaultFrom();
const COMPANY_NAME = 'Deal Signals';
const PHYSICAL_ADDRESS = 'Mequon, Wisconsin';

/**
 * Send email via Resend API
 * CAN-SPAM compliant with unsubscribe link and physical address
 */
export interface EmailAttachment {
  filename: string;
  /** base64-encoded content OR Node.js Buffer. Resend accepts either. */
  content: string | Buffer;
  contentType?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  from: string = DEFAULT_FROM,
  manageToken?: string,
  options?: { bcc?: string | string[]; replyTo?: string | string[]; attachments?: EmailAttachment[] }
): Promise<EmailResult> {
  try {
    // Validate email format
    if (!isValidEmail(to)) {
      return {
        success: false,
        error: 'Invalid email address',
      };
    }

    // Check if email service is configured
    const apiKey = process.env.EMAIL_SERVICE_API_KEY || process.env.RESEND_API_KEY || '';
    if (!apiKey) {
      console.error('[email] RESEND_API_KEY not configured - email NOT sent to:', to, 'subject:', subject);
      return {
        success: false,
        error: 'Email service not configured (RESEND_API_KEY missing)',
      };
    }

    // Add CAN-SPAM compliance footer if not already present
    const htmlWithFooter = addCamCanSpamFooter(html, to, manageToken);

    // Build email payload
    const emailPayload: Record<string, unknown> = {
      from,
      to,
      subject,
      html: htmlWithFooter,
      text: text || stripHtmlTags(htmlWithFooter),
    };

    // Add BCC if provided
    if (options?.bcc) {
      emailPayload.bcc = options.bcc;
    }

    // Add Reply-To if provided. Resend expects `reply_to` in its JSON API.
    if (options?.replyTo) {
      emailPayload.reply_to = options.replyTo;
    }

    // Add attachments if provided.
    if (options?.attachments && options.attachments.length > 0) {
      emailPayload.attachments = options.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { content_type: a.contentType } : {}),
      }));
    }

    const response = await getResend().emails.send(emailPayload);

    if (response.error) {
      console.error('Email send error:', response.error);
      return {
        success: false,
        error: response.error.message,
      };
    }

    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error) {
    console.error('Email service error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email service error',
    };
  }
}

/**
 * Render email template with data
 */
export async function renderTemplate(templateName: string, data: TemplateData): Promise<string> {
  const templates = await import('./email-templates');

  switch (templateName) {
    case 'registration_welcome':
      return templates.registrationWelcomeTemplate(data as Parameters<typeof templates.registrationWelcomeTemplate>[0]);
    case 'purchase_confirmation':
      return templates.purchaseConfirmationTemplate(data as Parameters<typeof templates.purchaseConfirmationTemplate>[0]);
    default:
      console.warn(`Unknown email template: ${templateName}`);
      return '';
  }
}

/**
 * Validate email format (basic RFC 5322)
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Add transactional email footer (company name + physical address).
 * DealSignals only sends transactional emails (account, billing, password)
 * - no marketing lists, so no unsubscribe link is required.
 */
function addCamCanSpamFooter(html: string, _email: string, _manageToken?: string): string {
  const footer = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
      <tr>
        <td style="font-size: 12px; color: #666666; text-align: center; padding: 20px 0;">
          <p style="margin: 5px 0;">© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
          <p style="margin: 5px 0;">${PHYSICAL_ADDRESS}</p>
          <p style="margin: 5px 0;">This is a transactional email related to your Deal Signals account.</p>
        </td>
      </tr>
    </table>
  `;

  // Append footer before closing body/html tags
  return html.replace('</body>', `${footer}</body>`);
}

/**
 * Strip HTML tags from string (for plain text version)
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Re-export token utilities for convenience
export { generateToken, hashToken } from './tokens';
