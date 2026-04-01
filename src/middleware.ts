import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Article slugs that redirect to /learn/:slug
const ARTICLE_SLUGS = new Set([
  '10-year-review-of-commercial-loans',
  '1721612472',
  '1728386429',
  '1753096268',
  '3056306686',
  '4311281585-2',
  '5836949424',
  '6300691402',
  '6712158848',
  '6757295954',
  '7425529124',
  '9505277502',
  '99-problems-but-a-dry-cleaner-aint-one',
  'automate-monthly-rent-invoices',
  'benefits-of-buying-dirt',
  'breaking-down-1031-real-estate-exchange',
  'building-strong-tenant-relationships',
  'buying-real-estate-in-a-higher-interest-rate-market',
  'cap-rate-usage-for-commercial-real-estate',
  'charging-tenants-for-property-management-fee',
  'creative-financing-strategies-for-small-investors',
  'determine-base-rental-rates',
  'do-mom-and-pop-businesses-still-work',
  'do-personal-guarantees-work-in-commercial-leases',
  'easement-is-a-legal-right',
  'handling-hvac-unit-expenses',
  'highest-surprise-expenses-with-owning-a-retail-center',
  'how-hard-is-it-to-become-a-commercial-real-estate-investor',
  'how-many-times-a-month-should-you-walk-each-of-your-property',
  'how-nnn-leases-work',
  'how-to-buy-commercial-property-a-clear-and-knowledgeable-guide',
  'how-to-calc-cap-rate',
  'is-buying-commercial-real-estate-useful',
  'judge-risk-of-anchor-tenants',
  'long-term-leases-as-they-relate-to-the-value-of-a-building',
  'maximizing-retail-success-the-key-to-thriving-in-commercial-real-estate',
  'pros-and-cons-of-commercial-property-syndication',
  'quickbooks-for-real-estate-classes-vs-locations',
  'should-your-commercial-investment-property-be-near-your-home-discover-the-pros-and-cons',
  'strategies-for-adding-value-in-triplenet-lease-properties',
  'tenant-types-to-target-warning-with-spoilers',
  'the-advantages-of-depreciation-on-commercial-real-estate',
  'the-basics-of-a-ground-lease',
  'the-benefits-of-nnn-lease-structures-for-commercial-property-managers',
  'the-effectiveness-of-online-payments-for-collecting-rent',
  'the-human-toll-how-empty-office-spaces-impact-employees',
  'the-importance-of-checking-business-credit-score-for-tenants',
  'the-top-nnn-tenants-every-commercial-property-manager-should-know-about',
  'understanding-noi-a-key-real-estate-metric',
  'understanding-the-maturity-of-loan-crisis-in-next-3-years',
  'understanding-the-office-commercial-real-estate-cre-market-challenges',
  'using-google-sheets-to-share-nnn-expenses',
  'using-rent-escalators-in-leases',
  'wfh',
  'what-are-the-biggest-blind-spots-in-commercial-real-estate-investing-2',
  'what-do-investors-look-out-for-when-buying-commercial-property',
  'what-does-a-landlord-pay-for-in-a-triple-net-lease',
  'what-repairs-upgrades-is-a-landlord-responsible-for-in-a-triplenet-lease',
  'whats-the-average-down-payment-on-a-commercial-property-loan',
  'who-pays-for-a-new-roof-in-a-triple-net-lease-2',
  'why-do-some-insurance-companies-require-a-condition-report-and-others-dont',
]);

