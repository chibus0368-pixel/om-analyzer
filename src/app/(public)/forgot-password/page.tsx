"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth/providers";
import { mapAuthError } from "@/lib/auth/errors";
import { AuthBrand } from "@/components/auth/AuthBrand";

const C = {
  primary: "#65A30D",
  primaryGradient: "linear-gradient(135deg, #65A30D, #84cc16)",
  onSurface: "#151b2b",
  secondary: "#585e70",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  radius: 6,
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await requestPasswordReset(email);
      // Always show success message for security (don't reveal if account exists)
      setSubmitted(true);
      setEmail("");
    } catch (err) {
      // Suppress actual error to prevent account enumeration
      setSubmitted(true);
      setEmail("");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div>
        <AuthBrand />

        {/* Success Message */}
        <div
          style={{
            padding: "20px 16px",
            backgroundColor: "#efe",
            border: `1px solid ${C.primary}33`,
            borderRadius: `${C.radius}px`,
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#1a5d2e",
              margin: "0 0 8px 0",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Check Your Email
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#1a5d2e",
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            If an account exists for the email you provided, you'll receive instructions to reset your password shortly.
          </p>
        </div>

        {/* Link back to login */}
        <div
          style={{
            textAlign: "center",
            marginTop: "32px",
          }}
        >
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#ffffff",
              background: C.primaryGradient,
              border: "none",
              borderRadius: `${C.radius}px`,
              cursor: "pointer",
              textDecoration: "none",
              transition: "all 0.3s",
              fontFamily: "Inter, sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(132, 204, 22, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Back to Sign In
          </a>
        </div>

        {/* Or try again */}
        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
            fontSize: "13px",
            fontFamily: "Inter, sans-serif",
            color: C.secondary,
          }}
        >
          <button
            onClick={() => setSubmitted(false)}
            style={{
              background: "none",
              border: "none",
              color: C.primary,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Try Another Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AuthBrand />

      {/* Form Title */}
      <h2
        style={{
          fontSize: "20px",
          fontWeight: "700",
          color: C.onSurface,
          margin: "0 0 12px 0",
          textAlign: "center",
          fontFamily: "'Inter', sans-serif",
          letterSpacing: -0.2,
        }}
      >
        Reset Your Password
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: "14px",
          color: C.secondary,
          textAlign: "center",
          margin: "0 0 24px 0",
          fontFamily: "Inter, sans-serif",
        }}
      >
        Enter your email address and we'll send you instructions to reset your password.
      </p>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fee",
            border: `1px solid ${C.primary}33`,
            borderRadius: `${C.radius}px`,
            marginBottom: "20px",
            fontSize: "14px",
            color: C.primary,
            fontFamily: "Inter, sans-serif",
          }}
        >
          {error}
        </div>
      )}

      {/* Email Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: "600",
              color: C.onSurface,
              marginBottom: "8px",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "14px",
              border: `1px solid ${C.ghost}`,
              borderRadius: `${C.radius}px`,
              boxSizing: "border-box",
              fontFamily: "Inter, sans-serif",
              backgroundColor: C.surfLowest,
              color: C.onSurface,
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = C.primary;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = C.ghost;
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#ffffff",
            background: loading ? "#999" : C.primaryGradient,
            border: "none",
            borderRadius: `${C.radius}px`,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.3s",
            fontFamily: "Inter, sans-serif",
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(132, 204, 22, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      {/* Link back to login */}
      <div
        style={{
          marginTop: "24px",
          textAlign: "center",
          fontSize: "13px",
          fontFamily: "Inter, sans-serif",
          color: C.secondary,
        }}
      >
        Remember your password?{" "}
        <a
          href="/login"
          style={{
            color: C.primary,
            textDecoration: "none",
            fontWeight: "600",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Sign In
        </a>
      </div>
    </div>
  );
}
