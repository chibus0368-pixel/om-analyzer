"use client";

/**
 * DemographicsOverlay
 *
 * A drop-in overlay for any existing Leaflet map. Given a focal property
 * (lat/lng) and an active Leaflet map instance, it:
 *
 *   1. Fetches Census ACS 5-Year metrics + tract polygons via /api/demographics.
 *   2. Renders a tract-level choropleth and dashed 1/3/5 mile radius rings
 *      directly onto the parent map (imperative Leaflet, matching how the rest
 *      of the DealSignals codebase manages markers).
 *   3. Floats a compact metrics panel anchored to the map. The panel reuses
 *      DealSignals tokens (Inter, navy 950, cream/gold accents, 12px radius).
 *
 * Toggle the whole overlay via the `enabled` prop. When disabled the layers
 * are removed cleanly and the API isn't called. The component is portable:
 * it knows nothing about DealSignals routing or Firestore.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { rampColor, robustRange } from "@/lib/demographics/colors";
import {
  METRICS,
  DEFAULT_COLOR_KEY,
  metricValue,
  type ColorKey,
  type MetricKey,
} from "@/lib/demographics/metrics";
import type { RingAggregate } from "@/lib/demographics/aggregate";

type LeafletNS = any;
type LeafletMap = any;
type LeafletLayer = any;

interface TractGeoJsonProps {
  GEOID?: string;
  NAME?: string;
  population?: number | null;
  households?: number | null;
  medIncome?: number | null;
  medAge?: number | null;
  rentersPct?: number | null;
  educationPct?: number | null;
  homeValue?: number | null;
  daytimeWorkers?: number | null;
  medicaidPct?: number | null;
}
interface TractFeature {
  type: "Feature";
  properties: TractGeoJsonProps;
  geometry: any;
}
interface TractCollection {
  type: "FeatureCollection";
  features: TractFeature[];
}

interface DemographicsResponse {
  center: { lat: number; lng: number };
  radii: number[];
  rings: Record<string, RingAggregate>;
  tracts: TractCollection;
}

const RADII = [1, 3, 5] as const;

export interface DemographicsOverlayProps {
  /** Active Leaflet map instance (mapInstanceRef.current). */
  map: LeafletMap | null;
  /** Active Leaflet module (leafletRef.current). */
  L: LeafletNS | null;
  /** Focal property latitude. Pass null to clear the overlay. */
  lat: number | null;
  /** Focal property longitude. Pass null to clear the overlay. */
  lng: number | null;
  /** Display name for the focal property; shown in the panel header. */
  propertyName?: string | null;
  /** One-line address for the focal property; shown under the name. */
  propertyAddress?: string | null;
  /** Master switch. False removes layers and skips the fetch entirely. */
  enabled: boolean;
}

