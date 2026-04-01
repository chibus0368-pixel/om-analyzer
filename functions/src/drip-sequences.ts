import admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { emailService } from './email-service.js';

/**
 * Drip Sequence Engine
 * Automated onboarding emails for new subscribers
 * Runs hourly to check for subscribers due for their next drip email
 *
 * Sequence:
 *   Day 0 (immediate): Welcome email — handled by onSubscriberConfirm trigger
 *   Day 1: Value email — top market insights + calculator intro
 *   Day 3: Engagement email — tools, resources, community
 *   Day 7: Deep dive — featured article + premium teaser
 *   Day 14: Retention — survey + referral ask
 */

interface DripStep {
  id: string;
  dayOffset: number;
  subject: string;
  buildHtml: (email: string, baseUrl: string) => string;
}

const DRIP_SEQUENCE: DripStep[] = [
  {
    id: 'drip-day-1',
    dayOffset: 1,
    subject: 'Your First Market Briefing — Key Numbers Every NNN Investor Tracks',
    buildHtml: (email, baseUrl) => wrapEmail(`
      <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">The Numbers That Matter</h1>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
        Welcome to Day 1. Here are the key metrics every NNN investor should track daily:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding:12px 16px;background:#F6F8FB;border-radius:8px;">
          <strong style="color:#06080F;">10-Year Treasury Yield</strong> — The benchmark for NNN cap rates. When it moves, deal pricing follows.<br>
          <strong style="color:#06080F;">NNN Cap Rate Spread</strong> — The premium over treasuries. Tracks investor risk appetite.<br>
          <strong style="color:#06080F;">DSCR (Debt Service Coverage)</strong> — Determines your loan qualification. Most lenders want 1.25x+.<br>
          <strong style="color:#06080F;">Tenant Credit Rating</strong> — Investment grade (BBB- or better) = lower risk, lower cap rate.
        </td></tr>
      </table>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
        Use our <a href="${baseUrl}/calculators" style="color:#2563EB;font-weight:600;">free CRE calculators</a> to analyze any deal in under 60 seconds.
      </p>
      <a href="${baseUrl}/calculators/cap-rate" style="display:inline-block;background:#DC3545;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
        Try the Cap Rate Calculator
      </a>
    `, email, baseUrl),
  },
  {
    id: 'drip-day-3',
    dayOffset: 3,
    subject: '18 Free Calculators Built for NNN Investors',
    buildHtml: (email, baseUrl) => wrapEmail(`
      <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">Tools of the Trade</h1>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
        We've built 18 professional calculators specifically for CRE investors. Each has a simple mode for quick estimates and an advanced mode for deep analysis.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        ${['Cap Rate', 'Cash-on-Cash Return', 'DSCR', 'IRR', 'Loan Payment', 'Amortization'].map((name) => `
          <tr><td style="padding:10px 16px;border-bottom:1px solid #EDF0F5;">
            <span style="color:#06080F;font-weight:600;font-size:14px;">${name} Calculator</span>
          </td></tr>`).join('')}
      </table>
      <a href="${baseUrl}/calculators" style="display:inline-block;background:#DC3545;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
        Explore All 18 Calculators
      </a>
      <p style="font-size:14px;color:#5A7091;margin-top:24px;line-height:1.6;">
        Plus, check out our <a href="${baseUrl}/ai/tools" style="color:#2563EB;">AI Tools Directory</a> — curated AI tools for CRE professionals.
      </p>
    `, email, baseUrl),
  },
  {
    id: 'drip-day-7',
    dayOffset: 7,
    subject: 'How Smart NNN Investors Analyze Deals (A Framework)',
    buildHtml: (email, baseUrl) => wrapEmail(`
      <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">The NNN Deal Analysis Framework</h1>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
        After a week with NNNTripleNet, here's the framework our best readers use to evaluate deals:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding:14px 16px;background:#F6F8FB;border-radius:8px;margin-bottom:8px;">
          <strong style="color:#DC3545;">Step 1:</strong> <strong style="color:#06080F;">Check the Cap Rate Spread</strong><br>
          <span style="color:#5A7091;font-size:13px;">Is the spread over the 10Y Treasury at least 150-200 bps?</span>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
        <tr><td style="padding:14px 16px;background:#F6F8FB;border-radius:8px;margin-bottom:8px;">
          <strong style="color:#DC3545;">Step 2:</strong> <strong style="color:#06080F;">Evaluate Tenant Credit</strong><br>
          <span style="color:#5A7091;font-size:13px;">Investment grade tenants (Walgreens, Dollar General, FedEx) = lowest risk.</span>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
        <tr><td style="padding:14px 16px;background:#F6F8FB;border-radius:8px;margin-bottom:8px;">
          <strong style="color:#DC3545;">Step 3:</strong> <strong style="color:#06080F;">Run the Numbers</strong><br>
          <span style="color:#5A7091;font-size:13px;">DSCR > 1.25x, Cash-on-Cash > 7%, IRR > 12% over hold period.</span>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
        <tr><td style="padding:14px 16px;background:#F6F8FB;border-radius:8px;">
          <strong style="color:#DC3545;">Step 4:</strong> <strong style="color:#06080F;">Check Lease Structure</strong><br>
          <span style="color:#5A7091;font-size:13px;">Rent escalations, renewal options, remaining lease term vs. loan term.</span>
        </td></tr>
      </table>
      <a href="${baseUrl}/learn" style="display:inline-block;background:#DC3545;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
        Read More in Our Learning Center
      </a>
    `, email, baseUrl),
  },
  {
    id: 'drip-day-14',
    dayOffset: 14,
    subject: "You've been with us 2 weeks — here's what's next",
    buildHtml: (email, baseUrl) => wrapEmail(`
      <h1 style="font-size:24px;color:#06080F;margin:0 0 16px;">Two Weeks In — What's Next?</h1>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 20px;">
        You've been reading NNNTripleNet for 2 weeks now. Here's how to get even more value:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding:14px 16px;background:#FEF3C7;border-radius:8px;border-left:4px solid #C49A3C;">
          <strong style="color:#06080F;font-size:15px;">Customize Your Brief</strong><br>
          <span style="color:#5A7091;font-size:13px;">
            <a href="${baseUrl}/preferences?email=${encodeURIComponent(email)}" style="color:#2563EB;">Update your preferences</a> to focus on the topics you care about most.
          </span>
        </td></tr>
      </table>
      <p style="font-size:15px;color:#5A7091;line-height:1.6;margin:0 0 16px;">
        <strong style="color:#06080F;">Know someone who'd benefit?</strong> Forward this email to a fellow investor — growing our community helps us deliver better data and analysis for everyone.
      </p>
      <a href="${baseUrl}/subscribe" style="display:inline-block;background:#DC3545;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
        Share NNNTripleNet
      </a>
    `, email, baseUrl),
  },
];

