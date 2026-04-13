"use client";

import { useState } from "react";
import Link from "next/link";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";

type SendState = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMsg("Please fill out name, email, and message.");
      return;
    }
    if (message.trim().length < 10) {
      setErrorMsg("Message should be at least 10 characters.");
      return;
    }

    setState("sending");
    try {
      // The existing /api/contact route expects { name, email, message }.
      // If a subject was entered, prepend it to the message so support sees it.
      const composedMessage = subject.trim()
        ? `Subject: ${subject.trim()}\n\n${message.trim()}`
        : message.trim();

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: composedMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      setState("sent");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message || "Failed to send. Please try again.");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    outline: "none",
    transition: "border-color 0.15s ease, background 0.15s ease",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#cbd2e0",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };

  return (
    <div style={{ background: "#0d0d14", minHeight: "100vh", color: "#ffffff" }}>
      <DealSignalNav />

      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "80px 24px 96px",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              color: "#84CC16",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(132,204,22,0.08)",
              border: "1px solid rgba(132,204,22,0.25)",
              marginBottom: 20,
            }}
          >
            Contact
          </div>
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: -1,
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: 1.1,
            }}
          >
            Get in touch.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#cbd2e0",
              marginTop: 16,
              lineHeight: 1.6,
              maxWidth: 540,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Questions, feedback, partnerships, or a deal you want us to look at?
            Drop us a note and the team will get back within one business day.
          </p>
        </div>

        <div
          style={{
            background: "rgba(22,22,31,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: 40,
            backdropFilter: "blur(10px)",
          }}
        >
          {state === "sent" ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(132,204,22,0.12)",
                  border: "1px solid rgba(132,204,22,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontSize: 28,
                  color: "#84CC16",
                }}
              >
                ✓
              </div>
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Message sent.
              </h2>
              <p style={{ color: "#cbd2e0", marginTop: 12, fontSize: 15 }}>
                Thanks - we&apos;ll get back to you within one business day.
                A confirmation is on its way to your inbox.
              </p>
              <button
                onClick={() => setState("idle")}
                style={{
                  marginTop: 24,
                  padding: "12px 24px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 20,
                  marginBottom: 20,
                }}
                className="ds-contact-grid"
              >
                <div>
                  <label style={labelStyle} htmlFor="ds-contact-name">
                    Name
                  </label>
                  <input
                    id="ds-contact-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    style={inputStyle}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="ds-contact-email">
                    Email
                  </label>
                  <input
                    id="ds-contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                    maxLength={200}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle} htmlFor="ds-contact-subject">
                  Subject
                </label>
                <input
                  id="ds-contact-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this about?"
                  style={inputStyle}
                  maxLength={200}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle} htmlFor="ds-contact-message">
                  Message
                </label>
                <textarea
                  id="ds-contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us a bit more..."
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 140 }}
                  maxLength={2000}
                  required
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "#8b93a8",
                    marginTop: 6,
                    textAlign: "right",
                  }}
                >
                  {message.length}/2000
                </div>
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "rgba(220,53,69,0.08)",
                    border: "1px solid rgba(220,53,69,0.35)",
                    color: "#f8d7da",
                    fontSize: 13,
                    marginBottom: 20,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={state === "sending"}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  borderRadius: 10,
                  background:
                    state === "sending"
                      ? "rgba(132,204,22,0.5)"
                      : "linear-gradient(135deg, #84CC16 0%, #65A30D 100%)",
                  color: "#0d0d14",
                  fontSize: 15,
                  fontWeight: 700,
                  border: "none",
                  cursor: state === "sending" ? "not-allowed" : "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  boxShadow:
                    state === "sending"
                      ? "none"
                      : "0 4px 16px rgba(132,204,22,0.3)",
                  transition: "all 0.2s ease",
                }}
              >
                {state === "sending" ? "Sending…" : "Send message"}
              </button>

              <p
                style={{
                  fontSize: 12,
                  color: "#8b93a8",
                  textAlign: "center",
                  marginTop: 16,
                }}
              >
                Prefer email? Write us directly at{" "}
                <a
                  href="mailto:support@dealsignals.app"
                  style={{ color: "#84CC16", textDecoration: "none" }}
                >
                  support@dealsignals.app
                </a>
              </p>
            </form>
          )}
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 32,
            fontSize: 13,
            color: "#8b93a8",
          }}
        >
          Looking for something else?{" "}
          <Link href="/om-analyzer" style={{ color: "#cbd2e0" }}>
            Home
          </Link>
          {" · "}
          <Link href="/#pricing" style={{ color: "#cbd2e0" }}>
            Pricing
          </Link>
        </div>
      </main>

      <DealSignalFooter />

      <style>{`
        .ds-contact-grid input:focus,
        .ds-contact-grid textarea:focus,
        textarea:focus,
        input:focus {
          border-color: #84CC16 !important;
          background: rgba(132,204,22,0.04) !important;
        }
        @media (max-width: 640px) {
          .ds-contact-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
