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
import { DOC_CATEGORY_LABELS, ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS, ANALYSIS_TYPE_ICONS } from "@/lib/workspace/types";
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

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(setProperties).catch(() => {});
  }, [user, activeWorkspace]);

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

  function setCat(id: string, cat: DocCategory) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, docCategory: cat } : f));
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

    // Extract hero image from first PDF (non-blocking)
    const pdfFile = files.find(f => f.file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile) {
      try {
        setStatusMsg("Extracting property image...");
        const heroBlob = await extractHeroImageFromPDF(pdfFile.file);
        if (heroBlob && heroBlob.size > 10000) {
          const imgRef = ref(storage, `workspace/${user.uid}/${propertyId}/hero.jpg`);
          await uploadBytesResumable(imgRef, heroBlob);
          const imgUrl = await getDownloadURL(imgRef);
          const { updateProperty } = await import("@/lib/workspace/firestore");
          await updateProperty(propertyId, { heroImageUrl: imgUrl } as any);
          console.log("[upload] Hero image saved:", imgUrl);
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
      setStatusMsg("Analyzing your document — this takes 30-90 seconds...");
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
          setParseResult(`Analysis complete — ${processData.fieldsExtracted || 0} fields extracted and scored.`);
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
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>
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
      <p style={{ fontSize: 14, color: C.secondary, marginBottom: 20, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
        One property at a time. A single OM is enough to get started — you can always add more files later.
      </p>

      {/* ===== STEP 1: Upload Files ===== */}
      {step === "upload" && (
        <>
          {selectedExistingId && (
            <div style={{ background: "#D1FAE5", padding: "10px 14px", borderRadius: C.radius, marginBottom: 14, fontSize: 13, color: "#0A7E5A", fontWeight: 500 }}>
              Adding files to: {properties.find(p => p.id === selectedExistingId)?.propertyName || "Selected property"}
            </div>
          )}

          {/* Drop zone — matches landing page upload card */}
          <div
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
            {/* Building icon — same as landing page */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.onSurface, margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
              {isDragging ? "Drop files here" : "Drop your OM or flyer here"}
            </p>
            <p style={{ fontSize: 13, color: C.secondary, margin: "0 0 16px" }}>
              PDF, Excel, or CSV accepted (Max 50MB)
            </p>
            {!hasFiles && (
              <button onClick={() => fileRef.current?.click()} style={{
                padding: "12px 32px", background: C.onSurface, color: "#fff", border: "none",
                borderRadius: C.radius, fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}>
                Select File from Local
              </button>
            )}
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* File list */}
          {hasFiles && (
            <>
              <div style={{ background: C.surfLowest, borderRadius: C.radius, boxShadow: C.shadow, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.ghost}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>{files.length} file{files.length !== 1 ? "s" : ""} ready</span>
                  <button onClick={() => setFiles([])} style={{ fontSize: 11, color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Clear</button>
                </div>
                {files.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", borderBottom: `1px solid ${C.ghost}`, fontSize: 12 }}>
                    <span style={{ padding: "1px 5px", background: C.surfLow, borderRadius: 3, fontSize: 9, fontWeight: 700, color: C.secondary, textTransform: "uppercase", flexShrink: 0 }}>
                      {f.file.name.split(".").pop()}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: C.onSurface }}>{f.file.name}</span>
                    <select value={f.docCategory || ""} onChange={e => setCat(f.id, e.target.value as DocCategory)}
                      style={{ padding: "3px 6px", border: `1px solid ${C.ghost}`, borderRadius: 4, fontSize: 10, fontFamily: "'Inter', sans-serif", width: 130, flexShrink: 0, background: C.surfLow }}>
                      {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removeFile(f.id)} style={{ background: "none", border: "none", color: C.secondary, cursor: "pointer", fontSize: 14, flexShrink: 0, padding: 0 }}>&times;</button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={handleUpload} className="ws-btn-red" style={{
                  padding: "14px 48px", background: C.primaryGradient, color: "#fff", border: "none",
                  borderRadius: C.radius, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif",
                  width: "auto", display: "inline-block",
                }}>
                  Upload &amp; Analyze
                </button>
              </div>
            </>
          )}

          {/* ===== Explanatory Section ===== */}
          <div style={{ marginTop: 28, paddingTop: 20 }}>
            <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.7, fontFamily: "'Inter', sans-serif" }}>
              <strong style={{ color: C.onSurface }}>One property at a time.</strong> Upload all files for a single property, then come back for the next one. One complete OM is enough to get started — add rent rolls, T-12s, or leases later.
            </div>

            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["PDF", "XLS/XLSX", "DOCX", "CSV", "TXT", "PNG", "JPG"].map(ext => (
                <span key={ext} style={{
                  padding: "3px 8px", background: (ext === "PDF" || ext === "XLS/XLSX") ? C.primary : C.surfLow,
                  color: (ext === "PDF" || ext === "XLS/XLSX") ? "#fff" : C.secondary,
                  borderRadius: 4, fontSize: 10, fontWeight: 600,
                }}>
                  {ext}
                </span>
              ))}
              <span style={{ fontSize: 11, color: C.secondary, alignSelf: "center", marginLeft: 4 }}>Best results with PDFs and Excel files</span>
            </div>

            {/* Bulk upload callout */}
            <a
              href="/workspace/upload/bulk"
              className="bulk-callout"
              style={{
                display: "flex", alignItems: "center", gap: 14, marginTop: 24, padding: "16px 20px",
                background: "rgba(132, 204, 22, 0.06)", borderRadius: 8,
                border: "1.5px solid rgba(132, 204, 22, 0.2)", textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: "rgba(132, 204, 22, 0.12)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16l-4-4-4 4M12 12v9" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.onSurface, marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>
                  Bulk Upload: upload up to 10 properties at once
                </div>
                <div style={{ fontSize: 13, color: C.secondary }}>
                  Drop up to 10 OMs in one go and each file becomes its own fully-scored deal on your board. Use this when you have a portfolio of separate properties. (The multi-file upload above is different — it merges several documents into a <em>single</em> property.)
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
            <style>{`.bulk-callout:hover { background: rgba(132, 204, 22, 0.1) !important; border-color: rgba(132, 204, 22, 0.35) !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(132, 204, 22, 0.1); }`}</style>
          </div>
        </>
      )}

      {/* ===== PROCESSING ===== */}
      {step === "processing" && (
        <div style={{ background: C.surfLowest, borderRadius: C.radius, boxShadow: C.shadow, padding: 28 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }
            @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

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
                    background: stage.done ? "#D1FAE5" : isCurrent ? "rgba(132, 204, 22, 0.08)" : C.surfLow,
                    border: isCurrent ? `2px solid ${C.primary}` : "2px solid transparent",
                    animation: isCurrent ? "pulse 1.5s ease-in-out infinite" : "none",
                  }}>
                    {stage.done ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isCurrent ? C.primary : C.secondary} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={stage.iconPath} /></svg>
                    )}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: stage.done ? "#059669" : isCurrent ? C.primary : C.secondary }}>
                    {stage.label}
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ position: "relative", top: -26, left: "50%", width: "100%", height: 3, background: stage.done ? "#10B981" : C.surfLow, borderRadius: 2 }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.onSurface, margin: "0 0 4px" }}>{statusMsg}</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: "0 0 4px" }}>
              {statusMsg.includes("Analyzing") ? "AI is extracting property data and calculating underwriting (30-60 seconds)" :
               statusMsg.includes("Reading") ? "Extracting text from your document (5-15 seconds)" :
               statusMsg.includes("image") ? "Capturing property image from PDF (5 seconds)" :
               statusMsg.includes("Detecting") ? "Classifying property type..." :
               "Processing your files..."}
            </p>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#D97706", margin: 0 }}>
              Please stay on this page until processing is complete.
            </p>
          </div>

          <div style={{ marginTop: 16, textAlign: "left" }}>
            {files.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.secondary }}>{f.file.name}</span>
                {f.status === "uploading" && (
                  <div style={{ width: 100, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "#E0F2F1", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#0D9488", borderRadius: 3, width: `${f.progress}%`, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#0D9488", minWidth: 28, textAlign: "right" }}>{f.progress}%</span>
                  </div>
                )}
                {f.status === "complete" && <span style={{ color: "#10B981", fontSize: 13, flexShrink: 0 }}>{"\u2713"}</span>}
                {f.status === "error" && <span style={{ color: C.primary, fontSize: 10, flexShrink: 0 }}>failed</span>}
                {f.status === "pending" && <span style={{ color: C.secondary, fontSize: 10, flexShrink: 0 }}>waiting</span>}
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {cleanDisplayName(p.propertyName, p.address1, p.city, p.state)}{p.city ? ` — ${p.city}, ${p.state}` : ""}
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
