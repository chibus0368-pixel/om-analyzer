# CRE Demographics Tool

Replica of the SiteMap CRE "Analytics > Demographics" panel, powered by real US Census data. Pulls live values from the Census Bureau ACS 5-Year, Census Geocoder, and TIGERweb tract geometries.

## What it does

Given a property address, produces the same demographics experience you saw in the reference tool:

- Metrics table (Population, Median Income, Households, Renters, Median Age, Medicaid, Education, Home Value, Walkability, Daytime Workers) computed for 1-mile, 3-mile, and 5-mile radii.
- Choropleth map of Census tracts colored by any selected metric.
- Dashed radius rings and the property pin.
- Dark-theme UI that matches the reference look and feel.

Sample validation (820 S Main St, West Bend, WI 53095):

| Metric | 1 mi Ref | 1 mi Ours | 3 mi Ref | 3 mi Ours | 5 mi Ref | 5 mi Ours |
|---|---:|---:|---:|---:|---:|---:|
| Population | 12,516 | 13,906 | 32,162 | 30,880 | 42,659 | 44,656 |
| Med. Income | $72,990 | $69,931 | $78,037 | $75,927 | $84,415 | $79,791 |
| Med. Age | 39.7 | 40.2 | 43.1 | 41.8 | 43.9 | 43.5 |
| Renters | 34.1% | 35.0% | 33.3% | 30.7% | 28.8% | 28.3% |
| Walkability | 9.1 | 8.4 | 7.8 | 7.0 | 7.4 | 6.3 |

Remaining deltas come from aggregation method (we count a tract if its centroid is inside the ring; some vendors fractionally clip) and ACS vintage.

## Architecture (modular, portable)

```
Demographics/
├── server/                  # Node/Express backend - proxies Census APIs
│   ├── index.js             # Express bootstrap (can also be mounted as middleware)
│   ├── routes/
│   │   ├── geocode.js       # GET /api/geocode?address=
│   │   ├── tracts.js        # GET /api/tracts?lat=&lng=&radius=
│   │   └── demographics.js  # GET /api/demographics?lat=&lng=&radii=
│   └── lib/                 # Framework-free adapters
│       ├── census.js        # ACS 5-Year profile + C27007 Medicaid table
│       ├── tiger.js         # TIGERweb tract geometries in a bbox
│       ├── aggregate.js     # radius aggregation, pop-weighted medians
│       └── cache.js         # tiny TTL cache (in-memory)
├── public/                  # Vanilla JS + Leaflet frontend
│   ├── index.html
│   ├── app.js               # orchestrator
│   ├── styles.css
│   └── modules/
│       ├── api.js           # backend API client
│       ├── panel.js         # demographics panel (radius, legend, table, chips)
│       ├── map.js           # Leaflet layer (choropleth + rings + pin)
│       ├── colors.js        # yellow-orange-red ramp, robust min/max
│       ├── format.js        # int/money/pct formatters
│       └── metrics-config.js # single source of truth for metrics
└── README.md
```

**Porting into another project**

- *Backend only.* Require `server/lib/census.js` and `server/lib/aggregate.js` directly - they have zero framework dependencies. Wrap them in Fastify, Next API routes, AWS Lambda, etc.
- *Routes into an existing Express app.* `app.use('/demographics', require('./server/routes/demographics'))`.
- *Frontend only.* Drop `public/modules/panel.js` + `public/modules/map.js` into any Vite/Webpack project. They are plain ES modules with no framework ties.

## Running locally

1. Install deps:

    ```
    cd server
    npm install
    ```

2. (Optional but recommended) Grab a free Census API key: https://api.census.gov/data/key_signup.html. Copy `.env.example` to `.env` and paste it in.

3. Start:

    ```
    npm start
    ```

4. Open http://localhost:3000. The default address (820 S Main St, West Bend, WI) loads automatically; use the search box to swap in any other US address.

## Data sources (all public, all free)

- **Census Geocoder** - `geocoding.geo.census.gov` - no key required.
- **Census ACS 5-Year Data Profile** - `api.census.gov/data/2022/acs/acs5/profile` - key optional.
- **Census ACS 5-Year detailed table C27007** - Medicaid/means-tested public coverage.
- **TIGERweb Tracts_Blocks** - `tigerweb.geo.census.gov/arcgis` - tract polygons + centroids.

Update `ACS_YEAR` in `.env` when a newer ACS 5-Year release ships.

## Notes and caveats

- Walkability is an on-the-fly approximation from population density. To show the official EPA National Walkability Index (block-group level, 1-20), add a second adapter that queries `geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0` and average by tract.
- Daytime Workers uses ACS "Employed civilian population 16+" by place of residence. The industry convention of place-of-work daytime population requires LEHD LODES data (free but yearly bulk download), which can be swapped in under the same `daytimeWorkers` key.
- Median aggregation uses population-weighted averages across tracts (industry-standard approximation for CRE tools). Swap in a tract-level median-of-medians if your team prefers.
