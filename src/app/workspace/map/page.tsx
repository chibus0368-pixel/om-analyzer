"use client";

import { useEffect, useState, useRef } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getPropertyExtractedFields, updateProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import Link from "next/link";

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
  const runIdRef = useRef(0);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propFields, setPropFields] = useState<Record<string, ExtractedField[]>>({});
  const [mapReady, setMapReady] = useState(false);
  const [plotting, setPlotting] = useState(false);
  const [plotted, setPlotted] = useState(0);
  const [failed, setFailed] = useState(0);

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
      const fieldsMap: Record<string, ExtractedField[]> = {};
      for (const p of props) {
        try {
          fieldsMap[p.id] = await getPropertyExtractedFields(p.id);
        } catch { fieldsMap[p.id] = []; }
      }
      if (!cancelled) setPropFields(fieldsMap);
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

    // Increment run counter — only the latest run's markers survive
    const thisRun = ++runIdRef.current;

    // Clear ALL markers from the map (catches stragglers from async race conditions)
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    markersRef.current = [];

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

        // Re-check after async ops — if a newer run started, bail out
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
              <a href="/workspace/properties/${prop.id}" style="display:inline-block;padding:6px 16px;background:#84CC16;color:#0F172A;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">View Deal</a>
            </div>
          `;

          marker.bindPopup(popupHtml, { maxWidth: 280 });
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

  return (
    <div style={{ height: "calc(100vh - 88px)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(227, 190, 189, 0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Deal Map{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}</h1>
            {activeWorkspace?.analysisType && (
              <span style={{
                display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
                background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
                color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              }}>
                {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#585e70", margin: "2px 0 0" }}>
            {plotting
              ? `Plotting properties... (${plotted}/${properties.length}${failed > 0 ? `, ${failed} failed` : ""})`
              : properties.length > 0
                ? `${plotted} of ${properties.length} properties plotted${failed > 0 ? ` · ${failed} could not be located` : ""}`
                : "No properties yet \u2014 upload OMs to see them on the map"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href={`/workspace/share?ws=${activeWorkspace?.slug || "default-dealboard"}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8,
            background: "rgba(132,204,22,0.1)", color: "#84CC16",
            fontSize: 12, fontWeight: 600, textDecoration: "none",
            border: "1px solid rgba(132,204,22,0.2)",
            transition: "all 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share DealBoard
          </Link>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", display: "inline-block" }} /> Strong Buy (85+)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563EB", display: "inline-block" }} /> Buy (70–84)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D97706", display: "inline-block" }} /> Neutral (50–69)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#EA580C", display: "inline-block" }} /> Pass (30–49)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} /> Not scored
          </span>
        </div>
      </div>
      <div ref={mapRef} style={{ flex: 1, width: "100%" }} />
    </div>
  );
}
