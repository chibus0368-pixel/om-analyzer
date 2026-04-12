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
    siteName: "DealSignals",
    title: {
      default: "DealSignals - Commercial Real Estate Pre-Diligence",
      template: "%s | DealSignals",
    },
    description:
      "Pre-diligence engine for commercial real estate. Upload an OM and get a scored deal brief in under 60 seconds.",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "DealSignals - Commercial Real Estate Pre-Diligence",
      template: "%s | DealSignals",
    },
    description: "Pre-diligence engine for commercial real estate. Upload an OM and get a scored deal brief in under 60 seconds.",
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
