import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      );
    }

    const { hashToken, isExpired } = await import('@/lib/tokens');
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const tokenHash = hashToken(token);
    const snapshot = await db.collection('subscribers')
      .where('manageTokenHash', '==', tokenHash).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const subscriberDoc = snapshot.docs[0];
    const subscriber = subscriberDoc.data();

    // Check expiry
    if (subscriber.manageTokenExpiresAt && isExpired(subscriber.manageTokenExpiresAt)) {
      return NextResponse.json(
        { success: false, error: 'Token expired' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        email: subscriber.email,
        frequency: subscriber.frequency || 'daily',
        topics: subscriber.topics || [],
        paused: subscriber.paused || false,
        status: subscriber.status,
      },
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { token, frequency, topics, paused } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      );
    }

    const { hashToken, isExpired } = await import('@/lib/tokens');
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const tokenHash = hashToken(token);
    const snapshot = await db.collection('subscribers')
      .where('manageTokenHash', '==', tokenHash).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const subscriberDoc = snapshot.docs[0];
    const subscriber = subscriberDoc.data();

    // Check expiry
    if (subscriber.manageTokenExpiresAt && isExpired(subscriber.manageTokenExpiresAt)) {
      return NextResponse.json(
        { success: false, error: 'Token expired' },
        { status: 401 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (frequency !== undefined) {
      updateData.frequency = frequency;
    }
    if (topics !== undefined) {
      updateData.topics = Array.isArray(topics) ? topics : [];
    }
    if (paused !== undefined) {
      updateData.paused = Boolean(paused);
    }

    // Update subscriber
    await db.collection('subscribers').doc(subscriberDoc.id).update(updateData);

    // Log event
    try {
      const { logSubscriptionEvent } = await import('@/lib/subscription-events');
      await logSubscriptionEvent(subscriberDoc.id, subscriber.email, 'preferences_updated', {
        changes: updateData,
      });
    } catch (err) {
      console.error('Failed to log event:', err);
    }

    return NextResponse.json({
      success: true,
      message: 'Preferences updated successfully',
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
