import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DealSignals - Commercial Real Estate Pre-Diligence in Seconds",
  description: "Upload an Offering Memorandum and get a scored deal brief with extracted financials, risk signals, and a buy/hold/pass recommendation in under 60 seconds.",
  openGraph: {
    title: "DealSignals - Commercial Real Estate Pre-Diligence in Seconds",
    description: "Upload an OM and get a scored deal brief instantly. Extracted financials, risk signals, and investment insights for CRE investors.",
    url: "https://www.dealsignals.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealSignals - Commercial Real Estate Pre-Diligence in Seconds",
    description: "Upload an OM and get a scored deal brief instantly. Extracted financials, risk signals, and investment insights for CRE investors.",
  },
  alternates: {
    canonical: "https://www.dealsignals.app",
  },
};

export default function OmAnalyzerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
