"use client";

import { useState, useEffect, lazy, Suspense } from "react";

/**
 * Lightweight client-only loader for PropertyDetailClient.
 *
 * Architecture:
 * - page.tsx is a React Server Component (no "use client")
 * - page.tsx renders this loader as a client component
 * - This loader uses React.lazy + ClientOnly pattern to:
 *   1. Prevent server-side rendering of PropertyDetailClient
 *      (which breaks React SSR streaming on this route)
 *   2. Properly trigger webpack chunk loading on the client
 *      (next/dynamic ssr:false has a bug in Next.js 15.5 where
 *       BailoutToCSR never triggers React.lazy chunk loading)
 */
const PropertyDetailClient = lazy(() => import("./PropertyDetailClient"));

const spinner = (
  <div style={{ padding: 60, textAlign: "center", color: "#585e70" }}>
    <div
      style={{
        width: 32,
        height: 32,
        border: "3px solid rgba(227, 190, 189, 0.15)",
        borderTopColor: "#4D7C0F",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 12px",
      }}
    />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    Loading deal...
  </div>
);

export default function PropertyDetailLoader() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return spinner;

  return (
    <Suspense fallback={spinner}>
      <PropertyDetailClient />
    </Suspense>
  );
}
