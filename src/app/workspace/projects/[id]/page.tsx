"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  getProject, getProjectProperties, getProjectDocuments, getProjectExtractedFields,
  getProjectCurrentScore, getProjectNotes, getProjectTasks, getProjectOutputs,
  createProperty, createDocument, updateProperty, deleteProperty, logActivity,
  createNote, createTask, updateTask,
} from "@/lib/workspace/firestore";
import type { Project, Property, ProjectDocument, ExtractedField, Score, Note, Task, ProjectOutput, DocCategory } from "@/lib/workspace/types";
import { STATUS_LABELS, STATUS_COLORS, ASSET_TYPE_LABELS, SCORE_BAND_LABELS, SCORE_BAND_COLORS, DOC_CATEGORY_LABELS, formatCurrency, formatPercent, formatSf } from "@/lib/workspace/types";
import Link from "next/link";

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 10, border: "1px solid #EDF0F5", padding: 18 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1.5px solid #D8DFE9", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

const ACCEPTED_EXT = ".pdf,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp";

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

// ===== Add Property Modal =====
function AddPropertyModal({ projectId, onClose, onCreate }: { projectId: string; onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createProperty(projectId, {
        propertyName: name.trim(),
        address1: address,
        city,
        state,
      });
      onCreate();
    } catch (err) { console.error(err); setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,17,32,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Add Property</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8899B0" }}>&times;</button>
        </div>
        <p style={{ fontSize: 13, color: "#5A7091", margin: "0 0 16px", lineHeight: 1.5 }}>
          Add a property to this project. You can upload files to it after creating it.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 4 }}>Deal Name *</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Walgreens - 1234 Main St, Austin TX" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 4 }}>Address <span style={{ fontWeight: 400, color: "#8899B0" }}>(optional)</span></label>
            <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 4 }}>City</label>
              <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#253352", display: "block", marginBottom: 4 }}>State</label>
              <input style={inputStyle} value={state} onChange={e => setState(e.target.value)} maxLength={2} placeholder="TX" />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "none", border: "1.5px solid #D8DFE9", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} style={{ padding: "8px 20px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving || !name.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
            {saving ? "Creating..." : "Add Property"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Property Card =====
function PropertyCard({ property, projectId, userId, onRefresh }: {
  property: Property; projectId: string; userId: string; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [outputs, setOutputs] = useState<ProjectOutput[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load docs when expanded
  useEffect(() => {
    if (!expanded) return;
    setLoadingDocs(true);
    Promise.all([
      getProjectDocuments(projectId, property.id),
      getProjectExtractedFields(projectId),
      getProjectOutputs(projectId),
    ]).then(([d, f, o]) => {
      setDocs(d);
      setFields(f.filter(fl => fl.propertyId === property.id || fl.documentId && d.some(doc => doc.id === fl.documentId)));
      setOutputs(o.filter(out => out.propertyId === property.id));
      setLoadingDocs(false);
    }).catch(() => setLoadingDocs(false));
  }, [expanded, projectId, property.id]);

  async function handleFileUpload(fileList: FileList) {
    if (!fileList.length) return;
    setUploading(true);

    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const storedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `workspace/${userId}/${projectId}/${property.id}/inputs/${storedName}`;

      try {
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed", null, reject, async () => {
            await getDownloadURL(uploadTask.snapshot.ref);
            await createDocument({
              projectId,
              userId,
              propertyId: property.id,
              originalFilename: file.name,
              storedFilename: storedName,
              fileExt: ext,
              mimeType: file.type,
              fileSizeBytes: file.size,
              storagePath,
              docCategory: guessCategory(file.name),
              parserStatus: "uploaded",
              isArchived: false,
              isDeleted: false,
              uploadedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            await logActivity({
              projectId, userId, activityType: "file_uploaded", entityType: "document",
              entityId: storedName, summary: `Uploaded ${file.name} to ${property.propertyName}`,
              createdAt: new Date().toISOString(),
            });
            resolve();
          });
        });
      } catch (err) { console.error(err); }
    }

    // Refresh docs
    const d = await getProjectDocuments(projectId, property.id);
    setDocs(d);
    setUploading(false);
  }

  async function handleParseAll() {
    if (docs.length === 0) return;
    setParsing(true);
    setParseResult(null);

    try {
      // Build document text from file metadata and any text we can extract
      let docText = `Property: ${property.propertyName}\n`;
      if (property.address1) docText += `Address: ${property.address1}\n`;
      if (property.city) docText += `City: ${property.city}, ${property.state}\n`;
      docText += `\nUploaded files:\n`;
      for (const d of docs) {
        docText += `- ${d.originalFilename} (${d.docCategory || "misc"}, ${d.fileExt}, ${(d.fileSizeBytes / 1024).toFixed(0)}KB)\n`;
      }

      const storagePaths = docs.map(d => d.storagePath).filter(Boolean);

      const res = await fetch("/api/workspace/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          propertyId: property.id,
          userId,
          documentText: docText,
          storagePaths,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setParseResult(`Extracted ${data.fieldsExtracted} fields`);
        await updateProperty(property.id, { parseStatus: "parsed" } as any);
        // Refresh fields
        const f = await getProjectExtractedFields(projectId);
        setFields(f.filter(fl => fl.propertyId === property.id || fl.documentId && docs.some(doc => doc.id === fl.documentId)));
      } else {
        setParseResult(data.error || "Parse failed. Try again.");
      }
    } catch (err: any) {
      setParseResult(err?.message || "Parse failed. Check connection and try again.");
    }
    setParsing(false);
    onRefresh();
  }

  const location = [property.address1, property.city, property.state].filter(Boolean).join(", ");
  const parseStatus = (property as any).parseStatus || "pending";

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
          cursor: "pointer", background: expanded ? "#F6F8FB" : "#fff", transition: "background 0.15s",
        }}
      >
        <span style={{ color: "#8899B0", fontSize: 11, flexShrink: 0, width: 14, textAlign: "center" }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1120" }}>{property.propertyName}</div>
          {location && <div style={{ fontSize: 12, color: "#8899B0", marginTop: 1 }}>{location}</div>}
        </div>
        <span style={{
          padding: "2px 10px", borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: parseStatus === "parsed" ? "#D1FAE5" : parseStatus === "parsing" ? "#DBEAFE" : "#F6F8FB",
          color: parseStatus === "parsed" ? "#0A7E5A" : parseStatus === "parsing" ? "#2563EB" : "#8899B0",
        }}>
          {parseStatus === "parsed" ? "Parsed" : parseStatus === "parsing" ? "Parsing..." : "Pending"}
        </span>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${property.propertyName}" and all its files?`)) {
              await deleteProperty(property.id, projectId);
              onRefresh();
            }
          }}
          style={{ background: "none", border: "none", color: "#B4C1D1", cursor: "pointer", fontSize: 16, padding: "2px 6px", flexShrink: 0 }}
          title="Delete property"
        >
          &times;
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: "1px solid #EDF0F5", padding: "16px 18px" }}>
          {loadingDocs ? (
            <p style={{ color: "#8899B0", fontSize: 13 }}>Loading files...</p>
          ) : (
            <>
              {/* Files */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: "#5A7091", textTransform: "uppercase", margin: 0, letterSpacing: 0.3 }}>
                    Files ({docs.length})
                  </h4>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                      style={{ padding: "5px 12px", background: "#F6F8FB", border: "1.5px solid #D8DFE9", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {uploading ? "Uploading..." : "+ Add File"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_EXT}
                      style={{ display: "none" }}
                      onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }}
                    />
                  </div>
                </div>

                {docs.length === 0 ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: "2px dashed #D8DFE9", borderRadius: 8, padding: "24px 16px",
                      textAlign: "center", cursor: "pointer", background: "#FAFBFC",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#5A7091", margin: "0 0 4px" }}>
                      Drop files here or click to upload
                    </p>
                    <p style={{ fontSize: 11, color: "#B4C1D1", margin: 0 }}>
                      Flyers, rent rolls, T-12s, lease abstracts, OMs, and more
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {docs.map(doc => (
                      <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F6F8FB", borderRadius: 6, fontSize: 12 }}>
                        <span style={{ padding: "1px 5px", background: "#D8DFE9", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase" }}>
                          {doc.fileExt}
                        </span>
                        <span style={{ flex: 1, color: "#253352", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.originalFilename}</span>
                        <span style={{ fontSize: 10, color: "#B4C1D1", flexShrink: 0 }}>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
                        <span style={{ fontSize: 10, color: "#8899B0", flexShrink: 0 }}>{DOC_CATEGORY_LABELS[doc.docCategory!] || "misc"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Parse status — auto-parsed on upload */}
              {docs.length > 0 && parseStatus === "parsed" && fields.length > 0 && (
                <div style={{ padding: "8px 14px", background: "#D1FAE5", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#0A7E5A", fontWeight: 500 }}>
                  {fields.length} fields extracted from {docs.length} file{docs.length !== 1 ? "s" : ""}
                </div>
              )}

              {/* Extracted Data */}
              {fields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: "#5A7091", textTransform: "uppercase", margin: "0 0 8px", letterSpacing: 0.3 }}>
                    Extracted Data ({fields.length} fields)
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                    {fields.slice(0, 12).map(f => (
                      <div key={f.id} style={{ background: "#F6F8FB", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#8899B0", textTransform: "capitalize" }}>{f.fieldName.replace(/_/g, " ")}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1120", marginTop: 2 }}>
                          {String(f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue || "--")}
                        </div>
                        {f.confidenceScore !== undefined && (
                          <div style={{ fontSize: 9, color: f.confidenceScore > 0.8 ? "#0A7E5A" : "#F59E0B", marginTop: 2 }}>
                            {(f.confidenceScore * 100).toFixed(0)}% confidence
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {fields.length > 12 && (
                    <p style={{ fontSize: 11, color: "#8899B0", marginTop: 6 }}>+ {fields.length - 12} more fields</p>
                  )}
                </div>
              )}

              {/* Generated Assets */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: "#5A7091", textTransform: "uppercase", margin: "0 0 8px", letterSpacing: 0.3 }}>Generated Assets</h4>
                {outputs.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {outputs.map(o => (
                      <a key={o.id} href={o.storagePath} target="_blank" rel="noopener noreferrer" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                        background: "#fff", border: "1.5px solid #D8DFE9", borderRadius: 8,
                        textDecoration: "none", color: "#253352", fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ padding: "1px 5px", background: "#EDF0F5", borderRadius: 3, fontSize: 9, fontWeight: 700, color: "#5A7091", textTransform: "uppercase" }}>{o.fileExt}</span>
                        {o.title}
                        <span style={{ color: "#C49A3C" }}>{"\u2193"}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {["Pro Forma (XLSX)", "Deal Brief (DOCX)", "Scorecard (PDF)", "Presentation (PPTX)"].map(label => (
                      <button key={label} style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                        background: "#F6F8FB", border: "1.5px dashed #D8DFE9", borderRadius: 6,
                        color: "#8899B0", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                      }}>
                        <span style={{ fontSize: 12 }}>+</span> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===== MAIN PAGE =====
export default function ProjectDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddProperty, setShowAddProperty] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    // Load project first — this is the critical one
    const p = await getProject(projectId);
    setProject(p);

    if (p) {
      // Load everything else in parallel — failures won't break the page
      const [props, docs, sc, nts, tsks] = await Promise.all([
        getProjectProperties(projectId),
        getProjectDocuments(projectId),
        getProjectCurrentScore(projectId),
        getProjectNotes(projectId),
        getProjectTasks(projectId),
      ]);
      setProperties(props);
      setDocuments(docs);
      setScore(sc);
      setNotes(nts);
      setTasks(tsks);
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#5A7091" }}>Loading project...</div>;
  if (!project) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Project not found</h2>
      <Link href="/workspace/projects" style={{ color: "#C49A3C", fontSize: 13 }}>Back to projects</Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      {showAddProperty && (
        <AddPropertyModal
          projectId={projectId}
          onClose={() => setShowAddProperty(false)}
          onCreate={() => { setShowAddProperty(false); loadData(); }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "#8899B0", marginBottom: 4 }}>
            <Link href="/workspace/projects" style={{ color: "#8899B0", textDecoration: "none" }}>Projects</Link>
            {project.assetType && <> / {ASSET_TYPE_LABELS[project.assetType]}</>}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{project.projectName}</h1>
          {project.notesSummary && <p style={{ fontSize: 13, color: "#5A7091", margin: "4px 0 0" }}>{project.notesSummary}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600,
            color: STATUS_COLORS[project.status], background: STATUS_COLORS[project.status] + "15",
          }}>
            {STATUS_LABELS[project.status]}
          </span>
          <button
            onClick={() => setShowAddProperty(true)}
            style={{ padding: "6px 14px", background: "#C49A3C", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}
          >
            + Add Property
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Deals", value: properties.length, color: "#2563EB" },
          { label: "Total Files", value: documents.length, color: "#10B981" },
          { label: "Deal Score", value: score ? score.totalScore : "--", color: "#C49A3C" },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#8899B0", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Properties */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Properties ({properties.length})</h2>
        </div>

        {properties.length === 0 ? (
          <div style={{ ...cardStyle, padding: 36, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#5A7091", margin: "0 0 4px" }}>No properties yet.</p>
            <p style={{ fontSize: 13, color: "#8899B0", margin: "0 0 16px" }}>Add a property, then upload files to it. When you&apos;re done uploading, parse all files to extract deal data.</p>
            <button
              onClick={() => setShowAddProperty(true)}
              style={{ padding: "10px 24px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              + Add First Property
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {properties.map(prop => (
              <PropertyCard key={prop.id} property={prop} projectId={projectId} userId={user?.uid || ""} onRefresh={loadData} />
            ))}
          </div>
        )}
      </div>

      {/* Notes & Tasks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Notes</h3>
          <NoteInput projectId={projectId} userId={user?.uid || ""} onAdd={loadData} />
          {notes.slice(0, 5).map(n => (
            <div key={n.id} style={{ padding: "8px 10px", background: "#F6F8FB", borderRadius: 6, fontSize: 12, marginTop: 4, color: "#253352", lineHeight: 1.4 }}>{n.content}</div>
          ))}
          {notes.length === 0 && <p style={{ color: "#B4C1D1", fontSize: 12, margin: "4px 0 0" }}>No notes yet</p>}
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Tasks</h3>
          <TaskInput projectId={projectId} userId={user?.uid || ""} onAdd={loadData} />
          {tasks.slice(0, 8).map(t => (
            <TaskRow key={t.id} task={t} onToggle={loadData} />
          ))}
          {tasks.length === 0 && <p style={{ color: "#B4C1D1", fontSize: 12, margin: "4px 0 0" }}>No tasks yet</p>}
        </div>
      </div>
    </div>
  );
}

function NoteInput({ projectId, userId, onAdd }: { projectId: string; userId: string; onAdd: () => void }) {
  const [val, setVal] = useState("");
  async function add() {
    if (!val.trim()) return;
    await createNote({ projectId, userId, noteType: "general", content: val.trim(), isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setVal(""); onAdd();
  }
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      <input style={{ ...inputStyle, flex: 1 }} value={val} onChange={e => setVal(e.target.value)} placeholder="Add note..." onKeyDown={e => e.key === "Enter" && add()} />
      <button onClick={add} style={{ padding: "6px 10px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Add</button>
    </div>
  );
}

function TaskInput({ projectId, userId, onAdd }: { projectId: string; userId: string; onAdd: () => void }) {
  const [val, setVal] = useState("");
  async function add() {
    if (!val.trim()) return;
    await createTask({ projectId, userId, title: val.trim(), status: "open", priority: "medium", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setVal(""); onAdd();
  }
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      <input style={{ ...inputStyle, flex: 1 }} value={val} onChange={e => setVal(e.target.value)} placeholder="Add task..." onKeyDown={e => e.key === "Enter" && add()} />
      <button onClick={add} style={{ padding: "6px 10px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Add</button>
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  async function toggle() {
    await updateTask(task.id, { status: task.status === "complete" ? "open" : "complete", completedAt: task.status === "complete" ? undefined : new Date().toISOString() });
    onToggle();
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
      <button onClick={toggle} style={{
        width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${task.status === "complete" ? "#10B981" : "#D8DFE9"}`,
        background: task.status === "complete" ? "#10B981" : "transparent", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0, padding: 0,
      }}>{task.status === "complete" && "\u2713"}</button>
      <span style={{ textDecoration: task.status === "complete" ? "line-through" : "none", color: task.status === "complete" ? "#B4C1D1" : "#253352" }}>{task.title}</span>
    </div>
  );
}
