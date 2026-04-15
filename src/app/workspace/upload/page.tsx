"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { getWorkspaceProperties, createProperty, createDocument } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { extractTextFromFiles } from "@/lib/workspace/file-reader";
import { extractHeroImageFromPDF } from "@/lib/workspace/image-extractor";
import type { Property, DocCategory, AnalysisType } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import UpgradeModal from "@/components/billing/UpgradeModal";
import Link from "next/link";

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

/* ===== DESIGN.md Tokens ===== */
const C = {
  primary: "#84CC16",
  primaryGradient: "#84CC16",
  onSurface: "#151b2b",
  secondary: "#585e70",
  tertiary: "#C49A3C",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  shadowDeep: "0 20px 40px rgba(21, 27, 43, 0.12)",
  radius: 6,
};

interface FileUpload {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  docCategory?: DocCategory;
}

function guessCategory(filename: string): DocCategory {
  const lower = filename.toLowerCase();
  if (lower.includes("om") || lower.includes("offering") || lower.includes("memorandum")) return "om";
  if (lower.includes("flyer") || lower.includes("brochure")) return "flyer";
  if (lower.includes("rent") && lower.includes("roll")) return "rent_roll";
  if (lower.includes("t12") || lower.includes("t-12") || lower.includes("trailing")) return "t12";
  if (lower.includes("underwriting") || lower.includes("proforma") || lower.includes("pro-forma")) return "underwriting";
  if (lower.includes("lease")) return "lease";
  if (lower.includes("market") || lower.includes("comp")) return "market_report";
  if (lower.includes("site") && lower.includes("plan")) return "site_plan";
  if (/\.(png|jpg|jpeg|webp)$/i.test(lower)) return "image";
  return "misc";
}

function derivePropertyName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(underwriting|om|flyer|rent roll|t12|lease|proforma|pro forma|copy|backup|final|draft|v\d+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "New Property";
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: `1px solid ${C.ghost}`,
  borderRadius: C.radius, fontSize: 13, outline: "none", boxSizing: "border-box",
  fontFamily: "'Inter', sans-serif", background: C.surfLow,
};

