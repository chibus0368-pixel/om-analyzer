import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { configFor, TILE_LABELS, type TileKey } from "@/lib/workspace/location-intel/config";

export const maxDuration = 120;

// ── OpenAI helper ───────────────────────────────────────────
async function callOpenAI(
  messages: { role: string; content: string }[],
  maxTokens = 8000,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Google Places Nearby Search - multiple typed queries ────
async function searchNearbyPlaces(lat: number, lng: number, radius = 1600) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  // Run multiple type-specific searches to get comprehensive coverage
  const typeGroups = [
    "", // General (no type filter) - returns most prominent nearby
    "restaurant",
    "store",
    "shopping_mall",
    "supermarket",
    "bank",
    "school",
    "hospital",
    "gas_station",
    "pharmacy",
  ];

  const allPlaces: Map<string, any> = new Map();

  // Fire first 5 in parallel, then next 5
  const batch1 = typeGroups.slice(0, 5);
  const batch2 = typeGroups.slice(5);

  async function fetchType(type: string) {
    const typeParam = type ? `&type=${type}` : "";
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${typeParam}&key=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      for (const p of (data.results || []).slice(0, 20)) {
        if (!allPlaces.has(p.place_id)) {
          allPlaces.set(p.place_id, {
            name: p.name,
            types: p.types || [],
            rating: p.rating,
            userRatingsTotal: p.user_ratings_total,
            vicinity: p.vicinity,
            businessStatus: p.business_status,
            lat: p.geometry?.location?.lat,
            lng: p.geometry?.location?.lng,
          });
        }
      }
    } catch { /* skip */ }
  }

  await Promise.all(batch1.map(fetchType));
  await Promise.all(batch2.map(fetchType));

  return Array.from(allPlaces.values());
}

// ── Google Text Search for specific queries ──────────────────
async function searchPlacesText(query: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 10).map((p: any) => ({
      name: p.name,
      address: p.formatted_address,
      rating: p.rating,
      types: p.types?.slice(0, 3),
      businessStatus: p.business_status,
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
    }));
  } catch {
    return [];
  }
}

