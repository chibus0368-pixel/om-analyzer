"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DealSignalLogo from "./DealSignalLogo";

/**
 * Deal Signals shared marketing nav — used on all public pages.
 * Detects signed-in users and shows "Open App" instead of login/signup.
 */
export default function DealSignalNav() {
  const pathname = usePathname();
  const [authedUser, setAuthedUser] = useState<{ displayName: string | null; email: string | null } | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { getAuth, onAuthStateChanged } = await import("firebase/auth");
        const auth = getAuth();
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) {
            setAuthedUser({ displayName: user.displayName, email: user.email });
          } else {
            setAuthedUser(null);
          }
        });
      } catch { /* Firebase not available */ }
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "/om-analyzer";
    return pathname?.startsWith(href);
  };

  const linkStyle = (href: string): React.CSSProperties => ({
    fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "color 0.15s",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: isActive(href) ? "#b9172f" : "#9ca3af",
  });

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(13,13,20,0.8)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1160, margin: "0 auto", padding: "0 32px", height: 68,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <DealSignalLogo size={34} fontSize={20} gap={9} />
        </Link>

        <nav className="ds-nav-links" style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Link href="/#how-it-works" style={linkStyle("/#how-it-works")}>How it works</Link>
          <Link href="/#pricing" style={linkStyle("/#pricing")}>Pricing</Link>
          <Link href="/#demo" style={linkStyle("/#demo")}>Try Pro</Link>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {authedUser ? (
            <Link href="/workspace" style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, fontWeight: 600, color: "#ffffff", textDecoration: "none",
              padding: "8px 18px", borderRadius: 50, background: "#16161f",
              border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.15s",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#1e1e28"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#16161f"; }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: "50%", background: "#b9172f",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>
                {(authedUser.displayName || authedUser.email || "U")[0].toUpperCase()}
              </span>
              Open App
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          ) : (
            <>
              <Link href="/workspace/login" style={{
                fontSize: 13, fontWeight: 600, color: "#9ca3af", textDecoration: "none",
                padding: "9px 22px", borderRadius: 50, border: "1px solid rgba(255,255,255,0.15)",
                transition: "all 0.15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#b9172f"; (e.currentTarget as HTMLElement).style.color = "#b9172f"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLElement).style.color = "#9ca3af"; }}
              >Sign in</Link>
              <Link href="/try-pro" style={{
                fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none",
                padding: "9px 22px", borderRadius: 50,
                background: "linear-gradient(135deg, #b9172f, #dc3545)",
                transition: "all 0.15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 0 20px rgba(185,23,47,0.3)",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(185,23,47,0.5)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(185,23,47,0.3)"; }}
              >Get Started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
