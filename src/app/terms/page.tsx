import type { Metadata } from "next";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";
import DealSignalLogo from "@/components/DealSignalLogo";

export const metadata: Metadata = {
  title: "Terms of Use | Deal Signals",
  description: "Deal Signals terms of use - guidelines for using our platform, content, and tools.",
  openGraph: {
    title: "Terms of Use",
    description:
      "Deal Signals terms of use - guidelines for using our platform, content, and tools.",
  },
  twitter: {
    title: "Terms of Use",
    description:
      "Deal Signals terms of use - guidelines for using our platform, content, and tools.",
  },
};

export default function TermsPage() {
  return (
    <>
      <DealSignalNav />
      <section style={{
        background: "linear-gradient(135deg, #0B1120 0%, #151b2b 100%)",
        color: "#fff",
        padding: "64px 24px",
      }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 16 }}>
            <DealSignalLogo size={30} fontSize={15} gap={8} style={{ color: "#fff" }} />
          </div>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>Terms of Use</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>Last updated: February 2026</p>
        </div>
      </section>

      <section style={{ padding: "48px 24px", background: "var(--white)" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          {[
            {
              title: "Acceptance of Terms",
              content: "By accessing and using Deal Signals.com, you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the site. We reserve the right to modify these terms at any time; continued use constitutes acceptance of changes."
            },
            {
              title: "Not Investment Advice",
              content: "Deal Signals provides market data, educational content, and analytical tools for informational purposes only. Nothing on this site constitutes investment advice, financial advice, tax advice, or legal advice. Market data, statistics, risk scores, and analysis should not be relied upon as the sole basis for any investment decision. Always consult with qualified financial, legal, and tax professionals before making investment decisions."
            },
            {
              title: "Data Accuracy Disclaimer",
              content: "While we strive to provide accurate and up-to-date information, Deal Signals makes no warranties or representations regarding the accuracy, completeness, or timeliness of any data, analysis, or content on this site. Market data may be estimated, delayed, or sourced from third-party providers. We recommend verifying critical data points with primary sources such as CoStar, MSCI Real Capital Analytics, CBRE Research, and government agencies (FRED, BLS, SEC)."
            },
            {
              title: "No Guarantees",
              content: "Past performance data, market trends, and forward-looking statements on this site do not guarantee future results. Real estate investments involve risk, including the potential loss of principal. Cap rates, tenant credit ratings, market projections, and other metrics are subject to change without notice."
            },
            {
              title: "Intellectual Property",
              content: "All content on Deal Signals.com, including text, graphics, logos, tools, and software, is the property of Deal Signals or its content suppliers and is protected by copyright laws. You may not reproduce, distribute, or create derivative works from our content without express written permission."
            },
            {
              title: "Permitted Use",
              content: "You may use Deal Signals for personal, non-commercial research and educational purposes. You may share individual articles or pages via direct links. You may not scrape, crawl, or systematically download content from the site. You may not use our content to create competing products or services."
            },
            {
              title: "User Accounts & Subscriptions",
              content: "Subscribers agree to provide accurate email addresses and to receive communications at the frequency selected. You may unsubscribe at any time via the link in any email. We reserve the right to terminate accounts that violate these terms or engage in abusive behavior."
            },
            {
              title: "Third-Party Links",
              content: "Deal Signals may contain links to third-party websites. We are not responsible for the content, accuracy, or practices of external sites. Links do not imply endorsement."
            },
            {
              title: "Limitation of Liability",
              content: "Deal Signals and its operators shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the site, reliance on any data or analysis, or inability to access the site. This includes, without limitation, damages from investment decisions made using information from this site."
            },
            {
              title: "Governing Law",
              content: "These terms shall be governed by and construed in accordance with the laws of the State of California. Any disputes arising from these terms or your use of the site shall be subject to the exclusive jurisdiction of the courts of California."
            },
            {
              title: "Contact",
              content: "For questions about these terms, contact us at support@dealsignals.app."
            },
          ].map((section) => (
            <div key={section.title} style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 10, color: "var(--navy-950)", letterSpacing: -0.3 }}>{section.title}</h2>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--navy-700)", margin: 0 }}>{section.content}</p>
            </div>
          ))}
        </div>
      </section>
      <DealSignalFooter />
    </>
  );
}