// ── Geocode address to lat/lng ───────────────────────────────
async function geocodeAddress(address: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.error("[geocode] No Google Maps API key found");
    return null;
  }
  if (!address || !address.trim()) {
    console.error("[geocode] Empty address provided");
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[geocode] HTTP error ${res.status} for "${address}"`);
      return null;
    }
    const data = await res.json();

    if (data.status !== "OK") {
      console.error(`[geocode] API status="${data.status}" error="${data.error_message || "none"}" for "${address}"`);
      return null;
    }

    const loc = data.results?.[0]?.geometry?.location;
    const components = data.results?.[0]?.address_components || [];

    let city = "", county = "", state = "", zip = "";
    for (const c of components) {
      if (c.types.includes("locality")) city = c.long_name;
      if (c.types.includes("administrative_area_level_2")) county = c.long_name;
      if (c.types.includes("administrative_area_level_1")) state = c.long_name;
      if (c.types.includes("postal_code")) zip = c.short_name;
    }

    return loc ? { lat: loc.lat, lng: loc.lng, city, county, state, zip } : null;
  } catch (err) {
    console.error(`[geocode] Exception for "${address}":`, err);
    return null;
  }
}

// ── Fetch Wikipedia summary for city ─────────────────────────
async function fetchWikipediaSummary(city: string, state: string) {
  if (!city) return null;
  const query = `${city}, ${state}`;
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, "_"))}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      extract: data.extract?.substring(0, 1000) || "",
      description: data.description || "",
    };
  } catch {
    return null;
  }
}

// ── Fetch Google News RSS for area ───────────────────────────
async function fetchAreaNews(city: string, state: string) {
  if (!city) return [];
  const queries = [
    `"${city}" "${state}" development construction`,
    `"${city}" "${state}" zoning planning`,
    `"${city}" "${state}" business opening`,
    `"${city}" "${state}" commercial real estate`,
  ];

  const allItems: { title: string; source: string; snippet: string }[] = [];

  for (const q of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();

      // Simple XML parsing for RSS items
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items.slice(0, 5)) {
        const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1") || "";
        const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1") || "";
        const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
        allItems.push({ title: title.trim(), source: source.trim(), snippet: pubDate.trim() });
      }
    } catch {
      continue;
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return allItems.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  }).slice(0, 15);
}

// ── Fetch Census demographics (ACS 5-year) ──────────────────
async function fetchCensusData(state: string, city: string) {
  try {
    // State FIPS lookup (common ones)
    const stateFips: Record<string, string> = {
      "Alabama": "01", "Alaska": "02", "Arizona": "04", "Arkansas": "05",
      "California": "06", "Colorado": "08", "Connecticut": "09", "Delaware": "10",
      "Florida": "12", "Georgia": "13", "Hawaii": "15", "Idaho": "16",
      "Illinois": "17", "Indiana": "18", "Iowa": "19", "Kansas": "20",
      "Kentucky": "21", "Louisiana": "22", "Maine": "23", "Maryland": "24",
      "Massachusetts": "25", "Michigan": "26", "Minnesota": "27", "Mississippi": "28",
      "Missouri": "29", "Montana": "30", "Nebraska": "31", "Nevada": "32",
      "New Hampshire": "33", "New Jersey": "34", "New Mexico": "35", "New York": "36",
      "North Carolina": "37", "North Dakota": "38", "Ohio": "39", "Oklahoma": "40",
      "Oregon": "41", "Pennsylvania": "42", "Rhode Island": "44", "South Carolina": "45",
      "South Dakota": "46", "Tennessee": "47", "Texas": "48", "Utah": "49",
      "Vermont": "50", "Virginia": "51", "Washington": "53", "West Virginia": "54",
      "Wisconsin": "55", "Wyoming": "56", "District of Columbia": "11",
    };

    const fips = stateFips[state];
    if (!fips) return null;

    // ACS variables: population, median income, median age, median home value, total housing units
    const vars = "B01003_001E,B19013_001E,B01002_001E,B25077_001E,B25001_001E,B23025_002E,B23025_005E";
    const url = `https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=place:*&in=state:${fips}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    // Find matching city (case-insensitive, handle "city" suffix)
    const cityLower = city.toLowerCase().replace(/ city$/, "").replace(/ town$/, "").replace(/ village$/, "");
    const header = data[0];
    const match = data.slice(1).find((row: string[]) => {
      const name = (row[header.indexOf("NAME")] || "").toLowerCase();
      return name.includes(cityLower);
    });

    if (!match) return null;

    const pop = Number(match[0]);
    const medianIncome = Number(match[1]);
    const medianAge = Number(match[2]);
    const medianHomeValue = Number(match[3]);
    const housingUnits = Number(match[4]);
    const laborForce = Number(match[5]);
    const unemployed = Number(match[6]);
    const unemploymentRate = laborForce > 0 ? ((unemployed / laborForce) * 100) : null;

    return {
      population: pop > 0 ? pop : null,
      medianIncome: medianIncome > 0 ? medianIncome : null,
      medianAge: medianAge > 0 ? medianAge : null,
      medianHomeValue: medianHomeValue > 0 ? medianHomeValue : null,
      housingUnits: housingUnits > 0 ? housingUnits : null,
      unemploymentRate: unemploymentRate !== null && unemploymentRate >= 0 ? Math.round(unemploymentRate * 10) / 10 : null,
    };
  } catch (err) {
    console.log("[census] Failed to fetch:", err);
    return null;
  }
}

// ── Load extracted fields from Firestore ─────────────────────
async function loadPropertyContext(propertyId: string) {
  const db = getAdminDb();
  const snap = await db
    .collection("workspace_extracted_fields")
    .where("propertyId", "==", propertyId)
    .get();

  const fields: Record<string, any> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    const key = `${data.fieldGroup}.${data.fieldName}`;
    fields[key] = data.isUserOverridden
      ? data.userOverrideValue
      : data.normalizedValue || data.rawValue;
  });
  return fields;
}

