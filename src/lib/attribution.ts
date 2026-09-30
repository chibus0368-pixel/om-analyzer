/**
 * First-touch marketing attribution.
 *
 * Capture (every page load, see GoogleAnalytics.tsx): if the URL has
 * utm_source, utm_campaign or utm_content, those three plus the landing path
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
var s=cut(p.get('utm_source')),c=cut(p.get('utm_campaign')),t=cut(p.get('utm_content'));
var a=null;
if(s||c||t){a={utm_source:s,utm_campaign:c,utm_content:t,landing_path:location.pathname.slice(0,120),referrer_host:null,first_seen_at:new Date().toISOString()};}
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
