import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OM Analyzer - Free NNN Deal Analyzer",
  description: "Drop an Offering Memorandum, get a full underwriting in 60 seconds. Free single-OM analysis from NNNTripleNet's AI-powered deal analyzer.",
  openGraph: {
    title: "OM Analyzer - Underwrite Any NNN Deal in 60 Seconds",
    description: "Drop an OM. Get a scored underwriting with cap rates, DSCR, cash-on-cash, tenant signals, and an investment recommendation. Free.",
    url: "https://www.nnntriplenet.com/om-analyzer",
  },
  twitter: {
    card: "summary_large_image",
    title: "OM Analyzer - Underwrite Any NNN Deal in 60 Seconds",
    description: "Drop an OM. Get a scored underwriting with cap rates, DSCR, cash-on-cash, tenant signals, and an investment recommendation. Free.",
  },
  alternates: {
    canonical: "https://www.nnntriplenet.com/om-analyzer",
  },
};

export default function OmAnalyzerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
