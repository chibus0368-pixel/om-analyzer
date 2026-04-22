/**
 * Map layer. Owns the Leaflet instance, tract choropleth, radius rings,
 * and the property pin. All state comes from the caller via update().
 */
import { rampColor, robustRange } from './colors.js';

const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const TILE_ATTR =
  '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>';

export function createMap(elementId) {
  const map = L.map(elementId, {
    zoomControl: true,
    preferCanvas: true,
  }).setView([43.42, -88.18], 12);

  L.tileLayer(TILE_DARK, {
    attribution: TILE_ATTR,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const state = {
    map,
    tractLayer: null,
    ringsLayer: L.layerGroup().addTo(map),
    pin: null,
  };

  return {
    el: map,
    update(ctx) {
      return update(state, ctx);
    },
  };
}

function update(state, { center, radii, tracts, colorKey }) {
  const { map } = state;

  if (state.tractLayer) {
    map.removeLayer(state.tractLayer);
    state.tractLayer = null;
  }
  state.ringsLayer.clearLayers();
  if (state.pin) {
    map.removeLayer(state.pin);
    state.pin = null;
  }

  // Color ramp range based on tract values for the selected metric.
  const values = (tracts.features || [])
    .map(f => Number(f.properties?.[colorKey]))
    .filter(Number.isFinite);
  const [lo, hi] = robustRange(values);

  state.tractLayer = L.geoJSON(tracts, {
    style: feat => {
      const v = Number(feat.properties?.[colorKey]);
      const t = Number.isFinite(v) ? (v - lo) / (hi - lo || 1) : NaN;
      return {
        color: '#0b1420',
        weight: 0.5,
        fillColor: rampColor(t),
        fillOpacity: Number.isFinite(t) ? 0.72 : 0.25,
      };
    },
    onEachFeature: (feat, layer) => {
      const p = feat.properties || {};
      const name = p.BASENAME || p.GEOID;
      const v = p[colorKey];
      layer.bindTooltip(
        `<div><b>Tract ${name}</b><br/>${colorKey}: ${v == null ? '-' : Number(v).toLocaleString()}</div>`,
        { className: 'tract-tooltip', sticky: true }
      );
    },
  }).addTo(map);

  // Radius rings (dashed)
  for (const r of radii) {
    L.circle([center.lat, center.lng], {
      radius: r * 1609.34,
      color: '#6fe9d9',
      weight: 1.5,
      dashArray: '6, 6',
      fill: false,
    }).addTo(state.ringsLayer);
  }

  // Property pin
  state.pin = L.marker([center.lat, center.lng], {
    icon: L.divIcon({
      className: '',
      html: '<div class="prop-pin"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
    interactive: false,
  }).addTo(map);

  // Frame the largest ring
  const maxRadius = Math.max(...radii);
  const bounds = L.latLng(center.lat, center.lng).toBounds(maxRadius * 1609.34 * 2.4);
  map.fitBounds(bounds, { padding: [10, 10] });

  return { range: [lo, hi] };
}
