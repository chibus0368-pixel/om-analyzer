import Link from "next/link";
import DealSignalLogo from "./DealSignalLogo";

/**
 * Deal Signals branded footer — used on om-analyzer and related pages
 * (terms, privacy, contact/support)
 */
export default function DealSignalFooter() {
  return (
    <footer style={{
      padding: "28px 40px", borderTop: "1px solid #EDF0F5",
      maxWidth: 1280, margin: "0 auto",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <DealSignalLogo size={22} fontSize={13} gap={7} />
      <div style={{ display: "flex", gap: 24 }}>
        {[
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Support", href: "mailto:support@dealsignals.app" },
        ].map(link => (
          <Link key={link.label} href={link.href} style={{
            fontSize: 11, fontWeight: 500, color: "#585e70", textDecoration: "none",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>{link.label}</Link>
        ))}
      </div>
      <span style={{ fontSize: 10, color: "#B4C1D1" }}>
        &copy; 2026 DealSignals
      </span>
    </footer>
  );
}
