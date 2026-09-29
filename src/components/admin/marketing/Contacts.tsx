"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Btn, C, Card, Empty, inputStyle, Notice, Pill, when } from "./ui";

interface Contact { email: string; name: string; type: "user" | "lead" | "subscriber"; tier: string; deals: number; createdAt: string; lastActiveAt: string; source: string; unsubscribed: boolean }

export default function Contacts({ onLoaded }: { onLoaded?: (c: Contact[]) => void }) {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const load = async () => {
    try { const r = await api({ view: "contacts" }); setRows(r.contacts); onLoaded?.(r.contacts); setErr(""); } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (rows || []).filter(c =>
    (type === "all" || (type === "unsub" ? c.unsubscribed : c.type === type)) &&
    (!q || c.email.includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()))), [rows, q, type]);

  const toggle = async (c: Contact) => {
    const action = c.unsubscribed ? "unsuppress" : "suppress";
    if (!window.confirm(c.unsubscribed ? `Re-subscribe ${c.email}? Only do this if they asked.` : `Unsubscribe ${c.email} from marketing emails?`)) return;
    try { await api({ body: { action, email: c.email } }); load(); } catch (e: any) { setErr(e.message); }
  };

  const csv = () => {
    const head = "email,name,type,plan,deals,joined,last_active,source,unsubscribed";
    const lines = shown.map(c => [c.email, c.name, c.type, c.tier, c.deals, c.createdAt, c.lastActiveAt, c.source, c.unsubscribed].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head, ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `scoreom-contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const r = rows || [];
    return { all: r.length, user: r.filter(c => c.type === "user").length, lead: r.filter(c => c.type === "lead").length, subscriber: r.filter(c => c.type === "subscriber").length, unsub: r.filter(c => c.unsubscribed).length };
  }, [rows]);

  return (
    <Card title="Contacts" right={<div style={{ display: "flex", gap: 8 }}>
      <input style={{ ...inputStyle, width: 220 }} placeholder="Search email or name" value={q} onChange={e => setQ(e.target.value)} />
      <Btn onClick={csv} disabled={!rows}>Export CSV</Btn>
    </div>}>
      {err && <Notice tone="error">{err}</Notice>}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {([["all", "All"], ["user", "Users"], ["lead", "Leads"], ["subscriber", "Subscribers"], ["unsub", "Unsubscribed"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setType(k)} style={{ padding: "5px 11px", borderRadius: 99, border: `1px solid ${type === k ? C.navy : C.line}`, background: type === k ? C.navy : "#fff", color: type === k ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {l} <span style={{ opacity: 0.7 }}>{counts[k]}</span>
          </button>
        ))}
      </div>
      {!rows ? <Empty>Loading contacts...</Empty> : shown.length === 0 ? <Empty>No contacts match.</Empty> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: C.faint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <th style={{ padding: "6px 8px" }}>Contact</th><th>Type</th><th>Plan</th><th>Deals</th><th>Joined</th><th>Last active</th><th></th>
            </tr></thead>
            <tbody>
              {shown.slice(0, 500).map(c => (
                <tr key={c.email} style={{ borderTop: `1px solid ${C.line}`, opacity: c.unsubscribed ? 0.55 : 1 }}>
                  <td style={{ padding: "8px" }}><div style={{ fontWeight: 600, color: C.ink }}>{c.email}</div>{c.name && <div style={{ color: C.sub, fontSize: 12 }}>{c.name}</div>}</td>
                  <td><Pill s={c.type === "user" ? "scheduled" : "draft"}>{c.type}</Pill>{c.unsubscribed && <> <Pill s="failed">unsubscribed</Pill></>}</td>
                  <td style={{ color: C.sub }}>{c.type === "user" ? (c.tier === "pro_plus" ? "Pro+" : c.tier) : "--"}</td>
                  <td style={{ color: C.sub }}>{c.type === "user" ? c.deals : "--"}</td>
                  <td style={{ color: C.sub }}>{when(c.createdAt)}</td>
                  <td style={{ color: C.sub }}>{when(c.lastActiveAt)}</td>
                  <td style={{ textAlign: "right" }}><Btn style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => toggle(c)}>{c.unsubscribed ? "Resubscribe" : "Unsubscribe"}</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 500 && <div style={{ fontSize: 12, color: C.faint, padding: 8 }}>Showing 500 of {shown.length}. Use search or export CSV for the rest.</div>}
        </div>
      )}
    </Card>
  );
}
