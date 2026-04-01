import { Timestamp } from 'firebase/firestore';

export type AnalysisType = 'retail' | 'industrial' | 'office' | 'multifamily' | 'mixed_use';

export interface WorkspaceDoc {
  id: string;
  uid: string;
  name: string;
  slug: string;
  analysisType: AnalysisType;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WorkspaceMemberDoc {
  workspaceId: string;
  uid: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}
