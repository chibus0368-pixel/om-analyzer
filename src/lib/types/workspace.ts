import { Timestamp } from 'firebase/firestore';

export type AnalysisType = 'retail' | 'industrial' | 'office' | 'land' | 'multifamily';

/**
 * Per-workspace underwriting baseline.
 *
 * These values are the *standardized* inputs used by DealQuickScreen,
 * OmReversePricing, and any other analysis that should be comparable
 * across deals in this workspace. They intentionally do NOT come from
 * the OM on a given property, because OM-sourced debt terms vary deal
 * to deal and make scoring non-comparable.
 */
export interface UnderwritingDefaults {
  ltv: number;              // 0-100 (percent)
  interestRate: number;     // 0-100 (percent)
  amortYears: number;
  holdYears: number;
  exitCap: number;          // 0-100 (percent)
  vacancy: number;          // 0-100 (percent)
  rentGrowth: number;       // 0-100 (percent)
  expenseGrowth: number;    // 0-100 (percent)
  targetLeveredIrr: number; // 0-100 (percent) -- used by OM Reverse Pricing
}

export const DEFAULT_UNDERWRITING: UnderwritingDefaults = {
  ltv: 65,
  interestRate: 6.5,
  amortYears: 25,
  holdYears: 10,
  exitCap: 7.0,
  vacancy: 5,
  rentGrowth: 2.5,
  expenseGrowth: 3.0,
  targetLeveredIrr: 15,
};

export interface WorkspaceDoc {
  id: string;
  uid: string;
  name: string;
  slug: string;
  analysisType: AnalysisType;
  isDefault: boolean;
  underwritingDefaults?: UnderwritingDefaults;
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
