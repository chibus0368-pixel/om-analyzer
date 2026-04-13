// Client-side file text extraction
// Reads Excel (SheetJS), PDF (pdf.js), CSV, and text files in the browser

let XLSX: any = null;
let pdfjsLib: any = null;

async function loadSheetJS(): Promise<any> {
  if (XLSX) return XLSX;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Not in browser");
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => { XLSX = (window as any).XLSX; resolve(XLSX); };
    script.onerror = () => reject("Failed to load SheetJS");
    document.head.appendChild(script);
  });
}

async function loadPdfJS(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Not in browser");
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

async function extractPdfTextInner(file: File): Promise<string> {
  const pdfjs = await loadPdfJS();
  const buffer = await file.arrayBuffer();

  console.log(`[pdf-reader] Loading PDF: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const totalPages = pdf.numPages;
  const maxPages = Math.min(totalPages, 12); // Limit to first 12 pages for speed

  console.log(`[pdf-reader] PDF has ${totalPages} pages, extracting ${maxPages}`);

  let allText = "";
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) {
        allText += `\n--- Page ${i} ---\n${pageText}\n`;
      }
    } catch (pageErr) {
      console.warn(`[pdf-reader] Failed to extract page ${i}:`, pageErr);
    }
  }

  console.log(`[pdf-reader] Extracted ${allText.length} chars from ${file.name}`);
  return allText;
}

// Wrapper with 45-second timeout
async function extractPdfText(file: File): Promise<string> {
  return Promise.race([
    extractPdfTextInner(file),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        console.warn(`[pdf-reader] TIMEOUT after 45s for ${file.name}`);
        resolve("");
      }, 45000);
    }),
  ]);
}

// ── PDF-to-Image OCR fallback for scanned/image-heavy PDFs ──
// Renders PDF pages to canvas, converts to JPEG base64, sends to GPT-4o Vision
async function extractPdfViaVision(file: File): Promise<string> {
  console.log(`[pdf-ocr] Starting vision extraction for: ${file.name}`);
  const pdfjs = await loadPdfJS();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const totalPages = pdf.numPages;
  const maxPages = Math.min(totalPages, 8); // Limit to 8 pages for Vision API cost

  const imageBase64s: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 }); // 1.5x for readable resolution
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const jpeg = canvas.toDataURL("image/jpeg", 0.75);
      const base64 = jpeg.replace(/^data:image\/jpeg;base64,/, "");
      imageBase64s.push(base64);
      canvas.remove();
    } catch (pageErr) {
      console.warn(`[pdf-ocr] Failed to render page ${i}:`, pageErr);
    }
  }

  if (imageBase64s.length === 0) {
    console.warn(`[pdf-ocr] No pages rendered for ${file.name}`);
    return "";
  }

  console.log(`[pdf-ocr] Rendered ${imageBase64s.length} pages, sending to Vision API`);

  // Send to GPT-4o Vision for OCR
  try {
    const messages: any[] = [
      {
        role: "system",
        content: "You are a document OCR specialist. Extract ALL text from these property document page images. Return the raw text content organized by page. Include all numbers, addresses, financial data, tenant names, and details exactly as shown."
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract all text from these ${imageBase64s.length} pages of a commercial real estate document. Return all content including numbers, names, addresses, and financial data.` },
          ...imageBase64s.map((b64, idx) => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" }
          })),
        ],
      },
    ];

    const res = await fetch("/api/workspace/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.text || "";
      console.log(`[pdf-ocr] Vision extracted ${text.length} chars from ${file.name}`);
      return text;
    } else {
      console.warn(`[pdf-ocr] Vision API failed:`, res.status);
      return "";
    }
  } catch (err) {
    console.warn(`[pdf-ocr] Vision request failed:`, err);
    return "";
  }
}

async function extractExcelText(file: File): Promise<string> {
  const xlsx = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const wb = xlsx.read(buffer, { type: "array" });

  let allText = "";
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

    allText += `\n=== Sheet: ${sheetName} ===\n`;
    for (const row of data) {
      const cells = row
        .map((c: any) => (c === null || c === undefined || c === "" ? "" : String(c)))
        .filter((c: string) => c !== "");
      if (cells.length > 0) {
        allText += cells.join(" | ") + "\n";
      }
    }
  }
  return allText;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const name = file.name;

  try {
    // Text-based files
    if (["txt", "csv", "tsv", "json", "md"].includes(ext)) {
      const text = await file.text();
      return `--- ${name} ---\n${text}`;
    }

    // Excel files
    if (["xlsx", "xls", "xlsm"].includes(ext)) {
      const text = await extractExcelText(file);
      return `--- ${name} ---\n${text}`;
    }

    // PDF files - try text extraction first, fall back to Vision OCR for scanned docs
    if (ext === "pdf") {
      console.log(`[file-reader] Starting PDF extraction for: ${name}`);
      const text = await extractPdfText(file);
      if (text.trim().length > 100) {
        console.log(`[file-reader] PDF text extraction success: ${text.length} chars from ${name}`);
        return `--- ${name} ---\n${text}`;
      }
      // Text extraction returned little/nothing - likely a scanned PDF
      console.warn(`[file-reader] PDF text extraction got only ${text.trim().length} chars for: ${name}. Trying Vision OCR...`);
      try {
        const visionText = await extractPdfViaVision(file);
        if (visionText.trim().length > 50) {
          console.log(`[file-reader] Vision OCR success: ${visionText.length} chars from ${name}`);
          return `--- ${name} (OCR extracted) ---\n${visionText}`;
        }
      } catch (ocrErr: any) {
        console.warn(`[file-reader] Vision OCR failed for ${name}:`, ocrErr?.message);
      }
      // Final fallback
      if (text.trim()) {
        return `--- ${name} ---\n${text}`;
      }
      return `--- ${name} (PDF file, ${(file.size / 1024).toFixed(0)}KB - text extraction returned empty. This may be a scanned or image-heavy PDF. Property name may be in filename: ${name}) ---`;
    }

    // DOCX - basic metadata
    if (ext === "docx") {
      return `--- ${name} (Word document, ${(file.size / 1024).toFixed(0)}KB) ---`;
    }

    // Images
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return `--- ${name} (Image, ${(file.size / 1024).toFixed(0)}KB) ---`;
    }
  } catch (err: any) {
    console.warn(`Failed to extract text from ${name}:`, err?.message);
    return `--- ${name} (extraction failed: ${err?.message || "unknown error"}) ---`;
  }

  return `--- ${name} (${ext} file, ${(file.size / 1024).toFixed(0)}KB) ---`;
}

export async function extractTextFromFiles(files: File[]): Promise<string> {
  const texts: string[] = [];
  for (const file of files) {
    const text = await extractTextFromFile(file);
    texts.push(text);
  }
  return texts.join("\n\n");
}
