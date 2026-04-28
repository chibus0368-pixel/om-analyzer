"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import DealQuickScreen from "@/components/workspace/DealQuickScreen";
import OmReversePricing from "@/components/workspace/OmReversePricing";
import RentRollDetailAnalysis from "@/components/workspace/RentRollDetailAnalysis";
import type { Property as InternalProperty, ExtractedField as InternalExtractedField } from "@/lib/workspace/types";
import DemographicsToggle from "@/components/demographics/DemographicsToggle";
import DemographicsOverlay from "@/components/demographics/DemographicsOverlay";


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

  // Demographics overlay state. Off by default; toggle pill in the map
  // header turns it on. We record per-property geocoded coords so the
  // overlay can pivot when the recipient picks a different deal.
  const [demographicsOn, setDemographicsOn] = useState(false);
  const [demographicsPropId, setDemographicsPropId] = useState<string | null>(null);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number }>>({});

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

  // Esc key returns to the map from the detail view. Ignored while typing
  // in inputs so field editing (if ever added) doesn't fight the shortcut.
  useEffect(() => {
    if (viewMode !== "detail") return;
    function handler(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      backToList();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

        // Record this property's coords so the demographics overlay can
        // pivot to it without re-geocoding when the toggle is enabled.
        const finalLat = lat as number;
        const finalLng = lng as number;
        setGeocodedCoords((prev) => ({ ...prev, [prop.id]: { lat: finalLat, lng: finalLng } }));

        const fields = prop.extractedFields;
        const price = gf(fields, "pricing_deal_terms", "asking_price");
        const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
        const signal = gf(fields, "signals", "overall_signal") || "";

        let pinColor = "#2563EB";
        if (signal.includes("\u{1F7E2}")) pinColor = "#4D7C0F";
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
          // Pivot the demographics overlay to whichever deal was clicked,
          // so toggling on later focuses on the user's last selection.
          setDemographicsPropId(prop.id);
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

  // Resolve focal demographics property: explicit click wins, then current
  // detail-view selection, then the first geocoded property.
  // MUST be declared before any early returns so hook order stays stable
  // across loading -> loaded transitions (React Rules of Hooks).
  const focalDemographicsProperty = useMemo(() => {
    if (!demographicsOn) return null;
    const id = demographicsPropId
      || selectedProp
      || properties.find((p) => geocodedCoords[p.id])?.id
      || null;
    if (!id) return null;
    const prop = properties.find((p) => p.id === id);
    const coords = geocodedCoords[id];
    if (!prop || !coords) return null;
    const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
    return {
      id,
      lat: coords.lat,
      lng: coords.lng,
      name: prop.propertyName,
      address: addr,
    };
  }, [demographicsOn, demographicsPropId, selectedProp, properties, geocodedCoords]);

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
    <div
      // Lock the page to one viewport on desktop so .detail-content owns
      // the only scrollbar in detail mode. Without this, the body grows
      // past 100vh on tall content and the browser-level scrollbar
      // appears OUTSIDE .share-sidebar — that's the second scrollbar
      // people were seeing to the right of the tab strip. Mobile @media
      // (max-width:900px) opts out and lets the page scroll naturally.
      className="share-page-root"
      style={{ minHeight: "100vh", height: "100vh", overflow: "hidden", background: "#f7f8fc", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .share-card { transition: all 0.15s ease; }
        .share-card:hover { box-shadow: 0 8px 24px rgba(21,27,43,0.1) !important; transform: translateY(-1px); }
        .detail-slide { animation: slideIn 0.2s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        /* On narrow screens, collapse the map and let the detail panel take
           the full width so the Quick Screen / Offer Scenarios tabs are
           actually usable. The "Back to Map" pill at the top of the detail
           panel returns to list mode which restores the map. */
        @media (max-width: 900px) {
          /* Phones use natural body scroll for the detail flow (the
             .share-sidebar-detail rule below opts the inner panel into
             auto overflow). Reverse the desktop lock here. */
          .share-page-root {
            height: auto !important;
            overflow: visible !important;
          }
          .share-sidebar-detail {
            width: 100% !important;
            min-width: 0 !important;
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            z-index: 20;
            box-shadow: 0 0 40px rgba(15,23,43,0.15);
            /* Mobile: flatten back to a single page scroll so the sticky
               back bar + tab strip work and there's no nested scroller.
               Inline style sets overflow:hidden for desktop's pinned tab
               strip pattern; this override re-enables outer scroll on
               narrow screens where .detail-content is overflow:visible. */
            overflow: auto !important;
          }
        }
        .back-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px 8px 10px;
          background: #0F172A;
          color: #fff;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.2px;
          box-shadow: 0 2px 6px rgba(15,23,43,0.22);
          transition: transform 0.1s ease, box-shadow 0.15s ease;
        }
        .back-pill:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15,23,43,0.28); }
        .back-pill:active { transform: translateY(0); }
        .back-pill-label-mobile { display: none; }
        .pd-tab-label-mobile { display: none; }
        .pd-tab {
          padding: 9px 14px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2px;
          background: transparent;
          color: #64748B;
          border: 1px solid transparent;
          border-bottom: none;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          cursor: pointer;
          margin-bottom: -1px;
          font-family: inherit;
          white-space: nowrap;
          transition: color 0.12s ease, background 0.12s ease;
        }
        .pd-tab:hover { color: #0F172A; background: rgba(15,23,43,0.04); }
        .pd-tab.active {
          background: #FFFFFF;
          color: #0F172A;
          border: 1px solid #e5e7eb;
          border-bottom-color: #FFFFFF;
          position: relative;
        }
        .pd-tab.active::before {
          content: "";
          position: absolute;
          top: -1px; left: -1px; right: -1px;
          height: 2px;
          background: #4D7C0F;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }
        /* ── iPhone / narrow-phone layout ────────────────────────────────
           Below 768px the 420px min-width sidebar forced the map to 0px
           or pushed the sidebar off-screen. Stack instead: map on top at
           a fixed short height, property list below it flowing to the
           bottom. Header contents collapse to fit a 375-390px viewport.
           Detail view is already full-screen via the max-width:900px rule
           above, so no changes needed there. */
        @media (max-width: 768px) {
          .share-header {
            height: auto !important;
            min-height: 52px;
            padding: 8px 12px !important;
            flex-wrap: wrap;
            gap: 6px !important;
          }
          .share-header > div:first-child {
            gap: 8px !important;
            flex-wrap: wrap;
          }
          .share-header-title {
            font-size: 13px !important;
            max-width: 60vw;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .share-header-contact {
            font-size: 11px !important;
            gap: 6px !important;
            width: 100%;
            justify-content: flex-start;
            padding-top: 2px;
          }
          /* Drop the "Shared by" preamble + agency on small screens to
             keep the header to one short line; name + phone link remain. */
          .share-contact-label,
          .share-contact-agency {
            display: none !important;
          }
          .share-main {
            flex-direction: column !important;
            height: auto !important;
            min-height: calc(100vh - 72px);
          }
          .share-map {
            flex: 0 0 auto !important;
            height: 38vh !important;
            min-height: 220px;
            max-height: 360px;
          }
          /* Sidebar in list mode: full width, below the map, no left border
             (top border instead so the seam reads correctly when stacked). */
          .share-sidebar {
            width: 100% !important;
            min-width: 0 !important;
            border-left: none !important;
            border-top: 1px solid #e5e7eb !important;
            flex: 1 1 auto;
          }
          /* In detail view on mobile, hide the map entirely. The stacked
             layout meant the map was still taking 38vh above the detail
             overlay, so clicking a property left the viewer staring at
             a cropped Leaflet tile on top of the deal data. Give the
             detail content the whole screen. */
          .share-main--detail .share-map { display: none !important; }
          /* Contact info ate a whole row in the header. Drop it on
             phones; the contact block is still present on the list
             cards / detail footer for anyone who needs to reach out. */
          .share-header-contact { display: none !important; }
          .share-header > div:first-child {
            width: 100%;
          }
          /* Demographics overlay is a map-layer feature that needs
             room to breathe. Hide the toggle on phones; it is still
             available on tablets/desktop. */
          .share-demographics-toggle { display: none !important; }
          /* Redundant property-count pill — duplicated in the header. */
          .share-map-count-pill { display: none !important; }
          /* Shorten the map so the property list is the primary view
             on a phone. */
          .share-map {
            height: 30vh !important;
            min-height: 180px;
            max-height: 280px;
          }
          /* ── Detail view scroll + tab restructure ──────────────────
             The detail panel had a nested scroll setup: outer sidebar
             with overflow:auto, inner content div also with overflow:auto,
             and two position:sticky bars relying on a scroll container
             that wasn't actually scrolling. On a phone the result was
             content sliding under a tab strip that never quite pinned
             and a claustrophobic 30%-of-viewport scroll area.
             Fix on mobile: collapse to a SINGLE scroll (the sidebar),
             let the property header/hero scroll away, and pin back bar
             + tab strip to the top of the viewport. */
          .detail-slide {
            height: auto !important;
            min-height: 100%;
          }
          .detail-content {
            overflow: visible !important;
            flex: none !important;
          }
          .detail-top-bar {
            padding: 8px 12px !important;
          }
          .detail-top-bar .back-pill {
            padding: 8px 12px 8px 8px !important;
            font-size: 12px !important;
          }
          /* Show the "All properties" label on mobile, hide the desktop
             "Back to Map" copy that no longer matches the UI. */
          .back-pill-label-desktop { display: none !important; }
          .back-pill-label-mobile { display: inline !important; }
          /* Compact the locate+prev/next cluster — smaller buttons, no
             locate (there is no map to locate on; Back takes you back
             to the list where the map lives). */
          .detail-nav-cluster > button:first-child { display: none !important; }
          .detail-nav-cluster > button { width: 30px !important; height: 30px !important; }
          /* Tab strip pins to the top of the viewport now that the outer
             scroll is the whole sidebar. 48px ≈ the compact top bar height. */
          .detail-tab-strip {
            top: 48px !important;
            padding: 6px 8px 0 !important;
            gap: 0 !important;
            overflow-x: visible !important;
          }
          .pd-tab {
            padding: 9px 10px !important;
            font-size: 12px !important;
            flex: 1 1 0;
            min-width: 0;
            text-align: center;
          }
          .pd-tab-label-desktop { display: none !important; }
          .pd-tab-label-mobile { display: inline !important; }
        }
        /* Prefer the dynamic viewport (dvh) on iOS Safari 16+ so the
           bottom disclaimer stops getting clipped by the tab bar/URL bar
           when it appears. Falls back to 100vh on older browsers. */
        @supports (height: 100dvh) {
          .share-main { height: calc(100dvh - 56px); }
          @media (max-width: 768px) {
            .share-main { min-height: calc(100dvh - 72px); }
          }
        }
      `}</style>

      {/* Header - dark branded bar matching workspace */}
      <header className="share-header" style={{
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
          <h1 className="share-header-title" style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{title}</h1>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)",
            padding: "3px 10px", borderRadius: 4,
          }}>
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(config?.contactName || config?.contactAgency || config?.contactPhone) && (
            <div className="share-header-contact" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
              <span className="share-contact-label" style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>Shared by</span>
              {config?.contactName && (
                <span className="share-contact-name" style={{ fontWeight: 700, color: "#FFFFFF" }}>{config.contactName}</span>
              )}
              {config?.contactAgency && (
                <span className="share-contact-agency" style={{ color: "rgba(255,255,255,0.6)" }}>{config.contactAgency}</span>
              )}
              {config?.contactPhone && (
                <a className="share-contact-phone" href={`tel:${config.contactPhone}`} style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
                  {config.contactPhone}
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main layout: map + sidebar */}
      <div className={`share-main ${viewMode === "detail" ? "share-main--detail" : "share-main--list"}`} style={{ display: "flex", height: "calc(100vh - 56px)" }}>
        {/* Map */}
        <div className="share-map" style={{ flex: 1, position: "relative" }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

          {/* Map Controls - top-right overlay */}
          <div style={{
            position: "absolute", top: 12, right: 12, zIndex: 1000,
            display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end",
          }}>
            {/* Demographics toggle pill sits above the zoom cluster so it
                reads as a layer switch rather than a viewport control.
                Hidden on mobile — phones don't have the real estate for
                choropleth overlays and the toggle steals tap targets
                from the smaller map. */}
            <div className="share-demographics-toggle">
              <DemographicsToggle
                enabled={demographicsOn}
                onToggle={setDemographicsOn}
                disabled={Object.keys(geocodedCoords).length === 0}
              />
            </div>
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

          {/* Demographics overlay. Manages its own Leaflet layers (tract
              choropleth + radius rings) and floats a metrics panel at the
              top-left of the map. Renders nothing when toggle is off. */}
          <DemographicsOverlay
            map={mapInstanceRef.current}
            L={leafletRef.current}
            enabled={demographicsOn && !!focalDemographicsProperty}
            lat={focalDemographicsProperty?.lat ?? null}
            lng={focalDemographicsProperty?.lng ?? null}
            propertyName={focalDemographicsProperty?.name}
            propertyAddress={focalDemographicsProperty?.address}
          />

          {/* Property count pill - bottom-left. Hidden on mobile; the
              header already shows the same count, and on a small map
              the pill just covers markers. */}
          <div className="share-map-count-pill" style={{
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

        {/* Sidebar - list or detail view. In detail mode we widen the panel
            to ~680px so the Quick Screen / Offer Scenarios / Rent Roll tabs
            have room to breathe. On narrow screens the panel goes full-width
            as an overlay (see the @media rule in the <style> block above). */}
        <div className={`share-sidebar ${viewMode === "detail" ? "share-sidebar-detail" : ""}`} style={{
          width: viewMode === "detail" ? 680 : 420,
          minWidth: viewMode === "detail" ? 680 : 420,
          background: "#fff",
          // Detail view owns its own scroll inside .detail-content so the
          // back bar + property header + tab strip stay pinned. List view
          // needs the outer scroll for the property cards.
          overflow: viewMode === "detail" ? "hidden" : "auto",
          borderLeft: "1px solid #e5e7eb",
          transition: "width 0.25s ease, min-width 0.25s ease",
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
                  <div style={{ background: "#4D7C0F", padding: 2, borderRadius: 3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
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
      {/* ─── Global disclaimer (bottom of the shared dealboard) ───
          Small, muted legalese pinned under the map + sidebar pair so
          it's visible in both list and detail view modes. Intentionally
          understated so it doesn't compete with the deal content. */}
      <div
        style={{
          padding: "10px 20px 12px",
          borderTop: "1px solid #e5e7eb",
          background: "#fafbfc",
          fontSize: 10,
          lineHeight: 1.5,
          color: "#94a3b8",
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Shared for informational purposes only. Deal Signals output is automated general guidance, not investment, legal, tax, or financial advice. Figures are derived from uploaded documents and public data sources that may be incomplete or inaccurate. Verify all material facts independently before committing capital.
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
  // PropertyDetail lives at module scope, so shareId from the outer
  // SharedViewPage is not in closure scope. Pull it from the route
  // params directly. Used to build the /api/share/[id]/download URL
  // on the Source Documents anchors below; evaluating it during render
  // was the source of the black-screen crash (ReferenceError on shareId).
  const routeParams = useParams();
  const shareId = (routeParams?.id as string) || "";
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

  // Tab state. "summary" is the lightweight overview (current metric cards).
  // The other tabs reuse the exact components that render inside the logged-in
  // workspace so the public recipient sees the same diagnostics. We default
  // to "summary" because that's the lowest-friction read.
  type Tab = "summary" | "quick-screen" | "scenarios" | "rent-roll";
  const [tab, setTab] = useState<Tab>("summary");

  // Reset to Summary whenever the viewer navigates to a new property so we
  // don't leave them on a tab that has no data for the next deal.
  useEffect(() => { setTab("summary"); }, [prop.id]);

  // Components from the workspace expect the internal Property + ExtractedField
  // shape. The API spreads the full property row into SharedProperty, so the
  // cast is safe at runtime. We null out workspaceId so useUnderwritingDefaults
  // skips the Firestore read (public visitors have no auth context) and just
  // uses DEFAULT_UNDERWRITING. This keeps the math consistent across deals.
  const internalProperty = useMemo<InternalProperty>(
    () => ({ ...(prop as unknown as InternalProperty), workspaceId: undefined }),
    [prop],
  );
  const internalFields = useMemo<InternalExtractedField[]>(
    () => fields as unknown as InternalExtractedField[],
    [fields],
  );

  // Decide which tabs to show. A tab only appears if the underlying content
  // has at least something to render; otherwise we suppress it rather than
  // show an empty "Waiting on inputs" placeholder to the recipient.
  const showSummary = pricingMetrics.length + basicsMetrics.length + incomeMetrics.length > 0
    || tenantName || tenantRows.length > 0 || signalItems.length > 0
    || (prop.documents?.length ?? 0) > 0;
  const askingPrice = g("pricing_deal_terms", "asking_price");
  const hasPricing = !!askingPrice;
  const showQuickScreen = hasPricing;
  const showScenarios = hasPricing;
  const showRentRoll = tenantRows.length > 0;

  const tabDefs: { id: Tab; label: string; visible: boolean }[] = [
    { id: "summary", label: "Summary", visible: !!showSummary },
    { id: "quick-screen", label: "Quick Screen", visible: showQuickScreen },
    { id: "scenarios", label: "Offer Scenarios", visible: showScenarios },
    { id: "rent-roll", label: "Rent Roll", visible: showRentRoll },
  ];
  const visibleTabs = tabDefs.filter(t => t.visible);

  // If the current tab isn't applicable to this property (e.g. switching from
  // a multi-tenant deal to a single-tenant one), fall back to Summary.
  useEffect(() => {
    if (!visibleTabs.find(t => t.id === tab)) setTab("summary");
  }, [tab, visibleTabs]);

  return (
    <div className="detail-slide" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sticky nav bar. The Back pill is deliberately the most
          prominent affordance because the user's primary mental model is
          "list of deals I drill into and come back from", so the pill makes
          that return trip a single obvious click. Esc also returns. */}
      <div className="detail-top-bar" style={{
        padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, position: "sticky", top: 0, zIndex: 5,
      }}>
        <button onClick={onBack} className="back-pill" title="Back to properties (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="back-pill-label-desktop">Back to Map</span>
          <span className="back-pill-label-mobile">All properties</span>
        </button>

        <div className="detail-nav-cluster" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Locate on map - re-centers without leaving the detail view */}
          <button onClick={onLocate} title="Locate on map" style={{
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#F8FAFC", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer", color: "#0F172A",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          </button>
          {/* Prev / Next */}
          <button
            onClick={() => prevProp && onNavigate(prevProp.id)}
            disabled={!prevProp}
            title="Previous property"
            style={{
              width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
              cursor: prevProp ? "pointer" : "default", color: prevProp ? "#374151" : "#d1d5db",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 40, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {currentIdx + 1} / {properties.length}
          </span>
          <button
            onClick={() => nextProp && onNavigate(nextProp.id)}
            disabled={!nextProp}
            title="Next property"
            style={{
              width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
              cursor: nextProp ? "pointer" : "default", color: nextProp ? "#374151" : "#d1d5db",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Property header - name + address surfaced above the tab strip so the
          viewer always knows which deal they're looking at regardless of tab. */}
      <div style={{
        padding: "14px 18px 0",
        background: "#fff",
      }}>
        {prop.heroImageUrl && (
          <div style={{
            height: 140, borderRadius: 10, overflow: "hidden", marginBottom: 14,
            background: `url(${prop.heroImageUrl}) center/cover no-repeat`,
          }} />
        )}
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#151b2b", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          {prop.propertyName}
        </h2>
        <p style={{ fontSize: 12.5, color: "#585e70", margin: "0 0 14px", lineHeight: 1.4 }}>
          {addr || "-"}
        </p>
      </div>

      {/* Tab strip - only shows tabs that have real data. Sticky under the
          top bar so the viewer can switch views without scrolling back up.
          On mobile we re-pin to top:0 since the top bar compacts to 48px
          and the property header scrolls away; see the @media block. */}
      {visibleTabs.length > 1 && (
        <div className="detail-tab-strip" style={{
          display: "flex",
          alignItems: "flex-end",
          background: "#F9FAFB",
          borderTop: "1px solid #F1F5F9",
          borderBottom: "1px solid #e5e7eb",
          padding: "8px 12px 0",
          gap: 2,
          position: "sticky",
          top: 62,
          zIndex: 4,
          overflowX: "auto",
        }}>
          {visibleTabs.map(t => {
            // Mobile needs shorter labels so the whole strip fits without
            // horizontal scrolling on a 375px iPhone. Render both, let CSS
            // pick which is visible.
            const shortLabel = t.id === "quick-screen" ? "Screen"
              : t.id === "scenarios" ? "Offer"
              : t.id === "rent-roll" ? "Rent"
              : "Summary";
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`pd-tab ${tab === t.id ? "active" : ""}`}
              >
                <span className="pd-tab-label-desktop">{t.label}</span>
                <span className="pd-tab-label-mobile">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable content. .detail-content is the ONLY scroller in
          detail view (parent .share-sidebar is overflow:hidden in detail
          mode). That keeps the back bar + property header + tab strip
          static at the top and only the tab body scrolls. minHeight:0 on
          the flex item is required for overflow:auto to actually take
          effect inside a flex column. Mobile @media block flips this to
          overflow:visible to flatten everything onto the page scroll. */}
      <div className="detail-content" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 18px", background: "#fff" }}>
        {/* ═══ QUICK SCREEN TAB ═══ */}
        {tab === "quick-screen" && (
          <div>
            <DealQuickScreen property={internalProperty} fields={internalFields} />
          </div>
        )}

        {/* ═══ OFFER SCENARIOS TAB ═══ */}
        {tab === "scenarios" && (
          <div>
            <OmReversePricing property={internalProperty} fields={internalFields} />
          </div>
        )}

        {/* ═══ RENT ROLL TAB ═══ */}
        {tab === "rent-roll" && (
          <div>
            {/* Primary tenant + lease info card (if populated) */}
            {(tenantName || leaseExpiry || leaseType) && (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", marginBottom: 14 }}>
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

            {/* Tenant rent roll table */}
            {tenantRows.length > 0 && (
              <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8 }}>
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

            {/* Multi-tenant diagnostics - component self-suppresses on 1-tenant deals */}
            <RentRollDetailAnalysis
              property={internalProperty}
              fields={internalFields}
              wsType={(internalProperty.analysisType as any) || "retail"}
            />
          </div>
        )}

        {/* ═══ SUMMARY TAB ═══ */}
        {tab === "summary" && (<>
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
        </>)}
      </div>
    </div>
  );
}