type Step = "upload" | "processing" | "name" | "done";

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace, addWorkspace } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProperty = searchParams.get("property") || "";

  const [step, setStep] = useState<Step>(preselectedProperty ? "upload" : "upload");
  const [properties, setProperties] = useState<Property[]>([]);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState(preselectedProperty);
  const [finalPropertyId, setFinalPropertyId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [parseResult, setParseResult] = useState("");
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState<{ detected: string; workspace: string; propertyId: string } | null>(null);
  const skipMismatchRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [processingPct, setProcessingPct] = useState(0);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);

  // Drive the animated progress ring + rotating status copy while we're
  // in the processing step. Matches the Try Me uploader so this page
  // feels alive instead of static.
  useEffect(() => {
    if (step !== "processing") {
      setProcessingPct(0);
      setProcessingMsgIdx(0);
      return;
    }
    const start = Date.now();
    const duration = 50000; // ~50s to reach 95%
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const linear = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - linear, 3);
      setProcessingPct(Math.min(Math.round(eased * 95), 95));
      if (linear < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const msgInterval = setInterval(
      () => setProcessingMsgIdx(i => (i + 1) % 7),
      3000,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(msgInterval);
    };
  }, [step]);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(setProperties).catch(() => {});
    // Use stable primitives - object refs change every render and cause infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  // Warn user before leaving during processing
  useEffect(() => {
    if (step !== "processing") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Upload is still in progress. If you leave now, your property may not be fully processed.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const items = Array.from(newFiles).map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      progress: 0,
      status: "pending" as const,
      docCategory: guessCategory(file.name),
    }));
    setFiles(prev => [...prev, ...items]);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  async function handleUpload() {
    if (!user || files.length === 0) return;

    // ── Check usage limit before proceeding ──
    try {
      const token = await user.getIdToken();

      const usageRes = await fetch("/api/workspace/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        if (usageData.uploadsUsed >= usageData.uploadLimit) {
          setShowUpgradeModal(true);
          return;
        }
      } else {
        // If we can't verify usage, block the upload for safety
        console.error("[upload] Usage check returned error:", usageRes.status);
        setStatusMsg("Unable to verify your usage limit. Please try again.");
        return;
      }
    } catch (err) {
      console.error("[upload] Usage check failed:", err);
      setStatusMsg("Unable to verify your usage limit. Please try again.");
      return;
    }

    setStep("processing");
    setStatusMsg("Uploading files...");

    const autoName = derivePropertyName(files[0].file.name);
    setPropertyName(autoName);

    let propertyId = selectedExistingId;

    if (!propertyId) {
      try {
        propertyId = await createProperty("workspace-default", {
          propertyName: autoName,
          userId: user.uid,
          workspaceId: activeWorkspace?.id || "default",
        } as any);
      } catch (err: any) {
        setStatusMsg(`Failed to create property: ${err?.message || "Unknown error"}`);
        setStep("upload");
        return;
      }
    }

    setFinalPropertyId(propertyId);

    const storagePaths: string[] = [];
    for (const fileUpload of files) {
      const { file } = fileUpload;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const storedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `workspace/${user.uid}/${propertyId}/inputs/${storedName}`;

      setFiles(prev => prev.map(f => f.id === fileUpload.id ? { ...f, status: "uploading" } : f));

      try {
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setFiles(prev => prev.map(f => f.id === fileUpload.id ? { ...f, progress: pct } : f));
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
                docCategory: fileUpload.docCategory,
                parserStatus: "uploaded",
                isArchived: false,
                isDeleted: false,
                uploadedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              storagePaths.push(storagePath);
              setFiles(prev => prev.map(f => f.id === fileUpload.id ? { ...f, status: "complete", progress: 100 } : f));
              resolve();
            }
          );
        });
      } catch (err: any) {
        setFiles(prev => prev.map(f => f.id === fileUpload.id ? { ...f, status: "error", error: err?.message || "Upload failed" } : f));
      }
    }

    // Extract hero image from first PDF (non-blocking).
    // Size threshold matches om-analyzer (> 5000 bytes) and the extractor's
    // own internal floor. Previously this was 10000 which silently dropped
    // valid hero candidates that rendered as smaller JPEGs (design-heavy OMs
    // with lots of negative space, or pages with an inset photo on white bg).
    const pdfFile = files.find(f => f.file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile) {
      try {
        setStatusMsg("Extracting property image...");
        console.log("[upload] Extracting hero image from:", pdfFile.file.name, `(${(pdfFile.file.size / 1024).toFixed(0)}KB)`);
        const heroBlob = await extractHeroImageFromPDF(pdfFile.file);
        if (heroBlob && heroBlob.size > 5000) {
          console.log(`[upload] Hero blob produced: ${(heroBlob.size / 1024).toFixed(0)}KB - uploading to Storage...`);
          const imgRef = ref(storage, `workspace/${user.uid}/${propertyId}/hero.jpg`);
          await uploadBytesResumable(imgRef, heroBlob);
          const imgUrl = await getDownloadURL(imgRef);
          const { updateProperty } = await import("@/lib/workspace/firestore");
          await updateProperty(propertyId, { heroImageUrl: imgUrl } as any);
          console.log("[upload] Hero image saved:", imgUrl);
        } else if (heroBlob) {
          console.warn(`[upload] Hero blob too small to use: ${heroBlob.size} bytes (min 5000). Using map fallback.`);
        } else {
          console.warn("[upload] Hero extractor returned null - no page scored above threshold. Using map fallback.");
        }
      } catch (imgErr) {
        console.warn("[upload] Hero image extraction failed:", imgErr);
      }
    }

    // ── Extract text client-side (needed before we can hand off to server) ──
    setStatusMsg("Reading file contents...");
    let extractedText = "";
    try {
      extractedText = await extractTextFromFiles(files.map(f => f.file));
    } catch (textErr: any) {
      console.warn("[upload] Text extraction failed:", textErr);
    }

    // ── Classify property type (quick check before server handoff) ──
    let detectedType = activeWorkspace?.analysisType || "retail";
    if (extractedText) {
      try {
        setStatusMsg("Detecting property type...");
        const classifyRes = await fetch("/api/workspace/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentText: extractedText }),
        });
        if (classifyRes.ok) {
          const classifyData = await classifyRes.json();
          detectedType = classifyData.detected_type || "retail";
          const classificationConfidence = classifyData.confidence || 0;

          if (!skipMismatchRef.current && classificationConfidence >= 0.70 && detectedType !== (activeWorkspace?.analysisType || "retail")) {
            setMismatchInfo({
              detected: detectedType,
              workspace: activeWorkspace?.analysisType || "retail",
              propertyId,
            });
            setShowMismatchModal(true);
            setStep("upload");
            return;
          }
        }
      } catch (classifyErr) {
        console.warn("[upload] Classification failed, proceeding with workspace type:", classifyErr);
      }
    }

    // ── Fire server-side processing (parse → generate → score) ──
    if (extractedText) {
      setStatusMsg("Analyzing your document - this takes 30-90 seconds...");
      setParseResult("Running full analysis pipeline (parse → generate → score)...");

      try {
        const processRes = await fetch("/api/workspace/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            userId: user.uid,
            documentText: extractedText,
            analysisType: detectedType,
          }),
        });

        if (processRes.ok) {
          const processData = await processRes.json();
          setParseResult(`Analysis complete - ${processData.fieldsExtracted || 0} fields extracted and scored.`);
        } else {
          const errData = await processRes.json().catch(() => ({}));
          console.error("[upload] Process failed:", errData);
          setParseResult("Analysis encountered an issue. You can re-analyze from the property page.");
        }
      } catch (err) {
        console.error("[upload] Process request failed:", err);
        setParseResult("Analysis encountered an issue. You can re-analyze from the property page.");
      }
    } else {
      setParseResult("Files uploaded but text extraction was limited. Try re-uploading in a different format.");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }

    // ── Increment usage count after successful upload ──
    try {
      const token = await user.getIdToken();

      await fetch("/api/workspace/usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("usage-updated"));
      }
    } catch (err) {
      console.warn("[upload] Usage increment failed:", err);
    }

    if (selectedExistingId) {
      setStep("done");
    } else {
      setStep("name");
    }
  }

  async function handleSaveName() {
    if (!finalPropertyId || !propertyName.trim()) return;
    try {
      const { updateProperty } = await import("@/lib/workspace/firestore");
      await updateProperty(finalPropertyId, { propertyName: propertyName.trim() } as any);
    } catch { /* continue */ }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }
    setStep("done");
  }

  async function handleUseExisting(existingId: string) {
    if (!existingId) return;
    if (finalPropertyId && finalPropertyId !== existingId) {
      try {
        const { deleteProperty } = await import("@/lib/workspace/firestore");
        await deleteProperty(finalPropertyId, "workspace-default");
      } catch { /* continue */ }
    }
    setFinalPropertyId(existingId);
    setStep("done");
  }

  const hasFiles = files.length > 0;

  async function handleMismatchContinue() {
    if (!mismatchInfo) return;
    try {
      const { updateProperty } = await import("@/lib/workspace/firestore");
      await updateProperty(mismatchInfo.propertyId, { isMismatch: true } as any);
      setShowMismatchModal(false);
      setMismatchInfo(null);
      skipMismatchRef.current = true;
      setSelectedExistingId(mismatchInfo.propertyId);
      setStep("processing");
      handleUpload();
    } catch (err) {
      console.error("[upload] Failed to mark property as mismatch:", err);
    }
  }

  async function handleMismatchCreateWorkspace() {
    if (!mismatchInfo || !activeWorkspace) return;
    try {
      const newWsName = `${ANALYSIS_TYPE_LABELS[mismatchInfo.detected as any]} DealBoard`;
      const newWs = await addWorkspace(newWsName, mismatchInfo.detected as any);
      console.log("[upload] Created new workspace:", newWs);
      const { updateProperty } = await import("@/lib/workspace/firestore");
      await updateProperty(mismatchInfo.propertyId, { workspaceId: newWs.id } as any);
      setShowMismatchModal(false);
      setMismatchInfo(null);
      router.push(`/workspace/properties/${mismatchInfo.propertyId}`);
    } catch (err) {
      console.error("[upload] Failed to create workspace:", err);
      alert("Failed to create workspace");
    }
  }

  return (
    <div className="ul-container" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <style>{`
        @media (max-width: 768px) {
          .ul-container { padding: 0 12px !important; }
          .ul-header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .ul-title { font-size: 24px !important; }
          .ul-subtitle { font-size: 13px !important; margin-bottom: 16px !important; }
        }
        @media (max-width: 480px) {
          .ul-container { padding: 0 12px !important; }
          .ul-title { font-size: 20px !important; }
          .ul-subtitle { font-size: 12px !important; }
        }
      `}</style>
      <div className="ul-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 className="ul-title" style={{ fontSize: 30, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>
            Upload Deal{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}
          </h1>
          {activeWorkspace?.analysisType && (
            <span style={{
              display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: C.radius,
              background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
              color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
              fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
            }}>
              {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
            </span>
          )}
        </div>
      </div>
      <p className="ul-subtitle" style={{ fontSize: 14, color: C.secondary, marginBottom: 20, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
        One property at a time. A single OM is enough to get started - you can always add more files later.
      </p>

      {/* ===== STEP 1: Upload Files ===== */}
      {step === "upload" && (
        <>
          {selectedExistingId && (
            <div style={{ background: "#D1FAE5", padding: "10px 14px", borderRadius: C.radius, marginBottom: 14, fontSize: 13, color: "#0A7E5A", fontWeight: 500 }}>
              Adding files to: {properties.find(p => p.id === selectedExistingId)?.propertyName || "Selected property"}
            </div>
          )}

          {/* Drop zone - matches landing page upload card */}
          <div
            className="ul-dropzone"
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={(e) => { if ((e.target as HTMLElement).closest("button,input")) return; fileRef.current?.click(); }}
            style={{
              background: C.surfLowest,
              borderRadius: C.radius,
              padding: hasFiles ? "24px 20px" : "48px 20px",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: isDragging ? C.shadowDeep : C.shadow,
              border: `2px dashed ${isDragging ? C.primary : "#D8DFE9"}`,
              transition: "all 0.2s",
              marginBottom: 14,
            }}
          >
            <style>{`
              @media (max-width: 768px) {
                .ul-dropzone { padding: ${hasFiles ? "20px 16px" : "40px 16px"} !important; }
              }
              @media (max-width: 480px) {
                .ul-dropzone { padding: ${hasFiles ? "16px 12px" : "32px 12px"} !important; }
              }
            `}</style>
            {/* Building icon - same as landing page */}
            <div className="ul-icon-circle" style={{
              width: 56, height: 56, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
            }}>
              <style>{`
                @media (max-width: 768px) {
                  .ul-icon-circle { width: 48px !important; height: 48px !important; }
                  .ul-icon-circle svg { width: 24px !important; height: 24px !important; }
                }
              `}</style>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
              </svg>
            </div>
            <p className="ul-drop-title" style={{ fontSize: 16, fontWeight: 600, color: C.onSurface, margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
              {isDragging ? "Drop files here" : "Drop your OM or flyer here"}
            </p>
            <p className="ul-drop-subtitle" style={{ fontSize: 13, color: C.secondary, margin: "0 0 16px" }}>
              PDF, Excel, or CSV accepted (Max 50MB)
            </p>
            <style>{`
              @media (max-width: 768px) {
                .ul-drop-title { font-size: 14px !important; }
                .ul-drop-subtitle { font-size: 12px !important; }
              }
            `}</style>
            {!hasFiles && (
              <button className="ul-select-btn" onClick={() => fileRef.current?.click()} style={{
                padding: "12px 32px", background: C.onSurface, color: "#fff", border: "none",
                borderRadius: C.radius, fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Inter', sans-serif", minHeight: 44,
              }}>
                <style>{`
                  @media (max-width: 768px) {
                    .ul-select-btn { padding: 12px 24px !important; font-size: 13px !important; }
                  }
                  @media (max-width: 480px) {
                    .ul-select-btn { padding: 12px 20px !important; font-size: 12px !important; width: 100% !important; }
                  }
                `}</style>
                Select File from Local
              </button>
            )}
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* File list */}
          {hasFiles && (
            <>
              <div className="ul-filelist" style={{ background: C.surfLowest, borderRadius: C.radius, boxShadow: C.shadow, overflow: "hidden", marginBottom: 16 }}>
                <style>{`
                  @media (max-width: 768px) {
                    .ul-filelist { overflow-x: auto; }
                    .ul-file-row { flex-wrap: wrap !important; padding: 12px 12px !important; }
                  }
                  @media (max-width: 480px) {
                    .ul-filelist-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
                    .ul-file-row { gap: 6px !important; }
                    .ul-file-ext { padding: 2px 4px !important; font-size: 8px !important; }
                    .ul-file-name { font-size: 11px !important; }
                  }
                `}</style>
                <div className="ul-filelist-header" style={{ padding: "10px 16px", borderBottom: `1px solid ${C.ghost}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>{files.length} file{files.length !== 1 ? "s" : ""} ready</span>
                  <button onClick={() => setFiles([])} style={{ fontSize: 11, color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600, minHeight: 32 }}>Clear</button>
                </div>
                {files.map(f => (
                  <div key={f.id} className="ul-file-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", borderBottom: `1px solid ${C.ghost}`, fontSize: 12 }}>
                    <span className="ul-file-ext" style={{ padding: "1px 5px", background: C.surfLow, borderRadius: 3, fontSize: 9, fontWeight: 700, color: C.secondary, textTransform: "uppercase", flexShrink: 0 }}>
                      {f.file.name.split(".").pop()}
                    </span>
                    <span className="ul-file-name" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: C.onSurface }}>{f.file.name}</span>
                    <button className="ul-remove-btn" onClick={() => removeFile(f.id)} style={{ background: "none", border: "none", color: C.secondary, cursor: "pointer", fontSize: 14, flexShrink: 0, padding: "4px", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
                  </div>
                ))}
              </div>

              <div className="ul-upload-btn-container" style={{ display: "flex", justifyContent: "center" }}>
                <style>{`
                  @media (max-width: 768px) {
                    .ul-upload-btn-container { width: 100%; }
                    .ul-upload-btn { width: 100% !important; padding: 14px 32px !important; }
                  }
                `}</style>
                <button onClick={handleUpload} className="ul-upload-btn ws-btn-red" style={{
                  padding: "14px 48px", background: C.primaryGradient, color: "#fff", border: "none",
                  borderRadius: C.radius, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif",
                  width: "auto", display: "inline-block", minHeight: 44,
                }}>
                  Upload &amp; Analyze
                </button>
              </div>
            </>
          )}

          {/* ===== Explanatory Section ===== */}
          <div className="ul-info-section" style={{ marginTop: 28, paddingTop: 20 }}>
            <style>{`
              @media (max-width: 768px) {
                .ul-info-section { margin-top: 20px !important; padding-top: 16px !important; }
                .ul-info-text { font-size: 12px !important; line-height: 1.6 !important; }
                .ul-badge-row { margin-top: 12px !important; gap: 4px !important; }
                .ul-badge { padding: 2px 6px !important; font-size: 9px !important; }
                .ul-badge-hint { font-size: 10px !important; margin-left: 2px !important; }
              }
              @media (max-width: 480px) {
                .ul-info-text { font-size: 11px !important; }
                .ul-badge-row { gap: 3px !important; }
              }
            `}</style>
            <div className="ul-info-text" style={{ fontSize: 13, color: C.secondary, lineHeight: 1.7, fontFamily: "'Inter', sans-serif" }}>
              <strong style={{ color: C.onSurface }}>One property at a time.</strong> Upload all files for a single property, then come back for the next one. One complete OM is enough to get started - add rent rolls, T-12s, or leases later.
            </div>

            <div className="ul-badge-row" style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["PDF", "XLS/XLSX", "DOCX", "CSV", "TXT", "PNG", "JPG"].map(ext => (
                <span key={ext} className="ul-badge" style={{
                  padding: "3px 8px", background: (ext === "PDF" || ext === "XLS/XLSX") ? C.primary : C.surfLow,
                  color: (ext === "PDF" || ext === "XLS/XLSX") ? "#fff" : C.secondary,
                  borderRadius: 4, fontSize: 10, fontWeight: 600,
                }}>
                  {ext}
                </span>
              ))}
              <span className="ul-badge-hint" style={{ fontSize: 11, color: C.secondary, alignSelf: "center", marginLeft: 4 }}>Best results with PDFs and Excel files</span>
            </div>

            {/* Bulk upload callout */}
            <a
              href="/workspace/upload/bulk"
              className="ul-bulk-callout"
              style={{
                display: "flex", alignItems: "center", gap: 14, marginTop: 24, padding: "16px 20px",
                background: "rgba(132, 204, 22, 0.06)", borderRadius: 8,
                border: "1.5px solid rgba(132, 204, 22, 0.2)", textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              <style>{`
                .ul-bulk-callout:hover { background: rgba(132, 204, 22, 0.1) !important; border-color: rgba(132, 204, 22, 0.35) !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(132, 204, 22, 0.1); }
                @media (max-width: 768px) {
                  .ul-bulk-callout { gap: 12px !important; padding: 14px 16px !important; }
                  .ul-bulk-icon { width: 40px !important; height: 40px !important; }
                  .ul-bulk-icon svg { width: 20px !important; height: 20px !important; }
                  .ul-bulk-title { font-size: 13px !important; }
                  .ul-bulk-text { font-size: 12px !important; }
                  .ul-bulk-arrow { width: 16px !important; height: 16px !important; }
                }
                @media (max-width: 480px) {
                  .ul-bulk-callout { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; padding: 12px 12px !important; }
                  .ul-bulk-icon { align-self: flex-start; }
                  .ul-bulk-arrow { display: none !important; }
                  .ul-bulk-title { font-size: 12px !important; }
                  .ul-bulk-text { font-size: 11px !important; }
                }
              `}</style>
              <div className="ul-bulk-icon" style={{
                width: 44, height: 44, borderRadius: 10, background: "rgba(132, 204, 22, 0.12)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16l-4-4-4 4M12 12v9" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className="ul-bulk-title" style={{ fontWeight: 700, fontSize: 14, color: C.onSurface, marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>
                  Bulk Upload: upload up to 10 properties at once
                </div>
                <div className="ul-bulk-text" style={{ fontSize: 13, color: C.secondary }}>
                  Drop up to 10 OMs in one go and each file becomes its own fully-scored deal on your board. Use this when you have a portfolio of separate properties. (The multi-file upload above is different - it merges several documents into a <em>single</em> property.)
                </div>
              </div>
              <svg className="ul-bulk-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </>
      )}

      {/* ===== PROCESSING ===== */}
      {step === "processing" && (() => {
        // Compute stage flags once so they're shared between the ring
        // and the chip rail.
        const stages = [
          { label: "UPLOAD",   done: statusMsg !== "Uploading files..." },
          { label: "EXTRACT",  done: !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
          { label: "READ",     done: statusMsg !== "Reading file contents..." && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
          { label: "ANALYZE",  done: !statusMsg.includes("Analyzing") && !statusMsg.includes("Reading") && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
          { label: "GENERATE", done: statusMsg.includes("Generating") || statusMsg.includes("complete") },
        ];
        const factMessages = [
          "Scanning document structure…",
          "Extracting financial data points…",
          "Calculating cap rate and NOI…",
          "Running sale price scenarios…",
          "Scoring tenant credit quality…",
          "Mapping location intelligence…",
          "Building your deal analysis…",
        ];
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const primaryFile = files[0];

        return (
          <div className="ul-processing-card" style={{
            position: "relative",
            background: "linear-gradient(180deg, #ffffff 0%, #f7faf1 100%)",
            borderRadius: C.radius,
            boxShadow: C.shadow,
            padding: "56px 32px 44px",
            overflow: "hidden",
            textAlign: "center",
          }}>
            <style>{`
              @media (max-width: 768px) {
                .ul-processing-card { padding: 40px 20px 32px !important; }
              }
              @media (max-width: 480px) {
                .ul-processing-card { padding: 32px 16px 24px !important; }
              }
            `}</style>
            <style>{`
              @keyframes wsUploadPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.94); } }
              @keyframes wsUploadFactSwap { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
              @keyframes wsUploadRingGlow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(132,204,22,0.35)); } 50% { filter: drop-shadow(0 0 14px rgba(132,204,22,0.55)); } }
              @keyframes wsUploadShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
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
              {/* File name pill */}
              {primaryFile && (
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
                    {primaryFile.file.name.split(".").pop()}
                  </span>
                  <span style={{
                    maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", color: "#4D5466", fontWeight: 600,
                  }}>
                    {primaryFile.file.name}
                  </span>
                  {files.length > 1 && (
                    <span style={{
                      padding: "2px 7px",
                      background: "rgba(21,27,43,0.06)",
                      borderRadius: 4,
                      fontSize: 9, fontWeight: 800,
                      color: "#151b2b",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}>
                      +{files.length - 1}
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
                  animation: "wsUploadRingGlow 2.4s ease-in-out infinite",
                }}>
                  <circle cx="64" cy="64" r={radius} fill="none"
                    stroke="rgba(132,204,22,0.12)" strokeWidth="4" />
                  <circle cx="64" cy="64" r={radius} fill="none"
                    stroke="#84CC16" strokeWidth="4"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${circumference * (1 - processingPct / 100)}`}
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
                    {processingPct}
                    <span style={{ fontSize: 16, color: "#84CC16", fontWeight: 700, marginLeft: 2 }}>%</span>
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
              <h2 className="ul-processing-headline" style={{
                fontSize: 22, fontWeight: 800, color: "#151b2b",
                margin: "0 0 6px", letterSpacing: -0.2,
                fontFamily: "'Inter', sans-serif",
              }}>
                Analyzing your deal
              </h2>
              <p className="ul-processing-fact" key={`ws-fact-${processingMsgIdx}`} style={{
                fontSize: 14, fontWeight: 600, color: "#4D7C0F",
                margin: "0 0 28px",
                animation: "wsUploadFactSwap 0.5s ease-out",
              }}>
                {factMessages[processingMsgIdx]}
              </p>
              <style>{`
                @media (max-width: 768px) {
                  .ul-processing-headline { font-size: 18px !important; }
                  .ul-processing-fact { font-size: 13px !important; margin-bottom: 20px !important; }
                }
                @media (max-width: 480px) {
                  .ul-processing-headline { font-size: 16px !important; }
                  .ul-processing-fact { font-size: 12px !important; margin-bottom: 16px !important; }
                }
              `}</style>

              {/* Stage chip rail */}
              <div className="ul-stage-rail" style={{
                display: "flex", gap: 6,
                justifyContent: "center", alignItems: "center",
                flexWrap: "wrap", marginBottom: 24,
              }}>
                <style>{`
                  @media (max-width: 768px) {
                    .ul-stage-rail { gap: 4px !important; margin-bottom: 18px !important; }
                    .ul-stage-chip { padding: 5px 10px !important; font-size: 9px !important; }
                    .ul-stage-icon { width: 12px !important; height: 12px !important; }
                    .ul-stage-dot { width: 3px !important; height: 3px !important; }
                  }
                  @media (max-width: 480px) {
                    .ul-stage-rail { gap: 3px !important; }
                    .ul-stage-chip { padding: 4px 8px !important; }
                    .ul-stage-connector { width: 6px !important; }
                  }
                `}</style>
                {stages.map((stage, i, arr) => {
                  const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                  return (
                    <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="ul-stage-chip" style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 999,
                        background: stage.done
                          ? "rgba(132,204,22,0.14)"
                          : isCurrent
                            ? "rgba(132,204,22,0.08)"
                            : "#F3F4F6",
                        border: `1px solid ${
                          stage.done ? "rgba(132,204,22,0.4)"
                          : isCurrent ? "#84CC16"
                          : "rgba(0,0,0,0.06)"
                        }`,
                        transition: "all 0.25s",
                      }}>
                        <div className="ul-stage-icon" style={{
                          width: 14, height: 14, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: stage.done
                            ? "#84CC16"
                            : isCurrent ? "rgba(132,204,22,0.3)" : "rgba(0,0,0,0.08)",
                          animation: isCurrent ? "wsUploadPulse 1.4s ease-in-out infinite" : "none",
                        }}>
                          {stage.done ? (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                              stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <div className="ul-stage-dot" style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: isCurrent ? "#84CC16" : "rgba(0,0,0,0.25)",
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
                        <div className="ul-stage-connector" style={{
                          width: 10, height: 2, borderRadius: 1,
                          background: stage.done ? "#84CC16" : "rgba(0,0,0,0.08)",
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
                  width: `${processingPct}%`,
                  background: "linear-gradient(90deg, #84CC16, #65A30D)",
                  borderRadius: 999,
                  transition: "width 0.2s linear",
                }} />
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "40%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                  animation: "wsUploadShimmer 1.8s linear infinite",
                  pointerEvents: "none",
                }} />
              </div>

              {/* Meta line */}
              <p style={{
                fontSize: 12, color: "#6B7280", margin: "0 0 4px", fontWeight: 500,
              }}>
                {statusMsg.includes("Analyzing") ? "AI is extracting property data and calculating underwriting (30–60 seconds)" :
                 statusMsg.includes("Reading") ? "Extracting text from your document (5–15 seconds)" :
                 statusMsg.includes("image") ? "Capturing property image from PDF (≈5 seconds)" :
                 statusMsg.includes("Detecting") ? "Classifying property type…" :
                 "Uploading and processing your files…"}
              </p>
              <p style={{
                fontSize: 11, fontWeight: 700, color: "#D97706",
                margin: 0, letterSpacing: 0.2,
              }}>
                Please stay on this page until processing is complete.
              </p>

              {/* Per-file progress list (only when uploading) */}
              {files.some(f => f.status === "uploading" || f.status === "pending") && (
                <div style={{
                  marginTop: 24, textAlign: "left",
                  background: "rgba(248, 250, 244, 0.7)",
                  border: "1px solid rgba(132,204,22,0.15)",
                  borderRadius: 8, padding: "10px 14px",
                  maxWidth: 440, marginLeft: "auto", marginRight: "auto",
                }}>
                  {files.map(f => (
                    <div key={f.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "5px 0", fontSize: 12,
                    }}>
                      <span style={{
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", color: "#4D5466", fontWeight: 500,
                      }}>{f.file.name}</span>
                      {f.status === "uploading" && (
                        <div style={{ width: 110, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 4, background: "rgba(132,204,22,0.15)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", background: "#84CC16", borderRadius: 2, width: `${f.progress}%`, transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#4D7C0F", minWidth: 30, textAlign: "right" }}>{f.progress}%</span>
                        </div>
                      )}
                      {f.status === "complete" && <span style={{ color: "#10B981", fontSize: 14, flexShrink: 0 }}>{"\u2713"}</span>}
                      {f.status === "error" && <span style={{ color: "#DC2626", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>FAILED</span>}
                      {f.status === "pending" && <span style={{ color: "#9CA3AF", fontSize: 10, flexShrink: 0 }}>waiting</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== STEP 2: Name Property ===== */}
      {step === "name" && (
        <div style={{ background: C.surfLowest, borderRadius: C.radius, boxShadow: C.shadow, padding: 24 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#D1FAE5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 8 }}>
              {"\u2713"}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0A7E5A", margin: "0 0 4px" }}>
              {files.length} file{files.length !== 1 ? "s" : ""} uploaded and analyzed
            </p>
            {parseResult && <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{parseResult}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              Property Name
            </label>
            <input
              style={inputStyle}
              value={propertyName}
              onChange={e => setPropertyName(e.target.value)}
              placeholder="Enter deal name"
              autoFocus
            />
            <p style={{ fontSize: 11, color: C.secondary, margin: "6px 0 0" }}>
              Auto-generated from your file. Edit if needed.
            </p>
          </div>

          {properties.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.ghost}`, paddingTop: 14, marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 6 }}>
                Or add files to an existing property
              </label>
              <select
                value=""
                onChange={e => { if (e.target.value) handleUseExisting(e.target.value); }}
                style={inputStyle}
              >
                <option value="">Select existing property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>
                    {cleanDisplayName(p.propertyName, p.address1, p.city, p.state)}{p.city ? ` - ${p.city}, ${p.state}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button onClick={handleSaveName} disabled={!propertyName.trim()} className="ws-btn-red" style={{
              padding: "14px 48px", background: C.primaryGradient, color: "#fff", border: "none",
              borderRadius: C.radius, fontSize: 14, fontWeight: 700, cursor: propertyName.trim() ? "pointer" : "not-allowed",
              opacity: propertyName.trim() ? 1 : 0.4, fontFamily: "'Inter', sans-serif",
              width: "auto", display: "inline-block",
            }}>
              Save Property
            </button>
          </div>
        </div>
      )}

      {/* ===== DONE ===== */}
      {step === "done" && (
        <div style={{ background: C.surfLowest, borderRadius: C.radius, boxShadow: C.shadow, padding: 32, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#D1FAE5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>
            {"\u2713"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.onSurface, margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>Property saved</h2>
          <p style={{ fontSize: 13, color: C.secondary, margin: "0 0 4px" }}>
            {files.length} file{files.length !== 1 ? "s" : ""} uploaded and analyzed.
          </p>
          {parseResult && <p style={{ fontSize: 12, color: C.secondary, margin: "0 0 20px", opacity: 0.7 }}>{parseResult}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push(`/workspace/properties/${finalPropertyId}`)} style={{
              padding: "10px 24px", background: C.primaryGradient, color: "#fff", border: "none",
              borderRadius: C.radius, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif",
            }}>
              View Property
            </button>
            <button onClick={() => {
              setFiles([]); setPropertyName(""); setSelectedExistingId("");
              setFinalPropertyId(""); setStatusMsg(""); setParseResult("");
              skipMismatchRef.current = false;
              setStep("upload");
              if (user && activeWorkspace) getWorkspaceProperties(user.uid, activeWorkspace.id).then(setProperties).catch(() => {});
            }} style={{
              padding: "10px 24px", background: C.surfLowest, border: `1px solid ${C.ghost}`,
              borderRadius: C.radius, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
              color: C.onSurface,
            }}>
              Upload Another
            </button>
          </div>
        </div>
      )}

      {/* Mismatch Warning Modal */}
      {showMismatchModal && mismatchInfo && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 200,
        }} onClick={() => { setShowMismatchModal(false); setMismatchInfo(null); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.surfLowest, borderRadius: 12, padding: "28px 32px", width: 420,
            boxShadow: C.shadowDeep,
          }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: C.onSurface }}>Property Type Mismatch</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
              This looks like a <strong>{ANALYSIS_TYPE_LABELS[mismatchInfo.detected as AnalysisType]}</strong> deal. You are currently in a <strong>{ANALYSIS_TYPE_LABELS[mismatchInfo.workspace as AnalysisType]}</strong> workspace, which uses different metrics and scoring.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => handleMismatchContinue()} style={{
                padding: "8px 16px", background: C.surfLow, border: `1px solid ${C.ghost}`,
                borderRadius: C.radius, fontSize: 13, cursor: "pointer", color: C.secondary, fontFamily: "'Inter', sans-serif", fontWeight: 500,
              }}>
                Continue Anyway
              </button>
              <button onClick={() => handleMismatchCreateWorkspace()} className="ws-btn-gold" style={{
                padding: "8px 20px", background: C.primaryGradient, color: "#fff", border: "none",
                borderRadius: C.radius, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
              }}>
                Create New {ANALYSIS_TYPE_LABELS[mismatchInfo.detected as AnalysisType]} DealBoard
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Upgrade Modal */}
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="limit_reached"
      />
    </div>
  );
}
