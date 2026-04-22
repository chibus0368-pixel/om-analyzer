# Demographics Overlay — Integration Notes

A toggleable Census ACS demographics layer that drops into both Leaflet maps in DealSignals (the Pro `/workspace/map` deal map and the public `/share/[id]` DealBoard map). Off by default. When enabled, it draws a tract-level choropleth + 1/3/5 mile dashed radius rings around the selected property, and floats a metrics panel anchored to the map.

The work is modular: the data adapters live under `src/lib/demographics/` with zero framework dependencies, and the UI lives under `src/components/demographics/`. The same overlay component plugs into either map — no duplication.

---

## What was added

### New files (none of these existed before)

```
src/lib/demographics/
  cache.ts                 # in-memory TTL cache (6hr) for ACS + TIGER calls
  census.ts                # Census ACS 5-Year adapter (Profile + C27007)
  tiger.ts                 # TIGERweb tract polygons inside a bbox
  aggregate.ts             # tract-centroid-in-ring + pop-weighted medians
  colors.ts                # yellow→orange→red ramp + robust 5/95 percentile range
  format.ts                # int/money/pct formatters
  metrics.ts               # single source of truth for metric definitions

src/components/demographics/
  DemographicsOverlay.tsx  # main component (data + Leaflet layers + panel UI)
  DemographicsToggle.tsx   # the on/off pill switch (DealSignals styling)

src/app/api/demographics/
  route.ts                 # GET /api/demographics?lat=&lng=&radii=1,3,5
```

### Files touched

```
src/app/workspace/map/page.tsx     # toggle in legend, overlay inside .mp-map-wrapper
src/app/share/[id]/page.tsx        # toggle in top-right control cluster, overlay over map
```

The diffs are intentionally small. Both pages only got:

1. Two imports (`DemographicsToggle`, `DemographicsOverlay`).
2. Three new state values (`demographicsOn`, `demographicsPropId`, `geocodedCoords`).
3. A `useMemo` that resolves the focal property (the one the overlay is centered on).
4. A `setGeocodedCoords` call inside the existing marker creation loop so the overlay can reuse coords without re-geocoding.
5. The `<DemographicsToggle ... />` rendered next to other map chrome.
6. The `<DemographicsOverlay ... />` rendered inside the map wrapper (the wrapper already had `position: relative`).

No existing logic changed. The toggle is `disabled` until at least one property is geocoded.

---

## What it does on the map

When the toggle is on AND a focal property exists:

- Calls `GET /api/demographics?lat=&lng=&radii=1,3,5` once per focal property.
- Server fetches:
  - Tract polygons that intersect a bbox around the property (TIGERweb).
  - ACS 5-Year Profile metrics for every tract in the involved counties (cached 6h).
  - Detailed table C27007 for Medicaid coverage (separate ACS call, also cached 6h).
- Server aggregates per ring using centroid-in-ring inclusion (sums for counts, population-weighted averages for medians/percentages).
- Client draws:
  - GeoJSON tract polygons colored by the active "Color By" metric.
  - Dashed rings at 1mi / 3mi / 5mi with cream pill labels.
  - A metrics panel at top-left of the map with a 1/3/5 radius selector, the full metrics table, an active "Color By" dot indicator on each row, and a legend strip showing the color ramp range.

The user picks the focal property by clicking a marker. Re-clicking a different marker pivots the overlay. On the share map, opening a property's detail view also pivots the overlay (per the spec — the recipient-facing experience always shows demographics for the deal they're inspecting).

---

## How the modularity works

The `src/lib/demographics/` modules have no Next.js, no React, no Firebase. They are plain TS that runs in any Node 18+ environment. The Express version that lives at `Demographics/server/lib/*.js` is a 1:1 mirror in CommonJS — they share variable names, function signatures, and the same Census query strings. To port elsewhere later:

- **Backend only:** import `census.ts`, `tiger.ts`, `aggregate.ts` directly. Wrap them in any HTTP handler.
- **API route only:** copy `src/app/api/demographics/route.ts` into another Next.js project alongside the lib folder.
- **UI only:** drop `DemographicsOverlay.tsx` + `DemographicsToggle.tsx` into any React project that already has a Leaflet map. The overlay accepts `{ map, L, lat, lng, enabled }` props — no internal Leaflet imports, no router coupling.

---

## Wiring contract (for both maps)

The overlay needs four things from the parent page:

| Prop | Source |
|------|--------|
| `map` | The Leaflet map instance (`mapInstanceRef.current`) |
| `L`   | The Leaflet module (`leafletRef.current`) |
| `lat`, `lng` | Coords of the focal property |
| `enabled` | Boolean toggle |

