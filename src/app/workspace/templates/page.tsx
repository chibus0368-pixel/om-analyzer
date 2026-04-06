"use client";

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 24,
};

const templates = [
  { name: "Deal Snapshot", desc: "One-page deal summary with key metrics, property details, and recommendation.", type: "deal_snapshot", format: "PDF" },
  { name: "Deal Brief", desc: "Multi-page investment memo with full analysis, comps, and risk assessment.", type: "deal_brief", format: "DOCX / PDF" },
  { name: "Pro Forma", desc: "Multi-year cash flow projection with debt service and return analysis.", type: "pro_forma", format: "XLSX / PDF" },
  { name: "Scorecard Report", desc: "Detailed scoring breakdown with category explanations and data confidence.", type: "scorecard", format: "PDF" },
  { name: "Export Package", desc: "Complete project archive with all documents, analysis, and outputs.", type: "export_package", format: "ZIP" },
];

export default function TemplatesPage() {
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Output Templates</h1>
      <p style={{ fontSize: 14, color: "#5A7091", marginBottom: 24 }}>Manage report templates and export configurations.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {templates.map(t => (
          <div key={t.type} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{t.name}</h3>
              <p style={{ fontSize: 13, color: "#5A7091", margin: 0 }}>{t.desc}</p>
              <span style={{ fontSize: 11, color: "#8899B0", marginTop: 4, display: "inline-block" }}>Format: {t.format}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ padding: "6px 14px", background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Preview
              </button>
              <button style={{ padding: "6px 14px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
