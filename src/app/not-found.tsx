import Link from "next/link";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";

export default function NotFound() {
  return (
    <>
      <div style={{ background: "linear-gradient(135deg, #0F1729 0%, #1B2B4B 50%, #0F1729 100%)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 24px 64px", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 520, textAlign: "center" as const, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "clamp(100px, 18vw, 160px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-4px", background: "linear-gradient(135deg, #EF4444 0%, #F59E0B 50%, #EF4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>
            404
          </div>

          <h1 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>
            Page not found
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", maxWidth: 400, margin: "0 auto 40px" }}>
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px",
              background: "#EF4444", color: "#fff",
              textDecoration: "none", borderRadius: 8,
              fontWeight: 700, fontSize: 15,
            }}>
              OM Analyzer
            </Link>
            <Link href="/workspace" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px",
              background: "rgba(255,255,255,0.1)", color: "#fff",
              textDecoration: "none", borderRadius: 8,
              fontWeight: 700, fontSize: 15,
              border: "1px solid rgba(255,255,255,0.2)",
            }}>
              DealBoard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
