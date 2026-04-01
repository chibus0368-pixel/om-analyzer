import { NextRequest, NextResponse } from "next/server";

/**
 * Expand common US street abbreviations for better geocoding.
 */
function expandAbbreviations(addr: string): string {
  return addr
    .replace(/\bSt\b\.?/gi, "Street")
    .replace(/\bDr\b\.?/gi, "Drive")
    .replace(/\bAve\b\.?/gi, "Avenue")
    .replace(/\bBlvd\b\.?/gi, "Boulevard")
    .replace(/\bRd\b\.?/gi, "Road")
    .replace(/\bLn\b\.?/gi, "Lane")
    .replace(/\bCt\b\.?/gi, "Court")
    .replace(/\bPl\b\.?/gi, "Place")
    .replace(/\bPkwy\b\.?/gi, "Parkway")
    .replace(/\bHwy\b\.?/gi, "Highway")
    .replace(/\bN\b(?=\s+\d)/g, "North")
    .replace(/\bS\b(?=\s+\d)/g, "South")
    .replace(/\bE\b(?=\s+\d)/g, "East")
    .replace(/\bW\b(?=\s+\d)/g, "West");
}

/**
 * Clean CRE-style addresses for geocoding.
 */
function cleanAddress(raw: string): string[] {
  let addr = raw.trim();
  // Remove CRE corner prefixes
  addr = addr.replace(/^(NEC|SWC|SEC|NWC|NE|SW|SE|NW)\s+(Corner\s+(of\s+)?)?/i, "");
  // Handle address ranges: "6201 - 6271 S 27th St" → "6201 S 27th St"
  addr = addr.replace(/^(\d+)\s*[-–]\s*\d+\s+/, "$1 ");
  // Remove zip codes
  const addrNoZip = addr.replace(/,?\s*\d{5}(-\d{4})?\s*$/, "").trim();

  // For intersection addresses with "&" or "and"
  if (/\s[&]\s/.test(addr) || /\sand\s/i.test(addr)) {
    const parts = addrNoZip.split(",").map(s => s.trim());
    const streetPart = parts[0];
    const locationParts = parts.slice(1).join(", ");
    const withAnd = streetPart.replace(/\s*&\s*/g, " and ");
    const queries: string[] = [];
    if (locationParts) queries.push(`${withAnd}, ${locationParts}`);
    const streets = streetPart.split(/\s*[&]\s*|\s+and\s+/i);
    if (streets.length >= 2 && locationParts) {
      queries.push(`${streets[0].trim()}, ${locationParts}`);
      queries.push(`${streets[1].trim()}, ${locationParts}`);
    }
    return queries;
  }

  const queries = [addrNoZip];
  const expanded = expandAbbreviations(addrNoZip);
  if (expanded !== addrNoZip) queries.push(expanded);
  return queries;
}

/**
 * Try Photon geocoder (Komoot) — free, reliable, based on OSM, no rate limit.
 */
async function tryPhoton(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3&lang=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const features = data?.features || [];
    // Prefer results in the US with specific street-level types
    const usFeatures = features.filter((f: any) =>
      f?.properties?.country === "United States" ||
      f?.properties?.countrycode === "US"
    );
    const best = usFeatures[0] || features[0];
    if (best?.geometry?.coordinates) {
      const [lng, lat] = best.geometry.coordinates;
      const type = best.properties?.osm_value || best.properties?.type || "";
      const isApproximate = ["city", "town", "village", "county", "state", "country"].includes(type);
      console.log(`[geocode] Photon hit: ${query.substring(0, 50)} → ${lat.toFixed(5)},${lng.toFixed(5)} (${type}${isApproximate ? " APPROX" : ""})`);
      return isApproximate ? null : { lat, lng };
    }
  } catch (e: any) {
    console.log("[geocode] Photon error:", e.message);
  }
  return null;
}

/**
 * Try Photon geocoder accepting approximate (city-level) results.
 */
async function tryPhotonApprox(query: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3&lang=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const features = data?.features || [];
    const usFeatures = features.filter((f: any) =>
      f?.properties?.country === "United States" || f?.properties?.countrycode === "US"
    );
    const best = usFeatures[0] || features[0];
    if (best?.geometry?.coordinates) {
      const [lng, lat] = best.geometry.coordinates;
      const type = best.properties?.osm_value || best.properties?.type || "";
      const isApproximate = ["city", "town", "village", "county", "state", "country"].includes(type);
      return { lat, lng, approximate: isApproximate };
    }
  } catch {}
  return null;
}

/**
 * Try Nominatim free-text search.
 */
