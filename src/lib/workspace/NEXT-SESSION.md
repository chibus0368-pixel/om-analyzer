# Next Session: Property Page Redesign + Address Enrichment

## What's Working Now
- PDF upload → pdf.js text extraction → GPT-4o parsing → 50+ fields extracted
- Property page shows: brief, key metrics table, signals, download buttons
- Scoreboard: side-by-side comparison with formatted $/%/x values
- XLSX download: 6-sheet workbook (Inputs, Rent Roll, Op Statement, Debt, Breakeven, Cap Scenarios)
- DOC download: HTML-based Word doc with brief, metrics, signals
- CDN: pdf.js and SheetJS both on jsdelivr (cloudflare was broken)
- Firestore: propertyId-scoped queries, no cross-contamination

## Priority Features for Next Session

### 1. Address Enrichment (when address is confirmed)
- On property page, show confirmed address with "Confirm Address" button
- Once confirmed, auto-fetch:
  - Google Street View image of the property
  - Link to Google Earth/Maps
  - LoopNet listing search link
  - Google Maps embed or static map
- Use Google Maps Static API or embed for the map
- LoopNet: link to `https://www.loopnet.com/search/?sk={address}`
- Store enrichment data in Firestore on the property record

### 2. Property Page Redesign
- Move "Add File" to the TOP of the page (above the brief)
- Add property hero section with:
  - Property image (from Google Street View or uploaded)
  - Address with map link
  - Key stats bar (Price, Cap Rate, GLA, Occupancy) in a horizontal strip
- Better visual hierarchy and styling
- Brief section with proper paragraph formatting
- Key Metrics in a two-column table layout
- Signals as colored badges/pills
- Tenant summary section (top 3-5 tenants with SF and rent)
- Download assets section with larger, more prominent buttons

### 3. File Upload Improvements
- Move "Add File" button to top of property page
- Add description: "Upload additional documents like rent rolls, T-12 operating
  statements, lease abstracts, or market reports to improve the analysis.
  More detailed data produces more accurate underwriting."
- Show file categories with icons
- Re-parse option after adding new files

## Technical Notes
- Google Street View Static API: `https://maps.googleapis.com/maps/api/streetview?size=600x300&location={address}&key={API_KEY}`
- Need NEXT_PUBLIC_GOOGLE_MAPS_API_KEY env var
- LoopNet search: `https://www.loopnet.com/search/commercial-real-estate/{city}-{state}/for-sale/`
- Google Earth link: `https://earth.google.com/web/search/{encoded_address}`
- Consider: Zillow, Redfin, or county assessor links based on address

## Files to Modify
- `src/app/workspace/properties/[id]/page.tsx` — main property page redesign
- `src/lib/workspace/types.ts` — add enrichment fields to Property type
- `src/lib/workspace/firestore.ts` — add enrichment update function
- May need new API route for Google Maps API calls (server-side to protect API key)
