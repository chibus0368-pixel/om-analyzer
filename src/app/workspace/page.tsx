"use client";

import { useEffect, useState, useRef } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getProjectDocuments, deleteProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Property, ProjectDocument } from "@/lib/workspace/types";
import Link from "next/link";

function ClearAllButton({ onClear, workspaceId, workspaceName }: { onClear: () => void; workspaceId: string; workspaceName: string }) {
  const [clearing, setClearing] = useState(false);
  async function handleClear() {
    if (!confirm(`⚠️ This will delete all properties and data in "${workspaceName}".\n\nThis cannot be undone. Continue?`)) return;
    if (!confirm(`Final confirmation: Delete all properties in "${workspaceName}"?`)) return;
    setClearing(true);
    // Delete only properties (and related data) belonging to this workspace
    const collections = [
      "workspace_properties", "workspace_projects", "workspace_documents",
      "workspace_extracted_fields", "workspace_underwriting_models",
      "workspace_underwriting_outputs", "workspace_scores",
      "workspace_property_snapshots", "workspace_outputs", "workspace_notes",
      "workspace_tasks", "workspace_activity_logs", "workspace_parser_runs",
    ];
    // First get all property IDs in this workspace
    try {
      // Get properties assigned to this workspace, plus any unmigrated ones (userId match, no workspaceId)
      const propSnap = await getDocs(query(collection(db, "workspace_properties"), where("workspaceId", "==", workspaceId)));
      const allUserSnap = await getDocs(query(collection(db, "workspace_properties"), where("userId", "==", "admin-user")));
      const unmigratedDocs = allUserSnap.docs.filter(d => !d.data().workspaceId);
      const allDocs = [...propSnap.docs, ...unmigratedDocs];
      // Deduplicate
      const seenIds = new Set<string>();
      const dedupedDocs = allDocs.filter(d => { if (seenIds.has(d.id)) return false; seenIds.add(d.id); return true; });
      const propIds = dedupedDocs.map(d => d.id);
      const projectIds = dedupedDocs.map(d => d.data().projectId).filter(Boolean);

      // Delete properties
      for (let i = 0; i < dedupedDocs.length; i += 450) {
        const batch = writeBatch(db);
        dedupedDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Delete related data by propertyId or projectId
      for (const coll of collections.filter(c => c !== "workspace_properties")) {
        try {
          // Try by propertyId
          for (const pid of propIds) {
            const snap = await getDocs(query(collection(db, coll), where("propertyId", "==", pid)));
            for (let i = 0; i < snap.docs.length; i += 450) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
          // Try by projectId
          for (const pid of projectIds) {
            const snap = await getDocs(query(collection(db, coll), where("projectId", "==", pid)));
            for (let i = 0; i < snap.docs.length; i += 450) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
        } catch { /* continue */ }
      }
    } catch { /* continue */ }
    setClearing(false);
    onClear();
  }
  return (
    <button onClick={handleClear} disabled={clearing} style={{
      padding: "6px 14px", background: "#FDE8EA", color: "#C52D3A", border: "1px solid #C52D3A",
      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: clearing ? "not-allowed" : "pointer", fontFamily: "inherit",
    }}>
      {clearing ? "Clearing..." : "Clear All Data"}
    </button>
  );
}

function PropertyMap({ properties }: { properties: Property[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current || properties.length === 0) return;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const loadLeaflet = () => new Promise<any>((resolve) => {
      if ((window as any).L) return resolve((window as any).L);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => resolve((window as any).L);
      document.head.appendChild(script);
    });

    async function initMap() {
      const L = await loadLeaflet();
      if (!mapRef.current || mapLoaded) return;

      // Create map centered on Wisconsin
      const map = L.map(mapRef.current).setView([43.0, -88.5], 9);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Geocode each property and add markers
      const bounds: any[] = [];
      for (const prop of properties) {
        const addr = [prop.address1, prop.city, prop.state].filter(Boolean).join(", ");
        if (!addr || addr === ", ") continue;

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`, {
            headers: { "User-Agent": "NNNTripleNet-DealAnalyzer/1.0" },
          });
          const data = await res.json();
          if (data && data[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            bounds.push([lat, lng]);

            const status = (prop as any).parseStatus || "pending";
            const color = status === "parsed" ? "#10B981" : "#F59E0B";

            const icon = L.divIcon({
              html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">$</div>`,
              className: "",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });

            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.bindPopup(`
              <div style="min-width:180px;font-family:Inter,sans-serif;">
                <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${prop.propertyName}</div>
                <div style="font-size:11px;color:#5A7091;margin-bottom:8px;">${addr}</div>
                <a href="/workspace/properties/${prop.id}" style="display:inline-block;padding:4px 12px;background:#DC2626;color:#fff;border-radius:4px;text-decoration:none;font-size:11px;font-weight:600;">View Property</a>
              </div>
            `);
          }
        } catch {
          // Geocoding failed for this property — skip
        }
      }

      // Fit map to show all markers
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      }

      setMapLoaded(true);
    }

    initMap();
  }, [properties, mapLoaded]);

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #EDF0F5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Property Map</h2>
        <span style={{ fontSize: 11, color: "#8899B0" }}>{properties.length} properties</span>
      </div>
      <div ref={mapRef} style={{ height: 320, width: "100%" }} />
    </div>
  );
}

