// ===== DealSignals Deal Analyzer - Core Types =====

// --- Enums ---
export type AnalysisType = "retail" | "industrial" | "office" | "land" | "multifamily";
export type ProjectStatus = "active" | "under_review" | "due_diligence" | "closed" | "passed" | "archived";
export type AssetType = "retail" | "industrial" | "office" | "medical_office" | "mixed_use" | "restaurant" | "auto" | "bank" | "pharmacy" | "dollar_store" | "convenience" | "other";
export type DocCategory = "om" | "flyer" | "rent_roll" | "t12" | "underwriting" | "lease" | "market_report" | "site_plan" | "image" | "note" | "misc";
export type ParserStatus = "uploaded" | "queued" | "classifying" | "parsing" | "parsed" | "needs_review" | "failed";
export type ModelType = "quick" | "standard" | "advanced" | "scenario";
export type ScoreBand = "strong_buy" | "buy" | "hold" | "pass" | "strong_reject";
export type NoteType = "general" | "investment_thesis" | "risk" | "next_step" | "reminder";
export type TaskStatus = "open" | "in_progress" | "blocked" | "complete";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type UserRole = "admin" | "standard" | "read_only";
export type OutputType = "deal_snapshot" | "pro_forma_pdf" | "pro_forma_xlsx" | "deal_brief_docx" | "deal_brief_pdf" | "scorecard_pdf" | "export_package_zip";

// --- Core Entities ---

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  slug: string;
  analysisType: AnalysisType;
  isDefault?: boolean;
  propertyCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  storageQuotaMb: number;
  defaultAssumptionsId?: string;
}

export type ProjectType = "single" | "portfolio" | "research" | "market";

export interface Project {
  id: string;
  userId: string;
  projectName: string;
  propertyName: string;
  projectType?: ProjectType;
  description?: string;
  status: ProjectStatus;
  recommendation?: string;
  assetType?: AssetType;
  subtype?: string;
  sourceName?: string;
  brokerName?: string;
  brokerEmail?: string;
  notesSummary?: string;
  tags: string[];
  scoreTotal?: number;
  scoreBand?: ScoreBand;
  primaryPropertyId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  lastParserRunAt?: string;
  lastOutputGeneratedAt?: string;
}

export interface Property {
  id: string;
  projectId: string;
  userId?: string;
  workspaceId?: string;
  propertyName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  market?: string;
  submarket?: string;
  latitude?: number;
  longitude?: number;
  assetType?: AssetType;
  subtype?: string;
  buildingSf?: number;
  landAcres?: number;
  yearBuilt?: number;
  yearRenovated?: number;
  parkingCount?: number;
  parkingRatio?: number;
  suiteCount?: number;
  tenantCount?: number;
  occupancyPct?: number;
  anchorFlag?: boolean;
  conditionNotes?: string;
  createdAt: string;
  updatedAt: string;
  // Multi-asset classification fields
  detectedType?: AnalysisType | null;
  analysisType?: AnalysisType;
  classificationConfidence?: number;
  classificationReason?: string;
  isMismatch?: boolean;
  scoringModelVersion?: string;
  extractionSchemaVersion?: string;
  // Hero + gallery images
  heroImageUrl?: string;
  galleryImages?: GalleryImage[];
  // Card-level summary metrics (written at parse time for DealBoard cards)
  cardAskingPrice?: number;
  cardCapRate?: number;
  cardNoi?: number;
  cardBuildingSf?: number;
  cardTotalAcres?: number;
  cardPricePerAcre?: number;
}

export interface GalleryImage {
  url: string;
  storagePath: string;
  filename: string;
  caption?: string;
  uploadedAt: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  userId: string;
  propertyId?: string;
  originalFilename: string;
  storedFilename: string;
  fileExt: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  docCategory?: DocCategory;
  docSubtype?: string;
  uploadSource?: string;
  parserStatus: ParserStatus;
  parserVersion?: string;
  aiClassificationConfidence?: number;
  isArchived: boolean;
  isDeleted: boolean;
  uploadedAt: string;
  updatedAt: string;
}