// ─── EMAIL WRAPPER ──────────────────────────────────────────────────

function wrapEmail(bodyContent: string, email: string, baseUrl: string): string {
  const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`;
  const prefsUrl = `${baseUrl}/preferences?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <tr><td style="background:#06080F;padding:24px 32px;border-radius:12px 12px 0 0;">
    <span style="color:#C49A3C;font-size:18px;font-weight:800;letter-spacing:1px;">NNNTRIPLENET</span>
    <span style="color:rgba(255,255,255,0.3);font-size:10px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">MARKET INTELLIGENCE</span>
  </td></tr>
  <tr><td style="background:#fff;padding:40px 32px;border:1px solid #D8DFE9;border-top:none;">
    ${bodyContent}
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="font-size:11px;color:#8899B0;margin:0;">
      NNNTripleNet, Inc. • CRE Market Intelligence<br>
      <a href="${prefsUrl}" style="color:#8899B0;">Preferences</a> • <a href="${unsubUrl}" style="color:#8899B0;">Unsubscribe</a>
    </p>
  </td></tr>
</table></body></html>`;
}

// ─── MAIN DRIP PROCESSOR ────────────────────────────────────────────

/**
 * Process drip sequences for all confirmed subscribers
 * Runs hourly — checks who is due for their next drip email
 */
export async function processDripSequences(): Promise<{
  processed: number;
  sent: number;
  errors: string[];
}> {
  logger.info('Processing drip sequences');
  const db = admin.firestore();
  const baseUrl = process.env.APP_BASE_URL || 'https://nnntriplenet.com';
  let processed = 0, sent = 0;
  const errors: string[] = [];

  // Get confirmed subscribers who haven't completed all drips
  const subscribersSnap = await db.collection('subscribers')
    .where('status', '==', 'confirmed')
    .where('dripCompleted', '==', false)
    .limit(200)
    .get();

  if (subscribersSnap.empty) {
    logger.info('No subscribers due for drip emails');
    return { processed: 0, sent: 0, errors: [] };
  }

  const now = Date.now();

  for (const doc of subscribersSnap.docs) {
    const subscriber = doc.data();
    const confirmedAt = subscriber.confirmedAt?.toDate?.()?.getTime?.() || subscriber.confirmedAt;
    if (!confirmedAt) continue;

    processed++;

    const daysSinceConfirm = (now - confirmedAt) / (1000 * 60 * 60 * 24);
    const completedDrips: string[] = subscriber.completedDrips || [];

    for (const step of DRIP_SEQUENCE) {
      if (daysSinceConfirm >= step.dayOffset && !completedDrips.includes(step.id)) {
        try {
          const html = step.buildHtml(subscriber.email, baseUrl);
          const result = await emailService.sendEmail(subscriber.email, step.subject, html, {
            tags: [{ name: 'type', value: 'drip' }, { name: 'drip_id', value: step.id }],
          });

          if (result.success) {
            completedDrips.push(step.id);
            sent++;
            logger.info('Drip sent', { email: subscriber.email, step: step.id });
          } else {
            errors.push(`${subscriber.email}/${step.id}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${subscriber.email}/${step.id}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 500));
        break; // Only send one drip per subscriber per run
      }
    }

    // Update subscriber drip state
    const allComplete = DRIP_SEQUENCE.every((s) => completedDrips.includes(s.id));
    await doc.ref.update({
      completedDrips,
      dripCompleted: allComplete,
      lastDripAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await db.collection('ingestion_logs').add({
    type: 'drip', runAt: admin.firestore.FieldValue.serverTimestamp(),
    processed, sent, errors,
  });

  logger.info('Drip processing complete', { processed, sent });
  return { processed, sent, errors };
}
