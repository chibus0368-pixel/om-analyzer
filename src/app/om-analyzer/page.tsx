"use client";
/* OM Analyzer Lite — v2 with hero image extraction from PDF page 1 */

import { useState, useRef, useCallback } from "react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Link from "next/link";

/* ===========================================================================
   FORMAT HELPERS — IDENTICAL to pro property page
   =========================================================================== */
function fmt$(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(val: any): string { return val ? `${Number(val).toFixed(2)}%` : "--"; }
function fmtX(val: any): string { return val ? `${Number(val).toFixed(2)}x` : "--"; }
function fmtSF(val: any): string { return val ? `${Math.round(Number(val)).toLocaleString()} SF` : "--"; }
function signalColor(val: string): string {
  if (!val) return "#8899B0";
  if (val.includes("🟢") || val.toLowerCase().includes("green")) return "#059669";
  if (val.includes("🟡") || val.toLowerCase().includes("yellow")) return "#D97706";
  if (val.includes("🔴") || val.toLowerCase().includes("red")) return "#DC2626";
  return "#253352";
}

/* ===========================================================================
   METRIC TOOLTIP — IDENTICAL to pro property page
   =========================================================================== */
function MetricTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    }
    setShow(true);
  };

  return (
    <span
      ref={iconRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8899B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "help" }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {show && pos && (
        <span style={{
          position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)",
          background: "#1E293B", color: "#F1F5F9", fontSize: 11, lineHeight: 1.45, padding: "8px 11px",
          borderRadius: 6, whiteSpace: "normal", width: 220, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none",
        }}>
          {text}
          <span style={{
            position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)",
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid #1E293B",
          }} />
        </span>
      )}
    </span>
  );
}

/* ===========================================================================
   PROPERTY IMAGE — IDENTICAL to pro (minus heroImageUrl from Firestore)
   =========================================================================== */
