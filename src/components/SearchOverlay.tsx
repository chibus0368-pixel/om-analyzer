"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GUIDES } from "@/lib/guides-data";
import { GLOSSARY_TERMS } from "@/lib/glossary-data";

const TRENDING_TOPICS = [
  "NNN",
  "Cap Rate",
  "1031 Exchange",
  "REIT",
  "Industrial",
  "Data Centers",
  "Multifamily",
  "CRE Lending",
];

const POPULAR_SEARCHES = [
  "best NNN tenants 2026",
  "cap rate calculator",
  "1031 exchange rules",
  "triple net lease explained",
  "REIT vs direct NNN",
  "commercial loan rates",
];

interface SearchItem {
  title: string;
  description: string;
  href: string;
  type: "Guide" | "Glossary" | "Calculator" | "Page" | "Tool";
  keywords?: string;
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

// Build search index
function buildSearchIndex(): SearchItem[] {
  const items: SearchItem[] = [];

  // Add Guides
  GUIDES.forEach((guide) => {
    items.push({
      title: guide.title,
      description: guide.excerpt,
      href: `/learn/${guide.slug}`,
      type: "Guide",
      keywords: [guide.title, guide.excerpt, guide.categoryLabel, ...guide.tags].join(" "),
    });
  });

  // Add Glossary Terms
  GLOSSARY_TERMS.forEach((term) => {
    items.push({
      title: term.term,
      description: term.definition,
      href: `/glossary/${term.slug}`,
      type: "Glossary",
      keywords: [term.term, term.definition, ...(term.tags || [])].join(" "),
    });
  });

  // Add Calculators
  const calculators = [
    { title: "Cap Rate Calculator", slug: "cap-rate" },
    { title: "Cash-on-Cash Return", slug: "cash-on-cash" },
    { title: "NOI Calculator", slug: "noi" },
    { title: "DSCR Calculator", slug: "dscr" },
    { title: "IRR Calculator", slug: "irr" },
    { title: "Loan Payment Calculator", slug: "loan-payment" },
    { title: "GRM Calculator", slug: "grm" },
    { title: "Break-Even Occupancy", slug: "break-even" },
    { title: "Rent Per Sq Ft", slug: "rent-per-sqft" },
    { title: "Price Per Sq Ft", slug: "price-per-sqft" },
    { title: "Equity Multiple", slug: "equity-multiple" },
    { title: "LTV Ratio", slug: "ltv" },
    { title: "Yield on Cost", slug: "yield-on-cost" },
    { title: "Amortization Schedule", slug: "amortization" },
    { title: "Depreciation Calculator", slug: "depreciation" },
    { title: "Rent Escalation", slug: "rent-escalation" },
    { title: "Lease Value Calculator", slug: "lease-value" },
    { title: "Cap Rate Spread", slug: "cap-rate-spread" },
  ];

  calculators.forEach((calc) => {
    items.push({
      title: calc.title,
      description: `Calculate and analyze ${calc.title.toLowerCase()}`,
      href: `/calculators/${calc.slug}`,
      type: "Calculator",
      keywords: [calc.title, "calculator"].join(" "),
    });
  });

  return items;
}

// Fuzzy matching
function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t === q) return 1000;
  if (t.includes(q)) return 500;

  let score = 0;
  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score += 10;
      qIdx++;
    } else {
      score += 0.1;
    }
  }

  return qIdx === q.length ? score : 0;
}

