// Smart hero image extraction from PDF
// Scans first N pages, picks the best property-photo page, skips tables/text.
// If no good photo page found, returns null so caller can fall back to map/street view.

let pdfjsLib: any = null;

async function loadPdfJS(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Not in browser");
    if ((window as any).pdfjsLib) { pdfjsLib = (window as any).pdfjsLib; return resolve(pdfjsLib); }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    script.onload = () => {
      pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      resolve(pdfjsLib);
    };
    script.onerror = () => reject("Failed to load pdf.js");
    document.head.appendChild(script);
  });
}

/* ═══════════════════════════════════════════════════════
   IMAGE QUALITY SCORING
   Analyzes canvas pixel data to determine if a page
   looks like a property photo vs a table/text page.

   Signals that indicate a PHOTO:
   - High color variance (lots of different colors)
   - Low white-pixel ratio (photos aren't mostly white)
   - High saturation (real photos have color, tables don't)
   - Large continuous color regions

   Signals that indicate a TABLE/TEXT page:
   - Very high white ratio (>70% white pixels)
   - Low color variance (mostly black text on white)
   - Low saturation (grayscale or near-grayscale)
   ═══════════════════════════════════════════════════════ */

interface PageScore {
  pageNum: number;
  score: number;        // 0-100, higher = more likely a property photo
  whiteRatio: number;   // 0-1, ratio of near-white pixels
  colorVariance: number; // 0-1, normalized color diversity
  saturation: number;    // 0-1, average saturation
  edgeDensity: number;  // 0-1, ratio of sharp edges (tables have lots)
}

function scorePageImage(ctx: CanvasRenderingContext2D, width: number, height: number): Omit<PageScore, "pageNum"> {
  // Sample pixels (don't need every pixel - sample on a grid for speed)
  const sampleStep = 4; // every 4th pixel
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let whiteCount = 0;
  let totalSampled = 0;
  let saturationSum = 0;

  // Track unique color buckets (quantize to 16-level per channel = 4096 buckets)
  const colorBuckets = new Set<number>();

  // For edge detection: track horizontal brightness changes
  let edgeCount = 0;
  let edgeChecks = 0;

  for (let y = 0; y < height; y += sampleStep) {
    let prevBrightness = -1;
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      totalSampled++;

      // White detection (R,G,B all > 240)
      if (r > 240 && g > 240 && b > 240) {
        whiteCount++;
      }

      // Quantized color bucket (4 bits per channel)
      const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      colorBuckets.add(bucket);

      // Saturation (simple: max-min of RGB channels, normalized)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      saturationSum += sat;

      // Edge detection: sharp brightness change between adjacent samples
      const brightness = (r + g + b) / 3;
      if (prevBrightness >= 0) {
        edgeChecks++;
        if (Math.abs(brightness - prevBrightness) > 80) {
          edgeCount++;
        }
      }
      prevBrightness = brightness;
    }
  }

  if (totalSampled === 0) return { score: 0, whiteRatio: 1, colorVariance: 0, saturation: 0, edgeDensity: 0 };

  const whiteRatio = whiteCount / totalSampled;
  // Normalize color variance: 4096 max buckets, but typical photo might use 500-2000
  const colorVariance = Math.min(1, colorBuckets.size / 1500);
  const saturation = saturationSum / totalSampled;
  const edgeDensity = edgeChecks > 0 ? edgeCount / edgeChecks : 0;

  // Scoring formula:
  // - Photos: low white ratio, high color variance, moderate-high saturation, moderate edges
  // - Tables: high white ratio (>0.7), low color variance, low saturation, high edge density (grid lines)

  let score = 0;

  // White ratio penalty: more white = more likely a text/table page
  // Sweet spot for photos: 10-50% white (sky, walls, etc.)
  if (whiteRatio < 0.3) score += 30;
  else if (whiteRatio < 0.5) score += 20;
  else if (whiteRatio < 0.65) score += 10;
  else if (whiteRatio > 0.8) score -= 20; // very white = almost certainly text/table

  // Color variance bonus: photos have many colors
  score += colorVariance * 35; // up to 35 points

  // Saturation bonus: real-world photos have color
  score += saturation * 25; // up to 25 points

  // Edge density: tables have high edge density (grid lines), photos have moderate
  // Moderate edges (0.05-0.15) = good for photos (natural edges)
  // High edges (>0.2) = likely table grid lines
  if (edgeDensity > 0.25) score -= 15;
  else if (edgeDensity > 0.15) score -= 5;
  else if (edgeDensity > 0.05) score += 10;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return { score, whiteRatio, colorVariance, saturation, edgeDensity };
}

