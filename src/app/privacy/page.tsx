import type { Metadata } from "next";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";
import DealSignalLogo from "@/components/DealSignalLogo";

export const metadata: Metadata = {
  title: "Privacy Policy | Deal Signals",
  description: "Deal Signals privacy policy - how we collect, use, and protect your information.",
  openGraph: {
    title: "Privacy Policy",
    description:
      "Deal Signals privacy policy - how we collect, use, and protect your information.",
  },
  twitter: {
    title: "Privacy Policy",
    description:
      "Deal Signals privacy policy - how we collect, use, and protect your information.",
  },
};

export default function PrivacyPage() {
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
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>Privacy Policy</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>Last updated: February 2026</p>
        </div>
      </section>

      <section style={{ padding: "48px 24px", background: "var(--white)" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          {[
            {
              title: "Information We Collect",
              content: "When you subscribe to Deal Signals, we collect your email address, subscription preferences, and basic usage data. We use Google Analytics to understand how visitors interact with our site. We do not collect financial account information, social security numbers, or other sensitive personal data."
            },
            {
              title: "How We Use Your Information",
              content: "Your email address is used solely to deliver the newsletter and platform communications you have opted into. Usage data helps us improve our content, tools, and user experience. We do not sell, rent, or share your personal information with third parties for marketing purposes."
            },
            {
              title: "Email Communications",
              content: "You may receive daily briefs, weekly digests, and occasional product updates based on your subscription preferences. Every email includes a one-click unsubscribe link. You can also manage your preferences or unsubscribe entirely at any time by contacting us at contact@nnntriplenet.com."
            },
            {
              title: "Cookies & Analytics",
              content: "We use cookies and similar technologies for basic site functionality and analytics (Google Analytics). These help us understand traffic patterns and improve the site. You can disable cookies in your browser settings, though some site features may not function correctly."
            },
            {
              title: "Data Storage & Security",
              content: "Subscriber data is stored securely using Google Cloud (Firebase) infrastructure with encryption at rest and in transit. We implement industry-standard security measures to protect your data. We retain subscriber data for as long as your account is active or as needed to provide services."
            },
            {
              title: "Third-Party Services",
              content: "We use the following third-party services: Google Firebase (data storage), Resend (email delivery), Google Analytics (site analytics), and Vercel (hosting). Each provider has its own privacy policy governing their handling of data."
            },
            {
              title: "Your Rights",
              content: "You have the right to access, correct, or delete your personal information at any time. To exercise these rights, contact us at contact@nnntriplenet.com. We will respond to requests within 30 days. California residents have additional rights under the CCPA."
            },
            {
              title: "Changes to This Policy",
              content: "We may update this privacy policy from time to time. Material changes will be communicated via email to active subscribers. Continued use of the site after changes constitutes acceptance of the updated policy."
            },
            {
              title: "Contact",
              content: "For privacy-related questions or concerns, contact us at contact@nnntriplenet.com."
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