// Glossary slugs that redirect to /glossary/:slug
const GLOSSARY_SLUGS = new Set([
  'absorption-rate',
  'ad-valorem',
  'anchor-store',
  'anchor-tenant',
  'annual-debt-service-ads',
  'appraisal',
  'assessed-value',
  'assessor',
  'balloon-payment',
  'brownfield',
  'build-to-core',
  'build-to-suit',
  'building-envelope',
  'building-systems',
  'cap-rate',
  'capex-reserve',
  'capital-expenditure-capex',
  'cash-flow-cf',
  'cash-on-cash',
  'cercla',
  'certificate-of-occupancy-co',
  'cmbs',
  'co-tenancy',
  'cold-dark-shell-lease',
  'commercial-mortgage-backed-securities-cmbs',
  'comparable-sales',
  'concession',
  'core-plus',
  'cost-approach',
  'covenant',
  'cross-collateralization',
  'cross-default',
  'curable-defect',
  'dark-store',
  'debt-coverage-ratio-dcr',
  'debt-yield-ratio',
  'deferred-maintenance',
  'demographic-analysis',
  'depreciation',
  'development-cost',
  'distressed-property',
  'double-net-leases',
  'dscr',
  'due-diligence',
  'due-diligence-period',
  'easement',
  'effective-gross-rental-income-egi',
  'encumbrance',
  'environmental-impact-study',
  'environmental-site-assessment-esa',
  'equity',
  'escalation',
  'escalation-clause',
  'escrow',
  'exclusive-use',
  'exclusive-use-clause',
  'exit-strategy',
  'expansion-rights',
  'fair-market-rent',
  'feasibility-study',
  'floor-area-ratio-far',
  'foreclosure-auction',
  'franchise-agreement',
  'going-concern',
  'gross-potential-rent',
  'ground-lease',
  'hard-costs',
  'highest-and-best-use',
  'impairment',
  'incentive-zoning',
  'indemnity',
  'infrastructure',
  'institutional-investor',
  'internal-rate-of-return-irr',
  'land-banking',
  'lease-commencement-date',
  'leasehold-interest',
  'lessee',
  'lessor',
  'letter-of-intent-loi',
  'loan-to-value-ltv',
  'loan-to-value-ltv-ratio',
  'make-whole-call',
  'market-rent',
  'master-lease',
  'mezzanine-financing',
  'mixed-use',
  'modified-gross-lease',
  'net-effective-rent',
  'net-lease',
  'net-lease-cap-rates',
  'net-operating-income-noi',
  'nnn',
  'non-recourse-loan',
  'operating-covenant',
  'operating-expenses-opex',
  'operating-statement',
  'opportunity-cost',
  'option-period',
  'overbuilding',
  'pari-passu',
  'participating-mortgage',
  'pass-through-expenses',
  'physical-due-diligence',
  'positive-amortization',
  'pud',
  'qualified-opportunity-zone-qoz',
  'recourse-loan',
  'redevelopment',
  'rent-escalation',
  'repositioning',
  'restrictive-covenant',
  'right-of-first-offer-rofo',
  'right-to-quiet-enjoyment-clause-in-commercial-leases',
  'rofr',
  'sale-leaseback',
  'security-deposit',
  'single-net-lease',
  'site-assessment',
  'soft-costs',
  'special-purpose-property',
  'stabilized-asset',
  'sublease',
  'subordination',
  'syndication',
  'tenant-improvement-allowance',
  'tenant-improvement-ti',
  'tenants-right-to-due-process',
  'title-insurance',
  'trade-fixtures',
  'turnkey',
  'underperforming-property',
  'underwriting',
  'vacancy-loss',
  'value-add',
  'yield',
  'yield-maintenance',
]);

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = request.nextUrl.pathname;


  // WordPress migration redirects
  // Pattern 1: /:year/:month/:day/:slug (dated articles/glossary)
  const datedPattern = /^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/?$/;
  const datedMatch = pathname.match(datedPattern);

  if (datedMatch) {
    const slug = datedMatch[4];

    if (ARTICLE_SLUGS.has(slug)) {
      return NextResponse.redirect(new URL(`/learn/${slug}`, request.url), { status: 301 });
    }

    if (GLOSSARY_SLUGS.has(slug)) {
      return NextResponse.redirect(new URL(`/glossary/${slug}`, request.url), { status: 301 });
    }

    // Default fallback for unmatched dated articles: redirect to /learn
    return NextResponse.redirect(new URL(`/learn`, request.url), { status: 301 });
  }

  // Pattern 2: /:slug (bare root slug)
  // Only match if it's a single path segment and not a known route
  const bareSlugPattern = /^\/([^/]+)\/?$/;
  const bareMatch = pathname.match(bareSlugPattern);

  if (bareMatch) {
    const slug = bareMatch[1];

    // All valid top-level routes and static assets — never redirect these
    const knownRoutes = new Set([
      '1031', 'about', 'admin', 'ai', 'api', 'articles', 'benchmarks',
      'calculators', 'capital-markets', 'confirmed', 'contact', 'credit',
      'data', 'deals', 'events', 'feed.xml', 'glossary', 'guides',
      'indices', 'learn', 'macro', 'news', 'om-analyzer', 'preferences', 'privacy',
      'property', 'reits', 'research', 'search', 'sectors', 'sitemap',
      'sitemap-page', 'small-investor', 'strategy', 'subscribe',
      'tenant-risk', 'terms', 'tools', 'unsubscribe', 'workspace',
    ]);

    // Skip static assets, framework paths, and Next.js convention routes (OG images, icons, etc.)
    const isStaticOrFramework = slug.includes('.') || slug.startsWith('_next') || slug.startsWith('__')
      || slug.startsWith('opengraph-image') || slug.startsWith('twitter-image') || slug === 'icon' || slug === 'apple-icon' || slug === 'robots.txt' || slug === 'sitemap.xml';

    if (!knownRoutes.has(slug) && !isStaticOrFramework) {
      // Check if it's a known article slug → redirect to /learn/slug
      if (ARTICLE_SLUGS.has(slug)) {
        return NextResponse.redirect(new URL(`/learn/${slug}`, request.url), { status: 301 });
      }

      // Check if it's a known glossary slug → redirect to /glossary/slug
      if (GLOSSARY_SLUGS.has(slug)) {
        return NextResponse.redirect(new URL(`/glossary/${slug}`, request.url), { status: 301 });
      }

      // Catch-all: any other bare slug is likely an old WordPress post → redirect to /learn
      return NextResponse.redirect(new URL('/learn', request.url), { status: 301 });
    }
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
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: https://www.google-analytics.com https://www.googletagmanager.com; connect-src 'self' https: https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com; frame-src 'self' https://maps.google.com https://www.google.com; frame-ancestors 'self'; upgrade-insecure-requests;"
  );

  // Add CORS headers for public API routes only (not admin)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/admin/')) {
    const allowedOrigins = [
      'https://nnntriplenet.com',
      'https://www.nnntriplenet.com',
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