export default function DemographicsOverlay({
  map,
  L,
  lat,
  lng,
  propertyName,
  propertyAddress,
  enabled,
}: DemographicsOverlayProps) {
  const [data, setData] = useState<DemographicsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number>(1);
  const [colorKey, setColorKey] = useState<ColorKey>(DEFAULT_COLOR_KEY);
  const [collapsed, setCollapsed] = useState(false);

  const layerGroupRef = useRef<LeafletLayer | null>(null);
  const tractsLayerRef = useRef<LeafletLayer | null>(null);
  const ringsLayerRef = useRef<LeafletLayer | null>(null);

  // Fetch the dataset whenever the focal property changes (and we're on).
  useEffect(() => {
    if (!enabled || lat == null || lng == null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/demographics?lat=${lat}&lng=${lng}&radii=${RADII.join(",")}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Demographics request failed (${res.status})`);
        return res.json();
      })
      .then((json: DemographicsResponse) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load demographics");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lng]);

  // Color range across all tracts for the active colorKey.
  const colorRange = useMemo<[number, number]>(() => {
    if (!data) return [0, 1];
    const vals: number[] = [];
    for (const f of data.tracts.features) {
      const p = f.properties;
      let v: number | null | undefined;
      if (colorKey === "popDensity") {
        // Density isn't shipped per-tract; approximate via population.
        v = p.population;
      } else {
        v = (p as any)[colorKey];
      }
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    return robustRange(vals);
  }, [data, colorKey]);

  // Imperative Leaflet layer management.
  useEffect(() => {
    if (!map || !L) return;

    // Tear down existing layers up front so any prop change starts clean.
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
      tractsLayerRef.current = null;
      ringsLayerRef.current = null;
    }
    if (!enabled || !data || lat == null || lng == null) return;

    const group = L.layerGroup();
    layerGroupRef.current = group;

    // 1. Choropleth tract layer.
    const [lo, hi] = colorRange;
    const range = hi - lo || 1;
    const tractsLayer = L.geoJSON(data.tracts, {
      style: (feature: TractFeature) => {
        const p = feature.properties;
        const raw = colorKey === "popDensity" ? p.population : (p as any)[colorKey];
        const v = typeof raw === "number" && Number.isFinite(raw) ? raw : NaN;
        const t = Number.isFinite(v) ? (v - lo) / range : NaN;
        return {
          color: "#0F172A",
          weight: 0.6,
          opacity: 0.45,
          fillColor: rampColor(t),
          fillOpacity: Number.isFinite(t) ? 0.55 : 0.15,
        };
      },
      onEachFeature: (feature: TractFeature, layer: any) => {
        const p = feature.properties;
        const tractName = (p.NAME || "Tract").replace(/, .*$/, "");
        const lines: string[] = [];
        for (const m of METRICS) {
          if (m.key === "walkability") continue;
          const raw = (p as any)[m.key];
          if (raw == null) continue;
          lines.push(
            `<div style="display:flex;justify-content:space-between;gap:18px;font-size:11px;line-height:1.5;"><span style="color:#64748B;">${m.label}</span><span style="font-weight:600;color:#0F172A;">${m.fmt(raw as number)}</span></div>`,
          );
        }
        layer.bindTooltip(
          `<div style="font-family:Inter,system-ui,sans-serif;min-width:170px;">
             <div style="font-weight:700;font-size:11.5px;color:#0F172A;margin-bottom:4px;">${tractName}</div>
             ${lines.join("")}
           </div>`,
          { sticky: true, opacity: 0.95, direction: "top" },
        );
      },
    });
    tractsLayer.addTo(group);
    tractsLayerRef.current = tractsLayer;

    // 2. Dashed radius rings.
    const rings = L.layerGroup();
    for (const r of RADII) {
      const ring = L.circle([lat, lng], {
        radius: r * 1609.34, // miles to meters
        color: "#0F172A",
        weight: 1.6,
        opacity: 0.85,
        fillOpacity: 0,
        dashArray: "6 6",
      });
      const labelDeg = (lat as number) + (r * 1609.34) / 111320;
      const label = L.marker([labelDeg, lng], {
        icon: L.divIcon({
          html: `<div style="font-family:Inter,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.3px;color:#0F172A;background:#FAF8F4;padding:2px 7px;border:1px solid #E5E1D6;border-radius:999px;box-shadow:0 1px 2px rgba(15,23,43,0.12);white-space:nowrap;">${r} mi</div>`,
          className: "",
          iconSize: [40, 18],
          iconAnchor: [20, 9],
        }),
        interactive: false,
      });
      ring.addTo(rings);
      label.addTo(rings);
    }
    rings.addTo(group);
    ringsLayerRef.current = rings;

    group.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
        tractsLayerRef.current = null;
        ringsLayerRef.current = null;
      }
    };
  }, [map, L, enabled, data, lat, lng, colorKey, colorRange]);

  // Auto-fit the map to the largest ring the first time data lands so the
  // user sees the whole context. Only on enable transitions, not every
  // metric change.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      fittedRef.current = false;
      return;
    }
    if (!map || !L || !data || lat == null || lng == null) return;
    if (fittedRef.current) return;
    const r = RADII[RADII.length - 1] * 1609.34;
    const bounds = L.latLngBounds(
      L.latLng(lat - r / 111320, lng - r / (111320 * Math.cos((lat * Math.PI) / 180))),
      L.latLng(lat + r / 111320, lng + r / (111320 * Math.cos((lat * Math.PI) / 180))),
    );
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 13 });
    fittedRef.current = true;
  }, [map, L, enabled, data, lat, lng]);

  if (!enabled) return null;

  // ── Floating panel ──
  const ring = data?.rings[String(selectedRadius)] || null;
  const colorMetricLabel =
    METRICS.find((m) => m.colorKey === colorKey)?.colorLabel || "Med. Income";

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 1100,
        width: collapsed ? "auto" : 320,
        background: "#FFFFFF",
        border: "1px solid #E5E1D6",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(15,23,43,0.12), 0 2px 4px rgba(15,23,43,0.05)",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: collapsed ? "8px 12px" : "10px 12px",
          background: "#0F172A",
          color: "#FFFFFF",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: 6,
              background: "rgba(212,178,85,0.18)",
              color: "#D4B255",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1 }}>
              Demographics
            </div>
            {!collapsed && propertyName && (
              <div
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.6)",
                  marginTop: 2,
                  maxWidth: 230,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={propertyName}
              >
                {propertyName}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          title={collapsed ? "Expand" : "Collapse"}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
          }}
        >
          {collapsed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          )}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: "10px 12px 12px" }}>
          {/* Address line */}
          {propertyAddress && (
            <div
              style={{
                fontSize: 10.5,
                color: "#64748B",
                marginBottom: 10,
                lineHeight: 1.4,
                paddingBottom: 8,
                borderBottom: "1px solid #F1EDE2",
              }}
            >
              {propertyAddress}
            </div>
          )}

          {/* Loading / error states */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#64748B", padding: "12px 4px" }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  border: "2px solid #E5E1D6",
                  borderTopColor: "#A17A2B",
                  borderRadius: "50%",
                  animation: "ds-demo-spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              <style>{`@keyframes ds-demo-spin { to { transform: rotate(360deg); } }`}</style>
              Loading Census tract data…
            </div>
          )}
          {error && (
            <div
              style={{
                fontSize: 11,
                color: "#7B1D1D",
                background: "rgba(177,47,47,0.08)",
                border: "1px solid rgba(177,47,47,0.2)",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && ring && data && (
            <>
              {/* Radius pills */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "#F6F4EE",
                  borderRadius: 999,
                  padding: 3,
                  marginBottom: 10,
                }}
              >
                {RADII.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRadius(r)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      border: "none",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: selectedRadius === r ? "#0F172A" : "transparent",
                      color: selectedRadius === r ? "#FFFFFF" : "#64748B",
                      transition: "all 0.12s ease",
                      fontFamily: "inherit",
                    }}
                  >
                    {r} mi
                  </button>
                ))}
              </div>

              {/* Metrics table */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  rowGap: 0,
                  border: "1px solid #F1EDE2",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                {METRICS.map((m, i) => {
                  const v = metricValue(ring, m.key as MetricKey);
                  const isActive = m.colorKey != null && m.colorKey === colorKey;
                  return (
                    <button
                      key={m.key}
                      onClick={() => m.colorKey && setColorKey(m.colorKey)}
                      disabled={!m.colorKey}
                      title={m.colorKey ? `Color tracts by ${m.colorLabel}` : undefined}
                      style={{
                        display: "contents",
                        cursor: m.colorKey ? "pointer" : "default",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: isActive ? "#A17A2B" : "#475569",
                          fontWeight: isActive ? 700 : 500,
                          padding: "7px 10px",
                          background: isActive ? "#FAF6E8" : i % 2 === 0 ? "#FFFFFF" : "#FBFAF6",
                          borderTop: i === 0 ? "none" : "1px solid #F1EDE2",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {m.colorKey && (
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: isActive ? "#A17A2B" : "#D8D3C4",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {m.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "#0F172A",
                          fontWeight: 700,
                          padding: "7px 10px",
                          background: isActive ? "#FAF6E8" : i % 2 === 0 ? "#FFFFFF" : "#FBFAF6",
                          borderTop: i === 0 ? "none" : "1px solid #F1EDE2",
                          fontVariantNumeric: "tabular-nums",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.fmt(v)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Color legend */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  fontSize: 10,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                }}
              >
                <span>Tract color</span>
                <span style={{ color: "#0F172A", textTransform: "none", fontWeight: 700, letterSpacing: 0 }}>
                  {colorMetricLabel}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, rgb(246,211,106) 0%, rgb(233,138,74) 50%, rgb(177,47,47) 100%)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "#94A3B8",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 3,
                }}
              >
                <span>{formatLegend(colorRange[0], colorKey)}</span>
                <span>{formatLegend(colorRange[1], colorKey)}</span>
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 9.5,
                  color: "#94A3B8",
                  lineHeight: 1.4,
                }}
              >
                Source: US Census ACS 5-Year (
                {process.env.NEXT_PUBLIC_ACS_YEAR || "2022"}). {ring.tractCount} tracts in {selectedRadius} mi.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatLegend(value: number, key: ColorKey): string {
  if (!Number.isFinite(value)) return "–";
  if (key === "medIncome" || key === "homeValue") {
    if (value >= 1000) return "$" + Math.round(value / 1000) + "k";
    return "$" + Math.round(value);
  }
  if (key === "rentersPct" || key === "educationPct" || key === "medicaidPct") {
    return value.toFixed(0) + "%";
  }
  if (key === "medAge") return value.toFixed(1);
  if (value >= 1000) return Math.round(value / 1000) + "k";
  return Math.round(value).toLocaleString();
}
