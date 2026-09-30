import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
