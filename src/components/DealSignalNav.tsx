import Link from "next/link";
import DealSignalLogo from "./DealSignalLogo";

/**
 * Deal Signal branded nav bar — used on om-analyzer and related pages
 * (terms, privacy, contact/support)
 */
export default function DealSignalNav() {
  return (
    <>
    {/* Inter font for Deal Signal branded pages */}
    {/* eslint-disable-next-line @next/next/no-css-tags */}
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      maxWidth: 1280, margin: "0 auto", padding: "18px 40px",
    }}>
      <Link href="/om-analyzer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <DealSignalLogo size={34} fontSize={19} gap={9} />
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <Link href="/om-analyzer#how-it-works" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>How it works</Link>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>Pricing</Link>
        <Link href="/workspace/login" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>Login</Link>
        <Link href="/try-pro" style={{
          fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none",
          background: "linear-gradient(135deg, #b9172f, #dc3545)", borderRadius: 6, padding: "8px 20px",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>Free Pro Trial</Link>
      </nav>
    </header>
    </>
  );
}
