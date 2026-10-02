/**
 * Pure grouping helpers for the `trials` block of /api/bot/usage: anonymous
 * trial visitors and email-only leads, grouped by first-touch source. No
 * Firebase imports here so it can be unit tested. Counts only: never uids,
 * emails or names.
 */

export interface TrialSource {
  utm_source: string;
  utm_campaign: string | null;
  utm_content: string | null;
}

/** Same source rule as loadMembers: utm_source, else "referral" / "direct"; no attribution at all = "untracked". */
export function trialSource(attribution: any): TrialSource {
  const at = attribution && typeof attribution === "object" ? attribution : null;
  if (!at) return { utm_source: "untracked", utm_campaign: null, utm_content: null };
  const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    utm_source: str(at.utm_source)?.toLowerCase() || (str(at.referrer_host) ? "referral" : "direct"),
    utm_campaign: str(at.utm_campaign),
    utm_content: str(at.utm_content),
  };
}

const isTest = (s: string) => s.trim().toLowerCase() === "test";

export interface AnonUserRow { attribution?: any; uploads: number }
export interface AnonUserGroup extends TrialSource { users: number; users_with_1plus_upload: number }

/** Anonymous trial users by source. utm_source=test is dropped. Sorted by users, descending. */
export function groupAnonymousUsers(rows: AnonUserRow[]): AnonUserGroup[] {
  const map = new Map<string, AnonUserGroup>();
  for (const r of rows) {
    const s = trialSource(r.attribution);
    if (isTest(s.utm_source)) continue;
    const k = `${s.utm_source}|${s.utm_campaign || ""}|${s.utm_content || ""}`;
    if (!map.has(k)) map.set(k, { ...s, users: 0, users_with_1plus_upload: 0 });
    const g = map.get(k)!;
    g.users++;
    if (r.uploads > 0) g.users_with_1plus_upload++;
  }
  return [...map.values()].sort((a, b) => b.users - a.users || a.utm_source.localeCompare(b.utm_source));
}

export interface LeadRow { attribution?: any }
export interface LeadGroup extends TrialSource { leads: number }

/** Email-only leads by source. utm_source=test is dropped. Sorted by leads, descending. */
export function groupEmailLeads(rows: LeadRow[]): LeadGroup[] {
  const map = new Map<string, LeadGroup>();
  for (const r of rows) {
    const s = trialSource(r.attribution);
    if (isTest(s.utm_source)) continue;
    const k = `${s.utm_source}|${s.utm_campaign || ""}|${s.utm_content || ""}`;
    if (!map.has(k)) map.set(k, { ...s, leads: 0 });
    map.get(k)!.leads++;
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads || a.utm_source.localeCompare(b.utm_source));
}

export interface SavePromptRow { attribution?: any; shown: boolean; dismissed: boolean; signedUp: boolean }
export interface SavePromptGroup { utm_source: string; shown: number; dismissed: number; signups_from_prompt: number }

/**
 * "Save this deal" card funnel by first-touch utm_source. One row per user the
 * card was shown to. utm_source=test is dropped. Counts only.
 */
export function groupSavePrompt(rows: SavePromptRow[]): { totals: Omit<SavePromptGroup, "utm_source">; by_utm_source: SavePromptGroup[] } {
  const map = new Map<string, SavePromptGroup>();
  const totals = { shown: 0, dismissed: 0, signups_from_prompt: 0 };
  for (const r of rows) {
    if (!r.shown) continue;
    const src = trialSource(r.attribution).utm_source;
    if (isTest(src)) continue;
    if (!map.has(src)) map.set(src, { utm_source: src, shown: 0, dismissed: 0, signups_from_prompt: 0 });
    const g = map.get(src)!;
    g.shown++; totals.shown++;
    if (r.dismissed) { g.dismissed++; totals.dismissed++; }
    if (r.signedUp) { g.signups_from_prompt++; totals.signups_from_prompt++; }
  }
  return { totals, by_utm_source: [...map.values()].sort((a, b) => b.shown - a.shown || a.utm_source.localeCompare(b.utm_source)) };
}
