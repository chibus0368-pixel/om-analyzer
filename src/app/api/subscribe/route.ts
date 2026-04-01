import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface SubscribePayload {
  email: string;
  frequency?: 'daily' | 'weekly' | 'both';
  topics?: string[];
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  // Bot protection fields
  _hp?: string;        // honeypot - must be empty
  _ts?: number;        // form load timestamp - must be >2s ago
}

// ─── DISPOSABLE EMAIL BLOCKLIST ─────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'mailnesia.com',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain || '');
}

// ─── RATE LIMITER ──────────────────────────────────────────────────

const ipRequestMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const fifteenMinutesAgo = now - 15 * 60 * 1000;

  const requests = ipRequestMap.get(ip) || [];
  const recentRequests = requests.filter(time => time > fifteenMinutesAgo);

  if (recentRequests.length >= 5) {
    return true;
  }

  recentRequests.push(now);
  ipRequestMap.set(ip, recentRequests);
  return false;
}

// ─── EMAIL HELPERS ──────────────────────────────────────────────────

const ADMIN_BCC = process.env.ADMIN_NOTIFY_EMAIL || '';

async function sendConfirmationEmail(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { sendEmail } = await import('@/lib/email');
    const { confirmationTemplate } = await import('@/lib/email-templates');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://nnntriplenet.com';
    const confirmUrl = `${appUrl}/api/subscribe/confirm?token=${token}`;
    const confirmHtml = confirmationTemplate({ email, confirmUrl });

    const result = await sendEmail(
      email,
      'Confirm Your Email - NNNTripleNet',
      confirmHtml,
      undefined,     // text
      undefined,      // from (use default)
      undefined,      // manageToken
      ADMIN_BCC ? { bcc: ADMIN_BCC } : undefined
    );
    return { success: result.success, error: result.error };
  } catch (error) {
    const msg = (error as Error).message;
    console.error('Email send error:', msg);
    return { success: false, error: msg };
  }
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Track what happens at each step for debugging
  const debug: Record<string, unknown> = {};

  try {
    const body: SubscribePayload = await request.json();
    const { email, frequency = 'daily', topics = [], source = 'website', utmSource, utmMedium, utmCampaign, _hp, _ts } = body;

    // ── Bot Protection: Honeypot ──
    // A hidden field that real users never fill in - bots auto-fill everything
    if (_hp) {
      // Silently reject - return success to avoid tipping off the bot
      return NextResponse.json({ success: true, message: 'Check your inbox to confirm your email address.' }, { status: 200 });
    }

    // ── Bot Protection: Timing ──
    // If form was submitted less than 2 seconds after page load, it's likely a bot
    if (_ts && (Date.now() - _ts) < 2000) {
      return NextResponse.json({ success: true, message: 'Check your inbox to confirm your email address.' }, { status: 200 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Block disposable emails
    if (isDisposableEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please use a permanent email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // Rate limiting by IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // ── Step 1: Initialize Firebase Admin SDK ──
    let db;
    try {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      db = getAdminDb();
      debug.step1_admin_init = 'OK';
    } catch (err) {
      const msg = (err as Error).message;
      debug.step1_admin_init = `FAILED: ${msg}`;
      console.error('Firebase Admin init failed:', msg);
      return NextResponse.json(
        {
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    // ── Step 2: Check if subscriber already exists ──
    let existingDoc = null;
    let existingData = null;
    try {
      const snapshot = await db.collection('subscribers').where('email', '==', normalizedEmail).limit(1).get();
      if (!snapshot.empty) {
        existingDoc = snapshot.docs[0];
        existingData = existingDoc.data();
      }
      debug.step2_check_existing = existingDoc ? `found: ${existingDoc.id} (${existingData?.status})` : 'not found';
    } catch (err) {
      const msg = (err as Error).message;
      debug.step2_check_existing = `FAILED: ${msg}`;
      console.error('Firestore query failed:', msg);
      return NextResponse.json(
        {
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    // ── Step 3: Handle existing subscriber ──
    if (existingDoc && existingData) {
      if (existingData.status === 'confirmed') {
        debug.step3_action = 'already_confirmed';
        return NextResponse.json(
          {
            success: true,
            message: 'You are already subscribed to our newsletter!',
            },
          { status: 200 }
        );
      }

      // Pending or unsubscribed - update and resend confirmation
      try {
        const updateData: Record<string, unknown> = {
          status: 'pending',
          updatedAt: new Date().toISOString(),
        };
        if (existingData.status === 'unsubscribed') {
          updateData.resubscribedAt = new Date().toISOString();
          updateData.frequency = frequency;
          updateData.source = source || 'resubscribe';
        }

        await db.collection('subscribers').doc(existingDoc.id).update(updateData);
        debug.step3_action = `updated_existing (was: ${existingData.status})`;
      } catch (err) {
        const msg = (err as Error).message;
        debug.step3_action = `update_failed: ${msg}`;
        console.error('Subscriber update failed:', msg);
      }

      // Generate and store confirmation token
      const { generateToken, hashToken, getConfirmExpiry } = await import('@/lib/tokens');
      const token = generateToken();
      const tokenHash = hashToken(token);

      try {
        await db.collection('subscribers').doc(existingDoc.id).update({
          confirmTokenHash: tokenHash,
          confirmTokenExpiresAt: getConfirmExpiry(),
        });
        debug.step3_token = 'stored';
      } catch (err) {
        debug.step3_token = `store_failed: ${(err as Error).message}`;
        // Token not stored → confirmation link won't work → don't send email
        return NextResponse.json(
          {
            success: false,
            error: 'Service temporarily unavailable. Please try again later.',
            },
          { status: 503 }
        );
      }

      const emailResult = await sendConfirmationEmail(normalizedEmail, token);
      debug.step3_email = emailResult.success ? 'sent' : `failed: ${emailResult.error}`;

      return NextResponse.json(
        {
          success: true,
          message: emailResult.success
            ? 'Confirmation email sent! Please check your inbox.'
            : 'Please check your inbox for a confirmation email.',
        },
        { status: 200 }
      );
    }

    // ── Step 4: Create new subscriber ──
    let docId: string;
    try {
      const docRef = await db.collection('subscribers').add({
        email: normalizedEmail,
        status: 'pending',
        frequency,
        topics: topics.length > 0 ? topics : [],
        paused: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: source || 'website',
        bounceCount: 0,
        ...(utmSource && { utmSource }),
        ...(utmMedium && { utmMedium }),
        ...(utmCampaign && { utmCampaign }),
      });
      docId = docRef.id;
      debug.step4_create = `OK: ${docId}`;
    } catch (err) {
      const msg = (err as Error).message;
      debug.step4_create = `FAILED: ${msg}`;
      console.error('Firestore create failed:', msg);
      return NextResponse.json(
        {
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    // ── Step 5: Generate and store confirmation token ──
    const { generateToken, hashToken, getConfirmExpiry } = await import('@/lib/tokens');
    const token = generateToken();
    const tokenHash = hashToken(token);

    try {
      await db.collection('subscribers').doc(docId).update({
        confirmTokenHash: tokenHash,
        confirmTokenExpiresAt: getConfirmExpiry(),
      });
      debug.step5_token = 'stored';
    } catch (err) {
      const msg = (err as Error).message;
      debug.step5_token = `store_failed: ${msg}`;
      console.error('Token store failed:', msg);
      // Token not stored → confirmation link won't work → don't send email
      return NextResponse.json(
        {
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    // ── Step 6: Send confirmation email ──
    const emailResult = await sendConfirmationEmail(normalizedEmail, token);
    debug.step6_email = emailResult.success ? 'sent' : `failed: ${emailResult.error}`;

    return NextResponse.json(
      {
        success: true,
        message: emailResult.success
          ? 'Check your inbox to confirm your email address.'
          : "You've been subscribed! We'll send you a confirmation email shortly.",
        ...(process.env.NODE_ENV === 'development' ? { _debug: debug } : {}),
      },
      { status: 201 }
    );

  } catch (error) {
    const msg = (error as Error).message;
    console.error('Subscribe error:', msg);
    debug.catch_error = msg;

    return NextResponse.json(
      {
        success: false,
        error: 'Something went wrong. Please try again.',
        ...(process.env.NODE_ENV === 'development' ? { _debug: debug } : {}),
      },
      { status: 500 }
    );
  }
}