async function tryNominatim(query: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=1`,
      {
        headers: { "User-Agent": "NNNTripleNet-OMAnalyzer/1.0 (contact@nnntriplenet.com)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.[0]) {
      const resultType = data[0].type || "";
      const isApproximate = ["city", "town", "village", "county", "state", "administrative"].includes(resultType);
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        approximate: isApproximate,
      };
    }
  } catch {}
  return null;
}

/**
 * Try Nominatim structured query.
 */
async function tryNominatimStructured(address: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  const parts = address.split(",").map((s: string) => s.trim());
  if (parts.length < 2) return null;
  try {
    const params = new URLSearchParams({
      format: "json",
      street: parts[0],
      city: parts[1],
      state: (parts[2] || "").replace(/\d/g, "").trim(),
      countrycodes: "us",
      limit: "1",
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "NNNTripleNet-OMAnalyzer/1.0 (contact@nnntriplenet.com)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.[0]) {
      const resultType = data[0].type || "";
      const isApproximate = ["city", "town", "village", "county", "state", "administrative"].includes(resultType);
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        approximate: isApproximate,
      };
    }
  } catch {}
  return null;
}

/**
 * Server-side geocoding API route.
 * Priority: Google → Photon → Nominatim → Photon (approx) → Nominatim (approx)
 */
export async function GET(req: NextRequest) {
  const rawAddress = req.nextUrl.searchParams.get("address");
  if (!rawAddress) {
    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  }

  const queries = cleanAddress(rawAddress);
  console.log("[geocode] Raw:", rawAddress.substring(0, 60), "→ Cleaned:", queries.map(q => q.substring(0, 50)));

  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // === STRATEGY 1: Google Geocoding API (if key available) ===
  if (googleKey) {
    const googleQueries = [rawAddress, ...queries];
    for (const address of googleQueries) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
            const { lat, lng } = data.results[0].geometry.location;
            console.log(`[geocode] Google hit: ${address.substring(0, 50)} → ${lat},${lng}`);
            return NextResponse.json({ lat, lng, source: "google" });
          }
        }
      } catch {}
    }
  }

  // === STRATEGY 2: Photon (precise results only) ===
  for (const query of queries) {
    const result = await tryPhoton(query);
    if (result) {
      return NextResponse.json({ ...result, source: "photon" });
    }
  }
  // Also try with raw address
  const photonRaw = await tryPhoton(rawAddress);
  if (photonRaw) {
    return NextResponse.json({ ...photonRaw, source: "photon" });
  }

  // === STRATEGY 3: Photon with expanded abbreviations ===
  for (const query of queries) {
    const expanded = expandAbbreviations(query);
    if (expanded !== query) {
      const result = await tryPhoton(expanded);
      if (result) {
        return NextResponse.json({ ...result, source: "photon-expanded" });
      }
    }
  }

  // === STRATEGY 4: Nominatim free-text (precise only) ===
  for (const query of queries) {
    const result = await tryNominatim(query);
    if (result && !result.approximate) {
      return NextResponse.json({ lat: result.lat, lng: result.lng, source: "nominatim" });
    }
  }

  // === STRATEGY 5: Nominatim structured ===
  for (const query of queries) {
    const result = await tryNominatimStructured(query);
    if (result && !result.approximate) {
      return NextResponse.json({ lat: result.lat, lng: result.lng, source: "nominatim-structured" });
    }
  }

  // === STRATEGY 6: Nominatim with expanded abbreviations ===
  for (const query of queries) {
    const expanded = expandAbbreviations(query);
    if (expanded !== query) {
      const result = await tryNominatimStructured(expanded);
      if (result && !result.approximate) {
        return NextResponse.json({ lat: result.lat, lng: result.lng, source: "nominatim-expanded" });
      }
    }
  }

  // === STRATEGY 7: Photon approximate (city-level) as last resort ===
  for (const query of queries) {
    const result = await tryPhotonApprox(query);
    if (result) {
      return NextResponse.json({ lat: result.lat, lng: result.lng, source: "photon-approx", approximate: result.approximate });
    }
  }

  // === STRATEGY 8: Nominatim city-level fallback ===
  const fallbackParts = rawAddress.split(",").map((s: string) => s.trim());
  if (fallbackParts.length >= 2) {
    const cityState = fallbackParts.slice(-2).join(", ").replace(/\d/g, "").trim();
    const result = await tryNominatim(cityState);
    if (result) {
      return NextResponse.json({ lat: result.lat, lng: result.lng, source: "nominatim-city", approximate: true });
    }
  }

  console.log("[geocode] FAILED for:", rawAddress);
  return NextResponse.json({ error: "Could not geocode address", address: rawAddress }, { status: 404 });
}
