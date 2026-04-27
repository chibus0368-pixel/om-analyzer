"use client";

import { useState } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";

/**
 * Admin repair console.
 *
 * Two operations:
 *  1. Diagnose - calls /api/admin/diag-share with a shareId, prints field
 *     counts per property so we can see whether extracted_fields rows are
 *     missing entirely, orphaned, or attached to a different propertyId.
 *  2. Backfill - calls /api/admin/backfill-property with the same shareId
 *     to re-parse every property in the share from its source PDF and
 *     write fresh extracted_fields rows with the correct propertyId.
 *
 * Both endpoints require the caller's Firebase ID token to belong to the
 * admin email, so this page only works for the site owner.
 */
export default function AdminRepairPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [shareId, setShareId] = useState("TmvAn5SorT7K");
  const [busy, setBusy] = useState<"" | "diag" | "fix">("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function getToken(): Promise<string | null> {
    if (!user) return null;
    try {
      return await (user as any).getIdToken();
    } catch {
      return null;
    }
  }

  async function runDiag() {
    setBusy("diag");
    setResult(null);
    setError("");
    try {
      const t = await getToken();
      if (!t) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/diag-share?shareId=${encodeURIComponent(shareId)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ kind: "diag", data });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  }

  async function runBackfill() {
    if (!confirm(`Re-parse all properties in share "${shareId}"? This re-runs the full parse engine on each property's source PDF and may take 5+ minutes.`)) {
      return;
    }
    setBusy("fix");
    setResult(null);
    setError("");
    try {
      const t = await getToken();
      if (!t) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/backfill-property`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ kind: "backfill", data });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  }

  if (authLoading) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        Sign in required. <a href="/workspace/login">Sign in</a>.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        Admin access only.
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Admin Repair</h1>
      <p style={{ color: "#64748B", fontSize: 13, marginBottom: 24 }}>
        Diagnose missing extracted_fields / documents on a share, then re-parse to recover.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748B", marginBottom: 4 }}>
            Share ID
          </label>
          <input
            value={shareId}
            onChange={(e) => setShareId(e.target.value)}
            placeholder="TmvAn5SorT7K"
            style={{
              width: "100%", padding: "10px 12px", border: "1px solid #E2E8F0",
              borderRadius: 8, fontSize: 14, fontFamily: "monospace",
            }}
          />
        </div>
        <button
          onClick={runDiag}
          disabled={!!busy || !shareId.trim()}
          style={{
            padding: "10px 16px", background: "#0F172A", color: "#FFFFFF",
            border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13,
            cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === "diag" ? "Diagnosing..." : "1. Diagnose"}
        </button>
        <button
          onClick={runBackfill}
          disabled={!!busy || !shareId.trim()}
          style={{
            padding: "10px 16px", background: "#84CC16", color: "#FFFFFF",
            border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13,
            cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === "fix" ? "Re-parsing... (5 min)" : "2. Repair (re-parse)"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: 14, background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 8, color: "#991B1B", fontSize: 13, marginBottom: 16,
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result?.kind === "diag" && (
        <DiagResult data={result.data} />
      )}

      {result?.kind === "backfill" && (
        <BackfillResult data={result.data} />
      )}
    </div>
  );
}

function DiagResult({ data }: { data: any }) {
  const props = data?.properties || [];
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>
        Diagnosis - {data.propertiesCount} properties in share
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
              <th style={th}>Property</th>
              <th style={th}>Property ID</th>
              <th style={thN}>Fields by propId</th>
              <th style={thN}>Project total</th>
              <th style={thN}>Orphaned (no propId)</th>
              <th style={thN}>Attached to another</th>
              <th style={thN}>Parser runs</th>
              <th style={thN}>Documents</th>
            </tr>
          </thead>
          <tbody>
            {props.map((p: any) => {
              const c = p.counts || {};
              const ok = c.fieldsByPropertyId > 0;
              return (
                <tr key={p.propertyId} style={{ borderBottom: "1px solid #F1F5F9", background: ok ? "#F0FDF4" : "#FEF2F2" }}>
                  <td style={td}>{p.propertyName}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{p.propertyId}</td>
                  <td style={tdN}><strong style={{ color: ok ? "#15803D" : "#B91C1C" }}>{c.fieldsByPropertyId ?? 0}</strong></td>
                  <td style={tdN}>{c.fieldsByProjectIdTotal ?? 0}</td>
                  <td style={tdN}>{c.fieldsByProjectIdOrphaned ?? 0}</td>
                  <td style={tdN}>{c.fieldsByProjectIdAttachedToOtherProperty ?? 0}</td>
                  <td style={tdN}>{c.parserRunsForProject ?? 0}</td>
                  <td style={tdN}>{c.documentsForProperty ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#64748B" }}>Raw JSON</summary>
        <pre style={{ fontSize: 11, background: "#0F172A", color: "#E2E8F0", padding: 16, borderRadius: 8, overflow: "auto", maxHeight: 400 }}>
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function BackfillResult({ data }: { data: any }) {
  const results = data?.results || [];
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>
        Backfill complete - {data.processed} properties processed
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
            <th style={th}>Property ID</th>
            <th style={th}>Status</th>
            <th style={tdN}>New field count</th>
            <th style={th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r: any, i: number) => (
            <tr key={r.propertyId || i} style={{ borderBottom: "1px solid #F1F5F9", background: r.ok ? "#F0FDF4" : "#FEF2F2" }}>
              <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{r.propertyId}</td>
              <td style={td}><strong style={{ color: r.ok ? "#15803D" : "#B91C1C" }}>{r.ok ? "OK" : "FAILED"}</strong></td>
              <td style={tdN}>{r.newFieldCount ?? "-"}</td>
              <td style={{ ...td, fontSize: 11, color: "#64748B" }}>{r.error || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16, fontSize: 13, color: "#64748B" }}>
        Refresh the share page to verify tabs are back.
      </p>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "#64748B" };
const thN: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#0F172A" };
const tdN: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
