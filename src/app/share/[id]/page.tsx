"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";


interface ExtractedField {
  fieldGroup: string;
  fieldName: string;
  rawValue?: string;
  normalizedValue?: string;
  userOverrideValue?: string;
  isUserOverridden?: boolean;
}

interface SharedProperty {
  id: string;
  propertyName: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  buildingSf?: number;
  yearBuilt?: number;
  occupancyPct?: number;
  heroImageUrl?: string;
  extractedFields: ExtractedField[];
  documents: { id: string; originalFilename: string; docCategory: string; fileExt: string; storagePath?: string; fileSizeBytes?: number }[];
}

interface ShareConfig {
  displayName: string;
  whiteLabel: boolean;
  hideDocuments: boolean;
  workspaceName: string;
  contactName: string;
  contactAgency: string;
  contactPhone: string;
}

type ViewMode = "list" | "detail";

function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmt$(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return `${n.toFixed(2)}%`;
}

function fmtSF(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return `${Math.round(n).toLocaleString()} SF`;
}

/* ─── Map Control Button ─── */
function MapBtn({ onClick, title, children, style }: { onClick: () => void; title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
        background: "#fff", border: "1px solid #d1d5db", borderRadius: 6,
        cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        color: "#374151", ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Metric Card ─── */
function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  if (!value || value === "--") return null;
  return (
    <div style={{
      padding: "12px 14px", background: "#fff", borderRadius: 8,
      border: "1px solid #e5e7eb",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? "#65A30D" : "#151b2b" }}>{value}</div>
    </div>
  );
}

export default function SharedViewPage() {
  const params = useParams();
  const shareId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [properties, setProperties] = useState<SharedProperty[]>([]);
  const [selectedProp, setSelectedProp] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundsRef = useRef<[number, number][]>([]);
  const markersRef = useRef<any[]>([]);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    if (!shareId) return;
    fetch(`/api/share/${shareId}`)
      .then(res => {
        if (!res.ok) throw new Error("Link not found or deactivated");
        return res.json();
      })
      .then(data => {
        setConfig(data.share);
        setProperties(data.properties || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || "Failed to load");
        setLoading(false);
      });
  }, [shareId]);

  const fitAllBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || boundsRef.current.length === 0) return;
    map.fitBounds(boundsRef.current, { padding: [50, 50], maxZoom: 13 });
  }, []);

  const flyToProperty = useCallback((propId: string) => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    const marker = markersRef.current.find(m => m._propId === propId);
    if (marker) {
      const ll = marker.getLatLng();
      map.flyTo([ll.lat, ll.lng], 14, { duration: 0.8 });
      marker.openPopup();
    }
  }, []);

  function openPropertyDetail(propId: string) {
    setSelectedProp(propId);
    setViewMode("detail");
    flyToProperty(propId);
  }

  function backToList() {
    setViewMode("list");
    setSelectedProp(null);
    setTimeout(fitAllBounds, 100);
  }

  // Initialize map
  useEffect(() => {
    if (loading || error || properties.length === 0 || !mapRef.current) return;

    let cancelled = false;

    async function initMap() {
      const L = (await import("leaflet")).default || await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      leafletRef.current = L;

      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: false, scrollWheelZoom: true })
        .setView([39.8, -98.5], 5);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;

      const bounds: [number, number][] = [];
      const markers: any[] = [];

      for (const prop of properties) {
        let lat = prop.latitude || null;
        let lng = prop.longitude || null;

        if (!lat || !lng) {
          const eLat = gf(prop.extractedFields, "property_basics", "latitude");
          const eLng = gf(prop.extractedFields, "property_basics", "longitude");
          if (eLat && eLng) {
            lat = parseFloat(eLat);
            lng = parseFloat(eLng);
            if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null; }
          }
        }

        if (!lat || !lng) {
          const parts = [prop.address1, prop.city, prop.state].filter(Boolean);
          const address = parts.length >= 2 ? parts.join(", ") : null;
          if (address) {
            try {
              const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.lat && data.lng) { lat = data.lat; lng = data.lng; }
              }
            } catch { /* skip */ }
          }
        }

        if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
        if (cancelled) return;

        bounds.push([lat, lng]);

        const fields = prop.extractedFields;
        const price = gf(fields, "pricing_deal_terms", "asking_price");
        const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
        const signal = gf(fields, "signals", "overall_signal") || "";

        let pinColor = "#2563EB";
        if (signal.includes("\u{1F7E2}")) pinColor = "#10B981";
        else if (signal.includes("\u{1F534}")) pinColor = "#EF4444";
        else if (signal.includes("\u{1F7E1}")) pinColor = "#F59E0B";

        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50%;background:${pinColor};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;">$</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker._propId = prop.id;

        const popupHtml = `
          <div style="min-width:200px;font-family:Inter,system-ui,sans-serif;padding:4px 0;">
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#151b2b;">${prop.propertyName}</div>
            <div style="font-size:11px;color:#585e70;margin-bottom:8px;">${addr}</div>
            ${price ? `<div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">Price</div><div style="font-size:14px;font-weight:700;margin-bottom:6px;">${fmt$(price)}</div>` : ""}
            ${capRate ? `<div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">Cap Rate</div><div style="font-size:14px;font-weight:700;">${fmtPct(capRate)}</div>` : ""}
          </div>
        `;
        marker.bindPopup(popupHtml, { maxWidth: 260 });
        marker.on("click", () => {
          setSelectedProp(prop.id);
          setViewMode("detail");
        });

        markers.push(marker);
      }

      boundsRef.current = bounds;
      markersRef.current = markers;

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      }

      setTimeout(() => map.invalidateSize(), 200);
    }

    initMap().catch(console.error);
    return () => { cancelled = true; };
  }, [loading, error, properties]);

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f8fc", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 32, height: 32, border: "3px solid #e5e7eb",
            borderTopColor: "#2563EB", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 13, color: "#585e70" }}>Loading shared properties...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f8fc", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8DFE9" strokeWidth="1.5" style={{ margin: "0 auto 16px", display: "block" }}>
            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#151b2b", margin: "0 0 8px" }}>Link Not Available</h2>
          <p style={{ fontSize: 13, color: "#585e70" }}>This shareable link may have expired or been deactivated by the owner.</p>
        </div>
      </div>
    );
  }

  const showBranding = !config?.whiteLabel;
  const title = config?.displayName || config?.workspaceName || "Shared Properties";
  const detailProp = selectedProp ? properties.find(p => p.id === selectedProp) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fc", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .share-card { transition: all 0.15s ease; }
        .share-card:hover { box-shadow: 0 8px 24px rgba(21,27,43,0.1) !important; transform: translateY(-1px); }
        .detail-slide { animation: slideIn 0.2s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Header - dark branded bar matching workspace */}
      <header style={{
        background: "#0b1326", padding: "0 24px", height: 56, display: "flex",
        alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {showBranding && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <img
                src="/images/dealsignals-full-logo4.png"
                alt="DealSignals"
                style={{ height: 32, width: "auto", display: "block" }}
              />
            </div>
          )}
          {showBranding && <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />}
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{title}</h1>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)",
            padding: "3px 10px", borderRadius: 4,
          }}>
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(config?.contactName || config?.contactAgency || config?.contactPhone) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>Shared by</span>
              {config?.contactName && (
                <span style={{ fontWeight: 700, color: "#FFFFFF" }}>{config.contactName}</span>
              )}
              {config?.contactAgency && (
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{config.contactAgency}</span>
              )}
              {config?.contactPhone && (
                <a href={`tel:${config.contactPhone}`} style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
                  {config.contactPhone}
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main layout: map + sidebar */}
      <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>
        {/* Map */}
        <div style={{ flex: 1, position: "relative" }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

          {/* Map Controls - top-right overlay */}
          <div style={{
            position: "absolute", top: 12, right: 12, zIndex: 1000,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <MapBtn onClick={() => mapInstanceRef.current?.zoomIn()} title="Zoom in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </MapBtn>
            <MapBtn onClick={() => mapInstanceRef.current?.zoomOut()} title="Zoom out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </MapBtn>
            <div style={{ height: 4 }} />
            <MapBtn onClick={fitAllBounds} title="Fit all properties" style={{ color: "#2563EB" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </MapBtn>
          </div>

          {/* Property count pill - bottom-left */}
          <div style={{
            position: "absolute", bottom: 28, left: 12, zIndex: 1000,
            background: "#fff", borderRadius: 20, padding: "6px 14px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 12, fontWeight: 600, color: "#151b2b",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}
          </div>
        </div>

        {/* Sidebar - list or detail view */}
        <div style={{
          width: 420, minWidth: 420, background: "#fff", overflow: "auto",
          borderLeft: "1px solid #e5e7eb",
        }}>
          {viewMode === "detail" && detailProp ? (
            /* ─── Property Detail View ─── */
            <PropertyDetail
              prop={detailProp}
              config={config}
              onBack={backToList}
              onLocate={() => flyToProperty(detailProp.id)}
              properties={properties}
              onNavigate={openPropertyDetail}
            />
          ) : (
            /* ─── Property List View ─── */
            <>
              <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#151b2b", letterSpacing: "-0.02em" }}>Properties</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Click a property to view full details</div>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {properties.map(prop => {
                  const fields = prop.extractedFields;
                  const price = gf(fields, "pricing_deal_terms", "asking_price");
                  const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
                  const noi = gf(fields, "expenses", "noi_om");
                  const gla = gf(fields, "property_basics", "building_sf") || prop.buildingSf;
                  const signal = gf(fields, "signals", "overall_signal") || "";
                  const tenantName = gf(fields, "tenant_info", "tenant_name") || gf(fields, "tenant_info", "primary_tenant");
                  const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");

                  return (
                    <div
                      key={prop.id}
                      className="share-card"
                      onClick={() => openPropertyDetail(prop.id)}
                      style={{
                        background: "#fff",
                        border: selectedProp === prop.id ? "2px solid #2563EB" : "1px solid #e5e7eb",
                        borderRadius: 10, overflow: "hidden", cursor: "pointer",
                      }}
                    >
                      {prop.heroImageUrl && (
                        <div style={{
                          height: 100, background: `url(${prop.heroImageUrl}) center/cover no-repeat`,
                          borderBottom: "1px solid #e5e7eb",
                        }} />
                      )}
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#151b2b", margin: "0 0 2px" }}>
                              {prop.propertyName}
                            </h3>
                            <p style={{ fontSize: 11, color: "#585e70", margin: "0 0 8px" }}>{addr || "-"}</p>
                          </div>
                          {/* Arrow indicator */}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>

                        {/* Quick metrics row */}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {price && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Price</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#151b2b" }}>{fmt$(price)}</div>
                            </div>
                          )}
                          {capRate && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Cap Rate</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#151b2b" }}>{fmtPct(capRate)}</div>
                            </div>
                          )}
                          {noi && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>NOI</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#151b2b" }}>{fmt$(noi)}</div>
                            </div>
                          )}
                          {gla && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>GLA</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#151b2b" }}>{fmtSF(gla)}</div>
                            </div>
                          )}
                        </div>

                        {/* Bottom row: tenant + signal */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                          {tenantName && (
                            <span style={{ fontSize: 11, color: "#585e70", background: "#f8fafc", padding: "2px 8px", borderRadius: 4, border: "1px solid #f1f5f9" }}>
                              {tenantName}
                            </span>
                          )}
                          {signal && (
                            <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 4,
                              background: signal.includes("\u{1F7E2}") ? "rgba(16,185,129,0.08)"
                                : signal.includes("\u{1F534}") ? "rgba(239,68,68,0.08)"
                                : "rgba(245,158,11,0.08)",
                              color: "#151b2b",
                            }}>
                              {signal}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {showBranding && (
                <div style={{
                  padding: "16px 20px", borderTop: "1px solid #e5e7eb",
                  textAlign: "center", fontSize: 10, color: "#94a3b8",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <div style={{ background: "#84CC16", padding: 2, borderRadius: 3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                      <path d="M3 12h3l3-9 6 18 3-9h3" />
                    </svg>
                  </div>
                  Deal Signals · CRE Intelligence
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Property Detail Component - full metrics view
   ═══════════════════════════════════════════════════════════════ */
function PropertyDetail({
  prop, config, onBack, onLocate, properties, onNavigate,
}: {
  prop: SharedProperty;
  config: ShareConfig | null;
  onBack: () => void;
  onLocate: () => void;
  properties: SharedProperty[];
  onNavigate: (id: string) => void;
}) {
  const fields = prop.extractedFields;
  const g = (group: string, name: string) => gf(fields, group, name);
  const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");

  // Current index for prev/next navigation
  const currentIdx = properties.findIndex(p => p.id === prop.id);
  const prevProp = currentIdx > 0 ? properties[currentIdx - 1] : null;
  const nextProp = currentIdx < properties.length - 1 ? properties[currentIdx + 1] : null;

  // ── Pricing & Deal Terms ──
  const pricingMetrics = [
    { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")), accent: true },
    { label: "Cap Rate (Stated)", value: fmtPct(g("pricing_deal_terms", "cap_rate_om")) },
    { label: "Price / SF", value: fmt$(g("pricing_deal_terms", "price_per_sf")) },
    { label: "Price / Acre", value: fmt$(g("pricing_deal_terms", "price_per_acre")) },
  ].filter(m => m.value && m.value !== "--");

  // ── Property Basics ──
  const basicsMetrics = [
    { label: "Building SF / GLA", value: fmtSF(g("property_basics", "building_sf") || prop.buildingSf) },
    { label: "Lot Size", value: g("property_basics", "lot_acres") ? `${g("property_basics", "lot_acres")} acres` : "--" },
    { label: "Year Built", value: g("property_basics", "year_built") || (prop.yearBuilt ? String(prop.yearBuilt) : "--") },
    { label: "Occupancy", value: fmtPct(g("property_basics", "occupancy_pct") || prop.occupancyPct) },
    { label: "Tenant Count", value: g("property_basics", "tenant_count") || "--" },
    { label: "WALE", value: g("property_basics", "wale_years") ? `${g("property_basics", "wale_years")} yrs` : (g("rent_roll", "wale") ? `${g("rent_roll", "wale")} yrs` : "--") },
    { label: "Flood Zone", value: g("property_basics", "flood_zone") || "--" },
  ].filter(m => m.value && m.value !== "--");

  // ── Income & Expenses ──
  const incomeMetrics = [
    { label: "NOI (Stated)", value: fmt$(g("expenses", "noi_om")) },
    { label: "NOI (Adjusted)", value: fmt$(g("expenses", "noi_adjusted")) },
    { label: "CAM Expenses", value: fmt$(g("expenses", "cam_expenses")) },
    { label: "Property Taxes", value: fmt$(g("expenses", "property_taxes")) },
    { label: "Insurance", value: fmt$(g("expenses", "insurance")) },
    { label: "Management Fee", value: fmt$(g("expenses", "management_fee")) },
    { label: "Reserves", value: fmt$(g("expenses", "reserves")) },
    { label: "Total Expenses", value: fmt$(g("expenses", "total_expenses")) },
  ].filter(m => m.value && m.value !== "--");

  // ── Tenant Info ──
  const tenantName = g("tenant_info", "tenant_name") || g("tenant_info", "primary_tenant");
  const leaseExpiry = g("lease_info", "lease_expiration") || g("lease_info", "lease_end_date");
  const leaseType = g("lease_info", "lease_type");
  const rentEsc = g("lease_info", "rent_escalations") || g("lease_info", "escalation");
  const leaseStart = g("lease_info", "lease_start") || g("lease_info", "lease_commencement");

  // ── Rent Roll Tenants ──
  const tenantFields = fields.filter(f => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
  const tenantRows = tenantFields.map(tf => {
    const num = tf.fieldName.match(/\d+/)?.[0];
    const name = tf.isUserOverridden ? tf.userOverrideValue : tf.normalizedValue || tf.rawValue;
    return {
      name,
      sf: g("rent_roll", `tenant_${num}_sf`),
      rent: g("rent_roll", `tenant_${num}_rent`),
      type: g("rent_roll", `tenant_${num}_type`),
      end: g("rent_roll", `tenant_${num}_lease_end`),
    };
  }).filter(t => t.name);

  // ── Signals ──
  const signalItems = [
    ["Overall", g("signals", "overall_signal")],
    ["Cap Rate", g("signals", "cap_rate_signal")],
    ["Pricing", g("signals", "pricing_signal")],
    ["DSCR", g("signals", "dscr_signal")],
    ["Occupancy", g("signals", "occupancy_signal")],
    ["Location", g("signals", "location_signal")],
    ["Zoning", g("signals", "zoning_signal")],
    ["Basis / Price", g("signals", "basis_signal")],
    ["Tenant Quality", g("signals", "tenant_quality_signal")],
  ].filter(([, v]) => v) as [string, string][];

  const sectionTitle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8,
    color: "#94a3b8", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #f1f5f9",
  };

  return (
    <div className="detail-slide" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sticky nav bar */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 5,
      }}>
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#2563EB", padding: 0,
          fontFamily: "'Inter', sans-serif",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All Properties
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Locate on map */}
          <button onClick={onLocate} title="Locate on map" style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#f2f3ff", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", color: "#2563EB",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          </button>
          {/* Prev / Next */}
          <button
            onClick={() => prevProp && onNavigate(prevProp.id)}
            disabled={!prevProp}
            title="Previous property"
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
              cursor: prevProp ? "pointer" : "default", color: prevProp ? "#374151" : "#d1d5db",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 40, textAlign: "center" }}>
            {currentIdx + 1} / {properties.length}
          </span>
          <button
            onClick={() => nextProp && onNavigate(nextProp.id)}
            disabled={!nextProp}
            title="Next property"
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
              cursor: nextProp ? "pointer" : "default", color: nextProp ? "#374151" : "#d1d5db",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 18px" }}>
        {/* Hero image */}
        {prop.heroImageUrl && (
          <div style={{
            height: 160, borderRadius: 10, overflow: "hidden", marginBottom: 16,
            background: `url(${prop.heroImageUrl}) center/cover no-repeat`,
          }} />
        )}

        {/* Property name & address */}
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#151b2b", margin: "0 0 4px" }}>
          {prop.propertyName}
        </h2>
        <p style={{ fontSize: 12, color: "#585e70", margin: "0 0 20px", lineHeight: 1.4 }}>
          {addr || "-"}
        </p>

        {/* ── Pricing & Deal Terms ── */}
        {pricingMetrics.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Pricing & Deal Terms</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {pricingMetrics.map(m => (
                <MetricCard key={m.label} label={m.label} value={m.value} accent={m.accent} />
              ))}
            </div>
          </div>
        )}

        {/* ── Property Basics ── */}
        {basicsMetrics.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Property Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {basicsMetrics.map(m => (
                <MetricCard key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        )}

        {/* ── Income & Expenses ── */}
        {incomeMetrics.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Income & Expenses</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {incomeMetrics.map(m => (
                <MetricCard key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        )}

        {/* ── Tenant & Lease ── */}
        {(tenantName || leaseExpiry || leaseType || tenantRows.length > 0) && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Tenant & Lease</div>
            {/* Primary tenant info */}
            {(tenantName || leaseExpiry || leaseType) && (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", marginBottom: tenantRows.length > 0 ? 12 : 0 }}>
                {tenantName && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Primary Tenant</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#151b2b" }}>{tenantName}</div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {leaseType && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Lease Type</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#151b2b" }}>{leaseType}</div>
                    </div>
                  )}
                  {leaseStart && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Lease Start</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#151b2b" }}>{leaseStart}</div>
                    </div>
                  )}
                  {leaseExpiry && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Lease Expiry</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#151b2b" }}>{leaseExpiry}</div>
                    </div>
                  )}
                  {rentEsc && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8" }}>Escalations</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#151b2b" }}>{rentEsc}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rent Roll Table */}
            {tenantRows.length > 0 && (
              <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Tenant</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>SF</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Rent</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Lease End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantRows.map((t, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc", borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 600, color: "#151b2b" }}>{t.name}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#585e70" }}>{t.sf ? fmtSF(t.sf) : "--"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#585e70" }}>{t.rent ? fmt$(t.rent) : "--"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#585e70" }}>{t.end || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Signal Assessment ── */}
        {signalItems.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Signal Assessment</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {signalItems.map(([label, value]) => {
                const isOverall = label === "Overall";
                return (
                  <div
                    key={label}
                    style={{
                      padding: "10px 14px", borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      gridColumn: isOverall ? "1 / -1" : undefined,
                      background: value.includes("\u{1F7E2}") ? "rgba(16,185,129,0.04)"
                        : value.includes("\u{1F534}") ? "rgba(239,68,68,0.04)"
                        : "rgba(245,158,11,0.04)",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: isOverall ? 14 : 12, fontWeight: isOverall ? 700 : 600, color: "#151b2b" }}>{value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Documents ── */}
        {!config?.hideDocuments && prop.documents && prop.documents.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionTitle}>Source Documents</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {prop.documents.map(doc => (
                // Render as a native anchor so the browser handles the
                // download directly off the user's click gesture. The
                // previous implementation ran an async HEAD check before
                // calling window.open, which caused popup blockers to
                // swallow the new tab (the click was no longer considered
                // the originating gesture by the time open() ran). The
                // /api/share/[id]/download endpoint streams the file bytes
                // with Content-Disposition: attachment, so a plain link
                // with download attribute triggers the save dialog with
                // zero JS.
                <a key={doc.id}
                  href={doc.storagePath ? `/api/share/${shareId}/download?doc=${doc.id}` : undefined}
                  download={doc.originalFilename || true}
                  onClick={(e) => {
                    if (!doc.storagePath) {
                      e.preventDefault();
                      alert("No storage path recorded for this document.");
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                    background: "#f8fafc", borderRadius: 6, fontSize: 12, color: "#585e70",
                    border: "1px solid #e2e8f0", cursor: doc.storagePath ? "pointer" : "default",
                    fontFamily: "inherit", textAlign: "left", width: "100%",
                    transition: "background 0.15s", textDecoration: "none",
                  }}
                  onMouseEnter={e => { if (doc.storagePath) (e.currentTarget as HTMLElement).style.background = "#eef2f7"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    padding: "2px 6px", background: "#e2e8f0", borderRadius: 3, color: "#475569",
                    flexShrink: 0,
                  }}>
                    {doc.fileExt}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.originalFilename}
                  </span>
                  {doc.fileSizeBytes ? (
                    <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
                      {(doc.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  ) : null}
                  {doc.storagePath && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