// ── Categorize nearby places into CRE-relevant groups ────────
function categorizePlaces(places: any[]) {
  const categories: Record<string, any[]> = {
    anchors: [],      // Major national/regional chains, big box, grocery
    restaurants: [],   // All food & dining
    retail: [],        // Shops, stores
    services: [],      // Banks, medical, professional
    fitness_rec: [],   // Gyms, recreation, entertainment
    education: [],     // Schools, universities, daycare
    automotive: [],    // Gas, auto repair, car dealers
    other: [],         // Everything else
  };

  const anchorKeywords = [
    "walmart", "target", "costco", "kroger", "publix", "heb", "whole foods",
    "trader joe", "aldi", "home depot", "lowe", "best buy", "walgreens",
    "cvs", "dollar general", "dollar tree", "mcdonald", "starbucks", "chick-fil-a",
    "chipotle", "panera", "tj maxx", "marshalls", "ross", "hobby lobby",
    "menards", "ace hardware", "autozone", "o'reilly", "petsmart", "petco",
  ];

  for (const p of places) {
    if (p.businessStatus === "CLOSED_PERMANENTLY") continue;

    const types = (p.types || []) as string[];
    const nameL = (p.name || "").toLowerCase();

    // Check if national anchor
    const isAnchor = anchorKeywords.some(kw => nameL.includes(kw)) ||
      (p.userRatingsTotal && p.userRatingsTotal > 1000);

    if (isAnchor) {
      categories.anchors.push(p);
      continue;
    }

    // Categorize by type
    const hasType = (...ts: string[]) => types.some(t => ts.includes(t));

    if (hasType("restaurant", "food", "cafe", "meal_delivery", "meal_takeaway", "bakery", "bar")) {
      categories.restaurants.push(p);
    } else if (hasType("store", "shopping_mall", "supermarket", "clothing_store",
      "convenience_store", "home_goods_store", "furniture_store", "book_store",
      "electronics_store", "jewelry_store", "shoe_store", "hardware_store",
      "liquor_store", "florist", "pet_store")) {
      categories.retail.push(p);
    } else if (hasType("bank", "hospital", "doctor", "dentist", "pharmacy",
      "insurance_agency", "lawyer", "accounting", "real_estate_agency",
      "veterinary_care", "post_office", "local_government_office")) {
      categories.services.push(p);
    } else if (hasType("gym", "stadium", "movie_theater", "bowling_alley",
      "amusement_park", "spa", "park", "tourist_attraction")) {
      categories.fitness_rec.push(p);
    } else if (hasType("school", "university", "secondary_school", "primary_school")) {
      categories.education.push(p);
    } else if (hasType("gas_station", "car_dealer", "car_repair", "car_wash", "car_rental")) {
      categories.automotive.push(p);
    } else {
      categories.other.push(p);
    }
  }

  return categories;
}

