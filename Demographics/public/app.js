/**
 * App orchestrator. Wires the backend API client, the demographics panel,
 * and the map together. Keeps a single reactive `state` object so the
 * render pipeline is trivial to follow.
 */
import { geocode, getDemographics } from './modules/api.js';
import { renderPanel } from './modules/panel.js';
import { createMap } from './modules/map.js';
import { DEFAULT_COLOR_KEY } from './modules/metrics-config.js';

const DEFAULT_ADDRESS = '820 S Main St, West Bend, WI 53095';
const DEFAULT_LABEL = 'West Bend Plaza';

const panelEl = document.getElementById('panel');
const loadingEl = document.getElementById('loading');
const mapCtrl = createMap('map');

const state = {
  address: DEFAULT_ADDRESS,
  label: DEFAULT_LABEL,
  center: null,
  radii: [1, 3, 5],
  rings: null,
  tracts: null,
  radius: 1,
  colorKey: DEFAULT_COLOR_KEY,
  colorRange: [0, 1],
  loading: false,
  error: null,
};

function setLoading(on) {
  state.loading = on;
  loadingEl.classList.toggle('hidden', !on);
}

function render() {
  renderPanel(panelEl, state, {
    onRadius: r => {
      state.radius = r;
      render();
    },
    onColor: k => {
      state.colorKey = k;
      paintMap();
      render();
    },
  });
}

function paintMap() {
  if (!state.tracts || !state.center) return;
  const result = mapCtrl.update({
    center: state.center,
    radii: state.radii,
    tracts: state.tracts,
    colorKey: state.colorKey,
  });
  state.colorRange = result.range;
}

async function loadAddress(address, label) {
  setLoading(true);
  state.error = null;
  try {
    const g = await geocode(address);
    state.center = { lat: g.lat, lng: g.lng };
    state.address = g.matchedAddress || address;
    state.label = label || address;
    document.getElementById('site-name').textContent = state.label;
    document.getElementById('site-addr').textContent = state.address;
    document.getElementById('detail-title').textContent = state.label;
    document.getElementById('detail-addr').textContent = state.address;

    const data = await getDemographics(g.lat, g.lng, state.radii);
    state.rings = data.rings;
    state.tracts = data.tracts;
    paintMap();
    render();
  } catch (err) {
    console.error(err);
    state.error = err.message;
    alert(`Load failed: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// Initial render (empty) so users see the skeleton while data loads.
render();

// Kick off with the reference property so a fresh visit shows something.
loadAddress(DEFAULT_ADDRESS, DEFAULT_LABEL);

// Simple address search
document.getElementById('addr-go').addEventListener('click', () => {
  const v = document.getElementById('addr-input').value.trim();
  if (v) loadAddress(v, v);
});
document.getElementById('addr-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addr-go').click();
});
