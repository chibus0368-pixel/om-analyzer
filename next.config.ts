import type { NextConfig } from "next";

// ScoreOM — Next.js configuration
const nextConfig: NextConfig = {
  // Disable ESLint during builds (fix lint issues separately)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript errors during builds (fix separately)
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "img.logo.dev",
      },
    ],
    // Image optimization formats
    formats: ["image/avif", "image/webp"],
    // Cache images for 1 year
    minimumCacheTTL: 31536000,
  },


  // Experimental features (optimizeCss requires 'critters' package)
  // experimental: {
  //   optimizeCss: true,
  // },

  // Custom headers for caching and performance
  async headers() {
    // In `next dev` the chunk URLs are not content-hashed, so a 1-year immutable
    // cache makes the browser run stale JS after edits (hydration errors, old
    // sections reappearing). Only apply the long-lived cache in production.
    const isDev = process.env.NODE_ENV !== "production";
    return [
      // Static assets: Cache for 1 year (production only)
      ...(isDev ? [] : [{
        source: "/:path((?:.*\\.(?:js|css|woff|woff2|ttf|eot|svg|webp|jpg|jpeg|png|gif)|_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      }]),
      // Images: Cache for 1 year
      {
        source: "/public/:path(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Pages: Cache with stale-while-revalidate for 1 hour
      {
        source: "/:path((?!api|_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      // API routes: No cache, must revalidate
      {
        source: "/api/:path(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
      // Private admin pages: never index or cache
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // Security headers
      {
        source: "/:path(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },

  // Redirects configuration - WordPress migration redirects
  async redirects() {
    return [
      // Old domain: send every dealsignals.app URL to the same path on www.scoreom.com
      // (backup for the Vercel domain-level redirect; keeps old share / deal links working)
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?dealsignals\\.app' }],
        destination: 'https://www.scoreom.com/:path*',
        permanent: true,
      },
      // Short share links (temporary 307s so the targets can change later).
      // Each lands on the homepage with its UTM tags so the som_attr cookie,
      // Vercel Analytics and GA4 record the source.
      { source: '/x', destination: '/?utm_source=x&utm_campaign=launch&utm_content=vs_chatgpt_thread', permanent: false },
      { source: '/xbio', destination: '/?utm_source=x&utm_campaign=bio&utm_content=profile', permanent: false },
      { source: '/xrc', destination: '/?utm_source=x&utm_campaign=reel_c_maturity&utm_content=reel_c', permanent: false },
      { source: '/xt',  destination: '/?utm_source=x&utm_campaign=x_tips&utm_content=afternoon_tip', permanent: false },
      { source: '/xs2', destination: '/?utm_source=x&utm_campaign=sample2_cap_rate&utm_content=sample2', permanent: false },
      { source: '/xrd', destination: '/?utm_source=x&utm_campaign=reel_d_rates&utm_content=reel_d', permanent: false },
      { source: '/xre', destination: '/?utm_source=x&utm_campaign=reel_e_rent_roll&utm_content=reel_e', permanent: false },
      { source: '/xrf', destination: '/?utm_source=x&utm_campaign=reel_f_cap_spread&utm_content=reel_f', permanent: false },
      { source: '/xe',  destination: '/?utm_source=x&utm_campaign=x_extras&utm_content=x_extra', permanent: false },
      // Paid ads. Incoming query params (gclid etc.) are passed through by Next.
      { source: '/ad-g1', destination: '/?utm_source=google_ads&utm_medium=cpc&utm_campaign=paid_test_oct26&utm_content=g1_speed', permanent: false },
      { source: '/ad-g2', destination: '/?utm_source=google_ads&utm_medium=cpc&utm_campaign=paid_test_oct26&utm_content=g2_noi', permanent: false },
      { source: '/ig', destination: '/?utm_source=instagram&utm_campaign=bio&utm_content=vs_chatgpt', permanent: false },
      { source: '/ph', destination: '/?utm_source=producthunt&utm_campaign=launch&utm_content=maker_comment_screening', permanent: false },
      // Redirect /om-analyzer to root (homepage now lives at /)
      {
        source: '/om-analyzer',
        destination: '/',
        permanent: true,
      },
      // Legacy /try-pro page removed — send traffic to homepage
      {
        source: '/try-pro',
        destination: '/',
        permanent: true,
      },
      // (Removed: /pricing -> /#pricing redirect. The standalone /pricing
      // page now exists again at src/app/pricing/page.tsx as a public
      // marketing page with shareable URL. Keeping the redirect would
      // shadow the route and 308 every visitor back to the home anchor.)
      // WordPress admin and login pages
      {
        source: '/wp-admin',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-admin/:path(.*)',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-login.php',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-login',
        destination: '/',
        permanent: true,
      },
      // WordPress static content directories
      {
        source: '/wp-content/:path(.*)',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-includes/:path(.*)',
        destination: '/',
        permanent: true,
      },
      // WordPress feeds (consolidated to learn section)
      {
        source: '/feed',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/feed/:path(.*)',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/rss',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/rss/:path(.*)',
        destination: '/learn',
        permanent: true,
      },
      // XML-RPC (block attempt)
      {
        source: '/xmlrpc.php',
        destination: '/',
        permanent: true,
      },
      // WordPress query string redirects (?p=ID for posts)
      {
        source: '/:path(.*)',
        destination: '/',
        permanent: true,
        has: [
          {
            type: 'query',
            key: 'p',
          },
        ],
      },
      // WordPress archive pages
      {
        source: '/category/:path(.*)',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/tag/:path(.*)',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/archive/:path(.*)',
        destination: '/learn',
        permanent: true,
      },
      // WordPress author pages
      {
        source: '/author/:path(.*)',
        destination: '/',
        permanent: true,
      },
      // WordPress pagination
      {
        source: '/page/:num(.*)',
        destination: '/learn',
        permanent: true,
      },
      {
        source: '/:path(.*)/page/:num(.*)',
        destination: '/learn',
        permanent: true,
      },
    ];
  },

  // Rewrites: proxy Firebase auth handler so custom authDomain works
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__/auth/:path*",
          destination: "https://deal-signals.firebaseapp.com/__/auth/:path*",
        },
        // Serve om-analyzer page at root
        {
          source: "/",
          destination: "/om-analyzer",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
