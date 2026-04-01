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
import type { Property, DocCategory } from "@/lib/workspace/types";
import { DOC_CATEGORY_LABELS } from "@/lib/workspace/types";

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

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
  width: "100%", padding: "9px 12px", border: "1.5px solid #D8DFE9",
  borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

type Step = "upload" | "processing" | "name" | "done";

export default function UploadPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProperty = searchParams.get("property") || "";

  // State
  const [step, setStep] = useState<Step>(preselectedProperty ? "upload" : "upload");
  const [properties, setProperties] = useState<Property[]>([]);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState(preselectedProperty);
  const [finalPropertyId, setFinalPropertyId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [parseResult, setParseResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load existing properties for active workspace
  useEffect(() => {
    if (!user || !activeWorkspace) return;
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(setProperties).catch(() => {});
  }, [user, activeWorkspace]);

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

  // STEP 1 → PROCESSING: Upload files, then auto-parse, then show name step
  async function handleUpload() {
    if (!user || files.length === 0) return;
    setStep("processing");
    setStatusMsg("Uploading files...");

    // Auto-derive property name from first file
    const autoName = derivePropertyName(files[0].file.name);
    setPropertyName(autoName);

    // If user pre-selected an existing property, use it
    let propertyId = selectedExistingId;

    // If no existing property selected, create one now with auto-name
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

    // Upload all files
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
        if (heroBlob && heroBlob.size > 10000) { // Only save if > 10KB (not a tiny logo)
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

    // Auto-parse — extract file text client-side first
    setStatusMsg("Reading file contents...");
    try {
      // Extract actual text from files (SheetJS for Excel, text for CSV/TXT)
      const extractedText = await extractTextFromFiles(files.map(f => f.file));

      setStatusMsg("Analyzing property data...");

      const res = await fetch("/api/workspace/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "workspace-default",
          propertyId,
          userId: user.uid,
          documentText: extractedText,
        }),
      });
      const data = await res.json();
      if (data.success && data.fieldsExtracted > 0) {
        setParseResult(`Extracted ${data.fieldsExtracted} fields`);
        // Auto-name property from parsed data — try multiple paths
        const p = data.fields?.property || {};
        const parsedName = p.name || p.property_name
          || data.fields?.property_basics?.property_name?.value
          || data.fields?.property?.name?.value;
        const parsedAddress = p.address
          || data.fields?.property_basics?.address?.value
          || data.fields?.property?.address?.value;
        const parsedCity = p.city
          || data.fields?.property_basics?.city?.value;
        const parsedState = p.state
          || data.fields?.property_basics?.state?.value;

        if (parsedName && parsedName !== "Unknown Property") {
          const fullName = parsedAddress && parsedAddress !== "Unknown Address"
            ? `${parsedName} — ${parsedAddress}`
            : parsedCity && parsedCity !== "Unknown City"
              ? `${parsedName} — ${parsedCity}, ${parsedState || ""}`
              : parsedName;
          setPropertyName(fullName);
          // Server already updated the property, but update client name too
          try {
            const { updateProperty } = await import("@/lib/workspace/firestore");
            await updateProperty(propertyId, { propertyName: fullName } as any);
          } catch { /* non-blocking */ }
        }
        // Generate output files (CSV underwriting + brief)
        setStatusMsg("Generating output files...");
        try {
          await fetch("/api/workspace/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId, userId: user.uid, parsedData: data.fields }),
          });
        } catch { /* non-blocking */ }
      } else {
        setParseResult("Files uploaded. Parsing returned limited data — try a different file format.");
      }
    } catch (parseErr: any) {
      setParseResult(`Files uploaded. Parsing issue: ${parseErr?.message || "try again from property page"}`);
    }

    // Refresh property name from Firestore (server may have updated it from parsed data)
    try {
      const { getProperty } = await import("@/lib/workspace/firestore");
      const refreshed = await getProperty(propertyId);
      if (refreshed?.propertyName && !refreshed.propertyName.includes("Unknown")) {
        setPropertyName(refreshed.propertyName);
      }
    } catch { /* non-blocking */ }

    // Notify sidebar to refresh property list
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }

    // If we used an existing property, skip naming and go straight to done
    if (selectedExistingId) {
      setStep("done");
    } else {
      setStep("name");
    }
  }

  // STEP 2 → Save property name (or use existing)
  async function handleSaveName() {
    if (!finalPropertyId || !propertyName.trim()) return;

    try {
      // Update the property name if user edited it
      const { updateProperty } = await import("@/lib/workspace/firestore");
      await updateProperty(finalPropertyId, { propertyName: propertyName.trim() } as any);
    } catch { /* continue */ }

    // Refresh sidebar
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }

    setStep("done");
  }

  // Switch to existing property instead of auto-created
  async function handleUseExisting(existingId: string) {
    if (!existingId) return;

    // If we already created a new property, delete it
    if (finalPropertyId && finalPropertyId !== existingId) {
      try {
        const { deleteProperty } = await import("@/lib/workspace/firestore");
        await deleteProperty(finalPropertyId, "workspace-default");
      } catch { /* continue */ }
    }

    // Move documents to the existing property
    // (In practice, docs are already created with the old propertyId —
    //  for simplicity we'll just update the finalPropertyId and let the user know)
    setFinalPropertyId(existingId);
    setStep("done");
  }

  const hasFiles = files.length > 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Upload Property{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}</h1>
      <p style={{ fontSize: 13, color: "#5A7091", marginBottom: 20, lineHeight: 1.5 }}>
        One property at a time. A single OM is enough to get started — you can always add more files later.
      </p>

      {/* ===== STEP 1: Upload Files ===== */}
      {step === "upload" && (
        <>
          {/* If adding to existing property, show which one */}
          {selectedExistingId && (
            <div style={{ background: "#D1FAE5", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, color: "#0A7E5A", fontWeight: 500 }}>
              Adding files to: {properties.find(p => p.id === selectedExistingId)?.propertyName || "Selected property"}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#C49A3C" : "#D8DFE9"}`,
              borderRadius: 10, padding: hasFiles ? "20px 16px" : "48px 16px", textAlign: "center",
              cursor: "pointer", background: isDragging ? "#FFF9EE" : "#FAFBFC", transition: "all 0.15s",
              marginBottom: 14,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B4C1D1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#253352", margin: "0 0 4px" }}>
              {isDragging ? "Drop files here" : "Drop your OM or flyer here, or click to browse"}
            </p>
            <p style={{ fontSize: 12, color: "#B4C1D1", margin: 0 }}>
              PDF, DOCX, XLS, XLSX, CSV, PNG, JPG, TXT
            </p>
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* File list */}
          {hasFiles && (
            <>
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #EDF0F5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#5A7091" }}>{files.length} file{files.length !== 1 ? "s" : ""} ready</span>
                  <button onClick={() => setFiles([])} style={{ fontSize: 11, color: "#C52D3A", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
                </div>
                {files.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", borderBottom: "1px solid #F6F8FB", fontSize: 12 }}>
                    <span style={{ padding: "1px 5px", background: "#EDF0F5", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase", flexShrink: 0 }}>
                      {f.file.name.split(".").pop()}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{f.file.name}</span>
                    <select value={f.docCategory || ""} onChange={e => setCat(f.id, e.target.value as DocCategory)}
                      style={{ padding: "3px 6px", border: "1px solid #D8DFE9", borderRadius: 4, fontSize: 10, fontFamily: "inherit", width: 130, flexShrink: 0 }}>
                      {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removeFile(f.id)} style={{ background: "none", border: "none", color: "#B4C1D1", cursor: "pointer", fontSize: 14, flexShrink: 0, padding: 0 }}>&times;</button>
                  </div>
                ))}
              </div>

              <button onClick={handleUpload} className="ws-btn-red" style={{
                padding: "11px 32px", background: "#DC2626", color: "#fff", border: "none",
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}>
                Upload &amp; Analyze
              </button>
            </>
          )}

          {/* ===== Explanatory Section ===== */}
          <div style={{ marginTop: 28, borderTop: "1px solid #EDF0F5", paddingTop: 20 }}>
            <div style={{ fontSize: 12, color: "#8899B0", lineHeight: 1.7 }}>
              <strong style={{ color: "#5A7091" }}>One property at a time.</strong> Upload all files for a single property, then come back for the next one. One complete OM is enough to get started — add rent rolls, T-12s, or leases later.
            </div>

            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["PDF", "XLS/XLSX", "DOCX", "CSV", "TXT", "PNG", "JPG"].map(ext => (
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

            {/* Bulk upload link */}
            <a
              href="/workspace/upload/bulk"
              style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 16px",
                background: "#FAFBFC", borderRadius: 8, border: "1px solid #EDF0F5", textDecoration: "none",
                color: "#5A7091", fontSize: 12, transition: "all 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C49A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2" />
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: "#253352", marginBottom: 1 }}>Have multiple properties?</div>
                <div>Bulk upload up to 10 OMs at once &rarr;</div>
              </div>
            </a>
          </div>
        </>
      )}

      {/* ===== PROCESSING ===== */}
      {step === "processing" && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 28 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }
            @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

          {/* Stage progress */}
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
              You can leave this page — processing will continue in the background.
            </p>
          </div>

          {/* File list */}
          <div style={{ marginTop: 16, textAlign: "left" }}>
            {files.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5A7091" }}>{f.file.name}</span>
                {f.status === "uploading" && (
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <div style={{ height: 3, background: "#EDF0F5", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#C49A3C", width: `${f.progress}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}
                {f.status === "complete" && <span style={{ color: "#10B981", fontSize: 13, flexShrink: 0 }}>{"\u2713"}</span>}
                {f.status === "error" && <span style={{ color: "#C52D3A", fontSize: 10, flexShrink: 0 }}>failed</span>}
                {f.status === "pending" && <span style={{ color: "#B4C1D1", fontSize: 10, flexShrink: 0 }}>waiting</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== STEP 2: Name Property ===== */}
      {step === "name" && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 24 }}>
          {/* Success indicator */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#D1FAE5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 8 }}>
              {"\u2713"}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0A7E5A", margin: "0 0 4px" }}>
              {files.length} file{files.length !== 1 ? "s" : ""} uploaded and analyzed
            </p>
            {parseResult && <p style={{ fontSize: 12, color: "#5A7091", margin: 0 }}>{parseResult}</p>}
          </div>

          {/* Property name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#253352", marginBottom: 6 }}>
              Property Name
            </label>
            <input
              style={inputStyle}
              value={propertyName}
              onChange={e => setPropertyName(e.target.value)}
              placeholder="Enter property name"
              autoFocus
            />
            <p style={{ fontSize: 11, color: "#8899B0", margin: "6px 0 0" }}>
              Auto-generated from your file. Edit if needed.
            </p>
          </div>

          {/* Option to use existing property instead */}
          {properties.length > 0 && (
            <div style={{ borderTop: "1px solid #EDF0F5", paddingTop: 14, marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5A7091", marginBottom: 6 }}>
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
                    {p.propertyName}{p.city ? ` — ${p.city}, ${p.state}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Save */}
          <button onClick={handleSaveName} disabled={!propertyName.trim()} className="ws-btn-red" style={{
            padding: "11px 0", background: "#DC2626", color: "#fff", border: "none",
            borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: propertyName.trim() ? "pointer" : "not-allowed",
            opacity: propertyName.trim() ? 1 : 0.4, fontFamily: "inherit", width: "100%",
          }}>
            Save Property
          </button>
        </div>
      )}

      {/* ===== DONE ===== */}
      {step === "done" && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 32, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#D1FAE5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12 }}>
            {"\u2713"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0B1120", margin: "0 0 6px" }}>Property saved</h2>
          <p style={{ fontSize: 13, color: "#5A7091", margin: "0 0 4px" }}>
            {files.length} file{files.length !== 1 ? "s" : ""} uploaded and analyzed.
          </p>
          {parseResult && <p style={{ fontSize: 12, color: "#8899B0", margin: "0 0 20px" }}>{parseResult}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push(`/workspace/properties/${finalPropertyId}`)} style={{
              padding: "10px 24px", background: "#2563EB", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              View Property
            </button>
            <button onClick={() => {
              setFiles([]); setPropertyName(""); setSelectedExistingId("");
              setFinalPropertyId(""); setStatusMsg(""); setParseResult("");
              setStep("upload");
              // Refresh properties list
              if (user && activeWorkspace) getWorkspaceProperties(user.uid, activeWorkspace.id).then(setProperties).catch(() => {});
            }} style={{
              padding: "10px 24px", background: "#fff", border: "1.5px solid #D8DFE9",
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
