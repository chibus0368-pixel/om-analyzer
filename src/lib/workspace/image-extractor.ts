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
   MAIN EXPORT: Smart hero image extraction
   Scans up to first 5 pages, scores each, picks best.
   Returns null if no page scores above threshold (40).
   ═══════════════════════════════════════════════════════ */

const PHOTO_THRESHOLD = 35; // minimum score to consider a page as a photo
const MAX_PAGES_TO_SCAN = 5; // don't scan the whole doc - first 5 pages covers most OMs

export async function extractHeroImageFromPDF(file: File): Promise<Blob | null> {
  try {
    const pdfjs = await loadPdfJS();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    if (pdf.numPages < 1) return null;

    const pagesToScan = Math.min(pdf.numPages, MAX_PAGES_TO_SCAN);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    let bestPage: { pageNum: number; score: PageScore; blob: Blob } | null = null;

    for (let i = 1; i <= pagesToScan; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 }); // lower scale for scoring (faster)
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const result = scorePageImage(ctx, viewport.width, viewport.height);
      const pageScore: PageScore = { pageNum: i, ...result };

      console.log(`[image-extractor] Page ${i} score: ${pageScore.score.toFixed(0)} (white: ${(pageScore.whiteRatio * 100).toFixed(0)}%, color: ${(pageScore.colorVariance * 100).toFixed(0)}%, sat: ${(pageScore.saturation * 100).toFixed(0)}%, edges: ${(pageScore.edgeDensity * 100).toFixed(0)}%)`);

      if (pageScore.score >= PHOTO_THRESHOLD && (!bestPage || pageScore.score > bestPage.score.score)) {
        // Re-render at higher quality for the candidate
        const hqViewport = page.getViewport({ scale: 1.5 });
        canvas.width = hqViewport.width;
        canvas.height = hqViewport.height;
        ctx.clearRect(0, 0, hqViewport.width, hqViewport.height);
        await page.render({ canvasContext: ctx, viewport: hqViewport }).promise;

        const blob: Blob | null = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
        });

        if (blob && blob.size > 5000) { // at least 5KB to be meaningful
          bestPage = { pageNum: i, score: pageScore, blob };
        }
      }
    }

    if (bestPage) {
      console.log(`[image-extractor] Selected page ${bestPage.pageNum} as hero image (score: ${bestPage.score.score.toFixed(0)}, ${(bestPage.blob.size / 1024).toFixed(0)}KB)`);
      return bestPage.blob;
    }

    console.log(`[image-extractor] No page scored above threshold (${PHOTO_THRESHOLD}). Skipping PDF image - will use map/street view fallback.`);
    return null;
  } catch (err) {
    console.warn("[image-extractor] Failed to extract hero image:", err);
    return null;
  }
}
