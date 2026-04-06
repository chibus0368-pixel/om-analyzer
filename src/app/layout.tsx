import type { Metadata } from "next";
import "@/styles/globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import Providers from "./Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://dealsignals.app"),
  title: {
    default: "Deal Signals - OM Analyzer & CRE DealBoard",
    template: "%s | Deal Signals",
  },
  description:
    "AI-powered OM analysis and deal management platform for commercial real estate investors.",
  alternates: {
    canonical: "https://dealsignals.app",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://dealsignals.app",
    siteName: "Deal Signals",
    title: {
      default: "Deal Signals - OM Analyzer & CRE DealBoard",
      template: "%s | Deal Signals",
    },
    description:
      "AI-powered OM analysis and deal management platform for commercial real estate investors.",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Deal Signals - OM Analyzer & CRE DealBoard",
      template: "%s | Deal Signals",
    },
    description: "AI-powered OM analysis and CRE deal platform.",
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
      <body>
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
