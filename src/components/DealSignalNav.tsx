"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DealSignalLogo from "./DealSignalLogo";

/**
 * Deal Signals shared marketing nav — matches ValidateFast header style.
 * Fixed position, translucent dark bg with blur, compact green CTA.
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
    padding: "4px 0",
    color: isActive(href) ? "#ffffff" : "#9ca3af",
  });

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      height: 64,
    }}>
      {/* Translucent background overlay with blur */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(13,13,20,0.8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }} />

      {/* Nav content — outer padding matches page sections, inner maxWidth matches content grid */}
      <div style={{ position: "relative", padding: "0 32px", height: 64 }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1100, margin: "0 auto", height: 64,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <DealSignalLogo size={28} fontSize={18} gap={8} />
        </Link>

        {/* Center nav links */}
        <div className="ds-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link href="/#how-it-works" style={linkStyle("/#how-it-works")}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive("/#how-it-works") ? "#ffffff" : "#9ca3af"; }}
          >How it works</Link>
          <Link href="/#features" style={linkStyle("/#features")}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive("/#features") ? "#ffffff" : "#9ca3af"; }}
          >Features</Link>
          <Link href="/#pricing" style={linkStyle("/#pricing")}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive("/#pricing") ? "#ffffff" : "#9ca3af"; }}
          >Pricing</Link>
          <Link href="/#faq" style={linkStyle("/#faq")}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive("/#faq") ? "#ffffff" : "#9ca3af"; }}
          >FAQ</Link>
        </div>

        {/* Right side CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {authedUser ? (
            <Link href="/workspace" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 14, fontWeight: 600, color: "#0d0d14", textDecoration: "none",
              padding: "0 14px", borderRadius: 8, background: "#c8ff00",
              height: 32, transition: "all 0.2s",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 0 20px rgba(200,255,0,0.3), 0 0 40px rgba(200,255,0,0.1)",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(200,255,0,0.5), 0 0 50px rgba(200,255,0,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(200,255,0,0.3), 0 0 40px rgba(200,255,0,0.1)"; }}
            >
              Open App
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          ) : (
            <>
              <Link href="/workspace/login" style={{
                fontSize: 14, fontWeight: 500, color: "#9ca3af", textDecoration: "none",
                transition: "color 0.15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9ca3af"; }}
              >Sign in</Link>
              <Link href="/workspace/login" style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, color: "#0d0d14", textDecoration: "none",
                padding: "0 14px", borderRadius: 8, background: "#c8ff00",
                height: 32, transition: "all 0.2s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 0 20px rgba(200,255,0,0.3), 0 0 40px rgba(200,255,0,0.1)",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(200,255,0,0.5), 0 0 50px rgba(200,255,0,0.2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(200,255,0,0.3), 0 0 40px rgba(200,255,0,0.1)"; }}
              >Get Started Free</Link>
            </>
          )}
        </div>
      </nav>
      </div>
    </header>
  );
}
