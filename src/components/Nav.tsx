"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import SearchOverlay from "./SearchOverlay";
import { GUIDE_COUNT } from "@/lib/site-constants";

/* ═══════════════════════════════════════════════════════════
   NAV DATA - Consolidated Mega-Menu (6 items)
   ═══════════════════════════════════════════════════════════ */

interface MegaColumn {
  heading: string;
  color?: string;
  links: { href: string; label: string; desc: string; icon?: string }[];
}

const CalcIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.45 }}>
    <rect x="2" y="1" width="12" height="14" rx="2" />
    <rect x="4" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.2" />
    <circle cx="5.5" cy="9" r="0.8" fill="currentColor" /><circle cx="8" cy="9" r="0.8" fill="currentColor" /><circle cx="10.5" cy="9" r="0.8" fill="currentColor" />
    <circle cx="5.5" cy="12" r="0.8" fill="currentColor" /><circle cx="8" cy="12" r="0.8" fill="currentColor" /><circle cx="10.5" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

interface NavItem {
  href: string;
  label: string;
  columns?: MegaColumn[];
}

const NAV_ITEMS: NavItem[] = [
  /* ── 1. News (plain link) ── */
  {
    href: "/news",
    label: "Current CRE News",
  },

  /* ── 2. Indicators = Macro + Capital Markets ── */
  {
    href: "/macro",
    label: "Indicators",
    columns: [
      {
        heading: "Macro Indicators",
        color: "#DC3545",
        links: [
          { href: "/macro/interest-rates", label: "Interest Rates", desc: "Fed policy and treasury yields" },
          { href: "/macro/cap-rate-trends", label: "Cap Rate Trends", desc: "National and sector cap rates" },
          { href: "/macro/cre-spread", label: "CRE Spread", desc: "Spread to risk-free rate" },
          { href: "/macro/inflation-impact", label: "Inflation Impact", desc: "CPI effects on NNN values" },
          { href: "/benchmarks", label: "Benchmarks", desc: "Cap rates, spreads and volume" },
        ],
      },
      {
        heading: "Capital Markets",
        color: "#2563EB",
        links: [
          { href: "/capital-markets/financing", label: "Financing", desc: "Current lending environment" },
          { href: "/capital-markets/debt-availability", label: "Debt & Lending", desc: "Lender capacity and appetite" },
          { href: "/capital-markets/ltv-trends", label: "LTV Trends", desc: "Loan-to-value benchmarks" },
          { href: "/capital-markets/cmbs-market", label: "CMBS Market", desc: "Securitization and spreads" },
          { href: "/capital-markets/refinance-risk", label: "Refinance Risk", desc: "Maturity wall analysis" },
        ],
      },
    ],
  },

  /* ── 3. CRE Sectors ── */
  {
    href: "/sectors",
    label: "CRE Sectors",
    columns: [
      {
        heading: "",
        links: [
          { href: "/sectors/retail", label: "Retail", desc: "NNN retail and convenience" },
          { href: "/sectors/strip-malls", label: "Strip Malls", desc: "Neighborhood retail centers" },
          { href: "/sectors/industrial", label: "Industrial", desc: "Warehouse and logistics" },
          { href: "/sectors/office", label: "Office", desc: "Office and flex space" },
          { href: "/sectors/multifamily", label: "Multifamily", desc: "Apartments and housing" },
        ],
      },
      {
        heading: "",
        links: [
          { href: "/sectors/medical-office", label: "Medical Office", desc: "Healthcare real estate" },
          { href: "/sectors/data-centers", label: "Data Centers", desc: "Hyperscale and colocation" },
          { href: "/sectors/self-storage", label: "Self Storage", desc: "Storage facilities" },
          { href: "/sectors/hospitality", label: "Hospitality", desc: "Hotels and resorts" },
        ],
      },
    ],
  },

  /* ── 4. Investing = Deal Flow + Tenant Risk ── */
  {
    href: "/deals",
    label: "Investing",
    columns: [
      {
        heading: "Deal Flow",
        color: "#059669",
        links: [
          { href: "/deals/analysis", label: "Deal Analysis", desc: "Current deal breakdowns" },
          { href: "/deals/comps", label: "Market Comps", desc: "Recent transaction data" },
          { href: "/deals/yield", label: "Yield Comparison", desc: "Cross-sector yield analysis" },
          { href: "/deals/risk-alerts", label: "Risk Alerts", desc: "Flagged opportunities" },
          { href: "/deals/exit-risk", label: "Exit Risk", desc: "Liquidity and exit modeling" },
        ],
      },
      {
        heading: "Small Investor",
        color: "#7C3AED",
        links: [
          { href: "/small-investor/getting-started", label: "Getting Started", desc: "First NNN property roadmap" },
          { href: "/small-investor/deal-sizing", label: "Deal Sizing", desc: "Right-size your first deals" },
          { href: "/small-investor/portfolio-building", label: "Portfolio Building", desc: "Grow from 1 to 5 properties" },
        ],
      },
    ],
  },

  /* ── 5. Calculators ── */
  {
    href: "/tools/calculators",
    label: "Calculators",
    columns: [
      {
        heading: "Valuation",
        color: "#CA8A04",
        links: [
          { href: "/calculators/cap-rate", label: "Cap Rate", desc: "Capitalization rate", icon: "calc" },
          { href: "/calculators/noi", label: "NOI", desc: "Net operating income", icon: "calc" },
          { href: "/calculators/grm", label: "GRM", desc: "Gross rent multiplier", icon: "calc" },
          { href: "/calculators/price-per-sqft", label: "Price Per Sq Ft", desc: "Value by square footage", icon: "calc" },
          { href: "/calculators/yield-on-cost", label: "Yield on Cost", desc: "Development returns", icon: "calc" },
          { href: "/calculators/cap-rate-spread", label: "Cap Rate Spread", desc: "Spread vs treasury", icon: "calc" },
        ],
      },
      {
        heading: "Returns",
        color: "#059669",
        links: [
          { href: "/calculators/cash-on-cash", label: "Cash-on-Cash", desc: "Return on cash invested", icon: "calc" },
          { href: "/calculators/irr", label: "IRR", desc: "Internal rate of return", icon: "calc" },
          { href: "/calculators/equity-multiple", label: "Equity Multiple", desc: "Total return multiple", icon: "calc" },
          { href: "/calculators/break-even", label: "Break-Even", desc: "Minimum occupancy needed", icon: "calc" },
          { href: "/calculators/depreciation", label: "Depreciation", desc: "Tax deduction schedule", icon: "calc" },
        ],
      },
      {
        heading: "Debt & Lease",
        color: "#2563EB",
        links: [
          { href: "/calculators/dscr", label: "DSCR", desc: "Debt service coverage", icon: "calc" },
          { href: "/calculators/loan-payment", label: "Loan Payment", desc: "Monthly P&I breakdown", icon: "calc" },
          { href: "/calculators/ltv", label: "LTV Ratio", desc: "Loan-to-value", icon: "calc" },
          { href: "/calculators/amortization", label: "Amortization", desc: "Full loan schedule", icon: "calc" },
          { href: "/calculators/lease-value", label: "Lease Value", desc: "Present value of lease", icon: "calc" },
          { href: "/calculators/rent-per-sqft", label: "Rent Per Sq Ft", desc: "Rental rate conversion", icon: "calc" },
          { href: "/calculators/rent-escalation", label: "Rent Escalation", desc: "Future rent projection", icon: "calc" },
        ],
      },
    ],
  },

  /* ── 6. Intelligence = Research + Learn ── */
  {
    href: "/research",
    label: "Intelligence",
    columns: [
      {
        heading: "Research",
        color: "#EA580C",
        links: [
          { href: "/research/sector-outlook", label: "Sector Outlook", desc: "Sector-by-sector analysis" },
          { href: "/research/market-reports", label: "Market Reports", desc: "Deep-dive research" },
          { href: "/research/forecasts", label: "Forecasts", desc: "Forward-looking projections" },
        ],
      },
      {
        heading: "Learn",
        color: "#059669",
        links: [
          { href: "/learn", label: "CRE Learning Center", desc: `${GUIDE_COUNT} in-depth CRE guides` },
          { href: "/glossary", label: "CRE Glossary", desc: "137 terms defined" },
          { href: "/ai/tools", label: "CRE Tools", desc: "AI & software for CRE professionals" },
          { href: "/tools/cap-rate", label: "Learn Cap Rate", desc: "Valuation modeling" },
          { href: "/tools/dscr", label: "Learn DSCR", desc: "Debt service coverage" },
        ],
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════
   NAV COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close everything on route change
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
    setMobileExpanded(null);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleEnter = useCallback((label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenMenu(label);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpenMenu(null), 600);
  }, []);

  function isActive(item: NavItem) {
    if (!pathname) return false;
    if (pathname === item.href) return true;
    if (pathname.startsWith(item.href + "/")) return true;
    if (item.columns) {
      for (const col of item.columns) {
        for (const link of col.links) {
          if (pathname === link.href || pathname.startsWith(link.href + "/")) return true;
        }
      }
    }
    return false;
  }

  return (
    <nav className="nav" ref={navRef}>
      <style>{`
        @keyframes megaFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mega-panel { animation: megaFadeIn 0.18s ease-out both; }
        .mega-link { transition: background 0.12s; text-transform: none !important; letter-spacing: normal !important; }
        .mega-link:hover { background: var(--navy-50) !important; }
        .mobile-expand-btn { background:none; border:none; width:100%; text-align:left; cursor:pointer; }
        .mobile-sub-links { overflow:hidden; transition: max-height 0.25s ease; }
      `}</style>

      {/* ─── PRIMARY BAR ─── */}
      <div className="nav-primary">
        <div className="container-full nav-inner">
          {/* Logo */}
          <Link href="/" className="nav-logo">
            <Image src="/logo.png" alt="NNNTripleNet" width={160} height={48} className="nav-logo-img" priority />
          </Link>

          {/* Desktop links */}
          <ul className="nav-links-primary">
            {NAV_ITEMS.map((item) => (
              <li
                key={item.label}
                style={{ position: "relative" }}
                onMouseEnter={() => item.columns && handleEnter(item.label)}
                onMouseLeave={handleLeave}
              >
                {item.columns ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenMenu(openMenu === item.label ? null : item.label);
                    }}
                    className={isActive(item) ? "active" : ""}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      font: "inherit",
                      color: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "20px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "0.3px",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {item.label === "Calculators" && <CalcIcon size={12} />}
                    {item.label}
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                      style={{ marginLeft: 3, opacity: 0.4, transform: openMenu === item.label ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                      <path d="M2.5 3.5L5 6L7.5 3.5" />
                    </svg>
                  </button>
                ) : (
                  <Link href={item.href} className={isActive(item) ? "active" : ""}>
                    {item.label}
                  </Link>
                )}

                {/* ─── MEGA MENU PANEL (2-column) ─── */}
                {item.columns && openMenu === item.label && (
                  <div
                    className="mega-panel"
                    style={{
                      position: "absolute",
                      top: "100%",
                      ...(item.label === "Calculators" || item.label === "Intelligence" ? { right: 0 } : { left: 0 }),
                      paddingTop: 4,
                      zIndex: 200,
                    }}
                  >
                    <div style={{
                      background: "var(--white)",
                      border: "1px solid var(--navy-200)",
                      borderRadius: 12,
                      boxShadow: "0 20px 60px rgba(6,8,15,0.14), 0 2px 8px rgba(6,8,15,0.06)",
                      padding: "20px 12px",
                      display: "grid",
                      gridTemplateColumns: `repeat(${item.columns.length}, 1fr)`,
                      gap: "8px 16px",
                      minWidth: item.columns.length > 2 ? 680 : 520,
                    }}>
                      {item.columns.map((col, colIdx) => (
                        <div key={colIdx}>
                          {col.heading && (
                            <div style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: col.color || "var(--navy-400)",
                              textTransform: "uppercase",
                              letterSpacing: "1.2px",
                              padding: "6px 14px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}>
                              <span style={{
                                width: 3,
                                height: 14,
                                borderRadius: 2,
                                background: col.color || "var(--navy-300)",
                                flexShrink: 0,
                              }} />
                              {col.heading}
                            </div>
                          )}
                          {col.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="mega-link"
                              style={{
                                display: "block",
                                padding: "9px 14px",
                                borderRadius: 8,
                                textDecoration: "none",
                              }}
                            >
                              <div style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--navy-900)",
                                lineHeight: 1.3,
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}>
                                {link.icon === "calc" && <CalcIcon size={11} />}
                                {link.label}
                              </div>
                              <div style={{
                                fontSize: 11.5,
                                color: "var(--navy-500)",
                                marginTop: 1,
                                lineHeight: 1.35,
                              }}>
                                {link.desc}
                              </div>
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Right: search + subscribe */}
          <div className="nav-right">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--navy-500)", padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <Link href="/subscribe" className="nav-cta">Subscribe</Link>
          </div>

          {/* Mobile hamburger */}
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--navy-700)" strokeWidth="2">
              {mobileOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {/* ─── MOBILE MENU ─── */}
      {mobileOpen && (
        <div className="mobile-menu">
          <div className="container" style={{ paddingTop: 8, paddingBottom: 24 }}>
            {/* Mobile search */}
            <button
              onClick={() => { setMobileOpen(false); setSearchOpen(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "14px 0", background: "none", border: "none", borderBottom: "1px solid var(--navy-100)",
                cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--navy-900)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Search
            </button>
            {NAV_ITEMS.map((item) => (
              <div key={item.label} style={{ borderBottom: "1px solid var(--navy-100)" }}>
                {item.columns ? (
                  <>
                    <button
                      className="mobile-expand-btn"
                      onClick={() => setMobileExpanded(mobileExpanded === item.label ? null : item.label)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 0", color: "var(--navy-900)",
                        fontSize: 15, fontWeight: 600,
                      }}
                    >
                      {item.label}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--navy-400)" strokeWidth="2"
                        style={{ transform: mobileExpanded === item.label ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                        <path d="M2 4L6 8L10 4" />
                      </svg>
                    </button>
                    <div className="mobile-sub-links" style={{
                      maxHeight: mobileExpanded === item.label ? 800 : 0,
                      paddingBottom: mobileExpanded === item.label ? 8 : 0,
                    }}>
                      {item.columns.map((col, colIdx) => (
                        <div key={colIdx}>
                          {col.heading && (
                            <div style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--navy-400)",
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              padding: "10px 16px 4px",
                            }}>
                              {col.heading}
                            </div>
                          )}
                          {col.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setMobileOpen(false)}
                              style={{
                                display: "block", padding: "10px 0 10px 16px",
                                fontSize: 14, color: "var(--navy-600)",
                                textDecoration: "none", fontWeight: 500,
                              }}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: "block", padding: "14px 0",
                      fontSize: 15, fontWeight: 600, color: "var(--navy-900)",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
            <Link
              href="/subscribe"
              onClick={() => setMobileOpen(false)}
              className="mobile-cta"
              style={{ marginTop: 16 }}
            >
              Subscribe Free
            </Link>
          </div>
        </div>
      )}

      {/* ─── SEARCH OVERLAY ─── */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  );
}
