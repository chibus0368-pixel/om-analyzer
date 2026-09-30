/**
 * First-touch signup attribution.
 *
 * The capture script in GoogleAnalytics.tsx stores the first landing that
 * carried a tag (utm_source / ref / external referrer) in localStorage under
 * ATTR_KEY. The signup flows read it with getAttribution() and send it to
 * /api/auth/bootstrap, which saves it on the user doc once and never
 * overwrites it.
 *
 * Tag links like: https://scoreom.com/?utm_source=biggerpockets&utm_campaign=forum-post
 * or the short form:  https://scoreom.com/?ref=crexi-group
 */
export const ATTR_KEY = "so_attr";

export interface Attribution {
  source: string;       // utm_source, ref, or referrer host
  medium?: string;
  campaign?: string;
  content?: string;
  referrer?: string;    // external referrer host, if any
  landingPath?: string;
  firstSeenAt?: string; // ISO
}

/** Inline script body (runs on every page, no dependencies). */
export const ATTR_CAPTURE_SCRIPT = `(function(){try{
var K='${ATTR_KEY}';var p=new URLSearchParams(location.search);
var src=p.get('utm_source')||p.get('ref')||p.get('source');
var rh='';try{if(document.referrer){var h=new URL(document.referrer).hostname.replace(/^www\\./,'');if(h&&h.indexOf('scoreom.com')<0&&h.indexOf('dealsignals')<0)rh=h;}}catch(e){}
if(!src&&!rh)return;
var cur=null;try{cur=JSON.parse(localStorage.getItem(K)||'null');}catch(e){}
if(cur&&cur.source&&!(src&&cur.fromReferrer))return;
var cut=function(v){return v?String(v).slice(0,80):undefined;};
localStorage.setItem(K,JSON.stringify({source:cut((src||rh).toLowerCase()),medium:cut(p.get('utm_medium')),campaign:cut(p.get('utm_campaign')),content:cut(p.get('utm_content')),referrer:rh||undefined,landingPath:location.pathname.slice(0,120),firstSeenAt:new Date().toISOString(),fromReferrer:!src}));
}catch(e){}})();`;

export function getAttribution(): Attribution | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = window.localStorage.getItem(ATTR_KEY);
    if (!raw) return undefined;
    const a = JSON.parse(raw);
    if (!a || typeof a.source !== "string" || !a.source) return undefined;
    const { fromReferrer: _f, ...rest } = a;
    return rest as Attribution;
  } catch {
    return undefined;
  }
}
