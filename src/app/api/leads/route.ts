import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─── RATE LIMITER (simple in-memory) ────────────────────────────────
const ipRequestMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = now - 15 * 60 * 1000;
  const hits = (ipRequestMap.get(ip) || []).filter(t => t > window);
  if (hits.length >= 10) return true;
  hits.push(now);
  ipRequestMap.set(ip, hits);
  return false;
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, email, tag, source, meta } = body as {
      name?: string;
      email?: string;
      tag?: string;
      source?: string;
      meta?: Record<string, unknown>;
    };

    // Basic validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required.' },
        { status: 400 }
      );
    }

    // Rate limit
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    // Firebase write
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    await db.collection('leads').add({
      name: name?.trim() || '',
      email: email.toLowerCase().trim(),
      tag: tag || 'general',
      source: source || 'website',
      meta: meta || {},
      createdAt: new Date().toISOString(),
      status: 'new',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('[/api/leads] Error:', (err as Error).message);
    return NextResponse.json(
      { success: false, error: 'Something went wrong.' },
      { status: 500 }
    );
  }
}
