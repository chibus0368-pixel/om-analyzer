import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';

/**
 * Email service types
 * Primary provider: Resend (fully implemented)
 * Secondary: ConvertKit, Beehiiv
 */
type EmailProvider = 'resend' | 'convertkit' | 'beehiiv';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendCampaignOptions {
  campaignId: string;
  subject: string;
  htmlContent: string;
  unsubscribeUrl: string;
  replyTo?: string;
}

interface WebhookEvent {
  type: 'bounce' | 'complaint' | 'unsubscribe' | 'open' | 'click';
  email: string;
  timestamp: number;
  eventId: string;
  provider: EmailProvider;
  metadata?: Record<string, unknown>;
}

/**
 * Email Service — Production-ready Resend integration
 * Handles sending, bulk campaigns, webhooks, and subscriber management
 */
export class EmailService {
  private provider: EmailProvider;
  private apiKey: string;
  private _db: admin.firestore.Firestore | null = null;
  private fromEmail: string;
  private replyTo: string;
  private baseUrl: string;

  /** Lazy Firestore getter — defers initialization until first use */
  private get db(): admin.firestore.Firestore {
    if (!this._db) {
      this._db = admin.firestore();
    }
    return this._db;
  }

  constructor(provider: EmailProvider) {
    this.provider = provider;
    this.apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_SERVICE_API_KEY || '';
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'briefing@nnntriplenet.com';
    this.replyTo = process.env.REPLY_TO_EMAIL || 'support@nnntriplenet.com';
    this.baseUrl = process.env.APP_BASE_URL || 'https://nnntriplenet.com';

    if (!this.apiKey) {
      logger.warn(`API key not configured for provider: ${provider}`);
    }
  }

  // ─── CORE SEND ────────────────────────────────────────────────────────

  /**
   * Send a single email via Resend API
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    options?: { replyTo?: string; tags?: { name: string; value: string }[] }
  ): Promise<SendResult> {
    switch (this.provider) {
      case 'resend':
        return this.sendViaResend(to, { subject, html, replyTo: options?.replyTo, tags: options?.tags });
      case 'convertkit':
        return this.sendViaConvertKit(to, { subject, html });
      case 'beehiiv':
        return this.sendViaBeehiiv(to, { subject, html });
      default:
        return { success: false, error: `Unsupported provider: ${this.provider}` };
    }
  }

  /**
   * Send confirmation email to a new subscriber
   */
  async sendConfirmationEmail(
    subscriberId: string,
    email: string,
    confirmationToken: string
  ): Promise<SendResult> {
    logger.info('Sending confirmation email', { subscriberId, email });

    const confirmUrl = `${this.baseUrl}/api/confirm?token=${encodeURIComponent(confirmationToken)}&subscriberId=${subscriberId}`;
    const unsubscribeUrl = `${this.baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`;

    const html = this.buildConfirmationHtml(email, confirmUrl, unsubscribeUrl);

    return this.sendEmail(email, 'Confirm Your NNNTripleNet Subscription', html, {
      tags: [{ name: 'type', value: 'confirmation' }],
    });
  }

  /**
   * Send welcome email after confirmation
   */
  async sendWelcomeEmail(subscriberId: string, email: string): Promise<SendResult> {
    logger.info('Sending welcome email', { subscriberId, email });

    const prefsUrl = `${this.baseUrl}/preferences?email=${encodeURIComponent(email)}`;
    const unsubscribeUrl = `${this.baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`;

    const html = this.buildWelcomeHtml(email, prefsUrl, unsubscribeUrl);

    return this.sendEmail(email, 'Welcome to NNNTripleNet — Your Daily CRE Intelligence', html, {
      tags: [{ name: 'type', value: 'welcome' }],
    });
  }

  // ─── CAMPAIGN SENDING ────────────────────────────────────────────────