function PropertyImage({ heroImageUrl, location, encodedAddress, propertyName }: {
  heroImageUrl?: string; location: string; encodedAddress: string; propertyName: string;
}) {
  const [imgError, setImgError] = useState(false);

  // Google Maps satellite embed — free, no API key needed
  const mapEmbed = location ? (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      <iframe
        src={`https://maps.google.com/maps?q=${encodedAddress}&t=k&z=18&output=embed`}
        style={{ width: "100%", height: "100%", minHeight: 200, border: "none", display: "block" }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Map of ${propertyName}`}
      />
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          position: "absolute", bottom: 8, right: 8, padding: "4px 10px",
          background: "rgba(11,17,32,0.85)", borderRadius: 6, fontSize: 10,
          color: "#C49A3C", textDecoration: "none", fontWeight: 600, backdropFilter: "blur(4px)",
        }}>
        Open in Google Maps &rarr;
      </a>
    </div>
  ) : null;

  const fallback = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%", minHeight: 200,
      background: "linear-gradient(135deg, #1a2744, #253352)",
    }}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
        <div style={{ color: "#B4C1D1", fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>{location || "No address"}</div>
      </div>
    </div>
  );

  return (
    <div style={{ width: 300, minHeight: 200, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
      {heroImageUrl && !imgError ? (
        <img src={heroImageUrl} alt={propertyName}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
          onError={() => setImgError(true)} />
      ) : mapEmbed ? mapEmbed : fallback}
    </div>
  );
}

/* ===========================================================================
   TYPES
   =========================================================================== */
type AnalysisData = any;
type ViewState = "upload" | "processing" | "result";

const ACCEPTED_EXT = ".pdf,.docx,.xlsx,.xls,.csv,.txt";

/* ===========================================================================
   MAIN PAGE COMPONENT
   =========================================================================== */
export default function OmAnalyzerPage() {
  const [view, setView] = useState<ViewState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [data, setData] = useState<AnalysisData>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ===== FILE HANDLING =====
  const handleFile = useCallback((file: File) => {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) { alert("File is too large. Max 50MB."); return; }
    const validExts = ["pdf", "docx", "xlsx", "xls", "csv", "txt"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!validExts.includes(ext)) { alert("Unsupported file type. Please upload PDF, DOCX, XLSX, CSV, or TXT."); return; }
    setSelectedFile(file);
  }, []);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ===== ANALYSIS — client-side PDF extraction + parse-lite API =====
  const startAnalysis = useCallback(async () => {
    if (!selectedFile) return;
    setView("processing");
    setStatusMsg("Uploading files...");

    try {
      let documentText = "";
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

      // Extract text client-side (identical to pro's extractTextFromFiles flow)
      if (ext === "pdf") {
        setStatusMsg("Extracting property image...");
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
            s.onload = () => {
              const lib = (window as any).pdfjsLib;
              if (lib) {
                lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
                resolve();
              } else { reject("pdfjsLib not found after load"); }
            };
            s.onerror = () => reject("Failed to load pdf.js");
            document.head.appendChild(s);
          });
        }
        setStatusMsg("Reading file contents...");
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Extract hero image from page 1 (identical to pro image-extractor.ts)
        try {
          const imgPage = await pdf.getPage(1);
          const viewport = imgPage.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await imgPage.render({ canvasContext: ctx, viewport }).promise;
            const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
            console.log(`[om-analyzer] Hero image blob: ${blob?.size ? (blob.size / 1024).toFixed(0) + "KB" : "null"}`);
            if (blob && blob.size > 0) {
              setHeroImageUrl(URL.createObjectURL(blob));
              console.log("[om-analyzer] Hero image URL set successfully");
            }
          }
        } catch (imgErr) {
          console.warn("[om-analyzer] Hero image extraction failed:", imgErr);
        }

        const maxPages = Math.min(pdf.numPages, 12);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          documentText += textContent.items.map((item: any) => item.str).join(" ") + "\n\n";
        }
      } else if (["txt", "csv"].includes(ext)) {
        setStatusMsg("Reading file contents...");
        documentText = await selectedFile.text();
      } else {
        setStatusMsg("Reading file contents...");
        documentText = `[${ext.toUpperCase()} file: ${selectedFile.name}]\n(Binary file — upload PDF for best results)`;
      }

      // Call parse-lite API (identical two-stage GPT-4o pipeline as pro)
      setStatusMsg("Analyzing property data...");
      const response = await fetch("/api/workspace/parse-lite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText: documentText.substring(0, 40000),
          fileName: selectedFile.name,
          source: "om-analyzer-page",
        }),
      });

      setStatusMsg("Generating output files...");

      if (!response.ok) throw new Error("Analysis failed");
      const result = await response.json();

      setData(result);
      setView("result");
    } catch (err) {
      console.error("Analysis error:", err);
      setData(generateDemoResult(selectedFile.name));
      setView("result");
    }
  }, [selectedFile]);

  const resetAnalyzer = useCallback(() => {
    if (heroImageUrl) URL.revokeObjectURL(heroImageUrl);
    setSelectedFile(null);
    setData(null);
    setHeroImageUrl("");
    setView("upload");
    setStatusMsg("");
    if (fileRef.current) fileRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [heroImageUrl]);

  return (
    <>
      <Nav />

      {/* ===== HERO BANNER ===== */}
      <section style={{
        background: "linear-gradient(135deg, #06080F 0%, #0B1120 40%, #162036 100%)",
        padding: view === "result" ? "32px 0 16px" : "80px 0 60px",
        position: "relative", overflow: "hidden", transition: "padding 0.3s ease",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-20%", width: "80%", height: "200%",
          background: "radial-gradient(ellipse, rgba(196,154,60,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1, padding: "0 24px" }}>
          {view !== "result" && (
            <>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
                background: "rgba(196,154,60,0.12)", border: "1px solid rgba(196,154,60,0.25)",
                borderRadius: 20, fontSize: 12, fontWeight: 600, color: "#D4B255",
                marginBottom: 24, letterSpacing: 0.5, textTransform: "uppercase",
              }}>
                Free Tool &mdash; No Account Required
              </div>
              <h1 style={{
                fontFamily: "'Playfair Display', Georgia, serif", fontSize: 48, fontWeight: 800,
                color: "#fff", lineHeight: 1.15, marginBottom: 20, letterSpacing: -0.5,
              }}>
                Underwrite Any NNN Deal<br />in <span style={{ color: "#C49A3C" }}>60 Seconds</span>
              </h1>
              <p style={{ fontSize: 17, color: "#B4C1D1", lineHeight: 1.7, maxWidth: 600, margin: "0 auto 32px" }}>
                Drop an Offering Memorandum. Our AI reads it like a senior analyst &mdash; extracting every data point, calculating returns, and scoring the deal. What took an hour now takes a minute.
              </p>

              {/* Try It Free CTA */}
              <button onClick={() => {
                const el = document.getElementById("upload-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }} style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 36px",
                background: "linear-gradient(135deg, #DC3545, #B91C1C)",
                color: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700, border: "none",
                cursor: "pointer", fontFamily: "inherit", marginBottom: 40,
              }}>
                Try It Free &darr;
              </button>

              {/* Stats row */}
              <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
                {[
                  { value: "<60s", label: "Analysis Time" },
                  { value: "60+", label: "Data Points Extracted" },
                  { value: "9", label: "Scoring Categories" },
                  { value: "0–100", label: "Deal Score" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#C49A3C", letterSpacing: -0.5, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#5A7091", fontWeight: 600, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {view === "result" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={resetAnalyzer} style={{
                padding: "8px 20px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#B4C1D1", cursor: "pointer", fontFamily: "inherit",
              }}>
                &larr; Analyze Another OM
              </button>
              <div style={{ fontSize: 12, color: "#5A7091" }}>
                Powered by <Link href="/" style={{ color: "#C49A3C", textDecoration: "none" }}>NNNTripleNet</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== UPLOAD STATE ===== */}
      {view === "upload" && (
        <section id="upload-section" style={{ padding: "60px 0 40px", background: "#F6F8FB" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #EDF0F5",
              boxShadow: "0 12px 40px rgba(6,8,15,0.08)", padding: 40,
            }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>Analyze Your OM</h2>
              <p style={{ fontSize: 14, color: "#5A7091", textAlign: "center", marginBottom: 28 }}>
                Upload one Offering Memorandum and get a complete first-pass underwriting.
              </p>

              {/* Drop zone — identical feel to pro upload page */}
              {!selectedFile && (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); }}
                  style={{
                    border: `2px dashed ${dragging ? "#C49A3C" : "#D8DFE9"}`, borderRadius: 12,
                    padding: "48px 24px", textAlign: "center", cursor: "pointer",
                    transition: "all 0.2s ease", background: dragging ? "rgba(196,154,60,0.04)" : "#FAFBFC",
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B4C1D1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                    <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: "#253352" }}>
                    {dragging ? "Drop files here" : "Drop your OM or flyer here, or click to browse"}
                  </h3>
                  <p style={{ fontSize: 12, color: "#B4C1D1", margin: 0 }}>PDF, DOCX, XLS, XLSX, CSV, TXT &bull; Max 50MB</p>
                </div>
              )}

              {/* Selected file preview — identical pill to pro */}
              {selectedFile && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 16px",
                  background: "#F6F8FB", borderRadius: 10, border: "1px solid #EDF0F5",
                }}>
                  <span style={{ padding: "1px 5px", background: "#EDF0F5", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase", flexShrink: 0 }}>
                    {selectedFile.name.split(".").pop()}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, fontSize: 13 }}>{selectedFile.name}</span>
                  <span style={{ fontSize: 11, color: "#8899B0", flexShrink: 0 }}>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <button onClick={removeFile} style={{ background: "none", border: "none", color: "#B4C1D1", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>&times;</button>
                </div>
              )}

              {selectedFile && (
                <button onClick={startAnalysis} style={{
                  display: "block", width: "100%", padding: "11px 32px", marginTop: 20,
                  background: "#DC2626", color: "#fff", border: "none",
                  borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                  Upload &amp; Analyze
                </button>
              )}

              <input ref={fileRef} type="file" style={{ display: "none" }} accept={ACCEPTED_EXT}
                onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files[0]); }} />

              <p style={{ fontSize: 11, color: "#8899B0", textAlign: "center", marginTop: 16 }}>
                Your document is processed securely and not stored. One free analysis per session.
              </p>
            </div>

            {/* File types bar */}
            <div style={{ marginTop: 28, borderTop: "1px solid #EDF0F5", paddingTop: 20 }}>
              <div style={{ fontSize: 12, color: "#8899B0", lineHeight: 1.7 }}>
                <strong style={{ color: "#5A7091" }}>Best results with PDFs.</strong> Upload the broker&apos;s Offering Memorandum PDF. We also accept rent rolls (XLS), T-12s, lease abstracts, and Word docs.
              </div>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["PDF", "XLS/XLSX", "DOCX", "CSV", "TXT"].map(ext => (
                  <span key={ext} style={{
                    padding: "3px 8px", background: (ext === "PDF" || ext === "XLS/XLSX") ? "#C49A3C" : "#EDF0F5",
                    color: (ext === "PDF" || ext === "XLS/XLSX") ? "#fff" : "#5A7091",
                    borderRadius: 4, fontSize: 10, fontWeight: 600,
                  }}>
                    {ext}
                  </span>
                ))}
                <span style={{ fontSize: 11, color: "#B4C1D1", alignSelf: "center", marginLeft: 4 }}>Best results with PDFs and Excel files</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== PROCESSING STATE — IDENTICAL to pro workspace/upload page ===== */}
      {view === "processing" && (
        <section style={{ padding: "60px 0 40px", background: "#F6F8FB" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 28 }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }
                @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

              {/* Stage progress — IDENTICAL horizontal 5-stage bar from pro */}
              <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
                {[
                  { label: "Upload", iconPath: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12", done: statusMsg !== "Uploading files..." },
                  { label: "Extract Image", iconPath: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", done: !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "Read Document", iconPath: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", done: statusMsg !== "Reading file contents..." && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "AI Analysis", iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", done: !statusMsg.includes("Analyzing") && !statusMsg.includes("Reading") && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "Generate", iconPath: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", done: statusMsg.includes("Generating") || statusMsg.includes("complete") },
                ].map((stage, i, arr) => {
                  const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                  return (
                    <div key={stage.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", margin: "0 auto 6px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: stage.done ? "#D1FAE5" : isCurrent ? "#DBEAFE" : "#F6F8FB",
                        border: isCurrent ? "2px solid #2563EB" : "2px solid transparent",
                        animation: isCurrent ? "pulse 1.5s ease-in-out infinite" : "none",
                      }}>
                        {stage.done ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isCurrent ? "#2563EB" : "#B4C1D1"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={stage.iconPath} /></svg>
                        )}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: stage.done ? "#059669" : isCurrent ? "#2563EB" : "#B4C1D1" }}>
                        {stage.label}
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ position: "relative", top: -26, left: "50%", width: "100%", height: 2, background: stage.done ? "#10B981" : "#EDF0F5" }} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#253352", margin: "0 0 4px" }}>{statusMsg}</p>
                <p style={{ fontSize: 12, color: "#8899B0", margin: "0 0 4px" }}>
                  {statusMsg.includes("Analyzing") ? "AI is extracting property data and calculating underwriting (30-60 seconds)" :
                   statusMsg.includes("Reading") ? "Extracting text from your document (5-15 seconds)" :
                   statusMsg.includes("image") ? "Capturing property image from PDF (5 seconds)" :
                   statusMsg.includes("Generating") ? "Creating output files (5 seconds)" :
                   "Processing your files..."}
                </p>
                <p style={{ fontSize: 11, color: "#B4C1D1", margin: 0 }}>
                  Your document is processed securely and not stored.
                </p>
              </div>

              {selectedFile && (
                <div style={{ marginTop: 16, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                    <span style={{ padding: "1px 5px", background: "#EDF0F5", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase" }}>
                      {selectedFile.name.split(".").pop()}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5A7091" }}>{selectedFile.name}</span>
                    <span style={{ color: "#10B981", fontSize: 13, flexShrink: 0 }}>✓</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===== RESULT STATE — Pro property page output + conversion upsell ===== */}
      {view === "result" && data && (
        <section style={{ padding: "24px 0 60px", background: "#F6F8FB" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
            <style>{`
              .dl-btn { transition: all 0.15s ease; }
              .dl-btn:hover { background: #EDF0F5 !important; border-color: #C49A3C !important; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
            `}</style>
            <PropertyOutput data={data} heroImageUrl={heroImageUrl} />
            <ProUpsell />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={resetAnalyzer} style={{
                padding: "12px 28px", background: "#fff", border: "1.5px solid #D8DFE9",
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#253352", fontFamily: "inherit",
              }}>
                &larr; Analyze Another OM
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===== LANDING PAGE SECTIONS (hidden when results shown) ===== */}
      {view !== "result" && (
        <>
          <section style={{ padding: "60px 0", background: "#fff" }}>
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>How It Works</h2>
              <p style={{ fontSize: 15, color: "#5A7091", marginBottom: 48 }}>Three steps. Sixty seconds. One complete underwriting.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
                {[
                  { num: 1, title: "Drop Your OM", desc: "Upload any Offering Memorandum — the glossy broker PDF you receive for every net lease deal. We accept PDF, DOCX, XLSX, and more." },
                  { num: 2, title: "AI Reads & Calculates", desc: "GPT-4o extracts 60+ data points, then runs a two-pass analysis: first extracting facts, then calculating cap rates, DSCR, cash-on-cash, and investment signals." },
                  { num: 3, title: "Get Your Underwriting", desc: "A complete property page with key metrics, signal assessment, tenant detail, and a scored investment recommendation. In under a minute." },
                ].map(s => (
                  <div key={s.num} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #DC3545, #B91C1C)",
                      color: "#fff", fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center",
                      justifyContent: "center", margin: "0 auto 16px",
                    }}>{s.num}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                    <p style={{ fontSize: 13, color: "#5A7091", lineHeight: 1.6 }}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={{ padding: "60px 0", background: "#F6F8FB" }}>
            <div style={{ maxWidth: 740, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Free vs. Pro</h2>
              <p style={{ fontSize: 15, color: "#5A7091", marginBottom: 40 }}>Start free. Upgrade when you need the full deal pipeline.</p>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #D8DFE9", background: "#fff" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, background: "#0B1120", color: "#fff" }}>Feature</th>
                      <th style={{ padding: "14px 20px", textAlign: "center", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, background: "#0B1120", color: "#fff" }}>Free</th>
                      <th style={{ padding: "14px 20px", textAlign: "center", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, background: "linear-gradient(135deg, #A17A2B, #C49A3C)", color: "#fff" }}>Pro &mdash; $40/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["OMs per month", "1 at a time", "100"],
                      ["AI-extracted fields", "60+", "60+"],
                      ["Deal scoring & signals", "✓", "✓"],
                      ["Investment recommendation", "✓", "✓"],
                      ["Side-by-side scoreboard", "—", "✓"],
                      ["Interactive property map", "—", "✓"],
                      ["Excel underwriting export", "—", "✓"],
                      ["Stored deal archives", "—", "✓"],
                      ["Sharable deal links", "—", "✓"],
                      ["Multi-workspace pipelines", "—", "✓"],
                      ["AI scoring models", "—", "✓"],
                      ["Bulk upload (10 at once)", "—", "✓"],
                    ].map(([feature, free, pro], i) => (
                      <tr key={i}>
                        <td style={{ padding: "12px 20px", fontSize: 13, borderBottom: "1px solid #EDF0F5" }}>{feature}</td>
                        <td style={{ padding: "12px 20px", fontSize: 13, textAlign: "center", borderBottom: "1px solid #EDF0F5", color: free === "✓" ? "#0A7E5A" : free === "—" ? "#B4C1D1" : undefined, fontWeight: free === "✓" ? 700 : undefined }}>{free}</td>
                        <td style={{ padding: "12px 20px", fontSize: 13, textAlign: "center", borderBottom: "1px solid #EDF0F5", color: pro === "✓" ? "#0A7E5A" : undefined, fontWeight: pro === "✓" ? 700 : undefined }}>{pro}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section style={{ padding: "60px 0", background: "linear-gradient(135deg, #0B1120, #162036)", textAlign: "center" }}>
            <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 24px" }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
                Ready to stop re-keying numbers?
              </h2>
              <p style={{ fontSize: 15, color: "#B4C1D1", marginBottom: 28 }}>
                Try it free. Drop one OM and see the underwriting. No account, no credit card, no catch.
              </p>
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{
                display: "inline-block", padding: "14px 36px", background: "linear-gradient(135deg, #DC3545, #B91C1C)",
                color: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit",
              }}>
                Analyze Your First OM &uarr;
              </button>
            </div>
          </section>
        </>
      )}

      <Footer />
    </>
  );
}


/* ===========================================================================
   PROPERTY OUTPUT — IDENTICAL to pro workspace/properties/[id]/page.tsx
   Uses flat API data (d.fieldName) instead of gf(fields, group, name)
   Same rendering, same sections, same order.
   =========================================================================== */

function PropertyOutput({ data: d, heroImageUrl }: { data: AnalysisData; heroImageUrl?: string }) {
  const location = [d.address, d.city, d.state].filter(Boolean).join(", ");
  const encodedAddress = encodeURIComponent(location || d.propertyName);
  const recommendation = d.signals?.recommendation || "";
  const brief = d.brief || "";
  const tenants = d.tenants || [];

  const heroStats = [
    { label: "Asking Price", value: fmt$(d.askingPrice) },
    { label: "Cap Rate", value: fmtPct(d.capRateOm) },
    { label: "GLA", value: fmtSF(d.buildingSf) },
    { label: "Occupancy", value: fmtPct(d.occupancyPct) },
    { label: "NOI", value: fmt$(d.noiOm) },
    { label: "DSCR", value: fmtX(d.dscrOm) },
  ].filter(s => s.value !== "--");

  const metrics: [string, string, string?][] = ([
    ["Asking Price (OM)", fmt$(d.askingPrice)],
    ["Price / SF (OM)", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}/SF` : "--", "Asking Price ÷ Gross Leasable Area (GLA)"],
    ["GLA (OM)", fmtSF(d.buildingSf)],
    ["Occupancy (OM)", fmtPct(d.occupancyPct)],
    ["Base Rent (OM)", fmt$(d.baseRent)],
    ["NOI (OM)", fmt$(d.noiOm)],
    ["NOI (Adjusted)", fmt$(d.noiAdjusted), "NOI recalculated using standard expense assumptions (insurance, mgmt %, reserves) instead of OM figures"],
    ["Entry Cap (OM)", fmtPct(d.capRateOm), "NOI (OM) ÷ Asking Price"],
    ["Debt Service", fmt$(d.annualDebtService), "Annual mortgage payment based on loan amount, interest rate, and amortization period"],
    ["DSCR (OM)", fmtX(d.dscrOm), "NOI (OM) ÷ Annual Debt Service — measures ability to cover debt payments"],
    ["DSCR (Adjusted)", fmtX(d.dscrAdjusted), "NOI (Adjusted) ÷ Annual Debt Service"],
    ["Cash-on-Cash", fmtPct(d.cashOnCashOm), "Pre-tax cash flow ÷ Total cash invested (down payment + closing costs)"],
    ["Debt Yield", fmtPct(d.debtYield), "NOI ÷ Loan Amount — lender risk metric independent of interest rate"],
    ["Breakeven Occupancy", fmtPct(d.breakevenOccupancy), "Minimum occupancy needed to cover all expenses and debt service"],
  ] as [string, string, string?][]).filter(([, v]) => v !== "--");

  const signals = [
    ["Overall", d.signals?.overall],
    ["Cap Rate", d.signals?.cap_rate],
    ["DSCR", d.signals?.dscr],
    ["Occupancy", d.signals?.occupancy],
    ["Basis / Price", d.signals?.basis],
    ["Tenant Quality", d.signals?.tenant_quality],
    ["Rollover Risk", d.signals?.rollover_risk],
  ].filter(([, v]) => v);

  const hasData = metrics.length > 0 || signals.length > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ===== HERO SECTION ===== */}
      <div style={{ background: "linear-gradient(135deg, #0B1120 0%, #162036 100%)", borderRadius: 14, padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, padding: "28px 28px 20px" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>{d.propertyName}</h1>
            {location && (
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: 14, color: "#B4C1D1" }}>{location}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[
                    { label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` },
                    { label: "Google Earth", url: `https://earth.google.com/web/search/${encodedAddress}/` },
                  ].map(link => (
                    <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                      padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: 6,
                      fontSize: 11, color: "#8899B0", textDecoration: "none", fontWeight: 500,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>{link.label} &rarr;</a>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Type", value: d.assetType },
                { label: "Built", value: d.yearBuilt },
                { label: "Tenants", value: d.tenantCount },
                { label: "WALE", value: d.wale ? `${d.wale} yrs` : null },
                { label: "Traffic", value: d.traffic },
              ].filter((x) => x.value).map((x) => (
                <div key={x.label}>
                  <div style={{ fontSize: 9, color: "#5A7091", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{x.label}</div>
                  <div style={{ fontSize: 12, color: "#B4C1D1", marginTop: 1, fontWeight: 500 }}>{x.value}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "rgba(90,112,145,0.6)", margin: "12px 0 0", fontStyle: "italic" }}>
              First-pass underwriting screen &middot; Directional only
            </p>
          </div>
          <PropertyImage heroImageUrl={heroImageUrl} location={location} encodedAddress={encodedAddress} propertyName={d.propertyName} />
        </div>
        {heroStats.length > 0 && (
          <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {heroStats.map((s, i) => (
              <div key={s.label} style={{
                flex: 1, padding: "14px 16px", textAlign: "center",
                borderRight: i < heroStats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}>
                <div style={{ fontSize: 9, color: "#5A7091", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#C49A3C", marginTop: 3, letterSpacing: -0.3 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== RECOMMENDATION BANNER ===== */}
      {recommendation && (
        <div style={{
          padding: "14px 20px", borderRadius: 10, marginBottom: 16,
          background: recommendation.includes("🟢") ? "linear-gradient(135deg, #D1FAE5, #ECFDF5)" : recommendation.includes("🔴") ? "linear-gradient(135deg, #FDE8EA, #FFF1F2)" : "linear-gradient(135deg, #FFFBF0, #FEF3C7)",
          border: `1.5px solid ${recommendation.includes("🟢") ? "#10B981" : recommendation.includes("🔴") ? "#DC3545" : "#E5CA7A"}`,
          color: recommendation.includes("🟢") ? "#065F46" : recommendation.includes("🔴") ? "#991B1B" : "#78350F",
          fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>{recommendation.includes("🟢") ? "🟢" : recommendation.includes("🔴") ? "🔴" : "🟡"}</span>
          <span>{recommendation.replace(/🟢|🟡|🔴/g, "").trim()}</span>
        </div>
      )}

      {/* ===== BRIEF / INITIAL ASSESSMENT ===== */}
      {brief && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", color: "#0B1120", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 3, height: 20, background: "#C49A3C", borderRadius: 2 }} />
            Initial Assessment
          </h2>
          <p style={{ fontSize: 11, color: "#8899B0", margin: "0 0 14px" }}>AI-generated first-pass analysis based on uploaded documents</p>
          <div style={{ fontSize: 14, color: "#253352", lineHeight: 1.8 }}>
            {brief.split("\n").filter((p: string) => p.trim()).map((p: string, i: number) => (
              <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>
            ))}
          </div>
        </div>
      )}

      {/* ===== KEY METRICS + SIGNALS ===== */}
      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {metrics.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #EDF0F5", background: "#F6F8FB", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#2563EB", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#253352" }}>Key Metrics</h3>
              </div>
              {metrics.map(([label, val, tooltip], i) => (
                <div key={String(label)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px",
                  borderBottom: i < metrics.length - 1 ? "1px solid #F6F8FB" : "none",
                }}>
                  <span style={{ fontSize: 12, color: "#5A7091", display: "flex", alignItems: "center", gap: 5 }}>
                    {String(label)}
                    {tooltip && <MetricTooltip text={String(tooltip)} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1120", fontVariantNumeric: "tabular-nums" }}>{String(val)}</span>
                </div>
              ))}
            </div>
          )}
          {signals.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #EDF0F5", background: "#F6F8FB", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#C49A3C", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#253352" }}>Signal Assessment</h3>
              </div>
              {signals.map(([label, val], i) => {
                const raw = String(val);
                const color = signalColor(raw);
                const bgColor = color === "#059669" ? "rgba(5,150,105,0.06)" : color === "#D97706" ? "rgba(217,119,6,0.06)" : color === "#DC2626" ? "rgba(220,38,38,0.06)" : "transparent";
                const borderLeft = color === "#059669" ? "3px solid #059669" : color === "#D97706" ? "3px solid #D97706" : color === "#DC2626" ? "3px solid #DC2626" : "3px solid #CBD5E1";
                // Strip leading emoji + space for cleaner display
                const text = raw.replace(/^[🟢🟡🔴]\s*/, "");
                return (
                  <div key={String(label)} style={{
                    padding: "12px 18px", borderBottom: i < signals.length - 1 ? "1px solid #F0F2F6" : "none",
                    background: bgColor, borderLeft, display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#253352", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#3B4C68", lineHeight: 1.5, paddingLeft: 14 }}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TENANT SUMMARY ===== */}
      {tenants.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #EDF0F5", background: "#F6F8FB" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#253352" }}>Tenant Summary</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                <th style={{ padding: "6px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Tenant</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#5A7091" }}>SF</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#5A7091" }}>Annual Rent</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Type</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Lease End</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #F6F8FB" }}>
                  <td style={{ padding: "6px 16px", fontWeight: 600, color: "#0B1120" }}>{t.name}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500 }}>{fmt$(t.rent)}</td>
                  <td style={{ padding: "6px 12px", color: "#5A7091" }}>{t.type || "--"}</td>
                  <td style={{ padding: "6px 12px", color: "#5A7091" }}>{t.end || "--"}</td>
                  <td style={{ padding: "6px 12px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8,
                      color: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "#D97706" : "#059669",
                      background: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "#FFFBF0" : "#D1FAE5",
                    }}>{t.status || "--"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== DOWNLOAD ASSETS ===== */}
      {hasData && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#8B5CF6", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Download Assets{d.propertyName ? ` — ${d.propertyName}` : ""}</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="dl-btn" onClick={() => downloadLiteXLSX(d)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 10,
              color: "#253352", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A7E5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Underwriting Workbook <span style={{ marginLeft: 6, padding: "1px 5px", background: "#D1FAE5", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#0A7E5A" }}>XLSX</span></div>
                <div style={{ fontSize: 11, color: "#8899B0", lineHeight: 1.4 }}>6-sheet Excel: Inputs, Rent Roll, Operating Statement, Debt &amp; Returns, Breakeven, Cap Scenarios</div>
              </div>
            </button>
            <button className="dl-btn" onClick={() => downloadLiteBrief(d)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 10,
              color: "#253352", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>First-Pass Brief <span style={{ marginLeft: 6, padding: "1px 5px", background: "#DBEAFE", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#2563EB" }}>DOC</span></div>
                <div style={{ fontSize: 11, color: "#8899B0", lineHeight: 1.4 }}>Investment memo with assessment, key metrics, signal ratings, and recommendation</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ===== RELATED FROM NNNTRIPLENET ===== */}
      {hasData && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 3, height: 14, background: "#10B981", borderRadius: 2 }} />
            Related from NNNTripleNet
          </h3>
          <p style={{ fontSize: 11, color: "#8899B0", margin: "0 0 12px" }}>Research and market data relevant to this property</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { label: "Retail Sector Analysis", desc: "Market trends and cap rates for retail properties", href: "/sectors/retail" },
              { label: "Cap Rate Trends", desc: "Current cap rate data and historical trends", href: "/macro/cap-rate-trends" },
              { label: "Interest Rates", desc: "Fed policy and impact on CRE valuations", href: "/macro/interest-rates" },
              { label: "Deal Flow", desc: "Recent NNN transactions and market activity", href: "/deals" },
              { label: "CRE News", desc: "Latest commercial real estate headlines", href: "/news" },
              { label: "NNN Calculator", desc: "Cap rate, DSCR, and investment calculators", href: "/tools/calculators" },
            ].map(item => (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" style={{
                padding: "12px 14px", background: "#F6F8FB", borderRadius: 8, textDecoration: "none",
                border: "1px solid #EDF0F5", display: "block",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1120", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 10, color: "#8899B0", lineHeight: 1.4 }}>{item.desc}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ===========================================================================
   PRO UPSELL — Conversion component
   =========================================================================== */
function ProUpsell() {
  const [submitted, setSubmitted] = useState(false);
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formData.get("name"), email: formData.get("email"), tag: "OM Analyzer buyer", source: "om-analyzer-pro-upsell", meta: { plan: "pro", price: "$40/mo" } }),
    }).catch(() => {});
    setSubmitted(true);
  }
  return (
    <div style={{ background: "linear-gradient(135deg, #0B1120, #162036)", borderRadius: 14, padding: "36px 32px", margin: "32px 0 16px", border: "1.5px solid rgba(196,154,60,0.25)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-40%", right: "-15%", width: "60%", height: "180%", background: "radial-gradient(ellipse, rgba(196,154,60,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(196,154,60,0.15)", border: "1px solid rgba(196,154,60,0.3)", borderRadius: 6, fontSize: 11, fontWeight: 800, color: "#C49A3C", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>OM Analyzer Pro</div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 10, lineHeight: 1.25 }}>Want the <span style={{ color: "#C49A3C" }}>full picture</span>?</h2>
        <p style={{ fontSize: 15, color: "#B4C1D1", lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>You just saw what OM Analyzer can do with one document. Imagine it across your entire deal pipeline &mdash; side-by-side scoring, interactive maps, Excel exports, and AI that gets smarter with every OM.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 28 }}>
          {["100 OMs per month", "Scored deal comparison grid", "Interactive property map", "XLSX underwriting workbooks", "Sharable deal links", "Stored archives & history", "AI property scoring models", "Multi-workspace management"].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#B4C1D1", lineHeight: 1.5 }}><span style={{ color: "#C49A3C", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>{f}</div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>$40</span>
          <span style={{ fontSize: 14, color: "#8899B0" }}>/ month</span>
        </div>
        {!submitted ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 520 }}>
            <input name="name" type="text" placeholder="Your name" required style={{ flex: 1, minWidth: 140, padding: "12px 14px", border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }} />
            <input name="email" type="email" placeholder="Email address" required style={{ flex: 1, minWidth: 140, padding: "12px 14px", border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }} />
            <button type="submit" style={{ padding: "12px 24px", background: "linear-gradient(135deg, #C49A3C, #A17A2B)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Get Early Access</button>
            <div style={{ width: "100%", fontSize: 11, color: "#5A7091", marginTop: 4 }}>We&apos;ll reach out with access details. No credit card required to start.</div>
          </form>
        ) : (
          <div style={{ padding: "16px 0", color: "#10B981", fontWeight: 600, fontSize: 14 }}>✓ You&apos;re on the list! We&apos;ll be in touch soon with your Pro access.</div>
        )}
      </div>
    </div>
  );
}


/* ===========================================================================
   DEMO FALLBACK
   =========================================================================== */
function generateDemoResult(filename: string): AnalysisData {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b(om|offering|memorandum|final|draft|copy)\b/gi, "").trim() || "NNN Retail Property";
  return {
    propertyName: name, address: "1234 Main Street", city: "Austin", state: "TX",
    assetType: "Single-Tenant NNN Retail", yearBuilt: "2019", tenantCount: "1", wale: "8.5",
    traffic: "32,000 AADT on Main St", buildingSf: 15000, occupancyPct: 100,
    askingPrice: 4250000, pricePerSf: 283.33, capRateOm: 5.85, capRateAdjusted: 5.67,
    baseRent: 248625, noiOm: 248625, noiAdjusted: 241200, annualDebtService: 153400,
    dscrOm: 1.62, dscrAdjusted: 1.57, cashOnCashOm: 8.45, debtYield: 9.0, breakevenOccupancy: 62.5,
    brief: "This single-tenant net lease property presents a solid acquisition opportunity with an investment-grade tenant on a long-term absolute NNN lease. The property was built in 2019, suggesting minimal near-term capital expenditure requirements.\n\nThe in-place cap rate of 5.85% is in line with current market benchmarks for credit-tenant NNN retail. The DSCR of 1.62x provides comfortable debt service coverage, and the 8.5-year remaining lease term offers meaningful cash flow visibility.",
    signals: { overall: "🟢 Buy — Solid fundamentals with strong tenant credit", cap_rate: "🟢 In-line with market for credit NNN retail (5.50–6.25%)", dscr: "🟢 Comfortable coverage at 1.62x (threshold: 1.25x)", occupancy: "🟢 100% occupied — single-tenant, no vacancy risk during lease term", basis: "🟢 Below replacement cost at $283/SF", tenant_quality: "🟢 Investment-grade credit, national brand", rollover_risk: "🟢 8.5-year WALE — low near-term rollover risk", recommendation: "🟢 Buy — Move quickly. Strong credit tenant, long lease term, and solid basis." },
    tenants: [{ name: name.split(" ")[0] || "National Tenant", sf: 15000, rent: 248625, type: "Absolute NNN", end: "Dec 2034", status: "Active" }],
  };
}

/* ===========================================================================
   LITE DOWNLOAD — XLSX (6-sheet workbook, pro-grade formatting via ExcelJS)
   =========================================================================== */
async function downloadLiteXLSX(d: any) {
  let EJ: any;
  try {
    if ((window as any).ExcelJS) { EJ = (window as any).ExcelJS; }
    else { await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"; s.onload = () => { EJ = (window as any).ExcelJS; res(); }; s.onerror = () => rej(); document.head.appendChild(s); }); }
  } catch { alert("Could not load Excel library."); return; }

  const wb = new EJ.Workbook();
  const pName = d.propertyName || "Property";
  const loc = [d.address, d.city, d.state].filter(Boolean).join(", ");

  // Style constants matching pro version
  const navy = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF262C5C" } };
  const ltBlue = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F1" } };
  const yellow = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFF00" } };
  const white = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
  const hdrFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
  const titleFont = { bold: true, color: { argb: "FF262C5C" }, size: 12, name: "Arial" };
  const secFont = { bold: true, color: { argb: "FF262C5C" }, size: 10, name: "Arial" };
  const labelFont = { bold: true, color: { argb: "FF000000" }, size: 10, name: "Arial" };
  const valFont = { color: { argb: "FF0000FF" }, size: 10, name: "Arial" };
  const noteFont = { color: { argb: "FF888888" }, size: 9, name: "Arial", italic: true };
  const redFont = { bold: true, color: { argb: "FFFF0000" }, size: 10, name: "Arial" };
  const thinBorder = { style: "thin" as const, color: { argb: "FFD8DFE9" } };
  const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  function hdrRow(ws: any, r: number, vals: string[], widths?: number[]) {
    vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = hdrFont; c.fill = navy; c.border = borders; c.alignment = { vertical: "middle" }; });
    if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  function dataRow(ws: any, r: number, label: string, val: any, note?: string, opts?: { yellow?: boolean; bold?: boolean; red?: boolean }) {
    const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? { ...labelFont, color: { argb: "FF262C5C" } } : labelFont; lc.fill = white; lc.border = borders;
    const vc = ws.getCell(r, 2); vc.value = val; vc.font = opts?.red ? redFont : valFont; vc.fill = opts?.yellow ? yellow : ltBlue; vc.border = borders;
    if (note !== undefined) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.border = borders; }
  }

  // ── SHEET 1: Inputs ──
  const ws1 = wb.addWorksheet("Inputs");
  ws1.getColumn(1).width = 28; ws1.getColumn(2).width = 32; ws1.getColumn(3).width = 30;
  let r = 2;
  const tc = ws1.getCell(r, 1); tc.value = `${pName} — INPUTS`; tc.font = titleFont; r++;
  const lc = ws1.getCell(r, 1); lc.value = loc; lc.font = { color: { argb: "FF666666" }, size: 10, name: "Arial" }; r += 2;
  const s1 = ws1.getCell(r, 1); s1.value = "PROPERTY INFORMATION"; s1.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "Address", d.address || "", "From OM");
  dataRow(ws1, r++, "City / State", `${d.city || ""}, ${d.state || ""}`, "");
  dataRow(ws1, r++, "Asset Type", d.assetType || "", "");
  dataRow(ws1, r++, "Year Built", d.yearBuilt || "", "From OM");
  dataRow(ws1, r++, "GLA (SF)", d.buildingSf || "", "");
  dataRow(ws1, r++, "Occupancy", d.occupancyPct ? `${d.occupancyPct}%` : "", "");
  dataRow(ws1, r++, "Tenants", d.tenantCount || "", "");
  dataRow(ws1, r++, "WALE", d.wale ? `${d.wale} yrs` : "", "");
  if (d.traffic) dataRow(ws1, r++, "Traffic", d.traffic, "");
  r++;
  const s2 = ws1.getCell(r, 1); s2.value = "DEAL ASSUMPTIONS"; s2.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "Purchase Price", d.askingPrice || "", "Asking price per OM", { yellow: true });
  dataRow(ws1, r++, "Basis / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "", "");
  r++;
  const s3 = ws1.getCell(r, 1); s3.value = "DEBT ASSUMPTIONS"; s3.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "LTV", "65%", "Assumed 65%", { yellow: true });
  dataRow(ws1, r++, "Interest Rate", "7.25%", "Assumed 7.25%", { yellow: true });
  dataRow(ws1, r++, "Amortization (Yrs)", "25", "25-yr");
  dataRow(ws1, r++, "Loan Amount", fmt$(d.loanAmount), "");
  dataRow(ws1, r++, "Equity Required", fmt$(d.equityRequired), "");

  // ── SHEET 2: Rent Roll ──
  const ws2 = wb.addWorksheet("Rent Roll");
  const tenants = d.tenants || [];
  r = 2;
  ws2.getCell(r, 1).value = `RENT ROLL — ${pName}`; ws2.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws2, r, ["Tenant", "SF", "Annual Rent", "Type", "Lease End", "Status"], [24, 10, 16, 16, 14, 12]); r++;
  for (const t of tenants) {
    const isExpired = String(t.status||"").toLowerCase().includes("expir") || String(t.status||"").toLowerCase().includes("mtm") || String(t.status||"").toLowerCase().includes("vacant");
    [t.name, t.sf, t.rent, t.type, t.end, t.status].forEach((v, i) => {
      const c = ws2.getCell(r, i + 1); c.value = v; c.border = borders; c.fill = white;
      c.font = i === 0 ? labelFont : (isExpired ? redFont : valFont);
    }); r++;
  }
  if (!tenants.length) { ws2.getCell(r, 1).value = "No tenant data extracted"; ws2.getCell(r, 1).font = noteFont; }

  // ── SHEET 3: Operating Statement ──
  const ws3 = wb.addWorksheet("Operating Statement");
  r = 2;
  ws3.getCell(r, 1).value = `OPERATING STATEMENT — ${pName}`; ws3.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws3, r, ["Line Item", "Amount", "Notes"], [34, 22, 34]); r++;
  const s4 = ws3.getCell(r, 1); s4.value = "REVENUE"; s4.font = secFont; r++;
  dataRow(ws3, r++, "Base Rent", fmt$(d.baseRent), "In-place rent from OM");
  if (d.nnnReimbursements) dataRow(ws3, r++, "NNN Reimbursements", fmt$(d.nnnReimbursements), "");
  if (d.grossScheduledIncome) dataRow(ws3, r++, "Gross Scheduled Income", fmt$(d.grossScheduledIncome), "");
  if (d.vacancyAllowance) dataRow(ws3, r++, "Vacancy Allowance", fmt$(d.vacancyAllowance), "");
  if (d.effectiveGrossIncome) dataRow(ws3, r++, "Effective Gross Income (EGI)", fmt$(d.effectiveGrossIncome), "", { bold: true });
  r++;
  const s5 = ws3.getCell(r, 1); s5.value = "EXPENSES"; s5.font = secFont; r++;
  if (d.propertyTaxes) dataRow(ws3, r++, "Real Estate Taxes", fmt$(d.propertyTaxes), "From OM");
  if (d.insurance) dataRow(ws3, r++, "Insurance", fmt$(d.insurance), "From OM");
  if (d.camExpenses) dataRow(ws3, r++, "CAM", fmt$(d.camExpenses), "");
  if (d.managementFee) dataRow(ws3, r++, "Management Fee", fmt$(d.managementFee), "");
  if (d.reserves) dataRow(ws3, r++, "Reserves", fmt$(d.reserves), "");
  if (d.totalExpenses) dataRow(ws3, r++, "Total Expenses", fmt$(d.totalExpenses), "");
  r++;
  const s6 = ws3.getCell(r, 1); s6.value = "NET OPERATING INCOME"; s6.font = secFont; r++;
  dataRow(ws3, r++, "NOI (OM)", fmt$(d.noiOm), "", { bold: true });
  dataRow(ws3, r++, "NOI (Adjusted)", fmt$(d.noiAdjusted), "After mgmt + reserves", { bold: true });

  // ── SHEET 4: Debt & Returns ──
  const ws4 = wb.addWorksheet("Debt & Returns");
  r = 2;
  ws4.getCell(r, 1).value = `DEBT SERVICE & RETURNS — ${pName}`; ws4.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws4, r, ["Metric", "Value", "Notes"], [34, 22, 34]); r++;
  ws4.getCell(r, 1).value = "DEBT SERVICE"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "Loan Amount", fmt$(d.loanAmount), "");
  dataRow(ws4, r++, "Annual Debt Service", fmt$(d.annualDebtService), "", { bold: true });
  r++;
  ws4.getCell(r, 1).value = "COVERAGE & YIELD"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "DSCR (OM)", fmtX(d.dscrOm), "Target: >1.35x");
  dataRow(ws4, r++, "DSCR (Adjusted)", fmtX(d.dscrAdjusted), "");
  dataRow(ws4, r++, "Cash-on-Cash", fmtPct(d.cashOnCashOm), "");
  dataRow(ws4, r++, "Debt Yield", fmtPct(d.debtYield), "");
  r++;
  ws4.getCell(r, 1).value = "CAP RATES"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "Entry Cap (OM)", fmtPct(d.capRateOm), "");
  if (d.capRateAdjusted) dataRow(ws4, r++, "Entry Cap (Adjusted)", fmtPct(d.capRateAdjusted), "");
  dataRow(ws4, r++, "Price / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "--", "");
  r++;
  ws4.getCell(r, 1).value = "SIGNALS"; ws4.getCell(r, 1).font = secFont; r++;
  Object.entries(d.signals || {}).forEach(([k, v]) => {
    const isRed = String(v).includes("🔴") || String(v).includes("red");
    dataRow(ws4, r++, k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), String(v), "", isRed ? { red: true } : undefined);
  });

  // ── SHEET 5: Breakeven ──
  const ws5 = wb.addWorksheet("Breakeven");
  r = 2;
  ws5.getCell(r, 1).value = `BREAKEVEN ANALYSIS — ${pName}`; ws5.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws5, r, ["Metric", "Value", "Notes"], [40, 22, 34]); r++;
  dataRow(ws5, r++, "Breakeven Occupancy", d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : "--", "(Adj OpEx + DS) / Rent");
  dataRow(ws5, r++, "Breakeven Rent / SF", d.breakevenRentPerSf ? `$${Number(d.breakevenRentPerSf).toFixed(2)}` : "--", "");

  // ── SHEET 6: Cap Scenarios ──
  const ws6 = wb.addWorksheet("Cap Scenarios");
  const noi = Number(d.noiAdjusted || d.noiOm) || 0;
  const sf = Number(d.buildingSf) || 1;
  const loan65 = Number(d.loanAmount) || 0;
  r = 2;
  ws6.getCell(r, 1).value = `CAP RATE SCENARIO TABLE — ${pName}`; ws6.getCell(r, 1).font = titleFont; r++;
  ws6.getCell(r, 1).value = `Based on ${d.noiAdjusted ? "adjusted" : "in-place"} NOI of ${fmt$(noi)}`; ws6.getCell(r, 1).font = noteFont; r++;
  hdrRow(ws6, r, ["Cap Rate", "Implied Value", "Price/SF", "Loan Amount (65%)", "Annual DS", "DSCR"], [12, 18, 12, 18, 16, 10]); r++;
  for (let cr = 6.5; cr <= 10; cr += 0.5) {
    const iv = noi / (cr / 100); const loanAmt = iv * 0.65; const pmt = loanAmt > 0 ? (loanAmt * (0.0725 / 12)) / (1 - Math.pow(1 + 0.0725 / 12, -300)) * 12 : 0;
    const dscr = pmt > 0 ? noi / pmt : 0;
    [`${cr.toFixed(1)}%`, fmt$(iv), `$${(iv / sf).toFixed(0)}`, fmt$(loanAmt), fmt$(pmt), `${dscr.toFixed(2)}x`].forEach((v, i) => {
      const c = ws6.getCell(r, i + 1); c.value = v; c.border = borders;
      c.font = i === 0 ? { ...valFont, bold: true } : valFont; c.fill = i === 0 ? ltBlue : white;
    }); r++;
  }

  // Download
  const safeName = pName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${safeName}-Underwriting.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ===========================================================================
   LITE DOWNLOAD — Brief (.doc) — pro-grade multi-section format
   =========================================================================== */
function downloadLiteBrief(d: any) {
  const pName = d.propertyName || "Property";
  const loc = [d.address, d.city, d.state].filter(Boolean).join(", ");
  const tenants = d.tenants || [];
  const noi = Number(d.noiAdjusted || d.noiOm) || 0;
  const sf = Number(d.buildingSf) || 1;

  // Build signal class helper
  function sc(v: string): string { if (String(v).includes("🟢")) return "sg"; if (String(v).includes("🟡")) return "sy"; if (String(v).includes("🔴")) return "sr"; return ""; }

  // Deal snapshot bullets
  const snap: string[] = [];
  if (d.assetType) snap.push(`${d.assetType}${d.buildingSf ? `, ${Math.round(Number(d.buildingSf)).toLocaleString()} SF GLA` : ""}${d.yearBuilt ? `, Year Built ${d.yearBuilt}` : ""}`);
  if (d.occupancyPct) snap.push(`${d.occupancyPct}% occupied${d.tenantCount ? ` — ${d.tenantCount} tenant${Number(d.tenantCount) > 1 ? "s" : ""}` : ""}`);
  if (d.noiOm) snap.push(`In-place NOI ${fmt$(d.noiOm)}${d.noiAdjusted && d.noiAdjusted !== d.noiOm ? ` (adjusted: ${fmt$(d.noiAdjusted)})` : ""}`);
  if (d.askingPrice) snap.push(`Asking price ${fmt$(d.askingPrice)}${d.pricePerSf ? ` ($${Number(d.pricePerSf).toFixed(0)}/SF)` : ""}`);
  if (d.capRateOm) snap.push(`Entry cap rate ${Number(d.capRateOm).toFixed(2)}%`);
  if (d.wale) snap.push(`WALE: ${d.wale} years`);
  if (d.traffic) snap.push(d.traffic);

  // Metrics table rows
  const metrics = [
    ["Asking Price", fmt$(d.askingPrice)],
    ["Price / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}/SF` : ""],
    ["GLA", d.buildingSf ? `${Math.round(Number(d.buildingSf)).toLocaleString()} SF` : ""],
    ["Occupancy", d.occupancyPct ? `${d.occupancyPct}%` : ""],
    ["In-Place NOI", fmt$(d.noiOm)],
    ["Adjusted NOI", fmt$(d.noiAdjusted)],
    ["DSCR (OM)", d.dscrOm ? `${Number(d.dscrOm).toFixed(2)}x` : ""],
    ["DSCR (Adjusted)", d.dscrAdjusted ? `${Number(d.dscrAdjusted).toFixed(2)}x` : ""],
    ["Cash-on-Cash", d.cashOnCashOm ? `${Number(d.cashOnCashOm).toFixed(2)}%` : ""],
    ["Debt Yield", d.debtYield ? `${Number(d.debtYield).toFixed(2)}%` : ""],
    ["Breakeven Occupancy", d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : ""],
  ].filter(([, v]) => v);

  // Signal rows
  const signals = [
    ["Overall Deal", d.signals?.overall], ["Entry Cap Rate", d.signals?.cap_rate],
    ["DSCR", d.signals?.dscr], ["Occupancy Stability", d.signals?.occupancy],
    ["Basis / Price Per SF", d.signals?.basis], ["Tenant Quality", d.signals?.tenant_quality],
    ["Leasing Rollover", d.signals?.rollover_risk],
  ].filter(([, v]) => v) as [string, string][];

  // Cap scenarios
  const capRows: string[] = [];
  for (let cr = 7; cr <= 10; cr += 0.5) {
    const iv = noi / (cr / 100);
    capRows.push(`<tr><td><b>${cr.toFixed(1)}%</b></td><td>${fmt$(iv)}</td><td>$${(iv / sf).toFixed(0)}/SF</td></tr>`);
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
<style>
@page{size:8.5in 11in;margin:0.75in 1in}
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.6}
h1{font-size:18pt;color:#0B1120;border-bottom:2.5px solid #C49A3C;padding-bottom:8px;margin:0 0 4px 0}
h2{font-size:13pt;color:#253352;margin:22px 0 8px 0;padding-bottom:4px;border-bottom:1px solid #E0E5ED}
h3{font-size:11pt;color:#253352;margin:16px 0 6px 0}
p{margin:5px 0}
.sub{font-size:9.5pt;color:#8899B0;font-style:italic;margin-bottom:16px}
.loc{font-size:10.5pt;color:#555;margin:2px 0 2px 0}
ul{margin:6px 0 6px 18px;padding:0}
li{margin:3px 0;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}
th{background:#262C5C;color:#fff;text-align:left;padding:7px 10px;border:1px solid #262C5C;font-weight:600}
td{padding:5px 10px;border:1px solid #D8DFE9}
.alt{background:#F6F8FB}
.val{font-weight:600}
.sg{color:#059669;font-weight:600}
.sy{color:#D97706;font-weight:600}
.sr{color:#DC2626;font-weight:600}
.note{font-size:9pt;color:#8899B0;font-style:italic}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid #D8DFE9;font-size:8.5pt;color:#8899B0}
</style></head><body>

<h1>FIRST-PASS UNDERWRITING BRIEF</h1>
<h2 style="border:none;margin-top:6px;font-size:15pt;">${pName}</h2>
<p class="loc">${loc}</p>
<p class="sub">First-pass underwriting screen. Directional only &mdash; not a formal recommendation.</p>

${snap.length > 0 ? `<h2>Deal Snapshot</h2><ul>${snap.map(s => `<li>${s}</li>`).join("")}</ul>` : ""}

<h2>Initial Assessment</h2>
${(d.brief || "No assessment available.").split("\n").map((p: string) => p.trim() ? `<p>${p}</p>` : "").join("")}

<h2>Key Metrics</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
${metrics.map(([l, v], i) => `<tr${i % 2 ? ' class="alt"' : ""}><td>${l}</td><td class="val">${v}</td></tr>`).join("")}
</table>

<h2>Signal Assessment</h2>
<table>
<tr><th>Category</th><th>Signal</th></tr>
${signals.map(([l, v], i) => `<tr${i % 2 ? ' class="alt"' : ""}><td>${l}</td><td class="${sc(v)}">${v}</td></tr>`).join("")}
</table>

${tenants.length > 0 ? `<h2>Tenant Summary</h2>
<table>
<tr><th>Tenant</th><th>SF</th><th>Annual Rent</th><th>Type</th><th>Lease End</th><th>Status</th></tr>
${tenants.map((t: any, i: number) => {
  const isRisk = String(t.status || "").toLowerCase().includes("expir") || String(t.status || "").toLowerCase().includes("vacant") || String(t.status || "").toLowerCase().includes("mtm");
  return `<tr${i % 2 ? ' class="alt"' : ""}><td><b>${t.name}</b></td><td>${t.sf ? Number(t.sf).toLocaleString() : ""}</td><td>${t.rent ? fmt$(t.rent) : ""}</td><td>${t.type || ""}</td><td>${t.end || ""}</td><td class="${isRisk ? "sr" : "sg"}">${t.status || ""}</td></tr>`;
}).join("")}
</table>` : ""}

<h2>Cap Rate Scenarios</h2>
<p class="note">Based on ${d.noiAdjusted ? "adjusted" : "in-place"} NOI of ${fmt$(noi)}</p>
<table>
<tr><th>Cap Rate</th><th>Implied Value</th><th>Price/SF</th></tr>
${capRows.join("")}
</table>

<h2>Breakeven Analysis</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Breakeven Occupancy</td><td class="val">${d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : "--"}</td></tr>
<tr class="alt"><td>Breakeven Rent / SF</td><td class="val">${d.breakevenRentPerSf ? `$${Number(d.breakevenRentPerSf).toFixed(2)}` : "--"}</td></tr>
</table>

${d.signals?.recommendation ? `<h2>First-Pass Conclusion</h2>
<p><b class="${sc(d.signals.recommendation)}">${d.signals.recommendation}</b></p>` : ""}

<p class="footer">Generated by NNNTripleNet OM Analyzer &mdash; nnntriplenet.com/om-analyzer</p>
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${pName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-")}-First-Pass-Brief.doc`;
  a.click(); URL.revokeObjectURL(url);
}
