// ===== Firestore CRUD for Workspace =====
// ALL queries use simple single-field filters to avoid composite index requirements.
// Sorting is done client-side after fetching.
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, limit,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Project, Property, ProjectDocument, ExtractedField, UnderwritingModel, UnderwritingOutput, Score, Note, Task, ActivityLog, ParserRun, ProjectOutput, PropertySnapshot, Workspace } from "./types";

const now = () => new Date().toISOString();

// Strip undefined values - Firestore rejects them
function clean(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

// Safe query wrapper - catches index errors and returns empty
async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn("Firestore query failed:", err?.message || err);
    return [];
  }
}

async function safeGet<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn("Firestore get failed:", err?.message || err);
    return null;
  }
}

// ===== WORKSPACES =====
// Workspace metadata is stored in localStorage (see workspace-context.tsx).
// Only the workspaceId field on properties lives in Firestore.
// The "default" workspace ID means: properties with no workspaceId OR workspaceId === "default".

/**
 * Get properties filtered by workspace via server-side API.
 *
 * Dedupes concurrent callers: the workspace layout and the dashboard page
 * both request the same list on mount. Without dedup that is two parallel
 * API calls for identical data. We cache the in-flight promise for a given
 * (userId, workspaceId) key and share it between callers. Resolved results
 * stay in the cache for a short TTL so a second caller that arrives a tick
 * after the first finishes reuses the data instead of firing a third call.
 * TTL is intentionally short so mutations become visible quickly.
 */
// Stores both the in-flight promise AND the last resolved value so we can
// serve stale data immediately while a background refresh runs (SWR).
type WsPropsEntry = {
  at: number;
  promise: Promise<Property[]>;
  resolved?: Property[]; // last successful result - enables stale-while-revalidate
};
const _wsPropsCache: Map<string, WsPropsEntry> = new Map();
// Tab-switch clicks that re-mount consumers used to refire /api/workspace/properties
// every 250-300 ms. 15s TTL turns those remounts into instant cache hits while
// still being short enough that uploads/edits become visible quickly. Mutations
// call invalidateWorkspacePropertiesCache() to force a fresh read on demand.
const _WS_PROPS_CACHE_TTL_MS = 15000;
// After TTL expires we still return the stale value synchronously and kick
// off a refresh in the background, so the user never sees a spinner for data
// we already have.
const _WS_PROPS_STALE_MS = 60000;

export function invalidateWorkspacePropertiesCache(userId?: string, workspaceId?: string) {
  if (!userId || !workspaceId) {
    _wsPropsCache.clear();
    return;
  }
  _wsPropsCache.delete(`${userId}::${workspaceId}`);
}

/**
 * Synchronous cache peek. Returns the last-resolved property list for a given
 * (userId, workspaceId) if one exists, or null if the cache is empty.
 *
 * Lets page components skip the `loading=true` flash on tab switches: if
 * cached data is available they can seed useState with it and trigger a
 * background refresh via getWorkspaceProperties afterwards. No network,
 * no await, no spinner.
 */
export function peekWorkspaceProperties(userId?: string | null, workspaceId?: string | null): Property[] | null {
  if (!userId || !workspaceId) return null;
  const cached = _wsPropsCache.get(`${userId}::${workspaceId}`);
  return cached?.resolved ?? null;
}

