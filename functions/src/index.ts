import admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { ingestMarketData as ingestMarketDataFn } from './ingest-rates.js';
import { ingestContent } from './content-ingestion.js';
import { ingestDeals } from './deal-ingestion.js';
import { processDripSequences } from './drip-sequences.js';
import { emailService } from './email-service.js';

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════
// SCHEDULED FUNCTIONS — The Automation Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * 5:00 AM ET — Content ingestion from RSS feeds + AI summarization
 */
export const ingestContentScheduled = onSchedule(
  {
    schedule: '0 10 * * *',  // 10:00 UTC = 5:00 AM ET
    timeZone: 'America/New_York',

    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('Scheduled: Content ingestion starting');
    const result = await ingestContent();
    logger.info('Scheduled: Content ingestion complete', result);
  }
);

/**
 * 5:30 AM ET — Deal data aggregation
 */
export const ingestDealsScheduled = onSchedule(
  {
    schedule: '30 10 * * *',  // 10:30 UTC = 5:30 AM ET
    timeZone: 'America/New_York',

    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    logger.info('Scheduled: Deal ingestion starting');
    const result = await ingestDeals();
    logger.info('Scheduled: Deal ingestion complete', result);
  }
);

/**
 * 6:00 AM ET — Market data ingestion (FRED API + derived metrics)
 */
export const ingestMarketData = onSchedule(
  {
    schedule: '0 11 * * *',  // 11:00 UTC = 6:00 AM ET
    timeZone: 'America/New_York',

    memory: '512MiB',
  },
  async () => {
    logger.info('Scheduled: Market data ingestion starting');
    const result = await ingestMarketDataFn();

    // Update market_snapshot collection
    await db.collection('market_snapshot').doc('current').set(
      { updatedAt: admin.firestore.FieldValue.serverTimestamp(), lastIngestionTime: new Date().toISOString(), ...result },
      { merge: true }
    );

    logger.info('Scheduled: Market data ingestion complete', result);
  }
);

/**
 * 7:00 AM ET Mon-Fri — Daily brief email campaign
 * ⏸️ PAUSED — re-enable when email templates are finalized
 */
