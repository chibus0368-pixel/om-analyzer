/** Date-range helpers. Ranges are whole days in America/Chicago, ending now. */
export const TZ = "America/Chicago";
export const ALLOWED_DAYS = [7, 14, 30, 90] as const;

export function parseDays(v: string | null, fallback = 14): number {
  const n = Number(v);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? n : fallback;
}

/** UTC offset (ms) of America/Chicago at a given instant. */
function chicagoOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(at));
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Start of the Chicago calendar day that is (days-1) days before today, through now. */
export function chicagoRange(days: number, now = Date.now()) {
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now));
  const [y, m, d] = todayKey.split("-").map(Number);
  const startNaive = Date.UTC(y, m - 1, d - (days - 1));        // midnight "wall clock" as if UTC
  const since = startNaive - chicagoOffsetMs(startNaive);        // shift to real instant
  return { since, until: now, sinceIso: new Date(since).toISOString(), untilIso: new Date(now).toISOString() };
}

export const utcDayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
