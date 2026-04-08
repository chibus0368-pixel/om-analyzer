import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Try Pro Free - DealSignals",
  description: "See what DealSignals Pro can do. Explore two sample CRE deals with full scoring, analysis, and risk signals. No signup required.",
  openGraph: {
    title: "Try Pro Free - DealSignals",
    description: "Explore sample CRE deals with full Pro scoring, analysis, and risk signals.",
    url: "https://www.dealsignals.app/try-pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "Try Pro Free - DealSignals",
    description: "Explore sample CRE deals with full Pro scoring, analysis, and risk signals.",
  },
};

export default function TryProLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
