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
 */
const DEFAULT_FROM = process.env.EMAIL_FROM_ADDRESS || 'Deal Signal <onboarding@resend.dev>';
const COMPANY_NAME = 'Deal Signal';
const UNSUBSCRIBE_DOMAIN = process.env.UNSUBSCRIBE_DOMAIN || 'https://nnntriplenet.com';
const PHYSICAL_ADDRESS = 'Mequon, Wisconsin';

/**
 * Send email via Resend API
 * CAN-SPAM compliant with unsubscribe link and physical address
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  from: string = DEFAULT_FROM,
  manageToken?: string,
  options?: { bcc?: string | string[] }
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
      console.error('[email] RESEND_API_KEY not configured — email NOT sent to:', to, 'subject:', subject);
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
    case 'confirmation':
      return templates.confirmationTemplate(data as Parameters<typeof templates.confirmationTemplate>[0]);
    case 'welcome':
      return templates.welcomeTemplate(data as Parameters<typeof templates.welcomeTemplate>[0]);
    case 'registration_welcome':
      return templates.registrationWelcomeTemplate(data as Parameters<typeof templates.registrationWelcomeTemplate>[0]);
    case 'purchase_confirmation':
      return templates.purchaseConfirmationTemplate(data as Parameters<typeof templates.purchaseConfirmationTemplate>[0]);
    case 'daily_brief':
      return templates.dailyBriefTemplate(data as Parameters<typeof templates.dailyBriefTemplate>[0]);
    case 'weekly_digest':
      return templates.weeklyDigestTemplate(data as Parameters<typeof templates.weeklyDigestTemplate>[0]);
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
 * Add CAN-SPAM compliant footer to email HTML
 */
function addCamCanSpamFooter(html: string, email: string, manageToken?: string): string {
  let unsubscribeUrl: string;
  let preferencesUrl: string;

  if (manageToken) {
    // Use secure token-based URLs
    unsubscribeUrl = `${UNSUBSCRIBE_DOMAIN}/api/subscribe/unsubscribe?token=${encodeURIComponent(manageToken)}`;
    preferencesUrl = `${UNSUBSCRIBE_DOMAIN}/subscribe/preferences?token=${encodeURIComponent(manageToken)}`;
  } else {
    // Fall back to email-based URLs (backward compatibility)
    const unsubscribeToken = Buffer.from(`${email}:${Date.now()}`).toString('base64');
    unsubscribeUrl = `${UNSUBSCRIBE_DOMAIN}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken}`;
    preferencesUrl = `${UNSUBSCRIBE_DOMAIN}/preferences?email=${encodeURIComponent(email)}`;
  }

  const footer = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
      <tr>
        <td style="font-size: 12px; color: #666666; text-align: center; padding: 20px 0;">
          <p style="margin: 5px 0;">© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
          <p style="margin: 5px 0;">${PHYSICAL_ADDRESS}</p>
          <p style="margin: 5px 0;">
            <a href="${unsubscribeUrl}" style="color: #0066cc; text-decoration: none;">Unsubscribe</a> |
            <a href="${preferencesUrl}" style="color: #0066cc; text-decoration: none;">Preferences</a>
          </p>
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

/**
 * Generate confirmation token for double opt-in
 */
export function generateConfirmationToken(email: string): string {
  return Buffer.from(`${email}:${Date.now()}`).toString('base64');
}

/**
 * Decode and validate confirmation token
 */
export function decodeConfirmationToken(token: string): { email: string; timestamp: number } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [email, timestamp] = decoded.split(':');
    return { email, timestamp: parseInt(timestamp, 10) };
  } catch {
    return null;
  }
}

// Re-export token utilities for convenience
export { generateToken, hashToken } from './tokens';
