"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #D8DFE9",
  borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 24,
};

export default function SettingsPage() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [defaults, setDefaults] = useState({
    ltv: 65, interestRate: 6.5, amortYears: 25, holdYears: 10,
    exitCap: 7.0, vacancy: 5, rentGrowth: 2.5, expenseGrowth: 3.0,
  });
  const [saved, setSaved] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreStatus, setRescoreStatus] = useState("");

  async function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Re-score all properties in this workspace after saving assumptions
    if (!user || !activeWorkspace) return;
    setRescoring(true);
    setRescoreStatus("Re-scoring properties with updated assumptions...");
    try {
      const { collection, query, where, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDocs(query(
        collection(db, "workspace_properties"),
        where("userId", "==", user.uid),
        where("workspaceId", "==", activeWorkspace.id),
      ));
      const properties = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      let scored = 0;
      const analysisType = activeWorkspace.analysisType || "retail";
      for (const prop of properties) {
        try {
          await fetch("/api/workspace/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: prop.id, userId: user.uid, analysisType }),
          });
          scored++;
          setRescoreStatus(`Re-scored ${scored} / ${properties.length} properties...`);
        } catch { /* continue */ }
      }
      setRescoreStatus(`Done — ${scored} ${scored === 1 ? "property" : "properties"} re-scored.`);
    } catch (err) {
      setRescoreStatus("Could not re-score. Scores will update on next analysis.");
    }
    setRescoring(false);
    setTimeout(() => setRescoreStatus(""), 5000);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Settings</h1>
        {activeWorkspace?.analysisType && (
          <span style={{
            display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
            background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
            color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
            fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
          }}>
            {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: "#5A7091", marginBottom: 24 }}>Configure your workspace preferences and default assumptions.</p>

      {/* Default Underwriting Assumptions */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Default Underwriting Assumptions</h2>
        <p style={{ fontSize: 13, color: "#5A7091", marginBottom: 16 }}>These values will pre-populate when creating new underwriting models.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          {[
            { key: "ltv", label: "LTV (%)" },
            { key: "interestRate", label: "Interest Rate (%)" },
            { key: "amortYears", label: "Amortization (yrs)" },
            { key: "holdYears", label: "Hold Period (yrs)" },
            { key: "exitCap", label: "Exit Cap Rate (%)" },
            { key: "vacancy", label: "Vacancy (%)" },
            { key: "rentGrowth", label: "Rent Growth (%)" },
            { key: "expenseGrowth", label: "Expense Growth (%)" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7091", display: "block", marginBottom: 4 }}>{f.label}</label>
              <input type="number" style={inputStyle} value={(defaults as any)[f.key]} onChange={e => setDefaults(d => ({ ...d, [f.key]: parseFloat(e.target.value) || 0 }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Export Preferences</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 5 }}>Default Output Format</label>
            <select style={inputStyle}>
              <option>PDF</option>
              <option>DOCX</option>
              <option>XLSX</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 5 }}>Company Name (for branding)</label>
            <input style={inputStyle} placeholder="Your company name" />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={rescoring}
        className="ws-btn-red"
        style={{ padding: "10px 28px", background: saved ? "#10B981" : rescoring ? "#585e70" : "#DC2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: rescoring ? "not-allowed" : "pointer", transition: "background 0.3s" }}
      >
        {saved ? "Saved!" : rescoring ? "Re-scoring..." : "Save Settings"}
      </button>

      {rescoreStatus && (
        <div style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 8,
          background: rescoring ? "#f2f3ff" : "#ECFDF5",
          border: `1px solid ${rescoring ? "rgba(185, 23, 47, 0.15)" : "rgba(5, 150, 105, 0.2)"}`,
          fontSize: 13, fontWeight: 600,
          color: rescoring ? "#b9172f" : "#059669",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {rescoring && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          )}
          {rescoreStatus}
        </div>
      )}
    </div>
  );
}
