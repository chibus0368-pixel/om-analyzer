import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  FieldValue,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  WorkspaceDoc,
  WorkspaceMemberDoc,
  UnderwritingDefaults,
} from '@/lib/types/workspace';
import { DEFAULT_UNDERWRITING } from '@/lib/types/workspace';

export async function getWorkspaceDoc(workspaceId: string): Promise<WorkspaceDoc | null> {
  const snap = await getDoc(doc(db, 'workspaces', workspaceId));
  return snap.exists() ? (snap.data() as WorkspaceDoc) : null;
}

export async function getUserDefaultWorkspace(uid: string): Promise<WorkspaceDoc | null> {
  const snap = await getDoc(doc(db, 'workspaces', `${uid}_default`));
  return snap.exists() ? (snap.data() as WorkspaceDoc) : null;
}

export async function createDefaultWorkspace(uid: string, email: string): Promise<WorkspaceDoc> {
  const workspaceId = `${uid}_default`;
  const slug = email.split('@')[0] + '-default';

  const workspace: WorkspaceDoc = {
    id: workspaceId,
    uid,
    name: 'Default DealBoard',
    slug,
    analysisType: 'retail',
    isDefault: true,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(doc(db, 'workspaces', workspaceId), workspace);

  // Create member entry
  const member: WorkspaceMemberDoc = {
    workspaceId,
    uid,
    role: 'owner',
    joinedAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(doc(db, 'workspace_members', `${workspaceId}_${uid}`), member);

  return workspace;
}

export async function getWorkspaceMember(
  workspaceId: string,
  uid: string
): Promise<WorkspaceMemberDoc | null> {
  const snap = await getDoc(doc(db, 'workspace_members', `${workspaceId}_${uid}`));
  return snap.exists() ? (snap.data() as WorkspaceMemberDoc) : null;
}

export async function createWorkspaceMember(
  workspaceId: string,
  uid: string,
  role: 'owner' | 'admin' | 'member' | 'viewer'
): Promise<WorkspaceMemberDoc> {
  const member: WorkspaceMemberDoc = {
    workspaceId,
    uid,
    role,
    joinedAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(doc(db, 'workspace_members', `${workspaceId}_${uid}`), member);

  return member;
}

/**
 * Read the workspace's standardized underwriting baseline. Falls back to
 * DEFAULT_UNDERWRITING if the workspace doc is missing or has never saved
 * settings. Callers should prefer this over any per-property debt assumption
 * when computing a score that needs to be comparable across deals.
 */
export async function getUnderwritingDefaults(
  workspaceId: string | null | undefined
): Promise<UnderwritingDefaults> {
  if (!workspaceId) return { ...DEFAULT_UNDERWRITING };
  try {
    const ws = await getWorkspaceDoc(workspaceId);
    if (ws?.underwritingDefaults) {
      // Merge to pick up any fields that older saved docs don't have yet.
      return { ...DEFAULT_UNDERWRITING, ...ws.underwritingDefaults };
    }
  } catch {
    // Fall through to defaults on any error.
  }
  return { ...DEFAULT_UNDERWRITING };
}

/**
 * Persist underwriting defaults on the workspace doc. Only the fields in
 * UnderwritingDefaults are written; other workspace fields are untouched.
 */
export async function saveUnderwritingDefaults(
  workspaceId: string,
  defaults: UnderwritingDefaults
): Promise<void> {
  await updateDoc(doc(db, 'workspaces', workspaceId), {
    underwritingDefaults: defaults,
    updatedAt: serverTimestamp(),
  });
}
