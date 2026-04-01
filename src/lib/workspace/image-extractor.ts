// Extract hero image from PDF using pdf.js canvas rendering
// Renders page 1 of a PDF to a canvas, converts to JPEG blob

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

export async function extractHeroImageFromPDF(file: File): Promise<Blob | null> {
  try {
    const pdfjs = await loadPdfJS();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    if (pdf.numPages < 1) return null;

    // Render page 1 to canvas
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // 1.5x for decent quality
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to JPEG blob (smaller than PNG)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        console.log(`[image-extractor] Extracted hero image: ${blob?.size ? (blob.size / 1024).toFixed(0) + 'KB' : 'null'}`);
        resolve(blob);
      }, "image/jpeg", 0.85);
    });
  } catch (err) {
    console.warn("[image-extractor] Failed to extract hero image:", err);
    return null;
  }
}
