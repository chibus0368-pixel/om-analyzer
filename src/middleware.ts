import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Let the Firebase auth handler proxy through WITHOUT any custom headers.
  // The /__/auth/* rewrite proxies to firebaseapp.com and needs full control
  // of its own headers (scripts, cookies, postMessage) for OAuth to work.
  if (pathname.startsWith('/__/auth')) {
    return NextResponse.next();
  }

  // Create response with security and CORS headers
  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // NB: img-src must include `blob:` so PropertyImageEditor can preview a
  // newly uploaded file via URL.createObjectURL(). Without it the browser
  // silently blocks <img src="blob:..."> and the editor appears to do nothing
  // after a file pick.
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com https://apis.google.com https://*.firebaseapp.com https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https: https://www.google-analytics.com https://www.googletagmanager.com; media-src 'self' blob:; connect-src 'self' blob: https: https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com; frame-src 'self' https://maps.google.com https://www.google.com https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'self'; upgrade-insecure-requests;"
  );

  // Add CORS headers for public API routes only (not admin)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/admin/')) {
    const allowedOrigins = [
      'https://dealsignals.app',
      'https://www.dealsignals.app',
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
    ];
    const origin = request.headers.get('origin') || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    response.headers.set('Access-Control-Allow-Origin', corsOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
