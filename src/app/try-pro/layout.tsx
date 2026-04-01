import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Try Pro Free — Deal Signals",
  description: "See what Deal Signals Pro can do. Explore two sample CRE deals with full scoring, analysis, and risk signals — no signup required.",
  openGraph: {
    title: "Try Pro Free — Deal Signals",
    description: "Explore sample CRE deals with full Pro scoring, analysis, and risk signals.",
    url: "https://www.nnntriplenet.com/try-pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "Try Pro Free — Deal Signals",
    description: "Explore sample CRE deals with full Pro scoring, analysis, and risk signals.",
  },
};

export default function TryProLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
