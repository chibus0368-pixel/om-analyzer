"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function WorkspaceLoginPage() {
  const { signIn, user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    router.push("/workspace");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signIn(email, password);
      }
      router.push("/workspace");
    } catch (err: any) {
      setError(err?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0B1120 0%, #162036 50%, #253352 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 16,
        padding: 40,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, background: "linear-gradient(135deg, #C49A3C, #D4B255)",
            borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 18, color: "#fff", marginBottom: 16,
          }}>N3</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B1120", margin: 0 }}>OM Analyzer</h1>
          <p style={{ fontSize: 14, color: "#5A7091", marginTop: 6 }}>
            {mode === "login" ? "Sign in to your workspace" : "Create your account"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#253352", marginBottom: 6 }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                style={{
                  width: "100%", padding: "10px 14px", border: "1.5px solid #D8DFE9",
                  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#253352", marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: "100%", padding: "10px 14px", border: "1.5px solid #D8DFE9",
                borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#253352", marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
              style={{
                width: "100%", padding: "10px 14px", border: "1.5px solid #D8DFE9",
                borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{ background: "#FDE8EA", color: "#C52D3A", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="ws-btn-gold"
            style={{
              width: "100%", padding: "12px 0", background: "#C49A3C", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
              marginTop: 4,
            }}
          >
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Toggle */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#5A7091" }}>
          {mode === "login" ? (
            <>
              No account?{" "}
              <button onClick={() => { setMode("register"); setError(""); }} style={{ background: "none", border: "none", color: "#C49A3C", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: "#C49A3C", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
