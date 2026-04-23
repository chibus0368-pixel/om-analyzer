"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";


const NAV_LINKS = [
  { href: "/#examples", label: "Examples", sectionId: "examples" },
  { href: "/#how-it-works", label: "How it works", sectionId: "how-it-works" },
  { href: "/#pricing", label: "Pricing", sectionId: "pricing" },
  { href: "/#faq", label: "FAQ", sectionId: "faq" },
];

export default function DealSignalNav() {
  const pathname = usePathname();
  const [authedUser, setAuthedUser] = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");
  const [resultShowing, setResultShowing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Detect when lite result is showing (to hide "Get Started Free")
  useEffect(() => {
    const check = () => setResultShowing(!!document.querySelector("[data-ds-result]"));
    window.addEventListener("scroll", check, { passive: true });
    const interval = setInterval(check, 1000);
    return () => { window.removeEventListener("scroll", check); clearInterval(interval); };
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
          <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 40 }} />
        </Link>

        {/* Center nav links */}
        <div className="ds-nav-links" style={{ display: "flex", alignItems: "center", gap: 32, height: 64 }}>
          {/* "Try It" link - always visible on landing page */}
          {isOnLanding && (
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              style={{
                fontSize: 12, fontWeight: 700, color: "#0d0d14",
                background: "#84CC16", border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                height: 28, display: "inline-flex", alignItems: "center",
                padding: "0 14px", borderRadius: 6,
                letterSpacing: 0.3,
              }}
            >
              Try It
            </button>
          )}
          {NAV_LINKS.map(({ href, label, sectionId }) => {
            const isActive = isOnLanding && activeSection === sectionId;
            return (
              <Link
                key={sectionId}
                href={href}
                className="ds-nav-link"
                // On the om-analyzer page the landing sections (#examples,
                // #how-it-works, #pricing, #faq) live inside `view === "upload"`
                // and are unmounted once a deal is analyzed. A bare hash link
                // then silently no-ops. We broadcast a custom event the page
                // listens for: it flips back to the upload view first, then
                // scrolls to the section. The footer already does this; the
                // nav was the missing half.
                onClick={(e) => {
                  if (typeof window === "undefined") return;
                  const resultShowing = !!document.querySelector("[data-ds-result]");
                  if (!resultShowing) return;
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("ds-scroll-to-section", { detail: { sectionId } }));
                  // Update the URL hash so back/forward history still works.
                  if (window.location.hash !== `#${sectionId}`) {
                    window.history.replaceState(null, "", `#${sectionId}`);
                  }
                }}
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

        {/* Right side CTA - desktop */}
        <div className="ds-nav-cta" style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
              {!resultShowing && (
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
              )}
            </>
          )}
        </div>

        {/* Hamburger button - mobile only */}
        <button
          className="ds-hamburger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: "none", background: "none", border: "none", cursor: "pointer",
            padding: 6, marginLeft: "auto",
          }}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e0e0e6" strokeWidth="2" strokeLinecap="round">
            {mobileMenuOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
      </nav>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div className="ds-mobile-menu" style={{
          position: "absolute", top: 64, left: 0, right: 0,
          background: "rgba(13,13,20,0.97)", backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 24px 20px",
          display: "flex", flexDirection: "column", gap: 4,
          animation: "dsMobileSlide 0.2s ease-out",
          zIndex: 49,
        }}>
          {isOnLanding && (
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setMobileMenuOpen(false); }}
              style={{
                background: "none", border: "none", color: "#84CC16",
                fontSize: 15, fontWeight: 700, padding: "12px 0", cursor: "pointer",
                textAlign: "left", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Try It
            </button>
          )}
          {NAV_LINKS.map(({ href, label, sectionId }) => (
            <Link
              key={sectionId}
              href={href}
              onClick={(e) => {
                setMobileMenuOpen(false);
                if (typeof window === "undefined") return;
                const resultShowing = !!document.querySelector("[data-ds-result]");
                if (!resultShowing) return;
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("ds-scroll-to-section", { detail: { sectionId } }));
                if (window.location.hash !== `#${sectionId}`) {
                  window.history.replaceState(null, "", `#${sectionId}`);
                }
              }}
              style={{
                color: activeSection === sectionId ? "#84CC16" : "#e0e0e6",
                fontSize: 15, fontWeight: 600, padding: "12px 0",
                textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {label}
            </Link>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {authedUser ? (
              <Link href="/workspace" onClick={() => setMobileMenuOpen(false)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 0", background: "#84CC16", color: "#0d0d14",
                borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                Open App
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            ) : (
              <>
                <Link href="/workspace/login" onClick={() => setMobileMenuOpen(false)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "10px 0", border: "1px solid rgba(255,255,255,0.12)", color: "#e0e0e6",
                  borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Sign in
                </Link>
                <Link href="/workspace/login" onClick={() => setMobileMenuOpen(false)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "10px 0", background: "#84CC16", color: "#0d0d14",
                  borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes dsMobileSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          .ds-nav-links { display: none !important; }
          .ds-nav-cta { display: none !important; }
          .ds-hamburger { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
