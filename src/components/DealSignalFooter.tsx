import Link from "next/link";

/**
 * Deal Signals shared site footer - used on /pricing, /terms, /privacy,
 * /contact, /not-found, and any other marketing-style page.
 *
 * Mirrors the main footer used inline on /om-analyzer so every public
 * page shows the same dark, 4-column layout with product + company +
 * legal columns. Product links jump to the homepage sections via
 * absolute paths so clicking "How it works" from /pricing still lands
 * on /om-analyzer#how-it-works.
 */
export default function DealSignalFooter() {
  const colHeader: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: 18,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };
  const linkStyle: React.CSSProperties = {
    display: "block",
    fontSize: 14,
    color: "#cbd2e0",
    textDecoration: "none",
    marginBottom: 12,
    fontFamily: "'Inter', sans-serif",
    transition: "color 0.15s ease",
  };

  return (
    <footer
      style={{
        background: "rgba(22,22,31,0.95)",
        padding: "56px 32px 32px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        color: "#8b93a8",
      }}
    >
      <div
        className="ds-footer-grid"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
          gap: 48,
          marginBottom: 40,
        }}
      >
        {/* ── Brand column ── */}
        <div>
          <img
            src="/images/dealsignals-full-logo4.png"
            alt="DealSignals"
            style={{ height: 36 }}
          />
          <p
            style={{
              fontSize: 13,
              color: "#8b93a8",
              lineHeight: 1.7,
              marginTop: 14,
              maxWidth: 280,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Analyze CRE deals with AI-powered intelligence. Get real signals,
            not guesses.
          </p>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "#84CC16",
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(132,204,22,0.08)",
                border: "1px solid rgba(132,204,22,0.25)",
                fontFamily: "'Inter', sans-serif",
                letterSpacing: 0.3,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#84CC16",
                  boxShadow: "0 0 6px #84CC16",
                }}
              />
              All systems operational
            </span>
          </div>
        </div>

        {/* ── Product column ── */}
        <div>
          <div style={colHeader}>Product</div>
          <Link href="/om-analyzer#examples" style={linkStyle}>
            Examples
          </Link>
          <Link href="/om-analyzer#how-it-works" style={linkStyle}>
            How it works
          </Link>
          <Link href="/om-analyzer#features" style={linkStyle}>
            Features
          </Link>
          <Link href="/om-analyzer#faq" style={linkStyle}>
            FAQ
          </Link>
          <Link href="/#pricing" style={linkStyle}>
            Pricing
          </Link>
          <Link href="/om-analyzer" style={linkStyle}>
            Try it free
          </Link>
        </div>

        {/* ── Company column ── */}
        <div>
          <div style={colHeader}>Company</div>
          <Link href="/contact" style={linkStyle}>
            Contact
          </Link>
          <Link href="/workspace/login" style={linkStyle}>
            Log In
          </Link>
          <Link href="/workspace/login?mode=register" style={linkStyle}>
            Sign Up
          </Link>
        </div>

        {/* ── Legal column ── */}
        <div>
          <div style={colHeader}>Legal</div>
          <Link href="/terms" style={linkStyle}>
            Terms of Use
          </Link>
          <Link href="/privacy" style={linkStyle}>
            Privacy Policy
          </Link>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto 20px",
          padding: "16px 18px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          fontSize: 11.5,
          color: "#8b93a8",
          lineHeight: 1.6,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{ fontWeight: 700, color: "#cbd2e0", marginRight: 6 }}>Disclaimer:</span>
        DealSignals output is automated general guidance, not investment, legal, tax, or financial advice. Every deal demands your own full due diligence and independent professional review before you commit capital. Figures are derived from uploaded documents and public data sources that may be incomplete or inaccurate. Verify all material facts directly.
      </div>

      {/* ── Bottom bar ── */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#5b6170",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          &copy; {new Date().getFullYear()} DealSignals, Inc. All rights reserved.
        </span>
        <span
          style={{
            fontSize: 12,
            color: "#5b6170",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Made for CRE investors and brokers.
        </span>
      </div>

      {/* Responsive stack on narrow screens */}
      <style>{`
        @media (max-width: 820px) {
          .ds-footer-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 32px !important;
          }
        }
        @media (max-width: 520px) {
          .ds-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