Both DealSignals maps already keep `mapInstanceRef` and `leafletRef`, so wiring took only the two prop bindings. The component renders `null` when `enabled` is false, so it has zero cost off.

---

## Environment variables

All optional. The endpoint works without any keys (Census APIs are free and unauthenticated for this volume), but adding a key removes rate limits.

```
# .env.local
CENSUS_API_KEY=your_key       # optional — get one free at api.census.gov/data/key_signup.html
ACS_YEAR=2022                 # optional — defaults to 2022 (latest stable ACS 5-Year vintage)
NEXT_PUBLIC_ACS_YEAR=2022     # optional — only used to display source year in the panel footer
```

The `next.config.*` doesn't need any changes — Next 15 picks up route handlers and lib imports automatically.

---

## Visual / UX details

The toggle pill mirrors the existing `.back-pill` pattern in `src/app/share/[id]/page.tsx`: navy `#0F172A` background when on, cream `#FAF8F4` with a navy switch knob when off. The active state shows a gold `#D4B255` track to flag that an extra data layer is live.

The metrics panel uses the same DealSignals tokens you'll find elsewhere in the app:

- Header: navy `#0F172A` with white text and a gold mini-icon chip.
- Body: white card with `#E5E1D6` cream-stone border, 12px radius, `0 12px 32px rgba(15,23,43,0.12)` drop shadow.
- Table: alternating rows `#FFFFFF` / `#FBFAF6`, active "Color By" row highlighted with `#FAF6E8` and a gold dot.
- Color ramp legend: yellow→orange→red gradient sealed inside a thin pill, with min/max labels formatted by metric type ($ for income/home value, % for renter/education/medicaid, raw count otherwise).
- Tract tooltips: sticky on hover, show all metrics for that tract.

The panel collapses to just its navy header (with a chevron) so the user can keep the choropleth visible while reclaiming map real estate.

---

## How to merge

Everything is additive. There are zero migrations, zero schema changes, zero new package.json deps. Leaflet is already installed; nothing else is required. Suggested merge sequence:

1. Add `src/lib/demographics/` (7 files).
2. Add `src/components/demographics/` (2 files).
3. Add `src/app/api/demographics/route.ts`.
4. Apply the small diffs in `src/app/workspace/map/page.tsx` and `src/app/share/[id]/page.tsx` (described above).
5. Optional: add a `CENSUS_API_KEY` to `.env.local`.

Then either map, when enabled with a geocoded property, will render demographics.

---

## Manual smoke checks

1. Open `/workspace/map` in a workspace with at least one geocoded property.
2. Click the **Demographics** pill in the legend area. The map flies to the property at zoom ~13, draws colored tracts, three dashed rings, and shows the panel in the top-left.
3. Click a different metric row in the panel ("Med. Income" → "Renters" etc.). The choropleth recolors instantly.
4. Click the 1mi / 3mi / 5mi pill. The metric values in the table update for that radius (the choropleth and rings stay the same).
5. Click a different property marker. The whole overlay re-fetches and re-centers on the new property.
6. Toggle the pill off. All overlay layers disappear and the panel unmounts.
7. Repeat steps 2-6 on the public share map (`/share/[id]` for any active share link). The toggle lives in the top-right control cluster above the zoom buttons.

---

## Validation reference

The standalone backend in `Demographics/server/` was validated against the SiteMap CRE reference for *820 S Main St, West Bend, WI 53095*. Numbers landed within ~10% of the reference for all 10 metrics. See `Demographics/README.md` for the full table. The TS port in `src/lib/demographics/` uses identical Census variables and aggregation math, so the same validation holds.

---

## Known follow-ups (optional polish, not blockers)

- **EPA Walkability Index.** Currently a population-density proxy on the EPA 1-20 scale. To show the official EPA values, add a second adapter that hits `geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0` and average per tract. Drop-in under `src/lib/demographics/epa.ts` — the panel already keys off `walkability` so no UI change.
- **LEHD daytime workers.** ACS reports place-of-residence employed pop, not place-of-work. Industry convention for daytime workers is LEHD LODES (free yearly bulk download). Same swap pattern: same `daytimeWorkers` key.
- **Tract aggregation method.** Centroid-in-ring is the standard CRE-tool approximation. If the team prefers fractional clipping by area, swap `aggregate.ts` — the API contract stays the same.
- **Mobile.** The panel is fixed at 320px wide. On screens narrower than ~420px the map gets squeezed. A `@media (max-width: 480px)` rule that collapses the panel to its header by default would help.