/* ═══════════════════════════════════════════════════════
   MAIN EXPORT: Hero image extraction (cover-page-first)

   Strategy:
   - The OM cover page is the broker's deliberately-chosen marketing
     hero ~90% of the time. Default to using page 1.
   - Only scan further pages if page 1 is clearly a text/contents
     page (very high white ratio + low color variance) so we don't
     end up with a literal "Table of Contents" as the hero.
   - When we DO scan further, we still prefer the EARLIEST decent
     page (small bias) so brand promotional shots win over deep
     financial-table pages with tinted bars.
   ═══════════════════════════════════════════════════════ */

const TEXT_PAGE_WHITE_THRESHOLD = 0.78;   // > 78% white = likely text page
const TEXT_PAGE_COLOR_VARIANCE_MAX = 0.15; // < 15% color variance reinforces "text"
const MIN_USABLE_BLOB_BYTES = 5000;        // 5KB floor to filter empty renders
const FALLBACK_SCAN_PAGES = 4;             // pages 2..5 if page 1 is text-heavy
const FALLBACK_SCORE_FLOOR = 30;           // anything reasonable beats no hero

async function renderPageBlob(
  page: any,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<Blob | null> {
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
  });
}

export async function extractHeroImageFromPDF(file: File): Promise<Blob | null> {
  try {
    const pdfjs = await loadPdfJS();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    if (pdf.numPages < 1) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // ── Step 1: Score page 1 to decide if it's a usable cover ──
    const page1 = await pdf.getPage(1);
    const scoreViewport = page1.getViewport({ scale: 1.0 });
    canvas.width = scoreViewport.width;
    canvas.height = scoreViewport.height;
    ctx.clearRect(0, 0, scoreViewport.width, scoreViewport.height);
    await page1.render({ canvasContext: ctx, viewport: scoreViewport }).promise;
    const page1Score = scorePageImage(ctx, scoreViewport.width, scoreViewport.height);

    console.log(
      `[image-extractor] Page 1 score: ${page1Score.score.toFixed(0)} ` +
      `(white: ${(page1Score.whiteRatio * 100).toFixed(0)}%, color: ${(page1Score.colorVariance * 100).toFixed(0)}%)`
    );

    const page1IsTextHeavy =
      page1Score.whiteRatio > TEXT_PAGE_WHITE_THRESHOLD &&
      page1Score.colorVariance < TEXT_PAGE_COLOR_VARIANCE_MAX;

    if (!page1IsTextHeavy) {
      // Default path: use page 1. Re-render at higher quality and ship it.
      const blob = await renderPageBlob(page1, ctx, canvas, 1.5);
      if (blob && blob.size > MIN_USABLE_BLOB_BYTES) {
        console.log(`[image-extractor] Using cover page (page 1) - ${(blob.size / 1024).toFixed(0)}KB`);
        return blob;
      }
      // Cover page rendered too small to be meaningful - fall through to scan.
      console.warn(`[image-extractor] Cover render too small (${blob?.size ?? 0} bytes) - scanning later pages`);
    } else {
      console.log(`[image-extractor] Page 1 looks like a contents/text page - scanning pages 2-${1 + FALLBACK_SCAN_PAGES}`);
    }

    // ── Step 2 (rare): cover was a text page. Scan a few more pages
    //    and pick the first one that scores reasonably. Earliest wins
    //    on ties so we prefer broker-curated hero shots over deep
    //    interior financial diagrams. ──
    const lastPageToScan = Math.min(pdf.numPages, 1 + FALLBACK_SCAN_PAGES);
    let bestFallback: { pageNum: number; score: PageScore; blob: Blob } | null = null;
    for (let i = 2; i <= lastPageToScan; i++) {
      const page = await pdf.getPage(i);
      const v = page.getViewport({ scale: 1.0 });
      canvas.width = v.width;
      canvas.height = v.height;
      ctx.clearRect(0, 0, v.width, v.height);
      await page.render({ canvasContext: ctx, viewport: v }).promise;
      const result = scorePageImage(ctx, v.width, v.height);
      const ps: PageScore = { pageNum: i, ...result };
      console.log(`[image-extractor] Page ${i} score: ${ps.score.toFixed(0)}`);
      if (ps.score >= FALLBACK_SCORE_FLOOR) {
        const blob = await renderPageBlob(page, ctx, canvas, 1.5);
        if (blob && blob.size > MIN_USABLE_BLOB_BYTES) {
          // First passing page wins (don't keep hunting for "best score" -
          // earlier pages are almost always the property hero).
          bestFallback = { pageNum: i, score: ps, blob };
          break;
        }
      }
    }

    if (bestFallback) {
      console.log(`[image-extractor] Selected page ${bestFallback.pageNum} as hero (${(bestFallback.blob.size / 1024).toFixed(0)}KB)`);
      return bestFallback.blob;
    }

    console.log(`[image-extractor] No usable page found - falling back to map/street view`);
    return null;
  } catch (err) {
    console.warn("[image-extractor] Failed to extract hero image:", err);
    return null;
  }
}
