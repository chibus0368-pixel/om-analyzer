/**
 * Canonical score-band labels used across the property page, map
 * legend, share view, email template, and CRE Chatbot.
 *
 * Score-engine emits raw band strings ("strong_buy", "buy", "hold",
 * "pass", "strong_reject"). The display surface always uses these
 * cleaner labels - especially "Neutral" instead of "hold" and "Reject"
 * instead of "strong reject".
 */

export function scoreBandLabel(band: string | null | undefined): string {
  switch ((band || "").toLowerCase()) {
    case "strong_buy":     return "Strong Buy";
    case "buy":            return "Buy";
    case "hold":           return "Neutral";
    case "neutral":        return "Neutral";
    case "pass":           return "Pass";
    case "strong_reject":  return "Reject";
    case "reject":         return "Reject";
    default:               return band ? band : "";
  }
}
