import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface LeadPayload {
  email: string;
  source?: string;         // e.g. "lite_report", "pricing_page", "footer"
  propertyName?: string;   // which deal they were analyzing
  dealScore?: number;      // the score they saw
  _hp?: string;            // honeypot
  _ts?: number;            // timing check
}

// ─── DISPOSABLE EMAIL BLOCKLIST ─────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'mailnesia.com',
  '10minutemail.com', 'temp-mail.org', 'guerrillamail.info',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain || '');
}

// ─── RATE LIMITER (in-memory, per-instance) ─────────────────────────
const ipRequestMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = now - 15 * 60 * 1000; // 15 min window
  const requests = (ipRequestMap.get(ip) || []).filter(t => t > window);
  if (requests.length >= 10) return true;
  requests.push(now);
  ipRequestMap.set(ip, requests);
  return false;
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: LeadPayload = await request.json();
    const { email, source = 'lite_report', propertyName, dealScore, _hp, _ts } = body;

    // Bot protection: honeypot
    if (_hp) {
      return NextResponse.json({ success: true, message: 'Thanks! Check your inbox.' }, { status: 200 });
    }

    // Bot protection: timing (submitted < 2s after load)
    if (_ts && (Date.now() - _ts) < 2000) {
      return NextResponse.json({ success: true, message: 'Thanks! Check your inbox.' }, { status: 200 });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json({ success: false, error: 'Please use a work or personal email address.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // Initialize Firebase Admin
    let db;
    try {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      db = getAdminDb();
    } catch (err) {
      console.error('Firebase Admin init failed:', (err as Error).message);
      return NextResponse.json({ success: false, error: 'Service temporarily unavailable.' }, { status: 503 });
    }

    // Check if lead already exists — simple equality query (no composite index needed)
    let existing;
    try {
      existing = await db.collection('leads').where('email', '==', normalizedEmail).limit(1).get();
    } catch (queryErr) {
      console.error('Leads query failed, creating new:', (queryErr as Error).message);
      existing = { empty: true } as any;
    }

    if (existing && !existing.empty) {
      // Update existing lead with new activity
      try {
        const doc = existing.docs[0];
        const prevData = doc.data();
        const touches = (prevData.touches || 0) + 1;
        const properties = prevData.propertiesAnalyzed || [];
        if (propertyName && !properties.includes(propertyName)) {
          properties.push(propertyName);
        }

        await db.collection('leads').doc(doc.id).update({
          touches,
          propertiesAnalyzed: properties,
          lastActiveAt: new Date().toISOString(),
          lastSource: source,
          ...(dealScore !== undefined ? { lastDealScore: dealScore } : {}),
        });
      } catch (updateErr) {
        console.error('Lead update failed:', (updateErr as Error).message);
      }

      return NextResponse.json({
        success: true,
        message: "Saved! We'll follow up with your analysis.",
        returning: true,
      });
    }

    // Create new lead
    await db.collection('leads').add({
      email: normalizedEmail,
      source,
      status: 'new',
      touches: 1,
      propertiesAnalyzed: propertyName ? [propertyName] : [],
      lastDealScore: dealScore ?? null,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      convertedToUser: false,
      ip: ip !== 'unknown' ? ip : null,
    });

    return NextResponse.json({
      success: true,
      message: "Saved! We'll follow up with your analysis.",
    }, { status: 201 });

  } catch (error) {
    console.error('Lead capture error:', (error as Error).message);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
