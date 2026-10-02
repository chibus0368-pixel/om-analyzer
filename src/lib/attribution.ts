/**
 * First-touch marketing attribution.
 *
 * Capture (every page load, see GoogleAnalytics.tsx): if the URL has
 * utm_source, utm_medium, utm_campaign or utm_content, those plus the landing path
 * and a timestamp go into a first-party cookie "som_attr" (90 days,
 * SameSite=Lax). With no UTMs, only the outside referrer's hostname is kept.
 * First touch wins: an existing som_attr is never overwritten. No other query
 * params, IDs or personal data are stored.
 *
 * Persist: the signup flows read it with getAttribution() and send it to
 * /api/auth/bootstrap, which saves it on the new user record once.
 *
 * Tag links like: https://www.scoreom.com/?utm_source=biggerpockets&utm_campaign=forum&utm_content=A
 */
export const ATTR_COOKIE = "som_attr";

export interface Attribution {
  utm_source: string | null;
  utm_medium?: string | null; // added Oct 2026; older cookies and records don't have it
  utm_campaign: string | null;
  utm_content: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  first_seen_at: string | null; // ISO
}

/** Inline script body (runs on every page, no dependencies, no network). */
export const ATTR_CAPTURE_SCRIPT = `(function(){try{
var K='${ATTR_COOKIE}';
if(document.cookie.split('; ').some(function(c){return c.indexOf(K+'=')===0;}))return;
var p=new URLSearchParams(location.search);
var cut=function(v){return v?String(v).trim().slice(0,80):null;};
var s=cut(p.get('utm_source')),m=cut(p.get('utm_medium')),c=cut(p.get('utm_campaign')),t=cut(p.get('utm_content'));
var a=null;
if(s||m||c||t){a={utm_source:s,utm_medium:m,utm_campaign:c,utm_content:t,landing_path:location.pathname.slice(0,120),referrer_host:null,first_seen_at:new Date().toISOString()};}
else{var rh=null;try{if(document.referrer){var h=new URL(document.referrer).hostname.replace(/^www\\./,'');if(h&&h.indexOf('scoreom.com')<0&&h.indexOf('dealsignals')<0)rh=h.slice(0,100);}}catch(e){}
if(!rh)return;a={utm_source:null,utm_campaign:null,utm_content:null,landing_path:location.pathname.slice(0,120),referrer_host:rh,first_seen_at:new Date().toISOString()};}
document.cookie=K+'='+encodeURIComponent(JSON.stringify(a))+'; Max-Age=7776000; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
}catch(e){}})();`;

export function getAttribution(): Attribution | undefined {
  try {
    if (typeof document === "undefined") return undefined;
    const row = document.cookie.split("; ").find((c) => c.startsWith(`${ATTR_COOKIE}=`));
    if (!row) return undefined;
    const a = JSON.parse(decodeURIComponent(row.slice(ATTR_COOKIE.length + 1)));
    if (!a || typeof a !== "object") return undefined;
    return a as Attribution;
  } catch {
    return undefined;
  }
}

/**
 * Server-safe cleaner for an attribution object sent by the client (or read
 * from the som_attr cookie). Trims and caps every field, lowercases the source
 * and referrer host, and falls back to utm_source "direct" when nothing useful
 * is present. Used by /api/auth/bootstrap, /api/workspace/usage,
 * /api/om-analyzer/tryme-analyze and /api/om-analyzer/email-claim so signups,
 * anonymous trials and email leads are all attributed the same way.
 */
export function cleanAttribution(a: unknown): Attribution {
  const s = (v: unknown, n = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const src: Record<string, unknown> = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
  const out: Attribution = {
    utm_source: s(src.utm_source)?.toLowerCase() ?? null,
    utm_medium: s(src.utm_medium)?.toLowerCase() ?? null,
    utm_campaign: s(src.utm_campaign),
    utm_content: s(src.utm_content),
    landing_path: s(src.landing_path, 120),
    referrer_host: s(src.referrer_host, 100)?.toLowerCase() ?? null,
    first_seen_at: s(src.first_seen_at, 40),
  };
  // No cookie (or nothing useful in it) = direct.
  if (!out.utm_source && !out.utm_medium && !out.utm_campaign && !out.utm_content && !out.referrer_host) out.utm_source = "direct";
  return out;
}

/** Parse the som_attr first-touch cookie out of a raw Cookie request header. */
export function readAttributionCookie(cookieHeader: string | null | undefined): unknown {
  try {
    if (!cookieHeader) return undefined;
    const row = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${ATTR_COOKIE}=`));
    if (!row) return undefined;
    const a = JSON.parse(decodeURIComponent(row.slice(ATTR_COOKIE.length + 1)));
    return a && typeof a === "object" ? a : undefined;
  } catch {
    return undefined;
  }
}
