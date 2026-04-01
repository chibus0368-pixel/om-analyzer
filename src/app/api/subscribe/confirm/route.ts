import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/subscribe?error=invalid', request.url));
    }

    const { hashToken, isExpired, generateToken, getManageExpiry } = await import('@/lib/tokens');
    const { decodeConfirmationToken } = await import('@/lib/email');

    // Use Admin SDK (Client SDK has permission issues)
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const subscribersRef = db.collection('subscribers');

    // Try new token format first - look up by hash
    const tokenHash = hashToken(token);
    const snapshot = await subscribersRef.where('confirmTokenHash', '==', tokenHash).limit(1).get();

    let subscriberId: string | null = null;
    let subscriber: FirebaseFirestore.DocumentData | null = null;

    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      subscriberId = docSnap.id;
      subscriber = docSnap.data();

      // Check expiry
      if (subscriber.confirmTokenExpiresAt && isExpired(subscriber.confirmTokenExpiresAt)) {
        return NextResponse.redirect(new URL('/subscribe?error=expired', request.url));
      }
    } else {
      // Backward compatibility: try decoding as Base64(email:timestamp)
      const decoded = decodeConfirmationToken(token);
      if (decoded) {
        const emailSnapshot = await subscribersRef.where('email', '==', decoded.email).limit(1).get();

        if (!emailSnapshot.empty) {
          const docSnap = emailSnapshot.docs[0];
          subscriberId = docSnap.id;
          subscriber = docSnap.data();
        }
      }
    }

    if (!subscriber || !subscriberId) {
      return NextResponse.redirect(new URL('/subscribe?error=invalid', request.url));
    }

    // Already confirmed? Just redirect to success
    if (subscriber.status === 'confirmed') {
      return NextResponse.redirect(new URL('/confirmed?status=success', request.url));
    }

    // Generate manage token for future preference changes
    const manageToken = generateToken();
    const manageTokenHash = hashToken(manageToken);
    const manageTokenExpiry = getManageExpiry();

    // Update subscriber: confirm, clear confirm token, set manage token
    await subscribersRef.doc(subscriberId).update({
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      manageTokenHash: manageTokenHash,
      manageTokenExpiresAt: manageTokenExpiry,
    });

    // Send welcome email with manage token
    try {
      const { sendEmail } = await import('@/lib/email');
      const { welcomeTemplate } = await import('@/lib/email-templates');
      const welcomeHtml = welcomeTemplate({ email: subscriber.email, manageToken });
      await sendEmail(subscriber.email, 'Welcome to NNNTripleNet!', welcomeHtml, undefined, undefined, manageToken);
    } catch (err) {
      console.error('Failed to send welcome email:', err);
    }

    // Log confirmation event
    try {
      const { logSubscriptionEvent } = await import('@/lib/subscription-events');
      await logSubscriptionEvent(subscriberId, subscriber.email, 'confirmed');
    } catch (err) {
      console.error('Failed to log event:', err);
    }

    return NextResponse.redirect(new URL('/confirmed?status=success', request.url));

  } catch (error) {
    console.error('Confirm error:', error);
    return NextResponse.redirect(new URL('/subscribe?error=server', request.url));
  }
}
