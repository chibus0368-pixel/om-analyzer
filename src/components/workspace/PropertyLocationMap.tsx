"use client";

/**
 * PropertyLocationMap
 *
 * Embeddable Leaflet map for a single property, used inside the
 * Demographics tab on /workspace/properties/[id]. Mirrors the map
 * setup on /workspace/map but scoped to ONE property and ships with
 * the demographics overlay enabled by default.
 *
 * Geocodes the address via /api/geocode if lat/lng aren't provided.
 */

import { useEffect, useRef, useState } from "react";
import DemographicsToggle from "@/components/demographics/DemographicsToggle";
import DemographicsOverlay from "@/components/demographics/DemographicsOverlay";

interface Props {
  propertyName: string;
  address: string;          // single-line address for geocoding + display
  lat?: number | null;
  lng?: number | null;
  initialDemographicsOn?: boolean;
}

export default function PropertyLocationMap({
  propertyName,
  address,
  lat: initialLat,
  lng: initialLng,
  initialDemographicsOn = true,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [geocodeError, setGeocodeError] = useState<string>("");
  const [demographicsOn, setDemographicsOn] = useState(initialDemographicsOn);

  // 1. Geocode address if we don't already have coords.
  useEffect(() => {
    if (coords || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
        if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data?.lat && data?.lng) {
          setCoords({ lat: Number(data.lat), lng: Number(data.lng) });
        } else if (!cancelled) {
          setGeocodeError("Could not locate this address on the map.");
        }
      } catch (err: any) {
        if (!cancelled) setGeocodeError(err?.message || "Geocode failed");
      }
    })();
    return () => { cancelled = true; };
  }, [address, coords]);

  // 2. Initialize Leaflet once we have the container + coords.
  useEffect(() => {
    if (!mapRef.current || !coords || mapInstanceRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      const Lf = (L as any).default || L;
      leafletRef.current = Lf;

      const map = Lf.map(mapRef.current, { zoomControl: true })
        .setView([coords.lat, coords.lng], 14);

      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Property pin
      const icon = Lf.divIcon({
        className: "ds-property-pin",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#4D7C0F;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;">$</div>`,
      });
      Lf.marker([coords.lat, coords.lng], { icon }).addTo(map)
        .bindTooltip(propertyName, { direction: "top", offset: [0, -16] });

      mapInstanceRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    })().catch(console.error);

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
      setMapReady(false);
    };
  }, [coords, propertyName]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        ref={mapRef}
        style={{
          width: "100%", height: 420, borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.08)", background: "#F3F4F6",
        }}
      />
      {!coords && !geocodeError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 13,
        }}>
          Locating address on map...
        </div>
      )}
      {geocodeError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 13, padding: 16, textAlign: "center",
        }}>
          {geocodeError}
        </div>
      )}

      {/* Demographics toggle - sits in the corner of the map */}
      {mapReady && (
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000 }}>
          <DemographicsToggle
            enabled={demographicsOn}
            onToggle={setDemographicsOn}
          />
        </div>
      )}

      {/* DemographicsOverlay layers concentric rings + tract polygons + a panel */}
      {mapReady && coords && (
        <DemographicsOverlay
          map={mapInstanceRef.current}
          L={leafletRef.current}
          enabled={demographicsOn}
          lat={coords.lat}
          lng={coords.lng}
          propertyName={propertyName}
          propertyAddress={address}
        />
      )}
    </div>
  );
}
