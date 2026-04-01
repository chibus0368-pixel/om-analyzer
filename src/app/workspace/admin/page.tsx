"use client";

import { useEffect, useState } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import Link from "next/link";

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 24,
};

const sections = [
  { id: "dashboard", label: "Dashboard", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z" },
  { id: "users", label: "User Management", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" },
  { id: "parser", label: "Parser Monitor", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "scoring", label: "Scoring Models", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  { id: "prompts", label: "Prompt Templates", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "storage", label: "Storage Manager", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" },
];

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0B1120" }}>Admin Access Required</h2>
        <p style={{ fontSize: 14, color: "#5A7091", marginTop: 8 }}>You need admin privileges to access this page.</p>
        <Link href="/workspace" style={{ color: "#C49A3C", fontSize: 14, fontWeight: 600 }}>Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px" }}>Admin Panel</h1>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: activeSection === s.id ? "#F6F8FB" : "transparent",
                border: activeSection === s.id ? "1px solid #EDF0F5" : "1px solid transparent",
                borderRadius: 8, fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
                color: activeSection === s.id ? "#0B1120" : "#5A7091",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {activeSection === "dashboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {[
                { label: "Total Users", value: "1", color: "#2563EB" },
                { label: "Active Projects", value: "--", color: "#10B981" },
                { label: "Storage Used", value: "--", color: "#F59E0B" },
                { label: "Parser Success Rate", value: "--", color: "#10B981" },
                { label: "Failed Jobs", value: "0", color: "#DC3545" },
                { label: "Outputs This Week", value: "0", color: "#8B5CF6" },
              ].map(kpi => (
                <div key={kpi.label} style={cardStyle}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7091", textTransform: "uppercase", letterSpacing: 0.5 }}>{kpi.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, marginTop: 4 }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          )}
          {activeSection === "parser" && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Parser Job Monitor</h2>
              <p style={{ color: "#8899B0", fontSize: 13 }}>No parser jobs yet. Upload documents and trigger parsing to see jobs here.</p>
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {["Queued", "Running", "Completed", "Failed"].map(s => (
                  <div key={s} style={{ background: "#F6F8FB", borderRadius: 8, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7091", textTransform: "uppercase" }}>{s}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>0</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeSection === "scoring" && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Scoring Model Manager</h2>
              <p style={{ color: "#5A7091", fontSize: 13, marginBottom: 16 }}>Configure scoring weights for deal evaluation.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Pricing", weight: 15 }, { label: "Cash Flow", weight: 15 },
                  { label: "Upside", weight: 10 }, { label: "Tenant Quality", weight: 12 },
                  { label: "Rollover Risk", weight: 10 }, { label: "Vacancy", weight: 8 },
                  { label: "Location", weight: 10 }, { label: "Physical Condition", weight: 8 },
                  { label: "Redevelopment", weight: 5 }, { label: "Data Confidence", weight: 7 },
                ].map(cat => (
                  <div key={cat.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#F6F8FB", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="number" defaultValue={cat.weight} style={{ width: 50, padding: "4px 8px", border: "1px solid #D8DFE9", borderRadius: 6, fontSize: 13, textAlign: "center" as const, fontFamily: "inherit" }} />
                      <span style={{ fontSize: 11, color: "#8899B0" }}>%</span>
                    </div>
                  </div>
                ))}
              </div>
              <button style={{ marginTop: 16, padding: "8px 20px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save Weights</button>
            </div>
          )}
          {(activeSection === "users" || activeSection === "prompts" || activeSection === "storage") && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
                {sections.find(s => s.id === activeSection)?.label}
              </h2>
              <p style={{ color: "#8899B0", fontSize: 13 }}>This section will be available in the next release.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
