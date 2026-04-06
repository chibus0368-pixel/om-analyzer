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
import type { WorkspaceDoc, WorkspaceMemberDoc } from '@/lib/types/workspace';

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
