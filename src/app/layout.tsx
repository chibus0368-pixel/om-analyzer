import type { Metadata } from "next";
import "@/styles/globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://nnntriplenet.com"),
  title: {
    default: "NNNTripleNet - Daily Intelligence for CRE Investors",
    template: "%s | NNNTripleNet",
  },
  description:
    "The daily intelligence platform for individual commercial real estate investors. Data-driven insights, market analysis, and calculators for smarter NNN investing.",
  alternates: {
    canonical: "https://nnntriplenet.com",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nnntriplenet.com",
    siteName: "NNNTripleNet",
    title: {
      default: "NNNTripleNet - Daily Intelligence for CRE Investors",
      template: "%s | NNNTripleNet",
    },
    description:
      "The daily intelligence platform for individual commercial real estate investors. Market data, calculators, and research for NNN investing.",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "NNNTripleNet - Daily Intelligence for CRE Investors",
      template: "%s | NNNTripleNet",
    },
    description: "Daily intelligence for CRE investors.",
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
        {children}
      </body>
    </html>
  );
}
