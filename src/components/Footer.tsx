import Link from "next/link";
import Image from "next/image";
import { GUIDE_COUNT } from "@/lib/site-constants";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container-full">
        {/* Main Footer Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.5fr repeat(5, 1fr)",
          gap: 32,
        }}>
          {/* Brand Column */}
          <div className="footer-brand">
            <Link href="/" className="nav-logo">
              <Image
                src="/logo.png"
                alt="TripleNet"
                width={160}
                height={40}
                className="nav-logo-img footer-logo-img"
              />
            </Link>
            <p>
              The daily intelligence platform for commercial real estate investors.
              Data-driven insights for smarter NNN investing.
            </p>
            <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
              <Link href="/subscribe" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 700, color: "#fff",
                background: "var(--navy-800)", padding: "8px 16px",
                borderRadius: 6, textDecoration: "none",
              }}>
                Subscribe Free
              </Link>
            </div>
          </div>

          {/* Indicators & Markets */}
          <div className="footer-col">
            <h5>Indicators</h5>
            <Link href="/macro">Macro Dashboard</Link>
            <Link href="/macro/interest-rates">Interest Rates</Link>
            <Link href="/macro/cap-rate-trends">Cap Rate Trends</Link>
            <Link href="/capital-markets">Capital Markets</Link>
            <Link href="/benchmarks">Benchmarks</Link>
            <Link href="/data">Market Data</Link>
          </div>

          {/* CRE Sectors */}
          <div className="footer-col">
            <h5>CRE Sectors</h5>
            <Link href="/sectors/retail">Retail</Link>
            <Link href="/sectors/strip-malls">Strip Malls</Link>
            <Link href="/sectors/industrial">Industrial</Link>
            <Link href="/sectors/office">Office</Link>
            <Link href="/sectors/multifamily">Multifamily</Link>
            <Link href="/sectors/medical-office">Medical Office</Link>
            <Link href="/sectors/data-centers">Data Centers</Link>
            <Link href="/sectors/self-storage">Self Storage</Link>
            <Link href="/sectors/hospitality">Hospitality</Link>
          </div>

          {/* Investing & Deals */}
          <div className="footer-col">
            <h5>Investing</h5>
            <Link href="/deals">Deal Flow</Link>
            <Link href="/deals/analysis">Deal Analysis</Link>
            <Link href="/deals/comps">Market Comps</Link>
            <Link href="/small-investor/getting-started">Small Investor Guide</Link>
            <Link href="/strategy">Strategy</Link>
            <Link href="/tenant-risk">Tenant Risk</Link>
            <Link href="/news">CRE News</Link>
          </div>

          {/* Tools & Learning */}
          <div className="footer-col">
            <h5>Tools & Learn</h5>
            <Link href="/tools/calculators">CRE Calculators</Link>
            <Link href="/ai/tools">AI-Powered Tools</Link>
            <Link href="/research">Research & Reports</Link>
            <Link href="/learn">{`${GUIDE_COUNT} CRE Guides`}</Link>
            <Link href="/glossary">CRE Glossary</Link>
            <Link href="/search">Search</Link>
          </div>

          {/* Company */}
          <div className="footer-col">
            <h5>Company</h5>
            <Link href="/subscribe">Subscribe</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
            <Link href="/sitemap-page">Sitemap</Link>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} NNNTripleNet. All rights reserved.</span>
          <span style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>Privacy</Link>
            <Link href="/terms" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>Terms</Link>
            <Link href="/sitemap-page" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>Sitemap</Link>
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .footer .container-full > div:first-child {
            grid-template-columns: 1fr 1fr 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .footer .container-full > div:first-child {
            grid-template-columns: 1fr 1fr !important;
            gap: 24px !important;
          }
        }
      `}</style>
    </footer>
  );
}
