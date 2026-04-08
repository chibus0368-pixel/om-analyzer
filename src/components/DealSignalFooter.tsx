import Link from "next/link";


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
      <svg width={110} height={28} viewBox="0 0 420 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="70" width="12" height="30" rx="1.5" fill="#84CC16" />
        <rect x="38" y="55" width="12" height="45" rx="1.5" fill="#84CC16" />
        <rect x="56" y="40" width="12" height="60" rx="1.5" fill="#84CC16" />
        <rect x="74" y="25" width="12" height="75" rx="1.5" fill="#84CC16" />
        <circle cx="80" cy="18" r="6" fill="#84CC16" />
        <path d="M15 105 Q60 95 105 105" stroke="#84CC16" strokeWidth="2" fill="none" />
        <text x="120" y="72" fontFamily="Plus Jakarta Sans, Inter, sans-serif" fontSize="38" fontWeight="700" fill="#84CC16">Deal</text>
        <text x="210" y="72" fontFamily="Plus Jakarta Sans, Inter, sans-serif" fontSize="38" fontWeight="700" fill="#1E293B">Signals</text>
      </svg>
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
