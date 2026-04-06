"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  getProperty, getProjectDocuments, getPropertyExtractedFields,
  getProjectOutputs, getPropertyNotes, createDocument, logActivity, updateProperty, deleteProperty,
} from "@/lib/workspace/firestore";
import type { Property, ProjectDocument, ExtractedField, ProjectOutput, Note, DocCategory } from "@/lib/workspace/types";
import { DOC_CATEGORY_LABELS, ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { generateUnderwritingXLSX, generateBriefDownload } from "@/lib/workspace/generate-files";
import { extractTextFromFiles } from "@/lib/workspace/file-reader";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import Link from "next/link";

import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";

/* ── Design tokens ─────────────────────────────────────── */
const C = {
  primary: "#84CC16",
  primaryContainer: "#84CC16",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  tertiary: "#785800",
  gold: "#C49A3C",
  bg: "#F7F8FA",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
};

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

/* ── File extension icon helper ─────────────────────── */
function fileIcon(ext: string) {
  if (ext === "pdf") return { bg: "#FDE8EA", color: C.primary, label: "PDF" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "#D1FAE5", color: "#059669", label: "XLS" };
  if (["doc", "docx"].includes(ext)) return { bg: "#DBEAFE", color: "#2563EB", label: "DOC" };
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return { bg: "#FEF3C7", color: "#D97706", label: "IMG" };
  return { bg: C.surfLow, color: C.secondary, label: ext.toUpperCase() };
}

/* ── Helpers ────────────────────────────────────────────── */
function guessCategory(filename: string): DocCategory {
  const lower = filename.toLowerCase();
  if (lower.includes("om") || lower.includes("offering") || lower.includes("memorandum")) return "om";
  if (lower.includes("flyer") || lower.includes("brochure")) return "flyer";
  if (lower.includes("rent") && lower.includes("roll")) return "rent_roll";
  if (lower.includes("t12") || lower.includes("t-12") || lower.includes("trailing")) return "t12";
  if (lower.includes("underwriting") || lower.includes("proforma")) return "underwriting";
  if (lower.includes("lease")) return "lease";
  if (/\.(png|jpg|jpeg|webp)$/i.test(lower)) return "image";
  return "misc";
}

function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

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

/* ── Source type for field labels ────────────────────────── */
type SourceType = "from_om" | "calculated" | "needs_review" | "user_confirmed" | "user_adjusted";

function SourceTag({ type }: { type: SourceType }) {
  const config: Record<SourceType, { label: string; bg: string; color: string }> = {
    from_om: { label: "From OM", bg: "#EEF2FF", color: "#4338CA" },
    calculated: { label: "Calculated", bg: "#F0FDF4", color: "#15803D" },
    needs_review: { label: "Needs Review", bg: "#FEF3C7", color: "#92400E" },
    user_confirmed: { label: "User Confirmed", bg: "#D1FAE5", color: "#065F46" },
    user_adjusted: { label: "User Adjusted", bg: "#DBEAFE", color: "#1E40AF" },
  };
  const c = config[type];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
      padding: "2px 7px", borderRadius: 4, background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

/* ── Property image card ─────────────────────────────── */
function PropertyImage({ heroImageUrl, location, encodedAddress, propertyName }: {
  heroImageUrl?: string; location: string; encodedAddress: string; propertyName: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [streetViewError, setStreetViewError] = useState(false);
  const [satelliteError, setSatelliteError] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const hasGoogleApi = !!apiKey && !!location;
  const mapLink = `https://www.google.com/maps/search/${encodedAddress}`;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, overflow: "hidden", borderRadius: C.radius }}>
      {heroImageUrl && !imgError ? (
        <img src={heroImageUrl} alt={propertyName}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
          onError={() => setImgError(true)} />
      ) : hasGoogleApi && !streetViewError ? (
        <a href={mapLink} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
          <img src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodedAddress}&key=${apiKey}`}
            alt={`Street view of ${propertyName}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
            onError={() => setStreetViewError(true)} />
        </a>
      ) : hasGoogleApi && !satelliteError ? (
        <a href={mapLink} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
          <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddress}&zoom=18&size=600x400&maptype=satellite&key=${apiKey}`}
            alt={`Satellite view of ${propertyName}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
            onError={() => setSatelliteError(true)} />
        </a>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", minHeight: 200, background: `linear-gradient(135deg, ${C.surfLow}, ${C.bg})` }}>
          <a href={location ? mapLink : "#"} target="_blank" rel="noopener noreferrer" style={{ textAlign: "center", padding: 20, textDecoration: "none" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
            <div style={{ color: C.secondary, fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>{location || "No address"}</div>
            {location && <div style={{ color: C.gold, fontSize: 10, marginTop: 6 }}>View on Google Maps &rarr;</div>}
          </a>
        </div>
      )}
    </div>
  );
}

/* ── Metric tooltip ──────────────────────────────────── */
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
    <span ref={iconRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "help" }}>
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {show && pos && (
        <span style={{
          position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)",
          background: "#1E293B", color: "#F1F5F9", fontSize: 11, lineHeight: 1.45, padding: "8px 11px",
          borderRadius: 6, whiteSpace: "normal", width: 220, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none",
        }}>
          {text}
          <span style={{ position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1E293B" }} />
        </span>
      )}
    </span>
  );
}

