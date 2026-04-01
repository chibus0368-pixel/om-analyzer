import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/confirm?token=xyz
 * Confirm email subscription with token (legacy endpoint)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(
        new URL('/subscribe?error=missing_token', request.nextUrl.origin)
      );
    }

    // Decode and validate token
    const { decodeConfirmationToken, sendEmail } = await import('@/lib/email');
    const { welcomeTemplate } = await import('@/lib/email-templates');

    const decoded = decodeConfirmationToken(token);
    if (!decoded) {
      return NextResponse.redirect(
        new URL('/subscribe?error=invalid_token', request.nextUrl.origin)
      );
    }

    const { email } = decoded;

    // Use Admin SDK (Client SDK has permission issues)
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const subscribersRef = db.collection('subscribers');

    // Find subscriber in database
    const snapshot = await subscribersRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      // Subscriber not found - auto-create and confirm
      try {
        await subscribersRef.add({
          email,
          status: 'confirmed',
          frequency: 'daily',
          interests: [],
          createdAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          source: 'confirmation-recovery',
          dripCompleted: false,
          completedDrips: [],
        });

        // Send welcome email
        try {
          const welcomeHtml = welcomeTemplate({ email });
          await sendEmail(email, 'Welcome to Deal Signals!', welcomeHtml);
        } catch {
          // Don't block confirmation if welcome email fails
        }

        return NextResponse.redirect(
          new URL('/confirmed', request.nextUrl.origin)
        );
      } catch {
        return NextResponse.redirect(
          new URL('/subscribe?error=not_found', request.nextUrl.origin)
        );
      }
    }

    const subscriberDoc = snapshot.docs[0];
    const subscriberData = subscriberDoc.data();

    // Check if already confirmed
    if (subscriberData.status === 'confirmed') {
      return NextResponse.redirect(
        new URL('/confirmed', request.nextUrl.origin)
      );
    }

    // Update status to confirmed
    await subscribersRef.doc(subscriberDoc.id).update({
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Send welcome email (don't let failure block confirmation)
    try {
      const welcomeHtml = welcomeTemplate({ email });
      await sendEmail(email, 'Welcome to Deal Signals!', welcomeHtml);
    } catch (emailError) {
      console.error('Welcome email failed (confirmation still succeeded):', emailError);
    }

    // Redirect to success page
    return NextResponse.redirect(
      new URL('/confirmed', request.nextUrl.origin)
    );
  } catch (error) {
    console.error('Confirm subscription error:', error);

    return NextResponse.redirect(
      new URL('/subscribe?error=server_error', request.nextUrl.origin)
    );
  }
}
