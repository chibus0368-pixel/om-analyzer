"use client";

import { type CSSProperties, type ReactNode } from "react";
import { getAuthInstance } from "@/lib/firebase";

export async function api<T = any>(opts: { view?: string; body?: any }): Promise<T> {
  const token = await getAuthInstance().currentUser?.getIdToken();
  const res = await fetch(`/api/admin/marketing${opts.view ? `?view=${opts.view}` : ""}`, {
    method: opts.body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const C = {
  ink: "#111827", sub: "#6B7280", faint: "#9CA3AF", line: "#E5E7EB", bg: "#F9FAFB",
  lime: "#84CC16", limeDark: "#4d7c0f", navy: "#0f172a", red: "#DC2626", amber: "#B45309", blue: "#2563EB",
};

export function Card({ children, style, title, right }: { children: ReactNode; style?: CSSProperties; title?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", padding: "18px 20px", ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, kind = "ghost", disabled, style, title }: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "dark" | "ghost" | "danger"; disabled?: boolean; style?: CSSProperties; title?: string;
}) {
  const k = {
    primary: { background: C.lime, color: C.navy, border: `1px solid ${C.lime}` },
    dark: { background: C.navy, color: "#fff", border: `1px solid ${C.navy}` },
    ghost: { background: "#fff", color: "#374151", border: `1px solid ${C.line}` },
    danger: { background: "#fff", color: C.red, border: "1px solid #FECACA" },
  }[kind];
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} style={{
      ...k, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, fontFamily: "inherit", whiteSpace: "nowrap", ...style,
    }}>{children}</button>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14,
  fontFamily: "inherit", color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box",
};

export function Field({ label, hint, children, style }: { label: string; hint?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "block", marginBottom: 12, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const PILL: Record<string, [string, string]> = {
  draft: ["#6B7280", "#F3F4F6"], scheduled: ["#2563EB", "#EFF6FF"], sending: ["#B45309", "#FEF3C7"],
  publishing: ["#B45309", "#FEF3C7"], processing: ["#B45309", "#FEF3C7"], sent: ["#15803d", "#DCFCE7"],
  published: ["#15803d", "#DCFCE7"], partial: ["#B45309", "#FEF3C7"], failed: ["#DC2626", "#FEE2E2"],
  active: ["#15803d", "#DCFCE7"], paused: ["#6B7280", "#F3F4F6"], ok: ["#15803d", "#DCFCE7"], warn: ["#B45309", "#FEF3C7"], bad: ["#DC2626", "#FEE2E2"],
};
export function Pill({ s, children }: { s: string; children?: ReactNode }) {
  const [c, b] = PILL[s] || PILL.draft;
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: c, background: b, textTransform: "capitalize", whiteSpace: "nowrap" }}>{children ?? s}</span>;
}

export function when(iso?: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** ISO -> value for <input type="datetime-local"> in the browser's timezone */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const t = { info: ["#1e40af", "#EFF6FF", "#BFDBFE"], warn: ["#92400e", "#FFFBEB", "#FDE68A"], error: ["#991b1b", "#FEF2F2", "#FECACA"], ok: ["#166534", "#F0FDF4", "#BBF7D0"] }[tone];
  return <div style={{ color: t[0], background: t[1], border: `1px solid ${t[2]}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "28px 12px", textAlign: "center", color: C.faint, fontSize: 14 }}>{children}</div>;
}
