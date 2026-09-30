import Link from "next/link";
import ScoreOMNav from "@/components/ScoreOMNav";

const LIME = "#84CC16";

/* On-brand 404: the page gets a "Deal Score" of 404 and falls below criteria. */
export default function NotFound() {
  const r = 70;
  const c = 2 * Math.PI * r;
  const links: [string, string][] = [
    ["Features", "/#features"],
    ["Why ScoreOM", "/#why"],
    ["Watch the video", "/#intro-video"],
    ["FAQ", "/#faq"],
    ["Contact", "/contact"],
  ];
  return (
    <>
      <ScoreOMNav />
      <main style={{
        minHeight: "100vh", background: "#0b0b12", color: "#fff", position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 20px 72px",
        fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
      }}>
        <div aria-hidden style={{ position: "absolute", left: "50%", top: "38%", width: 900, height: 600, transform: "translate(-50%,-50%)",
          background: "radial-gradient(closest-side, rgba(132,204,22,0.16), rgba(132,204,22,0.04) 55%, transparent)", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 50% 40%, #000 25%, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, #000 25%, transparent 70%)" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, textAlign: "center" }}>
          <div style={{ position: "relative", width: 168, height: 168, margin: "0 auto 28px" }}>
            <svg viewBox="0 0 168 168" width="168" height="168" aria-hidden>
              <circle cx="84" cy="84" r={r} fill="none" stroke="rgba(248,113,113,0.16)" strokeWidth="12" />
              <circle cx="84" cy="84" r={r} fill="none" stroke="#F87171" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${c * 0.18} ${c}`} transform="rotate(-90 84 84)" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>404</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#F87171", marginTop: 6, letterSpacing: "0.02em" }}>Below criteria</div>
            </div>
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 700, color: "#e5e7eb" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: LIME, boxShadow: `0 0 10px ${LIME}` }} />
            Page not found
          </div>
          <h1 style={{ fontSize: "clamp(34px, 6vw, 54px)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.06, margin: "18px 0 16px" }}>
            This page didn&apos;t <span style={{ color: LIME }}>make the cut</span>.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: "#9ca3af", margin: "0 auto 34px", maxWidth: 440, fontFamily: "Inter, sans-serif" }}>
            The link may be old or mistyped. Everything else is right where you left it.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link prefetch={false} href="/" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 26px", borderRadius: 999,
              background: LIME, color: "#0b0b12", textDecoration: "none", fontWeight: 800, fontSize: 15,
              boxShadow: "0 0 0 6px rgba(132,204,22,0.15)",
            }}>
              Score an OM
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </Link>
            <Link prefetch={false} href="/workspace" style={{
              display: "inline-flex", alignItems: "center", padding: "14px 26px", borderRadius: 999,
              background: "rgba(255,255,255,0.06)", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 15,
              border: "1px solid rgba(255,255,255,0.16)",
            }}>
              Open my DealBoards
            </Link>
          </div>

          <div style={{ marginTop: 44, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "10px 22px", justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
            {links.map(([label, href]) => (
              <Link key={href} prefetch={false} href={href} style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", fontWeight: 600 }}>{label}</Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
