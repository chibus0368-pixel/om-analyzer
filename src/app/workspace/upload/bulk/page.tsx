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
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS, ANALYSIS_TYPE_ICONS } from "@/lib/workspace/types";

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

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setItems(prev => {
      const remaining = MAX_PROPERTIES - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = arr.slice(0, remaining).map(file => ({
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

        // Extract hero image from PDF
        if (file.name.toLowerCase().endsWith(".pdf")) {
          try {
            const heroBlob = await extractHeroImageFromPDF(file);
            if (heroBlob && heroBlob.size > 10000) {
              const imgRef = ref(storage, `workspace/${user.uid}/${propertyId}/hero.jpg`);
              await uploadBytesResumable(imgRef, heroBlob);
              const imgUrl = await getDownloadURL(imgRef);
              const { updateProperty } = await import("@/lib/workspace/firestore");
              await updateProperty(propertyId, { heroImageUrl: imgUrl } as any);
            }
          } catch { /* non-blocking */ }
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
            } catch { /* non-blocking — name will update on next page load */ }
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
        Upload up to {MAX_PROPERTIES} OMs at once — one file per property. Each OM becomes its own property with full analysis.
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
              <span>Drop up to {MAX_PROPERTIES} files — each file is treated as a separate property (one OM per property).</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#C49A3C", flexShrink: 0 }}>2.</span>
              <span>Review the auto-generated property names. Edit any that need a better name.</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#C49A3C", flexShrink: 0 }}>3.</span>
              <span>Hit "Upload All" and we'll process each property one by one — extracting data, running analysis, and generating reports.</span>
            </div>
          </div>
        </div>
      )}

      {/* Drop zone — only show when not processing */}
      {!processing && !allDone && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#84CC16" : "#D8DFE9"}`,
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

          {/* Property list — editable names */}
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
                padding: "11px 32px", background: "#C49A3C", color: "#fff", border: "none",
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                maxWidth: 360,
              }}>
                Upload All ({items.length} propert{items.length !== 1 ? "ies" : "y"})
              </button>
            </div>
          )}
        </>
      )}

      {/* Processing view */}
      {processing && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 24 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }
            @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>


          {/* Stay on page warning */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
            background: "#FFF8E1", border: "1px solid #FFD54F", borderRadius: 10, marginBottom: 16,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#78590B" }}>
              Please stay on this page until all uploads are complete. Leaving will stop remaining uploads.
            </span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#253352", margin: "0 0 4px" }}>
              Processing {completedCount}/{items.length} properties...
            </p>
            <p style={{ fontSize: 12, color: "#8899B0", margin: 0 }}>
              Each property takes 30-60 seconds for full analysis.
            </p>
            {/* Overall progress bar */}
            <div style={{ marginTop: 12, height: 10, background: "#E0F2F1", borderRadius: 5, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#0D9488", borderRadius: 5,
                width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%`,
                transition: "width 0.5s",
              }} />
            </div>
          </div>

          {items.map((item, idx) => (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: idx < items.length - 1 ? "1px solid #F6F8FB" : "none",
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                background: item.status === "done" ? "#D1FAE5"
                  : item.status === "error" ? "#FDE8EA"
                  : item.status === "queued" ? "#F6F8FB" : "#DBEAFE",
                animation: (item.status === "uploading" || item.status === "analyzing") ? "pulse 1.5s ease-in-out infinite" : "none",
              }}>
                {item.status === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                ) : item.status === "error" ? (
                  <span style={{ fontSize: 11, color: "#DC3545", fontWeight: 700 }}>!</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: item.status === "queued" ? "#B4C1D1" : "#2563EB" }}>{idx + 1}</span>
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: "#253352",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{item.propertyName}</div>
                <div style={{ fontSize: 10, color: "#8899B0" }}>
                  {item.status === "queued" && "Waiting..."}
                  {item.status === "uploading" && `Uploading ${item.progress}%`}
                  {item.status === "analyzing" && "AI analyzing..."}
                  {item.status === "done" && "Complete"}
                  {item.status === "error" && (item.error || "Failed")}
                </div>
              </div>
              {(item.status === "uploading") && (
                <div style={{ width: 80, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: "#E0F2F1", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#0D9488", borderRadius: 3, width: `${item.progress}%`, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#0D9488", minWidth: 28, textAlign: "right" }}>{item.progress}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
              {items.filter(i => i.status === "error").length} failed — you can retry from the upload page.
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
              View Scoreboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
