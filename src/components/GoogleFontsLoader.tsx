"use client";

import { useEffect } from "react";

const FONT_HREFS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0",
];

// Loads the Google Fonts stylesheets AFTER hydration instead of as a
// render-blocking <link rel="stylesheet"> in <head>.
//
// A stall fetching fonts.googleapis.com (slow/flaky mobile network, or the
// intermittent connection resets/TLS errors we've measured against
// dealsignals.app - roughly 1 in 12 requests hard-timeout or reset,
// something we don't see against control domains) could previously hold up
// first paint entirely, producing a full blank white screen on mobile until
// that request finished or timed out.
//
// With the stylesheet fetch deferred to a client-side effect, the page can
// paint immediately with the system-font fallback ('Inter', sans-serif set
// in body style) and swap to the webfont once it loads, so a slow/failed
// font fetch never blocks the page from showing up.
export default function GoogleFontsLoader() {
  useEffect(() => {
    FONT_HREFS.forEach((href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  }, []);

  return null;
}
