"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  getProperty, getProjectDocuments, getPropertyExtractedFields,
  getProjectOutputs, getPropertyNotes, createDocument, logActivity, updateProperty,
} from "@/lib/workspace/firestore";
import type { Property, ProjectDocument, ExtractedField, ProjectOutput, Note, DocCategory } from "@/lib/workspace/types";
import { DOC_CATEGORY_LABELS } from "@/lib/workspace/types";
import { generateUnderwritingXLSX, generateBriefDownload } from "@/lib/workspace/generate-files";
import { extractTextFromFiles } from "@/lib/workspace/file-reader";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import Link from "next/link";

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

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
function signalColor(val: string): string {
  if (!val) return "#8899B0";
  if (val.includes("🟢") || val.toLowerCase().includes("green")) return "#059669";
  if (val.includes("🟡") || val.toLowerCase().includes("yellow")) return "#D97706";
  if (val.includes("🔴") || val.toLowerCase().includes("red")) return "#DC2626";
  return "#253352";
}

function EditablePropertyName({ name, propertyId, onSave }: { name: string; propertyId: string; onSave: (newName: string) => void }) {
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
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(name); } }}
        style={{
          fontSize: 26, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "2px 8px",
          margin: 0, lineHeight: 1.2, width: "100%", outline: "none", fontFamily: "inherit",
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setEditing(true)}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>{name}</h1>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

function PropertyImage({ heroImageUrl, location, encodedAddress, propertyName }: {
  heroImageUrl?: string; location: string; encodedAddress: string; propertyName: string;
}) {
  const [imgError, setImgError] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const hasStreetView = !!apiKey && !!location;

  const fallback = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%", minHeight: 200,
      background: "linear-gradient(135deg, #1a2744, #253352)",
    }}>
      <a href={location ? `https://www.google.com/maps/search/${encodedAddress}` : "#"}
        target="_blank" rel="noopener noreferrer"
        style={{ textAlign: "center", padding: 20, textDecoration: "none" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
        <div style={{ color: "#B4C1D1", fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>{location || "No address"}</div>
        {location && <div style={{ color: "#C49A3C", fontSize: 10, marginTop: 6 }}>View on Google Maps &rarr;</div>}
      </a>
    </div>
  );

  return (
    <div style={{
      width: 300, minHeight: 200, flexShrink: 0,
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      {heroImageUrl && !imgError ? (
        <img src={heroImageUrl} alt={propertyName}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
          onError={() => setImgError(true)} />
      ) : hasStreetView && !imgError ? (
        <a href={`https://www.google.com/maps/search/${encodedAddress}`} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", width: "100%", height: "100%", minHeight: 200 }}>
          <img
            src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodedAddress}&key=${apiKey}`}
            alt={`Street view of ${propertyName}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
            onError={() => setImgError(true)}
          />
        </a>
      ) : fallback}
    </div>
  );
}

export default function PropertyDetailPage() {
  const params = useParams();
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
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const p = await getProperty(propertyId);
    setProperty(p);
    if (p) {
      const [docs, extFields, outs, nts] = await Promise.all([
        getProjectDocuments(p.projectId, propertyId),
        getPropertyExtractedFields(propertyId),
        getProjectOutputs(p.projectId),
        getPropertyNotes(propertyId),
      ]);
      setDocuments(docs);
      setFields(extFields);
      setOutputs(outs.filter(o => o.propertyId === propertyId));
      setNotes(nts);
      setAddressConfirmed(!!(p as any).addressConfirmed);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { loadData(); }, [loadData]);

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

    // Re-parse all files after upload
    setReparsing(true);
    try {
      const updatedDocs = await getProjectDocuments(property.projectId, propertyId);
      setDocuments(updatedDocs);

      // Extract text from the NEW files only
      const newFiles = Array.from(fileList);
      const extractedText = await extractTextFromFiles(newFiles);

      // Send to parser
      await fetch("/api/workspace/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: property.projectId, propertyId, userId: user.uid,
          documentText: extractedText,
        }),
      });

      // Reload fields
      const newFields = await getPropertyExtractedFields(propertyId);
      setFields(newFields);
    } catch { /* continue */ }

    setReparsing(false);
    setUploading(false);

    // Refresh sidebar property list
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("workspace-properties-changed"));
    }
  }

  async function handleConfirmAddress() {
    if (!property) return;
    await updateProperty(propertyId, { addressConfirmed: true } as any);
    setAddressConfirmed(true);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#5A7091" }}>Loading property...</div>;
  if (!property) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Property not found</h2>
      <Link href="/workspace" style={{ color: "#C49A3C", fontSize: 13 }}>Back to dashboard</Link>
    </div>
  );

  const g = (group: string, name: string) => gf(fields, group, name);
  const location = [property.address1, property.city, property.state].filter(Boolean).join(", ");
  const brief = notes.find(n => n.noteType === "investment_thesis")?.content || "";
  const hasData = fields.length > 0;
  const recommendation = g("signals", "recommendation");
  const encodedAddress = encodeURIComponent(location || property.propertyName);

  // Key stats for the hero bar
  const heroStats = [
    { label: "Asking Price", value: fmt$(g("pricing_deal_terms", "asking_price")) },
    { label: "Cap Rate", value: fmtPct(g("pricing_deal_terms", "cap_rate_om")) },
    { label: "GLA", value: fmtSF(g("property_basics", "building_sf")) },
    { label: "Occupancy", value: fmtPct(g("property_basics", "occupancy_pct")) },
    { label: "NOI", value: fmt$(g("expenses", "noi_om")) },
    { label: "DSCR", value: fmtX(g("debt_assumptions", "dscr_om")) },
  ].filter(s => s.value !== "--");

  // Tenants for summary
  const tenantFields = fields.filter(f => f.fieldGroup === "rent_roll" && f.fieldName.match(/^tenant_\d+_name$/));
  const tenants = tenantFields.map(f => {
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

  // Metrics table — tooltip = explanation shown on hover for calculated metrics
  const metrics: [string, string, string?][] = ([
    ["Asking Price (OM)", fmt$(g("pricing_deal_terms", "asking_price"))],
    ["Price / SF (OM)", g("pricing_deal_terms", "price_per_sf") ? `$${Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2)}/SF` : "--", "Asking Price ÷ Gross Leasable Area (GLA)"],
    ["GLA (OM)", fmtSF(g("property_basics", "building_sf"))],
    ["Occupancy (OM)", fmtPct(g("property_basics", "occupancy_pct"))],
    ["Base Rent (OM)", fmt$(g("income", "base_rent"))],
    ["NOI (OM)", fmt$(g("expenses", "noi_om"))],
    ["NOI (Adjusted)", fmt$(g("expenses", "noi_adjusted")), "NOI recalculated using standard expense assumptions (insurance, mgmt %, reserves) instead of OM figures"],
    ["Entry Cap (OM)", fmtPct(g("pricing_deal_terms", "cap_rate_om")), "NOI (OM) ÷ Asking Price"],
    ["Debt Service", fmt$(g("debt_assumptions", "annual_debt_service")), "Annual mortgage payment based on loan amount, interest rate, and amortization period"],
    ["DSCR (OM)", fmtX(g("debt_assumptions", "dscr_om")), "NOI (OM) ÷ Annual Debt Service — measures ability to cover debt payments"],
    ["DSCR (Adjusted)", fmtX(g("debt_assumptions", "dscr_adjusted")), "NOI (Adjusted) ÷ Annual Debt Service"],
    ["Cash-on-Cash", fmtPct(g("returns", "cash_on_cash_om")), "Pre-tax cash flow ÷ Total cash invested (down payment + closing costs)"],
    ["Debt Yield", fmtPct(g("debt_assumptions", "debt_yield")), "NOI ÷ Loan Amount — lender risk metric independent of interest rate"],
    ["Breakeven Occupancy", fmtPct(g("returns", "breakeven_occupancy")), "Minimum occupancy needed to cover all expenses and debt service"],
  ] as [string, string, string?][]).filter(([, v]) => v !== "--");

  // Signals
  const signals = [
    ["Overall", g("signals", "overall_signal")],
    ["Cap Rate", g("signals", "cap_rate_signal")],
    ["DSCR", g("signals", "dscr_signal")],
    ["Occupancy", g("signals", "occupancy_signal")],
    ["Basis / Price", g("signals", "basis_signal")],
    ["Tenant Quality", g("signals", "tenant_quality_signal")],
    ["Rollover Risk", g("signals", "rollover_signal")],
  ].filter(([, v]) => v);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        .dl-btn { transition: all 0.15s ease; }
        .dl-btn:hover { background: #EDF0F5 !important; border-color: #C49A3C !important; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .doc-pill { transition: all 0.12s ease; }
        .doc-pill:hover { background: #EDF0F5 !important; border-color: #D8DFE9 !important; }
      `}</style>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#8899B0", marginBottom: 8 }}>
        <Link href="/workspace" style={{ color: "#8899B0", textDecoration: "none" }}>Dashboard</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "#5A7091" }}>{property.propertyName}</span>
      </div>

      {/* ===== HERO SECTION ===== */}
      <div style={{ background: "linear-gradient(135deg, #0B1120 0%, #162036 100%)", borderRadius: 14, padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          {/* Left: Property info */}
          <div style={{ flex: 1, padding: "28px 28px 20px" }}>
            <EditablePropertyName name={property.propertyName} propertyId={propertyId} onSave={(newName) => setProperty(prev => prev ? { ...prev, propertyName: newName } : prev)} />

            {/* Address + links */}
            {location && (
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: 14, color: "#B4C1D1" }}>{location}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[
                    { label: "Google Maps", url: `https://www.google.com/maps/search/${encodedAddress}` },
                    { label: "Google Earth", url: `https://earth.google.com/web/search/${encodedAddress}` },
                  ].map(link => (
                      <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                        padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: 6,
                        fontSize: 11, color: "#8899B0", textDecoration: "none", fontWeight: 500,
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        {link.label} &rarr;
                      </a>
                    ))}
                  </div>
              </div>
            )}

            {/* Property details mini-grid */}
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Type", value: g("property_basics", "asset_type") },
                { label: "Built", value: g("property_basics", "year_built") },
                { label: "Tenants", value: g("property_basics", "tenant_count") },
                { label: "WALE", value: g("property_basics", "wale_years") ? `${g("property_basics", "wale_years")} yrs` : null },
                { label: "Traffic", value: g("property_basics", "traffic") },
              ].filter(d => d.value).map(d => (
                <div key={d.label}>
                  <div style={{ fontSize: 9, color: "#5A7091", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: "#B4C1D1", marginTop: 1, fontWeight: 500 }}>{d.value}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 10, color: "rgba(90,112,145,0.6)", margin: "12px 0 0", fontStyle: "italic" }}>
              First-pass underwriting screen &middot; Directional only
            </p>
          </div>

          {/* Right: Property image */}
          <PropertyImage
            heroImageUrl={(property as any).heroImageUrl}
            location={location}
            encodedAddress={encodedAddress}
            propertyName={property.propertyName}
          />
        </div>

        {/* Key Stats Bar */}
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

      {/* ===== ADD FILES + RE-PARSE ===== */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
              Source Documents ({documents.length})
              {reparsing && <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 500, marginLeft: 8 }}>Analyzing...</span>}
            </h3>
            <p style={{ fontSize: 12, color: "#8899B0", margin: 0, lineHeight: 1.5, maxWidth: 500 }}>
              Add more for increasing analysis accuracy. Rent rolls, T-12 operating statements, lease abstracts, and market reports will strengthen the underwriting.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {documents.length > 0 && (
              <button onClick={async () => {
                if (!property || !user || reparsing) return;
                setReparsing(true);
                try {
                  // Re-parse using stored document text — trigger fresh GPT-4o analysis
                  let docText = `Property: ${property.propertyName}\nAddress: ${property.address1 || ""}\nCity: ${property.city || ""}, ${property.state || ""}\n\nFiles:\n`;
                  for (const d of documents) {
                    docText += `- ${d.originalFilename} (${d.docCategory || "misc"}, ${d.fileExt})\n`;
                  }
                  // Also try to re-extract text from the original uploaded files if available in storage
                  const storagePaths = documents.map(d => d.storagePath).filter(Boolean);

                  await fetch("/api/workspace/parse", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      projectId: property.projectId, propertyId, userId: user.uid,
                      documentText: docText, storagePaths,
                    }),
                  });
                  // Reload all data
                  await loadData();
                } catch (err) { console.error("Re-analyze failed:", err); }
                setReparsing(false);
                if (typeof window !== "undefined") window.dispatchEvent(new Event("workspace-properties-changed"));
              }} style={{
                padding: "8px 14px", background: "#F6F8FB", border: "1.5px solid #D8DFE9",
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: reparsing ? "not-allowed" : "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", color: "#5A7091",
                opacity: reparsing ? 0.5 : 1,
              }}>
                {reparsing ? "Analyzing..." : "Re-analyze"}
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} className="ws-btn-red" style={{
              padding: "8px 18px", background: "#DC2626", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}>
              {uploading ? "Uploading..." : "+ Add Files"}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT} style={{ display: "none" }}
            onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }} />
        </div>
        {documents.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {documents.map(doc => (
              <button
                key={doc.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const fileRef = ref(storage, doc.storagePath);
                    const url = await getDownloadURL(fileRef);
                    window.open(url, "_blank");
                  } catch { alert("Could not open file. It may have been deleted from storage."); }
                }}
                className="doc-pill"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#F6F8FB", borderRadius: 6, fontSize: 11, border: "1px solid transparent", cursor: "pointer", fontFamily: "inherit" }}
                title="Click to view file"
              >
                <span style={{ padding: "1px 4px", background: "#D8DFE9", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase" }}>{doc.fileExt}</span>
                <span style={{ color: "#253352", fontWeight: 500, textDecoration: "underline", textDecorationColor: "#D8DFE9" }}>{doc.originalFilename}</span>
              </button>
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
            {brief.split("\n").filter(p => p.trim()).map((p, i) => (
              <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>
            ))}
          </div>
        </div>
      )}

      {/* ===== KEY METRICS + SIGNALS SIDE BY SIDE ===== */}
      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Key Metrics */}
          {metrics.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #EDF0F5", background: "#F6F8FB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: "#2563EB", borderRadius: 2 }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#253352" }}>Key Metrics</h3>
                </div>
                <a href="/workspace/settings" style={{ fontSize: 10, color: "#8899B0", textDecoration: "none" }}>
                  Adjust assumption settings &rarr;
                </a>
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

          {/* Signals */}
          {signals.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #EDF0F5", background: "#F6F8FB", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#C49A3C", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#253352" }}>Signal Assessment</h3>
              </div>
              {signals.map(([label, val], i) => {
                const color = signalColor(String(val));
                const bgColor = color === "#059669" ? "#D1FAE5" : color === "#D97706" ? "#FEF3C7" : color === "#DC2626" ? "#FDE8EA" : "#F6F8FB";
                return (
                  <div key={String(label)} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px",
                    borderBottom: i < signals.length - 1 ? "1px solid #F6F8FB" : "none",
                  }}>
                    <span style={{ fontSize: 12, color: "#5A7091", fontWeight: 500 }}>{String(label)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color, padding: "3px 10px",
                      background: bgColor, borderRadius: 12, maxWidth: 220,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {String(val)}
                    </span>
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
                    }}>
                      {t.status || "--"}
                    </span>
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
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Download Assets{property?.propertyName ? ` — ${property.propertyName}` : ""}</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              className="dl-btn"
              onClick={async () => { try { await generateUnderwritingXLSX(property.propertyName, fields); } catch (e: any) { alert("XLSX failed: " + (e?.message || "unknown")); } }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
                background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 10,
                color: "#253352", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: "#D1FAE5",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A7E5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                  Underwriting Workbook
                  <span style={{ marginLeft: 6, padding: "1px 5px", background: "#D1FAE5", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#0A7E5A" }}>XLSX</span>
                </div>
                <div style={{ fontSize: 11, color: "#8899B0", lineHeight: 1.4 }}>
                  6-sheet Excel: Inputs, Rent Roll, Operating Statement, Debt &amp; Returns, Breakeven, Cap Scenarios
                </div>
              </div>
            </button>
            <button
              className="dl-btn"
              onClick={() => generateBriefDownload(property.propertyName, brief, fields)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
                background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 10,
                color: "#253352", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: "#DBEAFE",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                  First-Pass Brief
                  <span style={{ marginLeft: 6, padding: "1px 5px", background: "#DBEAFE", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#2563EB" }}>DOC</span>
                </div>
                <div style={{ fontSize: 11, color: "#8899B0", lineHeight: 1.4 }}>
                  Investment memo with assessment, key metrics, signal ratings, and recommendation
                </div>
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

      {/* Empty state */}
      {!hasData && documents.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "#5A7091", margin: "0 0 8px" }}>No analysis data yet</p>
          <p style={{ fontSize: 13, color: "#B4C1D1", margin: "0 0 16px" }}>Upload property documents to generate a first-pass underwriting assessment.</p>
          <button onClick={() => fileRef.current?.click()} className="ws-btn-red" style={{
            padding: "10px 24px", background: "#DC2626", color: "#fff", border: "none",
            borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>
            Upload Documents
          </button>
        </div>
      )}
    </div>
  );
}

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
