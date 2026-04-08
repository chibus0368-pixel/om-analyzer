"use client";
/* OM Analyzer Lite — v3 with smart hero image extraction (skips tables) */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { extractHeroImageFromPDF } from "@/lib/workspace/image-extractor";

import DealSignalNav from "@/components/DealSignalNav";

/* ===========================================================================
   INTERSECTION OBSERVER HOOK — SCROLL TRIGGER
   =========================================================================== */
function useInView(threshold = 0.2): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

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
   FEATURE BLOCK WRAPPER — ANIMATES ON SCROLL
   =========================================================================== */
function FeatureBlock({ children, idx }: { children: React.ReactNode; idx: number }) {
  const [ref, inView] = useInView(0.15);
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transition: 'opacity 0.3s ease' }}>
      <div className={inView ? 'ds-feature-animate' : 'ds-feature-hidden'}>
        {children}
      </div>
    </div>
  );
}

/* ===========================================================================
   SCROLL REVEAL WRAPPER — GENERIC SCROLL-TRIGGER ANIMATION
   =========================================================================== */
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, inView] = useInView(0.15);
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.5s ease-out ${delay}s, transform 0.5s ease-out ${delay}s`,
    }}>
      {children}
    </div>
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
  const [processingPct, setProcessingPct] = useState(0);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
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

  // Safety: auto-dismiss drag overlay after 3s to prevent stuck state
  useEffect(() => {
    if (!globalDragging) return;
    const timeout = setTimeout(() => { dragCounter.current = 0; setGlobalDragging(false); }, 3000);
    return () => clearTimeout(timeout);
  }, [globalDragging]);

  // Processing percentage animation + rotating status messages
  useEffect(() => {
    if (view !== "processing") { setProcessingPct(0); setProcessingMsgIdx(0); return; }
    const start = Date.now();
    const duration = 50000; // 50 seconds to reach ~95%
    const tick = () => {
      const elapsed = Date.now() - start;
      const linear = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - linear, 3);
      const pct = Math.min(Math.round(eased * 95), 95);
      setProcessingPct(pct);
      if (linear < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const msgInterval = setInterval(() => setProcessingMsgIdx(i => (i + 1) % 7), 3000);
    return () => clearInterval(msgInterval);
  }, [view]);

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
      onDragLeave={e => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setGlobalDragging(false); } }}
      onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); setDragging(false); if (view === "upload" && e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
    >
      {/* Global drag overlay */}
      {globalDragging && (
        <div
          onDragOver={e => e.preventDefault()}
          onDragLeave={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); }}
          onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); setDragging(false); if (view === "upload" && e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
          style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(13,13,20,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
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
            <div style={{ fontSize: 14, color: "#9ca3af" }}>PDF, Word, or Excel. We&apos;ll analyze it instantly</div>
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
        @keyframes scanDown { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(400px); opacity: 0; } }
        @keyframes progressFill { from { width: 0; } to { width: 100%; } }
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

        /* Feature block scroll-trigger animation classes */
        .ds-feature-hidden * { animation-play-state: paused !important; opacity: 0; }
        .ds-feature-animate { animation: fadeInUp 0.5s ease-out both; }
        .ds-feature-animate * { animation-play-state: running; }

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
          bottom: -12px;
          left: 15%;
          width: 70%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M4 14 Q100 -2 196 14' stroke='%2384CC16' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
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
          bottom: -12px;
          left: 15%;
          width: 70%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M4 14 Q100 -2 196 14' stroke='%234D7C0F' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
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
          .ds-why-grid { grid-template-columns: 1fr !important; }
          .ds-faq-grid { grid-template-columns: 1fr !important; }
          .ds-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
          .ds-nav-links { display: none !important; }
          .ds-pro-features { grid-template-columns: 1fr 1fr !important; }
          .ds-workflow-steps { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-process-strip { transform: scale(0.85); transform-origin: left center; }
          .ds-om-outputs { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-cards { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-header { text-align: center; justify-content: center !important; }
          .ds-feature-block { flex-direction: column !important; gap: 32px !important; }
          .ds-secondary-features { grid-template-columns: repeat(2, 1fr) !important; }
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
              You&apos;ve analyzed 2 deals. Ready to move faster?
            </h3>
            <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 24px" }}>
              Upgrade to Pro and keep the speed advantage. Unlimited saves, full Excel workbooks, deal comparison, and your own DealBoard.
            </p>
            <Link href="/workspace/login?upgrade=pro" style={{
              display: "inline-block", padding: "14px 36px",
              background: "linear-gradient(135deg, #84CC16, #a8d600)", color: "#0d0d14",
              borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
              marginBottom: 8,
            }}>
              Upgrade to Pro - $40/mo
            </Link>
            <Link href="/om-analyzer#pricing" style={{
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
            <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 28 }} />
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
              style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.08 }}
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
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center",
              position: "relative", zIndex: 1,
            }}>
              {/* Left */}
              <div className="ds-hero-left" style={{ animation: "fadeInUp 0.5s ease-out" }}>

                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#84CC16",
                  textTransform: "uppercase" as const, letterSpacing: 2,
                  marginBottom: 16,
                }}>
                  Commercial Real Estate
                </div>

                <h1 style={{
                  fontSize: 56, fontWeight: 800, color: "#ffffff", lineHeight: 1.1,
                  marginBottom: 20, letterSpacing: -1.5,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Move Faster Than<br />the Market on<br /><span className="ds-callout">Every Deal</span>.
                </h1>
                <p style={{
                  fontSize: 19, color: "#9ca3af", lineHeight: 1.7,
                  maxWidth: 500, marginBottom: 36,
                }}>
                  DealSignals turns deals and OMs into actionable investment insight, powering faster pre-diligence decisions.
                </p>
                <p style={{
                  fontSize: 14, color: "#84CC16", fontWeight: 600, letterSpacing: 0.2,
                  marginBottom: 0, marginTop: 0,
                }}>
                  Decide before others even open Excel.
                </p>
              </div>

              {/* Right — upload column */}
              <div style={{ animation: "fadeInUp 0.5s ease-out 0.1s both", marginTop: -40 }}>
                {/* "Try now" label */}
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                    Pre-Diligence Analysis
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#84CC16", letterSpacing: 0.5 }}>
                    Try now - two deals free
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
                        {dragging ? "Drop your file here" : "Upload a deal"}
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
                        Get Deal Signal
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

          {/* ── TRUST BAR ── */}
          <div style={{ padding: "20px 32px", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ padding: "16px 32px", background: "rgba(132,204,22,0.03)", border: "1px solid rgba(132,204,22,0.06)", borderRadius: 12, display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
              {[
                "Built for real-world acquisition workflows",
                "90%+ extraction accuracy on standard CRE metrics",
                "Pre-diligence in seconds, not hours",
              ].map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 2. WHY DEALSIGNALS ── */}
          <div id="how-it-works" style={{ padding: "120px 32px 100px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Subtle background depth */}
            <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, borderRadius: "50%", background: "rgba(132,204,22,0.03)", filter: "blur(180px)", pointerEvents: "none" }} />

            <div style={{ maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>

              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 72 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", padding: "6px 16px",
                  borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16",
                  fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6,
                  letterSpacing: 0.5, textTransform: "uppercase" as const,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Why DealSignals
                </div>
                <h2 style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Stop reading OMs.<br />Start <span className="ds-callout">making decisions</span>.
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 600, margin: "0 auto" }}>
                  You don&apos;t need another tool. You need a faster way to filter deals, get a second opinion, and focus your time on what actually pencils.
                </p>
              </div>

              {/* Three value prop cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 80 }} className="ds-why-grid">
                {[
                  {
                    icon: "M13 10V3L4 14h7v7l9-11h-7z",
                    headline: "Pre-diligence in seconds",
                    subline: "Not hours. Not days.",
                    body: "Every deal you touch gets scored, extracted, and summarized before you finish reading the first page of the OM. Know if it's worth pursuing in under 60 seconds.",
                    stat: "< 60s",
                    statLabel: "avg. time to signal",
                  },
                  {
                    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                    headline: "A second opinion in minutes",
                    subline: "Built on real CRE logic.",
                    body: "DealSignals isn't guessing. It scores across 6 investment dimensions: pricing, cashflow, tenant quality, rollover risk, location, and upside. A standardized lens on every deal.",
                    stat: "6",
                    statLabel: "scoring dimensions",
                  },
                  {
                    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
                    headline: "Focus your time where it counts",
                    subline: "Filter. Compare. Decide.",
                    body: "Stop spending hours on deals that don't pencil. Upload your pipeline, score everything, and put your energy into the deals that actually matter.",
                    stat: "100+",
                    statLabel: "deals / month on Pro",
                  },
                ].map((card, i) => (
                  <ScrollReveal key={card.headline} delay={0.1 + i * 0.15}>
                    <div style={{
                      background: "rgba(22,26,35,0.6)", borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.06)", padding: "36px 28px",
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Glow accent */}
                      <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(132,204,22,0.04)", filter: "blur(40px)", pointerEvents: "none" }} />

                      {/* Icon */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                      }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={card.icon} /></svg>
                      </div>

                      {/* Stat callout */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
                        <span style={{ fontSize: 32, fontWeight: 800, color: "#84CC16", lineHeight: 1, letterSpacing: -1 }}>{card.stat}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(132,204,22,0.6)" }}>{card.statLabel}</span>
                      </div>

                      {/* Copy */}
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", marginBottom: 4, lineHeight: 1.3 }}>{card.headline}</h3>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#84CC16", marginBottom: 12 }}>{card.subline}</p>
                      <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{card.body}</p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>

              {/* Bottom positioning statement - prominent manifesto block */}
              <div style={{
                textAlign: "center", padding: "64px 40px",
                borderRadius: 20, border: "1px solid rgba(132,204,22,0.12)",
                background: "linear-gradient(135deg, rgba(132,204,22,0.04) 0%, rgba(20,20,30,0.8) 50%, rgba(132,204,22,0.03) 100%)",
                position: "relative", overflow: "hidden",
              }}>
                {/* Subtle glow behind */}
                <div style={{ position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, borderRadius: "50%", background: "rgba(132,204,22,0.06)", filter: "blur(100px)", pointerEvents: "none" }} />

                <h3 style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", marginBottom: 32, fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative", letterSpacing: -0.5 }}>
                  Stop reading OMs. Start reading <span style={{ color: "#84CC16" }}>signals</span>.
                </h3>

                <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap", marginBottom: 40, position: "relative" }}>
                  {[
                    { label: "A deal filtering engine", icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" },
                    { label: "A speed advantage tool", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
                    { label: "A pre-diligence system", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 22px", borderRadius: 12,
                      background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.12)",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>{item.label}</span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 18, color: "#d1d5db", lineHeight: 1.8, maxWidth: 600, margin: "0 auto", position: "relative", fontWeight: 500 }}>
                  Everything on DealSignals is built to help you move faster than the market.<br />
                  <span style={{ color: "#84CC16", fontWeight: 700 }}>Upload a deal. Get a signal. Decide in minutes, not days.</span>
                </p>
              </div>

            </div>
          </div>

          {/* testimonials section removed */}

          {/* ── 6. FEATURES — PRODUCT STORY ── */}
          <div id="features" style={{ padding: "120px 32px 80px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Background depth */}
            <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: "rgba(132,204,22,0.05)", filter: "blur(160px)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -150, left: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.03)", filter: "blur(140px)", pointerEvents: "none" }} />
            {/* Subtle city skyline silhouette at bottom */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 220, pointerEvents: "none", opacity: 0.04 }}>
              <svg width="100%" height="100%" viewBox="0 0 1200 220" preserveAspectRatio="none" fill="#84CC16">
                <path d="M0 220 V180 H30 V140 H50 V180 H70 V120 H80 V100 H90 V120 H110 V160 H130 V130 H140 V90 H150 V60 H160 V90 H170 V130 H190 V180 H220 V150 H240 V110 H250 V80 H260 V50 H270 V80 H280 V110 H300 V160 H330 V180 H360 V140 H370 V100 H380 V70 H390 V40 H400 V70 H410 V100 H420 V140 H450 V170 H480 V130 H500 V90 H510 V60 H520 V30 H530 V60 H540 V90 H560 V150 H590 V180 H620 V140 H640 V100 H650 V70 H660 V100 H670 V140 H700 V170 H730 V120 H750 V80 H760 V50 H770 V80 H780 V120 H810 V160 H840 V130 H860 V90 H870 V55 H880 V90 H890 V130 H920 V170 H950 V140 H970 V100 H980 V70 H990 V45 H1000 V70 H1010 V100 H1030 V150 H1060 V180 H1090 V140 H1110 V110 H1120 V80 H1130 V110 H1140 V140 H1170 V180 H1200 V220 Z" />
              </svg>
            </div>

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>

              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 64 }}>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 16px", borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16", fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  How It Works
                </div>
                <h2 style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Eight Steps to <span className="ds-callout">Deal Clarity</span>.
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 580, margin: "0 auto" }}>
                  Upload a deal. Get scored, organized, shareable pre-diligence back in seconds.
                </p>
              </div>

              {/* ── Feature blocks: alternating left/right ── */}
              {[
                {
                  num: "01", title: "Extract 40+ Fields", desc: "Upload an OM, flyer, rent roll, or broker package and watch 40+ fields populate in under a minute. Price, cap rate, NOI, tenant, lease terms, and more. Add multiple documents to the same deal and data coalesces automatically.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, padding: "24px 28px", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                      {/* Scan line animation overlay */}
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #84CC16, transparent)", animation: "scanDown 2.5s ease-in-out both", zIndex: 2 }} />

                      {/* File header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, animation: "fadeInUp 0.3s ease-out 0s both" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Walgreens_OM_2026.pdf</div>
                          <div style={{ fontSize: 9, color: "#6b7280" }}>2.4 MB · Processing...</div>
                        </div>
                        <div style={{ padding: "4px 10px", borderRadius: 50, background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.2)" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#84CC16", animation: "pulse 1.5s ease-in-out both" }}>EXTRACTING</span>
                        </div>
                      </div>

                      {/* Divider with progress */}
                      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0 14px", position: "relative" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", background: "linear-gradient(90deg, #84CC16, rgba(132,204,22,0.3))", animation: "progressFill 2s ease-out forwards" }} />
                      </div>

                      {/* Animated fields dropping in */}
                      {[
                        { label: "Property Name", value: "Walgreens NNN - Cedar Park", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", delay: "0.1s" },
                        { label: "Purchase Price", value: "$7,050,000", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", delay: "0.25s" },
                        { label: "Cap Rate", value: "5.85%", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", delay: "0.4s" },
                        { label: "Net Operating Income", value: "$412,425", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", delay: "0.55s" },
                        { label: "Tenant", value: "Walgreens Co. (Investment Grade)", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", delay: "0.7s" },
                        { label: "Lease Expiry", value: "Nov 2038 (12.6 yrs remaining)", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", delay: "0.85s" },
                        { label: "Building Size", value: "14,820 SF", icon: "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4", delay: "1.0s" },
                      ].map(f => (
                        <div key={f.label} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4,
                          borderRadius: 8, background: "rgba(255,255,255,0.02)",
                          animation: `fadeInUp 0.35s ease-out ${f.delay} both`,
                          border: "1px solid rgba(255,255,255,0.03)",
                        }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(132,204,22,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 600, marginBottom: 1 }}>{f.label}</div>
                            <div style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{f.value}</div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" style={{ flexShrink: 0, opacity: 0.6 }}><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#84CC16", fontWeight: 600, animation: "fadeInUp 0.3s ease-out 1.2s both" }}>40+ fields extracted in 8 seconds</div>
                    </div>
                  ),
                },
                {
                  num: "02", title: "Get a Buy/Pass Signal", desc: "Get a buy/hold/pass signal with risk tags before you spend time on full underwriting.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, padding: "28px", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                      {/* Subtle glow behind score */}
                      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 200, height: 200, borderRadius: "50%", background: "rgba(132,204,22,0.08)", filter: "blur(60px)", pointerEvents: "none" }} />

                      {/* Score ring with animated pulse */}
                      <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 20 }}>
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <div style={{ width: 96, height: 96, borderRadius: "50%", border: "4px solid #84CC16", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(132,204,22,0.2), inset 0 0 20px rgba(132,204,22,0.05)", animation: "pulse 2.5s ease-in-out both" }}>
                            <div>
                              <span style={{ fontSize: 36, fontWeight: 800, color: "#84CC16", lineHeight: 1 }}>74</span>
                              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(132,204,22,0.6)", letterSpacing: 1, marginTop: 2 }}>/ 100</div>
                            </div>
                          </div>
                          {/* BUY badge */}
                          <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", padding: "3px 14px", borderRadius: 50, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 800, letterSpacing: 1, whiteSpace: "nowrap" as const }}>BUY SIGNAL</div>
                        </div>
                      </div>

                      {/* Animated callout cards */}
                      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 28 }}>
                        {[
                          { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z", label: "Strong Location", detail: "High-traffic retail corridor", color: "#84CC16", delay: "0.2s" },
                          { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Investment Grade Tenant", detail: "Walgreens (S&P: BBB)", color: "#84CC16", delay: "0.4s" },
                          { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Below Market Rents", detail: "12% upside at renewal", color: "#D97706", delay: "0.6s" },
                          { icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", label: "Rollover Risk", detail: "Lease expires in 18 months", color: "#ef4444", delay: "0.8s" },
                          { icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", label: "Moderate DSCR", detail: "1.42x - meets threshold", color: "#D97706", delay: "1.0s" },
                        ].map(c => (
                          <div key={c.label} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                            borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.color}20`,
                            animation: `fadeInUp 0.4s ease-out ${c.delay} both`,
                          }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}12`, border: `1px solid ${c.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.label}</div>
                              <div style={{ fontSize: 10, color: "#6b7280" }}>{c.detail}</div>
                            </div>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0, boxShadow: `0 0 8px ${c.color}40` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                },
                {
                  num: "03", title: "Score Every Deal", desc: "Six investment dimensions scored automatically: pricing, cashflow, tenant quality, rollover risk, location, and upside potential.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Scoreboard header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Deal Scoreboard</span>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>Sorted by Score ↓</span>
                      </div>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Property</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Score</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Signal</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Cap</span>
                      </div>
                      {/* Animated rows */}
                      {[
                        { name: "Walgreens NNN", loc: "Cedar Park, TX", score: 74, signal: "BUY", signalColor: "#84CC16", cap: "5.85%", delay: "0.15s" },
                        { name: "CVS Pharmacy", loc: "Plano, TX", score: 71, signal: "BUY", signalColor: "#84CC16", cap: "5.40%", delay: "0.3s" },
                        { name: "Autozone NNN", loc: "Round Rock, TX", score: 68, signal: "HOLD", signalColor: "#D97706", cap: "6.25%", delay: "0.45s" },
                        { name: "Dollar General", loc: "Lawrenceville, GA", score: 61, signal: "HOLD", signalColor: "#eab308", cap: "6.50%", delay: "0.6s" },
                        { name: "O'Reilly Auto NNN", loc: "Pflugerville, TX", score: 48, signal: "PASS", signalColor: "#ef4444", cap: "7.80%", delay: "0.75s" },
                      ].map((row, i) => (
                        <div key={row.name} style={{
                          display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "10px 20px", alignItems: "center",
                          borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none",
                          animation: `fadeInUp 0.35s ease-out ${row.delay} both`,
                          background: i === 0 ? "rgba(132,204,22,0.03)" : "transparent",
                        }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{row.name}</div>
                            <div style={{ fontSize: 9, color: "#6b7280" }}>{row.loc}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: row.signalColor }}>{row.score}</span>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 50, background: `${row.signalColor}14`, color: row.signalColor, border: `1px solid ${row.signalColor}30` }}>{row.signal}</span>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{row.cap}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  num: "04", title: "Export to Excel", desc: "Download a 4-sheet XLS workbook and property brief for reuse in your own underwriting.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Excel tab bar */}
                      <div style={{ display: "flex", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 8px" }}>
                        {["Summary", "Rent Roll", "Operating", "Debt & Returns", "Breakeven", "Cap Scenarios"].map((tab, i) => (
                          <span key={tab} style={{ fontSize: 9, fontWeight: i === 0 ? 700 : 500, padding: "8px 12px", color: i === 0 ? "#84CC16" : "#6b7280", borderBottom: i === 0 ? "2px solid #84CC16" : "2px solid transparent", background: i === 0 ? "rgba(132,204,22,0.04)" : "transparent" }}>{tab}</span>
                        ))}
                      </div>

                      {/* Live spreadsheet area */}
                      <div style={{ padding: "16px 20px" }}>
                        {/* Price input with "editable" highlight */}
                        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(132,204,22,0.25)", background: "rgba(132,204,22,0.03)", animation: "fadeInUp 0.3s ease-out 0.1s both" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#84CC16" }}>Purchase Price</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>$7,050,000</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </div>
                          </div>
                        </div>

                        {/* Calculated fields that react */}
                        {[
                          { label: "Cap Rate (Going-In)", value: "5.85%", sub: "= NOI / Price", delay: "0.25s" },
                          { label: "Net Operating Income", value: "$412,425", sub: "= Gross Revenue - OpEx", delay: "0.4s" },
                          { label: "Cash-on-Cash Return", value: "7.92%", sub: "= Annual CF / Equity", delay: "0.55s" },
                          { label: "DSCR", value: "1.42x", sub: "= NOI / Debt Service", delay: "0.7s" },
                          { label: "IRR (5-Year Hold)", value: "11.4%", sub: "= Projected internal rate", delay: "0.85s" },
                        ].map(r => (
                          <div key={r.label} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)",
                            animation: `fadeInUp 0.3s ease-out ${r.delay} both`,
                          }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>{r.label}</div>
                              <div style={{ fontSize: 8, color: "#4a5568", fontFamily: "monospace" }}>{r.sub}</div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{r.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Download bar */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
                        <div style={{ padding: "6px 16px", borderRadius: 8, background: "#84CC16", color: "#0d0d14", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download .xlsx
                        </div>
                        <span style={{ fontSize: 10, color: "#6b7280" }}>6 sheets · 58 rows · 14 formulas</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "05", title: "Organize Your Pipeline", desc: "Save deals to your DealBoard. Track across clients, strategies, and pipelines. Never lose a deal again.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Asset type tabs */}
                      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
                        {[
                          { label: "Retail NNN", count: 4, active: true },
                          { label: "Multifamily", count: 2, active: false },
                          { label: "Industrial", count: 3, active: false },
                          { label: "Office", count: 1, active: false },
                        ].map(tab => (
                          <div key={tab.label} style={{
                            padding: "10px 14px", fontSize: 10, fontWeight: tab.active ? 700 : 500,
                            color: tab.active ? "#84CC16" : "#6b7280",
                            borderBottom: tab.active ? "2px solid #84CC16" : "2px solid transparent",
                            background: tab.active ? "rgba(132,204,22,0.04)" : "transparent",
                            display: "flex", alignItems: "center", gap: 5,
                          }}>
                            {tab.label}
                            <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 50, background: tab.active ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.06)", color: tab.active ? "#84CC16" : "#6b7280" }}>{tab.count}</span>
                          </div>
                        ))}
                      </div>

                      {/* Retail NNN deals list */}
                      <div style={{ padding: "12px 16px" }}>
                        {[
                          { name: "Walgreens NNN", loc: "Cedar Park, TX", price: "$7.05M", cap: "5.85%", score: 74, color: "#84CC16", delay: "0.15s" },
                          { name: "CVS Pharmacy", loc: "Plano, TX", price: "$5.2M", cap: "5.40%", score: 71, color: "#84CC16", delay: "0.3s" },
                          { name: "Dollar General", loc: "Lawrenceville, GA", price: "$2.8M", cap: "6.50%", score: 61, color: "#eab308", delay: "0.45s" },
                          { name: "7-Eleven NNN", loc: "Frisco, TX", price: "$3.1M", cap: "5.95%", score: 58, color: "#D97706", delay: "0.6s" },
                        ].map((d, i) => (
                          <div key={d.name} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 4,
                            borderRadius: 8, background: i === 0 ? "rgba(132,204,22,0.03)" : "rgba(255,255,255,0.01)",
                            border: i === 0 ? "1px solid rgba(132,204,22,0.12)" : "1px solid rgba(255,255,255,0.03)",
                            animation: `fadeInUp 0.3s ease-out ${d.delay} both`,
                          }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${d.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: d.color, flexShrink: 0 }}>{d.score}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.name}</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{d.loc}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.price}</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{d.cap} cap</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bottom stats */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>4 deals · Avg score: 66</span>
                        <span style={{ fontSize: 9, color: "#84CC16", fontWeight: 600 }}>+ Upload New Deal</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "06", title: "Compare Side-by-Side", desc: "Stack any deal against another on a sortable scoreboard. See which wins on price, cashflow, risk, and signal.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Header with asset type */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Retail NNN Comparison</span>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>3 deals</span>
                      </div>
                      <div style={{ padding: "12px 18px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr", gap: 0, fontSize: 10 }}>
                          <div style={{ padding: "8px 0", fontWeight: 600, color: "#6b7280" }}>Metric</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>Walgreens</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>CVS</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>Dollar Gen.</div>
                          {[
                            { m: "Score", v: ["74", "71", "61"], c: ["#84CC16", "#84CC16", "#eab308"] },
                            { m: "Price", v: ["$7.05M", "$5.2M", "$2.8M"], c: ["#fff", "#fff", "#fff"] },
                            { m: "Cap Rate", v: ["5.85%", "5.40%", "6.50%"], c: ["#fff", "#fff", "#fff"] },
                            { m: "NOI", v: ["$412K", "$281K", "$182K"], c: ["#fff", "#fff", "#fff"] },
                            { m: "DSCR", v: ["1.42x", "1.38x", "1.08x"], c: ["#84CC16", "#84CC16", "#ef4444"] },
                            { m: "Signal", v: ["BUY", "BUY", "HOLD"], c: ["#84CC16", "#84CC16", "#eab308"] },
                          ].map((row, ri) => (
                            <React.Fragment key={row.m}>
                              <div style={{ padding: "7px 0", fontWeight: 600, color: "#6b7280", borderTop: "1px solid rgba(255,255,255,0.04)", animation: `fadeInUp 0.25s ease-out ${0.1 + ri * 0.08}s both` }}>{row.m}</div>
                              {row.v.map((v, i) => (
                                <div key={i} style={{ padding: "7px 4px", fontWeight: 700, color: row.c[i], textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.04)", animation: `fadeInUp 0.25s ease-out ${0.1 + ri * 0.08}s both` }}>{v}</div>
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      {/* Winner callout */}
                      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(132,204,22,0.03)", display: "flex", alignItems: "center", gap: 8, animation: "fadeInUp 0.3s ease-out 0.7s both" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16" }}>Walgreens NNN leads on 5 of 6 metrics</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "07", title: "Map Your Deals", desc: "Every deal pins to a map automatically. Hover to see scores and metrics at a glance. Share the view with clients via a unique link.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Map area - dark themed street map */}
                      <div style={{ height: 220, background: "#141B2D", position: "relative", overflow: "hidden" }}>
                        {/* SVG street map background */}
                        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice">
                          {/* City blocks */}
                          <rect x="20" y="15" width="85" height="55" rx="3" fill="#1a2236" />
                          <rect x="120" y="15" width="110" height="55" rx="3" fill="#1a2236" />
                          <rect x="245" y="15" width="70" height="55" rx="3" fill="#1a2236" />
                          <rect x="330" y="15" width="130" height="55" rx="3" fill="#1c2538" />
                          <rect x="20" y="85" width="85" height="60" rx="3" fill="#1c2538" />
                          <rect x="120" y="85" width="50" height="60" rx="3" fill="#1a2236" />
                          <rect x="185" y="85" width="45" height="60" rx="3" fill="#192133" />
                          <rect x="245" y="85" width="70" height="60" rx="3" fill="#1a2236" />
                          <rect x="330" y="85" width="60" height="60" rx="3" fill="#1a2236" />
                          <rect x="405" y="85" width="55" height="60" rx="3" fill="#1c2538" />
                          <rect x="20" y="160" width="150" height="50" rx="3" fill="#1c2538" />
                          <rect x="185" y="160" width="45" height="50" rx="3" fill="#1a2236" />
                          <rect x="245" y="160" width="130" height="50" rx="3" fill="#192133" />
                          <rect x="390" y="160" width="70" height="50" rx="3" fill="#1a2236" />
                          {/* Major roads */}
                          <line x1="0" y1="80" x2="480" y2="80" stroke="#232d42" strokeWidth="5" />
                          <line x1="0" y1="155" x2="480" y2="155" stroke="#232d42" strokeWidth="5" />
                          <line x1="115" y1="0" x2="115" y2="220" stroke="#232d42" strokeWidth="5" />
                          <line x1="240" y1="0" x2="240" y2="220" stroke="#232d42" strokeWidth="4" />
                          <line x1="325" y1="0" x2="325" y2="220" stroke="#232d42" strokeWidth="4" />
                          {/* Minor roads */}
                          <line x1="180" y1="80" x2="180" y2="220" stroke="#1e2840" strokeWidth="3" />
                          <line x1="395" y1="80" x2="395" y2="220" stroke="#1e2840" strokeWidth="3" />
                          {/* Water feature - small pond/lake */}
                          <ellipse cx="420" cy="38" rx="35" ry="22" fill="#15253d" stroke="#1a3050" strokeWidth="1" />
                          {/* Park/green area */}
                          <rect x="130" y="92" width="35" height="18" rx="9" fill="#1a2e1f" opacity="0.6" />
                          {/* Road center lines */}
                          <line x1="0" y1="80" x2="480" y2="80" stroke="#2a3550" strokeWidth="0.5" strokeDasharray="6 4" />
                          <line x1="0" y1="155" x2="480" y2="155" stroke="#2a3550" strokeWidth="0.5" strokeDasharray="6 4" />
                        </svg>
                        {/* Subtle vignette overlay */}
                        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 50%, rgba(14,17,27,0.5) 100%)" }} />

                        {/* Animated pins dropping in */}
                        {[
                          { left: "25%", top: "30%", score: 74, name: "Walgreens", color: "#84CC16", delay: "0.2s", active: true },
                          { left: "52%", top: "58%", score: 71, name: "CVS", color: "#84CC16", delay: "0.5s", active: false },
                          { left: "70%", top: "35%", score: 61, name: "Dollar Gen.", color: "#eab308", delay: "0.8s", active: false },
                          { left: "38%", top: "72%", score: 58, name: "7-Eleven", color: "#D97706", delay: "1.1s", active: false },
                        ].map((pin, i) => (
                          <div key={i} style={{ position: "absolute", left: pin.left, top: pin.top, transform: "translate(-50%, -50%)", animation: `fadeInUp 0.4s ease-out ${pin.delay} both`, zIndex: pin.active ? 3 : 1 }}>
                            {/* Pulse ring for active */}
                            {pin.active && <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1px solid rgba(132,204,22,0.3)", animation: "pulse 2s ease-in-out both" }} />}
                            <div style={{ width: pin.active ? 30 : 24, height: pin.active ? 30 : 24, borderRadius: "50%", background: pin.active ? pin.color : `${pin.color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: pin.active ? "#0d0d14" : "#fff", boxShadow: `0 0 ${pin.active ? 20 : 8}px ${pin.color}40`, cursor: "pointer" }}>{pin.score}</div>

                            {/* Hover tooltip for active pin */}
                            {pin.active && (
                              <div style={{ position: "absolute", top: -56, left: "50%", transform: "translateX(-50%)", padding: "8px 12px", borderRadius: 8, background: "#1a1a2e", border: "1px solid rgba(132,204,22,0.2)", whiteSpace: "nowrap" as const, animation: "fadeInUp 0.3s ease-out 0.6s both", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>Walgreens NNN</div>
                                <div style={{ fontSize: 9, color: "#6b7280" }}>$7.05M · 5.85% cap · Score: 74</div>
                                <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: "#1a1a2e", borderRight: "1px solid rgba(132,204,22,0.2)", borderBottom: "1px solid rgba(132,204,22,0.2)" }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Share bar */}
                      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#84CC16" }}>Share Map with Client</span>
                        </div>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>4 pins · Retail NNN Board</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "08", title: "Share with Clients", desc: "Generate a clean, branded share link with the partial or full analysis for clients. No login required.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Share link generation */}
                      <div style={{ padding: "20px 24px", animation: "fadeInUp 0.3s ease-out 0.1s both" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Private Share Link</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>dealsignals.app/s/NRC7wA...</span>
                          </div>
                          <div style={{ padding: "10px 16px", borderRadius: 8, background: "#84CC16", color: "#0d0d14", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" as const, animation: "fadeInUp 0.3s ease-out 0.3s both" }}>Copy</div>
                        </div>

                        {/* Access control */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 16, animation: "fadeInUp 0.3s ease-out 0.4s both" }}>
                          {[
                            { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", label: "Password protected", active: true },
                            { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Expires in 7 days", active: true },
                          ].map(opt => (
                            <div key={opt.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.12)" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={opt.icon} /></svg>
                              <span style={{ fontSize: 9, fontWeight: 600, color: "#84CC16" }}>{opt.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Client preview card */}
                      <div style={{ margin: "0 20px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", animation: "fadeInUp 0.4s ease-out 0.6s both" }}>
                        <div style={{ padding: "4px 12px", background: "rgba(132,204,22,0.06)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Client Preview</span>
                        </div>
                        <div style={{ padding: "14px 14px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Walgreens NNN - Cedar Park, TX</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>Retail NNN · 14,820 SF · $7.05M</div>
                            </div>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #84CC16", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#84CC16" }}>74</div>
                          </div>
                          <div style={{ display: "flex", gap: 12 }}>
                            {[{ l: "Cap", v: "5.85%" }, { l: "NOI", v: "$412K" }, { l: "DSCR", v: "1.42x" }].map(m => (
                              <div key={m.l}>
                                <div style={{ fontSize: 8, color: "#6b7280" }}>{m.l}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                },
              ].map((feature, idx) => (
                <FeatureBlock key={feature.num} idx={idx}>
                  <div style={{
                    padding: idx === 0 ? "0 0 96px" : "96px 0",
                    borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <div className="ds-feature-block" style={{
                      display: "flex", gap: 64, alignItems: "center",
                      flexDirection: idx % 2 === 1 ? "row-reverse" as const : "row" as const,
                    }}>
                      {/* Text side */}
                      <div style={{ flex: 1 }}>
                        {/* Bright number circle */}
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: "#84CC16", color: "#0d0d14",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 800, marginBottom: 16,
                          boxShadow: "0 4px 16px rgba(132,204,22,0.25)",
                        }}>
                          {parseInt(feature.num)}
                        </div>

                        {/* Step label */}
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: "rgba(132,204,22,0.85)",
                          textTransform: "uppercase" as const, letterSpacing: 0.7,
                          marginBottom: 12,
                        }}>
                          Step {parseInt(feature.num)} - {feature.title}
                        </div>

                        {/* Title */}
                        <h3 style={{
                          fontSize: 30, fontWeight: 800, color: "#ffffff",
                          marginBottom: 12, lineHeight: 1.25,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}>
                          {feature.desc.split("—")[0].split(".")[0]}.
                        </h3>

                        {/* Description */}
                        <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, margin: 0, maxWidth: 460 }}>
                          {feature.desc}
                        </p>
                      </div>

                      {/* Visual side */}
                      <div style={{ flex: 1, maxWidth: 480 }}>
                        {feature.visual}
                      </div>
                    </div>
                  </div>
                </FeatureBlock>
              ))}

              {/* ── Secondary features row ── */}
              <div style={{ marginTop: 100, padding: "40px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="ds-secondary-features" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
                  {[
                    { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", label: "Bulk Portfolio Uploads" },
                    { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Up to 100 Deals / Month with Pro" },
                    { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", label: "White-Label Sharing (hide DealSignals brand)" },
                    { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Deal History Tracking" },
                  ].map(f => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>{f.label}</span>
                    </div>
                  ))}
                </div>
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
                Start free. Scale as your deal flow grows.
              </h2>
              <p style={{ fontSize: 14, color: "#5A7091", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
                DealSignals turns deals and OMs into actionable investment insight, powering faster pre-diligence decisions.
              </p>
            </div>

            {/* 3-tier pricing grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 60 }}>
              {[
                {
                  name: "Free",
                  price: "0",
                  period: "",
                  desc: "Try DealSignals on real deals.",
                  features: [
                    { text: "2 Deal Analyses", included: true },
                    { text: "Full Deal Signals scoring", included: true },
                    { text: "Full Excel export", included: true },
                    { text: "Save up to 5 deals", included: true },
                    { text: "1 shareable link", included: true },
                    { text: "DealBoard & history", included: false },
                    { text: "Deal comparison", included: false },
                    { text: "Bulk uploads", included: false },
                  ],
                  cta: "Try Your First Deal",
                  ctaLink: "/",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: "40",
                  period: "/mo",
                  desc: "For active investors moving fast on deals.",
                  valueCallout: "Less than $0.50 per deal",
                  features: [
                    { text: "Up to 100 deals/month", included: true },
                    { text: "Unlimited saved deals", included: true },
                    { text: "Deal Signals scoring", included: true },
                    { text: "Full Excel workbooks (6 sheets)", included: true },
                    { text: "DealBoard with history", included: true },
                    { text: "Deal comparison scoreboard", included: true },
                    { text: "Interactive property map", included: true },
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
                  desc: "For high-volume deal flow and serious operators.",
                  valueCallout: "Less than $0.20 per deal",
                  features: [
                    { text: "Up to 500 deals/month", included: true },
                    { text: "Everything in Pro", included: true },
                    { text: "Bulk portfolio uploads", included: true },
                    { text: "Location Intelligence", included: true },
                    { text: "White-label shareable links", included: true },
                    { text: "Priority processing", included: true },
                    { text: "Priority support", included: true },
                  ],
                  cta: "Go Pro+",
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
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: (tier as any).valueCallout ? 10 : 28, lineHeight: 1.5 }}>{tier.desc}</p>
                  {(tier as any).valueCallout && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#84CC16", marginBottom: 20, letterSpacing: 0.3 }}>
                      {(tier as any).valueCallout}
                    </div>
                  )}

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

          </div>

          {/* ── 9. FAQ ── */}
          <div id="faq" style={{ maxWidth: 1100, margin: "0 auto", padding: "120px 32px 80px", position: "relative", zIndex: 2 }}>
            {/* Section divider */}
            <div style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 16px", borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16", fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                FAQ
              </div>
              <h2 style={{ fontSize: 36, fontWeight: 800, color: "#ffffff", marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Questions investors actually ask
              </h2>
              <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
                Everything you need to know about using DealSignals for pre-diligence.
              </p>
            </div>

            {/* Two-column FAQ grid */}
            <div className="ds-faq-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Category: Getting Started */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "0 0 8px", marginBottom: 4 }}>Getting Started</div>

                {[
                  { q: "What exactly does DealSignals do?", a: "DealSignals is a pre-diligence engine for commercial real estate. Upload an OM, rent roll, or broker flyer and get a scored deal brief with extracted financials, risk signals, and a buy/hold/pass recommendation in under 60 seconds." },
                  { q: "Who is this built for?", a: "Active CRE investors, acquisition analysts, and brokers who evaluate multiple deals per week. If you spend time reading OMs and building spreadsheets before deciding whether to pursue a deal, DealSignals gives you that answer faster." },
                  { q: "What file types can I upload?", a: "PDF (recommended for best accuracy), Word (.docx), Excel (.xlsx/.xls), CSV, and plain text files. Maximum file size is 50MB. Multi-page OMs, single-page flyers, and rent rolls all work." },
                  { q: "How accurate is the extraction?", a: "90%+ accuracy on standard CRE metrics like price, cap rate, NOI, tenant name, lease terms, and building size. DealSignals is designed for pre-diligence speed. Always verify against the source document before making final investment decisions." },
                  { q: "Do I need to create an account?", a: "No. Your first 2 deal analyses are completely free with no signup required. We use an anonymous session to track your usage. You only need an account if you upgrade to Pro to save deals and access your DealBoard." },
                ].map((item, i) => {
                  const faqIdx = i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Category: Pricing */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "16px 0 8px", marginBottom: 4 }}>Pricing &amp; Plans</div>

                {[
                  { q: "Is it really free?", a: "Yes. 2 full deal analyses with scoring, risk signals, and Excel export. No credit card, no signup. You see the exact same output that Pro users get." },
                  { q: "What does Pro include?", a: "Pro ($40/month) gives you up to 100 deal analyses per month, unlimited saved deals, full 6-sheet Excel workbooks, DealBoard with deal history, comparison scoreboard, interactive property map, and shareable client links. Less than $0.50 per deal." },
                  { q: "What about Pro+?", a: "Pro+ ($100/month) is for high-volume operators. Up to 500 deals/month plus bulk portfolio uploads, location intelligence, white-label sharing, and priority processing and support. Less than $0.20 per deal." },
                ].map((item, i) => {
                  const faqIdx = 5 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Category: The Product */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "0 0 8px", marginBottom: 4 }}>The Product</div>

                {[
                  { q: "How is this different from just reading the OM?", a: "Reading an OM takes 20–45 minutes and you still have to build a spreadsheet. DealSignals gives you the same data extraction, a structured financial summary, and a scored recommendation in under 60 seconds. It's the difference between reading every deal and filtering to the ones worth your time." },
                  { q: "What does the Deal Score actually measure?", a: "The Deal Score (0–100) evaluates six investment dimensions: pricing relative to market, cashflow strength, tenant credit quality, rollover and lease risk, location fundamentals, and upside potential. Each dimension is scored independently so you can see exactly where a deal is strong or weak." },
                  { q: "What's in the Excel export?", a: "A 6-sheet institutional-grade workbook: deal summary inputs, rent roll, operating statement, debt and returns analysis, breakeven scenarios, and cap rate sensitivity tables. Every sheet is formula-linked and ready for your own underwriting adjustments." },
                  { q: "Can I share analysis with clients?", a: "Yes. Pro users can generate a unique shareable link for any deal. Your client sees the full analysis (score, metrics, financial summary) without needing a DealSignals account. Pro+ users get white-label branded links." },
                  { q: "What property types does it support?", a: "DealSignals works across all major CRE asset classes: retail NNN, multifamily, industrial, office, medical, self-storage, and mixed-use. The scoring models adapt to the specific asset type and deal structure." },
                ].map((item, i) => {
                  const faqIdx = 8 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Category: Security */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "16px 0 8px", marginBottom: 4 }}>Privacy &amp; Security</div>

                {[
                  { q: "Is my data private and secure?", a: "Yes. Documents are processed in real-time and not stored permanently on our servers. We don't sell or share your data. No tracking cookies, no analytics on your deals. Free tier doesn't even require an account." },
                  { q: "Can other users see my deals?", a: "No. Your DealBoard is completely private. The only way someone else can see a deal is if you explicitly generate a share link for it. Share links can be password-protected and set to expire." },
                ].map((item, i) => {
                  const faqIdx = 13 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom CTA */}
            <div style={{ textAlign: "center", marginTop: 56 }}>
              <p style={{ fontSize: 15, color: "#9ca3af", marginBottom: 16 }}>
                Still have questions? Upload a deal and see for yourself.
              </p>
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="ds-btn ds-btn-primary" style={{ fontSize: 14, padding: "12px 32px" }}>
                Try Your First Deal - Free
              </button>
            </div>
          </div>

        </section>
      )}

      {/* ===== PROCESSING STATE ===== */}
      {view === "processing" && (
        <section style={{
          background: "#0d0d14",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Subtle green radial glow background */}
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(132,204,22,0.15) 0%, rgba(132,204,22,0) 70%)",
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 0,
          }} />

          {/* City skyline background (very low opacity) */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "300px",
            opacity: 0.03,
            zIndex: 1,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 400'%3E%3Cpath d='M0,300 L50,200 L100,250 L150,150 L200,200 L250,100 L300,180 L350,120 L400,170 L450,100 L500,160 L550,80 L600,150 L650,90 L700,140 L750,110 L800,160 L850,100 L900,150 L950,120 L1000,180 L1050,140 L1100,190 L1150,160 L1200,200 L1200,400 L0,400 Z' fill='%2384CC16'/%3E%3C/svg%3E")`,
            backgroundSize: "cover",
            backgroundPosition: "bottom center",
            backgroundRepeat: "no-repeat",
          }} />

          {/* Content container */}
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: "600px", padding: "0 24px" }}>
            {/* DealSignals Logo */}
            <div style={{ marginBottom: 60 }}>
              <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 32 }} />
            </div>

            {/* Animated percentage counter with circular progress ring */}
            <div style={{ marginBottom: 60, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg
                width="200"
                height="200"
                viewBox="0 0 200 200"
                style={{ position: "absolute" }}
              >
                {/* Background circle */}
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="rgba(132,204,22,0.1)"
                  strokeWidth="3"
                />
                {/* Progress circle */}
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="#84CC16"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (1 - processingPct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.1s linear", transformOrigin: "100px 100px", transform: "rotate(-90deg)" }}
                />
              </svg>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{
                  fontSize: 72,
                  fontWeight: 700,
                  color: "#84CC16",
                  fontFamily: "'Inter', sans-serif",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {processingPct}%
                </div>
              </div>
            </div>

            {/* Stage labels: UPLOAD → EXTRACT → READ → ANALYZE → GENERATE */}
            <div style={{ display: "flex", gap: 12, marginBottom: 50, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              {[
                { label: "UPLOAD", done: statusMsg !== "Uploading files..." },
                { label: "EXTRACT", done: !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "READ", done: statusMsg !== "Reading file contents..." && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "ANALYZE", done: !statusMsg.includes("Analyzing") && !statusMsg.includes("Reading") && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "GENERATE", done: statusMsg.includes("Generating") || statusMsg.includes("complete") },
              ].map((stage, i, arr) => {
                const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                return (
                  <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: stage.done ? "rgba(132,204,22,0.2)" : isCurrent ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.05)",
                      border: `2px solid ${stage.done ? "#84CC16" : isCurrent ? "#84CC16" : "rgba(132,204,22,0.3)"}`,
                      animation: isCurrent ? "pulse 1.5s ease-in-out infinite" : "none",
                    }}>
                      {stage.done ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: isCurrent ? "#84CC16" : "rgba(132,204,22,0.4)",
                        }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: stage.done ? "#84CC16" : isCurrent ? "#84CC16" : "#6B7280",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}>
                      {stage.label}
                    </span>
                    {i < arr.length - 1 && (
                      <div style={{ width: 16, height: 1, background: "rgba(132,204,22,0.2)" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rotating status messages */}
            <div style={{ marginBottom: 40, minHeight: 40 }}>
              <p style={{
                fontSize: 16,
                fontWeight: 500,
                color: "#84CC16",
                margin: 0,
                fontFamily: "'Inter', sans-serif",
                animation: "fadeInOut 3s ease-in-out infinite",
              }}>
                {[
                  "Scanning document structure...",
                  "Extracting financial data points...",
                  "Calculating cap rate and NOI...",
                  "Running price sensitivity models...",
                  "Scoring tenant credit quality...",
                  "Mapping location intelligence...",
                  "Building your deal analysis...",
                ][processingMsgIdx]}
              </p>
            </div>

            {/* File name pill */}
            {selectedFile && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                background: "rgba(132,204,22,0.1)",
                border: "1px solid rgba(132,204,22,0.2)",
                borderRadius: 20,
                fontSize: 13,
              }}>
                <span style={{
                  padding: "2px 8px",
                  background: "rgba(132,204,22,0.2)",
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#84CC16",
                  textTransform: "uppercase",
                }}>
                  {selectedFile.name.split(".").pop()}
                </span>
                <span style={{ flex: 1, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9CA3AF" }}>
                  {selectedFile.name}
                </span>
              </div>
            )}
          </div>

          {/* CSS animations */}
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.6; }
            }
            @keyframes fadeInOut {
              0%, 10% { opacity: 0; }
              20%, 80% { opacity: 1; }
              90%, 100% { opacity: 0; }
            }
          `}</style>
        </section>
      )}

      {/* ===== RESULT STATE ===== */}
      {view === "result" && data && (
        <section data-ds-result style={{ padding: "24px 0 60px", background: "#0d0d14" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
            <PropertyOutput data={data} heroImageUrl={heroImageUrl} usageData={usageData} />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={resetAnalyzer} style={{
                padding: "12px 28px", background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.15)",
                borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#84CC16", fontFamily: "'Plus Jakarta Sans', sans-serif",
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
            <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 36 }} />
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

function PropertyOutput({ data: d, heroImageUrl, usageData }: { data: AnalysisData; heroImageUrl?: string; usageData?: { uploadsUsed: number; uploadLimit: number } | null }) {
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

  const metricsStripItems = [
    { label: "Price", value: fmt$(d.askingPrice) },
    { label: "Cap Rate", value: fmtPct(d.capRateOm) },
    { label: "NOI", value: fmt$(d.noiOm) },
    { label: "DSCR", value: fmtX(d.dscrOm) },
    { label: "Price/SF", value: d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "--" },
    { label: "Cash-on-Cash", value: fmtPct(d.cashOnCashOm) },
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

  // Extract strengths (🟢) and risks (🔴/🟡) from signals
  const strengths: string[] = [];
  const risks: string[] = [];
  signals.forEach(([, val]) => {
    const raw = String(val || "");
    if (raw.includes("🟢")) {
      const text = raw.replace(/^🟢\s*/, "").trim();
      strengths.push(text);
    } else if (raw.includes("🔴") || raw.includes("🟡")) {
      const text = raw.replace(/^[🔴🟡]\s*/, "").trim();
      risks.push(text);
    }
  });

  // Price sensitivity table calculation
  const calculateSensitivity = (priceAdjustment: number) => {
    const adjustedPrice = (d.askingPrice || 0) * (1 + priceAdjustment);
    const noi = d.noiOm || 0;
    const capRate = adjustedPrice > 0 ? (noi / adjustedPrice) * 100 : 0;

    // Debt assumptions: LTV 75%, Interest 6.5%, 30-year amortization, 2% closing costs
    const ltv = 0.75;
    const interestRate = 0.065;
    const amortYears = 30;
    const closingCostsPct = 0.02;

    const loanAmount = adjustedPrice * ltv;
    const monthlyRate = interestRate / 12;
    const numPayments = amortYears * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    const annualDS = monthlyPayment * 12;
    const dscr = noi > 0 ? noi / annualDS : 0;

    const downPayment = adjustedPrice * (1 - ltv);
    const closingCosts = adjustedPrice * closingCostsPct;
    const totalCash = downPayment + closingCosts;
    const cashFlow = noi - annualDS;
    const coc = totalCash > 0 ? (cashFlow / totalCash) * 100 : 0;

    return { capRate, dscr, coc };
  };

  const sensitivityRows = [
    { label: "-30%", adjustment: -0.30 },
    { label: "-20%", adjustment: -0.20 },
    { label: "-10%", adjustment: -0.10 },
    { label: "-5%", adjustment: -0.05 },
    { label: "OM Price", adjustment: 0, isOM: true },
    { label: "+5%", adjustment: 0.05 },
    { label: "+10%", adjustment: 0.10 },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* ===== HERO SECTION — Property Info + Asset Type Badge ===== */}
      <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "32px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 700, color: "#FFFFFF", margin: 0, lineHeight: 1.2, flex: 1 }}>{d.propertyName}</h1>
            <span style={{
              padding: "6px 12px",
              background: "#84CC16",
              color: "#0F172A",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}>
              {detectedType.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Auto-detected</div>

          {location && (
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: "#D1D5DB" }}>{location}</span>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[
                  { label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` },
                  { label: "Google Earth", url: `https://earth.google.com/web/search/${encodedAddress}/` },
                ].map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                    padding: "4px 10px", background: "#f2f3ff", borderRadius: 6,
                    fontSize: 11, color: "#6B7280", textDecoration: "none", fontWeight: 500,
                  }}>{link.label} &rarr;</a>
                ))}
              </div>
            </div>
          )}

          {/* Image + Score */}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              {/* Property metadata */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Type", value: d.assetType },
                  { label: "Built", value: d.yearBuilt },
                  { label: "Tenants", value: d.tenantCount },
                  { label: "WALE", value: d.wale ? `${d.wale} yrs` : null },
                  { label: "Traffic", value: d.traffic },
                ].filter((x) => x.value).map((x) => (
                  <div key={x.label}>
                    <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{x.label}</div>
                    <div style={{ fontSize: 12, color: "#0F172A", marginTop: 1, fontWeight: 500 }}>{x.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
              <PropertyImage heroImageUrl={heroImageUrl} location={location} encodedAddress={encodedAddress} propertyName={d.propertyName} />
              <div style={{ display: "flex", justifyContent: "center" }}>
                <DealScoreRing score={dealScore} label="Deal Score" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== METRICS STRIP — Horizontal single-row key metrics ===== */}
      {metricsStripItems.length > 0 && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: "16px 0", marginBottom: 20, display: "grid", gridTemplateColumns: `repeat(${metricsStripItems.length}, 1fr)` }}>
          {metricsStripItems.map((item, idx) => (
            <div key={item.label} style={{
              padding: "12px 16px",
              borderRight: idx < metricsStripItems.length - 1 ? "1px solid rgba(132,204,22,0.1)" : "none",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#84CC16", fontVariantNumeric: "tabular-nums", fontFamily: "'Inter', sans-serif" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ===== PRICE SENSITIVITY TABLE ===== */}
      {(d.askingPrice && d.noiOm) && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: "20px", marginBottom: 20, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Price Sensitivity Analysis</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid rgba(132,204,22,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Scenario</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid rgba(132,204,22,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Purchase Price</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid rgba(132,204,22,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Cap Rate</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid rgba(132,204,22,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>DSCR</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid rgba(132,204,22,0.1)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Cash-on-Cash</th>
              </tr>
            </thead>
            <tbody>
              {sensitivityRows.map((row, idx) => {
                const sens = calculateSensitivity(row.adjustment);
                const capRateGood = sens.capRate >= 7;
                const dscrGood = sens.dscr >= 1.25;
                const cocGood = sens.coc >= 8;
                const capRateColor = capRateGood ? "#059669" : sens.capRate >= 6.5 ? "#D97706" : "#DC2626";
                const dscrColor = dscrGood ? "#059669" : sens.dscr >= 1.15 ? "#D97706" : "#DC2626";
                const cocColor = cocGood ? "#059669" : sens.coc >= 5 ? "#D97706" : "#DC2626";

                return (
                  <tr key={row.label} style={{
                    background: row.isOM ? "rgba(132,204,22,0.1)" : idx % 2 === 1 ? "rgba(132,204,22,0.03)" : "transparent",
                    borderBottom: row.isOM ? "2px solid #84CC16" : "1px solid rgba(132,204,22,0.1)",
                  }}>
                    <td style={{ padding: "10px 12px", fontWeight: row.isOM ? 700 : 500, color: "#E5E7EB" }}>
                      {row.isOM ? <span style={{ color: "#84CC16", fontWeight: 700 }}>⭐ {row.label}</span> : row.label}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#E5E7EB", fontVariantNumeric: "tabular-nums" }}>{fmt$((d.askingPrice || 0) * (1 + row.adjustment))}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: capRateColor, fontVariantNumeric: "tabular-nums" }}>{sens.capRate.toFixed(2)}%</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: dscrColor, fontVariantNumeric: "tabular-nums" }}>{sens.dscr.toFixed(2)}x</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: cocColor, fontVariantNumeric: "tabular-nums" }}>{sens.coc.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 10, color: "#6B7280", fontStyle: "italic" }}>
            Assumptions: LTV 75%, Rate 6.5%, 30-yr amortization, 2% closing costs. Green ≥ 7% cap, 1.25x DSCR, 8% CoC.
          </div>
        </div>
      )}

      {/* ===== STRENGTHS & RISKS — matching pro layout ===== */}
      {(strengths.length > 0 || risks.length > 0) && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(132,204,22,0.1)", background: "rgba(132,204,22,0.03)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}>Strengths &amp; Risks</h3>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 100 }}>
            {/* Strengths */}
            <div style={{ padding: "16px 20px", borderRight: "1px solid rgba(132,204,22,0.1)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#059669", marginBottom: 12 }}>Strengths</div>
              {strengths.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
              {strengths.length === 0 && <span style={{ fontSize: 12, color: "#6B7280" }}>No strong signals detected</span>}
            </div>
            {/* Risks */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#DC2626", marginBottom: 12 }}>Risks</div>
              {risks.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5 }}>{r}</span>
                </div>
              ))}
              {risks.length === 0 && <span style={{ fontSize: 12, color: "#6B7280" }}>No risk signals detected</span>}
            </div>
          </div>
        </div>
      )}

      {/* ===== VALUE-ADD OPPORTUNITIES ===== */}
      {(() => {
        const vaFlags: { type: string; strength: string; summary: string }[] = [];
        // Derive value-add signals from available data
        const occupancy = Number(d.occupancyPct) || 0;
        const noiOm = Number(d.noiOm) || 0;
        const noiAdj = Number(d.noiAdjusted) || 0;
        if (occupancy > 0 && occupancy < 90) vaFlags.push({ type: "Vacancy Lease-Up", strength: occupancy < 75 ? "strong" : "moderate", summary: `Current occupancy at ${occupancy}%. Lease-up to market could significantly increase NOI.` });
        if (noiAdj > 0 && noiOm > 0 && noiAdj > noiOm * 1.05) vaFlags.push({ type: "Expense Optimization", strength: noiAdj > noiOm * 1.15 ? "strong" : "moderate", summary: `Adjusted NOI (${fmt$(noiAdj)}) exceeds OM NOI (${fmt$(noiOm)}), suggesting expense inefficiencies to address.` });
        if (d.signals?.rollover_risk && String(d.signals.rollover_risk).includes("🔴")) vaFlags.push({ type: "Lease Rollover", strength: "moderate", summary: "Near-term lease expirations create opportunity to negotiate at current or higher market rents." });
        if (d.signals?.basis && String(d.signals.basis).includes("🟢")) vaFlags.push({ type: "Below-Market Basis", strength: "strong", summary: "Entry basis appears favorable relative to market comps. Potential for immediate equity upside." });
        if (vaFlags.length === 0) return null;
        const strengthStyle: Record<string, { color: string; bg: string }> = {
          strong: { color: "#059669", bg: "rgba(5,150,105,0.08)" },
          moderate: { color: "#D97706", bg: "rgba(217,119,6,0.08)" },
        };
        return (
          <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(5,150,105,0.2)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(5,150,105,0.15)", background: "rgba(5,150,105,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#059669", borderRadius: 2 }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}>Value-Add Opportunities</h3>
              </div>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0 11px", lineHeight: 1.4 }}>Actionable signals that indicate NOI improvement potential</p>
            </div>
            <div style={{ padding: "12px 20px" }}>
              {vaFlags.map((flag, i) => {
                const s = strengthStyle[flag.strength] || strengthStyle.moderate;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", marginBottom: i < vaFlags.length - 1 ? 6 : 0, borderRadius: 8, background: flag.strength === "strong" ? "rgba(5,150,105,0.08)" : "rgba(217,119,6,0.08)" }}>
                    <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{flag.strength === "strong" ? "📈" : "📊"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#9CA3AF" }}>{flag.type}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: s.color, background: "rgba(0,0,0,0.3)", padding: "1px 6px", borderRadius: 3 }}>{flag.strength}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#D1D5DB", lineHeight: 1.4 }}>{flag.summary}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== DISCLAIMER ===== */}
      <p style={{ fontSize: 10, color: "#6B7280", margin: "0 0 16px", fontStyle: "italic", textAlign: "center" }}>
        First-pass underwriting screen &middot; Directional only &middot; Verify all data independently
      </p>

      {/* ===== RECOMMENDATION BANNER ===== */}
      {recommendation && (
        <div style={{
          padding: "14px 20px", borderRadius: 6, marginBottom: 16,
          background: recommendation.includes("🟢") ? "linear-gradient(135deg, rgba(5,150,105,0.15), rgba(5,150,105,0.08))" : recommendation.includes("🔴") ? "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(220,38,38,0.08))" : "linear-gradient(135deg, rgba(217,119,6,0.15), rgba(217,119,6,0.08))",
          color: recommendation.includes("🟢") ? "#A7F3D0" : recommendation.includes("🔴") ? "#FCA5A5" : "#FED7AA",
          border: recommendation.includes("🟢") ? "1px solid rgba(5,150,105,0.2)" : recommendation.includes("🔴") ? "1px solid rgba(220,38,38,0.2)" : "1px solid rgba(217,119,6,0.2)",
          fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
        }}>
          <span style={{ fontSize: 20 }}>{recommendation.includes("🟢") ? "🟢" : recommendation.includes("🔴") ? "🔴" : "🟡"}</span>
          <span>{recommendation.replace(/🟢|🟡|🔴/g, "").trim()}</span>
        </div>
      )}

      {/* ===== SCORE BREAKDOWN — from Pro scoring model ===== */}
      {scoreCategories.length > 0 && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <span style={{ width: 3, height: 20, background: "#84CC16", borderRadius: 2 }} />
              Deal Signals Score Breakdown
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 }}>{detectedType} model</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 4, letterSpacing: 0.5,
                background: scoreBand === "strong_buy" || scoreBand === "buy" ? "rgba(5,150,105,0.1)" : scoreBand === "hold" ? "rgba(196,154,60,0.1)" : "rgba(132,204,22,0.1)",
                color: scoreBand === "strong_buy" || scoreBand === "buy" ? "#059669" : scoreBand === "hold" ? "#C49A3C" : "#84CC16",
                textTransform: "uppercase",
              }}>{scoreBand === "hold" ? "neutral" : scoreBand.replace("_", " ")}</span>
            </div>
          </div>
          {scoreRecommendation && (
            <p style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.6, margin: "0 0 16px", padding: "12px 16px", background: "rgba(132,204,22,0.05)", borderRadius: 8 }}>
              {scoreRecommendation}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {scoreCategories.map((cat: any) => {
              const barColor = cat.score >= 70 ? "#059669" : cat.score >= 50 ? "#C49A3C" : "#84CC16";
              return (
                <div key={cat.name} style={{ padding: "10px 14px", background: "rgba(132,204,22,0.05)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#E5E7EB", textTransform: "capitalize" }}>{cat.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: barColor }}>{cat.score}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(132,204,22,0.15)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${cat.score}%`, height: "100%", background: barColor, borderRadius: 2, animation: "barGrow 0.8s ease-out" }} />
                  </div>
                  {cat.explanation && (
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{cat.explanation}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== BRIEF / INITIAL ASSESSMENT ===== */}
      {brief && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", color: "#FFFFFF", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <span style={{ width: 3, height: 20, background: "#84CC16", borderRadius: 2 }} />
            Initial Assessment
          </h2>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 14px" }}>AI-generated first-pass analysis based on uploaded documents</p>
          <div style={{ fontSize: 14, color: "#D1D5DB", lineHeight: 1.8 }}>
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
            <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(132,204,22,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Key Metrics</h3>
              </div>
              {metrics.map(([label, val, tooltip], i) => (
                <div key={String(label)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px",
                  background: i % 2 === 1 ? "rgba(132,204,22,0.03)" : "transparent",
                }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 5 }}>
                    {String(label)}
                    {tooltip && <MetricTooltip text={String(tooltip)} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#E5E7EB", fontVariantNumeric: "tabular-nums" }}>{String(val)}</span>
                </div>
              ))}
            </div>
          )}
          {signals.length > 0 && (
            <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(132,204,22,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Signal Assessment</h3>
              </div>
              {signals.map(([label, val], i) => {
                const raw = String(val);
                const color = signalColor(raw);
                const bgColor = color === "#059669" ? "rgba(5,150,105,0.1)" : color === "#D97706" ? "rgba(217,119,6,0.1)" : color === "#DC2626" ? "rgba(220,38,38,0.1)" : "rgba(132,204,22,0.03)";
                const borderLeft = color === "#059669" ? "3px solid #059669" : color === "#D97706" ? "3px solid #D97706" : color === "#DC2626" ? "3px solid #DC2626" : "3px solid #84CC16";
                // Strip leading emoji + space for cleaner display
                const text = raw.replace(/^[🟢🟡🔴]\s*/, "");
                return (
                  <div key={String(label)} style={{
                    padding: "12px 18px",
                    background: bgColor, borderLeft, display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#E5E7EB", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.5, paddingLeft: 14 }}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TENANT SUMMARY ===== */}
      {tenants.length > 0 && (
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 18px", background: "rgba(132,204,22,0.05)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Tenant Summary</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 16px", textAlign: "left", fontWeight: 600, color: "#9CA3AF" }}>Tenant</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF" }}>SF</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#9CA3AF" }}>Annual Rent</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9CA3AF" }}>Type</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9CA3AF" }}>Lease End</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#9CA3AF" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={i} style={{ background: i % 2 === 1 ? "rgba(132,204,22,0.03)" : "transparent" }}>
                  <td style={{ padding: "6px 16px", fontWeight: 600, color: "#E5E7EB" }}>{t.name}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#D1D5DB" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "#D1D5DB" }}>{fmt$(t.rent)}</td>
                  <td style={{ padding: "6px 12px", color: "#9CA3AF" }}>{t.type || "--"}</td>
                  <td style={{ padding: "6px 12px", color: "#9CA3AF" }}>{t.end || "--"}</td>
                  <td style={{ padding: "6px 12px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8,
                      color: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "#D97706" : "#059669",
                      background: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "rgba(217,119,6,0.15)" : "rgba(5,150,105,0.15)",
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
        <div style={{ background: "#0d0d14", borderRadius: 12, border: "1px solid rgba(132,204,22,0.1)", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Download Assets</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="dl-btn" onClick={() => downloadLiteXLSX(d)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.2)", borderRadius: 6,
              color: "#D1D5DB", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(5,150,105,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: "#FFFFFF" }}>Underwriting Workbook <span style={{ marginLeft: 6, padding: "1px 5px", background: "rgba(5,150,105,0.15)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#059669" }}>XLSX</span></div>
                <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>6-sheet Excel: Inputs, Rent Roll, Operating Statement, Debt &amp; Returns, Breakeven, Cap Scenarios</div>
              </div>
            </button>
            <button className="dl-btn" onClick={() => downloadLiteBrief(d)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.2)", borderRadius: 6,
              color: "#D1D5DB", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: "#FFFFFF" }}>First-Pass Brief <span style={{ marginLeft: 6, padding: "1px 5px", background: "rgba(37,99,235,0.15)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#2563EB" }}>DOC</span></div>
                <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>Investment memo with assessment, key metrics, signal ratings, and recommendation</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ===== BOLD PRO CTA ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0d0d14 0%, #111827 50%, #0d0d14 100%)",
        borderRadius: 16, padding: "48px 40px", marginTop: 32,
        border: "1px solid rgba(132,204,22,0.15)",
        position: "relative", overflow: "hidden", textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontSize: 28, fontWeight: 800, color: "#ffffff", marginBottom: 12,
            fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.3,
          }}>
            Save this breakdown. Compare it. Share it.
          </h2>
          <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 8px" }}>
            With DealSignals Pro, every analysis is saved to your DealBoard. Score side-by-side, export full workbooks, pin deals to a map, and send branded briefs to clients.
          </p>
          <p style={{ fontSize: 14, color: "#84CC16", fontWeight: 600, marginBottom: 28 }}>
            Decide before others even open Excel. 100 deals/month for less than $0.50 per deal.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/workspace/login?upgrade=pro" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 36px", borderRadius: 10,
              background: "#84CC16", color: "#0d0d14",
              fontSize: 16, fontWeight: 700, textDecoration: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15)",
            }}>
              Upgrade to Pro
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </a>
            <a href="/om-analyzer#pricing" style={{
              display: "inline-flex", alignItems: "center",
              padding: "14px 28px", borderRadius: 10,
              background: "transparent", color: "#e0e0e6",
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: 14, fontWeight: 600, textDecoration: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              View Plans
            </a>
          </div>
          {usageData && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 16, fontFamily: "'Inter', sans-serif" }}>
              <span style={{ color: usageData.uploadsUsed >= usageData.uploadLimit ? "#f87171" : "#84CC16", fontWeight: 700 }}>
                {usageData.uploadsUsed}/{usageData.uploadLimit}
              </span>{" "}
              free {usageData.uploadLimit === 1 ? "analysis" : "analyses"} used
            </p>
          )}
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
