"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendVerificationEmail } from "@/lib/auth/providers";
import { getAuth } from "firebase/auth";

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

export default function VerifyEmailPage() {
  const router = useRouter();
  const auth = getAuth();

  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Auto-check verification status on mount and periodically
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkVerification = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        setUserEmail(user.email || "");

        // Poll for verification status
        await user.reload();
        if (user.emailVerified) {
          setVerified(true);
          // Auto-redirect after a short delay
          setTimeout(() => {
            router.push("/workspace");
          }, 1000);
        }
      } catch (err) {
        console.error("Error checking verification:", err);
      }
    };

    checkVerification();

    // Check every 3 seconds
    interval = setInterval(checkVerification, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [router, auth]);

  // Cooldown timer for resend button
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cooldown]);

  const handleResendEmail = async () => {
    setError("");
    setResending(true);

    try {
      await sendVerificationEmail();
      setCooldown(60);
    } catch (err) {
      setError("Failed to resend email. Please try again.");
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setError("");
    setVerifying(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }

      // Force refresh token to get latest verification status
      await user.reload();

      if (user.emailVerified) {
        setVerified(true);
        setTimeout(() => {
          router.push("/workspace");
        }, 500);
      } else {
        setError("Email not verified yet. Please check your inbox.");
        setVerifying(false);
      }
    } catch (err) {
      setError("Error checking verification status. Please try again.");
      setVerifying(false);
    }
  };

  if (verified) {
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
            Email Verified
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#1a5d2e",
              margin: "0",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Your email has been verified. Redirecting to your workspace...
          </p>
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
          margin: "0 0 12px 0",
          textAlign: "center",
          fontFamily: "Playfair Display, serif",
        }}
      >
        Verify Your Email
      </h2>

      {/* Description */}
      <div
        style={{
          padding: "16px",
          backgroundColor: C.surfLow,
          borderRadius: `${C.radius}px`,
          marginBottom: "24px",
          textAlign: "center",
          fontSize: "14px",
          color: C.onSurface,
          fontFamily: "Inter, sans-serif",
        }}
      >
        <p style={{ margin: "0 0 8px 0" }}>
          We've sent a verification link to:
        </p>
        <p style={{ margin: "0", fontWeight: "600" }}>
          {userEmail}
        </p>
      </div>

      {/* Instructions */}
      <div style={{ marginBottom: "24px" }}>
        <p
          style={{
            fontSize: "14px",
            color: C.onSurface,
            margin: "0 0 16px 0",
            fontFamily: "Inter, sans-serif",
            lineHeight: "1.6",
          }}
        >
          Please click the verification link in your email to confirm your address. Your email will be automatically checked as soon as it's verified.
        </p>

        <ol
          style={{
            fontSize: "13px",
            color: C.secondary,
            margin: "0",
            paddingLeft: "20px",
            fontFamily: "Inter, sans-serif",
            lineHeight: "1.8",
          }}
        >
          <li>Check your inbox (and spam folder)</li>
          <li>Click the verification link</li>
          <li>Return to this page (or you'll be auto-redirected)</li>
        </ol>
      </div>

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

      {/* Check Verification Button */}
      <button
        onClick={handleCheckVerification}
        disabled={verifying}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: "14px",
          fontWeight: "600",
          color: "#ffffff",
          background: verifying ? "#999" : C.primaryGradient,
          border: "none",
          borderRadius: `${C.radius}px`,
          cursor: verifying ? "not-allowed" : "pointer",
          transition: "all 0.3s",
          fontFamily: "Inter, sans-serif",
          marginBottom: "12px",
          opacity: verifying ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!verifying) {
            e.currentTarget.style.boxShadow = "0 8px 20px rgba(132, 204, 22, 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {verifying ? "Checking..." : "I've Verified My Email"}
      </button>

      {/* Resend Email Button */}
      <button
        onClick={handleResendEmail}
        disabled={resending || cooldown > 0}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: "14px",
          fontWeight: "600",
          color: cooldown > 0 ? C.secondary : C.onSurface,
          backgroundColor: C.surfLow,
          border: `1px solid ${C.ghost}`,
          borderRadius: `${C.radius}px`,
          cursor: resending || cooldown > 0 ? "not-allowed" : "pointer",
          transition: "all 0.3s",
          fontFamily: "Inter, sans-serif",
          opacity: resending || cooldown > 0 ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!resending && cooldown === 0) {
            e.currentTarget.style.backgroundColor = "#e8e8ff";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = C.surfLow;
        }}
      >
        {cooldown > 0
          ? `Resend in ${cooldown}s`
          : resending
            ? "Sending..."
            : "Resend Verification Email"}
      </button>

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
        Having trouble?{" "}
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
