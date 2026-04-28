"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { createProperty, createDocument } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { extractTextFromFiles } from "@/lib/workspace/file-reader";
import { extractHeroImageFromPDF } from "@/lib/workspace/image-extractor";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";
const MAX_PROPERTIES = 10;

interface BulkItem {
  id: string;
  file: File;
  propertyName: string;
  status: "queued" | "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
  propertyId?: string;
}

function derivePropertyName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(underwriting|om|flyer|rent roll|t12|lease|proforma|pro forma|copy|backup|final|draft|v\d+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "New Property";
}

export default function BulkUploadPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<BulkItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [factIdx, setFactIdx] = useState(0);

  // Warn user before leaving while uploads are in flight
  useEffect(() => {
    if (!processing) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Uploads are still in progress. If you leave now, remaining properties won't be uploaded.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [processing]);

  // Cycle through encouraging status messages during bulk processing
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => setFactIdx(i => (i + 1) % 8), 3200);
    return () => clearInterval(id);
  }, [processing]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setItems(prev => {
      const remaining = MAX_PROPERTIES - prev.length;
      if (remaining <= 0) return prev;
      // Dedup by filename + byte size against everything already queued.
      // The dropzone fires for every drop and the file picker for every
      // selection, so users routinely add the same OM twice (drag, then
      // drag again, or pick + drag). Without this guard each duplicate
      // creates its own property card on the dealboard.
      const existingKeys = new Set(prev.map(i => `${i.file.name}|${i.file.size}`));
      const deduped = arr.filter(f => {
        const key = `${f.name}|${f.size}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      const toAdd = deduped.slice(0, remaining).map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        propertyName: derivePropertyName(file.name),
        status: "queued" as const,
        progress: 0,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateName(id: string, name: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, propertyName: name } : i));
  }

  // Process all items sequentially
  async function handleBulkUpload() {
    if (!user || items.length === 0) return;
    // Guard against double-click. Without this, a second click while the
    // first run is still iterating spawns a parallel pass that hits
    // createProperty for the same files again and dupes the dealboard.
    if (processing) return;
    setProcessing(true);
    setCompletedCount(0);

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const { file } = item;

      // Update status to uploading
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "uploading" } : i));

      try {
        // Create property
        const propertyId = await createProperty("workspace-default", {
          propertyName: item.propertyName,
          userId: user.uid,
          workspaceId: activeWorkspace?.id || "default",
        } as any);

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, propertyId } : i));

        // Upload file to storage
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const storedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const storagePath = `workspace/${user.uid}/${propertyId}/inputs/${storedName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i));
            },
            reject,
            async () => {
              await getDownloadURL(uploadTask.snapshot.ref);
              await createDocument({
                projectId: "workspace-default",
                userId: user.uid,
                propertyId,
                originalFilename: file.name,
                storedFilename: storedName,
                fileExt: ext,
                mimeType: file.type,
                fileSizeBytes: file.size,
                storagePath,
                docCategory: "om",
                parserStatus: "uploaded",
                isArchived: false,
                isDeleted: false,
                uploadedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              resolve();
            }
          );
        });

        // Extract hero image from PDF.
        // Threshold matches single-upload path (5KB floor + extractor's
        // own internal floor). Previously bulk used 10KB which silently
        // dropped valid hero candidates that single-upload would accept.
        // When extraction fails, the property page falls back to the
        // server-side hero cascade (Google Places > Street View >
        // satellite > placeholder) once the address is parsed.
        if (file.name.toLowerCase().endsWith(".pdf")) {
          try {
            console.log(`[bulk] Extracting hero from ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
            const heroBlob = await extractHeroImageFromPDF(file);
            if (heroBlob && heroBlob.size > 5000) {
              const imgRef = ref(storage, `workspace/${user.uid}/${propertyId}/hero.jpg`);
              await uploadBytesResumable(imgRef, heroBlob);
              const imgUrl = await getDownloadURL(imgRef);
              const { updateProperty } = await import("@/lib/workspace/firestore");
              await updateProperty(propertyId, { heroImageUrl: imgUrl } as any);
              console.log(`[bulk] Hero saved for ${file.name} (${(heroBlob.size / 1024).toFixed(0)}KB)`);
            } else if (heroBlob) {
              console.warn(`[bulk] Hero blob too small to use: ${heroBlob.size} bytes (min 5000). Map fallback will kick in.`);
            } else {
              console.warn(`[bulk] Hero extractor returned null for ${file.name} - no page scored above threshold. Map fallback will kick in.`);
            }
          } catch (heroErr) {
            console.warn(`[bulk] Hero extraction failed for ${file.name}:`, heroErr);
          }
        }

        // Extract text client-side, then hand off full pipeline to server
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "analyzing", progress: 100 } : i));

        try {
          const extractedText = await extractTextFromFiles([file]);

          // Fire the full server-side pipeline: parse → generate → score
          // This runs as a single server-side request, so even if the user
          // navigates away, Vercel will continue processing to completion.
          const res = await fetch("/api/workspace/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              propertyId,
              userId: user.uid,
              documentText: extractedText,
              analysisType: activeWorkspace?.analysisType || "retail",
            }),
          });
          const data = await res.json();

          // Update displayed name from server-parsed data
          if (data.success && data.fieldsExtracted > 0) {
            try {
              // Fetch the updated property name from Firestore (server already set it)
              const { getProperty } = await import("@/lib/workspace/firestore");
              const updatedProp = await getProperty(propertyId);
              if (updatedProp?.propertyName) {
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, propertyName: updatedProp.propertyName } : i));
              }
            } catch { /* non-blocking - name will update on next page load */ }
          }
        } catch { /* non-blocking */ }

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "done" } : i));
        setCompletedCount(c => c + 1);
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "error", error: err?.message || "Failed" } : i));
        setCompletedCount(c => c + 1);
      }
    }

    // Refresh sidebar
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }
    setProcessing(false);
  }

  const allDone = items.length > 0 && items.every(i => i.status === "done" || i.status === "error");
  const hasItems = items.length > 0;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <a href="/workspace/upload" style={{ color: "#5A7091", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Single Upload
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Bulk Upload{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}
        </h1>
        {activeWorkspace?.analysisType && (
          <span style={{
            display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
            background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
            color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
            fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
          }}>
            {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#5A7091", marginBottom: 20, lineHeight: 1.5 }}>
        Upload up to {MAX_PROPERTIES} OMs at once - one file per property. Each OM becomes its own property with full analysis.
      </p>

      {/* Instructions */}
      {!processing && !allDone && (
        <div style={{
          background: "#F6F8FB", borderRadius: 10, padding: "16px 20px", marginBottom: 20,
          border: "1px solid #EDF0F5",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#253352", marginBottom: 8 }}>How bulk upload works</div>
          <div style={{ fontSize: 12, color: "#5A7091", lineHeight: 1.7 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#C49A3C", flexShrink: 0 }}>1.</span>
              <span>Drop up to {MAX_PROPERTIES} files - each file is treated as a separate property (one OM per property).</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#C49A3C", flexShrink: 0 }}>2.</span>
              <span>Review the auto-generated property names. Edit any that need a better name.</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#C49A3C", flexShrink: 0 }}>3.</span>
              <span>Hit "Upload All" and we'll process each property one by one - extracting data, running analysis, and generating reports.</span>
            </div>
          </div>
        </div>
      )}

      {/* Drop zone - only show when not processing */}
      {!processing && !allDone && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#4D7C0F" : "#D8DFE9"}`,
              borderRadius: 6, padding: hasItems ? "20px 16px" : "40px 16px", textAlign: "center",
              cursor: items.length >= MAX_PROPERTIES ? "not-allowed" : "pointer",
              background: isDragging ? "rgba(132, 204, 22, 0.03)" : "#ffffff", transition: "all 0.15s",
              marginBottom: 14, opacity: items.length >= MAX_PROPERTIES ? 0.5 : 1,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B4C1D1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
              <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#253352", margin: "0 0 4px" }}>
              {items.length >= MAX_PROPERTIES
                ? `Maximum ${MAX_PROPERTIES} properties reached`
                : isDragging
                  ? "Drop OMs here"
                  : "Drop OMs here, or click to browse"}
            </p>
            <p style={{ fontSize: 12, color: "#B4C1D1", margin: 0 }}>
              {items.length}/{MAX_PROPERTIES} files · One OM per property · PDF recommended
            </p>
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
              disabled={items.length >= MAX_PROPERTIES}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {/* Property list - editable names */}
          {hasItems && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #EDF0F5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5A7091" }}>
                  {items.length} propert{items.length !== 1 ? "ies" : "y"} ready
                </span>
                <button onClick={() => setItems([])} style={{ fontSize: 11, color: "#C52D3A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear All</button>
              </div>
              {items.map((item, idx) => (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                  borderBottom: idx < items.length - 1 ? "1px solid #F6F8FB" : "none",
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%", background: "#F6F8FB", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                    color: "#5A7091", flexShrink: 0,
                  }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={item.propertyName}
                      onChange={e => updateName(item.id, e.target.value)}
                      style={{
                        width: "100%", padding: "6px 10px", fontSize: 13, border: "1px solid #E5E9F0",
                        borderRadius: 6, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ fontSize: 10, color: "#B4C1D1", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} style={{
                    background: "none", border: "none", color: "#B4C1D1", cursor: "pointer",
                    fontSize: 16, flexShrink: 0, padding: "0 4px",
                  }}>&times;</button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {hasItems && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={handleBulkUpload} style={{
                padding: "14px 48px", background: "#0F172A", color: "#fff", border: "none",
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                width: "auto", display: "inline-block",
              }}>
                Upload All ({items.length} propert{items.length !== 1 ? "ies" : "y"})
              </button>
            </div>
          )}
        </>
      )}

      {/* Processing view */}
      {processing && (() => {
        const factMessages = [
          "Scanning document structure...",
          "Extracting financial data points...",
          "Calculating cap rate and NOI...",
          "Running sale price scenarios...",
          "Scoring tenant credit quality...",
          "Mapping location intelligence...",
          "Benchmarking against your targets...",
          "Building your deal analyses...",
        ];
        const perItemPct = (it: BulkItem): number => {
          if (it.status === "done" || it.status === "error") return 100;
          if (it.status === "queued") return 0;
          if (it.status === "uploading") return Math.min(60, Math.round(it.progress * 0.6));
          if (it.status === "analyzing") return 60 + Math.min(35, Math.round((it.progress || 0) * 0.35));
          return 0;
        };
        const overallPct = items.length === 0 ? 0 : Math.round(items.reduce((s, it) => s + perItemPct(it), 0) / items.length);
        const radius = 54;
        const circumference = 2 * Math.PI * radius;

        // Active item and current pipeline stage (mirrors single upload's chip rail)
        const activeItem = items.find(i => i.status === "uploading" || i.status === "analyzing");
        const activeIdx = activeItem ? items.findIndex(i => i.id === activeItem.id) : -1;
        const currentItem = activeItem || items.find(i => i.status === "queued") || items[items.length - 1];

        // Build chip rail stages from the currently in-flight item's state.
        const upStatus = currentItem?.status;
        const stages = [
          { label: "UPLOAD",   done: upStatus === "analyzing" || upStatus === "done" },
          { label: "EXTRACT",  done: upStatus === "analyzing" || upStatus === "done" },
          { label: "READ",     done: upStatus === "analyzing" || upStatus === "done" },
          { label: "ANALYZE",  done: upStatus === "done" },
          { label: "GENERATE", done: completedCount >= items.length },
        ];

        return (
        <div className="ws-bulk-processing-card" style={{
          position: "relative",
          background: "linear-gradient(180deg, #ffffff 0%, #f7faf1 100%)",
          borderRadius: 14,
          boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
          padding: "56px 32px 44px",
          overflow: "hidden",
          textAlign: "center",
        }}>
          <style>{`
            @keyframes wsBulkPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.94); } }
            @keyframes wsBulkFactSwap { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
            @keyframes wsBulkRingGlow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(132,204,22,0.35)); } 50% { filter: drop-shadow(0 0 14px rgba(132,204,22,0.55)); } }
            @keyframes wsBulkShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            @media (max-width: 768px) {
              .ws-bulk-processing-card { padding: 40px 20px 32px !important; }
              .ws-bulk-headline { font-size: 18px !important; }
              .ws-bulk-fact { font-size: 13px !important; margin-bottom: 20px !important; }
              .ws-bulk-stage-rail { gap: 4px !important; margin-bottom: 18px !important; }
              .ws-bulk-stage-chip { padding: 5px 10px !important; font-size: 9px !important; }
              .ws-bulk-stage-icon { width: 12px !important; height: 12px !important; }
              .ws-bulk-stage-dot { width: 3px !important; height: 3px !important; }
            }
            @media (max-width: 480px) {
              .ws-bulk-processing-card { padding: 32px 16px 24px !important; }
              .ws-bulk-headline { font-size: 16px !important; }
              .ws-bulk-fact { font-size: 12px !important; margin-bottom: 16px !important; }
              .ws-bulk-stage-rail { gap: 3px !important; }
              .ws-bulk-stage-chip { padding: 4px 8px !important; }
              .ws-bulk-stage-connector { width: 6px !important; }
            }
          `}</style>

          {/* Soft green radial glow behind the ring */}
          <div style={{
            position: "absolute", top: -60, left: "50%",
            transform: "translateX(-50%)",
            width: 420, height: 420,
            background: "radial-gradient(circle, rgba(132,204,22,0.14) 0%, rgba(132,204,22,0) 65%)",
            borderRadius: "50%", pointerEvents: "none", zIndex: 0,
          }} />

          <div style={{ position: "relative", zIndex: 1, maxWidth: 620, margin: "0 auto" }}>
            {/* Current-property pill (mirrors single upload's file-name pill) */}
            {currentItem && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 14px",
                background: "rgba(132,204,22,0.1)",
                border: "1px solid rgba(132,204,22,0.25)",
                borderRadius: 999,
                fontSize: 12,
                marginBottom: 24,
                maxWidth: "100%",
              }}>
                <span style={{
                  padding: "2px 7px",
                  background: "rgba(132,204,22,0.22)",
                  borderRadius: 4,
                  fontSize: 9, fontWeight: 800,
                  color: "#4D7C0F",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}>
                  {activeIdx >= 0 ? `${activeIdx + 1}/${items.length}` : `${completedCount}/${items.length}`}
                </span>
                <span style={{
                  maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", color: "#4D5466", fontWeight: 600,
                }}>
                  {currentItem.propertyName}
                </span>
                {items.length > 1 && (
                  <span style={{
                    padding: "2px 7px",
                    background: "rgba(21,27,43,0.06)",
                    borderRadius: 4,
                    fontSize: 9, fontWeight: 800,
                    color: "#151b2b",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}>
                    +{items.length - 1}
                  </span>
                )}
              </div>
            )}

            {/* Progress ring with percentage */}
            <div style={{
              position: "relative", width: 128, height: 128,
              margin: "0 auto 24px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="128" height="128" viewBox="0 0 128 128" style={{
                position: "absolute", inset: 0,
                animation: "wsBulkRingGlow 2.4s ease-in-out infinite",
              }}>
                <circle cx="64" cy="64" r={radius} fill="none"
                  stroke="rgba(132,204,22,0.12)" strokeWidth="4" />
                <circle cx="64" cy="64" r={radius} fill="none"
                  stroke="#4D7C0F" strokeWidth="4"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={`${circumference * (1 - overallPct / 100)}`}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-dashoffset 0.2s linear",
                    transformOrigin: "64px 64px",
                    transform: "rotate(-90deg)",
                  }}
                />
              </svg>
              <div style={{ position: "relative", zIndex: 1, lineHeight: 1 }}>
                <div style={{
                  fontSize: 30, fontWeight: 800, color: "#151b2b",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {overallPct}
                  <span style={{ fontSize: 16, color: "#4D7C0F", fontWeight: 700, marginLeft: 2 }}>%</span>
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: "#9CA3AF",
                  textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4,
                }}>
                  Underwriting
                </div>
              </div>
            </div>

            {/* Headline */}
            <h2 className="ws-bulk-headline" style={{
              fontSize: 22, fontWeight: 800, color: "#151b2b",
              margin: "0 0 6px", letterSpacing: -0.2,
              fontFamily: "'Inter', sans-serif",
            }}>
              Analyzing your deals
            </h2>
            <p className="ws-bulk-fact" key={`ws-bulk-fact-${factIdx}`} style={{
              fontSize: 14, fontWeight: 600, color: "#4D7C0F",
              margin: "0 0 28px",
              animation: "wsBulkFactSwap 0.5s ease-out",
            }}>
              {factMessages[factIdx]}
            </p>

            {/* Stage chip rail */}
            <div className="ws-bulk-stage-rail" style={{
              display: "flex", gap: 6,
              justifyContent: "center", alignItems: "center",
              flexWrap: "wrap", marginBottom: 24,
            }}>
              {stages.map((stage, i, arr) => {
                const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                return (
                  <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div className="ws-bulk-stage-chip" style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 999,
                      background: stage.done
                        ? "rgba(132,204,22,0.14)"
                        : isCurrent
                          ? "rgba(132,204,22,0.08)"
                          : "#F3F4F6",
                      border: `1px solid ${
                        stage.done ? "rgba(132,204,22,0.4)"
                        : isCurrent ? "#4D7C0F"
                        : "rgba(0,0,0,0.06)"
                      }`,
                      transition: "all 0.25s",
                    }}>
                      <div className="ws-bulk-stage-icon" style={{
                        width: 14, height: 14, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: stage.done
                          ? "#4D7C0F"
                          : isCurrent ? "rgba(132,204,22,0.3)" : "rgba(0,0,0,0.08)",
                        animation: isCurrent ? "wsBulkPulse 1.4s ease-in-out infinite" : "none",
                      }}>
                        {stage.done ? (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                            stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="ws-bulk-stage-dot" style={{
                            width: 5, height: 5, borderRadius: "50%",
                            background: isCurrent ? "#4D7C0F" : "rgba(0,0,0,0.25)",
                          }} />
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        color: stage.done ? "#4D7C0F" : isCurrent ? "#4D7C0F" : "#9CA3AF",
                        textTransform: "uppercase", letterSpacing: 0.6,
                      }}>
                        {stage.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="ws-bulk-stage-connector" style={{
                        width: 10, height: 2, borderRadius: 1,
                        background: stage.done ? "#4D7C0F" : "rgba(0,0,0,0.08)",
                      }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Shimmering progress bar */}
            <div style={{
              position: "relative",
              height: 6, borderRadius: 999,
              background: "rgba(132,204,22,0.12)",
              overflow: "hidden",
              maxWidth: 440, margin: "0 auto 16px",
            }}>
              <div style={{
                height: "100%",
                width: `${overallPct}%`,
                background: "linear-gradient(90deg, #4D7C0F, #3F6212)",
                borderRadius: 999,
                transition: "width 0.2s linear",
              }} />
              <div style={{
                position: "absolute", top: 0, bottom: 0, width: "40%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                animation: "wsBulkShimmer 1.8s linear infinite",
              }} />
            </div>

            {/* Count of completed properties */}
            <p style={{ fontSize: 12, color: "#8899B0", margin: "0 0 20px" }}>
              {completedCount} of {items.length} propert{items.length !== 1 ? "ies" : "y"} complete  ·  30-60s each
            </p>

            {/* Compact dot strip showing all properties at a glance */}
            <div style={{
              display: "flex", justifyContent: "center", alignItems: "center",
              gap: 6, flexWrap: "wrap", marginBottom: 4,
            }}>
              {items.map((item, idx) => {
                const isActive = item.status === "uploading" || item.status === "analyzing";
                const isDone = item.status === "done";
                const isError = item.status === "error";
                const bg = isDone ? "#4D7C0F"
                  : isError ? "#DC2626"
                  : isActive ? "rgba(132,204,22,0.85)"
                  : "rgba(0,0,0,0.1)";
                return (
                  <div
                    key={item.id}
                    title={`${idx + 1}. ${item.propertyName}  -  ${item.status}`}
                    style={{
                      width: isActive ? 10 : 8,
                      height: isActive ? 10 : 8,
                      borderRadius: "50%",
                      background: bg,
                      animation: isActive ? "wsBulkPulse 1.4s ease-in-out infinite" : "none",
                      transition: "all 0.3s",
                    }}
                  />
                );
              })}
            </div>

            {/* Subtle stay-on-page hint (no yellow warning box) */}
            <p style={{ fontSize: 10, color: "#B4C1D1", margin: "16px 0 0", letterSpacing: 0.2 }}>
              Stay on this page while your deals finish analyzing
            </p>
          </div>
        </div>
        );
      })()}

      {/* All done */}
      {allDone && !processing && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 28, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#D1FAE5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 12 }}>
            {"\u2713"}
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0A7E5A", margin: "0 0 4px" }}>
            {items.filter(i => i.status === "done").length} of {items.length} properties uploaded
          </p>
          {items.some(i => i.status === "error") && (
            <p style={{ fontSize: 12, color: "#DC3545", margin: "0 0 8px" }}>
              {items.filter(i => i.status === "error").length} failed - you can retry from the upload page.
            </p>
          )}
          <p style={{ fontSize: 12, color: "#8899B0", margin: "0 0 20px" }}>
            All properties have been analyzed and are ready to review.
          </p>

          {/* Summary list */}
          <div style={{ textAlign: "left", marginBottom: 20 }}>
            {items.filter(i => i.status === "done").map((item, idx) => (
              <a
                key={item.id}
                href={`/workspace/properties/${item.propertyId}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 6, textDecoration: "none", color: "#253352",
                  background: idx % 2 === 0 ? "#F6F8FB" : "transparent",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#2563EB" }}>{idx + 1}.</span>
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.propertyName}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B4C1D1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </a>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push("/workspace")} style={{
              padding: "10px 24px", background: "#C49A3C", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              Go to Dashboard
            </button>
            <button onClick={() => router.push("/workspace/scoreboard")} style={{
              padding: "10px 24px", background: "transparent", color: "#5A7091", border: "1px solid #D8DFE9",
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
              View Scorecard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
