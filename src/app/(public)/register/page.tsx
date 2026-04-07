"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  registerWithEmail,
  loginWithGoogle,
  sendVerificationEmail,
  updateFirebaseDisplayName,
} from "@/lib/auth/providers";
import { mapAuthError } from "@/lib/auth/errors";
import type { UserRole } from "@/lib/types/user";

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

const ROLES: { value: UserRole; label: string }[] = [
  { value: "broker", label: "Broker" },
  { value: "investor", label: "Investor" },
  { value: "analyst", label: "Analyst" },
  { value: "lender", label: "Lender" },
  { value: "operator", label: "Operator" },
  { value: "other", label: "Other" },
];

export default function RegisterPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const validatePassword = (pwd: string) => {
    if (pwd.length < 10) {
      setPasswordError("Password must be at least 10 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validatePassword(password)) {
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreeTerms) {
      setError("You must accept the terms and privacy policy");
      return;
    }

    setLoading(true);

    try {
      // 1. Create auth account
      const credential = await registerWithEmail(email, password);
      const token = await credential.user.getIdToken();

      // 2. Update display name
      const fullName = `${firstName} ${lastName}`.trim();
      await updateFirebaseDisplayName(fullName);

      // 3. Send verification email
      await sendVerificationEmail();

      // 4. Bootstrap user in Firestore with profile data
      // Include anonId to merge anonymous usage into new account
      const anonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          company: company || undefined,
          role: role || undefined,
          anonId: anonId || undefined,
        }),
      });

      if (!bootstrapRes.ok) {
        throw new Error("Failed to initialize user profile");
      }

      // Clear anonymous trial ID after merge
      if (anonId) localStorage.removeItem("nnn_anon_id");

      // 5. Redirect to email verification page
      router.push("/verify-email");
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError("");
    setGoogleLoading(true);

    if (!agreeTerms) {
      setError("You must accept the terms and privacy policy");
      setGoogleLoading(false);
      return;
    }

    try {
      const credential = await loginWithGoogle();
      const token = await credential.user.getIdToken();

      // Send verification email
      await sendVerificationEmail();

      // Bootstrap user in Firestore (merge anonymous usage)
      const gAnonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company: company || undefined,
          role: role || undefined,
          anonId: gAnonId || undefined,
        }),
      });

      if (!bootstrapRes.ok) {
        throw new Error("Failed to initialize user profile");
      }

      if (gAnonId) localStorage.removeItem("nnn_anon_id");

      // Redirect to email verification page
      router.push("/verify-email");
    } catch (err) {
      setError(mapAuthError(err));
      setGoogleLoading(false);
    }
  };

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

      {/* Form Title */}
      <h2
        style={{
          fontSize: "20px",
          fontWeight: "600",
          color: C.onSurface,
          margin: "0 0 24px 0",
          textAlign: "center",
          fontFamily: "Playfair Display, serif",
        }}
      >
        Create Your Account
      </h2>

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

      {/* Email/Password Form */}
      <form onSubmit={handleEmailRegister}>
        {/* First + Last Name (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
          <div>
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
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
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
          <div>
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
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
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
        </div>

        {/* Email Address */}
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

        {/* Password + Confirm (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
          <div>
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
              Password
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
              placeholder="Min 10 characters"
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
          <div>
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
              placeholder="Confirm password"
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
        </div>

        {/* Company + Role (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" }}>
          <div>
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
              Company <span style={{ color: C.secondary, fontWeight: "400" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Capital"
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
          <div>
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
              Role <span style={{ color: C.secondary, fontWeight: "400" }}>(optional)</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole | "")}
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
                cursor: "pointer",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = C.primary;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = C.ghost;
              }}
            >
              <option value="">Select a role...</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Terms Checkbox */}
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              fontSize: "13px",
              color: C.onSurface,
              fontFamily: "Inter, sans-serif",
              cursor: "pointer",
              gap: "10px",
            }}
          >
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              style={{
                marginTop: "3px",
                cursor: "pointer",
                accentColor: C.primary,
              }}
            />
            <span>
              I agree to the{" "}
              <a
                href="/terms"
                style={{
                  color: C.primary,
                  textDecoration: "none",
                  fontWeight: "600",
                }}
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                style={{
                  color: C.primary,
                  textDecoration: "none",
                  fontWeight: "600",
                }}
              >
                Privacy Policy
              </a>
            </span>
          </label>
        </div>

        {/* Sign Up Button */}
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
          {loading ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "24px 0",
        }}
      >
        <div
          style={{
            flex: 1,
            height: "1px",
            backgroundColor: C.ghost,
          }}
        />
        <span
          style={{
            padding: "0 12px",
            fontSize: "13px",
            color: C.secondary,
            fontFamily: "Inter, sans-serif",
          }}
        >
          or
        </span>
        <div
          style={{
            flex: 1,
            height: "1px",
            backgroundColor: C.ghost,
          }}
        />
      </div>

      {/* Google Sign Up Button */}
      <button
        onClick={handleGoogleRegister}
        disabled={googleLoading}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: "14px",
          fontWeight: "600",
          color: C.onSurface,
          backgroundColor: C.surfLow,
          border: `1px solid ${C.ghost}`,
          borderRadius: `${C.radius}px`,
          cursor: googleLoading ? "not-allowed" : "pointer",
          transition: "all 0.3s",
          fontFamily: "Inter, sans-serif",
          opacity: googleLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!googleLoading) {
            e.currentTarget.style.backgroundColor = "#e8e8ff";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = C.surfLow;
        }}
      >
        {googleLoading ? "Creating Account..." : "Sign Up with Google"}
      </button>

      {/* Link to Login */}
      <div
        style={{
          marginTop: "24px",
          textAlign: "center",
          fontSize: "13px",
          fontFamily: "Inter, sans-serif",
          color: C.secondary,
        }}
      >
        Already have an account?{" "}
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
