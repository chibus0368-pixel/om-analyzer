"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginWithEmail, loginWithGoogle } from "@/lib/auth/providers";
import { mapAuthError } from "@/lib/auth/errors";

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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/workspace";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await loginWithEmail(email, password);
      const token = await credential.user.getIdToken();

      // Bootstrap user in Firestore (merge anonymous usage)
      const anonId1 = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anonId: anonId1 || undefined }),
      });

      if (!bootstrapRes.ok) {
        throw new Error("Failed to initialize user");
      }

      if (anonId1) localStorage.removeItem("nnn_anon_id");
      router.push(redirectUrl);
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const credential = await loginWithGoogle();
      const token = await credential.user.getIdToken();

      // Bootstrap user in Firestore (merge anonymous usage)
      const anonId2 = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anonId: anonId2 || undefined }),
      });

      if (!bootstrapRes.ok) {
        throw new Error("Failed to initialize user");
      }

      if (anonId2) localStorage.removeItem("nnn_anon_id");
      router.push(redirectUrl);
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg width={160} height={42} viewBox="0 0 420 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="70" width="12" height="30" rx="1.5" fill="#84CC16" />
          <rect x="38" y="55" width="12" height="45" rx="1.5" fill="#84CC16" />
          <rect x="56" y="40" width="12" height="60" rx="1.5" fill="#84CC16" />
          <rect x="74" y="25" width="12" height="75" rx="1.5" fill="#84CC16" />
          <circle cx="80" cy="18" r="6" fill="#84CC16" />
          <path d="M15 105 Q60 95 105 105" stroke="#84CC16" strokeWidth="2" fill="none" />
          <text x="120" y="72" fontFamily="Plus Jakarta Sans, Inter, sans-serif" fontSize="38" fontWeight="700" fill="#84CC16">Deal</text>
          <text x="210" y="72" fontFamily="Plus Jakarta Sans, Inter, sans-serif" fontSize="38" fontWeight="700" fill="#1E293B">Signals</text>
        </svg>
        <p
          style={{
            fontSize: "14px",
            color: C.secondary,
            margin: "0",
            fontFamily: "Inter, sans-serif",
          }}
        >
          CRE Intelligence &amp; Analytics
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
        Sign In
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
      <form onSubmit={handleEmailLogin}>
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
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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

        {/* Sign In Button */}
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
          {loading ? "Signing in..." : "Sign In"}
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

      {/* Google Sign In Button */}
      <button
        onClick={handleGoogleLogin}
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
        {googleLoading ? "Connecting..." : "Continue with Google"}
      </button>

      {/* Links */}
      <div
        style={{
          marginTop: "24px",
          textAlign: "center",
          fontSize: "13px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <p style={{ margin: "0 0 8px 0", color: C.secondary }}>
          Don't have an account?{" "}
          <a
            href="/register"
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
            Sign Up
          </a>
        </p>
        <p style={{ margin: "0", color: C.secondary }}>
          <a
            href="/forgot-password"
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
            Forgot Password?
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
