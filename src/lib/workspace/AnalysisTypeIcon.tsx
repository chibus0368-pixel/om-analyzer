import type { AnalysisType } from "./types";

/**
 * Flat SVG icons for the five asset types. Uses Lucide/Feather-style
 * outlined paths (2px stroke, 24x24 viewBox) so they read consistently
 * at small sizes and inherit color from a single `color` prop.
 *
 * Use this everywhere instead of the emoji glyphs in ANALYSIS_TYPE_ICONS.
 */

interface Props {
  type: AnalysisType | string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AnalysisTypeIcon({ type, size = 16, color = "currentColor", className, style }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style },
  };

  switch (type) {
    case "retail":
      // Shopping bag
      return (
        <svg {...common} aria-label="Retail">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
      );
    case "industrial":
      // Factory with smokestack
      return (
        <svg {...common} aria-label="Industrial">
          <path d="M2 20V9l6 3V9l6 3V9l6 3v8z" />
          <line x1="2" y1="20" x2="22" y2="20" />
          <rect x="5" y="14" width="3" height="6" />
        </svg>
      );
    case "office":
      // Tall office building with window grid
      return (
        <svg {...common} aria-label="Office">
          <rect x="5" y="2" width="14" height="20" rx="1" />
          <path d="M9 22v-4h6v4" />
          <line x1="9" y1="6" x2="9.01" y2="6" />
          <line x1="15" y1="6" x2="15.01" y2="6" />
          <line x1="9" y1="10" x2="9.01" y2="10" />
          <line x1="15" y1="10" x2="15.01" y2="10" />
          <line x1="9" y1="14" x2="9.01" y2="14" />
          <line x1="15" y1="14" x2="15.01" y2="14" />
        </svg>
      );
    case "multifamily":
      // House with pitched roof
      return (
        <svg {...common} aria-label="Multifamily">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
      );
    case "land":
      // Map pin
      return (
        <svg {...common} aria-label="Land">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    default:
      // Generic document fallback
      return (
        <svg {...common} aria-label="Property">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

/**
 * Plain-HTML SVG string version, for contexts like server-rendered email
 * bodies where JSX isn't available. Note: some email clients (notably
 * older Outlook) strip inline <svg>. Use a colored badge + label as the
 * primary semantic; treat this icon as enhancement.
 */
export function analysisTypeIconSVG(
  type: AnalysisType | string,
  size = 14,
  color = "currentColor"
): string {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"`;
  switch (type) {
    case "retail":
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`;
    case "industrial":
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><path d="M2 20V9l6 3V9l6 3V9l6 3v8z"/><line x1="2" y1="20" x2="22" y2="20"/><rect x="5" y="14" width="3" height="6"/></svg>`;
    case "office":
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><rect x="5" y="2" width="14" height="20" rx="1"/><path d="M9 22v-4h6v4"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="9" y1="14" x2="9.01" y2="14"/><line x1="15" y1="14" x2="15.01" y2="14"/></svg>`;
    case "multifamily":
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>`;
    case "land":
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" ${common}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }
}
