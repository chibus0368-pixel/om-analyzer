import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/subscribe?error=invalid', request.url));
    }

    const { hashToken, isExpired } = await import('@/lib/tokens');
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const tokenHash = hashToken(token);
    const snapshot = await db.collection('subscribers')
      .where('manageTokenHash', '==', tokenHash).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.redirect(new URL('/subscribe?error=invalid', request.url));
    }

    const subscriberDoc = snapshot.docs[0];
    const subscriber = subscriberDoc.data();

    // Check expiry
    if (subscriber.manageTokenExpiresAt && isExpired(subscriber.manageTokenExpiresAt)) {
      return NextResponse.redirect(new URL('/subscribe?error=expired', request.url));
    }

    // Unsubscribe
    await db.collection('subscribers').doc(subscriberDoc.id).update({
      status: 'unsubscribed',
      unsubscribedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Log event
    try {
      const { logSubscriptionEvent } = await import('@/lib/subscription-events');
      await logSubscriptionEvent(subscriberDoc.id, subscriber.email, 'unsubscribed');
    } catch (err) {
      console.error('Failed to log event:', err);
    }

    return NextResponse.redirect(new URL('/unsubscribe?status=success', request.url));

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.redirect(new URL('/subscribe?error=server', request.url));
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { token, reason, comment } = body;

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
      status: 'unsubscribed',
      unsubscribedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (reason) {
      updateData.feedbackReason = reason;
    }
    if (comment) {
      updateData.feedbackComment = comment;
    }

    // Update subscriber
    await db.collection('subscribers').doc(subscriberDoc.id).update(updateData);

    // Log event
    try {
      const { logSubscriptionEvent } = await import('@/lib/subscription-events');
      await logSubscriptionEvent(subscriberDoc.id, subscriber.email, 'unsubscribed', {
        reason,
        comment,
      });
    } catch (err) {
      console.error('Failed to log event:', err);
    }

    return NextResponse.json({
      success: true,
      message: 'You have been unsubscribed successfully',
    });

  } catch (error) {
    console.error('Unsubscribe error:', error);
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