export default function WorkspaceDashboard() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [properties, setProperties] = useState<Property[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);
    Promise.all([
      getWorkspaceProperties(user.uid, activeWorkspace.id),
    ]).then(async ([props]) => {
      setProperties(props);
      // Load all documents for all properties
      try {
        const allDocs: ProjectDocument[] = [];
        for (const prop of props) {
          const docs = await getProjectDocuments(prop.projectId, prop.id);
          allDocs.push(...docs);
        }
        setDocuments(allDocs);
      } catch {
        // ignore
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, activeWorkspace]);

  const parsed = properties.filter(p => (p as any).parseStatus === "parsed");
  const pending = properties.filter(p => (p as any).parseStatus === "pending");

  const kpis = [
    { label: "Total Properties", value: properties.length, color: "#2563EB" },
    { label: "Total Files", value: documents.length, color: "#10B981" },
    { label: "Properties Parsed", value: parsed.length, color: "#059669" },
    { label: "Properties Pending", value: pending.length, color: "#F59E0B" },
  ];

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#5A7091" }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0B1120", margin: 0 }}>Dashboard{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}</h1>
          <p style={{ fontSize: 14, color: "#5A7091", marginTop: 4 }}>Your deal workspace at a glance</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workspace/upload" className="ws-btn-secondary" style={{ padding: "8px 18px", background: "#fff", border: "1.5px solid #D8DFE9", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#253352", textDecoration: "none", cursor: "pointer" }}>
            Add Property
          </Link>
          <Link href="/workspace/scoreboard" className="ws-btn-red" style={{ padding: "8px 18px", background: "#DC2626", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", cursor: "pointer" }}>
            View Scoreboard
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #EDF0F5" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#5A7091", textTransform: "uppercase", letterSpacing: "0.5px" }}>{kpi.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: kpi.color, marginTop: 4 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
        {/* Properties List */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #EDF0F5" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Properties ({properties.length})</h2>
          </div>
          {properties.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#8899B0" }}>
              <p style={{ fontSize: 14 }}>No properties yet. Start by adding your first property.</p>
              <Link href="/workspace/upload" className="ws-btn-red" style={{ display: "inline-block", marginTop: 12, padding: "8px 20px", background: "#DC2626", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                + Add Property
              </Link>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F6F8FB" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Property</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Location</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Files</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Status</th>
                  <th style={{ padding: "10px 8px", width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {properties.map(p => {
                  const propDocs = documents.filter(d => d.propertyId === p.id);
                  const status = (p as any).parseStatus || "pending";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #EDF0F5", cursor: "pointer" }} onClick={() => window.location.href = `/workspace/properties/${p.id}`}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#0B1120" }}>{p.propertyName}</div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#5A7091" }}>
                        {[p.city, p.state].filter(Boolean).join(", ") || "--"}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0B1120" }}>
                        {propDocs.length}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 10,
                          fontSize: 11, fontWeight: 600,
                          color: status === "parsed" ? "#0A7E5A" : "#F59E0B",
                          background: status === "parsed" ? "#D1FAE5" : "#FFFBF0",
                        }}>
                          {status === "parsed" ? "Parsed" : "Pending"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${p.propertyName}"?`)) {
                              await deleteProperty(p.id, p.projectId || "workspace-default");
                              window.location.reload();
                            }
                          }}
                          style={{ background: "none", border: "none", color: "#B4C1D1", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}
                          title="Delete property"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stats */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Workspace Stats</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Total Properties", value: properties.length, color: "#2563EB" },
                { label: "Total Files", value: documents.length, color: "#10B981" },
                { label: "Parsed", value: parsed.length, color: "#059669" },
                { label: "Pending", value: pending.length, color: "#F59E0B" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#5A7091", fontWeight: 500 }}>{s.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Quick Actions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { href: "/workspace/upload", label: "Add Property", icon: "+" },
                { href: "/workspace/scoreboard", label: "View Scoreboard", icon: "\u2261" },
                { href: "/workspace/settings", label: "Settings", icon: "\u2699" },
              ].map(a => (
                <Link
                  key={a.href}
                  href={a.href}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    background: "#F6F8FB", borderRadius: 8, textDecoration: "none",
                    color: "#253352", fontSize: 13, fontWeight: 500,
                  }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: "#EDF0F5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>
                    {a.icon}
                  </span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Danger Zone */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #FDE8EA", padding: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "#C52D3A" }}>Clear Workspace</h2>
            <p style={{ fontSize: 12, color: "#5A7091", margin: "0 0 10px" }}>Delete all properties and data in &ldquo;{activeWorkspace?.name}&rdquo;. Cannot be undone.</p>
            <ClearAllButton onClear={() => window.location.reload()} workspaceId={activeWorkspace?.id || ""} workspaceName={activeWorkspace?.name || "this workspace"} />
          </div>
        </div>
      </div>
    </div>
  );
}
