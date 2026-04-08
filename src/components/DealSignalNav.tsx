"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DealSignalLogo from "./DealSignalLogo";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works", sectionId: "how-it-works" },
  { href: "/#features", label: "Features", sectionId: "features" },
  { href: "/#pricing", label: "Pricing", sectionId: "pricing" },
  { href: "/#faq", label: "FAQ", sectionId: "faq" },
];

export default function DealSignalNav() {
  const pathname = usePathname();
  const [authedUser, setAuthedUser] = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");

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

  // Track which section is in view via IntersectionObserver
  useEffect(() => {
    if (pathname !== "/" && pathname !== "/om-analyzer") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible section
        let best: string = "";
        let bestRatio = 0;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            best = entry.target.id;
            bestRatio = entry.intersectionRatio;
          }
        });
        if (best) setActiveSection(best);
      },
      { rootMargin: "-80px 0px -40% 0px", threshold: [0, 0.25, 0.5] }
    );

    // Slight delay to let DOM render
    const timer = setTimeout(() => {
      NAV_LINKS.forEach(({ sectionId }) => {
        const el = document.getElementById(sectionId);
        if (el) observer.observe(el);
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  const isOnLanding = pathname === "/" || pathname === "/om-analyzer";

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

      {/* Nav content */}
      <div style={{ position: "relative", padding: "0 32px", height: 64 }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1100, margin: "0 auto", height: 64,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <DealSignalLogo size={48} fontSize={18} gap={8} />
        </Link>

        {/* Center nav links */}
        <div className="ds-nav-links" style={{ display: "flex", alignItems: "center", gap: 32, height: 64 }}>
          {NAV_LINKS.map(({ href, label, sectionId }) => {
            const isActive = isOnLanding && activeSection === sectionId;
            return (
              <Link
                key={sectionId}
                href={href}
                className="ds-nav-link"
                style={{
                  fontSize: 14, fontWeight: 600, textDecoration: "none",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: isActive ? "#84CC16" : "#e0e0e6",
                  position: "relative",
                  height: 64, display: "inline-flex", alignItems: "center",
                  transition: "color 0.2s",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "#84CC16";
                  const line = el.querySelector(".nav-underline") as HTMLElement;
                  if (line) { line.style.transform = "scaleX(1)"; line.style.opacity = "1"; }
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  const stillActive = isOnLanding && activeSection === sectionId;
                  el.style.color = stillActive ? "#84CC16" : "#e0e0e6";
                  const line = el.querySelector(".nav-underline") as HTMLElement;
                  if (line && !stillActive) { line.style.transform = "scaleX(0)"; line.style.opacity = "0"; }
                }}
              >
                {label}
                {/* Underline */}
                <span
                  className="nav-underline"
                  style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                    background: "#84CC16", borderRadius: 1,
                    transform: isActive ? "scaleX(1)" : "scaleX(0)",
                    opacity: isActive ? 1 : 0,
                    transition: "transform 0.2s ease, opacity 0.2s ease",
                    transformOrigin: "center",
                  }}
                />
              </Link>
            );
          })}
        </div>

        {/* Right side CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {authedUser ? (
            <Link href="/workspace" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 14, fontWeight: 600, color: "#0d0d14", textDecoration: "none",
              padding: "0 14px", borderRadius: 8, background: "#84CC16",
              height: 32, transition: "all 0.2s",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 0 20px rgba(132,204,22,0.3), 0 0 40px rgba(132,204,22,0.1)",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(132,204,22,0.5), 0 0 50px rgba(132,204,22,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(132,204,22,0.3), 0 0 40px rgba(132,204,22,0.1)"; }}
            >
              Open App
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          ) : (
            <>
              <Link href="/workspace/login" style={{
                fontSize: 14, fontWeight: 600, color: "#e0e0e6", textDecoration: "none",
                transition: "color 0.15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#84CC16"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#e0e0e6"; }}
              >Sign in</Link>
              <Link href="/workspace/login" style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, color: "#0d0d14", textDecoration: "none",
                padding: "0 14px", borderRadius: 8, background: "#84CC16",
                height: 32, transition: "all 0.2s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 0 20px rgba(132,204,22,0.3), 0 0 40px rgba(132,204,22,0.1)",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 25px rgba(132,204,22,0.5), 0 0 50px rgba(132,204,22,0.2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(132,204,22,0.3), 0 0 40px rgba(132,204,22,0.1)"; }}
              >Get Started Free</Link>
            </>
          )}
        </div>
      </nav>
      </div>
    </header>
  );
}