  /**
   * Send an email campaign to a list of subscribers
   * Batches sends to respect API rate limits (max 100/batch, 2/sec)
   */
  async sendCampaign(
    subscriberIds: string[],
    options: SendCampaignOptions
  ): Promise<{ success: boolean; queued: number; failed: number; errors: string[] }> {
    logger.info('Sending campaign', {
      campaignId: options.campaignId,
      subscriberCount: subscriberIds.length,
    });

    const errors: string[] = [];
    let queued = 0;
    let failed = 0;
    const batchSize = 50;

    for (let i = 0; i < subscriberIds.length; i += batchSize) {
      const batch = subscriberIds.slice(i, i + batchSize);

      // Fetch subscriber data for this batch
      const subscriberDocs = await Promise.all(
        batch.map((id) => this.db.collection('subscribers').doc(id).get())
      );

      for (const doc of subscriberDocs) {
        if (!doc.exists) {
          failed++;
          errors.push(`${doc.id}: subscriber not found`);
          continue;
        }

        const subscriber = doc.data()!;
        if (subscriber.status !== 'confirmed') {
          failed++;
          continue;
        }

        try {
          // Personalize unsubscribe URL
          const unsubToken = Buffer.from(`${subscriber.email}:${Date.now()}`).toString('base64');
          const personalizedHtml = options.htmlContent.replace(
            /{{unsubscribe_url}}/g,
            `${this.baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`
          ).replace(
            /{{preferences_url}}/g,
            `${this.baseUrl}/preferences?email=${encodeURIComponent(subscriber.email)}`
          ).replace(
            /{{email}}/g,
            subscriber.email
          );

          const result = await this.sendEmail(
            subscriber.email,
            options.subject,
            personalizedHtml,
            {
              replyTo: options.replyTo || this.replyTo,
              tags: [
                { name: 'campaign', value: options.campaignId },
                { name: 'type', value: 'campaign' },
              ],
            }
          );

          if (result.success) {
            queued++;

            // Log individual send
            await this.db.collection('email_sends').add({
              campaignId: options.campaignId,
              subscriberId: doc.id,
              email: subscriber.email,
              messageId: result.messageId,
              status: 'sent',
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            failed++;
            errors.push(`${subscriber.email}: ${result.error}`);
          }

          // Rate limit: ~2 emails per second for Resend
          await this.sleep(500);
        } catch (error) {
          failed++;
          errors.push(`${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    logger.info('Campaign complete', { campaignId: options.campaignId, queued, failed });
    return { success: true, queued, failed, errors };
  }

  // ─── WEBHOOK PROCESSING ──────────────────────────────────────────────

  /**
   * Verify Resend webhook signature (svix)
   */
  verifyResendWebhook(
    payload: string,
    headers: { 'svix-id'?: string; 'svix-timestamp'?: string; 'svix-signature'?: string },
    webhookSecret?: string
  ): boolean {
    if (!webhookSecret) {
      logger.warn('No webhook secret configured, skipping verification');
      return true; // Allow in development
    }

    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn('Missing svix headers');
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampMs = parseInt(svixTimestamp) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > 300000) {
      logger.warn('Webhook timestamp too old');
      return false;
    }

    // Verify signature
    const secret = webhookSecret.startsWith('whsec_')
      ? Buffer.from(webhookSecret.slice(6), 'base64')
      : Buffer.from(webhookSecret, 'base64');

    const toSign = `${svixId}.${svixTimestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(toSign)
      .digest('base64');

    const signatures = svixSignature.split(' ');
    return signatures.some((sig) => {
      const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(sigValue)
      );
    });
  }

  /**
   * Parse Resend webhook event into our standard format
   */
  parseResendWebhook(payload: Record<string, any>): WebhookEvent | null {
    const eventType = payload.type;
    const data = payload.data;

    if (!data?.email_id) {
      logger.warn('Invalid webhook payload — no email_id');
      return null;
    }

    const typeMap: Record<string, WebhookEvent['type']> = {
      'email.bounced': 'bounce',
      'email.complained': 'complaint',
      'email.delivered': 'open', // Track delivery
      'email.opened': 'open',
      'email.clicked': 'click',
    };

    const mappedType = typeMap[eventType];
    if (!mappedType) {
      logger.info('Unhandled webhook event type', { eventType });
      return null;
    }

    // Extract recipient email
    const recipientEmail = data.to?.[0] || data.email || '';
    if (!recipientEmail) {
      logger.warn('No recipient email in webhook', { eventType });
      return null;
    }

    return {
      type: mappedType,
      email: recipientEmail,
      timestamp: Date.now(),
      eventId: data.email_id,
      provider: 'resend',
      metadata: {
        subject: data.subject,
        createdAt: data.created_at,
        ...(data.bounce && { bounceType: data.bounce.type }),
        ...(data.click && { clickUrl: data.click.link }),
      },
    };
  }

  /**
   * Process a webhook event — update subscriber status in Firestore
   */
  async handleWebhook(event: WebhookEvent): Promise<{
    processed: boolean;
    action?: string;
    error?: string;
  }> {
    logger.info('Processing webhook', { type: event.type, email: event.email });

    try {
      // Find subscriber by email
      const snapshot = await this.db
        .collection('subscribers')
        .where('email', '==', event.email)
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn('Subscriber not found for webhook', { email: event.email });
        return { processed: true, action: 'subscriber_not_found' };
      }

      const subscriberDoc = snapshot.docs[0];
      const updateData: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      switch (event.type) {
        case 'bounce':
          updateData.status = 'bounced';
          updateData.bouncedAt = new Date().toISOString();
          updateData.bounceMetadata = event.metadata;
          break;
        case 'complaint':
          updateData.status = 'complained';
          updateData.complainedAt = new Date().toISOString();
          break;
        case 'unsubscribe':
          updateData.status = 'unsubscribed';
          updateData.unsubscribedAt = new Date().toISOString();
          break;
        case 'open':
        case 'click':
          updateData.lastEngagedAt = new Date().toISOString();
          updateData.engagementCount = admin.firestore.FieldValue.increment(1);
          break;
      }

      await subscriberDoc.ref.update(updateData);

      // Log the event
      await this.db.collection('email_events').add({
        subscriberId: subscriberDoc.id,
        email: event.email,
        type: event.type,
        eventId: event.eventId,
        provider: event.provider,
        metadata: event.metadata,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { processed: true, action: event.type };
    } catch (error) {
      logger.error('Webhook processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { processed: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ─── PROVIDER IMPLEMENTATIONS ────────────────────────────────────────

  /**
   * Resend API — Primary provider (FULLY IMPLEMENTED)
   * Docs: https://resend.com/docs/api-reference/emails/send-email
   */
  private async sendViaResend(
    email: string,
    options: {
      subject: string;
      html: string;
      replyTo?: string;
      tags?: { name: string; value: string }[];
    }
  ): Promise<SendResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [email],
          subject: options.subject,
          html: options.html,
          reply_to: options.replyTo || this.replyTo,
          tags: options.tags || [],
          headers: {
            'List-Unsubscribe': `<${this.baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });

      const data = (await response.json()) as Record<string, any>;

      if (!response.ok) {
        const errorMsg = data.message || data.error || `HTTP ${response.status}`;
        logger.error('Resend API error', { status: response.status, error: errorMsg, email });

        // Handle specific error codes
        if (response.status === 429) {
          // Rate limited — wait and retry once
          await this.sleep(2000);
          return this.sendViaResend(email, options);
        }

        return { success: false, error: errorMsg };
      }

      logger.info('Email sent via Resend', { messageId: data.id, email });
      return { success: true, messageId: data.id };
    } catch (error) {
      logger.error('Resend send failed', {
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /**
   * ConvertKit API — Secondary provider
   */
  private async sendViaConvertKit(
    email: string,
    options: { subject: string; html: string }
  ): Promise<SendResult> {
    const ckApiKey = process.env.CONVERTKIT_API_KEY || this.apiKey;

    try {
      // ConvertKit uses broadcasts for email sending
      const response = await fetch('https://api.convertkit.com/v4/broadcasts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ckApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: options.subject,
          content: options.html,
          email_address: email,
          public: false,
        }),
      });

      const data = (await response.json()) as Record<string, any>;

      if (!response.ok) {
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }

      return { success: true, messageId: data.broadcast?.id?.toString() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'ConvertKit error' };
    }
  }

  /**
   * Beehiiv API — Tertiary provider
   */
  private async sendViaBeehiiv(
    email: string,
    options: { subject: string; html: string }
  ): Promise<SendResult> {
    const bhApiKey = process.env.BEEHIIV_API_KEY || this.apiKey;
    const pubId = process.env.BEEHIIV_PUBLICATION_ID || '';

    try {
      const response = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bhApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: options.subject,
          content_html: options.html,
          status: 'confirmed',
          send_to: email,
        }),
      });

      const data = (await response.json()) as Record<string, any>;

      if (!response.ok) {
        return { success: false, error: data.message || `HTTP ${response.status}` };
      }

      return { success: true, messageId: data.data?.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Beehiiv error' };
    }
  }

  // ─── EMAIL TEMPLATES (INLINE) ────────────────────────────────────────

  private buildConfirmationHtml(email: string, confirmUrl: string, unsubscribeUrl: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <tr><td style="background:#06080F;padding:24px 32px;border-radius:12px 12px 0 0;">
    <span style="color:#C49A3C;font-size:18px;font-weight:800;letter-spacing:1px;">NNNTRIPLENET</span>
    <span style="color:rgba(255,255,255,0.3);font-size:10px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">MARKET INTELLIGENCE</span>
  </td></tr>
  <tr><td style="background:#fff;padding:40px 32px;border:1px solid #D8DFE9;border-top:none;">
    <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">Confirm Your Email</h1>
    <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 24px;">
      Thanks for subscribing to NNNTripleNet. Click the button below to confirm your email and start receiving daily CRE intelligence.
    </p>
    <a href="${confirmUrl}" style="display:inline-block;background:#DC3545;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
      Confirm Email Address
    </a>
    <p style="font-size:12px;color:#8899B0;margin-top:24px;">
      If the button doesn't work, copy this link: <a href="${confirmUrl}" style="color:#2563EB;word-break:break-all;">${confirmUrl}</a>
    </p>
    <p style="font-size:12px;color:#8899B0;margin-top:16px;">
      Didn't sign up? You can safely ignore this email.
    </p>
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="font-size:11px;color:#8899B0;margin:0;">
      NNNTripleNet, Inc. • CRE Market Intelligence<br>
      <a href="${unsubscribeUrl}" style="color:#8899B0;">Unsubscribe</a>
    </p>
  </td></tr>
</table></body></html>`;
  }

  private buildWelcomeHtml(email: string, prefsUrl: string, unsubscribeUrl: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <tr><td style="background:#06080F;padding:24px 32px;border-radius:12px 12px 0 0;">
    <span style="color:#C49A3C;font-size:18px;font-weight:800;letter-spacing:1px;">NNNTRIPLENET</span>
    <span style="color:rgba(255,255,255,0.3);font-size:10px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">MARKET INTELLIGENCE</span>
  </td></tr>
  <tr><td style="background:#fff;padding:40px 32px;border:1px solid #D8DFE9;border-top:none;">
    <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">Welcome to NNNTripleNet!</h1>
    <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
      You're confirmed. Here's what you'll receive:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:12px 16px;background:#F6F8FB;border-radius:8px;margin-bottom:8px;">
        <strong style="color:#06080F;font-size:14px;">Daily Brief</strong>
        <span style="color:#5A7091;font-size:13px;display:block;">Mon-Fri by 7 AM ET — cap rates, treasury yields, deal flow, risk alerts</span>
      </td></tr>
      <tr><td style="height:8px;"></td></tr>
      <tr><td style="padding:12px 16px;background:#F6F8FB;border-radius:8px;">
        <strong style="color:#06080F;font-size:14px;">Weekly Digest</strong>
        <span style="color:#5A7091;font-size:13px;display:block;">Sundays — top articles, market recap, deal highlights</span>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#5A7091;line-height:1.6;">
      <strong>Pro tip:</strong> <a href="${prefsUrl}" style="color:#2563EB;">Customize your preferences</a> to get exactly the content you want.
    </p>
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="font-size:11px;color:#8899B0;margin:0;">
      NNNTripleNet, Inc. • CRE Market Intelligence<br>
      <a href="${prefsUrl}" style="color:#8899B0;">Preferences</a> • <a href="${unsubscribeUrl}" style="color:#8899B0;">Unsubscribe</a>
    </p>
  </td></tr>
</table></body></html>`;
  }

  // ─── UTILITIES ────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory / singleton (lazy — only instantiates on first access)
 */
let _emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!_emailServiceInstance) {
    const provider = (process.env.EMAIL_PROVIDER || 'resend') as EmailProvider;
    _emailServiceInstance = new EmailService(provider);
  }
  return _emailServiceInstance;
}

/** Lazy proxy — safe to import at module level, won't touch Firestore until actually used */
export const emailService: EmailService = new Proxy({} as EmailService, {
  get(_target, prop) {
    return (getEmailService() as any)[prop];
  },
});
