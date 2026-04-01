"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth/providers";
import { mapAuthError } from "@/lib/auth/errors";

const C = {
  primary: "#b9172f",
  primaryGradient: "linear-gradient(135deg, #b9172f, #dc3545)",
  onSurface: "#151b2b",
  secondary: "#585e70",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  radius: 6,
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [success, setSuccess] = useState(false);
  const [invalidCode, setInvalidCode] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setInvalidCode(true);
    }
  }, [oobCode]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 10) {
      setPasswordError("Password must be at least 10 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validatePassword(password)) {
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      if (!oobCode) {
        throw new Error("Invalid reset link");
      }

      await resetPassword(oobCode, password);
      setSuccess(true);
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  if (invalidCode) {
    return (
      <div>
        {/* Logo / Branding */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: C.onSurface,
              margin: "0 0 8px 0",
              fontFamily: "Playfair Display, serif",
            }}
          >
            Deal Signals
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: C.secondary,
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Commercial Real Estate Intelligence
          </p>
        </div>

        {/* Error */}
        <div
          style={{
            padding: "20px 16px",
            backgroundColor: "#fee",
            border: `1px solid ${C.primary}33`,
            borderRadius: `${C.radius}px`,
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: C.primary,
              margin: "0 0 8px 0",
              fontFamily: "Playfair Display, serif",
            }}
          >
            Invalid Reset Link
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: C.primary,
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>

        {/* Link back to forgot-password */}
        <div
          style={{
            textAlign: "center",
            marginTop: "32px",
          }}
        >
          <a
            href="/forgot-password"
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
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(185, 23, 47, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Request New Reset Link
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div>
        {/* Logo / Branding */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: C.onSurface,
              margin: "0 0 8px 0",
              fontFamily: "Playfair Display, serif",
            }}
          >
            Deal Signals
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: C.secondary,
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Commercial Real Estate Intelligence
          </p>
        </div>

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
              fontFamily: "Playfair Display, serif",
            }}
          >
            Password Reset Successful
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#1a5d2e",
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Your password has been reset. You can now sign in with your new password.
          </p>
        </div>

        {/* Link to login */}
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
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(185, 23, 47, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Sign In Now
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Logo / Branding */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "32px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "700",
            color: C.onSurface,
            margin: "0 0 8px 0",
            fontFamily: "Playfair Display, serif",
          }}
        >
          Deal Signal
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: C.secondary,
            margin: "0",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Commercial Real Estate Intelligence
        </p>
      </div>

      {/* Form Title */}
      <h2
        style={{
          fontSize: "20px",
          fontWeight: "600",
          color: C.onSurface,
          margin: "0 0 12px 0",
          textAlign: "center",
          fontFamily: "Playfair Display, serif",
        }}
      >
        Set New Password
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
        Enter your new password below.
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

      {/* Password Form */}
      <form onSubmit={handleSubmit}>
        {/* Password */}
        <div style={{ marginBottom: "16px" }}>
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
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (e.target.value.length > 0) {
                validatePassword(e.target.value);
              }
            }}
            required
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "14px",
              border: `1px solid ${passwordError ? C.primary : C.ghost}`,
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
              e.currentTarget.style.borderColor = passwordError ? C.primary : C.ghost;
            }}
          />
          {passwordError && (
            <p
              style={{
                fontSize: "12px",
                color: C.primary,
                margin: "6px 0 0 0",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {passwordError}
            </p>
          )}
        </div>

        {/* Confirm Password */}
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
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
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
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(185, 23, 47, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {loading ? "Resetting..." : "Reset Password"}
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
          Back to Sign In
        </a>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
