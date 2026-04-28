import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-property background research enrichment.
 *
 * GET  /api/workspace/research/[propertyId]
 *      → returns the cached research doc (or 404 if none yet)
 *
 * POST /api/workspace/research/[propertyId]
 *      body: { force?: boolean }
 *      → runs nearby Places + ACS demographics, stores in
 *        workspace_research/{propertyId}, returns the data.
 *        Skipped if a fresh result (< 7 days old) exists unless
 *        force: true.
 *
 * Designed to be fire-and-forget from the parse pipeline OR called
 * on-demand from the chat / property page. Tries hard not to block:
 * 6s timeout per upstream call, partial results returned if some
 * sources fail.
 */

const FRESHNESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface NearbyPlace {
  name: string;
  category: string;       // our normalized bucket: "anchor", "qsr", "school", etc.
  types: string[];        // raw Google types
  rating?: number;
  vicinity?: string;
  distanceMeters?: number;
}

interface CensusBlock {
  geo: string;             // "tract" / "block group" / "city"
  population?: number;
  medianIncome?: number;
  medianAge?: number;
  medianHomeValue?: number;
  housingUnits?: number;
  laborForce?: number;
  unemployed?: number;
}

interface ResearchDoc {
  propertyId: string;
  userId: string;
  refreshedAt: string;
  lat: number | null;
  lng: number | null;
  nearby: NearbyPlace[];
  demographics: CensusBlock | null;
  comps: { note: string; sources: string[] };
}

// ── Helpers (slimmed-down versions of deep-research) ────────

const STATE_FIPS: Record<string, string> = {
  "alabama":"01","alaska":"02","arizona":"04","arkansas":"05","california":"06",
  "colorado":"08","connecticut":"09","delaware":"10","florida":"12","georgia":"13",
  "hawaii":"15","idaho":"16","illinois":"17","indiana":"18","iowa":"19","kansas":"20",
  "kentucky":"21","louisiana":"22","maine":"23","maryland":"24","massachusetts":"25",
  "michigan":"26","minnesota":"27","mississippi":"28","missouri":"29","montana":"30",
  "nebraska":"31","nevada":"32","new hampshire":"33","new jersey":"34","new mexico":"35",
  "new york":"36","north carolina":"37","north dakota":"38","ohio":"39","oklahoma":"40",
  "oregon":"41","pennsylvania":"42","rhode island":"44","south carolina":"45",
  "south dakota":"46","tennessee":"47","texas":"48","utah":"49","vermont":"50",
  "virginia":"51","washington":"53","west virginia":"54","wisconsin":"55","wyoming":"56",
  "district of columbia":"11","dc":"11",
};

function googleKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = googleKey();
  if (!key || !address.trim()) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

function categorize(types: string[]): string {
  // Fold Google's many sub-types into a short list of buckets the
  // chatbot can reason over without having to memorize dozens of
  // Google enum values.
  if (types.includes("supermarket") || types.includes("grocery_or_supermarket")) return "grocery";
  if (types.includes("shopping_mall") || types.includes("department_store") || types.includes("home_goods_store")) return "anchor_retail";
  if (types.includes("hospital")) return "hospital";
  if (types.includes("school") || types.includes("university") || types.includes("primary_school") || types.includes("secondary_school")) return "school";
  if (types.includes("gas_station")) return "gas_station";
  if (types.includes("pharmacy") || types.includes("drugstore")) return "pharmacy";
  if (types.includes("bank") || types.includes("atm")) return "bank";
  if (types.includes("restaurant") || types.includes("meal_takeaway") || types.includes("meal_delivery") || types.includes("cafe")) return "restaurant";
  if (types.includes("store")) return "store";
  return "other";
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

async function fetchNearby(lat: number, lng: number, radius = 1600): Promise<NearbyPlace[]> {
  const key = googleKey();
  if (!key) return [];
  const types = ["", "supermarket", "shopping_mall", "restaurant", "school", "hospital", "gas_station", "bank", "pharmacy"];
  const seen = new Map<string, NearbyPlace>();
  await Promise.all(types.map(async (t) => {
    const typeParam = t ? `&type=${t}` : "";
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${typeParam}&key=${key}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const data = await res.json();
      for (const p of (data?.results || []).slice(0, 20)) {
        if (!p.place_id || seen.has(p.place_id)) continue;
        const ploc = p.geometry?.location;
        const dist = ploc ? haversineMeters({ lat, lng }, { lat: ploc.lat, lng: ploc.lng }) : undefined;
        seen.set(p.place_id, {
          name: p.name,
          category: categorize(p.types || []),
          types: (p.types || []).slice(0, 6),
          rating: p.rating,
          vicinity: p.vicinity,
          distanceMeters: dist,
        });
      }
    } catch { /* skip */ }
  }));
  // Sort by distance, then truncate
  return Array.from(seen.values())
    .sort((a, b) => (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999))
    .slice(0, 60);
}

