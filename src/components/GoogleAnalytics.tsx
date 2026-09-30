import Script from "next/script";
import { ATTR_CAPTURE_SCRIPT } from "@/lib/attribution";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-VG0F27LPR0";

export default function GoogleAnalytics() {
  return (
    <>
      {/* First-touch signup attribution (utm_source / ref / referrer). Tiny, no network. */}
      <Script id="so-attr" strategy="afterInteractive">{ATTR_CAPTURE_SCRIPT}</Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="lazyOnload"
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { 'stream_id': '14336734063' });
        `}
      </Script>
    </>
  );
}