export const sendDailyBrief = onSchedule(
  {
    schedule: '0 12 * * 1-5',  // 12:00 UTC Mon-Fri = 7:00 AM ET
    timeZone: 'America/New_York',

    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('Scheduled: Daily brief PAUSED — skipping send');
    return;

    const subscribersSnap = await db.collection('subscribers')
      .where('status', '==', 'confirmed')
      .where('frequency', 'in', ['daily', 'both'])
      .get();

    if (subscribersSnap.empty) {
      logger.info('No daily subscribers');
      return;
    }

    // Fetch today's published articles
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const articlesSnap = await db.collection('articles')
      .where('status', '==', 'published')
      .where('publishedAt', '>=', yesterday)
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const articles = articlesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Fetch market data
    const marketDoc = await db.collection('market_snapshot').doc('current').get();
    const marketData = marketDoc.exists ? marketDoc.data() : {};

    // Fetch latest deals
    const dealsSnap = await db.collection('deals')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    const deals = dealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const baseUrl = process.env.APP_BASE_URL || 'https://nnntriplenet.com';
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Send to each subscriber
    let sent = 0, failed = 0;
    const subscriberIds = subscribersSnap.docs.map((d) => d.id);

    // Build email HTML
    const featured = articles[0] || null;
    const stream = articles.slice(1, 5);
    const tickers = marketData?.tickers || marketData?.items || [];

    const emailHtml = buildDailyBriefHtml({
      date: dateStr,
      featured,
      stream,
      deals,
      tickers,
      baseUrl,
    });

    const result = await emailService.sendCampaign(subscriberIds, {
      campaignId: `daily-brief-${today.toISOString().split('T')[0]}`,
      subject: `NNNTripleNet Daily Brief — ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      htmlContent: emailHtml,
      unsubscribeUrl: `${baseUrl}/api/unsubscribe`,
    });

    sent = result.queued;
    failed = result.failed;

    // Log campaign
    await db.collection('email_campaigns').add({
      type: 'daily_brief',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      totalRecipients: subscribersSnap.size,
      sentCount: sent,
      failedCount: failed,
      articleCount: articles.length,
      date: today.toISOString().split('T')[0],
    });

    logger.info('Daily brief complete', { sent, failed, articles: articles.length });
  }
);

/**
 * 8:00 AM ET Sunday — Weekly digest
 * ⏸️ PAUSED — re-enable when email templates are finalized
 */
export const sendWeeklyDigest = onSchedule(
  {
    schedule: '0 13 * * 0',  // 13:00 UTC Sunday = 8:00 AM ET
    timeZone: 'America/New_York',

    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.info('Scheduled: Weekly digest PAUSED — skipping send');
    return;

    const subscribersSnap = await db.collection('subscribers')
      .where('status', '==', 'confirmed')
      .where('frequency', 'in', ['weekly', 'both'])
      .get();

    if (subscribersSnap.empty) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const articlesSnap = await db.collection('articles')
      .where('status', '==', 'published')
      .where('publishedAt', '>=', sevenDaysAgo)
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const topArticles = articlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const baseUrl = process.env.APP_BASE_URL || 'https://nnntriplenet.com';

    const emailHtml = buildWeeklyDigestHtml({ topArticles, baseUrl });
    const subscriberIds = subscribersSnap.docs.map((d) => d.id);

    const result = await emailService.sendCampaign(subscriberIds, {
      campaignId: `weekly-digest-${new Date().toISOString().split('T')[0]}`,
      subject: 'NNNTripleNet Weekly Digest — Your Top Market Insights',
      htmlContent: emailHtml,
      unsubscribeUrl: `${baseUrl}/api/unsubscribe`,
    });

    await db.collection('email_campaigns').add({
      type: 'weekly_digest',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      totalRecipients: subscribersSnap.size,
      sentCount: result.queued,
      failedCount: result.failed,
      week: new Date().toISOString().split('T')[0],
    });

    logger.info('Weekly digest complete', { sent: result.queued, failed: result.failed });
  }
);

/**
 * Every hour — Process drip sequences for new subscribers
 * ⏸️ PAUSED — re-enable when email templates are finalized
 */
export const processDrips = onSchedule(
  {
    schedule: '0 * * * *',  // Top of every hour
    timeZone: 'America/New_York',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    logger.info('Scheduled: Drip sequences PAUSED — skipping');
    return;
    const result = await processDripSequences();
    logger.info('Scheduled: Drip sequences complete', result);
  }
);

/**
 * Monday 2:00 AM ET — Cleanup bounced subscribers
 */
export const cleanupBounced = onSchedule(
  {
    schedule: '0 7 * * 1',  // 07:00 UTC Mon = 2:00 AM ET
    timeZone: 'America/New_York',
    memory: '256MiB',
  },
  async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bouncedSnap = await db.collection('subscribers')
      .where('status', '==', 'bounced')
      .where('bouncedAt', '<', thirtyDaysAgo.toISOString())
      .limit(500)
      .get();

    if (bouncedSnap.empty) { logger.info('No bounced subscribers to clean'); return; }

    const batch = db.batch();
    bouncedSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'archived',
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedReason: 'bounced_30_days',
      });
    });
    await batch.commit();

    logger.info('Cleaned bounced subscribers', { archived: bouncedSnap.size });
  }
);

// ═══════════════════════════════════════════════════════════════════════
// FIRESTORE TRIGGERS — Subscriber Lifecycle
// ═══════════════════════════════════════════════════════════════════════

/**
 * New subscriber created → send confirmation email
 */
export const onSubscriberCreate = onDocumentCreated(
  'subscribers/{subscriberId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const subscriberId = event.params.subscriberId;
    const subscriber = snapshot.data() as any;

    logger.info('New subscriber', { subscriberId, email: subscriber.email });

    const confirmationToken = Buffer.from(
      `${subscriberId}:${Date.now()}:${Math.random().toString(36)}`
    ).toString('base64');

    await snapshot.ref.update({
      confirmationToken,
      confirmationTokenCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      dripCompleted: false,
      completedDrips: [],
    });

    const result = await emailService.sendConfirmationEmail(
      subscriberId, subscriber.email, confirmationToken
    );

    logger.info('Confirmation email result', { subscriberId, success: result.success });
  }
);

/**
 * Subscriber status → confirmed → send welcome email + start drip
 */
export const onSubscriberConfirm = onDocumentUpdated(
  'subscribers/{subscriberId}',
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;

    if (before.status !== 'confirmed' && after.status === 'confirmed') {
      const subscriberId = event.params.subscriberId;
      logger.info('Subscriber confirmed', { subscriberId });

      const result = await emailService.sendWelcomeEmail(subscriberId, after.email);

      await event.data!.after.ref.update({
        welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('Welcome email result', { subscriberId, success: result.success });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
// HTTP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Subscriber confirmation endpoint
 */
export const confirmSubscriber = onRequest({ cors: true, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const params = req.method === 'GET' ? req.query : req.body;
  const { subscriberId, token } = params;

  if (!subscriberId || !token) {
    res.status(400).json({ confirmed: false, message: 'Missing subscriberId or token' });
    return;
  }

  const subscriberRef = db.collection('subscribers').doc(subscriberId as string);
  const subscriber = await subscriberRef.get();

  if (!subscriber.exists) {
    res.status(404).json({ confirmed: false, message: 'Subscriber not found' });
    return;
  }

  if (subscriber.get('confirmationToken') !== token) {
    res.status(401).json({ confirmed: false, message: 'Invalid token' });
    return;
  }

  await subscriberRef.update({
    status: 'confirmed',
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmationToken: admin.firestore.FieldValue.delete(),
  });

  const baseUrl = process.env.APP_BASE_URL || 'https://nnntriplenet.com';
  res.redirect(302, `${baseUrl}/subscribe?confirmed=true`);
});

/**
 * Email webhook handler (Resend)
 */
export const emailWebhookHandler = onRequest({ cors: true, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify webhook signature
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(req.body);

    const isValid = emailService.verifyResendWebhook(rawBody, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    }, webhookSecret);

    if (!isValid) {
      logger.warn('Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Parse and process webhook event
    const event = emailService.parseResendWebhook(req.body);
    if (!event) {
      res.status(200).json({ processed: false, reason: 'unhandled event type' });
      return;
    }

    const result = await emailService.handleWebhook(event);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Webhook error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ processed: false, error: 'Internal error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CALLABLE FUNCTIONS (Admin)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Trigger email campaign manually (admin only)
 */
export const triggerEmailCampaign = onCall({ memory: '512MiB', maxInstances: 1 }, async (request) => {
  if (!request.auth?.uid) throw new Error('Authentication required');

  // Verify admin
  const adminDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new Error('Admin access required');
  }

  const { campaignId } = request.data;
  if (!campaignId) throw new Error('campaignId required');

  // Fetch campaign
  const campaignDoc = await db.collection('email_campaigns').doc(campaignId).get();
  if (!campaignDoc.exists) throw new Error('Campaign not found');

  const campaign = campaignDoc.data()!;

  // Update status to sending
  await campaignDoc.ref.update({ status: 'sending', startedAt: admin.firestore.FieldValue.serverTimestamp() });

  // Get subscribers
  const subscribersSnap = await db.collection('subscribers')
    .where('status', '==', 'confirmed')
    .get();

  const subscriberIds = subscribersSnap.docs.map((d) => d.id);

  const result = await emailService.sendCampaign(subscriberIds, {
    campaignId,
    subject: campaign.subject,
    htmlContent: campaign.htmlContent,
    unsubscribeUrl: `${process.env.APP_BASE_URL || 'https://nnntriplenet.com'}/api/unsubscribe`,
  });

  await campaignDoc.ref.update({
    status: 'sent',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    sentCount: result.queued,
    failedCount: result.failed,
  });

  return { campaignId, queued: result.queued, failed: result.failed };
});

/**
 * Manual rate/content/deal ingestion (admin only)
 */
export const manualIngestion = onCall({ memory: '1GiB', timeoutSeconds: 540 }, async (request) => {
  if (!request.auth?.uid) throw new Error('Authentication required');

  const { type } = request.data;

  switch (type) {
    case 'market':
      return await ingestMarketDataFn();
    case 'content':
      return await ingestContent();
    case 'deals':
      return await ingestDeals();
    case 'drips':
      return await processDripSequences();
    case 'all':
      const market = await ingestMarketDataFn();
      const content = await ingestContent();
      const deals = await ingestDeals();
      const drips = await processDripSequences();
      return { market, content, deals, drips };
    default:
      throw new Error(`Unknown ingestion type: ${type}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE BUILDERS
// ═══════════════════════════════════════════════════════════════════════

function buildDailyBriefHtml(data: {
  date: string;
  featured: any;
  stream: any[];
  deals: any[];
  tickers: any[];
  baseUrl: string;
}): string {
  const { date, featured, stream, deals, tickers, baseUrl } = data;

  const tickerHtml = tickers.slice(0, 4).map((t: any) => `
    <td style="padding:8px 12px;text-align:center;">
      <span style="font-size:10px;color:rgba(255,255,255,0.4);display:block;">${t.name || t.label || ''}</span>
      <span style="font-size:14px;font-weight:700;color:#fff;">${t.value || ''}</span>
      <span style="font-size:10px;color:${t.direction === 'up' ? '#34D399' : t.direction === 'down' ? '#F87171' : 'rgba(255,255,255,0.4)'};">${t.change || ''}</span>
    </td>
  `).join('');

  const featuredHtml = featured ? `
    <div style="padding:20px;border-left:4px solid #DC3545;background:#F6F8FB;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#DC3545;">Featured Analysis</span>
      <h2 style="font-size:20px;font-weight:700;color:#06080F;margin:8px 0;line-height:1.3;">
        <a href="${baseUrl}/articles/${featured.slug || ''}" style="color:#06080F;text-decoration:none;">${featured.title || ''}</a>
      </h2>
      <p style="font-size:14px;color:#5A7091;line-height:1.6;margin:0;">${featured.dek || featured.summary || ''}</p>
    </div>
  ` : '';

  const streamHtml = stream.map((a: any) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #EDF0F5;">
        <a href="${baseUrl}/articles/${a.slug || ''}" style="font-size:15px;font-weight:600;color:#06080F;text-decoration:none;line-height:1.4;">${a.title || ''}</a>
        <span style="display:block;font-size:12px;color:#8899B0;margin-top:4px;">${a.type?.replace(/_/g, ' ') || ''} • ${a.readingTime || 2} min read</span>
      </td>
    </tr>
  `).join('');

  const dealsHtml = deals.length > 0 ? `
    <h3 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8899B0;margin:24px 0 12px;">Quick Deals</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr style="background:#F6F8FB;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#8899B0;text-transform:uppercase;">Tenant</th>
        <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#8899B0;text-transform:uppercase;">Cap Rate</th>
        <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#8899B0;text-transform:uppercase;">Price</th>
      </tr>
      ${deals.map((d: any) => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#06080F;">${d.tenant || ''}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:#06080F;">${d.capRate || ''}</td>
          <td style="padding:8px 12px;text-align:right;color:#5A7091;">${d.price || ''}</td>
        </tr>
      `).join('')}
    </table>
  ` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <tr><td style="background:#06080F;padding:24px 32px;border-radius:12px 12px 0 0;">
    <span style="color:#C49A3C;font-size:18px;font-weight:800;letter-spacing:1px;">NNNTRIPLENET</span>
    <span style="color:rgba(255,255,255,0.3);font-size:10px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">DAILY BRIEF</span>
  </td></tr>
  <tr><td style="background:#06080F;padding:0 16px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${tickerHtml}</tr></table>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border:1px solid #D8DFE9;border-top:none;">
    <p style="font-size:12px;color:#8899B0;margin:0 0 20px;">${date}</p>
    ${featuredHtml}
    ${streamHtml ? `<h3 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8899B0;margin:24px 0 12px;">In The Stream</h3><table width="100%" cellpadding="0" cellspacing="0">${streamHtml}</table>` : ''}
    ${dealsHtml}
    <div style="margin-top:24px;text-align:center;">
      <a href="${baseUrl}" style="display:inline-block;background:#DC3545;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Read More on NNNTripleNet</a>
    </div>
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="font-size:11px;color:#8899B0;margin:0;">
      NNNTripleNet, Inc. • CRE Market Intelligence<br>
      <a href="{{preferences_url}}" style="color:#8899B0;">Preferences</a> • <a href="{{unsubscribe_url}}" style="color:#8899B0;">Unsubscribe</a>
    </p>
  </td></tr>
</table></body></html>`;
}

function buildWeeklyDigestHtml(data: { topArticles: any[]; baseUrl: string }): string {
  const { topArticles, baseUrl } = data;

  const articlesHtml = topArticles.slice(0, 5).map((a: any, i: number) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #EDF0F5;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="32" style="vertical-align:top;">
            <span style="display:inline-block;width:28px;height:28px;background:#DC3545;color:#fff;border-radius:50%;text-align:center;line-height:28px;font-weight:700;font-size:13px;">${i + 1}</span>
          </td>
          <td style="padding-left:12px;">
            <a href="${baseUrl}/articles/${a.slug || ''}" style="font-size:15px;font-weight:600;color:#06080F;text-decoration:none;line-height:1.4;">${a.title || ''}</a>
            <span style="display:block;font-size:13px;color:#5A7091;margin-top:4px;line-height:1.5;">${a.dek || a.summary || ''}</span>
          </td>
        </tr></table>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <tr><td style="background:#06080F;padding:24px 32px;border-radius:12px 12px 0 0;">
    <span style="color:#C49A3C;font-size:18px;font-weight:800;letter-spacing:1px;">NNNTRIPLENET</span>
    <span style="color:rgba(255,255,255,0.3);font-size:10px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">WEEKLY DIGEST</span>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border:1px solid #D8DFE9;border-top:none;">
    <h1 style="font-size:22px;color:#06080F;margin:0 0 8px;">This Week's Top Stories</h1>
    <p style="font-size:14px;color:#5A7091;margin:0 0 24px;">The most important CRE and NNN news from the past 7 days.</p>
    <table width="100%" cellpadding="0" cellspacing="0">${articlesHtml}</table>
    <div style="margin-top:28px;text-align:center;">
      <a href="${baseUrl}/learn" style="display:inline-block;background:#DC3545;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Browse All Articles</a>
    </div>
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="font-size:11px;color:#8899B0;margin:0;">
      NNNTripleNet, Inc. • CRE Market Intelligence<br>
      <a href="{{preferences_url}}" style="color:#8899B0;">Preferences</a> • <a href="{{unsubscribe_url}}" style="color:#8899B0;">Unsubscribe</a>
    </p>
  </td></tr>
</table></body></html>`;
}
