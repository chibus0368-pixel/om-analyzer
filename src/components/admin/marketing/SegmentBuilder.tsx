"use client";

import { useEffect, useRef, useState } from "react";
import { api, C, Field, inputStyle } from "./ui";

export interface SegmentUI {
  audience: "all" | "users" | "leads";
  tiers?: string[];
  deals?: "any" | "none" | "some";
  signedUpWithinDays?: number | null;
  inactiveForDays?: number | null;
  includeEmails?: string;
}

export function SegmentBuilder({ value, onChange }: { value: SegmentUI; onChange: (s: SegmentUI) => void }) {
  const [count, setCount] = useState<{ count: number; label: string; sample: string[] } | null>(null);
  const t = useRef<any>(null);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => { api({ body: { action: "segmentCount", segment: value } }).then(setCount).catch(() => setCount(null)); }, 400);
    return () => clearTimeout(t.current);
  }, [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<SegmentUI>) => onChange({ ...value, ...patch });
  const tiers = value.tiers || [];
  const toggleTier = (tier: string) => set({ tiers: tiers.includes(tier) ? tiers.filter(x => x !== tier) : [...tiers, tier] });
  const num = (v: string) => (v ? Math.max(0, parseInt(v, 10) || 0) : null);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, background: "#FCFCFD" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <Field label="Audience">
          <select style={inputStyle} value={value.audience} onChange={e => set({ audience: e.target.value as any })}>
            <option value="all">Everyone</option>
            <option value="users">Registered users</option>
            <option value="leads">Leads + subscribers</option>
          </select>
        </Field>
        <Field label="Deals uploaded">
          <select style={inputStyle} value={value.deals || "any"} onChange={e => set({ deals: e.target.value as any })}>
            <option value="any">Any</option>
            <option value="none">None yet</option>
            <option value="some">At least one</option>
          </select>
        </Field>
        <Field label="Joined within (days)"><input style={inputStyle} type="number" min={0} value={value.signedUpWithinDays ?? ""} onChange={e => set({ signedUpWithinDays: num(e.target.value) })} placeholder="any" /></Field>
        <Field label="Inactive for (days)"><input style={inputStyle} type="number" min={0} value={value.inactiveForDays ?? ""} onChange={e => set({ inactiveForDays: num(e.target.value) })} placeholder="any" /></Field>
      </div>
      {value.audience !== "leads" && (
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10, fontSize: 13, color: C.sub }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Plan</span>
          {[["free", "Free"], ["pro", "Pro"], ["pro_plus", "Pro+"]].map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={tiers.includes(k)} onChange={() => toggleTier(k)} /> {l}
            </label>
          ))}
          <span style={{ fontSize: 12, color: C.faint }}>(none checked = all plans)</span>
        </div>
      )}
      <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
        {count ? <>Goes to <span style={{ color: C.limeDark, fontWeight: 800 }}>{count.count}</span> contact{count.count === 1 ? "" : "s"} <span style={{ color: C.faint, fontWeight: 500 }}>({count.label}; unsubscribes excluded)</span></> : "Counting..."}
      </div>
      {count && count.sample.length > 0 && <div style={{ fontSize: 12, color: C.faint, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{count.sample.join(", ")}{count.count > count.sample.length ? ", ..." : ""}</div>}
    </div>
  );
}
