"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics, page views only.
 *
 * Privacy rules (see /privacy):
 *  - Only default page-view events are sent. Custom events are dropped, and
 *    nothing here ever reads uploaded documents or deal data.
 *  - Query strings are stripped except utm_* campaign tags, so emails,
 *    tokens or share codes in links (e.g. /unsubscribe?email=...) never leave.
 *  - Hash fragments are dropped.
 *  - Record IDs in deal, project and share URLs are replaced with [id], so a
 *    page view can't be tied to a specific property or shared board.
 */
const ID_SEGMENTS: [RegExp, string][] = [
  [/^\/workspace\/properties\/[^/]+/, "/workspace/properties/[id]"],
  [/^\/workspace\/projects\/[^/]+/, "/workspace/projects/[id]"],
  [/^\/share\/[^/]+/, "/share/[id]"],
  [/^\/p\/[^/]+/, "/p/[id]"],
];

function scrub(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const u = new URL(event.url);
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (k.toLowerCase().startsWith("utm_")) kept.append(k, v);
    });
    let path = u.pathname;
    for (const [re, rep] of ID_SEGMENTS) {
      if (re.test(path)) { path = path.replace(re, rep); break; }
    }
    const qs = kept.toString();
    return { ...event, url: `${u.origin}${path}${qs ? `?${qs}` : ""}` };
  } catch {
    return null;
  }
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={scrub} />;
}
