"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Inner() {
  const sp = useSearchParams();
  const e = sp.get("e") || "";
  const t = sp.get("t") || "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const go = async () => {
    setState("busy");
    const r = await fetch(`/api/marketing/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`, { method: "POST" }).catch(() => null);
    setState(r?.ok ? "done" : "error");
  };
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1120", padding: 16, fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center" }}>
        <img src="/images/scoreom-logo-dark.svg" alt="ScoreOM" style={{ height: 30, margin: "0 auto 20px", display: "block" }} />
        {state === "done" ? (
          <>
            <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#0f172a" }}>You're unsubscribed</h1>
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>{e} won't get marketing emails from ScoreOM. Account emails like password resets still come through.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#0f172a" }}>Unsubscribe from ScoreOM emails?</h1>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>{e || "This link is missing an email address."}</p>
            <button onClick={go} disabled={!e || !t || state === "busy"} style={{ background: "#84CC16", color: "#0f172a", border: 0, borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              {state === "busy" ? "Working..." : "Unsubscribe"}
            </button>
            {state === "error" && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>That link didn't work. Reply to any email and we'll remove you.</p>}
          </>
        )}
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return <Suspense><Inner /></Suspense>;
}
