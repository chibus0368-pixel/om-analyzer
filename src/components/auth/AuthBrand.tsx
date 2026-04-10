/**
 * AuthBrand — canonical DealSignals wordmark for auth screens.
 *
 * Renders "Deal" (#0B1120) + "Signals" (#84CC16) in Plus Jakarta Sans
 * 800 weight, followed by a small tagline. Used on login, register,
 * forgot-password, reset-password, verify-email, and any other
 * unauthenticated screen so branding is pixel-consistent everywhere.
 */
export function AuthBrand({
  tagline = "CRE Intelligence & Analytics",
  size = 34,
  marginBottom = 28,
}: {
  tagline?: string;
  size?: number;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        marginBottom,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
          letterSpacing: -0.5,
          lineHeight: 1,
        }}
        aria-label="DealSignals"
      >
        <span style={{ color: "#0B1120" }}>Deal</span>
        <span style={{ color: "#84CC16" }}>Signals</span>
      </span>
      {tagline ? (
        <p
          style={{
            fontSize: 13,
            color: "#585e70",
            margin: "6px 0 0 0",
            fontFamily: "Inter, sans-serif",
            letterSpacing: 0.2,
          }}
        >
          {tagline}
        </p>
      ) : null}
    </div>
  );
}
