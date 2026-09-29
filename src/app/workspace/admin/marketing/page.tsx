"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import Overview from "@/components/admin/marketing/Overview";
import Contacts from "@/components/admin/marketing/Contacts";
import Broadcasts from "@/components/admin/marketing/Broadcasts";
import Drips from "@/components/admin/marketing/Drips";
import Social from "@/components/admin/marketing/Social";

type Tab = "overview" | "contacts" | "broadcasts" | "drips" | "social";
const TABS: [Tab, string][] = [["overview", "Overview"], ["broadcasts", "Email broadcasts"], ["drips", "Drips"], ["social", "Social"], ["contacts", "Contacts"]];

function Inner() {
  const { user, isAdmin, loading } = useAuth();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "overview");
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [origin, setOrigin] = useState("https://www.scoreom.com");

  useEffect(() => {
    setOrigin(window.location.origin.includes("localhost") ? "https://www.scoreom.com" : window.location.origin);
    const c = sp.get("connected"); const e = sp.get("error");
    if (c) setFlash({ tone: "ok", text: `${c === "x" ? "X" : c === "instagram" ? "Instagram" : "TikTok"} connected.` });
    if (e) setFlash({ tone: "error", text: `Couldn't connect: ${e}` });
    if (c || e) window.history.replaceState(null, "", "/workspace/admin/marketing?tab=social");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (t: Tab) => { setTab(t); window.history.replaceState(null, "", `/workspace/admin/marketing?tab=${t}`); };

  if (loading) return <div style={{ padding: 40, color: "#9CA3AF" }}>Loading...</div>;
  if (!user || !isAdmin) return <div style={{ padding: 40 }}><h2 style={{ fontSize: 20, fontWeight: 700 }}>Admin Access Required</h2></div>;

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: 1280, margin: "0 auto", fontFamily: "inherit" }} className="mk-root">
      <style>{`
        @media (max-width: 1000px) { .mk-split { grid-template-columns: 1fr !important; } .mk-root { padding: 20px 14px 40px !important; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <Link href="/workspace/admin" prefetch={false} style={{ fontSize: 12, color: "#6B7280", textDecoration: "none", fontWeight: 600 }}>&larr; Admin Console</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 4px", color: "#111827", letterSpacing: -0.5 }}>Marketing</h1>
          <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Email your users and leads, run automated drips, and publish to X, Instagram and TikTok.</p>
        </div>
      </div>
      <div style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 8, padding: 2, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => go(k)} style={{
            padding: "7px 16px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            background: tab === k ? "#fff" : "transparent", color: tab === k ? "#111827" : "#9CA3AF", boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}>{l}</button>
        ))}
      </div>
      {tab === "overview" && <Overview redirectBase={`${origin}/api/marketing/social/callback`} />}
      {tab === "contacts" && <Contacts />}
      {tab === "broadcasts" && <Broadcasts />}
      {tab === "drips" && <Drips />}
      {tab === "social" && <Social flash={flash} />}
    </div>
  );
}

export default function MarketingAdminPage() {
  return <Suspense><Inner /></Suspense>;
}