async function fetchCensusForCity(city: string, state: string): Promise<CensusBlock | null> {
  const fips = STATE_FIPS[state.toLowerCase()];
  if (!fips || !city) return null;
  // ACS variables: total pop, median income, median age, median home value,
  // total housing units, labor force, unemployed
  const vars = "B01003_001E,B19013_001E,B01002_001E,B25077_001E,B25001_001E,B23025_002E,B23025_005E,NAME";
  const url = `https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=place:*&in=state:${fips}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data: any[][] = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    const header = data[0];
    const rows = data.slice(1);
    const nameIdx = header.indexOf("NAME");
    // Match the user's city prefix against ACS place names (e.g. "Rolling Meadows city, Illinois")
    const target = city.toLowerCase().trim();
    const match = rows.find((r) => {
      const n = String(r[nameIdx] || "").toLowerCase();
      return n.startsWith(target) || n.includes(`${target} city`) || n.includes(`${target} village`) || n.includes(`${target} town`);
    });
    if (!match) return null;
    const num = (i: number): number | undefined => {
      const v = Number(match[i]);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    return {
      geo: "city",
      population: num(0),
      medianIncome: num(1),
      medianAge: num(2),
      medianHomeValue: num(3),
      housingUnits: num(4),
      laborForce: num(5),
      unemployed: num(6),
    };
  } catch {
    return null;
  }
}

// ── Auth helpers ────────────────────────────────────────────

async function authedUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

async function loadProperty(propertyId: string, uid: string) {
  const db = getAdminDb();
  const snap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!snap.exists) return null;
  const prop = snap.data() as any;
  if (prop.userId && prop.userId !== uid) return "forbidden" as const;
  return prop;
}

// ── Routes ──────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await ctx.params;
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  const uid = await authedUid(_req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prop = await loadProperty(propertyId, uid);
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prop === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminDb();
  const snap = await db.collection("workspace_research").doc(propertyId).get();
  if (!snap.exists) return NextResponse.json({ research: null });
  return NextResponse.json({ research: snap.data() });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await ctx.params;
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  // Two auth modes:
  //   Bearer ID token (user click)        → standard ownership check
  //   x-cron-secret matches CRON_SECRET   → server-to-server (process pipeline calls this)
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  let uid: string | null = null;
  if (!isCron) {
    uid = await authedUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!propSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const prop = propSnap.data() as any;
  if (uid && prop.userId && prop.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Skip if recent enough and not forced
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const existing = await db.collection("workspace_research").doc(propertyId).get();
  if (!force && existing.exists) {
    const at = (existing.data() as any)?.refreshedAt;
    if (at && Date.now() - new Date(at).getTime() < FRESHNESS_TTL_MS) {
      return NextResponse.json({ research: existing.data(), reused: true });
    }
  }

  // Resolve lat/lng. Property may already have it; otherwise geocode.
  let lat: number | null = Number(prop.latitude) || null;
  let lng: number | null = Number(prop.longitude) || null;
  if ((!lat || !lng) && (prop.address1 || prop.city || prop.state)) {
    const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
    const g = await geocode(addr);
    if (g) {
      lat = g.lat;
      lng = g.lng;
      // Persist so other components don't re-geocode
      try {
        await db.collection("workspace_properties").doc(propertyId).set(
          { latitude: g.lat, longitude: g.lng, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch { /* non-blocking */ }
    }
  }

  const [nearby, demographics] = await Promise.all([
    lat != null && lng != null ? fetchNearby(lat, lng, 1600) : Promise.resolve([] as NearbyPlace[]),
    prop.city && prop.state ? fetchCensusForCity(prop.city, prop.state) : Promise.resolve(null),
  ]);

  const research: ResearchDoc = {
    propertyId,
    userId: prop.userId || uid || "",
    refreshedAt: new Date().toISOString(),
    lat,
    lng,
    nearby,
    demographics,
    comps: {
      note: "Comp transactions intentionally deferred — paid data sources (ATTOM, CoreLogic, Reonomy) required for reliable CRE comps.",
      sources: [],
    },
  };

  try {
    await db.collection("workspace_research").doc(propertyId).set(research);
  } catch (writeErr: any) {
    console.warn("[research] Firestore write failed:", writeErr?.message);
  }

  return NextResponse.json({ research, reused: false });
}
