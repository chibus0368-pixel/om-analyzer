"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary for /workspace/*.
 *
 * Catches any client-side render error inside the workspace segment and
 * replaces the raw "Application error: a client-side exception has occurred"
 * black screen with a friendly recovery UI. User can hit Retry (which calls
 * Next's reset()) or Reload (full page refresh) without losing the workspace
 * context.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console so we still see it in devtools + Vercel runtime logs
    console.error("[workspace error boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "rgba(220,38,38,0.08)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#DC2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#151b2b",
            margin: "0 0 8px",
          }}
        >
          Something went wrong loading this page
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#585e70",
            margin: "0 0 20px",
            lineHeight: 1.5,
          }}
        >
          A temporary rendering error occurred. Hitting retry usually fixes it.
          {error?.digest ? (
            <>
              <br />
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                Error ID: {error.digest}
              </span>
            </>
          ) : null}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 22px",
              background: "#151b2b",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Retry
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            style={{
              padding: "10px 22px",
              background: "#fff",
              color: "#151b2b",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Reload page
          </button>
          <Link
            href="/workspace"
            style={{
              padding: "10px 22px",
              background: "#fff",
              color: "#585e70",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
