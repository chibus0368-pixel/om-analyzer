import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deal Signal — AI-Powered CRE Deal Analysis in Seconds",
  description: "Drop an Offering Memorandum and get a full Deal Signal report — scored underwriting, financial breakdown, and risk analysis in 60 seconds.",
  openGraph: {
    title: "Deal Signal — AI-Powered CRE Deal Analysis in Seconds",
    description: "Drop an OM and get a scored Deal Signal report instantly — financials, risk ratings, and investment insights.",
    url: "https://www.nnntriplenet.com/om-analyzer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deal Signal — AI-Powered CRE Deal Analysis in Seconds",
    description: "Drop an OM and get a scored Deal Signal report instantly — financials, risk ratings, and investment insights.",
  },
  alternates: {
    canonical: "https://www.nnntriplenet.com/om-analyzer",
  },
};

export default function OmAnalyzerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