/* ── Score badge (Deal Signals) ─────────────────────────── */
function DealSignalBadge({ score, band }: { score: number | null; band: string }) {
  if (!score) return null;
  const b = band.toLowerCase().replace(/_/g, " ");
  const isGreen = b === "strong buy" || b === "buy" || b === "strong_buy";
  const isYellow = b === "hold" || b === "neutral";
  const color = isGreen ? "#059669" : isYellow ? "#D97706" : "#DC2626";
  const bgColor = isGreen ? "#D1FAE5" : isYellow ? "#FEF3C7" : "#FDE8EA";
  const displayBand = band.replace(/_/g, " ");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: `conic-gradient(${color} ${(score / 100) * 360}deg, ${C.ghost} 0deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 58, height: 58, borderRadius: "50%", background: C.surfLowest,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 800, color, fontVariantNumeric: "tabular-nums",
        }}>{score}</div>
      </div>
      <span style={{
        marginTop: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 0.8, color, padding: "2px 8px", borderRadius: 4, background: bgColor,
      }}>{displayBand}</span>
    </div>
  );
}

/* ── Editable property name (inline click-to-edit) ──── */
function EditablePropertyName({ name, propertyId, onSave }: { name: string; propertyId: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setValue(name); return; }
    try {
      await updateProperty(propertyId, { propertyName: trimmed } as any);
      onSave(trimmed);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
    } catch { /* continue */ }
    setEditing(false);
  }

  if (editing) {
    return (
      <input ref={inputRef} value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(name); } }}
        style={{
          fontSize: 24, fontWeight: 700, color: C.onSurface, background: C.surfLow,
          border: `1px solid ${C.ghost}`, borderRadius: 8, padding: "4px 12px",
          margin: 0, lineHeight: 1.2, width: "100%", outline: "none",
          fontFamily: "'Inter', sans-serif",
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setEditing(true)}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.onSurface, margin: 0, lineHeight: 1.3, fontFamily: "'Inter', sans-serif", letterSpacing: "-0.3px" }}>{name}</h1>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.4 }}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*  PURCHASE PRICE OVERRIDE — recalculate price-sensitive    */
/*  metrics live when user adjusts the purchase price        */
/* ══════════════════════════════════════════════════════════ */
function usePurchasePriceOverride(omPrice: number | null) {
  const [override, setOverride] = useState<number | null>(null);
  const activePrice = override ?? omPrice;
  const isOverridden = override !== null && override !== omPrice;

  const reset = useCallback(() => setOverride(null), []);
  const setPrice = useCallback((val: number | null) => setOverride(val), []);

  return { activePrice, omPrice, override, isOverridden, setPrice, reset };
}

function PurchasePriceControl({ priceState }: {
  priceState: ReturnType<typeof usePurchasePriceOverride>;
}) {
  const { activePrice, omPrice, isOverridden, setPrice, reset } = priceState;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  function startEdit() {
    setInputVal(activePrice ? String(activePrice) : "");
    setEditing(true);
  }

  function commitEdit() {
    const n = Number(inputVal.replace(/[^0-9.]/g, ""));
    if (n > 0) setPrice(n);
    setEditing(false);
  }

  return (
    <div style={{
      background: C.surfLowest, borderRadius: 10, padding: "16px 20px",
      border: `1.5px solid ${isOverridden ? "#3B82F6" : C.ghostBorder}`,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.secondary }}>
          Purchase Price
        </span>
        {isOverridden && <SourceTag type="user_adjusted" />}
      </div>

      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.primary }}>$</span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            style={{
              fontSize: 24, fontWeight: 800, color: C.primary, background: C.surfLow,
              border: `1px solid ${C.ghost}`, borderRadius: 6, padding: "2px 8px",
              outline: "none", width: "100%", fontFamily: "'Inter', sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>
      ) : (
        <div onClick={startEdit} style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontSize: 28, fontWeight: 800, color: C.primary,
            fontVariantNumeric: "tabular-nums", letterSpacing: -0.5,
          }}>
            {fmt$(activePrice)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
      )}

      <p style={{ fontSize: 11, color: C.secondary, margin: "6px 0 0", lineHeight: 1.4 }}>
        Adjust purchase price to see how top-line metrics change.
      </p>

      {isOverridden && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            Original OM value: {fmt$(omPrice)}
          </span>
          <button onClick={reset} style={{
            fontSize: 11, color: "#3B82F6", background: "none", border: "none",
            cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: 0,
            textDecoration: "underline",
          }}>
            Reset to OM value
          </button>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════ */
/*  MAIN PAGE COMPONENT                                      */
/* ══════════════════════════════════════════════════════════ */
export default function PropertyDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const propertyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<Property | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [outputs, setOutputs] = useState<ProjectOutput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [reparseStatus, setReparseStatus] = useState("");
  const [deepResearchLoading, setDeepResearchLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState<any>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      console.log("[PropertyDetail] loadData start, propertyId:", propertyId);
      const p = await getProperty(propertyId);
      console.log("[PropertyDetail] getProperty result:", p ? p.propertyName : "null");
      setProperty(p);
      if (p) {
        const [docs, extFields, outs, nts] = await Promise.all([
          getProjectDocuments(p.projectId, propertyId),
          getPropertyExtractedFields(propertyId),
          getProjectOutputs(p.projectId),
          getPropertyNotes(propertyId),
        ]);
        console.log("[PropertyDetail] loaded:", { docs: docs.length, fields: extFields.length, outputs: outs.length, notes: nts.length });
        setDocuments(docs);
        setFields(extFields);
        setOutputs(outs.filter(o => o.propertyId === propertyId));
        setNotes(nts);
      }
    } catch (err) {
      console.error("[PropertyDetail] loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch user tier for feature gating
  useEffect(() => {
    (async () => {
      try {
        const { getAuth, onAuthStateChanged } = await import("firebase/auth");
        const auth = getAuth();
        onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            const token = await fbUser.getIdToken();
            const res = await fetch("/api/workspace/usage", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const data = await res.json();
              setUserTier(data.tier || "free");
            }
          }
        });
      } catch {}
    })();
  }, []);

  // Load cached deep research on mount
  useEffect(() => {
    if (!propertyId) return;
    fetch(`/api/workspace/deep-research?propertyId=${propertyId}`)
      .then(r => r.json())
      .then(data => { if (data.exists !== false && data.sections) setDeepResearch(data); })
      .catch(() => {});
  }, [propertyId]);

  // Auto-poll while property is still processing
  // NOTE: Must be before conditional early returns to satisfy React Rules of Hooks
  const processingStatus = (property as any)?.processingStatus || "";
  useEffect(() => {
    if (!processingStatus || processingStatus === "complete") return;
    const interval = setInterval(() => { loadData(); }, 5000);
    return () => clearInterval(interval);
  }, [processingStatus, loadData]);

  /* ── File upload handler ────────────────────────────── */
  async function handleFileUpload(fileList: FileList) {
    if (!fileList.length || !property || !user) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const storedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `workspace/${user.uid}/${property.projectId}/${propertyId}/inputs/${storedName}`;
      try {
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed", null, reject, async () => {
            await getDownloadURL(uploadTask.snapshot.ref);
            await createDocument({
              projectId: property.projectId, userId: user.uid, propertyId,
              originalFilename: file.name, storedFilename: storedName, fileExt: ext,
              mimeType: file.type, fileSizeBytes: file.size, storagePath,
              docCategory: guessCategory(file.name), parserStatus: "uploaded",
              isArchived: false, isDeleted: false,
              uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            resolve();
          });
        });
      } catch (err) { console.error(err); }
    }

    setReparsing(true);
    try {
      const updatedDocs = await getProjectDocuments(property.projectId, propertyId);
      setDocuments(updatedDocs);
      const newFiles = Array.from(fileList);
      const extractedText = await extractTextFromFiles(newFiles);
      const analysisType = activeWorkspace?.analysisType || "retail";
      const parseRes = await fetch("/api/workspace/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: property.projectId, propertyId, userId: user.uid, documentText: extractedText, analysisType }),
      });
      const parseData = await parseRes.json().catch(() => ({}));
      // Run generate + score after successful parse
      if (parseData.success && parseData.fieldsExtracted > 0) {
        try { await fetch("/api/workspace/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, parsedData: parseData.fields }) }); } catch { /* non-blocking */ }
        try { await fetch("/api/workspace/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, analysisType }) }); } catch { /* non-blocking */ }
      }
      const newFields = await getPropertyExtractedFields(propertyId);
      setFields(newFields);
    } catch (err) { console.error("[file-add] Parse pipeline failed:", err); }
    setReparsing(false);
    setUploading(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
  }

  /* ── Re-analyze handler ─────────────────────────────── */
  async function handleReAnalyze() {
    if (!property || !user || reparsing) return;
    setReparsing(true);
    setReparseStatus("Downloading files from storage...");
    try {
      const fileObjects: File[] = [];
      for (const doc of documents) {
        if (!doc.storagePath) continue;
        try {
          const fileStorageRef = ref(storage, doc.storagePath);
          const url = await getDownloadURL(fileStorageRef);
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          fileObjects.push(new File([blob], doc.originalFilename || `file.${doc.fileExt}`, { type: doc.mimeType || blob.type }));
        } catch (dlErr) { console.warn(`[re-analyze] Failed to download ${doc.originalFilename}:`, dlErr); }
      }
      if (fileObjects.length === 0) { setReparseStatus("No files could be downloaded."); setReparsing(false); return; }

      setReparseStatus(`Extracting text from ${fileObjects.length} file(s)...`);
      const extractedText = await extractTextFromFiles(fileObjects);
      if (!extractedText || extractedText.trim().length < 50) { setReparseStatus("Could not extract usable text."); setReparsing(false); return; }

      setReparseStatus("Scanning deal data...");
      const analysisType = activeWorkspace?.analysisType || "retail";
      const parseRes = await fetch("/api/workspace/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: property.projectId, propertyId, userId: user.uid, documentText: extractedText, analysisType }),
      });
      const parseData = await parseRes.json();

      if (parseData.success && parseData.fieldsExtracted > 0) {
        setReparseStatus("Generating output files...");
        try { await fetch("/api/workspace/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, parsedData: parseData.fields }) }); } catch { /* non-blocking */ }
        setReparseStatus("Calculating Deal Signals...");
        try { await fetch("/api/workspace/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, userId: user.uid, analysisType }) }); } catch { /* non-blocking */ }
        setReparseStatus(`Complete — ${parseData.fieldsExtracted} fields extracted.`);
      } else {
        setReparseStatus("Scan returned limited data.");
      }
      await loadData();
    } catch (err: any) {
      console.error("Re-analyze failed:", err);
      setReparseStatus(`Failed: ${err?.message || "unknown error"}`);
    }
    setReparsing(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
    setTimeout(() => setReparseStatus(""), 6000);
  }

  /* ── Loading / not found states ─────────────────────── */
  if (loading) return (
    <div style={{ padding: 60, textAlign: "center", color: C.secondary }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${C.ghost}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Loading deal...
    </div>
  );
  if (!property) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.onSurface }}>Property not found</h2>
      <Link href="/workspace" style={{ color: C.gold, fontSize: 13 }}>Back to dashboard</Link>
    </div>
  );

  /* ── Derived data ───────────────────────────────────── */
  const g = (group: string, name: string) => gf(fields, group, name);
  const location = [property.address1, property.city, property.state].filter(Boolean).join(", ");
  const brief = String(notes.find(n => n.noteType === "investment_thesis")?.content || "");
  const hasData = fields.length > 0;
  const encodedAddress = encodeURIComponent(location || property.propertyName);
  const wsType = activeWorkspace?.analysisType || "retail";

  const scoreTotal = (property as any).scoreTotal || null;
  const scoreBand = (property as any).scoreBand || "";

  /* Count pulled / calculated / review items */
  const omPurchasePrice = Number(g("pricing_deal_terms", "asking_price")) || null;

  return <PropertyDetailInner
    property={property} setProperty={setProperty} propertyId={propertyId}
    fields={fields} notes={notes} documents={documents} outputs={outputs}
    hasData={hasData} brief={brief} location={location} encodedAddress={encodedAddress}
    wsType={wsType} scoreTotal={scoreTotal} scoreBand={scoreBand}
    processingStatus={processingStatus}
    omPurchasePrice={omPurchasePrice} activeWorkspace={activeWorkspace}
    handleFileUpload={handleFileUpload} handleReAnalyze={handleReAnalyze}
    reparsing={reparsing} reparseStatus={reparseStatus} uploading={uploading}
    fileRef={fileRef} g={g}
    user={user}
    deepResearchLoading={deepResearchLoading} setDeepResearchLoading={setDeepResearchLoading}
    deepResearch={deepResearch} setDeepResearch={setDeepResearch}
    feedbackSent={feedbackSent} setFeedbackSent={setFeedbackSent}
    reviewExpanded={reviewExpanded} setReviewExpanded={setReviewExpanded}
    userTier={userTier}
  />;
}

/* ══════════════════════════════════════════════════════════ */
/*  INNER RENDER — split so usePurchasePriceOverride works   */
/* ══════════════════════════════════════════════════════════ */
function PropertyDetailInner({
  property, setProperty, propertyId, fields, notes, documents, outputs,
  hasData, brief, location, encodedAddress, wsType, scoreTotal, scoreBand,
  processingStatus,
  omPurchasePrice, activeWorkspace, handleFileUpload, handleReAnalyze, reparsing, reparseStatus,
  uploading, fileRef, g, user,
  deepResearchLoading, setDeepResearchLoading, deepResearch, setDeepResearch,
  feedbackSent, setFeedbackSent, reviewExpanded, setReviewExpanded,
  userTier,
}: any) {

  const priceState = usePurchasePriceOverride(omPurchasePrice);
  const { activePrice, isOverridden } = priceState;

  /* ── Calculated metrics that react to purchase price ── */
  const noiOm = Number(g("expenses", "noi_om")) || 0;
  const bldgSf = Number(g("property_basics", "building_sf")) || 0;
  const intRate = Number(g("debt_assumptions", "interest_rate")) || 7.25;
  const amortYrs = Number(g("debt_assumptions", "amortization_years")) || 25;
  const ltvPct = (Number(g("debt_assumptions", "ltv")) || 65) / 100;
  const closingPct = 0.02;

  const calc = useMemo(() => {
    const price = activePrice || 0;
    if (!price) return null;

    const capRate = noiOm > 0 ? (noiOm / price) * 100 : null;
    const priceSf = bldgSf > 0 ? price / bldgSf : null;
    const loanAmt = price * ltvPct;
    const downPayment = price * (1 - ltvPct);
    const closingCosts = price * closingPct;
    const totalEquity = downPayment + closingCosts;
    const mRate = (intRate / 100) / 12;
    const annualDS = loanAmt > 0 ? (loanAmt * mRate) / (1 - Math.pow(1 + mRate, -12 * amortYrs)) * 12 : 0;
    const dscr = annualDS > 0 && noiOm > 0 ? noiOm / annualDS : null;
    const cashOnCash = totalEquity > 0 && noiOm > 0 ? ((noiOm - annualDS) / totalEquity) * 100 : null;
    const debtYield = loanAmt > 0 && noiOm > 0 ? (noiOm / loanAmt) * 100 : null;

    return { capRate, priceSf, loanAmt, totalEquity, annualDS, dscr, cashOnCash, debtYield };
  }, [activePrice, noiOm, bldgSf, intRate, amortYrs, ltvPct]);

  /* ── Pulled from OM fields ─────────────────────────── */
  const pulledFields = useMemo(() => {
    if (wsType === "land") return [
      { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")), key: "asking_price" },
      { label: "Total Acres", value: g("property_basics", "lot_acres") || "--", key: "lot_acres" },
      { label: "Zoning", value: g("land_zoning", "current_zoning") || "--", key: "zoning" },
      { label: "Planned Use", value: g("land_zoning", "planned_use") || "--", key: "planned_use" },
      { label: "Road Access", value: g("land_access", "road_access") || "--", key: "road_access" },
      { label: "Water", value: g("land_utilities", "water") === true ? "Yes" : g("land_utilities", "water") === false ? "No" : "--", key: "water" },
      { label: "Sewer", value: g("land_utilities", "sewer") === true ? "Yes" : g("land_utilities", "sewer") === false ? "No" : "--", key: "sewer" },
      { label: "Flood Zone", value: g("property_basics", "flood_zone") || "--", key: "flood_zone" },
    ].filter(f => f.value !== "--" && f.value !== null);

    return [
      { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")), key: "asking_price" },
      { label: "GLA", value: fmtSF(g("property_basics", "building_sf")), key: "building_sf" },
      { label: "Occupancy", value: fmtPct(g("property_basics", "occupancy_pct")), key: "occupancy_pct" },
      { label: "Base Rent", value: fmt$(g("income", "base_rent")), key: "base_rent" },
      { label: "NOI (Stated)", value: fmt$(g("expenses", "noi_om")), key: "noi_om" },
      { label: "Cap Rate (Stated)", value: fmtPct(g("pricing_deal_terms", "cap_rate_om")), key: "cap_rate_om" },
      { label: "Year Built", value: g("property_basics", "year_built") || "--", key: "year_built" },
      { label: "Tenant Count", value: g("property_basics", "tenant_count") || "--", key: "tenant_count" },
      { label: "WALE", value: g("property_basics", "wale_years") ? `${g("property_basics", "wale_years")} yrs` : (g("rent_roll", "wale") ? `${g("rent_roll", "wale")} yrs` : "--"), key: "wale" },
      { label: "CAM Expenses", value: fmt$(g("expenses", "cam_expenses")), key: "cam_expenses" },
      { label: "Property Taxes", value: fmt$(g("expenses", "property_taxes")), key: "property_taxes" },
      { label: "Insurance", value: fmt$(g("expenses", "insurance")), key: "insurance" },
    ].filter(f => f.value !== "--" && f.value !== null);
  }, [fields, wsType]);

  /* ── Calculated fields (depend on purchase price) ──── */
  const calculatedFields = useMemo(() => {
    if (!calc || wsType === "land") return [];
    const out: { label: string; value: string; tooltip: string; priceAffected: boolean }[] = [];
    if (calc.capRate !== null) out.push({ label: "Cap Rate", value: `${calc.capRate.toFixed(2)}%`, tooltip: "NOI ÷ Purchase Price", priceAffected: true });
    if (calc.priceSf !== null) out.push({ label: "Price / SF", value: `$${calc.priceSf.toFixed(0)}/SF`, tooltip: "Purchase Price ÷ GLA", priceAffected: true });
    if (calc.dscr !== null) out.push({ label: "DSCR", value: `${calc.dscr.toFixed(2)}x`, tooltip: "NOI ÷ Annual Debt Service", priceAffected: true });
    if (calc.cashOnCash !== null) out.push({ label: "Cash-on-Cash", value: `${calc.cashOnCash.toFixed(1)}%`, tooltip: "Pre-tax cash flow ÷ Total equity invested", priceAffected: true });
    if (calc.debtYield !== null) out.push({ label: "Debt Yield", value: `${calc.debtYield.toFixed(2)}%`, tooltip: "NOI ÷ Loan Amount", priceAffected: true });
    if (calc.totalEquity > 0) out.push({ label: "Equity Required", value: fmt$(calc.totalEquity), tooltip: "Down payment + closing costs", priceAffected: true });
    if (calc.loanAmt > 0) out.push({ label: "Loan Amount", value: fmt$(calc.loanAmt), tooltip: `Based on ${(ltvPct * 100).toFixed(0)}% LTV`, priceAffected: true });
    if (calc.annualDS > 0) out.push({ label: "Debt Service", value: fmt$(calc.annualDS), tooltip: "Annual mortgage payment", priceAffected: true });
    return out;
  }, [calc, wsType, ltvPct]);

  /* ── Review items ──────────────────────────────────── */
  const reviewItems = useMemo(() => {
    const items: string[] = [];
    if (wsType === "land") return items;

    const mgmt = g("expenses", "management_fee");
    const reserves = g("expenses", "reserves");
    const totalExp = g("expenses", "total_expenses");
    const noiOmVal = g("expenses", "noi_om");
    const noiAdj = g("expenses", "noi_adjusted");
    const vacancy = g("income", "vacancy_allowance");
    const wale = g("rent_roll", "wale") || g("rent_roll", "weighted_avg_lease_term");
    const capStated = g("pricing_deal_terms", "cap_rate_om");

    if (!mgmt || Number(mgmt) === 0) items.push("No management fee in OM — typically 3–6% of EGI");
    if (!reserves || Number(reserves) === 0) items.push("No capital reserves listed — typically $0.15–0.25/SF");
    if (!vacancy || Number(vacancy) === 0) items.push("No vacancy allowance — typical underwriting uses 3–5%");
    if (!totalExp || Number(totalExp) === 0) items.push("No operating expenses listed — verify NNN reimbursements");
    if (noiOmVal && noiAdj && Math.abs(Number(noiAdj) - Number(noiOmVal)) > 1000) {
      items.push("NOI appears in more than one form — verify which is correct");
    }
    if (wale && Number(wale) < 5) items.push(`Short WALE (${Number(wale).toFixed(1)} yrs) — lease rollover risk ahead`);
    if (capStated && calc?.capRate) {
      const stated = Number(capStated);
      const calculated = calc.capRate;
      if (Math.abs(stated - calculated) > 0.3) {
        items.push(`Stated cap rate (${stated.toFixed(2)}%) differs from calculated (${calculated.toFixed(2)}%) — reconcile`);
      }
    }

    // Tenant rent roll reconciliation
    const tenantFields = fields.filter((f: ExtractedField) => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
    const tenantRents = tenantFields.map((f: ExtractedField) => {
      const num = f.fieldName.match(/^tenant_(\d+)_name$/)?.[1];
      return num ? Number(g("rent_roll", `tenant_${num}_rent`)) || 0 : 0;
    });
    const totalTenantRent = tenantRents.reduce((s: number, v: number) => s + v, 0);
    const baseRent = Number(g("income", "base_rent")) || 0;
    if (totalTenantRent > 0 && baseRent > 0 && Math.abs(totalTenantRent - baseRent) / baseRent > 0.1) {
      items.push("Summary rent and rent roll totals may not fully reconcile");
    }

    return items;
  }, [fields, wsType, calc]);

  /* ── Tenants ────────────────────────────────────────── */
  const tenants = useMemo(() => {
    const tenantFields = fields.filter((f: ExtractedField) => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
    return tenantFields.map((f: ExtractedField) => {
      const num = f.fieldName.match(/^tenant_(\d+)_name$/)?.[1];
      if (!num) return null;
      return {
        name: String(f.normalizedValue || f.rawValue),
        sf: g("rent_roll", `tenant_${num}_sf`),
        rent: g("rent_roll", `tenant_${num}_rent`),
        type: g("rent_roll", `tenant_${num}_type`),
        end: g("rent_roll", `tenant_${num}_lease_end`),
        status: g("rent_roll", `tenant_${num}_status`),
      };
    }).filter(Boolean);
  }, [fields]);

  /* ── Signals ────────────────────────────────────────── */
  const signals = useMemo(() => {
    return (wsType === "land" ? [
      ["Overall", g("signals", "overall_signal")],
      ["Pricing", g("signals", "pricing_signal")],
      ["Location", g("signals", "location_signal")],
      ["Zoning", g("signals", "zoning_signal")],
    ] : [
      ["Overall", g("signals", "overall_signal")],
      ["Cap Rate", g("signals", "cap_rate_signal")],
      ["DSCR", g("signals", "dscr_signal")],
      ["Occupancy", g("signals", "occupancy_signal")],
      ["Basis / Price", g("signals", "basis_signal")],
      ["Tenant Quality", g("signals", "tenant_quality_signal")],
    ]).filter(([, v]) => v);
  }, [fields, wsType]);

  /* ── Price sensitivity mini ────────────────────────── */
  const priceSensitivity = useMemo(() => {
    if (!omPurchasePrice || noiOm <= 0) return null;
    const omCap = (noiOm / omPurchasePrice) * 100;
    const curCap = activePrice ? (noiOm / activePrice) * 100 : omCap;
    const per100k = activePrice && activePrice > 100000 ? (noiOm / (activePrice - 100000)) * 100 : null;
    return { omCap, curCap, per100k };
  }, [omPurchasePrice, activePrice, noiOm]);

  /* Data counts */
  const pulledCount = pulledFields.length;
  const calcCount = calculatedFields.length;
  const reviewCount = reviewItems.length;

  /* ═══════════════════════════════════════════════════════ */
  /*  RENDER                                                 */
  /* ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <style>{`
        .card-hover { transition: all 0.2s cubic-bezier(0.4,0,0.2,1); }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(21,27,43,0.08); }
        .dl-btn { transition: all 0.15s ease; }
        .dl-btn:hover { background: ${C.surfLow} !important; border-color: ${C.gold} !important; }
        .doc-row { transition: all 0.12s ease; }
        .doc-row:hover { background: ${C.surfLow} !important; }
        .section-row { transition: background 0.15s ease; }
        .section-row:hover { background: ${C.surfLow} !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeHighlight { 0% { background: #DBEAFE; } 100% { background: transparent; } }
      `}</style>

      {/* ── Breadcrumb ──────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.secondary }}>
          <Link href="/workspace" style={{ color: C.secondary, textDecoration: "none" }}>Dashboard</Link>
          <span style={{ margin: "0 6px", opacity: 0.4 }}>/</span>
          <span style={{ color: C.onSurface, fontWeight: 500 }}>{property.propertyName}</span>
        </div>
        <Link href={`/workspace/share?ws=${activeWorkspace?.slug || "default-dealboard"}`} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 16px", borderRadius: 8,
          background: "rgba(132, 204, 22, 0.1)", color: "#84CC16",
          fontSize: 12, fontWeight: 600, textDecoration: "none",
          border: "1px solid rgba(132, 204, 22, 0.2)",
          transition: "all 0.15s",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share DealBoard
        </Link>
      </div>

      {/* ── Processing Status Banner ─────────────────────── */}
      {processingStatus && processingStatus !== "complete" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
          background: "rgba(37, 99, 235, 0.06)", border: "1px solid rgba(37, 99, 235, 0.15)",
          borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: `3px solid rgba(37, 99, 235, 0.15)`, borderTopColor: "#2563EB",
            animation: "spin 0.8s linear infinite", flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af" }}>
              {processingStatus === "parsing" ? "Extracting data from documents…" :
               processingStatus === "generating" ? "Generating analysis report…" :
               processingStatus === "scoring" ? "Running scoring models…" :
               "Processing deal…"}
            </div>
            <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 2 }}>
              This page will update automatically when analysis is complete.
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  1. PROPERTY HEADER                                 */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 24 }}>
        <EditablePropertyName
          name={cleanDisplayName(property.propertyName, property.address1, property.city, property.state)}
          propertyId={propertyId}
          onSave={(newName: string) => setProperty((prev: Property | null) => prev ? { ...prev, propertyName: newName } : prev)}
        />
        {location && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>{location}</p>
            <a href={`https://www.google.com/maps/search/${encodedAddress}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: C.secondary, textDecoration: "none", padding: "3px 10px", background: C.surfLow, borderRadius: 6, fontWeight: 500, border: `1px solid ${C.ghostBorder}` }}>
              Map &rarr;
            </a>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  2. OUR TAKE + DEAL SCORE (COMBINED)                */}
      {/* ═══════════════════════════════════════════════════ */}
      {(brief || scoreTotal) && (
        <div style={{
          background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)", padding: "24px 28px",
          display: "flex", justifyContent: "space-between", gap: 32, marginBottom: 24,
        }}>
          {/* Left: Our Take */}
          {brief ? (
            <div style={{ flex: 1, maxWidth: 640 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>OUR TAKE</div>
              <div style={{ fontSize: 15, color: "#0F172A", lineHeight: 1.8 }}>
                {brief.split("\n").filter((p: string) => p.trim()).slice(0, 4).map((p: string, i: number) => (
                  <p key={i} style={{ margin: "0 0 8px" }}>{p}</p>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Right: Deal Score */}
          {scoreTotal && (
            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.secondary, marginBottom: 4 }}>DEAL SCORE</div>
              <DealSignalBadge score={scoreTotal} band={scoreBand} />
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  3. METRICS STRIP (INLINE, NOT CARDS)               */}
      {/* ═══════════════════════════════════════════════════ */}
      {hasData && wsType !== "land" && (() => {
        const metrics = [
          { label: "Price", value: priceState.overriddenPrice ? fmt$(priceState.overriddenPrice) : fmt$(priceState.omPrice), isEditable: true },
          { label: "Cap Rate", value: calc?.capRate ? `${calc.capRate.toFixed(2)}%` : "--" },
          { label: "NOI", value: fmt$(noiOm) },
          { label: "DSCR", value: calc?.dscr ? `${calc.dscr.toFixed(2)}x` : "--" },
          { label: "Price / SF", value: calc?.priceSf ? `$${calc.priceSf.toFixed(0)}/SF` : "--" },
          { label: "Cash-on-Cash", value: calc?.cashOnCash ? `${calc.cashOnCash.toFixed(1)}%` : "--" },
        ].filter(m => m.value !== "--");
        return (
          <div style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {metrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < metrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Land metrics strip */}
      {hasData && wsType === "land" && (() => {
        const landMetrics = [
          { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")) },
          { label: "Price / Acre", value: g("pricing_deal_terms", "price_per_acre") ? fmt$(g("pricing_deal_terms", "price_per_acre")) : "--" },
          { label: "Acres", value: g("property_basics", "lot_acres") || "--" },
          { label: "Zoning", value: g("land_zoning", "current_zoning") || "--" },
        ].filter(c => c.value !== "--");
        return (
          <div style={{
            display: "flex", gap: 0, marginBottom: 24,
            background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}>
            {landMetrics.map((m, i) => (
              <div key={m.label} style={{
                flex: 1, padding: "16px 20px",
                borderRight: i < landMetrics.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Downloads + data counts */}
      {hasData && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={async () => { try { await generateUnderwritingXLSX(property.propertyName, fields, wsType); } catch (e: any) { alert("XLSX failed: " + (e?.message || "unknown")); } }}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${C.ghostBorder}`, background: C.surfLow,
                color: C.onSurface, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A7E5A" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Workbook
              <span style={{ padding: "1px 5px", background: "#D1FAE5", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#0A7E5A" }}>XLSX</span>
            </button>
            <button
              onClick={() => generateBriefDownload(property.propertyName, brief, fields, wsType)}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${C.ghostBorder}`, background: C.surfLow,
                color: C.onSurface, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Brief
              <span style={{ padding: "1px 5px", background: "#DBEAFE", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#2563EB" }}>DOC</span>
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span style={{ fontSize: 11, color: "#4338CA", fontWeight: 600 }}>{pulledCount} pulled</span>
            <span style={{ fontSize: 11, color: C.secondary, margin: "0 8px", opacity: 0.4 }}>&middot;</span>
            <span style={{ fontSize: 11, color: "#15803D", fontWeight: 600 }}>{calcCount} calculated</span>
            {reviewCount > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.secondary, margin: "0 8px", opacity: 0.4 }}>&middot;</span>
                <span style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>{reviewCount} review</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  3. PRICE SENSITIVITY MINI                         */}
      {/* ═══════════════════════════════════════════════════ */}
      {priceSensitivity && isOverridden && wsType !== "land" && (
        <div style={{
          background: "#F8FAFC", borderRadius: 10, padding: "12px 18px",
          border: `1px solid ${C.ghostBorder}`, marginBottom: 16,
          display: "flex", gap: 24, alignItems: "center", fontSize: 12,
        }}>
          <span style={{ color: C.secondary, fontWeight: 500 }}>
            At OM price: <strong style={{ color: C.onSurface }}>{priceSensitivity.omCap.toFixed(2)}% cap</strong>
          </span>
          <span style={{ color: "#3B82F6", fontWeight: 600 }}>
            At adjusted price: <strong>{priceSensitivity.curCap.toFixed(2)}% cap</strong>
          </span>
          {priceSensitivity.per100k && (
            <span style={{ color: "#6B7280", fontSize: 11 }}>
              Every $100K lower &rarr; ~{priceSensitivity.per100k.toFixed(2)}% cap
            </span>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  4. WHAT TO DOUBLE CHECK (Review Panel)            */}
      {/* ═══════════════════════════════════════════════════ */}
      {reviewItems.length > 0 && (
        <div style={{
          background: "#FFFBF0", borderRadius: C.radius, overflow: "hidden",
          border: "1px solid #F3E8C8", marginBottom: 16,
        }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3E8C8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#92400E", fontFamily: "'Inter', sans-serif" }}>What to Double Check</h3>
            </div>
            {reviewItems.length > 3 && (
              <button onClick={() => setReviewExpanded(!reviewExpanded)} style={{
                fontSize: 11, color: "#92400E", background: "none", border: "none", cursor: "pointer",
                fontWeight: 600, fontFamily: "inherit",
              }}>
                {reviewExpanded ? "Show less" : `+${reviewItems.length - 3} more`}
              </button>
            )}
          </div>
          <div style={{ padding: "10px 18px" }}>
            <p style={{ fontSize: 11, color: "#78350F", margin: "0 0 8px", opacity: 0.7 }}>
              These are the parts of the deal most likely to benefit from a quick human review.
            </p>
            {(reviewExpanded ? reviewItems : reviewItems.slice(0, 3)).map((note: string, i: number) => (
              <div key={i} style={{ fontSize: 12, color: "#78350F", padding: "5px 0", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5 }}>
                <span style={{ color: "#D97706", fontWeight: 700, flexShrink: 0 }}>•</span>
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (Deal Brief now shown in combined Our Take + Score block above) */}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  6A. PULLED FROM OM                                 */}
      {/* ═══════════════════════════════════════════════════ */}
      {hasData && pulledFields.length > 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16,
        }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#F9FAFB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 3, height: 14, background: "#4338CA", borderRadius: 2 }} />
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Pulled from OM</h3>
            </div>
            <p style={{ fontSize: 11, color: C.secondary, margin: "4px 0 0 11px" }}>Extracted directly from the uploaded document</p>
          </div>
          <div>
            {pulledFields.map((f: any, i: number) => (
              <div key={f.key} className="section-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 18px",
                borderBottom: i < pulledFields.length - 1 ? `1px solid rgba(0,0,0,0.04)` : "none",
              }}>
                <span style={{ fontSize: 12, color: C.secondary, display: "flex", alignItems: "center", gap: 6 }}>
                  {f.label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {f.value}
                  </span>
                  <SourceTag type="from_om" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  6B. CALCULATED VALUES                              */}
      {/* ═══════════════════════════════════════════════════ */}
      {calculatedFields.length > 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16,
        }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#F9FAFB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 3, height: 14, background: "#15803D", borderRadius: 2 }} />
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Calculated Values</h3>
            </div>
            <p style={{ fontSize: 11, color: C.secondary, margin: "4px 0 0 11px" }}>Derived from extracted values and current purchase price</p>
          </div>
          <div>
            {calculatedFields.map((f: any, i: number) => (
              <div key={f.label} className="section-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 18px",
                borderBottom: i < calculatedFields.length - 1 ? `1px solid rgba(0,0,0,0.04)` : "none",
              }}>
                <span style={{ fontSize: 12, color: C.secondary, display: "flex", alignItems: "center", gap: 6 }}>
                  {f.label}
                  {f.tooltip && <MetricTooltip text={f.tooltip} />}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {f.value}
                  </span>
                  <SourceTag type="calculated" />
                  {f.priceAffected && isOverridden && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#3B82F6"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  6C. SIGNAL ASSESSMENT                              */}
      {/* ═══════════════════════════════════════════════════ */}
      {signals.length > 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16,
        }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#F9FAFB", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 3, height: 14, background: C.gold, borderRadius: 2 }} />
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Signal Assessment</h3>
          </div>
          <div>
            {signals.map(([label, val]: [string, string], i: number) => {
              const valStr = String(val);
              const hasGreen = valStr.includes("\u{1F7E2}") || valStr.toLowerCase().includes("green");
              const hasRed = valStr.includes("\u{1F534}") || valStr.toLowerCase().includes("red");
              const color = hasGreen ? "#059669" : hasRed ? "#DC2626" : "#D97706";
              const bgColor = hasGreen ? "#F0FDF4" : hasRed ? "#FEF2F2" : "#FFFBEB";
              return (
                <div key={String(label)} style={{
                  padding: "12px 18px",
                  borderBottom: i < signals.length - 1 ? `1px solid rgba(0,0,0,0.04)` : "none",
                  borderLeft: `3px solid ${color}`,
                  background: bgColor,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {String(label)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color, lineHeight: 1.5, margin: "0 0 0 16px", wordBreak: "break-word" }}>
                    {valStr.replace(/[\u{1F7E2}\u{1F7E1}\u{1F534}]/gu, "").trim()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  7. TENANT SUMMARY                                  */}
      {/* ═══════════════════════════════════════════════════ */}
      {wsType !== "land" && tenants.length > 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16,
        }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#F9FAFB" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Tenant Summary</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Tenant</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>SF</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Annual Rent</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Lease End</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={i} style={{ borderBottom: `1px solid rgba(0,0,0,0.04)`, background: "#FFFFFF" }}>
                  <td style={{ padding: "8px 16px", fontWeight: 600, color: C.onSurface }}>{t.name}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt$(t.rent)}</td>
                  <td style={{ padding: "8px 12px", color: C.secondary }}>{t.type || "--"}</td>
                  <td style={{ padding: "8px 12px", color: C.secondary }}>{t.end || "--"}</td>
                </tr>
              ))}
            </tbody>
            {tenants.length > 1 && (() => {
              const totalSf = tenants.reduce((sum: number, t: any) => sum + (Number(t.sf) || 0), 0);
              const totalRent = tenants.reduce((sum: number, t: any) => sum + (Number(t.rent) || 0), 0);
              return (
                <tfoot>
                  <tr style={{ background: "#F9FAFB", borderTop: `2px solid rgba(0,0,0,0.04)` }}>
                    <td style={{ padding: "8px 16px", fontWeight: 700, color: C.onSurface }}>Total ({tenants.length} tenants)</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.onSurface }}>{totalSf > 0 ? totalSf.toLocaleString() : "--"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.onSurface }}>{totalRent > 0 ? fmt$(totalRent) : "--"}</td>
                    <td colSpan={2} style={{ padding: "8px 12px", color: C.secondary, fontSize: 11 }}>
                      {totalSf > 0 && totalRent > 0 ? `Avg $${(totalRent / totalSf).toFixed(2)}/SF` : ""}
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  8. SOURCE DOCUMENTS                                */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{
        background: "#FFFFFF", borderRadius: C.radius, border: `1px solid rgba(0,0,0,0.06)`,
        padding: 20, marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: documents.length > 0 ? 14 : 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>
                Source Documents
              </h3>
              <span style={{ fontSize: 11, color: C.secondary, fontWeight: 500 }}>({documents.length})</span>
              {(reparsing || reparseStatus) && (
                <span style={{ fontSize: 11, color: reparseStatus.includes("failed") || reparseStatus.includes("Could not") ? "#DC2626" : "#2563EB", fontWeight: 500 }}>
                  {reparseStatus || "Scanning..."}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Only show Re-analyze if: property has docs but no extracted fields (scan failed/incomplete) */}
            {documents.length > 0 && !hasData && (
              <button onClick={handleReAnalyze} style={{
                padding: "8px 14px", background: C.surfLow, border: `1px solid rgba(0,0,0,0.06)`,
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: reparsing ? "not-allowed" : "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", color: C.secondary,
                opacity: reparsing ? 0.5 : 1,
              }}>
                {reparsing ? "Scanning..." : "Re-analyze"}
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} style={{
              padding: "8px 18px", background: "#84CC16",
              color: "#0F172A", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              boxShadow: `0 2px 8px rgba(132, 204, 22, 0.3)`,
            }}>
              {uploading ? "Uploading..." : "+ Add Files"}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
            onChange={(e: any) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }} />
        </div>

        {/* Accepted file types hint */}
        {documents.length === 0 && (
          <div style={{ padding: "12px 16px", background: "#F9FAFB", borderRadius: 8, marginBottom: 10, border: `1px solid rgba(0,0,0,0.04)` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>What to upload</div>
            <div style={{ fontSize: 11, color: C.secondary, lineHeight: 1.6 }}>
              <strong>Best:</strong> Offering Memorandum (PDF) — one complete OM is enough for a full analysis.
            </div>
            <div style={{ fontSize: 11, color: C.secondary, lineHeight: 1.6 }}>
              <strong>Also accepted:</strong> Flyers, Rent Rolls (XLS), T-12 operating statements, Lease abstracts, Site plans, Property images.
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {["PDF", "XLS", "XLSX", "DOCX", "CSV"].map(ext => (
                <span key={ext} style={{ padding: "2px 6px", background: ext === "PDF" ? "#84CC16" : "#F3F4F6", color: ext === "PDF" ? "#0F172A" : C.secondary, borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {documents.map((doc: ProjectDocument) => {
              const fi = fileIcon(doc.fileExt || "");
              return (
                <button key={doc.id} className="doc-row"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const fileStorageRef = ref(storage, doc.storagePath);
                      const url = await getDownloadURL(fileStorageRef);
                      window.open(url, "_blank");
                    } catch { alert("Could not open file."); }
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "#F9FAFB", borderRadius: 8,
                    border: `1px solid rgba(0,0,0,0.04)`, cursor: "pointer", fontFamily: "inherit",
                    width: "100%", textAlign: "left",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: fi.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: fi.color }}>{fi.label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.onSurface }}>{doc.originalFilename}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.secondary, fontVariantNumeric: "tabular-nums" }}>
                    {doc.fileSizeBytes ? `${(doc.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/*  9. DEEP RESEARCH PANEL                             */}
      {/* ═══════════════════════════════════════════════════ */}
      {(
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, overflow: "hidden",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16,
        }}>
          {/* AI-generated data disclaimer */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 24px", background: "rgba(67, 56, 202, 0.06)",
            borderBottom: `1px solid rgba(0,0,0,0.06)`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
              <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z" />
            </svg>
            <span style={{ fontSize: 11.5, color: "#4338CA", fontWeight: 500, fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>
              AI-powered analysis — sourced from publicly available data including government records, census data, and news outlets.
            </span>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M11 8v6M8 11h6" /></svg>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.onSurface, fontFamily: "'Inter', sans-serif" }}>Location Intelligence</h3>
            </div>

            {!deepResearch ? (
              <>
                <p style={{ fontSize: 13, color: C.secondary, margin: "0 0 16px", lineHeight: 1.5 }}>
                  Live research on what{"'"}s happening around this property — nearby developments, civic activity, area demographics, and recent news.
                </p>
                {userTier === "pro_plus" ? (
                  <button
                    onClick={async () => {
                      setDeepResearchLoading(true);
                      try {
                        console.log("[LocationIntel] Sending:", { propertyId, propertyName: property.propertyName, address: location, locationParts: { address1: property.address1, city: property.city, state: property.state } });
                        const res = await fetch("/api/workspace/deep-research", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ propertyId, propertyName: property.propertyName, address: location || property.propertyName, tenants: tenants.map((t: any) => t.name) }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setDeepResearch(data);
                        } else {
                          const err = await res.json().catch(() => ({}));
                          console.error("Deep research failed:", err);
                          alert(err.error || "Deep research failed. Check console.");
                        }
                      } catch (err) { console.error("Deep research failed:", err); }
                      setDeepResearchLoading(false);
                    }}
                    disabled={deepResearchLoading}
                    className="ws-btn-gold"
                    style={{
                      padding: "10px 24px",
                      background: deepResearchLoading ? C.surfLow : "#6366F1",
                      color: deepResearchLoading ? C.secondary : "#fff", border: "none", borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: deepResearchLoading ? "not-allowed" : "pointer",
                      fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                    }}>
                    {deepResearchLoading && (
                      <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                    )}
                    {deepResearchLoading ? "Searching area... (30-60s)" : "Research This Location"}
                  </button>
                ) : (
                  <div style={{
                    padding: "14px 18px", background: "rgba(99,102,241,0.04)", borderRadius: 8,
                    border: "1px solid rgba(99,102,241,0.12)", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#312E81" }}>Pro+ Feature</div>
                      <div style={{ fontSize: 11, color: "#585e70", marginTop: 2 }}>Location Intelligence is available on the Pro+ plan ($100/mo).</div>
                    </div>
                    <a href="/workspace/profile" style={{
                      padding: "6px 14px", background: "linear-gradient(135deg, #6366F1, #4F46E5)", color: "#fff",
                      border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
                    }}>Upgrade</a>
                  </div>
                )}
              </>
            ) : (
              <div>
                {/* Summary */}
                {deepResearch.summary && (
                  <div style={{
                    padding: "14px 16px", background: "#EEF2FF", borderRadius: 8,
                    fontSize: 13, color: "#312E81", lineHeight: 1.6, marginBottom: 20,
                    borderLeft: "3px solid #6366F1",
                  }}>
                    {deepResearch.summary}
                  </div>
                )}

                {/* Sections */}
                {deepResearch.sections?.map((section: any, si: number) => {
                  const sectionIcons: Record<string, string> = {
                    tenant: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                    location: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z",
                    lease: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                    comps: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                    risk: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
                    upside: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
                  };
                  const signalColors: Record<string, { bg: string; color: string; dot: string }> = {
                    green: { bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
                    yellow: { bg: "#FFFBEB", color: "#92400E", dot: "#F59E0B" },
                    red: { bg: "#FEF2F2", color: "#991B1B", dot: "#EF4444" },
                  };

                  return (
                    <div key={si} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d={sectionIcons[section.icon] || sectionIcons.tenant} />
                        </svg>
                        <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {section.title}
                        </h4>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {section.items?.map((item: any, ii: number) => {
                          const sig = signalColors[item.signal] || signalColors.yellow;
                          return (
                            <div key={ii} style={{
                              padding: "10px 14px", background: sig.bg, borderRadius: 8,
                              borderLeft: `3px solid ${sig.dot}`,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: sig.dot, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: sig.color }}>{item.label}</span>
                              </div>
                              <div style={{ fontSize: 12, color: sig.color, lineHeight: 1.5, paddingLeft: 13 }}>
                                {item.finding}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Line */}
                {deepResearch.bottomLine && (
                  <div style={{
                    padding: "14px 16px", background: "#F8FAFC", borderRadius: 8,
                    border: `1px solid ${C.ghostBorder}`, marginTop: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.secondary, marginBottom: 4 }}>Bottom Line</div>
                    <div style={{ fontSize: 13, color: C.onSurface, lineHeight: 1.5, fontWeight: 500 }}>{deepResearch.bottomLine}</div>
                  </div>
                )}

                {/* Re-run button */}
                <button
                  onClick={() => setDeepResearch(null)}
                  style={{
                    marginTop: 16, padding: "6px 16px", background: "transparent",
                    border: `1px solid ${C.ghostBorder}`, borderRadius: 6,
                    fontSize: 11, color: C.secondary, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Refresh Location Intel
                </button>
                {deepResearch.createdAt && (
                  <span style={{ fontSize: 10, color: C.secondary, marginLeft: 12 }}>
                    Last run: {new Date(deepResearch.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  10. FEEDBACK MODULE                                */}
      {/* ═══════════════════════════════════════════════════ */}
      {hasData && (
        <div style={{
          background: "#F3F4F6", borderRadius: C.radius, padding: "16px 24px",
          border: `1px solid rgba(0,0,0,0.06)`, marginBottom: 16, textAlign: "center",
        }}>
          {!feedbackSent ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.onSurface, margin: "0 0 10px" }}>Was this useful?</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setFeedbackSent(true)} style={{
                  padding: "6px 20px", borderRadius: 6, border: `1px solid rgba(0,0,0,0.06)`,
                  background: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Yes</button>
                <button onClick={() => setFeedbackSent(true)} style={{
                  padding: "6px 20px", borderRadius: 6, border: `1px solid rgba(0,0,0,0.06)`,
                  background: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>No</button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Thanks for the feedback.</p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  EMPTY STATE                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      {!hasData && documents.length === 0 && (
        <div style={{
          background: "#FFFFFF", borderRadius: C.radius, border: `2px dashed #D8DFE9`,
          padding: 60, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ fontSize: 16, color: C.onSurface, fontWeight: 600, margin: "0 0 6px" }}>No deal data yet</p>
          <p style={{ fontSize: 13, color: C.secondary, margin: "0 0 8px", maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
            Upload an Offering Memorandum (PDF) to extract pricing, tenancy, income, and lease data automatically.
          </p>
          <p style={{ fontSize: 11, color: C.secondary, margin: "0 0 20px", opacity: 0.7 }}>
            Also accepts: flyers, rent rolls (XLS), T-12s, leases, and property images.
          </p>
          <button onClick={() => fileRef.current?.click()} style={{
            padding: "12px 28px", background: "#84CC16",
            color: "#0F172A", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 12px rgba(132, 204, 22, 0.3)`,
          }}>
            Upload Documents
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/*  DANGER ZONE                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{
        marginTop: 32, marginBottom: 32, padding: "16px 24px",
        background: "#FEF2F2", borderRadius: C.radius, border: "1px solid #FECACA",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", marginBottom: 2 }}>Delete Deal</div>
          <div style={{ fontSize: 12, color: "#DC2626" }}>Permanently remove this deal and all associated data.</div>
        </div>
        <button onClick={async (e) => {
          if (!confirm(`Delete "${property.propertyName}"? This cannot be undone.`)) return;
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = "Deleting...";
          btn.style.opacity = "0.6";
          try {
            await deleteProperty(propertyId, property.projectId || "workspace-default");
            window.dispatchEvent(new Event("workspace-properties-changed"));
            // Brief visual confirmation before redirect
            btn.textContent = "Deleted";
            btn.style.background = "#059669";
            setTimeout(() => { window.location.href = "/workspace"; }, 400);
          } catch (err) {
            console.error("[delete] Failed:", err);
            btn.disabled = false;
            btn.textContent = "Delete Deal";
            btn.style.opacity = "1";
            alert("Failed to delete deal. Please try again.");
          }
        }} style={{
          padding: "8px 20px", background: "#DC2626", color: "#fff", border: "none",
          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
          transition: "all 0.2s ease",
        }}>
          Delete Deal
        </button>
      </div>
    </div>
  );
}
