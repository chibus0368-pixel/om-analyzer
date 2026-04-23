"use client";

/**
 * DemographicsToggle
 *
 * Compact pill-style switch that turns the DemographicsOverlay on or off.
 * Designed to drop into a map header next to other "Map / List" style
 * toggles. Uses DealSignals tokens (Inter, navy 950, gold accents).
 *
 * The off state is intentionally subdued (light cream background, muted
 * text) so it doesn't compete with the rest of the chrome. The on state
 * lights up with the gold accent so users can see at a glance that an
 * extra data layer is active.
 */
interface DemographicsToggleProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** Disable the control (e.g., no property selected yet). */
  disabled?: boolean;
  /** Compact label shown next to the switch. Defaults to "Demographics". */
  label?: string;
}

export default function DemographicsToggle({
  enabled,
  onToggle,
  disabled,
  label = "Demographics",
}: DemographicsToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle(!enabled)}
      disabled={disabled}
      aria-pressed={enabled}
      title={
        disabled
          ? "Select a property to enable demographics"
          : enabled
            ? "Hide Census ACS demographics layer"
            : "Show Census ACS demographics for the selected property"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px 6px 8px",
        background: enabled ? "#0F172A" : "#C49A3C",
        color: enabled ? "#FFFFFF" : disabled ? "#7C6B3F" : "#1F2937",
        border: enabled ? "1px solid #0F172A" : "1px solid #A17A2B",
        borderRadius: 999,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: enabled
          ? "0 2px 6px rgba(15,23,43,0.18)"
          : "0 2px 6px rgba(164,122,43,0.35), 0 0 0 1px rgba(255,255,255,0.6) inset",
        transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
        whiteSpace: "nowrap",
      }}
    >
      {/* Switch track */}
      <span
        aria-hidden
        style={{
          position: "relative",
          width: 26,
          height: 14,
          borderRadius: 999,
          background: enabled ? "#D4B255" : "rgba(15,23,43,0.25)",
          transition: "background 0.15s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 14 : 2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#FFFFFF",
            boxShadow: "0 1px 2px rgba(15,23,43,0.3)",
            transition: "left 0.15s ease",
          }}
        />
      </span>
      {label}
    </button>
  );
}
