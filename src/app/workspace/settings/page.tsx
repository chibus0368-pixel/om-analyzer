"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import {
  getUnderwritingDefaults,
  saveUnderwritingDefaults,
} from "@/lib/firestore/workspaces";
import {
  DEFAULT_UNDERWRITING,
  type UnderwritingDefaults,
} from "@/lib/types/workspace";

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
  const [defaults, setDefaults] = useState<UnderwritingDefaults>({ ...DEFAULT_UNDERWRITING });
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreStatus, setRescoreStatus] = useState("");

  // Hydrate from Firestore on workspace switch. Without this, every
  // reload showed the hardcoded baseline even if the user had saved
  // their own values, which defeated the whole point of a baseline.
  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspace?.id) {
      setDefaults({ ...DEFAULT_UNDERWRITING });
      setHydrated(true);
      return;
    }
    setHydrated(false);
    getUnderwritingDefaults(activeWorkspace.id)
      .then(d => { if (!cancelled) { setDefaults(d); setHydrated(true); } })
      .catch(() => { if (!cancelled) { setDefaults({ ...DEFAULT_UNDERWRITING }); setHydrated(true); } });
    return () => { cancelled = true; };
  }, [activeWorkspace?.id]);

  async function handleSave() {
    if (!user || !activeWorkspace) return;
    setSaveError(null);

    // 1. Persist to Firestore FIRST so any subsequent failure still
    //    leaves the baseline saved.
    try {
      await saveUnderwritingDefaults(activeWorkspace.id, defaults);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save settings");
      return;
    }

    // 2. Re-score all properties in this workspace with the new baseline.
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
      setRescoreStatus(`Done - ${scored} ${scored === 1 ? "property" : "properties"} re-scored.`);
    } catch (err) {
      setRescoreStatus("Could not re-score. Scores will update on next analysis.");
    }
    setRescoring(false);
    setTimeout(() => setRescoreStatus(""), 5000);
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
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
      <p style={{ fontSize: 14, color: "#5A7091", marginBottom: 24 }}>Configure your DealBoard preferences and default assumptions.</p>

      {/* Default Underwriting Assumptions */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Default Underwriting Assumptions</h2>
        <p style={{ fontSize: 13, color: "#5A7091", marginBottom: 16 }}>
          These values are the standardized baseline for every deal in this workspace. Deal Quick Screen and OM Reverse Pricing use them so scoring is comparable across properties. They override any debt or return assumptions in an OM.
        </p>
        {!hydrated && (
          <p style={{ fontSize: 12, color: "#4D7C0F", marginBottom: 12 }}>Loading saved values...</p>
        )}
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
            { key: "targetLeveredIrr", label: "Target Levered IRR (%)" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7091", display: "block", marginBottom: 4 }}>{f.label}</label>
              <input
                type="number"
                step="0.1"
                style={inputStyle}
                value={(defaults as any)[f.key]}
                onChange={e => setDefaults(d => ({ ...d, [f.key]: parseFloat(e.target.value) || 0 }))}
              />
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
        disabled={rescoring || !hydrated}
        className="ws-btn-red"
        style={{ padding: "10px 28px", background: saved ? "#059669" : rescoring ? "#585e70" : "#0F172A", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: (rescoring || !hydrated) ? "not-allowed" : "pointer", transition: "background 0.3s" }}
      >
        {saved ? "Saved!" : rescoring ? "Re-scoring..." : "Save Settings"}
      </button>
      {saveError && (
        <div style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 8,
          background: "#FEF2F2",
          border: "1px solid rgba(220, 38, 38, 0.25)",
          fontSize: 13, fontWeight: 600, color: "#991B1B",
        }}>
          {saveError}
        </div>
      )}

      {/* Sign Out */}
      <div style={{ ...cardStyle, marginTop: 32, borderColor: "#FEE2E2" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Sign Out</h2>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 16px" }}>Sign out of your DealSignals account on this device.</p>
        <button
          onClick={async () => {
            const { auth } = await import("@/lib/firebase");
            await auth.signOut();
            window.location.href = "/workspace/login";
          }}
          style={{
            padding: "9px 24px", background: "transparent", color: "#DC2626",
            border: "1.5px solid #FCA5A5", borderRadius: 8, fontSize: 13,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            transition: "all 0.2s ease",
          }}
        >
          Sign Out
        </button>
      </div>

      {rescoreStatus && (
        <div style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 8,
          background: rescoring ? "#f2f3ff" : "#ECFDF5",
          border: `1px solid ${rescoring ? "rgba(132, 204, 22, 0.15)" : "rgba(5, 150, 105, 0.2)"}`,
          fontSize: 13, fontWeight: 600,
          color: rescoring ? "#4D7C0F" : "#059669",
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
