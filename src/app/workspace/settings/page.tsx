"use client";

import { useState } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #D8DFE9",
  borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 24,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [defaults, setDefaults] = useState({
    ltv: 65, interestRate: 6.5, amortYears: 25, holdYears: 10,
    exitCap: 7.0, vacancy: 5, rentGrowth: 2.5, expenseGrowth: 3.0,
  });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Settings</h1>
      <p style={{ fontSize: 14, color: "#5A7091", marginBottom: 24 }}>Configure your workspace preferences and default assumptions.</p>

      {/* Profile */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 5 }}>Email</label>
            <input style={inputStyle} value={user?.email || ""} disabled />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 5 }}>Display Name</label>
            <input style={inputStyle} defaultValue={user?.displayName || ""} placeholder="Your name" />
          </div>
        </div>
      </div>

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
        className="ws-btn-red"
        style={{ padding: "10px 28px", background: saved ? "#10B981" : "#DC2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "background 0.3s" }}
      >
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
