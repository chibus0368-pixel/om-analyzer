import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";
import Providers from "./Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.scoreom.com"),
  title: {
    default: "ScoreOM - Commercial Real Estate Pre-Diligence",
    template: "%s | ScoreOM",
  },
  description:
    "Pre-diligence engine for commercial real estate. Upload an OM and get a scored deal brief in under 60 seconds.",
  alternates: {
    canonical: "https://www.scoreom.com",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.scoreom.com",
    siteName: "ScoreOM",
    title: {
      default: "ScoreOM - Instantly analyze on-market CRE deals.",
      template: "%s | ScoreOM",
    },
    description:
      "ScoreOM - Instantly analyze on-market CRE deals.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ScoreOM - Instantly analyze on-market CRE deals.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "ScoreOM - Instantly analyze on-market CRE deals.",
      template: "%s | ScoreOM",
    },
    description: "ScoreOM - Instantly analyze on-market CRE deals.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Firebase Auth endpoints so the token validation
            request doesn't queue behind JS chunk downloads. Without this,
            accounts.lookup gets queued for 20-25s while Next.js page chunks
            saturate the connection pool and main thread. */}
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        {/* Preconnect to Google Fonts so the CSS + woff2 fetches (loaded
            asynchronously below via GoogleFontsLoader, plus any additional
            per-page font <link>s) don't each pay a fresh DNS/TCP/TLS round
            trip - this hurts most on high-latency mobile connections. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Self-hosted brand fonts (latin subset, variable weight). No external
            CSS request, so fonts never block first paint on mobile. */}
        <link rel="preload" href="/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: `
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:300 800;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Inter';font-style:normal;font-weight:300 900;font-display:swap;src:url(/fonts/inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
` }} />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif", margin: 0 }}>
        {/* Loads the Google Fonts stylesheets post-hydration instead of as
            a render-blocking <link rel="stylesheet"> in <head>, so a slow
            or failed fonts.googleapis.com request can never hold up first
            paint (see GoogleFontsLoader.tsx for the full rationale). */}
        <GoogleFontsLoader />
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
