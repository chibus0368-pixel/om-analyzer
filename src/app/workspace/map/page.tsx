"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getPropertyExtractedFields, updateProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { AnalysisTypeIcon } from "@/lib/workspace/AnalysisTypeIcon";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import Link from "next/link";
import DemographicsToggle from "@/components/demographics/DemographicsToggle";
import DemographicsOverlay from "@/components/demographics/DemographicsOverlay";

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
  if (val === null || val === undefined || val === "") return "--";
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

/** Build the best geocoding address from property data */
function buildGeoAddress(prop: Property): string | null {
  // Use address1 + city + state (most reliable format for geocoding)
  const parts = [prop.address1, prop.city, prop.state].filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");
  // Fallback: city + state only
  if (prop.city && prop.state) return `${prop.city}, ${prop.state}`;
  return null;
}

export default function MapPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markersByIdRef = useRef<Record<string, any>>({});
  const runIdRef = useRef(0);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propFields, setPropFields] = useState<Record<string, ExtractedField[]>>({});
  const [mapReady, setMapReady] = useState(false);
  const [plotting, setPlotting] = useState(false);
  const [plotted, setPlotted] = useState(0);
  const [failed, setFailed] = useState(0);

  // Demographics overlay state. Off by default per spec; the toggle pill in
  // the header controls enablement. We track the focal property by id so the
  // overlay can refocus when the user picks a different deal.
  const [demographicsOn, setDemographicsOn] = useState(false);
  const [demographicsPropId, setDemographicsPropId] = useState<string | null>(null);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number }>>({});

  // Mobile responsive styles
  const styles = `
    @media (max-width: 768px) {
      .mp-header-container {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 12px !important;
      }
      .mp-title-section h1 {
        font-size: 24px !important;
      }
      .mp-legend-container {
        flex-wrap: wrap !important;
        justify-content: flex-start !important;
        gap: 8px !important;
      }
      .mp-legend-item {
        font-size: 10px !important;
      }
      .mp-map-wrapper {
        height: 100% !important;
      }
    }
    @media (max-width: 900px) {
      .mp-sidebar {
        display: none !important;
      }
    }
    .mp-share-card:hover { box-shadow: 0 8px 24px rgba(21,27,43,0.1); transform: translateY(-1px); }
    @media (max-width: 480px) {
      .mp-header-container {
        padding: 8px 12px !important;
      }
      .mp-title-section h1 {
        font-size: 20px !important;
      }
      .mp-title-section p {
        font-size: 10px !important;
      }
      .mp-legend-container {
        gap: 6px !important;
      }
      .mp-legend-item {
        font-size: 9px !important;
        gap: 2px !important;
      }
      .mp-legend-dot {
        width: 8px !important;
        height: 8px !important;
      }
      .mp-map-wrapper {
        height: calc(100vh - 110px) !important;
      }
    }
  `;

  // Load Leaflet via dynamic import
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    async function initMap() {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      leafletRef.current = L.default || L;
      const Lf = leafletRef.current;

      const map = Lf.map(mapRef.current, { zoomControl: true }).setView([39.8, -98.5], 5);

      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      setTimeout(() => map.invalidateSize(), 200);

      mapInstanceRef.current = map;
      setMapReady(true);
    }

    initMap().catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // Load properties and their fields (use stable deps to avoid re-runs)
  const userId = user?.uid;
  const wsId = activeWorkspace?.id;
  useEffect(() => {
    if (!userId || !wsId) return;
    let cancelled = false;
    getWorkspaceProperties(userId, wsId).then(async (props) => {
      if (cancelled) return;
      setProperties(props);
      // Fetch all extracted fields in PARALLEL instead of sequentially.
      // The old for-of-await loop was an N+1: 14 properties = 14 sequential
      // API calls = 7-28s. Promise.all fires them concurrently.
      const entries = await Promise.all(
        props.map(async (p) => {
          try {
            const fields = await getPropertyExtractedFields(p.id);
            return [p.id, fields] as const;
          } catch {
            return [p.id, []] as const;
          }
        })
      );
      if (cancelled) return;
      const fieldsMap: Record<string, ExtractedField[]> = {};
      for (const [id, fields] of entries) fieldsMap[id] = fields;
      setPropFields(fieldsMap);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, wsId]);

  // Add markers when map is ready AND properties + fields are fully loaded
  const fieldsReady = properties.length > 0 && Object.keys(propFields).length >= properties.length;

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !leafletRef.current) return;
    if (!fieldsReady && properties.length > 0) return; // wait for fields to load

    const map = mapInstanceRef.current;
    const L = leafletRef.current;

    // Increment run counter - only the latest run's markers survive
    const thisRun = ++runIdRef.current;

    // Clear ALL markers from the map (catches stragglers from async race conditions)
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    markersRef.current = [];
    markersByIdRef.current = {};

    if (properties.length === 0) {
      setPlotted(0);
      setFailed(0);
      setPlotting(false);
      return;
    }

    setPlotting(true);
    setPlotted(0);
    setFailed(0);

    async function addMarkers() {
      // If a newer run started, abort this one
      if (runIdRef.current !== thisRun) return;
      const bounds: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const prop of properties) {
        if (runIdRef.current !== thisRun) return;

        let lat: number | null = null;
        let lng: number | null = null;

        // 1) Use stored coordinates if available (cached from previous geocode)
        if (prop.latitude && prop.longitude && !isNaN(prop.latitude) && !isNaN(prop.longitude)) {
          lat = prop.latitude;
          lng = prop.longitude;
        }

        // 2) Try extracted fields for lat/lng
        if (lat === null || lng === null) {
          const fields = propFields[prop.id] || [];
          const eLat = gf(fields, "property_basics", "latitude");
          const eLng = gf(fields, "property_basics", "longitude");
          if (eLat && eLng) {
            lat = parseFloat(eLat);
            lng = parseFloat(eLng);
            if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null; }
          }
        }

        // 3) Fall back to geocoding API using the ACTUAL address (not property name)
        if (lat === null || lng === null) {
          const address = buildGeoAddress(prop);
          if (address) {
            try {
              const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.lat && data.lng) {
                  lat = data.lat;
                  lng = data.lng;
                  // Cache the coordinates back to Firestore so we don't re-geocode
                  try {
                    await updateProperty(prop.id, { latitude: lat!, longitude: lng! });
                    console.log(`[map] Cached coords for ${prop.propertyName}: ${lat},${lng}`);
                  } catch (e) {
                    console.log(`[map] Failed to cache coords for ${prop.propertyName}:`, e);
                  }
                }
              }
            } catch {
              // Geocoding failed
            }
          }
        }

        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
          failCount++;
          setFailed(failCount);
          console.log(`[map] Failed to geocode: ${prop.propertyName} (${buildGeoAddress(prop)})`);
          continue;
        }

        // Re-check after async ops - if a newer run started, bail out
        if (runIdRef.current !== thisRun) return;

        try {
          bounds.push([lat, lng]);

          // Get property metrics for popup
          const fields = propFields[prop.id] || [];
          const price = gf(fields, "pricing_deal_terms", "asking_price");
          const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
          const gla = gf(fields, "property_basics", "building_sf");
          const noi = gf(fields, "expenses", "noi_om");
          const signal = gf(fields, "signals", "overall_signal") || "";

          // Score-based pin color
          const scoreTotal = (prop as any).scoreTotal || 0;
          const scoreBand = (prop as any).scoreBand || "";
          let pinColor = "#94a3b8"; // gray default (no score)
          let pinLabel = "–";
          if (scoreTotal > 0) {
            pinLabel = `${scoreTotal}`;
            if (scoreBand === "strong_buy" || scoreTotal >= 85) pinColor = "#059669";
            else if (scoreBand === "buy" || scoreTotal >= 70) pinColor = "#2563EB";
            else if (scoreBand === "hold" || scoreTotal >= 50) pinColor = "#D97706";
            else if (scoreBand === "pass" || scoreTotal >= 30) pinColor = "#EA580C";
            else pinColor = "#DC2626";
          }

          const icon = L.divIcon({
            html: `<div style="width:32px;height:32px;border-radius:50%;background:${pinColor};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;letter-spacing:-0.5px;">${pinLabel}</div>`,
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const addrForPopup = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
          const marker = L.marker([lat, lng], { icon }).addTo(map);
          markersRef.current.push(marker);

          const popupHtml = `
            <div style="min-width:220px;font-family:Inter,system-ui,sans-serif;padding:4px 0;">
              <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#151b2b;">${cleanDisplayName(prop.propertyName, prop.address1, prop.city, prop.state)}</div>
              <div style="font-size:11px;color:#585e70;margin-bottom:10px;">${addrForPopup}</div>
              ${price || capRate || gla ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
                  ${price ? `<div><div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">Price</div><div style="font-size:13px;font-weight:700;">${fmt$(price)}</div></div>` : ""}
                  ${capRate ? `<div><div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">Cap Rate</div><div style="font-size:13px;font-weight:700;">${Number(capRate).toFixed(2)}%</div></div>` : ""}
                  ${gla ? `<div><div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">GLA</div><div style="font-size:13px;font-weight:700;">${Math.round(Number(gla)).toLocaleString()} SF</div></div>` : ""}
                  ${noi ? `<div><div style="font-size:9px;color:#585e70;text-transform:uppercase;font-weight:600;">NOI</div><div style="font-size:13px;font-weight:700;">${fmt$(noi)}</div></div>` : ""}
                </div>
              ` : ""}
              ${scoreTotal > 0 ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${pinColor};color:#fff;font-size:12px;font-weight:800;">${scoreTotal}</span><span style="font-size:12px;font-weight:600;color:#151b2b;">${scoreBand === "strong_buy" ? "Strong Buy" : scoreBand === "buy" ? "Buy" : scoreBand === "hold" ? "Neutral" : scoreBand === "pass" ? "Pass" : scoreBand === "strong_reject" ? "Reject" : ""}</span></div>` : ""}
              ${signal ? `<div style="font-size:11px;margin-bottom:8px;color:#585e70;">${signal}</div>` : ""}
              <a href="/workspace/properties/${prop.id}" style="display:inline-block;padding:6px 16px;background:#0F172A;color:#ffffff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">View Deal</a>
            </div>
          `;

          marker.bindPopup(popupHtml, { maxWidth: 280 });

          // Store the geocoded coords + a click handler so the demographics
          // overlay can pivot to whichever deal the user clicks. We don't
          // hijack the popup; the click just records the focal property in
          // state, which feeds the overlay below.
          (marker as any)._propId = prop.id;
          markersByIdRef.current[prop.id] = marker;
          setGeocodedCoords((prev) =>
            prev[prop.id]?.lat === lat && prev[prop.id]?.lng === lng
              ? prev
              : { ...prev, [prop.id]: { lat: lat as number, lng: lng as number } },
          );
          marker.on("click", () => {
            setSelectedPropId(prop.id);
            setDemographicsPropId(prop.id);
          });

          successCount++;
          setPlotted(successCount);
        } catch {
          failCount++;
          setFailed(failCount);
        }
      }

      if (runIdRef.current !== thisRun) return;
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      }
      setPlotting(false);
    }

    addMarkers();
  }, [mapReady, properties, propFields, fieldsReady]);

  // Resolve focal demographics property. Defaults to the first geocoded
  // property when the user enables the toggle without picking one explicitly.
  const focalProperty = useMemo(() => {
    if (!demographicsOn) return null;
    const id = demographicsPropId
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
      name: cleanDisplayName(prop.propertyName, prop.address1, prop.city, prop.state),
      address: addr,
    };
  }, [demographicsOn, demographicsPropId, properties, geocodedCoords]);

  function selectPropertyCard(propId: string) {
    setSelectedPropId(propId);
    setDemographicsPropId(propId);
    const map = mapInstanceRef.current;
    const marker = markersByIdRef.current[propId];
    if (!map || !marker) return;
    const latlng = marker.getLatLng();
    map.flyTo(latlng, Math.max(map.getZoom(), 13), { duration: 0.6 });
    marker.openPopup();
  }

  return (
    <>
      <style>{styles}</style>
      {/* Mirror the share-view layout exactly. The workspace shell
          marks .ws-main-content with position:relative for /workspace/map
          so we can use position:absolute inset:0 here to fill it edge-
          to-edge without depending on flex height propagation (the
          previous height:100% / flex:1 chain was leaving the sidebar
          with no resolvable height, so its overflow:auto never
          triggered). Same trick the share view uses to lock the page to
          a single viewport with no body scrollbar. */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="mp-header-container" style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(227, 190, 189, 0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="mp-title-section">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, color: "#111827", letterSpacing: -0.5 }}>Deal Map{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}</h1>
            {activeWorkspace?.analysisType && (() => {
              const atColor = ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType] || "#6B7280";
              return (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6,
                  background: `${atColor}15`, color: atColor,
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  <AnalysisTypeIcon type={activeWorkspace.analysisType} size={13} color={atColor} />
                  {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
                </span>
              );
            })()}
          </div>
          <p style={{ fontSize: 12, color: "#585e70", margin: "2px 0 0" }}>
            {plotting
              ? `Plotting properties... (${plotted}/${properties.length}${failed > 0 ? `, ${failed} failed` : ""})`
              : properties.length > 0
                ? `${plotted} of ${properties.length} properties plotted${failed > 0 ? ` · ${failed} could not be located` : ""}`
                : "No properties yet \u2014 upload OMs to see them on the map"}
          </p>
        </div>
        <div className="mp-legend-container" style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="mp-legend-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="mp-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", display: "inline-block" }} /> Strong Buy (85+)
          </span>
          <span className="mp-legend-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="mp-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563EB", display: "inline-block" }} /> Buy (70–84)
          </span>
          <span className="mp-legend-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="mp-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "#D97706", display: "inline-block" }} /> Neutral (50–69)
          </span>
          <span className="mp-legend-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="mp-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "#EA580C", display: "inline-block" }} /> Pass (30–49)
          </span>
          <span className="mp-legend-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="mp-legend-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} /> Not scored
          </span>
          {/* Demographics toggle moved out of the header into the map
              overlay (top-right corner) so it reads as a layer switch
              rather than chrome. Matches the share-view layout the user
              wants this page to mirror. */}
        </div>
      </div>
      {/* Map container - isolation creates a new stacking context so
          Leaflet's internal z-indexes (panes up to 700, controls up to
          1000) can't cover sidebar/header dropdowns that sit above it.
          The DemographicsOverlay renders absolutely-positioned chrome
          inside this wrapper, plus imperatively manages tract polygons
          and radius rings on the Leaflet map instance directly. */}
      <div className="mp-body" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div
          className="mp-map-wrapper"
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            position: "relative",
            zIndex: 0,
            isolation: "isolate",
          }}
        >
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          {/* Demographics toggle pill - top-right overlay. Sits above
              Leaflet's controls (zoom is at top:10 left:10 by default;
              this is right:12 top:12). Hidden when the user has no
              geocoded properties yet so the disabled state isn't a tap
              target into nothing. */}
          {Object.keys(geocodedCoords).length > 0 && (
            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 600 }}>
              <DemographicsToggle
                enabled={demographicsOn}
                onToggle={setDemographicsOn}
                disabled={false}
              />
            </div>
          )}
          <DemographicsOverlay
            map={mapInstanceRef.current}
            L={leafletRef.current}
            enabled={demographicsOn && !!focalProperty}
            lat={focalProperty?.lat ?? null}
            lng={focalProperty?.lng ?? null}
            propertyName={focalProperty?.name}
            propertyAddress={focalProperty?.address}
          />
        </div>

        {/* ─── Right sidebar: share-style property list ─── */}
        <aside
          className="mp-sidebar"
          style={{
            width: 420,
            minWidth: 420,
            background: "#fff",
            overflow: "auto",
            borderLeft: "1px solid #e5e7eb",
          }}
        >
          <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#151b2b", letterSpacing: "-0.02em" }}>Properties</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Click a property to zoom the map</div>
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {properties.map((prop) => {
              const fields = propFields[prop.id] || [];
              const price = gf(fields, "pricing_deal_terms", "asking_price");
              const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
              const noi = gf(fields, "expenses", "noi_om");
              const gla = gf(fields, "property_basics", "building_sf") || prop.buildingSf;
              const signal = gf(fields, "signals", "overall_signal") || "";
              const tenantName = gf(fields, "tenant_info", "tenant_name") || gf(fields, "tenant_info", "primary_tenant");
              const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
              const displayName = cleanDisplayName(prop.propertyName, prop.address1, prop.city, prop.state);
              const heroUrl = (prop as any).heroImageUrl as string | undefined;
              const isSelected = selectedPropId === prop.id;

              return (
                <div
                  key={prop.id}
                  className="mp-share-card"
                  onClick={() => selectPropertyCard(prop.id)}
                  style={{
                    background: "#fff",
                    border: isSelected ? "2px solid #2563EB" : "1px solid #e5e7eb",
                    borderRadius: 10,
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  {heroUrl && (
                    <div
                      style={{
                        height: 100,
                        background: `url(${heroUrl}) center/cover no-repeat`,
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    />
                  )}
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#151b2b", margin: "0 0 2px" }}>
                          {displayName}
                        </h3>
                        <p style={{ fontSize: 11, color: "#585e70", margin: "0 0 8px" }}>{addr || "-"}</p>
                      </div>
                      <Link
                        href={`/workspace/properties/${prop.id}`}
                        prefetch={false}
                        onClick={(e) => e.stopPropagation()}
                        title="Open deal"
                        style={{
                          flexShrink: 0,
                          marginTop: 2,
                          color: "#94a3b8",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </Link>
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
                    {(tenantName || signal) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {tenantName && (
                          <span style={{ fontSize: 11, color: "#585e70", background: "#f8fafc", padding: "2px 8px", borderRadius: 4, border: "1px solid #f1f5f9" }}>
                            {tenantName}
                          </span>
                        )}
                        {signal && (
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 4,
                            background: String(signal).includes("\u{1F7E2}") ? "rgba(16,185,129,0.08)"
                              : String(signal).includes("\u{1F534}") ? "rgba(239,68,68,0.08)"
                              : "rgba(245,158,11,0.08)",
                            color: "#151b2b",
                          }}>
                            {String(signal)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {properties.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
                No properties yet. Upload OMs to see them here.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}
