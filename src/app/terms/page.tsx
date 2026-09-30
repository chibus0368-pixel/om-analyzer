import type { Metadata } from "next";
import ScoreOMNav from "@/components/ScoreOMNav";
import ScoreOMFooter from "@/components/ScoreOMFooter";

export const metadata: Metadata = {
  title: "Terms of Use | ScoreOM",
  description: "ScoreOM terms of use - guidelines for using our platform, content, and tools.",
  openGraph: {
    title: "Terms of Use",
    description:
      "ScoreOM terms of use - guidelines for using our platform, content, and tools.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ScoreOM" }],
  },
  twitter: {
    title: "Terms of Use",
    description:
      "ScoreOM terms of use - guidelines for using our platform, content, and tools.",
    images: ["/og-image.png"],
  },
};

export default function TermsPage() {
  return (
    <>
      <ScoreOMNav />
      <section style={{
        background: "linear-gradient(135deg, #0B1120 0%, #151b2b 100%)",
        color: "#fff",
        padding: "64px 24px",
      }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>Terms of Use</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>Last updated: September 30, 2026</p>
        </div>
      </section>

      <section style={{ padding: "48px 24px", background: "var(--white)" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          {[
            {
              title: "Acceptance of Terms",
              content: "By accessing and using ScoreOM (scoreom.com), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the site. We reserve the right to modify these terms at any time; continued use constitutes acceptance of changes."
            },
            {
              title: "Not Investment Advice",
              content: "ScoreOM provides automated analysis of documents you upload, plus market data and tools, for informational purposes only. Scores, extracted figures and AI-written summaries can contain errors, so check them against the source documents. Nothing on this site constitutes investment advice, financial advice, tax advice, or legal advice. Market data, statistics, risk scores, and analysis should not be relied upon as the sole basis for any investment decision. Always consult with qualified financial, legal, and tax professionals before making investment decisions."
            },
            {
              title: "Data Accuracy Disclaimer",
              content: "While we strive to provide accurate and up-to-date information, ScoreOM makes no warranties or representations regarding the accuracy, completeness, or timeliness of any data, analysis, or content on this site. Market data may be estimated, delayed, or sourced from third-party providers. We recommend verifying critical data points with primary sources such as CoStar, MSCI Real Capital Analytics, CBRE Research, and government agencies (FRED, BLS, SEC)."
            },
            {
              title: "No Guarantees",
              content: "Past performance data, market trends, and forward-looking statements on this site do not guarantee future results. Real estate investments involve risk, including the potential loss of principal. Cap rates, tenant credit ratings, market projections, and other metrics are subject to change without notice."
            },
            {
              title: "Intellectual Property",
              content: "All content on ScoreOM, including text, graphics, logos, tools, and software, is the property of ScoreOM or its content suppliers and is protected by copyright laws. You may not reproduce, distribute, or create derivative works from our content without express written permission."
            },
            {
              title: "Permitted Use",
              content: "You may use ScoreOM for your own investment, brokerage, lending, advisory or research work, including on behalf of the firm you work for, and you may share your deal analyses and DealBoards with clients, partners and lenders. You may not scrape, crawl, or systematically download the site, resell or white-label the service, attempt to access other users' data, or use ScoreOM to build a competing product."
            },
            {
              title: "Your Uploads",
              content: "You keep all rights to the documents you upload and the deals you create. You give ScoreOM permission to store and process them, including through the AI and data providers listed in our Privacy Policy, only to provide the service to you. You are responsible for making sure you are allowed to upload each document; many OMs are shared under confidentiality agreements, so check yours. We do not sell your uploads or use them to train AI models."
            },
            {
              title: "Accounts",
              content: "Provide an accurate email address and keep your sign-in secure. You can stop using ScoreOM and ask us to delete your account at any time. We may suspend accounts that violate these terms, abuse the service, or put other users at risk. Marketing emails can be turned off with the unsubscribe link in any of them."
            },
            {
              title: "Third-Party Links",
              content: "ScoreOM may contain links to third-party websites. We are not responsible for the content, accuracy, or practices of external sites. Links do not imply endorsement."
            },
            {
              title: "Limitation of Liability",
              content: "ScoreOM and its operators shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the site, reliance on any data or analysis, or inability to access the site. This includes, without limitation, damages from investment decisions made using information from this site."
            },
            {
              title: "Governing Law",
              content: "These terms shall be governed by and construed in accordance with the laws of the State of California. Any disputes arising from these terms or your use of the site shall be subject to the exclusive jurisdiction of the courts of California."
            },
            {
              title: "Contact",
              content: "For questions about these terms, contact us at support@scoreom.com."
            },
          ].map((section) => (
            <div key={section.title} style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 10, color: "var(--navy-950)", letterSpacing: -0.3 }}>{section.title}</h2>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--navy-700)", margin: 0 }}>{section.content}</p>
            </div>
          ))}
        </div>
      </section>
      <ScoreOMFooter />
    </>
  );
}
