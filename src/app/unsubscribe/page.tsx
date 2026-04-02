import type { Metadata } from "next";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Unsubscribe from Deal Signals emails.",
  openGraph: {
    title: "Unsubscribe",
    description:
      "Unsubscribe from Deal Signals emails.",
  },
  twitter: {
    title: "Unsubscribe",
    description:
      "Unsubscribe from Deal Signals emails.",
  },
};

export default async function UnsubscribePage() {
  return (
    <>
      <DealSignalNav />

      <section className="content-area">
        <div className="container" style={{ maxWidth: "600px", paddingTop: "64px", paddingBottom: "64px" }}>
          <div
            style={{
              border: "1px solid var(--navy-100)",
              borderRadius: "8px",
              padding: "48px",
              background: "var(--white)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>👋</div>

            <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "16px" }}>
              We'll Miss You
            </h1>

            <p style={{ fontSize: "16px", color: "var(--navy-600)", lineHeight: 1.6, marginBottom: "32px" }}>
              We're sorry to see you go. Before you unsubscribe, please let us know what we could have
              done better.
            </p>

            {/* Feedback Form */}
            <form
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                marginBottom: "32px",
                textAlign: "left",
              }}
            >
              <div>
                <label
                  htmlFor="reason"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--navy-900)",
                    marginBottom: "6px",
                  }}
                >
                  Why are you unsubscribing?
                </label>
                <select
                  id="reason"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "1px solid var(--navy-200)",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    background: "var(--white)",
                  }}
                >
                  <option value="">Select a reason...</option>
                  <option value="not-relevant">Content isn't relevant to me</option>
                  <option value="too-frequent">Too many emails</option>
                  <option value="quality">Content quality</option>
                  <option value="switched">Switched to another service</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="comment"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--navy-900)",
                    marginBottom: "6px",
                  }}
                >
                  Any additional feedback? (Optional)
                </label>
                <textarea
                  id="comment"
                  placeholder="Your feedback helps us improve..."
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "1px solid var(--navy-200)",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    minHeight: "100px",
                    resize: "vertical",
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  padding: "12px 24px",
                  background: "var(--navy-100)",
                  color: "var(--navy-900)",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Send Feedback
              </button>
            </form>

            {/* Unsubscribe Buttons */}
            <div
              style={{
                borderTop: "1px solid var(--navy-100)",
                paddingTop: "32px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--navy-600)", margin: 0 }}>
                Click below to confirm unsubscribe:
              </p>
              <button
                style={{
                  padding: "12px 24px",
                  background: "var(--red-500)",
                  color: "var(--white)",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Unsubscribe Completely
              </button>
              <a
                href="/"
                style={{
                  padding: "12px 24px",
                  background: "var(--white)",
                  color: "var(--navy-900)",
                  border: "1px solid var(--navy-200)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                Never mind, take me back
              </a>
            </div>
          </div>

          {/* Alternative: Manage Preferences */}
          <div
            style={{
              marginTop: "32px",
              padding: "24px",
              background: "var(--cream)",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "14px", color: "var(--navy-700)", marginBottom: "12px" }}>
              Don't want to unsubscribe? You can adjust your email frequency and interests instead.
            </p>
            <a
              href="/preferences"
              style={{
                display: "inline-block",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--red-500)",
                textDecoration: "none",
              }}
            >
              Manage Preferences →
            </a>
          </div>
        </div>
      </section>

      <DealSignalFooter />
    </>
  );
}
