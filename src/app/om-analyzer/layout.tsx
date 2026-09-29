import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScoreOM - Commercial Real Estate Pre-Diligence in Seconds",
  description: "Upload an Offering Memorandum and see under the hood in about 60 seconds: extracted financials, rent roll, risk flags and a 100-point score you can share. A fast first pass, not a replacement for underwriting.",
  openGraph: {
    title: "ScoreOM - Instantly analyze on-market CRE deals.",
    description: "Upload an OM and get a scored deal brief instantly. Extracted financials, risk signals, and investment insights for CRE investors.",
    url: "https://www.scoreom.com",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ScoreOM - Instantly analyze on-market CRE deals." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScoreOM - Instantly analyze on-market CRE deals.",
    description: "Upload an OM and get a scored deal brief instantly. Extracted financials, risk signals, and investment insights for CRE investors.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://www.scoreom.com",
  },
};

export default function OmAnalyzerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
