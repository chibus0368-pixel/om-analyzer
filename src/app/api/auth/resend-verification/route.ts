import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/auth/resend-verification
 *
 * Backend acknowledges the resend request. The client is responsible for
 * sending the actual verification email via Firebase client SDK:
 * sendEmailVerification(user)
 *
 * This endpoint verifies the token and returns success. The client should
 * handle the actual email send to avoid exposing Firebase config.
 */
export async function POST(request: NextRequest) {
  try {
    // Extract and verify token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    try {
      const adminAuth = getAdminAuth();
      await adminAuth.verifyIdToken(token);
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Token is valid. Client should now call sendEmailVerification(user)
    return NextResponse.json({
      ok: true,
      message: 'Ready to resend verification email. Client should call sendEmailVerification().',
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return NextResponse.json(
      {
        error: 'Failed to process resend request',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