export interface ExtractedField {
  id: string;
  projectId: string;
  propertyId?: string;
  documentId: string;
  fieldGroup: string;
  fieldName: string;
  rawValue?: string;
  normalizedValue?: string | number;
  unit?: string;
  confidenceScore?: number;
  sourceLocator?: string;
  sourcePage?: number;
  sourceSheet?: string;
  extractionMethod?: string;
  isUserConfirmed: boolean;
  isUserOverridden: boolean;
  userOverrideValue?: string | number;
  conflictGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertySnapshot {
  id: string;
  projectId: string;
  propertyId: string;
  purchasePrice?: number;
  pricePsf?: number;
  occupancyPct?: number;
  grossIncome?: number;
  noiInPlace?: number;
  noiProForma?: number;
  capRateInPlace?: number;
  capRateProForma?: number;
  debtServiceAnnual?: number;
  dscr?: number;
  cashOnCash?: number;
  irr?: number;
  equityMultiple?: number;
  breakEvenOccupancy?: number;
  updatedAt: string;
  generatedFromRunId?: string;
}

export interface UnderwritingModel {
  id: string;
  projectId: string;
  propertyId?: string;
  modelName: string;
  modelType: ModelType;
  purchasePrice: number;
  closingCosts: number;
  loanAmount: number;
  ltv: number;
  interestRate: number;
  amortYears: number;
  ioMonths: number;
  holdYears: number;
  exitCap: number;
  vacancyAssumption: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  tiReserve: number;
  lcReserve: number;
  capexReserve: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface UnderwritingOutput {
  id: string;
  projectId: string;
  propertyId?: string;
  underwritingModelId: string;
  grossIncomeYear1: number;
  egiYear1: number;
  opexYear1: number;
  noiYear1: number;
  stabilizedNoi: number;
  debtServiceAnnual: number;
  dscr: number;
  cashFlowBeforeTax: number;
  cashOnCashReturn: number;
  irr: number;
  equityMultiple: number;
  breakEvenOccupancy: number;
  assumptionsHash?: string;
  createdAt: string;
}

export interface Score {
  id: string;
  projectId: string;
  propertyId?: string;
  scoringModelVersion: string;
  totalScore: number;
  scoreBand: ScoreBand;
  recommendation: string;
  pricingScore: number;
  cashflowScore: number;
  upsideScore: number;
  tenantScore: number;
  rolloverRiskScore: number;
  vacancyScore: number;
  locationScore: number;
  physicalConditionScore: number;
  redevelopmentScore: number;
  confidenceScore: number;
  explanationJson?: Record<string, string>;
  createdAt: string;
  isCurrent: boolean;
  // New scoring model fields (industrial/office/land)
  analysisType?: AnalysisType;
  incomeQualityScore?: number;
  functionalityScore?: number;
  occupancyStabilityScore?: number;
  tenantMixScore?: number;
  leaseRolloverScore?: number;
  capitalExposureScore?: number;
  zoningScore?: number;
  utilitiesScore?: number;
  accessScore?: number;
  categoryScores?: Record<string, number>;
  categoryWeights?: Record<string, number>;
}

export interface ProjectOutput {
  id: string;
  projectId: string;
  propertyId?: string;
  outputType: OutputType;
  title: string;
  storagePath: string;
  fileExt: string;
  versionNumber: number;
  generatedBy: string;
  generationStatus: "generating" | "completed" | "failed";
  sourceModelId?: string;
  createdAt: string;
}

export interface Note {
  id: string;
  projectId: string;
  userId: string;
  noteType: NoteType;
  title?: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  userId: string;
  activityType: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
}

export interface ParserRun {
  id: string;
  projectId: string;
  triggeredByUserId: string;
  runStatus: "queued" | "running" | "completed" | "completed_with_warnings" | "failed";
  startedAt: string;
  completedAt?: string;
  parserVersion: string;
  filesProcessedCount: number;
  fieldsExtractedCount: number;
  warningCount: number;
  errorCount: number;
  summaryJson?: Record<string, unknown>;
}

// --- Feature Flags ---
export interface FeatureFlags {
  retailEnabled: boolean;
  industrialEnabled: boolean;
  officeEnabled: boolean;
  landEnabled: boolean;
  multifamilyEnabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  retailEnabled: true,
  industrialEnabled: true,
  officeEnabled: true,
  landEnabled: true,
  multifamilyEnabled: true,
};

// --- UI helpers ---
export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  retail: "Retail",
  industrial: "Industrial",
  office: "Office / Medical Office",
  land: "Land",
  multifamily: "Multifamily",
};

export const ANALYSIS_TYPE_ICONS: Record<AnalysisType, string> = {
  retail: "🏪",
  industrial: "🏭",
  office: "🏢",
  land: "📍",
  multifamily: "🏠",
};

export const ANALYSIS_TYPE_COLORS: Record<AnalysisType, string> = {
  retail: "#10B981",
  industrial: "#F59E0B",
  office: "#3B82F6",
  land: "#8B5CF6",
  multifamily: "#EC4899",
};

export const TOP_METRICS: Record<AnalysisType, string[]> = {
  retail: ["asking_price", "cap_rate", "noi", "occupancy", "tenant_count", "wale", "score"],
  industrial: ["asking_price", "building_sf", "rent_per_sf", "clear_height", "loading_type", "lease_term", "score"],
  office: ["asking_price", "building_sf", "occupancy", "rent_per_sf", "tenant_mix", "near_term_rollover", "score"],
  land: ["asking_price", "land_acres", "price_per_acre", "zoning", "utilities_signal", "access_signal", "score"],
  multifamily: ["asking_price", "cap_rate", "noi", "unit_count", "avg_rent_per_unit", "occupancy", "score"],
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  retail: "Retail",
  industrial: "Industrial",
  office: "Office",
  medical_office: "Medical Office",
  mixed_use: "Mixed Use",
  restaurant: "Restaurant",
  auto: "Auto",
  bank: "Bank",
  pharmacy: "Pharmacy",
  dollar_store: "Dollar Store",
  convenience: "Convenience",
  other: "Other",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  under_review: "Under Review",
  due_diligence: "Due Diligence",
  closed: "Closed",
  passed: "Passed",
  archived: "Archived",
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: "#10B981",
  under_review: "#F59E0B",
  due_diligence: "#2563EB",
  closed: "#6B7280",
  passed: "#DC3545",
  archived: "#9CA3AF",
};

export const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Neutral",
  pass: "Pass",
  strong_reject: "Strong Reject",
};

export const SCORE_BAND_COLORS: Record<ScoreBand, string> = {
  strong_buy: "#059669",
  buy: "#10B981",
  hold: "#F59E0B",
  pass: "#EF4444",
  strong_reject: "#991B1B",
};

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  om: "Offering Memorandum",
  flyer: "Flyer",
  rent_roll: "Rent Roll",
  t12: "T-12",
  underwriting: "Underwriting Model",
  lease: "Lease Summary",
  market_report: "Market Report",
  site_plan: "Site Plan",
  image: "Image",
  note: "Note",
  misc: "Miscellaneous",
};

export function getScoreBand(score: number): ScoreBand {
  if (score >= 85) return "strong_buy";
  if (score >= 70) return "buy";
  if (score >= 50) return "hold";
  if (score >= 30) return "pass";
  return "strong_reject";
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatSf(value: number): string {
  return `${value.toLocaleString()} SF`;
}