// Search function
function searchItems(items: SearchItem[], query: string, limit: number = 8): SearchItem[] {
  if (!query.trim()) return [];

  const scored = items.map((item) => {
    const titleScore = fuzzyMatch(query, item.title) * 3;
    const descScore = fuzzyMatch(query, item.description);
    const keywordsScore = fuzzyMatch(query, item.keywords || "");
    const totalScore = titleScore + descScore + keywordsScore;

    return { item, score: totalScore };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

const typeColors: Record<string, string> = {
  Guide: "#10B981",
  Glossary: "#7C3AED",
  Calculator: "#2563EB",
  Page: "#F59E0B",
  Tool: "#EF4444",
};

const typeBgColors: Record<string, string> = {
  Guide: "rgba(16, 185, 129, 0.15)",
  Glossary: "rgba(124, 58, 237, 0.15)",
  Calculator: "rgba(37, 99, 235, 0.15)",
  Page: "rgba(245, 158, 11, 0.15)",
  Tool: "rgba(239, 68, 68, 0.15)",
};

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Build search index once
  useEffect(() => {
    setSearchIndex(buildSearchIndex());
  }, []);

  // Auto-focus when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Get instant results as you type
  const instantResults = useMemo(() => {
    return searchItems(searchIndex, searchValue, 8);
  }, [searchValue, searchIndex]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchItem[]> = {
      Guide: [],
      Glossary: [],
      Calculator: [],
      Page: [],
    };

    instantResults.forEach((item) => {
      if (groups[item.type]) {
        groups[item.type].push(item);
      }
    });

    return groups;
  }, [instantResults]);

  // Handle search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue)}`);
      onClose();
      setSearchValue("");
    }
  };

  // Handle result click
  const handleResultClick = (href: string) => {
    router.push(href);
    onClose();
    setSearchValue("");
  };

  // Handle trending topic click
  const handleTrendingClick = (topic: string) => {
    router.push(`/search?q=${encodeURIComponent(topic)}`);
    onClose();
    setSearchValue("");
  };

  // Handle popular search click
  const handlePopularClick = (search: string) => {
    router.push(`/search?q=${encodeURIComponent(search)}`);
    onClose();
    setSearchValue("");
  };

  if (!isOpen) return null;

  const hasResults = searchValue.trim() && instantResults.length > 0;
  const anyTypeHasResults = Object.values(groupedResults).some((items) => items.length > 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(6, 8, 15, 0.97)",
        backdropFilter: "blur(8px)",
        animation: "fadeIn 0.3s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100vh",
          padding: "60px 24px 40px",
          overflow: "auto",
          animation: "slideDown 0.4s ease-out",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--white)",
            opacity: 0.7,
            transition: "opacity 0.2s ease",
            padding: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.7";
          }}
          aria-label="Close search"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Search Form */}
        <form onSubmit={handleSearch} style={{ width: "100%", maxWidth: 700 }}>
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search guides, glossary, calculators..."
              style={{
                width: "100%",
                fontSize: "32px",
                fontWeight: 500,
                color: "var(--white)",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid var(--gold-500)`,
                padding: "16px 0",
                fontFamily: "var(--font-display)",
                outline: "none",
                letterSpacing: "-0.5px",
              }}
              aria-label="Search"
            />
          </div>
        </form>

        {/* Instant Search Results Section */}
        {searchValue.trim() && anyTypeHasResults && (
          <div
            style={{
              width: "100%",
              maxWidth: 700,
              marginTop: "40px",
              marginBottom: "60px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--navy-400)",
                  fontFamily: "var(--font-sans)",
                  margin: 0,
                }}
              >
                Instant Results ({instantResults.length})
              </h3>
              <Link
                href={`/search?q=${encodeURIComponent(searchValue)}`}
                onClick={() => {
                  onClose();
                  setSearchValue("");
                }}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--gold-500)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                View all
              </Link>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(groupedResults).map(([type, items]) =>
                items.length > 0 ? (
                  <div key={type}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "var(--navy-500)",
                        marginBottom: 8,
                      }}
                    >
                      {type}s
                    </div>
                    {items.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleResultClick(item.href)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          color: "var(--white)",
                          padding: "12px 14px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 14,
                          fontFamily: "var(--font-sans)",
                          transition: "all 0.2s ease",
                          marginBottom: 6,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              color: typeColors[type as keyof typeof typeColors],
                              background: typeBgColors[type as keyof typeof typeBgColors],
                              padding: "2px 6px",
                              borderRadius: 3,
                              whiteSpace: "nowrap",
                              marginTop: 2,
                            }}
                          >
                            {type}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.3 }}>
                              {item.description.substring(0, 80)}
                              {item.description.length > 80 ? "..." : ""}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* Trending Section */}
        {!searchValue.trim() && (
          <div
            style={{
              width: "100%",
              maxWidth: 700,
              marginTop: "80px",
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--navy-400)",
                marginBottom: "20px",
                fontFamily: "var(--font-sans)",
              }}
            >
              Trending
            </h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              {TRENDING_TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => handleTrendingClick(topic)}
                  style={{
                    padding: "10px 18px",
                    background: "var(--navy-950)",
                    border: `1px solid var(--navy-400)`,
                    color: "var(--white)",
                    fontSize: "14px",
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    borderRadius: "4px",
                    transition: "all 0.2s ease",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--gold-500)";
                    e.currentTarget.style.color = "var(--navy-950)";
                    e.currentTarget.style.borderColor = "var(--gold-500)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--navy-950)";
                    e.currentTarget.style.color = "var(--white)";
                    e.currentTarget.style.borderColor = "var(--navy-400)";
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Searches Section */}
        {!searchValue.trim() && (
          <div
            style={{
              width: "100%",
              maxWidth: 700,
              marginTop: "60px",
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--navy-400)",
                marginBottom: "20px",
                fontFamily: "var(--font-sans)",
              }}
            >
              Popular Searches
            </h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "24px",
              }}
            >
              {POPULAR_SEARCHES.map((search) => (
                <li key={search}>
                  <button
                    onClick={() => handlePopularClick(search)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--white)",
                      fontSize: "16px",
                      fontFamily: "var(--font-sans)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s ease",
                      padding: "8px 0",
                      fontWeight: 400,
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--gold-500)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--white)";
                    }}
                  >
                    {search}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
