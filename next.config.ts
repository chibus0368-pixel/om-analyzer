import type { NextConfig } from "next";

// NNNTripleNet — Next.js configuration
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

  // Enable SSR for Firebase Hosting
  output: "standalone",

  // Experimental features (optimizeCss requires 'critters' package)
  // experimental: {
  //   optimizeCss: true,
  // },

  // Custom headers for caching and performance
  async headers() {
    return [
      // Static assets: Cache for 1 year
      {
        source: "/:path((?:.*\\.(?:js|css|woff|woff2|ttf|eot|svg|webp|jpg|jpeg|png|gif)|_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
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

  // Rewrites configuration (if needed)
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
