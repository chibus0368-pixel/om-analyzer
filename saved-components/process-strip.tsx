{/* ── Animated 3-step process strip ──
 * Styles needed (add to your <style> tag):
 *
 * .ds-process-connector {
 *   position: relative; height: 2px; flex: 1; min-width: 32px;
 *   background: rgba(255,255,255,0.1); overflow: hidden;
 *   border-radius: 1px; align-self: center;
 * }
 * .ds-process-connector::after {
 *   content: ''; position: absolute; left: 0; top: 0;
 *   height: 100%; width: 100%; background: #84CC16; border-radius: 1px;
 * }
 * @keyframes shimmer {
 *   0% { background-position: -200px 0; }
 *   100% { background-position: 200px 0; }
 * }
 */}

<div style={{
  display: "flex", alignItems: "center", gap: 0,
  marginBottom: 28, padding: "14px 0",
}}>
  {/* Step 1: Upload */}
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    background: "#1e1e28", borderRadius: 14, padding: "10px 16px",
    border: "1.5px solid rgba(255,255,255,0.12)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(132,204,22,0.08)",
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10, background: "#252532",
      border: "1.5px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <polyline points="9 15 12 12 15 15" />
      </svg>
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>Upload</div>
      <div style={{ fontSize: 9.5, color: "#9ca3af", fontWeight: 500 }}>PDF / XLS</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 2 }}>
      <div style={{ width: 16, height: 10, borderRadius: 2, background: "rgba(132,204,22,0.3)", border: "1px solid rgba(132,204,22,0.5)" }} />
      <div style={{ width: 16, height: 10, borderRadius: 2, background: "rgba(16,185,129,0.3)", border: "1px solid rgba(16,185,129,0.5)" }} />
    </div>
  </div>

  {/* Connector 1→2 */}
  <div className="ds-process-connector" />

  {/* Step 2: Extract */}
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    background: "#1e1e28", borderRadius: 14, padding: "10px 16px",
    border: "1.5px solid rgba(255,255,255,0.12)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(132,204,22,0.08)",
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10, background: "#252532",
      border: "1.5px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>Extract</div>
      <div style={{ fontSize: 9.5, color: "#9ca3af", fontWeight: 500 }}>47+ fields</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 2 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          height: 3, borderRadius: 2, width: [24, 18, 20][i],
          background: `linear-gradient(90deg, rgba(255,255,255,0.1) 0%, #84CC16 50%, rgba(255,255,255,0.1) 100%)`,
          backgroundSize: "200px 100%",
          animation: `shimmer 1.5s linear infinite ${i * 0.2}s`,
        }} />
      ))}
    </div>
  </div>

  {/* Connector 2→3 */}
  <div className="ds-process-connector" />

  {/* Step 3: Score */}
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    background: "#1e1e28", borderRadius: 14, padding: "10px 16px",
    border: "1.5px solid rgba(255,255,255,0.12)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(132,204,22,0.08)",
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10, background: "#252532",
      border: "1.5px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>Score</div>
      <div style={{ fontSize: 9.5, color: "#9ca3af", fontWeight: 500 }}>Deal metrics</div>
    </div>
    <svg width="32" height="32" viewBox="0 0 32 32" style={{ marginLeft: 2 }}>
      <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="#10b981" strokeWidth="3"
        strokeDasharray="75.4" strokeDashoffset="22" strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} />
      <text x="16" y="18" textAnchor="middle" fontSize="8" fontWeight="800" fill="#10b981">82</text>
    </svg>
  </div>
</div>