export async function getWorkspaceProperties(userId: string, workspaceId: string): Promise<Property[]> {
  const key = `${userId}::${workspaceId}`;
  const cached = _wsPropsCache.get(key);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < _WS_PROPS_CACHE_TTL_MS) {
    return cached.promise;
  }
  // Stale-while-revalidate: if we have a resolved value within the stale window,
  // return it immediately and trigger a background refresh so next render is
  // up to date. This prevents the click-to-spinner flash on tab switches.
  if (cached?.resolved && age < _WS_PROPS_STALE_MS) {
    void _refreshWorkspaceProperties(userId, workspaceId).catch(() => {});
    return cached.resolved;
  }

  const promise = (async () => {
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("[getWorkspaceProperties] No authenticated user");
        return [] as Property[];
      }
      const token = await currentUser.getIdToken();

      const res = await fetch(
        `/api/workspace/properties?workspaceId=${encodeURIComponent(workspaceId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        console.warn(`[getWorkspaceProperties] API returned ${res.status}`);
        return [] as Property[];
      }

      const data = await res.json();
      console.log(
        `[getWorkspaceProperties] API returned ${data.total} properties for workspace "${workspaceId}"`,
      );
      const list = (data.properties || []) as Property[];
      // Save last successful value for stale-while-revalidate path
      const existing = _wsPropsCache.get(key);
      if (existing) existing.resolved = list;
      return list;
    } catch (err: any) {
      console.warn("[getWorkspaceProperties] Failed:", err?.message || err);
      return [] as Property[];
    }
  })();

  _wsPropsCache.set(key, { at: Date.now(), promise });
  promise.catch(() => _wsPropsCache.delete(key));
  return promise;
}

// Background refresh used by the stale-while-revalidate path. Swallows errors
// so a transient failure doesn't bubble into the UI - the next real call
// will retry anyway.
async function _refreshWorkspaceProperties(userId: string, workspaceId: string): Promise<void> {
  const key = `${userId}::${workspaceId}`;
  // Guard against concurrent background refreshes
  const cur = _wsPropsCache.get(key);
  if (cur && Date.now() - cur.at < 1000) return; // another call just fired
  try {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    const res = await fetch(
      `/api/workspace/properties?workspaceId=${encodeURIComponent(workspaceId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.properties || []) as Property[];
    const promise = Promise.resolve(list);
    _wsPropsCache.set(key, { at: Date.now(), promise, resolved: list });
  } catch {
    // best-effort; ignore
  }
}

// ===== PROJECTS =====
export async function createProject(userId: string, data: Partial<Project>): Promise<string> {
  const project: Record<string, any> = {
    userId,
    projectName: data.projectName || "Untitled Project",
    propertyName: data.propertyName || "",
    status: data.status || "active",
    tags: data.tags || [],
    createdAt: now(),
    updatedAt: now(),
  };
  if (data.assetType) project.assetType = data.assetType;
  if (data.subtype) project.subtype = data.subtype;
  if (data.sourceName) project.sourceName = data.sourceName;
  if (data.brokerName) project.brokerName = data.brokerName;
  if (data.brokerEmail) project.brokerEmail = data.brokerEmail;
  if (data.notesSummary) project.notesSummary = data.notesSummary;
  if (data.projectType) project.projectType = data.projectType;
  if (data.description) project.description = data.description;

  const ref = await addDoc(collection(db, "workspace_projects"), project);
  return ref.id;
}

export async function getProject(projectId: string): Promise<Project | null> {
  return safeGet(async () => {
    const snap = await getDoc(doc(db, "workspace_projects", projectId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Project;
  });
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  return safeQuery(async () => {
    // Simple single-field query - no composite index needed
    const q = query(collection(db, "workspace_projects"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const projects = snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
    // Sort client-side
    return projects.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  });
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
  await updateDoc(doc(db, "workspace_projects", projectId), clean({ ...data, updatedAt: now() }));
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateDoc(doc(db, "workspace_projects", projectId), { status: "archived", archivedAt: now(), updatedAt: now() });
}

// ===== PROPERTIES =====
export async function createProperty(projectId: string, data: Partial<Property>): Promise<string> {
  const property: Record<string, any> = {
    projectId,
    propertyName: data.propertyName || "Untitled Property",
    address1: data.address1 || "",
    city: data.city || "",
    state: data.state || "",
    zip: data.zip || "",
    parseStatus: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  if (data.userId) property.userId = data.userId;
  if ((data as any).workspaceId) property.workspaceId = (data as any).workspaceId;
  if (data.address2) property.address2 = data.address2;
  if (data.county) property.county = data.county;
  if (data.market) property.market = data.market;
  if (data.assetType) property.assetType = data.assetType;
  if (data.buildingSf) property.buildingSf = data.buildingSf;
  if (data.landAcres) property.landAcres = data.landAcres;
  if (data.yearBuilt) property.yearBuilt = data.yearBuilt;
  if (data.occupancyPct) property.occupancyPct = data.occupancyPct;

  const ref = await addDoc(collection(db, "workspace_properties"), property);
  return ref.id;
}

export async function getProperty(propertyId: string): Promise<Property | null> {
  try {
    // Try server-side API first (bypasses Firestore security rules)
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/workspace/properties/${encodeURIComponent(propertyId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.property as Property;
      }
    }
  } catch { /* fall through to client-side */ }

  // Fallback: direct Firestore read
  return safeGet(async () => {
    const snap = await getDoc(doc(db, "workspace_properties", propertyId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Property;
  });
}

export async function getProjectProperties(projectId: string): Promise<Property[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_properties"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const props = snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
    return props.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  });
}

export async function getProjectProperty(projectId: string): Promise<Property | null> {
  return safeGet(async () => {
    const q = query(collection(db, "workspace_properties"), where("projectId", "==", projectId), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Property;
  });
}

export async function getUserWorkspaceProperties(userId: string): Promise<Property[]> {
  return safeQuery(async () => {
    // Get all properties by userId (added to properties when created via upload)
    const q = query(collection(db, "workspace_properties"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const props = snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
    return props.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  });
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
  await updateDoc(doc(db, "workspace_properties", propertyId), clean({ ...data, updatedAt: now() }));
}

// ===== DOCUMENTS =====
export async function createDocument(data: Omit<ProjectDocument, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_documents"), clean(data as any));
  return ref.id;
}

export async function getProjectDocuments(projectId: string, propertyId?: string): Promise<ProjectDocument[]> {
  return safeQuery(async () => {
    // Use propertyId if provided, otherwise projectId
    const filterField = propertyId ? "propertyId" : "projectId";
    const filterValue = propertyId || projectId;
    const q = query(collection(db, "workspace_documents"), where(filterField, "==", filterValue));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectDocument));
    // Filter out deleted and sort client-side
    return docs
      .filter(d => !d.isDeleted)
      .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  });
}

export async function updateDocument(docId: string, data: Partial<ProjectDocument>): Promise<void> {
  await updateDoc(doc(db, "workspace_documents", docId), clean({ ...data, updatedAt: now() }));
}

// ===== EXTRACTED FIELDS =====
export async function saveExtractedFields(fields: Omit<ExtractedField, "id">[]): Promise<void> {
  for (const field of fields) {
    await addDoc(collection(db, "workspace_extracted_fields"), clean(field as any));
  }
}

export async function getProjectExtractedFields(projectId: string): Promise<ExtractedField[]> {
  // Try server-side API first (bypasses Firestore security rules)
  try {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/workspace/extracted-fields?projectId=${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return (data.fields || []) as ExtractedField[];
      }
    }
  } catch { /* fall through to client-side */ }

  return safeQuery(async () => {
    const q = query(collection(db, "workspace_extracted_fields"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const fields = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtractedField));
    return fields.sort((a, b) => (a.fieldGroup || "").localeCompare(b.fieldGroup || ""));
  });
}

export async function getPropertyExtractedFields(propertyId: string): Promise<ExtractedField[]> {
  // Try server-side API first (bypasses Firestore security rules)
  try {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/workspace/extracted-fields?propertyId=${encodeURIComponent(propertyId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return (data.fields || []) as ExtractedField[];
      }
    }
  } catch { /* fall through to client-side */ }

  return safeQuery(async () => {
    const q = query(collection(db, "workspace_extracted_fields"), where("propertyId", "==", propertyId));
    const snap = await getDocs(q);
    const fields = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtractedField));
    return fields.sort((a, b) => (a.fieldGroup || "").localeCompare(b.fieldGroup || ""));
  });
}

export async function updateExtractedField(fieldId: string, data: Partial<ExtractedField>): Promise<void> {
  await updateDoc(doc(db, "workspace_extracted_fields", fieldId), clean({ ...data, updatedAt: now() }));
}

// ===== UNDERWRITING =====
export async function createUnderwritingModel(data: Omit<UnderwritingModel, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_underwriting_models"), clean(data as any));
  return ref.id;
}

export async function getProjectUnderwritingModels(projectId: string): Promise<UnderwritingModel[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_underwriting_models"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const models = snap.docs.map(d => ({ id: d.id, ...d.data() } as UnderwritingModel));
    return models.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

export async function updateUnderwritingModel(modelId: string, data: Partial<UnderwritingModel>): Promise<void> {
  await updateDoc(doc(db, "workspace_underwriting_models", modelId), clean({ ...data, updatedAt: now() }));
}

export async function saveUnderwritingOutput(data: Omit<UnderwritingOutput, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_underwriting_outputs"), clean(data as any));
  return ref.id;
}

// ===== SCORES =====
export async function saveScore(data: Omit<Score, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_scores"), clean(data as any));
  return ref.id;
}

export async function getProjectCurrentScore(projectId: string): Promise<Score | null> {
  return safeGet(async () => {
    // Get all scores for project, find current one client-side
    const q = query(collection(db, "workspace_scores"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const scores = snap.docs.map(d => ({ id: d.id, ...d.data() } as Score));
    return scores.find(s => s.isCurrent) || scores.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null;
  });
}

export async function getProjectScoreHistory(projectId: string): Promise<Score[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_scores"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const scores = snap.docs.map(d => ({ id: d.id, ...d.data() } as Score));
    return scores.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

// ===== SNAPSHOTS =====
export async function savePropertySnapshot(data: Omit<PropertySnapshot, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_property_snapshots"), clean(data as any));
  return ref.id;
}

export async function getProjectSnapshot(projectId: string): Promise<PropertySnapshot | null> {
  return safeGet(async () => {
    const q = query(collection(db, "workspace_property_snapshots"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const snapshots = snap.docs.map(d => ({ id: d.id, ...d.data() } as PropertySnapshot));
    return snapshots.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0] || null;
  });
}

// ===== OUTPUTS =====
export async function createOutput(data: Omit<ProjectOutput, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_outputs"), clean(data as any));
  return ref.id;
}

export async function getProjectOutputs(projectId: string): Promise<ProjectOutput[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_outputs"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const outputs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectOutput));
    return outputs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

// ===== NOTES =====
export async function createNote(data: Omit<Note, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_notes"), clean(data as any));
  return ref.id;
}

export async function getProjectNotes(projectId: string): Promise<Note[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_notes"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Note));
    return notes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

export async function getPropertyNotes(propertyId: string): Promise<Note[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_notes"), where("propertyId", "==", propertyId));
    const snap = await getDocs(q);
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Note));
    return notes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

export async function updateNote(noteId: string, data: Partial<Note>): Promise<void> {
  await updateDoc(doc(db, "workspace_notes", noteId), clean({ ...data, updatedAt: now() }));
}

// ===== TASKS =====
export async function createTask(data: Omit<Task, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_tasks"), clean(data as any));
  return ref.id;
}

export async function getProjectTasks(projectId: string): Promise<Task[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_tasks"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
    return tasks.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  });
}

export async function updateTask(taskId: string, data: Partial<Task>): Promise<void> {
  await updateDoc(doc(db, "workspace_tasks", taskId), clean({ ...data, updatedAt: now() }));
}

// ===== ACTIVITY LOGS =====
export async function logActivity(data: Omit<ActivityLog, "id">): Promise<void> {
  try {
    await addDoc(collection(db, "workspace_activity_logs"), clean(data as any));
  } catch {
    // Activity logging should never block the main flow
  }
}

export async function getProjectActivity(projectId: string, max = 50): Promise<ActivityLog[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_activity_logs"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
    return logs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, max);
  });
}

// ===== PARSER RUNS =====
export async function createParserRun(data: Omit<ParserRun, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "workspace_parser_runs"), clean(data as any));
  return ref.id;
}

export async function updateParserRun(runId: string, data: Partial<ParserRun>): Promise<void> {
  await updateDoc(doc(db, "workspace_parser_runs", runId), clean(data as any));
}

export async function getProjectParserRuns(projectId: string): Promise<ParserRun[]> {
  return safeQuery(async () => {
    const q = query(collection(db, "workspace_parser_runs"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    const runs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ParserRun));
    return runs.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  });
}

// ===== DELETE OPERATIONS =====
export async function deleteProject(projectId: string): Promise<void> {
  // Delete all child entities
  const collections = [
    "workspace_properties", "workspace_documents", "workspace_extracted_fields",
    "workspace_underwriting_models", "workspace_underwriting_outputs", "workspace_scores",
    "workspace_property_snapshots", "workspace_outputs", "workspace_notes",
    "workspace_tasks", "workspace_activity_logs", "workspace_parser_runs",
  ];
  for (const coll of collections) {
    try {
      const q = query(collection(db, coll), where("projectId", "==", projectId));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } catch { /* continue */ }
  }
  await deleteDoc(doc(db, "workspace_projects", projectId));
}

export async function deleteProperty(propertyId: string, projectId: string): Promise<void> {
  // Delete documents linked to this property
  try {
    const q = query(collection(db, "workspace_documents"), where("propertyId", "==", propertyId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch { /* continue */ }
  // Delete extracted fields linked to this property
  try {
    const q = query(collection(db, "workspace_extracted_fields"), where("propertyId", "==", propertyId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch { /* continue */ }
  await deleteDoc(doc(db, "workspace_properties", propertyId));
}

// ===== SCOREBOARD (cross-project) =====
export async function getAllProjectsForScoreboard(userId: string): Promise<(Project & { snapshot?: PropertySnapshot; score?: Score })[]> {
  const projects = await getUserProjects(userId);
  return projects.filter(p => p.status !== "archived").map(p => ({
    ...p,
    snapshot: undefined,
    score: undefined,
  }));
}