// ── Build the location intelligence prompt ───────────────────
function buildLocationPrompt(
  propertyName: string,
  address: string,
  tenants: string[],
  geo: { city: string; county: string; state: string; zip: string },
  nearbyPlaces: any[],
  developments: any[],
  wiki: any,
  news: any[],
  fields: Record<string, any>,
  census: any,
  analysisType: string,
) {
  const price = fields["pricing_deal_terms.asking_price"];
  const gla = fields["property_basics.building_sf"];
  const occupancy = fields["property_basics.occupancy_pct"];
  const yearBuilt = fields["property_basics.year_built"];
  const capRate = fields["pricing_deal_terms.cap_rate_actual"] || fields["pricing_deal_terms.cap_rate_asking"];

  const cats = categorizePlaces(nearbyPlaces);

  const formatPlaces = (arr: any[], max = 8) =>
    arr.slice(0, max).map((p: any) =>
      `${p.name}${p.rating ? ` (${p.rating}★, ${p.userRatingsTotal || "?"} reviews)` : ""}${p.vicinity ? ` - ${p.vicinity}` : ""}`
    ).join("\n    ") || "none found";

  const newsSection = news.length > 0
    ? `RECENT NEWS ARTICLES ABOUT ${geo.city.toUpperCase()}, ${geo.state.toUpperCase()}:\n${news.map((n, i) => `${i + 1}. "${n.title}" - ${n.source} (${n.snippet})`).join("\n")}`
    : `No recent news articles found for ${geo.city}, ${geo.state}.`;

  const developmentSection = developments.length > 0
    ? `NEARBY DEVELOPMENTS/CONSTRUCTION (from Google Places search):\n${developments.map((d: any) => `- ${d.name} - ${d.address || "nearby"}`).join("\n")}`
    : "No specific new developments found in Google Places search.";

  const censusSection = census
    ? `CENSUS DATA (ACS 2022, ${geo.city}, ${geo.state}):
  - Population: ${census.population?.toLocaleString() || "N/A"}
  - Median Household Income: ${census.medianIncome ? "$" + census.medianIncome.toLocaleString() : "N/A"}
  - Median Age: ${census.medianAge || "N/A"}
  - Median Home Value: ${census.medianHomeValue ? "$" + census.medianHomeValue.toLocaleString() : "N/A"}
  - Housing Units: ${census.housingUnits?.toLocaleString() || "N/A"}
  - Unemployment Rate: ${census.unemploymentRate !== null ? census.unemploymentRate + "%" : "N/A"}`
    : `No Census data available for ${geo.city}, ${geo.state}.`;

  // Per-asset-type rubric + anchor bias + tile keys. Config is the single
  // place we describe "what matters" for each asset class - the prompt
  // below just inlines it.
  const cfg = configFor(analysisType);
  const assetContext = cfg.focusPrompt;
  const rubricLines = cfg.signalRubric.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
  const tileGuidance = cfg.tileKeys.map((k) => `${k} (${TILE_LABELS[k]})`).join(", ");

  return `You are a senior CRE location intelligence analyst. Produce a CONCISE visual-style location report. No lengthy paragraphs - think dashboard, not essay.

PROPERTY:
- Name: ${propertyName}
- Address: ${address}
- City: ${geo.city}, ${geo.county}, ${geo.state} ${geo.zip}
- Asset Type: ${analysisType || "retail"}
${price ? `- Asking Price: $${Number(price).toLocaleString()}` : ""}
${gla ? `- GLA: ${Number(gla).toLocaleString()} SF` : ""}
${capRate ? `- Cap Rate: ${Number(capRate).toFixed(2)}%` : ""}
${occupancy ? `- Occupancy: ${Number(occupancy).toFixed(0)}%` : ""}
${yearBuilt ? `- Year Built: ${yearBuilt}` : ""}
${tenants.length > 0 ? `- Known Tenants: ${tenants.join(", ")}` : ""}

${assetContext}

─── DATA ───

${censusSection}

CITY BACKGROUND: ${wiki ? `${wiki.title}: ${wiki.extract}` : "N/A"}

NEARBY BUSINESSES (1mi radius - ${nearbyPlaces.length} total):
  Anchors (${cats.anchors.length}): ${formatPlaces(cats.anchors, 6)}
  Restaurants (${cats.restaurants.length}): ${formatPlaces(cats.restaurants, 5)}
  Retail (${cats.retail.length}): ${formatPlaces(cats.retail, 5)}
  Services (${cats.services.length}): ${formatPlaces(cats.services, 4)}
  Education (${cats.education.length}): ${formatPlaces(cats.education, 3)}
  Fitness (${cats.fitness_rec.length}): ${formatPlaces(cats.fitness_rec, 3)}
  Auto/Gas (${cats.automotive.length}): ${formatPlaces(cats.automotive, 3)}
  Other (${cats.other.length}): ${formatPlaces(cats.other, 3)}

${developmentSection}

${newsSection}

─── SIGNAL RUBRIC FOR THIS ASSET TYPE ───

Grade the following signals (in this order). Use only what is supported by the data above.
${rubricLines}

─── OUTPUT (JSON only) ───

Return EXACTLY this structure. Keep text SHORT - 1 sentence per finding, max 15 words per label.

{
  "locationGrade": "A|A-|B+|B|B-|C+|C|C-|D",
  "gradeRationale": "1 sentence explaining the grade using specific data",
  "summary": "2 sentences max. Reference key data points: population, income, anchors.",
  "tiles": [
    {
      "key": "one of: ${tileGuidance}",
      "label": "display label",
      "value": "formatted value e.g. '134,200', '$94,600', '40.5', '$348K', '2.9%'",
      "confidence": "high|medium|low"
    }
  ],
  "anchors": [
    {
      "name": "Actual business name from the data",
      "confidence": "high|medium|low"
    }
  ],
  "anchorDataQuality": "good|sparse|unknown",
  "signals": [
    {
      "label": "Short label (max 5 words)",
      "detail": "1 sentence with specific data - name a business, cite a number, reference an article",
      "band": "strong|watch|caution",
      "signal": "green|yellow|red",
      "icon": "traffic|demographics|development|news|civic|investment|comps",
      "confidence": "high|medium|low"
    }
  ],
  "topAnchors": ["Name1", "Name2", "Name3"],
  "bottomLine": "1 sentence - bullish, neutral, or cautious on this location and why"
}

RULES:
- "tiles": return only the keys listed above, in that order. Omit a tile entirely if the underlying datapoint is not in the data we provided or its confidence is low. NEVER fabricate a value.
- "tiles[].confidence": "high" only if the value came directly from Census or a citeable source above; "medium" if derived/estimated from surrounding data; "low" otherwise (and you should omit it).
- "anchors": only include businesses that actually appear in the NEARBY BUSINESSES data above. 3-6 items. Skip restaurants unless they are national chains that anchor traffic (Chick-fil-A, Starbucks-caliber). Prefer grocery, hospital, big-box, mall, pharmacy, university.
- "anchors[].confidence": "high" if the business appears in the "Anchors" bucket; "medium" if prominent by reviews (>1000); omit if "low".
- "anchorDataQuality": "good" if the data has >= 3 branded anchors within 1mi; "sparse" if 1-2 or only generic businesses; "unknown" if the search returned nothing meaningful. NEVER say a location has "no nearby anchors" - say "anchor coverage is sparse in this dataset" instead.
- "signals" array: return ONLY 3 items, matching the rubric above in order. Skip any rubric item you cannot support with the data.
- Each signal "detail" must be 1 sentence, max 25 words. Cite specific names/numbers.
- "band": "strong" (positive fundamentals), "watch" (mixed / needs diligence), "caution" (material concern).
- "signal": "green"=strong, "yellow"=watch, "red"=caution. Keep consistent with "band".
- "topAnchors": list the 3-5 most notable anchor/national businesses within 1 mile. Use actual names from the data.
- If businesses exist in the data, you MUST name them. Never say "no businesses found" when data shows otherwise.
- Do NOT invent data. If sparse, say so briefly and lower the confidence.
- Return ONLY valid JSON, no markdown`;
}

