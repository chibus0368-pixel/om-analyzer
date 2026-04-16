import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import Providers from "./Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://dealsignals.app"),
  title: {
    default: "DealSignals - Commercial Real Estate Pre-Diligence",
    template: "%s | DealSignals",
  },
  description:
    "Pre-diligence engine for commercial real estate. Upload an OM and get a scored deal brief in under 60 seconds.",
  alternates: {
    canonical: "https://dealsignals.app",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://dealsignals.app",
    siteName: "Deal Signals",
    title: {
      default: "Deal Signals - Instantly analyze on-market CRE deals.",
      template: "%s | Deal Signals",
    },
    description:
      "Deal Signals - Instantly analyze on-market CRE deals.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Deal Signals - Instantly analyze on-market CRE deals.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Deal Signals - Instantly analyze on-market CRE deals.",
      template: "%s | Deal Signals",
    },
    description: "Deal Signals - Instantly analyze on-market CRE deals.",
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
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif", margin: 0 }}>
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
