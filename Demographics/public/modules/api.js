/**
 * Thin client for the backend. Base URL is same-origin by default so the
 * static frontend can be served by the Express app.
 */
const BASE = window.DEMOGRAPHICS_API_BASE || '';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function geocode(address) {
  return getJson(`${BASE}/api/geocode?address=${encodeURIComponent(address)}`);
}

export async function getDemographics(lat, lng, radii = [1, 3, 5]) {
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radii: radii.join(','),
  });
  return getJson(`${BASE}/api/demographics?${q}`);
}
