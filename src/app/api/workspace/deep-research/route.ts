import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

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

// ── Google Places Nearby Search ─────────────────────────────
async function searchNearbyPlaces(lat: number, lng: number, radius = 1600) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  const types = ["shopping_mall", "restaurant", "school", "hospital", "supermarket", "gym"];
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 20).map((p: any) => ({
      name: p.name,
      types: p.types?.slice(0, 3),
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      vicinity: p.vicinity,
      businessStatus: p.business_status,
    }));
  } catch {
    return [];
  }
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
) {
  const price = fields["pricing_deal_terms.asking_price"];
  const gla = fields["property_basics.building_sf"];

  // Categorize nearby places
  const restaurants = nearbyPlaces.filter((p: any) => p.types?.some((t: string) => ["restaurant", "food", "cafe", "meal_takeaway"].includes(t)));
  const retail = nearbyPlaces.filter((p: any) => p.types?.some((t: string) => ["store", "shopping_mall", "supermarket", "clothing_store"].includes(t)));
  const services = nearbyPlaces.filter((p: any) => p.types?.some((t: string) => ["hospital", "school", "gym", "bank", "pharmacy"].includes(t)));

  const newsSection = news.length > 0
    ? `RECENT NEWS ARTICLES ABOUT ${geo.city.toUpperCase()}, ${geo.state.toUpperCase()}:\n${news.map((n, i) => `${i + 1}. "${n.title}" — ${n.source} (${n.snippet})`).join("\n")}`
    : `No recent news articles found for ${geo.city}, ${geo.state}.`;

  const developmentSection = developments.length > 0
    ? `NEARBY DEVELOPMENTS/CONSTRUCTION:\n${developments.map((d: any) => `- ${d.name} (${d.address || "nearby"})`).join("\n")}`
    : "No specific new developments found nearby.";

  return `You are a senior CRE location intelligence analyst. Analyze this property's surroundings using the REAL DATA provided below. Focus on what's actually happening in and around this location — developments, civic activity, area dynamics, and investment implications.

PROPERTY:
- Name: ${propertyName}
- Address: ${address}
- City: ${geo.city}, ${geo.county}, ${geo.state} ${geo.zip}
${price ? `- Asking Price: $${Number(price).toLocaleString()}` : ""}
${gla ? `- GLA: ${Number(gla).toLocaleString()} SF` : ""}
${tenants.length > 0 ? `- Tenants: ${tenants.join(", ")}` : ""}

CITY/AREA BACKGROUND (from Wikipedia):
${wiki ? `${wiki.title}: ${wiki.extract}` : `No Wikipedia data found for ${geo.city}.`}

NEARBY BUSINESSES (within 1 mile — from Google Places):
- Restaurants/Food: ${restaurants.length} (${restaurants.slice(0, 5).map((r: any) => `${r.name}${r.rating ? ` (${r.rating}★)` : ""}`).join(", ") || "none found"})
- Retail/Shopping: ${retail.length} (${retail.slice(0, 5).map((r: any) => `${r.name}${r.rating ? ` (${r.rating}★)` : ""}`).join(", ") || "none found"})
- Services (medical, schools, banks): ${services.length} (${services.slice(0, 5).map((r: any) => r.name).join(", ") || "none found"})
- Total nearby places: ${nearbyPlaces.length}

${developmentSection}

${newsSection}

Based on this REAL data, produce a location intelligence report. Return a JSON object with EXACTLY this structure:

{
  "summary": "2-3 sentence overview of this location's dynamics and investment relevance based on the real data above",
  "sections": [
    {
      "title": "Area Development & Construction",
      "icon": "development",
      "items": [
        { "label": "Topic", "finding": "What's being built or planned nearby — reference specific projects from the data if found", "signal": "green|yellow|red" }
      ]
    },
    {
      "title": "Demographics & Community",
      "icon": "demographics",
      "items": [
        { "label": "Topic", "finding": "Population, income, growth trends for this specific city/area — use Wikipedia data", "signal": "green|yellow|red" }
      ]
    },
    {
      "title": "Nearby Businesses & Traffic Drivers",
      "icon": "traffic",
      "items": [
        { "label": "Business Name or Category", "finding": "Specific businesses that drive foot traffic — reference the Google Places data. Note anchor tenants, national chains, dining clusters", "signal": "green|yellow|red" }
      ]
    },
    {
      "title": "Recent News & Events",
      "icon": "news",
      "items": [
        { "label": "Headline or Topic", "finding": "What's been in the news about this area — reference specific articles from the data", "signal": "green|yellow|red" }
      ]
    },
    {
      "title": "Civic & Infrastructure",
      "icon": "civic",
      "items": [
        { "label": "Topic", "finding": "Road projects, public transit, zoning changes, tax incentives, government activity in this area", "signal": "green|yellow|red" }
      ]
    },
    {
      "title": "Investment Implications",
      "icon": "investment",
      "items": [
        { "label": "Implication", "finding": "What does all the above mean for a CRE investor looking at this specific property?", "signal": "green|yellow|red" }
      ]
    }
  ],
  "bottomLine": "1-2 sentence takeaway — is this location trending up, stable, or declining based on the evidence?"
}

RULES:
- Each section should have 2-4 items
- Reference SPECIFIC data from the inputs above — actual business names, news headlines, Wikipedia facts
- Do NOT make up data that isn't in the inputs — say "not enough data" if a section has limited info
- "signal" must be exactly "green", "yellow", or "red"
- Return ONLY valid JSON, no markdown fences`;
}

// ── POST handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { propertyId, propertyName, address, tenants } = await req.json();

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

    // Step 1: Geocode the address — try multiple fallbacks
    console.log(`[location-intel] Geocoding address="${address}" propertyName="${propertyName}" searchAddress="${searchAddress}"`);

    let geo = await geocodeAddress(searchAddress);

    // Fallback 1: try propertyName if address failed
    if (!geo && address && propertyName && address !== propertyName) {
      console.log(`[location-intel] Fallback: trying propertyName "${propertyName}"`);
      geo = await geocodeAddress(propertyName);
    }

    // Fallback 2: try just the property name without special chars
    if (!geo && propertyName) {
      const cleaned = propertyName.replace(/[—–\-]/g, " ").replace(/\s+/g, " ").trim();
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
    const [nearbyPlaces, developments, wiki, news, fields] = await Promise.all([
      searchNearbyPlaces(geo.lat, geo.lng, 1600),
      searchPlacesText(`new development construction near ${searchAddress}`),
      fetchWikipediaSummary(geo.city, geo.state),
      fetchAreaNews(geo.city, geo.state),
      loadPropertyContext(propertyId),
    ]);

    console.log(`[location-intel] Data gathered: ${nearbyPlaces.length} nearby, ${developments.length} developments, wiki: ${!!wiki}, ${news.length} news, ${Object.keys(fields).length} fields`);

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

    // Step 5: Persist to Firestore
    const db = getAdminDb();
    await db.collection("workspace_deep_research").doc(propertyId).set({
      propertyId,
      propertyName,
      address: searchAddress,
      geo,
      result,
      sourceCounts: {
        nearbyPlaces: nearbyPlaces.length,
        developments: developments.length,
        hasWiki: !!wiki,
        newsArticles: news.length,
        extractedFields: Object.keys(fields).length,
      },
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[location-intel] Error:", err);
    return NextResponse.json(
      { error: err.message || "Location research failed" },
      { status: 500 },
    );
  }
}

// ── GET handler — return cached research ────────────────────
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
    return NextResponse.json({ exists: true, ...data?.result, createdAt: data?.createdAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
