"use client";
/* OM Analyzer Lite — v3 with smart hero image extraction (skips tables) */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { extractHeroImageFromPDF } from "@/lib/workspace/image-extractor";
import DealSignalLogo from "@/components/DealSignalLogo";
import DealSignalNav from "@/components/DealSignalNav";

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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "help" }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {show && pos && (
        <span style={{
          position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)",
          background: "#1e1e28", color: "#ffffff", fontSize: 11, lineHeight: 1.45, padding: "8px 11px",
          borderRadius: 6, whiteSpace: "normal", width: 220, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", pointerEvents: "none",
          border: "1px solid rgba(255,255,255,0.1)",
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
          background: "rgba(255,255,255,0.92)", borderRadius: 6, fontSize: 10,
          color: "#DC2626", textDecoration: "none", fontWeight: 600, backdropFilter: "blur(4px)",
        }}>
        Open in Google Maps &rarr;
      </a>
    </div>
  ) : null;

  const fallback = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%", minHeight: 200,
      background: "#16161f",
    }}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
        <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>{location || "No address"}</div>
      </div>
    </div>
  );

  return (
    <div style={{ width: 300, minHeight: 200, flexShrink: 0, overflow: "hidden" }}>
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
  const router = useRouter();
  const [view, setView] = useState<ViewState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [data, setData] = useState<AnalysisData>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragCounter = useRef(0);
  const [selectedAssetType, setSelectedAssetType] = useState<string>("auto");
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [usageData, setUsageData] = useState<{ uploadsUsed: number; uploadLimit: number } | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [animateStrip, setAnimateStrip] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ===== ANONYMOUS USAGE TRACKING =====
  const getAnonId = useCallback(() => {
    let id = localStorage.getItem("nnn_anon_id");
    if (!id) {
      id = "anon_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem("nnn_anon_id", id);
    }
    return id;
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const anonId = getAnonId();
      const res = await fetch(`/api/workspace/usage?anonId=${anonId}`);
      if (res.ok) {
        const data = await res.json();
        setUsageData({ uploadsUsed: data.uploadsUsed, uploadLimit: data.uploadLimit });
      }
    } catch { /* silent */ }
  }, [getAnonId]);

  const incrementUsage = useCallback(async () => {
    try {
      const anonId = getAnonId();
      const res = await fetch("/api/workspace/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsageData({ uploadsUsed: data.uploadsUsed, uploadLimit: data.uploadLimit });
      }
    } catch { /* silent */ }
  }, [getAnonId]);

  // Fetch usage on mount
  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  /* Intersection Observer: trigger process strip animation when visible */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimateStrip(false);          // reset first (allows replay)
          requestAnimationFrame(() => setAnimateStrip(true));
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

    // Check usage limit before starting
    if (usageData && usageData.uploadsUsed >= usageData.uploadLimit) {
      setShowUpgradePrompt(true);
      return;
    }

    setView("processing");
    setStatusMsg("Uploading files...");

    try {
      let documentText = "";
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

      // Extract text client-side (identical to pro's extractTextFromFiles flow)
      if (ext === "pdf") {
        setStatusMsg("Extracting property image...");
        // Smart hero image extraction: scans first 5 pages, picks best photo-like page
        // Skips tables/text pages — returns null if no good property image found
        try {
          const heroBlob = await extractHeroImageFromPDF(selectedFile);
          if (heroBlob && heroBlob.size > 5000) {
            // Set temporary blob URL immediately for fast display
            setHeroImageUrl(URL.createObjectURL(heroBlob));
            console.log("[om-analyzer] Smart hero image set (blob)");
            // Upload to Firebase Storage for persistent URL (non-blocking)
            (async () => {
              try {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => {
                    const result = reader.result as string;
                    resolve(result.split(",")[1]);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(heroBlob);
                });
                const res = await fetch("/api/om-analyzer/upload-image", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64: base64 }),
                });
                if (res.ok) {
                  const { url } = await res.json();
                  if (url) {
                    setHeroImageUrl(url);
                    console.log("[om-analyzer] Hero image persisted to Storage:", url);
                  }
                }
              } catch (uploadErr) {
                console.warn("[om-analyzer] Storage upload failed, using blob URL:", uploadErr);
              }
            })();
          } else {
            console.log("[om-analyzer] No good property image found in PDF — will use map fallback");
          }
        } catch (imgErr) {
          console.warn("[om-analyzer] Hero image extraction failed:", imgErr);
        }

        // Now load pdf.js for text extraction (image extractor already loaded it)
        setStatusMsg("Reading file contents...");
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
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;

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

      // Call parse-lite API with asset-type-specific models (same as Pro pipeline)
      setStatusMsg("Analyzing property data...");
      const analysisType = selectedAssetType === "auto" ? undefined : selectedAssetType;
      const response = await fetch("/api/workspace/parse-lite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText: documentText.substring(0, 40000),
          fileName: selectedFile.name,
          source: "om-analyzer-page",
          analysisType,
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      const result = await response.json();

      // Run scoring using the same Pro models
      setStatusMsg("Scoring deal...");
      try {
        const scoreRes = await fetch("/api/om-analyzer/score-lite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisType: result.analysisType || "retail",
            data: result,
          }),
        });
        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          result.proScore = scoreData;
          setScoreResult(scoreData);
        }
      } catch (scoreErr) {
        console.warn("[om-analyzer] Scoring failed (non-blocking):", scoreErr);
      }

      setData(result);
      setView("result");

      // Increment usage counter after successful analysis
      incrementUsage();
    } catch (err) {
      console.error("Analysis error:", err);
      setData(generateDemoResult(selectedFile.name));
      setView("result");
      // Still increment on demo fallback (counts as an analysis attempt)
      incrementUsage();
    }
  }, [selectedFile, usageData, incrementUsage]);

  const resetAnalyzer = useCallback(() => {
    if (heroImageUrl) URL.revokeObjectURL(heroImageUrl);
    setSelectedFile(null);
    setData(null);
    setHeroImageUrl("");
    setScoreResult(null);
    setView("upload");
    setStatusMsg("");
    if (fileRef.current) fileRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [heroImageUrl]);

  return (
    <div className="ds-page-wrapper"
      onDragEnter={e => { e.preventDefault(); dragCounter.current++; if (view === "upload") setGlobalDragging(true); }}
      onDragOver={e => { e.preventDefault(); }}
      onDragLeave={e => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setGlobalDragging(false); }}
      onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); setDragging(false); if (view === "upload" && e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
    >
      {/* Global drag overlay */}
      {globalDragging && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(13,13,20,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            padding: "48px 64px", borderRadius: 20,
            border: "2px dashed #84CC16", background: "rgba(132,204,22,0.05)",
            textAlign: "center",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Drop your file anywhere</div>
            <div style={{ fontSize: 14, color: "#9ca3af" }}>PDF, Word, or Excel — we&apos;ll analyze it instantly</div>
          </div>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        html { scroll-behavior: smooth; }
        body, input, button, select, textarea { font-family: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scoreCount { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        @keyframes barGrow { from { width: 0; } }
        @keyframes stepFadeIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes connectorGrow { from { width: 0; } to { width: 100%; } }
        @keyframes docSlide { 0% { transform: translateY(6px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes extractPulse { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
        @keyframes scoreFill { from { stroke-dashoffset: 75.4; } to { stroke-dashoffset: var(--score-offset); } }
        @keyframes metricBar { from { width: 0; } to { width: var(--bar-w); } }
        @keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        @keyframes omPulse {
          0% { box-shadow: inset 0 0 10px rgba(132,204,22,0.4), 0 0 20px rgba(132,204,22,0.15), 0 0 40px rgba(132,204,22,0.08); }
          50% { box-shadow: inset 0 0 20px rgba(132,204,22,0.5), 0 0 35px rgba(132,204,22,0.25), 0 0 60px rgba(132,204,22,0.12); }
          100% { box-shadow: inset 0 0 10px rgba(132,204,22,0.4), 0 0 20px rgba(132,204,22,0.15), 0 0 40px rgba(132,204,22,0.08); }
        }
        @keyframes omCardFadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes omProcessDot { 0% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.3; transform: scale(0.8); } }
        @keyframes omFlowLine { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes omScanLine { 0% { top: 10%; opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { top: 85%; opacity: 0; } }
        @keyframes omFlowDot { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 6px); opacity: 0; } }
        .ds-om-outputs > div:hover { cursor: default; }
        /* Reusable curved green underline callout */
        .ds-callout {
          color: #84CC16;
          position: relative;
          display: inline-block;
        }
        .ds-callout::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: -4%;
          width: 108%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M6 3 Q100 22 194 3' stroke='%2384CC16' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
          background-size: 100% 100%;
        }
        /* Light bg variant */
        .ds-callout-dark {
          color: #4D7C0F;
          position: relative;
          display: inline-block;
        }
        .ds-callout-dark::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: -4%;
          width: 108%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M6 3 Q100 22 194 3' stroke='%234D7C0F' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
          background-size: 100% 100%;
        }
        .om-insight-card { opacity: 0; animation: omCardFadeIn 0.5s ease-out forwards; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .om-insight-card:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.08) !important; }
        /* Global grid overlay */
        .ds-page-wrapper::before {
          content: '';
          position: fixed;
          inset: 0;
          backgroundImage: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          backgroundSize: 60px 60px;
          pointerEvents: none;
          zIndex: 1;
        }
        @media (max-width: 900px) {
          .om-insight-grid { grid-template-columns: 1fr !important; }
          .om-insight-circle { width: 160px !important; height: 160px !important; }
          .om-insight-outputs { grid-template-columns: 1fr !important; }
          .om-insight-arrow { display: none !important; }
        }
        .ds-process-strip { opacity: 1; }
        .ds-process-step { opacity: 1; }
        .ds-process-connector { position: relative; height: 2px; flex: 1; min-width: 32px; background: rgba(255,255,255,0.1); overflow: hidden; border-radius: 1px; align-self: center; }
        .ds-process-connector::after { content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 100%; background: #84CC16; border-radius: 1px; }
        .ds-card { transition: all 0.25s ease; border-radius: 20px; background: rgba(22,22,31,0.6); border: 1px solid rgba(255,255,255,0.06); backdropFilter: blur(10px); }
        .ds-card:hover { transform: translateY(-3px); box-shadow: 0 0 30px rgba(132,204,22,0.06); }
        .ds-btn { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; border-radius: 50px; cursor: pointer; transition: all 0.2s ease; text-decoration: none; border: none; }
        .ds-btn:hover { transform: translateY(-1px); }
        .ds-btn-primary { background: #84CC16; color: #0d0d14; box-shadow: 0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15); }
        .ds-btn-primary:hover { box-shadow: 0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15); transform: translateY(-2px); }
        .ds-btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.12); }
        .ds-btn-outline:hover { border-color: #84CC16; color: #84CC16; box-shadow: 0 0 20px rgba(132,204,22,0.15); }
        .om-upload-zone { transition: all 0.2s ease; }
        .om-upload-zone:hover { border-color: #84CC16 !important; background: rgba(132,204,22,0.08) !important; }
        .dl-btn { transition: all 0.2s ease; }
        .dl-btn:hover { background: rgba(132,204,22,0.15) !important; transform: translateY(-1px); }
        .om-dark-btn { transition: all 0.2s ease; }
        .om-cta-btn { transition: all 0.2s ease; }
        .om-cta-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(132,204,22,0.3); }
        .om-feature-card { transition: all 0.25s ease; }
        .om-feature-card:hover { transform: translateY(-2px); }
        footer a { transition: color 0.15s ease; }
        footer a:hover { color: #84CC16 !important; }
        input:focus { box-shadow: 0 0 0 3px rgba(132,204,22,0.1) !important; }
        @media (max-width: 900px) {
          .ds-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .ds-hero-left h1 { font-size: 36px !important; }
          .ds-hero-btns { justify-content: center !important; }
          .ds-features-3 { grid-template-columns: 1fr !important; }
          .ds-features-grid { grid-template-columns: 1fr !important; }
          .ds-pro-grid { grid-template-columns: 1fr !important; }
          .ds-pricing-grid { grid-template-columns: 1fr !important; }
          .ds-steps-grid { grid-template-columns: 1fr !important; }
          .ds-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
          .ds-nav-links { display: none !important; }
          .ds-pro-features { grid-template-columns: 1fr 1fr !important; }
          .ds-workflow-steps { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-process-strip { transform: scale(0.85); transform-origin: left center; }
          .ds-om-outputs { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-cards { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-header { text-align: center; justify-content: center !important; }
        }
        @media (max-width: 480px) {
          .ds-footer-grid { grid-template-columns: 1fr !important; }
          .ds-pro-features { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ===== UPGRADE PROMPT OVERLAY ===== */}
      {showUpgradePrompt && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(13,13,20,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowUpgradePrompt(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#16161f", borderRadius: 16, padding: "40px 36px", maxWidth: 420,
            textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, background: "rgba(132,204,22,0.15)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: "#ffffff", margin: "0 0 8px", letterSpacing: -0.3 }}>
              Free Trial Complete
            </h3>
            <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 24px" }}>
              You&apos;ve used your 2 free analyses. Upgrade to Pro to continue analyzing deals with full scoring, Excel exports, and your own DealBoard.
            </p>
            <Link href="/workspace/login?upgrade=pro" style={{
              display: "inline-block", padding: "14px 36px",
              background: "linear-gradient(135deg, #84CC16, #a8d600)", color: "#0d0d14",
              borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
              marginBottom: 8,
            }}>
              Upgrade to Pro — $40/mo
            </Link>
            <Link href="/pricing" style={{
              display: "block", padding: "10px 20px",
              color: "#9ca3af", fontSize: 13, fontWeight: 500, textDecoration: "none",
            }}>
              Compare all plans
            </Link>
            <button onClick={() => setShowUpgradePrompt(false)} style={{
              display: "block", width: "100%", marginTop: 12, padding: "10px",
              background: "none", border: "none", color: "#6b7280", cursor: "pointer",
              fontSize: 13, fontWeight: 500,
            }}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      <DealSignalNav />

      {/* ===== RESULT: minimal header bar ===== */}
      {view === "result" && (
        <div style={{ padding: "12px 0", paddingTop: 76, borderBottom: "1px solid #EDF0F5" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={resetAnalyzer} style={{
              padding: "8px 20px", background: "#16161f", border: "1.5px solid #D8DFE9",
              borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#9ca3af", cursor: "pointer",
            }}>
              &larr; Analyze Another
            </button>
            <DealSignalLogo size={24} fontSize={14} gap={8} />
          </div>
        </div>
      )}

      {/* ===== HERO + LANDING PAGE ===== */}
      {view === "upload" && (
        <section
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={e => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
          style={{ background: "#0d0d14", paddingTop: 64 }}>

          {/* ── 1. HERO ── */}
          <div style={{ padding: "100px 32px 120px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Subtle line-drawing cityscape background */}
            <svg
              style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.04 }}
              viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax meet" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              {/* Skyline buildings */}
              <g stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Far left - short building */}
                <rect x="20" y="340" width="60" height="260" />
                <line x1="35" y1="360" x2="35" y2="380" /><line x1="55" y1="360" x2="55" y2="380" />
                <line x1="35" y1="400" x2="35" y2="420" /><line x1="55" y1="400" x2="55" y2="420" />
                <line x1="35" y1="440" x2="35" y2="460" /><line x1="55" y1="440" x2="55" y2="460" />

                {/* Tall tower */}
                <rect x="100" y="180" width="50" height="420" />
                <rect x="110" y="160" width="30" height="20" />
                <line x1="125" y1="140" x2="125" y2="160" />
                <line x1="115" y1="200" x2="115" y2="220" /><line x1="135" y1="200" x2="135" y2="220" />
                <line x1="115" y1="240" x2="115" y2="260" /><line x1="135" y1="240" x2="135" y2="260" />
                <line x1="115" y1="280" x2="115" y2="300" /><line x1="135" y1="280" x2="135" y2="300" />
                <line x1="115" y1="320" x2="115" y2="340" /><line x1="135" y1="320" x2="135" y2="340" />
                <line x1="115" y1="360" x2="115" y2="380" /><line x1="135" y1="360" x2="135" y2="380" />

                {/* Wide office block */}
                <rect x="170" y="290" width="90" height="310" />
                <line x1="170" y1="350" x2="260" y2="350" />
                <line x1="170" y1="410" x2="260" y2="410" />
                <line x1="170" y1="470" x2="260" y2="470" />
                <line x1="190" y1="290" x2="190" y2="600" /><line x1="215" y1="290" x2="215" y2="600" />
                <line x1="240" y1="290" x2="240" y2="600" />

                {/* Modern tower with setback */}
                <rect x="290" y="220" width="55" height="380" />
                <rect x="295" y="200" width="45" height="20" />
                <rect x="300" y="240" width="10" height="15" /><rect x="320" y="240" width="10" height="15" />
                <rect x="300" y="280" width="10" height="15" /><rect x="320" y="280" width="10" height="15" />
                <rect x="300" y="320" width="10" height="15" /><rect x="320" y="320" width="10" height="15" />
                <rect x="300" y="360" width="10" height="15" /><rect x="320" y="360" width="10" height="15" />
                <rect x="300" y="400" width="10" height="15" /><rect x="320" y="400" width="10" height="15" />

                {/* Skyscraper with spire */}
                <rect x="370" y="130" width="45" height="470" />
                <polygon points="380,130 392,80 405,130" />
                <line x1="392" y1="50" x2="392" y2="80" />
                <line x1="382" y1="160" x2="382" y2="175" /><line x1="402" y1="160" x2="402" y2="175" />
                <line x1="382" y1="200" x2="382" y2="215" /><line x1="402" y1="200" x2="402" y2="215" />
                <line x1="382" y1="240" x2="382" y2="255" /><line x1="402" y1="240" x2="402" y2="255" />
                <line x1="382" y1="280" x2="382" y2="295" /><line x1="402" y1="280" x2="402" y2="295" />
                <line x1="382" y1="320" x2="382" y2="335" /><line x1="402" y1="320" x2="402" y2="335" />
                <line x1="382" y1="360" x2="382" y2="375" /><line x1="402" y1="360" x2="402" y2="375" />

                {/* Short retail building */}
                <rect x="440" y="420" width="70" height="180" />
                <rect x="455" y="440" width="15" height="25" /><rect x="480" y="440" width="15" height="25" />
                <rect x="455" y="490" width="15" height="25" /><rect x="480" y="490" width="15" height="25" />
                <rect x="460" y="540" width="40" height="60" />

                {/* Mid-rise with flat roof */}
                <rect x="530" y="320" width="65" height="280" />
                <line x1="545" y1="340" x2="545" y2="355" /><line x1="565" y1="340" x2="565" y2="355" /><line x1="580" y1="340" x2="580" y2="355" />
                <line x1="545" y1="375" x2="545" y2="390" /><line x1="565" y1="375" x2="565" y2="390" /><line x1="580" y1="375" x2="580" y2="390" />
                <line x1="545" y1="410" x2="545" y2="425" /><line x1="565" y1="410" x2="565" y2="425" /><line x1="580" y1="410" x2="580" y2="425" />
                <line x1="545" y1="445" x2="545" y2="460" /><line x1="565" y1="445" x2="565" y2="460" /><line x1="580" y1="445" x2="580" y2="460" />

                {/* Glass tower */}
                <rect x="620" y="200" width="50" height="400" />
                <line x1="620" y1="240" x2="670" y2="240" /><line x1="620" y1="280" x2="670" y2="280" />
                <line x1="620" y1="320" x2="670" y2="320" /><line x1="620" y1="360" x2="670" y2="360" />
                <line x1="620" y1="400" x2="670" y2="400" /><line x1="620" y1="440" x2="670" y2="440" />
                <line x1="620" y1="480" x2="670" y2="480" /><line x1="620" y1="520" x2="670" y2="520" />
                <line x1="645" y1="200" x2="645" y2="600" />

                {/* Twin towers */}
                <rect x="700" y="250" width="35" height="350" /><rect x="745" y="270" width="35" height="330" />
                <line x1="710" y1="275" x2="710" y2="290" /><line x1="725" y1="275" x2="725" y2="290" />
                <line x1="710" y1="310" x2="710" y2="325" /><line x1="725" y1="310" x2="725" y2="325" />
                <line x1="710" y1="345" x2="710" y2="360" /><line x1="725" y1="345" x2="725" y2="360" />
                <line x1="755" y1="295" x2="755" y2="310" /><line x1="770" y1="295" x2="770" y2="310" />
                <line x1="755" y1="330" x2="755" y2="345" /><line x1="770" y1="330" x2="770" y2="345" />
                <line x1="755" y1="365" x2="755" y2="380" /><line x1="770" y1="365" x2="770" y2="380" />

                {/* Warehouse / industrial */}
                <rect x="810" y="400" width="80" height="200" />
                <line x1="810" y1="400" x2="850" y2="370" /><line x1="850" y1="370" x2="890" y2="400" />
                <rect x="830" y="500" width="20" height="30" /><rect x="860" y="500" width="20" height="30" />

                {/* Tall modern */}
                <rect x="920" y="170" width="45" height="430" />
                <rect x="925" y="155" width="35" height="15" />
                <line x1="942" y1="135" x2="942" y2="155" />
                {[0,1,2,3,4,5,6,7,8].map(i => <line key={`tm${i}`} x1="932" y1={195+i*45} x2="932" y2={210+i*45} />)}
                {[0,1,2,3,4,5,6,7,8].map(i => <line key={`tm2${i}`} x1="952" y1={195+i*45} x2="952" y2={210+i*45} />)}

                {/* Right cluster */}
                <rect x="990" y="310" width="55" height="290" />
                <line x1="1005" y1="330" x2="1005" y2="350" /><line x1="1025" y1="330" x2="1025" y2="350" />
                <line x1="1005" y1="370" x2="1005" y2="390" /><line x1="1025" y1="370" x2="1025" y2="390" />
                <line x1="1005" y1="410" x2="1005" y2="430" /><line x1="1025" y1="410" x2="1025" y2="430" />

                <rect x="1060" y="260" width="40" height="340" />
                <line x1="1075" y1="280" x2="1075" y2="295" /><line x1="1090" y1="280" x2="1090" y2="295" />
                <line x1="1075" y1="315" x2="1075" y2="330" /><line x1="1090" y1="315" x2="1090" y2="330" />
                <line x1="1075" y1="350" x2="1075" y2="365" /><line x1="1090" y1="350" x2="1090" y2="365" />

                {/* Far right buildings */}
                <rect x="1120" y="380" width="60" height="220" />
                <rect x="1130" y="400" width="15" height="20" /><rect x="1155" y="400" width="15" height="20" />
                <rect x="1130" y="440" width="15" height="20" /><rect x="1155" y="440" width="15" height="20" />

                <rect x="1200" y="300" width="50" height="300" />
                <line x1="1215" y1="320" x2="1215" y2="340" /><line x1="1235" y1="320" x2="1235" y2="340" />
                <line x1="1215" y1="360" x2="1215" y2="380" /><line x1="1235" y1="360" x2="1235" y2="380" />
                <line x1="1215" y1="400" x2="1215" y2="420" /><line x1="1235" y1="400" x2="1235" y2="420" />

                <rect x="1270" y="350" width="70" height="250" />
                <line x1="1270" y1="350" x2="1305" y2="320" /><line x1="1305" y1="320" x2="1340" y2="350" />
                <rect x="1290" y="500" width="25" height="40" />

                <rect x="1360" y="420" width="60" height="180" />
                <line x1="1375" y1="440" x2="1375" y2="455" /><line x1="1400" y1="440" x2="1400" y2="455" />
                <line x1="1375" y1="475" x2="1375" y2="490" /><line x1="1400" y1="475" x2="1400" y2="490" />
              </g>

              {/* Ground line */}
              <line x1="0" y1="600" x2="1440" y2="600" stroke="#ffffff" strokeWidth="1" opacity="0.5" />

              {/* Dot grid pattern in sky */}
              <g fill="#ffffff" opacity="0.3">
                {[0,1,2,3,4,5,6,7,8,9,10,11].map(row =>
                  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(col => (
                    <circle key={`d${row}-${col}`} cx={100 + col * 95} cy={40 + row * 45} r="1" />
                  ))
                )}
              </g>
            </svg>

            {/* Soft gradient fade at bottom of cityscape */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to top, #0d0d14, transparent)", pointerEvents: "none", zIndex: 0 }} />

            {/* Gradient orbs for hero depth */}
            <div style={{ position: "absolute", top: -100, left: -200, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.12)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ position: "absolute", bottom: -100, right: -150, width: 400, height: 400, borderRadius: "50%", background: "rgba(132,204,22,0.06)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div className="ds-hero-grid" style={{
              maxWidth: 1100, margin: "0 auto",
              display: "grid", gridTemplateColumns: "1fr 420px", gap: 64, alignItems: "center",
              position: "relative", zIndex: 1,
            }}>
              {/* Left */}
              <div className="ds-hero-left" style={{ animation: "fadeInUp 0.5s ease-out" }}>

                <h1 style={{
                  fontSize: 56, fontWeight: 800, color: "#ffffff", lineHeight: 1.1,
                  marginBottom: 20, letterSpacing: -1.5,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Analyze Any Commercial<br />Property With <span className="ds-callout">One Upload</span>.
                </h1>
                <p style={{
                  fontSize: 19, color: "#9ca3af", lineHeight: 1.7,
                  maxWidth: 500, marginBottom: 36,
                }}>
                  Deal Signals turns complex Offering Memorandums into actionable investment intelligence.
                </p>
                <div className="ds-hero-btns" style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => fileRef.current?.click()} className="ds-btn ds-btn-primary" style={{
                    fontSize: 15, padding: "14px 32px",
                  }}>
                    Upload a Deal
                  </button>
                </div>
              </div>

              {/* Right — upload column */}
              <div style={{ animation: "fadeInUp 0.5s ease-out 0.1s both" }}>
                {/* "Try now" label */}
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", textTransform: "uppercase" as const, letterSpacing: 1.5 }}>
                    Try now — two deals free
                  </span>
                </div>

                {/* Upload drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                  onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
                  onClick={() => !selectedFile && fileRef.current?.click()}
                  style={{
                    background: dragging ? "rgba(132,204,22,0.06)" : "rgba(255,255,255,0.03)",
                    borderRadius: 20, padding: selectedFile ? "24px" : "48px 32px",
                    cursor: selectedFile ? "default" : "pointer",
                    border: `2px dashed ${dragging ? "#84CC16" : "rgba(132,204,22,0.25)"}`,
                    textAlign: "center",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                >
                  {!selectedFile ? (
                    <>
                      <div style={{
                        width: 56, height: 56, borderRadius: "50%", background: "rgba(132,204,22,0.12)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#ffffff", margin: "0 0 6px" }}>
                        {dragging ? "Drop your file here" : "Drop your OM or flyer"}
                      </p>
                      <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
                        PDF, Word, Excel, or CSV &middot; Max 50MB
                      </p>
                      <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="ds-btn ds-btn-primary" style={{
                        fontSize: 14, padding: "12px 32px",
                      }}>
                        Select File
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        background: "rgba(255,255,255,0.05)", borderRadius: 10, textAlign: "left",
                      }}>
                        <span style={{ padding: "2px 8px", background: "rgba(132,204,22,0.15)", borderRadius: 6, fontSize: 9, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", flexShrink: 0 }}>
                          {selectedFile.name.split(".").pop()}
                        </span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, fontSize: 13, color: "#ffffff" }}>{selectedFile.name}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>&times;</button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); startAnalysis(); }} className="ds-btn ds-btn-primary" style={{
                        display: "block", width: "100%", fontSize: 15, padding: "13px 32px", marginTop: 12,
                      }}>
                        Run Deal Signals
                      </button>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" style={{ display: "none" }} accept={ACCEPTED_EXT}
                  onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files[0]); }} />

                {/* Usage counter */}
                {usageData && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
                    <div style={{ height: 4, width: 56, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                        width: `${Math.min(100, (usageData.uploadsUsed / usageData.uploadLimit) * 100)}%`,
                        background: usageData.uploadsUsed >= usageData.uploadLimit ? "#84CC16" : usageData.uploadsUsed >= usageData.uploadLimit - 1 ? "#eab308" : "#10b981",
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: usageData.uploadsUsed >= usageData.uploadLimit ? "#84CC16" : "#9ca3af" }}>
                      {usageData.uploadsUsed} / {usageData.uploadLimit} free
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. FROM OM TO INSIGHT IN SECONDS ── */}
          <div id="how-it-works" style={{ padding: "100px 32px 100px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative", zIndex: 1 }}>

              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 56 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", padding: "8px 18px",
                  borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16",
                  fontSize: 13, fontWeight: 600, marginBottom: 16, gap: 6,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  One-Click Intelligence
                </div>
                <h2 style={{ fontSize: 40, fontWeight: 800, color: "#ffffff", marginBottom: 12, letterSpacing: -0.5, lineHeight: 1.15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  From OM to Insight in Seconds
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
                  Upload a single Offering Memorandum and let our AI engine generate everything you need to make a decision.
                </p>
              </div>

              {/* Animated workflow graphic */}
              <div style={{ position: "relative", maxWidth: 1000, margin: "0 auto" }}>

                {/* ── Row 1: Upload OM → AI Engine → DealBoard ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 56 }}>

                  {/* Upload OM card */}
                  <div style={{
                    background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.2)",
                    borderRadius: 16, padding: "28px 32px", minWidth: 180, textAlign: "center",
                    animation: "fadeInUp 0.6s ease-out both",
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, background: "rgba(132,204,22,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                    }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 12 15 15" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>Upload OM</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>PDF, DOCX, or XLS</div>
                  </div>

                  {/* Animated connector arrow 1 */}
                  <div style={{ width: 80, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <div style={{
                      height: 2, background: "linear-gradient(90deg, #84CC16, rgba(132,204,22,0.3))",
                      width: "100%", animation: "connectorGrow 0.8s ease-out 0.4s both",
                    }} />
                    <div style={{
                      position: "absolute", right: -4, width: 8, height: 8, borderTop: "2px solid #84CC16",
                      borderRight: "2px solid #84CC16", transform: "rotate(45deg)", animation: "fadeInUp 0.3s ease-out 1s both",
                    }} />
                    {/* Flowing dots */}
                    <div style={{
                      position: "absolute", width: 6, height: 6, borderRadius: "50%", background: "#84CC16",
                      animation: "omFlowDot 1.8s ease-in-out 1.2s infinite",
                    }} />
                  </div>

                  {/* AI Engine (center piece) */}
                  <div style={{
                    background: "linear-gradient(135deg, rgba(132,204,22,0.12), rgba(132,204,22,0.04))",
                    border: "1.5px solid rgba(132,204,22,0.3)", borderRadius: 20,
                    padding: "32px 40px", textAlign: "center", position: "relative",
                    animation: "fadeInUp 0.6s ease-out 0.3s both",
                    boxShadow: "0 0 60px rgba(132,204,22,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}>
                    {/* Scanning line effect */}
                    <div style={{
                      position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                      background: "linear-gradient(90deg, transparent, #84CC16, transparent)",
                      animation: "omScanLine 3s ease-in-out 1.5s infinite", opacity: 0.4,
                    }} />
                    <div style={{
                      width: 60, height: 60, borderRadius: 16,
                      background: "linear-gradient(135deg, #84CC16, #4D7C0F)",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                      boxShadow: "0 4px 20px rgba(132,204,22,0.3)",
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#ffffff", marginBottom: 4 }}>AI Engine</div>
                    <div style={{ fontSize: 12, color: "#84CC16", fontWeight: 600, letterSpacing: 0.5 }}>GPT-4o POWERED</div>
                    {/* Processing dots */}
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 5, height: 5, borderRadius: "50%", background: "#84CC16",
                          animation: `omProcessDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>

                  {/* Animated connector arrow 2 */}
                  <div style={{ width: 80, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <div style={{
                      height: 2, background: "linear-gradient(90deg, rgba(132,204,22,0.3), #84CC16)",
                      width: "100%", animation: "connectorGrow 0.8s ease-out 0.8s both",
                    }} />
                    <div style={{
                      position: "absolute", right: -4, width: 8, height: 8, borderTop: "2px solid #84CC16",
                      borderRight: "2px solid #84CC16", transform: "rotate(45deg)", animation: "fadeInUp 0.3s ease-out 1.4s both",
                    }} />
                    <div style={{
                      position: "absolute", width: 6, height: 6, borderRadius: "50%", background: "#84CC16",
                      animation: "omFlowDot 1.8s ease-in-out 1.6s infinite",
                    }} />
                  </div>

                  {/* DealBoard card */}
                  <div style={{
                    background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.2)",
                    borderRadius: 16, padding: "28px 32px", minWidth: 180, textAlign: "center",
                    animation: "fadeInUp 0.6s ease-out 0.6s both",
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, background: "rgba(132,204,22,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                    }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>DealBoard</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Score, share, export</div>
                  </div>
                </div>

                {/* ── Row 2: Output cards ── */}
                <div className="ds-om-outputs" style={{
                  display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
                }}>
                  {[
                    { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Financials", detail: "Cap rate, NOI, DSCR, rent/SF", color: "#84CC16" },
                    { icon: "M22 12h-4l-3 9L9 3l-3 9H2", label: "Deal Score", detail: "Weighted 0–100 with signals", color: "#059669" },
                    { icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z", label: "Risk Flags", detail: "Color-coded risk signals", color: "#D97706" },
                    { icon: "M4 6h16M4 10h16M4 14h16M4 18h16", label: "Investment Thesis", detail: "Buy / hold / pass rationale", color: "#6366F1" },
                  ].map((card, i) => (
                    <div key={card.label} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 14, padding: "22px 18px", textAlign: "center",
                      animation: `fadeInUp 0.5s ease-out ${0.9 + i * 0.12}s both`,
                      transition: "border-color 0.3s, background 0.3s, transform 0.3s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${card.color}33`; e.currentTarget.style.background = `${card.color}08`; e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: `${card.color}14`, display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 12px",
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={card.icon} />
                        </svg>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", marginBottom: 3 }}>{card.label}</div>
                      <div style={{ fontSize: 11.5, color: "#9ca3af", lineHeight: 1.4 }}>{card.detail}</div>
                    </div>
                  ))}
                </div>

                {/* Connecting lines from AI engine down to output cards */}
                <div style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -8px)",
                  width: 2, height: 40, background: "linear-gradient(to bottom, rgba(132,204,22,0.3), rgba(132,204,22,0.08))",
                  animation: "fadeInUp 0.5s ease-out 0.85s both",
                }} />
              </div>

            </div>
          </div>

          {/* ── 4. HOW IT WORKS — WORKFLOW VISUAL ── */}
          <div id="workflow" style={{ padding: "88px 32px 72px", background: "#f5f5f0" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
              <div style={{
                display: "inline-block", padding: "5px 14px", borderRadius: 20,
                background: "rgba(132,204,22,0.12)", color: "#4D7C0F",
                fontSize: 12, fontWeight: 700, letterSpacing: 0.5, marginBottom: 16,
                textTransform: "uppercase",
              }}>
                How It Works
              </div>
              <h2 style={{ fontSize: 34, fontWeight: 800, color: "#151b2b", marginBottom: 12, lineHeight: 1.2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                From offering memo to<br /><span className="ds-callout-dark">scored deal</span> in seconds
              </h2>
              <p style={{ fontSize: 16, color: "#585e70", marginBottom: 48, lineHeight: 1.7, maxWidth: 580, margin: "0 auto 48px" }}>
                Upload any OM, rent roll, or broker package. Deal Signals extracts every key metric, scores the deal, and delivers it straight to your DealBoard.
              </p>

              {/* Workflow image */}
              <div style={{
                position: "relative", maxWidth: 1060, margin: "0 auto",
                borderRadius: 20, overflow: "hidden",
                border: "1px solid rgba(0,0,0,0.1)",
                boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
              }}>
                <img
                  src="/images/deal-signals-workflow.png"
                  alt="Deal Signals workflow — from OM upload to scored deal on your DealBoard"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

              {/* Step indicators below */}
              <div className="ds-workflow-steps" style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24,
                maxWidth: 900, margin: "48px auto 0",
              }}>
                {[
                  { num: "1", title: "Upload", desc: "Drop in an OM, rent roll, or broker flyer — PDF, DOCX, or XLS." },
                  { num: "2", title: "Extract", desc: "AI parses cap rate, NOI, tenant, lease terms, price & 40+ fields." },
                  { num: "3", title: "Score", desc: "Weighted Deal Score (0–100) with buy/hold/pass recommendation." },
                  { num: "4", title: "Act", desc: "View on your DealBoard, share with investors, or export reports." },
                ].map(step => (
                  <div key={step.num} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "#84CC16", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 800, margin: "0 auto 12px",
                    }}>
                      {step.num}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#151b2b", marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 13, color: "#585e70", lineHeight: 1.5 }}>{step.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* testimonials section removed */}

          {/* ── 6. EVERYTHING IN YOUR DEAL SIGNALS REPORT ── */}
          <div id="features" style={{ padding: "120px 32px 100px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Subtle gradient bg */}
            <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: "rgba(132,204,22,0.04)", filter: "blur(160px)", pointerEvents: "none" }} />

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
              {/* Header row: left text + right CTA */}
              <div className="ds-report-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56, flexWrap: "wrap", gap: 24 }}>
                <div>
                  <h2 style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15, marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Everything in your<br />Deal <span className="ds-callout">Signals</span> report
                  </h2>
                  <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, maxWidth: 520 }}>
                    Stop manual data entry. Start making decisions with institutional-grade intelligence.
                  </p>
                </div>
                <a href="#demo" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10,
                  border: "1.5px solid rgba(132,204,22,0.4)", background: "transparent",
                  color: "#84CC16", fontSize: 14, fontWeight: 600, textDecoration: "none",
                  transition: "all 0.25s ease", cursor: "pointer",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.08)"; e.currentTarget.style.borderColor = "#84CC16"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(132,204,22,0.4)"; }}
                >
                  See a Sample Report
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </a>
              </div>

              {/* 4-column card grid */}
              <div className="ds-report-cards" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
                {[
                  { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", title: "Extracted Financials", desc: "Cap rate, NOI, DSCR, price/SF, occupancy, and 40+ more fields extracted instantly." },
                  { icon: "M22 12h-4l-3 9L9 3l-3 9H2", title: "Deal Signals Score", desc: "A weighted 0-100 score across pricing, cashflow, tenant, and location metrics." },
                  { icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z", title: "Risk Flags", desc: "Color-coded signals for cap rate, basis, and rollover risk to spot red flags early." },
                  { icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", title: "Investment Thesis", desc: "A concise buy/hold/pass recommendation with supporting rationale for your team." },
                ].map((card, i) => (
                  <div key={card.title} className="ds-report-card" style={{
                    background: "rgba(22,26,35,0.7)", borderRadius: 16, padding: "28px 24px",
                    border: "1px solid rgba(132,204,22,0.12)",
                    transition: "all 0.3s ease", cursor: "default",
                    animation: `fadeInUp 0.5s ease-out ${0.1 + i * 0.1}s both`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(132,204,22,0.35)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(132,204,22,0.12)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 20,
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={card.icon} /></svg>
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: "#ffffff", marginBottom: 8 }}>{card.title}</h3>
                    <p style={{ fontSize: 13.5, color: "#9ca3af", lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 7. PRO WORKSPACE PREVIEW (DEMO) ── */}
          <div id="demo" style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 32px 80px" }}>
            {/* Section divider */}
            <div style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontSize: 34, fontWeight: 800, color: "#ffffff", marginBottom: 10 }}>
                Your full deal <span className="ds-callout">DealBoard</span>
              </h2>
              <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7 }}>
                Deep research on tenant credit, location intel, comp analysis, and everything the OM doesn&apos;t mention.
              </p>
            </div>

            {/* Workspace preview container */}
            <div style={{
              borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 60px rgba(15,23,42,0.08)", marginBottom: 28,
              background: "rgba(22,22,31,0.6)", backdropFilter: "blur(10px)",
            }}>
              {/* Header bar */}
              <div style={{
                height: 56, background: "#16161f", borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 20px",
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>Deal Signals</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ padding: "6px 16px", borderRadius: 50, fontSize: 11, fontWeight: 700, background: "#84CC16", color: "#0d0d14" }}>Upgrade to Pro</span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #84CC16, #4D7C0F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#0d0d14" }}>B</div>
                </div>
              </div>

              {/* Main workspace body */}
              <div style={{ display: "flex", minHeight: 500 }}>
                {/* Sidebar */}
                <aside style={{ width: 260, background: "#16161f", borderRight: "1px solid rgba(255,255,255,0.08)", padding: "12px 8px", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "10px 14px 8px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#84CC16" }}>My DealBoard</div>
                  </div>
                  <nav style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
                    {[
                      { label: "DealBoard", icon: "M3 3h7v7H3z" },
                      { label: "Scoreboard", icon: "M18 20V10M12 20V4M6 20v-6" },
                      { label: "Upload Deal", icon: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5" },
                    ].map(item => (
                      <div key={item.label} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 8,
                        color: item.label === "Upload Deal" ? "#84CC16" : "#64748b",
                        background: item.label === "Upload Deal" ? "rgba(132,204,22,0.06)" : "transparent",
                        fontSize: 13, fontWeight: item.label === "Upload Deal" ? 600 : 500, cursor: "pointer",
                      }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: item.label === "Upload Deal" ? "rgba(132,204,22,0.08)" : "transparent", fontSize: 12 }}>
                          {item.label === "DealBoard" ? "📊" : item.label === "Scoreboard" ? "📈" : "📤"}
                        </div>
                        {item.label}
                      </div>
                    ))}
                  </nav>

                  {/* Properties */}
                  <div style={{ flex: 1, overflow: "auto", padding: "8px 8px", marginTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#9ca3af", padding: "6px 8px 8px" }}>
                      Properties (2)
                    </div>
                    {[
                      { name: "Walgreens — Cedar Park, TX", score: 74, type: "retail" },
                      { name: "Flex Industrial — Schaumburg, IL", score: 68, type: "industrial" },
                    ].map((d, i) => (
                      <div key={d.name} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                        color: i === 0 ? "#84CC16" : "#64748b",
                        background: i === 0 ? "rgba(132,204,22,0.06)" : "transparent",
                        fontWeight: i === 0 ? 600 : 500, fontSize: 12, cursor: "pointer",
                      }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: i === 0 ? "rgba(132,204,22,0.08)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                          {d.type === "retail" ? "🏪" : "🏭"}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.name}
                        </div>
                        <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 800, flexShrink: 0, background: "rgba(5,150,105,0.1)", color: "#059669" }}>
                          {d.score}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginTop: 8, border: "1.5px dashed #e2e8f0", borderRadius: 10, color: "#9ca3af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Property
                    </div>
                  </div>

                  {/* Bottom nav */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "6px 8px 10px" }}>
                    {["DealBoards", "Settings"].map(label => (
                      <div key={label} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 8,
                        color: "#9ca3af", fontSize: 11, fontWeight: 500, cursor: "pointer",
                      }}>
                        {label}
                      </div>
                    ))}
                  </div>
                </aside>

                {/* Main content */}
                <main style={{ flex: 1, background: "#1e1e28", padding: "20px", overflow: "auto" }}>
                  <div style={{ maxWidth: 700 }}>
                    {/* Property header card */}
                    <div style={{ background: "#16161f", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 0, marginBottom: 20, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 160 }}>
                        {/* Image placeholder */}
                        <div style={{ background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                          <div style={{ fontSize: 36, opacity: 0.3 }}>📍</div>
                          <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 500 }}>Cedar Park, TX</div>
                        </div>

                        {/* Property info */}
                        <div style={{ padding: "18px 22px" }}>
                          <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 8 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", margin: 0 }}>
                                  Walgreens NNN
                                </h2>
                                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: "rgba(132,204,22,0.06)", color: "#84CC16", textTransform: "uppercase", letterSpacing: 0.5 }}>Retail</span>
                              </div>
                              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>1301 E Whitestone Blvd</p>
                            </div>
                            {/* Score ring */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                              <div style={{ position: "relative", width: 56, height: 56 }}>
                                <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
                                  <circle cx="28" cy="28" r="24" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                                  <circle cx="28" cy="28" r="24" fill="none" stroke="#059669" strokeWidth="4" strokeDasharray={`${2 * Math.PI * 24 * 0.74} ${2 * Math.PI * 24}`} strokeLinecap="round" />
                                </svg>
                                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>74</span>
                                </div>
                              </div>
                              <span style={{ marginTop: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#059669", padding: "2px 8px", borderRadius: 3, background: "rgba(5,150,105,0.1)" }}>Buy</span>
                            </div>
                          </div>

                          {/* Key metrics */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
                            {[
                              { label: "Price", value: "$7.05M" },
                              { label: "Cap Rate", value: "5.85%" },
                              { label: "NOI", value: "$412K" },
                              { label: "DSCR", value: "1.42x" },
                            ].map(m => (
                              <div key={m.label} style={{ padding: "8px 10px", background: "#1e1e28", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                                <div style={{ fontSize: 8, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>{m.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>{m.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div style={{ background: "#16161f", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 20 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 1 }} />
                        Score Breakdown
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[
                          { name: "Pricing", score: 62 },
                          { name: "Cashflow", score: 78 },
                          { name: "Tenant", score: 82 },
                          { name: "Location", score: 78 },
                        ].map(cat => {
                          const barColor = cat.score >= 70 ? "#059669" : cat.score >= 50 ? "#D97706" : "#DC2626";
                          return (
                            <div key={cat.name} style={{ padding: "10px 12px", background: "#1e1e28", borderRadius: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff" }}>{cat.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 800, color: barColor }}>{cat.score}</span>
                              </div>
                              <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${cat.score}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </div>

            {/* CTA */}
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <Link href="/workspace" className="ds-btn ds-btn-primary" style={{ fontSize: 14, padding: "12px 28px" }}>
                  Try Pro Free
                </Link>
                <Link href="/#pricing" className="ds-btn" style={{ fontSize: 14, padding: "12px 28px" }}>
                  See Plans
                </Link>
              </div>
            </div>
          </div>

          {/* ── 8. PRICING ── */}
          <div id="pricing" style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 32px 80px", position: "relative", overflow: "visible" }}>
            {/* Section divider */}
            <div style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />
            {/* Gradient orb for pricing */}
            <div style={{ position: "absolute", top: -200, right: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.1)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ textAlign: "center", marginBottom: 56, position: "relative", zIndex: 1 }}>
              <h2 style={{ fontSize: 34, fontWeight: 800, color: "#ffffff", marginBottom: 10 }}>
                Simple pricing for serious underwriting
              </h2>
              <p style={{ fontSize: 14, color: "#5A7091", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
                Start free. Upgrade when your deal flow demands it. No contracts, cancel anytime.
              </p>
            </div>

            {/* 3-tier pricing grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 60 }}>
              {[
                {
                  name: "Free",
                  price: "0",
                  period: "",
                  desc: "For independent analysts and students evaluating deals.",
                  features: [
                    { text: "2 Deal Analyses", included: true },
                    { text: "Standard PDF extraction", included: true },
                    { text: "Basic Deal Signals score", included: true },
                    { text: "First-pass brief download", included: true },
                    { text: "Save & organize deals", included: false },
                    { text: "AI scoring models", included: false },
                    { text: "Full Excel exports", included: false },
                    { text: "DealBoard & history", included: false },
                  ],
                  cta: "Get Started Free",
                  ctaLink: "/",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: "40",
                  period: "/mo",
                  desc: "For active investors and small acquisition teams.",
                  features: [
                    { text: "Up to 40 deals/month", included: true },
                    { text: "Save & organize deals", included: true },
                    { text: "Deal Signals scoring", included: true },
                    { text: "Full Excel workbooks (6 sheets)", included: true },
                    { text: "Pro DealBoard with history", included: true },
                    { text: "Interactive property map", included: true },
                    { text: "Deal comparison scoreboard", included: true },
                    { text: "Shareable client links", included: true },
                  ],
                  cta: "Start Pro",
                  ctaLink: "/workspace/login?upgrade=pro",
                  highlight: true,
                },
                {
                  name: "Pro+",
                  price: "100",
                  period: "/mo",
                  desc: "For power users and teams with high deal flow.",
                  features: [
                    { text: "Up to 200 deals/month", included: true },
                    { text: "Everything in Pro", included: true },
                    { text: "Location Intelligence", included: true },
                    { text: "Advanced exports", included: true },
                    { text: "Priority processing", included: true },
                    { text: "Bulk portfolio uploads", included: true },
                    { text: "White-label shareable links", included: true },
                    { text: "Priority support", included: true },
                  ],
                  cta: "Start Pro+",
                  ctaLink: "/workspace/login?upgrade=pro_plus",
                  highlight: false,
                  bestValue: true,
                },
              ].map(tier => (
                <div key={tier.name} style={{
                  background: "rgba(22,22,31,0.6)", backdropFilter: "blur(10px)",
                  borderRadius: 16, border: tier.highlight ? "1px solid rgba(132,204,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                  padding: "36px 28px", position: "relative", overflow: "hidden",
                  transition: "all 0.25s ease",
                  boxShadow: tier.highlight ? "0 0 40px rgba(132,204,22,0.1)" : "none",
                }}>
                  {tier.highlight && (
                    <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                      Most Popular
                    </div>
                  )}
                  {(tier as any).bestValue && (
                    <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                      Best Value
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: tier.highlight ? "#84CC16" : "#9ca3af", marginBottom: 10 }}>
                    {tier.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>$</span>
                    <span style={{ fontSize: 40, fontWeight: 800, color: "#ffffff", letterSpacing: -1 }}>{tier.price}</span>
                    {tier.period && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{tier.period}</span>}
                  </div>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28, lineHeight: 1.5 }}>{tier.desc}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                    {tier.features.map(f => (
                      <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: f.included ? "#e2e8f0" : "rgba(255,255,255,0.3)" }}>
                        {f.included ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        )}
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>

                  <Link href={tier.ctaLink} style={{
                    display: "block", width: "100%", padding: "12px", textAlign: "center",
                    background: tier.highlight ? "#84CC16" : "rgba(132,204,22,0.12)",
                    color: tier.highlight ? "#0d0d14" : "#84CC16",
                    border: tier.highlight ? "none" : "1px solid rgba(132,204,22,0.3)",
                    borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
                    boxSizing: "border-box", transition: "all 0.2s ease",
                  }}>
                    {tier.cta}
                  </Link>
                </div>
              ))}
            </div>

            {/* Why upgrade to Pro */}
            <div style={{ marginBottom: 60, position: "relative", zIndex: 1 }}>
              <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 30, fontWeight: 800, color: "#ffffff", marginBottom: 8, textAlign: "center", letterSpacing: -0.5 }}>
                Why upgrade to Pro?
              </h2>
              <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, marginBottom: 40, textAlign: "center", maxWidth: 560, margin: "0 auto 40px" }}>
                Free gives you a taste. Pro gives you the full institutional toolkit.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", title: "Side-by-Side Scoring", desc: "Compare every deal in your pipeline on a single scoreboard with AI-generated risk ratings." },
                  { icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", title: "Interactive Property Map", desc: "View your entire portfolio on a map with satellite imagery, market data overlays, and traffic counts." },
                  { icon: "M13 10V3L4 14h7v7l9-11h-7z", title: "AI That Gets Smarter", desc: "Our models learn from every OM you upload. The more you analyze, the more accurate your underwriting becomes." },
                  { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", title: "Full Excel Workbooks", desc: "Download 6-sheet institutional-grade Excel workbooks with inputs, rent roll, operating statement, debt & returns, breakeven, and cap scenarios." },
                ].map(u => (
                  <div key={u.title} style={{
                    background: "rgba(30,30,40,0.6)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px",
                    transition: "all 0.25s ease", backdropFilter: "blur(10px)",
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, background: "rgba(132,204,22,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                      border: "1px solid rgba(132,204,22,0.2)",
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={u.icon} /></svg>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>{u.title}</h3>
                    <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, margin: 0 }}>{u.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 9. FAQ ── */}
          <div id="faq" style={{ maxWidth: 680, margin: "0 auto", padding: "120px 32px 80px" }}>
            {/* Section divider */}
            <div style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />
            <h2 style={{ fontSize: 30, fontWeight: 800, color: "#ffffff", marginBottom: 48, textAlign: "center" }}>
              Frequently asked questions
            </h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { q: "What is Deal Signals?", a: "Deal Signals is an AI-powered CRE underwriting tool that extracts key financial metrics, calculates investment scores, and flags risks from offering memorandums in seconds." },
                { q: "What file types are supported?", a: "PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and plain text. PDF is recommended for best accuracy. Max 50MB." },
                { q: "Is Deal Signals really free?", a: "Yes. 2 analyses/month, no signup. Pro unlocks 40+ monthly analyses plus deep research tools at $40/month." },
                { q: "How accurate is the extraction?", a: "90%+ accuracy on standard CRE metrics. Always review the original document for critical decisions." },
                { q: "What's included in Pro?", a: "Location intelligence, tenant research, comp analysis, deal pipeline, map view, shareable reports, and priority support." },
                { q: "Is my data private?", a: "Yes. Documents are processed in real-time and not stored permanently. No tracking, no account required for free tier." },
              ].map((item, idx) => (
                <div key={idx} style={{ borderBottom: idx < 5 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <button onClick={() => setOpenFaq(openFaq === idx ? null : idx)} style={{
                    width: "100%", padding: "18px 0", background: "transparent",
                    border: "none", textAlign: "left", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#ffffff" }}>{item.q}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === idx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {openFaq === idx && (
                    <div style={{ paddingBottom: 18 }}>
                      <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 10. FINAL CTA ── */}
          <div style={{ background: "#0d0d14", padding: "100px 32px 120px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
            {/* Gradient orb for CTA area */}
            <div style={{ position: "absolute", bottom: -200, left: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(132,204,22,0.08)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ maxWidth: 520, margin: "0 auto", position: "relative", zIndex: 1 }}>
              <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Get started today</p>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", marginBottom: 12, lineHeight: 1.3 }}>
                Try the all-in-one deal analysis tool with AI-powered underwriting
              </h2>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
                <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="ds-btn ds-btn-primary" style={{ fontSize: 15, padding: "14px 36px" }}>
                  Get it Now
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== PROCESSING STATE ===== */}
      {view === "processing" && (
        <section style={{ background: "#faf8ff", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 520, width: "100%", padding: "0 24px" }}>
            <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", padding: "40px 36px" }}>
              {/* Stage progress */}
              <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
                {[
                  { label: "Upload", iconPath: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12", done: statusMsg !== "Uploading files..." },
                  { label: "Extract", iconPath: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", done: !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "Read", iconPath: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", done: statusMsg !== "Reading file contents..." && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "Analyze", iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", done: !statusMsg.includes("Analyzing") && !statusMsg.includes("Reading") && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                  { label: "Generate", iconPath: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", done: statusMsg.includes("Generating") || statusMsg.includes("complete") },
                ].map((stage, i, arr) => {
                  const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                  return (
                    <div key={stage.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", margin: "0 auto 5px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: stage.done ? "#D1FAE5" : isCurrent ? "#FEF2F2" : "#F6F8FB",
                        border: isCurrent ? "2px solid #DC2626" : "2px solid transparent",
                        animation: isCurrent ? "pulse 1.5s ease-in-out infinite" : "none",
                      }}>
                        {stage.done ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isCurrent ? "#DC2626" : "#B4C1D1"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={stage.iconPath} /></svg>
                        )}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: stage.done ? "#059669" : isCurrent ? "#DC2626" : "#B4C1D1", textTransform: "uppercase", letterSpacing: 0.3 }}>
                        {stage.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#0B1120", margin: "0 0 4px" }}>{statusMsg}</p>
                <p style={{ fontSize: 12, color: "#8899B0", margin: 0 }}>
                  {statusMsg.includes("Analyzing") ? "AI is extracting property data and calculating underwriting (30–60s)" :
                   statusMsg.includes("Reading") ? "Extracting text from your document (5–15s)" :
                   statusMsg.includes("image") ? "Capturing property image from PDF (5s)" :
                   statusMsg.includes("Generating") ? "Creating output files (5s)" :
                   "Processing your files..."}
                </p>
              </div>
              {selectedFile && (
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F6F8FB", borderRadius: 8, fontSize: 12 }}>
                  <span style={{ padding: "1px 5px", background: "#EDF0F5", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase" }}>
                    {selectedFile.name.split(".").pop()}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5A7091" }}>{selectedFile.name}</span>
                  <span style={{ color: "#059669", fontSize: 13, flexShrink: 0 }}>✓</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===== RESULT STATE ===== */}
      {view === "result" && data && (
        <section style={{ padding: "24px 0 60px", background: "#faf8ff" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
            <PropertyOutput data={data} heroImageUrl={heroImageUrl} />
            <ProUpsell />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={resetAnalyzer} style={{
                padding: "12px 28px", background: "#16161f", border: "1.5px solid rgba(227, 190, 189, 0.2)",
                borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#9ca3af", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                &larr; Analyze Another OM
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===== FOOTER ===== */}
      <footer style={{
        background: "rgba(22,22,31,0.2)", padding: "48px 32px 32px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
          <div>
            <DealSignalLogo size={24} fontSize={15} gap={7} />
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, marginTop: 14, maxWidth: 260 }}>
              Analyze CRE deals with AI-powered intelligence. Get real signals, not guesses.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 16 }}>Product</div>
            {[
              { label: "How it works", href: "/#how-it-works" },
              { label: "Features", href: "/#features" },
              { label: "Pricing", href: "/#pricing" },
              { label: "FAQ", href: "/#faq" },
            ].map(link => (
              <Link key={link.label} href={link.href} style={{
                display: "block", fontSize: 14, color: "#6b7280", textDecoration: "none", marginBottom: 10,
              }}>{link.label}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 16 }}>Legal</div>
            {[
              { label: "Contact", href: "mailto:support@dealsignals.app" },
              { label: "Terms of Use", href: "/terms" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Login", href: "/workspace/login" },
            ].map(link => (
              <Link key={link.label} href={link.href} style={{
                display: "block", fontSize: 14, color: "#6b7280", textDecoration: "none", marginBottom: 10,
              }}>{link.label}</Link>
            ))}
          </div>
        </div>
        <div style={{
          maxWidth: 1100, margin: "0 auto", paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ fontSize: 13, color: "#4b5563" }}>
            Copyright &copy; 2026 Deal Signals - All rights reserved
          </span>
        </div>
      </footer>
    </div>
  );
}


/* ===========================================================================
   PROPERTY OUTPUT — IDENTICAL to pro workspace/properties/[id]/page.tsx
   Uses flat API data (d.fieldName) instead of gf(fields, group, name)
   Same rendering, same sections, same order.
   =========================================================================== */

/* ===========================================================================
   DEAL SCORE RING — SVG circular score gauge
   =========================================================================== */
function DealScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);
  const color = score >= 70 ? "#059669" : score >= 50 ? "#C49A3C" : "#84CC16";
  const bgColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const sentiment = score >= 80 ? "BULLISH" : score >= 60 ? "NEUTRAL" : "BEARISH";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 130, height: 130 }}>
        <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(227, 190, 189, 0.15)" strokeWidth={stroke} />
          <circle cx="65" cy="65" r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#151b2b", lineHeight: 1, letterSpacing: -1 }}>{score}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{sentiment}</span>
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
    </div>
  );
}

/* Compute a numeric deal score from signal data */
function computeDealScore(d: any): number {
  const signals = d.signals || {};
  let total = 0, count = 0;
  const keys = ["cap_rate", "dscr", "occupancy", "basis", "tenant_quality", "rollover_risk"];
  for (const k of keys) {
    const val = String(signals[k] || "");
    if (val.includes("🟢") || val.toLowerCase().includes("green")) { total += 90; count++; }
    else if (val.includes("🟡") || val.toLowerCase().includes("yellow")) { total += 60; count++; }
    else if (val.includes("🔴") || val.toLowerCase().includes("red")) { total += 30; count++; }
  }
  if (count === 0) {
    // Fallback: estimate from financial metrics
    const cap = Number(d.capRateOm) || 0;
    const dscr = Number(d.dscrOm) || 0;
    const occ = Number(d.occupancyPct) || 0;
    let fallback = 50;
    if (cap >= 5 && cap <= 7) fallback += 10;
    if (dscr >= 1.35) fallback += 10;
    if (occ >= 90) fallback += 10;
    return Math.min(99, Math.max(10, fallback));
  }
  return Math.round(total / count);
}

function PropertyOutput({ data: d, heroImageUrl }: { data: AnalysisData; heroImageUrl?: string }) {
  const location = [d.address, d.city, d.state].filter(Boolean).join(", ");
  const encodedAddress = encodeURIComponent(location || d.propertyName);
  const recommendation = typeof d.signals?.recommendation === "string" ? d.signals.recommendation : d.signals?.recommendation?.text ? String(d.signals.recommendation.text) : String(d.signals?.recommendation || "");
  const brief = typeof d.brief === "string" ? d.brief : Array.isArray(d.brief) ? d.brief.join("\n") : String(d.brief || "");
  const tenants = d.tenants || [];
  const dealScore = d.proScore?.totalScore || computeDealScore(d);
  const scoreBand = d.proScore?.scoreBand || (dealScore >= 70 ? "buy" : dealScore >= 50 ? "hold" : "pass");
  const scoreRecommendation = d.proScore?.recommendation || "";
  const scoreCategories = d.proScore?.categories || [];
  const detectedType = d.analysisType || d.assetType || "retail";

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
      {/* ===== HERO SECTION — Property Info + Deal Score ===== */}
      <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, padding: "28px 28px 20px" }}>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 700, color: "#151b2b", margin: 0, lineHeight: 1.2 }}>{d.propertyName}</h1>
            {location && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>{location}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[
                    { label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` },
                    { label: "Google Earth", url: `https://earth.google.com/web/search/${encodedAddress}/` },
                  ].map(link => (
                    <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                      padding: "4px 10px", background: "#f2f3ff", borderRadius: 6,
                      fontSize: 11, color: "#9ca3af", textDecoration: "none", fontWeight: 500,
                    }}>{link.label} &rarr;</a>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              {[
                { label: "Type", value: d.assetType },
                { label: "Built", value: d.yearBuilt },
                { label: "Tenants", value: d.tenantCount },
                { label: "WALE", value: d.wale ? `${d.wale} yrs` : null },
                { label: "Traffic", value: d.traffic },
              ].filter((x) => x.value).map((x) => (
                <div key={x.label}>
                  <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{x.label}</div>
                  <div style={{ fontSize: 12, color: "#151b2b", marginTop: 1, fontWeight: 500 }}>{x.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Deal Score Ring */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 28px" }}>
            <DealScoreRing score={dealScore} label="Deal Score" />
          </div>
          <PropertyImage heroImageUrl={heroImageUrl} location={location} encodedAddress={encodedAddress} propertyName={d.propertyName} />
        </div>
      </div>

      {/* ===== METRIC CARDS — Grid layout ===== */}
      {heroStats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {heroStats.map(s => (
            <div key={s.label} style={{
              background: "#ffffff", borderRadius: 6, padding: "16px 18px",
              boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
            }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#84CC16", letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ===== DISCLAIMER ===== */}
      <p style={{ fontSize: 10, color: "#B4C1D1", margin: "0 0 16px", fontStyle: "italic", textAlign: "center" }}>
        First-pass underwriting screen &middot; Directional only &middot; Verify all data independently
      </p>

      {/* ===== RECOMMENDATION BANNER ===== */}
      {recommendation && (
        <div style={{
          padding: "14px 20px", borderRadius: 6, marginBottom: 16,
          background: recommendation.includes("🟢") ? "linear-gradient(135deg, #D1FAE5, #ECFDF5)" : recommendation.includes("🔴") ? "linear-gradient(135deg, #FDE8EA, #FFF1F2)" : "linear-gradient(135deg, #FFFBF0, #FEF3C7)",
          color: recommendation.includes("🟢") ? "#065F46" : recommendation.includes("🔴") ? "#991B1B" : "#78350F",
          fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
        }}>
          <span style={{ fontSize: 20 }}>{recommendation.includes("🟢") ? "🟢" : recommendation.includes("🔴") ? "🔴" : "🟡"}</span>
          <span>{recommendation.replace(/🟢|🟡|🔴/g, "").trim()}</span>
        </div>
      )}

      {/* ===== SCORE BREAKDOWN — from Pro scoring model ===== */}
      {scoreCategories.length > 0 && (
        <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "#151b2b", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <span style={{ width: 3, height: 20, background: "#84CC16", borderRadius: 2 }} />
              Deal Signals Score Breakdown
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#8899B0", textTransform: "uppercase", letterSpacing: 0.5 }}>{detectedType} model</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 4, letterSpacing: 0.5,
                background: scoreBand === "strong_buy" || scoreBand === "buy" ? "rgba(5,150,105,0.1)" : scoreBand === "hold" ? "rgba(196,154,60,0.1)" : "rgba(132,204,22,0.1)",
                color: scoreBand === "strong_buy" || scoreBand === "buy" ? "#059669" : scoreBand === "hold" ? "#C49A3C" : "#84CC16",
                textTransform: "uppercase",
              }}>{scoreBand === "hold" ? "neutral" : scoreBand.replace("_", " ")}</span>
            </div>
          </div>
          {scoreRecommendation && (
            <p style={{ fontSize: 13, color: "#3B4C68", lineHeight: 1.6, margin: "0 0 16px", padding: "12px 16px", background: "#f8f9fb", borderRadius: 8 }}>
              {scoreRecommendation}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {scoreCategories.map((cat: any) => {
              const barColor = cat.score >= 70 ? "#059669" : cat.score >= 50 ? "#C49A3C" : "#84CC16";
              return (
                <div key={cat.name} style={{ padding: "10px 14px", background: "#f8f9fb", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#151b2b", textTransform: "capitalize" }}>{cat.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: barColor }}>{cat.score}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${cat.score}%`, height: "100%", background: barColor, borderRadius: 2, animation: "barGrow 0.8s ease-out" }} />
                  </div>
                  {cat.explanation && (
                    <div style={{ fontSize: 10, color: "#8899B0", marginTop: 3 }}>{cat.explanation}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== BRIEF / INITIAL ASSESSMENT ===== */}
      {brief && (
        <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", color: "#151b2b", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <span style={{ width: 3, height: 20, background: "#84CC16", borderRadius: 2 }} />
            Initial Assessment
          </h2>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 14px" }}>AI-generated first-pass analysis based on uploaded documents</p>
          <div style={{ fontSize: 14, color: "#151b2b", lineHeight: 1.8 }}>
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
            <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "#f2f3ff", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#151b2b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Key Metrics</h3>
              </div>
              {metrics.map(([label, val, tooltip], i) => (
                <div key={String(label)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px",
                  background: i % 2 === 1 ? "#f2f3ff" : "transparent",
                }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 5 }}>
                    {String(label)}
                    {tooltip && <MetricTooltip text={String(tooltip)} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#151b2b", fontVariantNumeric: "tabular-nums" }}>{String(val)}</span>
                </div>
              ))}
            </div>
          )}
          {signals.length > 0 && (
            <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "#f2f3ff", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#151b2b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Signal Assessment</h3>
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
                    padding: "12px 18px",
                    background: bgColor, borderLeft, display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#151b2b", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
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
        <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 18px", background: "#f2f3ff" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#151b2b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Tenant Summary</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 16px", textAlign: "left", fontWeight: 600, color: "#9ca3af" }}>Tenant</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#9ca3af" }}>SF</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#9ca3af" }}>Annual Rent</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9ca3af" }}>Type</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9ca3af" }}>Lease End</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9ca3af" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={i} style={{ background: i % 2 === 1 ? "#f2f3ff" : "transparent" }}>
                  <td style={{ padding: "6px 16px", fontWeight: 600, color: "#151b2b" }}>{t.name}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt$(t.rent)}</td>
                  <td style={{ padding: "6px 12px", color: "#9ca3af" }}>{t.type || "--"}</td>
                  <td style={{ padding: "6px 12px", color: "#9ca3af" }}>{t.end || "--"}</td>
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
        <div style={{ background: "#ffffff", borderRadius: 6, boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)", padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#151b2b" }}>Download Assets{d.propertyName ? ` — ${d.propertyName}` : ""}</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="dl-btn" onClick={() => downloadLiteXLSX(d)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "#f2f3ff", border: "none", borderRadius: 6,
              color: "#151b2b", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(21, 27, 43, 0.04)",
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
              background: "#f2f3ff", border: "none", borderRadius: 6,
              color: "#151b2b", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(21, 27, 43, 0.04)",
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

    </div>
  );
}


/* ===========================================================================
   PRO UPSELL — Conversion component
   =========================================================================== */
function ProUpsell() {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0B1120 0%, #151b2b 50%, #1e2740 100%)",
      borderRadius: 16, padding: "48px 40px", margin: "32px 0 16px",
      boxShadow: "0 32px 64px rgba(11,17,32,0.25)", position: "relative", overflow: "hidden",
    }}>
      {/* Accent glow */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(132,204,22,0.2) 0%, transparent 70%)", filter: "blur(40px)" }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", background: "rgba(132,204,22,0.15)", borderRadius: 20, border: "1px solid rgba(132,204,22,0.25)", marginBottom: 20 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.5 }}>Free Pro Trial</span>
        </div>

        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 10, lineHeight: 1.2, letterSpacing: -0.5 }}>
          Do this across your <em style={{ fontStyle: "italic", background: "linear-gradient(135deg, #f87171, #84CC16)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>entire pipeline</em>
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 28, maxWidth: 520 }}>
          You just saw what Deal Signals can do with one OM. Now imagine it across every deal you touch &mdash; saved, scored, and compared side by side.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
          {[
            { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", text: "40 deals/month on Pro" },
            { icon: "M22 12h-4l-3 9L9 3l-3 9H2", text: "AI scoring & risk ratings" },
            { icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", text: "Interactive property map" },
            { icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", text: "6-sheet Excel workbooks" },
            { icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", text: "Saved history & archives" },
            { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0", text: "Shareable client links" },
          ].map(f => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={f.icon} /></svg>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href="/workspace/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "14px 32px", background: "linear-gradient(135deg, #84CC16, #a8d600)",
            color: "#0d0d14", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700,
            textDecoration: "none", cursor: "pointer",
          }}>
            Start Free Pro Trial
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              No credit card required &middot; 2 free analyses
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              Then $40/mo for Pro &middot; $100/mo for Pro+
            </span>
          </div>
        </div>
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
${(typeof d.brief === "string" ? d.brief : Array.isArray(d.brief) ? d.brief.join("\n") : String(d.brief || "No assessment available.")).split("\n").map((p: string) => p.trim() ? `<p>${p}</p>` : "").join("")}

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

<p class="footer">Generated by Deal Signals &mdash; dealsignals.app</p>
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${pName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-")}-First-Pass-Brief.doc`;
  a.click(); URL.revokeObjectURL(url);
}
