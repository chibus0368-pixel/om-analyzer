import type { Metadata } from "next";
import ScoreOMNav from "@/components/ScoreOMNav";
import ScoreOMFooter from "@/components/ScoreOMFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | ScoreOM",
  description: "How ScoreOM handles your account, your uploaded OMs, and the AI services that process them.",
  openGraph: {
    title: "Privacy Policy",
    description:
      "How ScoreOM handles your account, your uploaded OMs, and the AI services that process them.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ScoreOM" }],
  },
  twitter: {
    title: "Privacy Policy",
    description:
      "How ScoreOM handles your account, your uploaded OMs, and the AI services that process them.",
    images: ["/og-image.png"],
  },
};

export default function PrivacyPage() {
  return (
    <>
      <ScoreOMNav />
      <section style={{
        background: "linear-gradient(135deg, #0B1120 0%, #151b2b 100%)",
        color: "#fff",
        padding: "64px 24px",
      }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>Privacy Policy</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>Last updated: September 30, 2026</p>
        </div>
      </section>

      <section style={{ padding: "48px 24px", background: "var(--white)" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          {([
            {
              title: "Who we are",
              content: "ScoreOM (www.scoreom.com) is a first-pass screening tool for commercial real estate deals, operated from Mequon, Wisconsin, USA. This policy covers the website, the workspace, and the emails we send. Questions: support@scoreom.com.",
            },
            {
              title: "What we collect",
              content: [
                "Account details: your name, email address, and, if you add them, your company and role. If you sign in with Google, we receive your name, email and profile photo from Google.",
                "Documents you upload: offering memorandums (OMs), rent rolls, T-12s, flyers and other files, plus the text and numbers we extract from them and the analysis we produce (scores, briefs, notes and chat history).",
                "Deal details you enter or edit, and the DealBoards you create.",
                "Try-it-free uploads: if you upload without an account, we create an anonymous session. Those deals are deleted after 7 days unless you sign up and claim them.",
                "Usage data: pages visited, device and browser type, and where you came from (for example a tagged link or the referring site). We record the marketing source you first arrived from (the campaign tags on the link, such as utm_source, or the name of the site that referred you) and save it with your account when you sign up, so we can tell which channels people find us through.",
                "We do not collect payment card numbers, bank details, or government ID numbers.",
              ],
            },
            {
              title: "How your uploaded documents are used",
              content: [
                "Your files and extracted data are stored in your workspace so you can come back to them, re-run the analysis, and share them if you choose.",
                "To read a document and write the analysis, we send its text (and page images when a page is scanned) to OpenAI's API. OpenAI's API terms say this data is not used to train their models, and they keep it for up to 30 days for abuse monitoring.",
                "The deal chat, location research and Deal Agent send deal details to Perplexity's API to look up current market information. The deal chat can include an excerpt of the OM text. Perplexity's API terms say it does not train on this data and does not retain it.",
                "The property address is sent to Google Maps and U.S. Census services to pull the map, photos and area data.",
                "We do not sell your documents or data, we do not use them to train AI models, and we do not share your deals with other users. A deal or DealBoard is only visible to someone else if you share a link to it.",
              ],
            },
            {
              title: "Cookies and analytics",
              content: "We use Google Analytics, which sets cookies, and Vercel Web Analytics, which does not, to understand how people use the site. A first-party cookie named som_attr stores the marketing source you arrived from for 90 days; it holds only the campaign tags, the page you landed on and the referring site name. Sign-in and a few site preferences are kept in your browser's local storage. We do not run advertising trackers or sell data to ad networks. You can block analytics cookies in your browser or with an extension; the product still works.",
            },
            {
              title: "Emails",
              content: "We send account emails (sign-up, shared deals, analysis updates) and, occasionally, product news and tips. Every marketing email has a one-click unsubscribe link, and we stop sending marketing email as soon as you unsubscribe.",
            },
            {
              title: "Service providers",
              content: [
                "Google Firebase and Google Cloud: accounts, database and file storage.",
                "Vercel: website hosting.",
                "OpenAI and Perplexity: AI processing, as described above.",
                "Google Maps Platform and U.S. Census: maps, photos and area data.",
                "Resend: email delivery.",
                "Google Analytics: site analytics.",
                "Stripe: payments, if paid plans are offered. We never see your card number.",
                "Each provider processes data only to provide its service to us and is bound by its own terms and privacy policy.",
              ],
            },
            {
              title: "Security",
              content: "Data is encrypted in transit and at rest on Google Cloud infrastructure. Access to your workspace requires your sign-in, and our servers check that you own a deal before returning it. No system is perfectly secure, so avoid uploading anything you are not permitted to share with a software provider.",
            },
            {
              title: "Keeping and deleting your data",
              content: "We keep your account and deals while your account is open. You can delete a deal from your workspace at any time. To delete your account and everything in it, including the original uploaded files, email support@scoreom.com and we will do it within 30 days. Unclaimed try-it-free uploads are deleted automatically after 7 days.",
            },
            {
              title: "Your rights",
              content: "You can ask to see, correct, export or delete your personal information by emailing support@scoreom.com. We respond within 30 days. Depending on where you live (for example California or the EU), you may have additional rights, and we honor them.",
            },
            {
              title: "Changes to this policy",
              content: "If we make a material change, we will update the date above and email account holders before it takes effect.",
            },
          ] as { title: string; content: string | string[] }[])
          .map((section) => (
            <div key={section.title} style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 10, color: "var(--navy-950)", letterSpacing: -0.3 }}>{section.title}</h2>
              {Array.isArray(section.content) ? (
                <ul style={{ fontSize: 14, lineHeight: 1.7, color: "var(--navy-700)", margin: 0, paddingLeft: 20 }}>
                  {section.content.map((c, i) => <li key={i} style={{ marginBottom: 6 }}>{c}</li>)}
                </ul>
              ) : (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--navy-700)", margin: 0 }}>{section.content}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <ScoreOMFooter />
    </>
  );
}