// ── POST handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { propertyId, propertyName, address, tenants, analysisType } = await req.json();

    if (!propertyId || !propertyName) {
      return NextResponse.json(
        { error: "propertyId and propertyName are required" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    const searchAddress = address || propertyName;

    // Step 1: Geocode the address - try multiple fallbacks
    console.log(`[location-intel] Geocoding address="${address}" propertyName="${propertyName}" searchAddress="${searchAddress}"`);

    let geo = await geocodeAddress(searchAddress);

    // Fallback 1: try propertyName if address failed
    if (!geo && address && propertyName && address !== propertyName) {
      console.log(`[location-intel] Fallback: trying propertyName "${propertyName}"`);
      geo = await geocodeAddress(propertyName);
    }

    // Fallback 2: try just the property name without special chars
    if (!geo && propertyName) {
      const cleaned = propertyName.replace(/[-–\-]/g, " ").replace(/\s+/g, " ").trim();
      if (cleaned !== propertyName) {
        console.log(`[location-intel] Fallback: trying cleaned name "${cleaned}"`);
        geo = await geocodeAddress(cleaned);
      }
    }

    if (!geo) {
      console.error(`[location-intel] All geocoding attempts failed for address="${address}" propertyName="${propertyName}"`);
      return NextResponse.json(
        { error: `Could not geocode location. Address sent: "${searchAddress}". Check the property address fields and try again.` },
        { status: 400 },
      );
    }
    console.log(`[location-intel] Geocoded to: ${geo.city}, ${geo.state} (${geo.lat}, ${geo.lng})`);

    // Step 2: Run all data fetches in parallel
    const [nearbyPlaces, developments, wiki, news, fields, census] = await Promise.all([
      searchNearbyPlaces(geo.lat, geo.lng, 1600),
      searchPlacesText(`new development construction near ${searchAddress}`),
      fetchWikipediaSummary(geo.city, geo.state),
      fetchAreaNews(geo.city, geo.state),
      loadPropertyContext(propertyId),
      fetchCensusData(geo.state, geo.city),
    ]);

    console.log(`[location-intel] Data gathered: ${nearbyPlaces.length} nearby, ${developments.length} developments, wiki: ${!!wiki}, ${news.length} news, ${Object.keys(fields).length} fields, census: ${!!census}`);

    // Step 3: Build prompt and call OpenAI
    const prompt = buildLocationPrompt(
      propertyName,
      searchAddress,
      tenants || [],
      geo,
      nearbyPlaces,
      developments,
      wiki,
      news,
      fields,
      census,
      analysisType || fields["property_basics.analysis_type"] || "retail",
    );

    const raw = await callOpenAI([{ role: "user", content: prompt }]);

    // Step 4: Parse the JSON response
    let result: any;
    try {
      const cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("[location-intel] Failed to parse JSON:", raw.substring(0, 500));
      result = {
        summary: raw.substring(0, 500),
        sections: [],
        bottomLine: "Research completed but structured output could not be parsed.",
      };
    }

    // Step 4a: Confidence gating and safer fallbacks. The prompt already
    // tells the model to omit low-confidence items, but we enforce it here
    // too so a drift in the LLM output can never leak low-confidence
    // numbers into the UI. Mid/high only.
    if (Array.isArray(result.tiles)) {
      result.tiles = result.tiles.filter(
        (t: any) => t && t.value && (t.confidence === "high" || t.confidence === "medium"),
      );
    }
    if (Array.isArray(result.anchors)) {
      result.anchors = result.anchors.filter(
        (a: any) => a && a.name && (a.confidence === "high" || a.confidence === "medium"),
      );
    }
    if (Array.isArray(result.signals)) {
      result.signals = result.signals.filter(
        (s: any) => s && s.label && (s.confidence === "high" || s.confidence === "medium" || !s.confidence),
      );
    }

    // Step 4b: Anchor-fallback safety. Users reported false negatives from
    // the old "No nearby anchors" state - often anchors are there, the
    // model just failed to name them. If the LLM produced zero typed
    // anchors but the Places search actually returned anchors, backfill
    // from the deterministic Places data instead of showing an empty
    // state. If even Places was thin, surface as "sparse" not "none".
    const placesAnchorCats = categorizePlaces(nearbyPlaces);
    if (!Array.isArray(result.anchors) || result.anchors.length === 0) {
      const fallbackAnchors = placesAnchorCats.anchors
        .filter((a: any) => a.businessStatus !== "CLOSED_PERMANENTLY")
        .slice(0, 6)
        .map((a: any) => ({ name: a.name, confidence: "high" as const }));
      if (fallbackAnchors.length > 0) {
        result.anchors = fallbackAnchors;
        result.anchorDataQuality = result.anchorDataQuality || "good";
      } else if (!result.anchorDataQuality || result.anchorDataQuality === "unknown") {
        result.anchorDataQuality = "sparse";
      }
    }

    // Step 5: Persist to Firestore - include map data for UI
    const db = getAdminDb();
    const cats = categorizePlaces(nearbyPlaces);
    await db.collection("workspace_deep_research").doc(propertyId).set({
      propertyId,
      propertyName,
      address: searchAddress,
      geo,
      result,
      // Map data for client-side rendering
      mapData: {
        center: { lat: geo.lat, lng: geo.lng },
        nearbyPlaces: nearbyPlaces.slice(0, 50).map((p: any) => ({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          types: p.types?.slice(0, 3),
          rating: p.rating,
          category: getPlaceCategory(p, cats),
        })),
        developments: developments.slice(0, 10).map((d: any) => ({
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          address: d.address,
        })),
      },
      census,
      sourceCounts: {
        nearbyPlaces: nearbyPlaces.length,
        developments: developments.length,
        hasWiki: !!wiki,
        newsArticles: news.length,
        extractedFields: Object.keys(fields).length,
        hasCensus: !!census,
        categoryCounts: {
          anchors: cats.anchors.length,
          restaurants: cats.restaurants.length,
          retail: cats.retail.length,
          services: cats.services.length,
          fitness: cats.fitness_rec.length,
          education: cats.education.length,
          automotive: cats.automotive.length,
          other: cats.other.length,
        },
      },
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ...result,
      mapData: {
        center: { lat: geo.lat, lng: geo.lng },
        nearbyPlaces: nearbyPlaces.slice(0, 50).map((p: any) => ({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          types: p.types?.slice(0, 3),
          rating: p.rating,
          category: getPlaceCategory(p, cats),
        })),
        developments: developments.slice(0, 10).map((d: any) => ({
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          address: d.address,
        })),
      },
      census,
      sourceCounts: {
        nearbyPlaces: nearbyPlaces.length,
        categoryCounts: {
          anchors: cats.anchors.length,
          restaurants: cats.restaurants.length,
          retail: cats.retail.length,
          services: cats.services.length,
        },
      },
    });
  } catch (err: any) {
    console.error("[location-intel] Error:", err);
    return NextResponse.json(
      { error: err.message || "Location research failed" },
      { status: 500 },
    );
  }
}

// Helper: determine which category a place belongs to
function getPlaceCategory(place: any, cats: Record<string, any[]>): string {
  for (const [cat, list] of Object.entries(cats)) {
    if (list.some((p: any) => p.name === place.name)) return cat;
  }
  return "other";
}

// ── GET handler - return cached research ────────────────────
export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection("workspace_deep_research").doc(propertyId).get();
    if (!doc.exists) {
      return NextResponse.json({ exists: false });
    }
    const data = doc.data();
    return NextResponse.json({
      exists: true,
      ...data?.result,
      mapData: data?.mapData,
      census: data?.census,
      sourceCounts: data?.sourceCounts,
      createdAt: data?.createdAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
