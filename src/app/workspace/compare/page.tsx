"use client";

import { useEffect, useState } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getUserProjects, getProjectSnapshot, getProjectCurrentScore } from "@/lib/workspace/firestore";
import type { Project, PropertySnapshot, Score } from "@/lib/workspace/types";
import { SCORE_BAND_COLORS, SCORE_BAND_LABELS, STATUS_LABELS, ASSET_TYPE_LABELS, formatCurrency, formatPercent } from "@/lib/workspace/types";

type EnrichedProject = Project & { snapshot?: PropertySnapshot; score?: Score };

export default function ComparePage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<EnrichedProject[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserProjects(user.uid).then(async (ps) => {
      const enriched = await Promise.all(ps.filter(p => p.status !== "archived").map(async (p) => {
        const [snapshot, score] = await Promise.all([getProjectSnapshot(p.id), getProjectCurrentScore(p.id)]);
        return { ...p, snapshot: snapshot || undefined, score: score || undefined };
      }));
      setProjects(enriched);
      setLoading(false);
    });
  }, [user]);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev);
  };

  const compared = projects.filter(p => selected.includes(p.id));

  const rows = [
    { label: "Score", get: (p: EnrichedProject) => p.scoreTotal !== undefined ? String(p.scoreTotal) : "--" },
    { label: "Recommendation", get: (p: EnrichedProject) => p.scoreBand ? SCORE_BAND_LABELS[p.scoreBand] : "--" },
    { label: "Asset Type", get: (p: EnrichedProject) => p.assetType ? ASSET_TYPE_LABELS[p.assetType] : "--" },
    { label: "Status", get: (p: EnrichedProject) => STATUS_LABELS[p.status] },
    { label: "Ask Price", get: (p: EnrichedProject) => p.snapshot?.purchasePrice ? formatCurrency(p.snapshot.purchasePrice) : "--" },
    { label: "Price/SF", get: (p: EnrichedProject) => p.snapshot?.pricePsf ? `$${p.snapshot.pricePsf.toFixed(0)}/SF` : "--" },
    { label: "NOI", get: (p: EnrichedProject) => p.snapshot?.noiInPlace ? formatCurrency(p.snapshot.noiInPlace) : "--" },
    { label: "Cap Rate", get: (p: EnrichedProject) => p.snapshot?.capRateInPlace ? formatPercent(p.snapshot.capRateInPlace) : "--" },
    { label: "Occupancy", get: (p: EnrichedProject) => p.snapshot?.occupancyPct ? formatPercent(p.snapshot.occupancyPct) : "--" },
    { label: "DSCR", get: (p: EnrichedProject) => p.snapshot?.dscr ? p.snapshot.dscr.toFixed(2) + "x" : "--" },
    { label: "Cash on Cash", get: (p: EnrichedProject) => p.snapshot?.cashOnCash ? formatPercent(p.snapshot.cashOnCash) : "--" },
    { label: "IRR", get: (p: EnrichedProject) => p.snapshot?.irr ? formatPercent(p.snapshot.irr) : "--" },
    { label: "Equity Multiple", get: (p: EnrichedProject) => p.snapshot?.equityMultiple ? p.snapshot.equityMultiple.toFixed(2) + "x" : "--" },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#585e70" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Compare Deals</h1>
      <p style={{ fontSize: 14, color: "#585e70", marginBottom: 20 }}>Select up to 5 projects to compare side by side.</p>

      {/* Selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: selected.includes(p.id) ? "2px solid #C49A3C" : "1px solid rgba(227, 190, 189, 0.15)",
              background: selected.includes(p.id) ? "#FFF9EE" : "#fff",
              color: selected.includes(p.id) ? "#C49A3C" : "#585e70",
              cursor: "pointer",
            }}
          >
            {p.projectName}
          </button>
        ))}
      </div>

      {/* Comparison Table */}
      {compared.length >= 2 ? (
        <>
        <style>{`
          @media (max-width: 768px) {
            .cmp-table-wrap { overflow-x: hidden !important; }
            .cmp-table { display: none !important; }
            .cmp-cards { display: flex !important; }
          }
        `}</style>
        <div className="cmp-table-wrap" style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(227, 190, 189, 0.15)", overflow: "auto" }}>
          {/* Desktop table */}
          <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f2f3ff" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#585e70", minWidth: 140 }}>Metric</th>
                {compared.map(p => (
                  <th key={p.id} style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, minWidth: 160 }}>
                    {p.projectName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label} style={{ borderBottom: "1px solid rgba(227, 190, 189, 0.15)" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#585e70" }}>{row.label}</td>
                  {compared.map(p => (
                    <td key={p.id} style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500 }}>{row.get(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile stacked cards - one card per project with all metrics */}
          <div className="cmp-cards" style={{ display: "none", flexDirection: "column", gap: 16, padding: 12 }}>
            {compared.map(p => (
              <div key={p.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: 14, border: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#111827" }}>{p.projectName}</div>
                {rows.map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "#585e70" }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: "#111827" }}>{row.get(p)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        </>

      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(227, 190, 189, 0.15)", padding: 48, textAlign: "center", color: "#585e70" }}>
          Select at least 2 projects above to compare.
        </div>
      )}
    </div>
  );
}
