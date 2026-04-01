import type { Metadata } from "next";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Email Confirmed - Deal Signals",
  description: "Your email has been confirmed. Welcome to Deal Signals!",
  openGraph: {
    title: "Email Confirmed",
    description:
      "Your email has been confirmed. Welcome to Deal Signals!",
  },
  twitter: {
    title: "Email Confirmed",
    description:
      "Your email has been confirmed. Welcome to Deal Signals!",
  },
};

export default function ConfirmedPage() {
  return (
    <>
      <DealSignalNav />

      <section
        style={{
          background: "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-950) 100%)",
          color: "var(--white)",
          padding: "120px 24px",
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          {/* Big green checkmark */}
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 48, color: "#10B981" }}
            >
              check_circle
            </span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 40,
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 16,
              letterSpacing: "-0.5px",
            }}
          >
            You&apos;re all set!
          </h1>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.75)",
              marginBottom: 40,
            }}
          >
            Your email has been confirmed. Welcome to Deal Signals!
            You&apos;ll start receiving market updates, deal analysis, and
            investment insights right away.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "14px 32px",
                background: "var(--red-500)",
                color: "var(--white)",
                textDecoration: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 15,
                transition: "all 0.2s ease",
              }}
            >
              Explore Deal Signals
            </Link>
            <Link
              href="/om-analyzer"
              style={{
                display: "inline-block",
                padding: "14px 32px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "var(--white)",
                textDecoration: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                transition: "all 0.2s ease",
              }}
            >
              Read Latest News
            </Link>
          </div>

          {/* What to expect */}
          <div
            style={{
              marginTop: 56,
              padding: "28px 32px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              textAlign: "left",
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "rgba(255,255,255,0.5)",
                marginBottom: 16,
              }}
            >
              What to expect
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "newspaper", text: "Daily Market Brief - Mon-Fri by 7 AM ET" },
                { icon: "analytics", text: "Deal analysis with full financial breakdowns" },
                { icon: "show_chart", text: "Real-time cap rate and treasury data" },
              ].map((item) => (
                <div
                  key={item.text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 20, color: "#10B981", flexShrink: 0 }}
                  >
                    {item.icon}
                  </span>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Manage Preferences */}
          <div
            style={{
              marginTop: 24,
              padding: "20px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: "0 0 12px 0" }}>
              Want to customize your topics or frequency?
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              You&apos;ll find a manage preferences link in every email
            </p>
          </div>
        </div>
      </section>

      <DealSignalFooter />
    </>
  );
}
