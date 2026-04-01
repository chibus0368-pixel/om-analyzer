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

    // PDF files
    if (ext === "pdf") {
      console.log(`[file-reader] Starting PDF extraction for: ${name}`);
      const text = await extractPdfText(file);
      if (text.trim()) {
        console.log(`[file-reader] PDF extraction success: ${text.length} chars from ${name}`);
        return `--- ${name} ---\n${text}`;
      }
      console.warn(`[file-reader] PDF extraction returned empty for: ${name}`);
      // Fallback: use filename as context so GPT-4o at least knows the property
      return `--- ${name} (PDF file, ${(file.size / 1024).toFixed(0)}KB — text extraction returned empty. This may be a scanned or image-heavy PDF. Property name may be in filename: ${name}) ---`;
    }

    // DOCX — basic metadata
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
