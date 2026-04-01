// ===== ARTICLES =====
export type ArticleType =
  | "featured_analysis"
  | "market_update"
  | "deal_breakdown"
  | "risk_alert"
  | "guide"
  | "tool_spotlight"
  | "ai_tools_weekly";

export type ArticleStatus = "draft" | "review" | "published" | "archived";

export interface Article {
  id: string;
  slug: string;
  title: string;
  dek: string;
  summary: string;
  body: string;
  type: ArticleType;
  status: ArticleStatus;
  publishedAt: Date | null;
  updatedAt: Date;
  authorId: string;
  coverImage: string;
  readingTime: number;
  tags: string[];
  relatedArticleSlugs: string[];
  relatedToolSlugs: string[];
  sources: ArticleSource[];
  seoTitle: string;
  seoDescription: string;
}

export interface ArticleSource {
  name: string;
  url: string;
}

// ===== MARKET DATA =====
export interface MarketSeries {
  id: string;
  slug: string;
  name: string;
  unit: string;
  sourceName: string;
  sourceUrl: string;
  cadence: "daily" | "weekly" | "monthly";
  lastIngestedAt: Date | null;
}

export interface MarketDataPoint {
  id: string;
  timestamp: Date;
  value: number;
  retrievedAt: Date;
}

export interface MarketSnapshot {
  id: string;
  items: MarketSnapshotItem[];
  updatedAt: Date;
}

export interface MarketSnapshotItem {
  label: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "hold";
}

// ===== TICKER =====
export interface TickerItem {
  name: string;
  value: string;
  change: string;
  direction: "up" | "down" | "hold";
}

export interface TickerConfig {
  items: TickerItem[];
  updatedAt: Date;
}

// ===== CALCULATORS =====
export interface Calculator {
  id: string;
  slug: string;
  name: string;
  description: string;
  inputsSchema: CalculatorInput[];
  calculationVersion: number;
}

export interface CalculatorInput {
  key: string;
  label: string;
  type: "number" | "percentage" | "currency";
  placeholder?: string;
  required: boolean;
}

// ===== SUBSCRIBERS =====
export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed" | "bounced" | "complained";

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  interests: string[];
  frequency: "daily" | "weekly" | "both";
  createdAt: Date;
  confirmedAt: Date | null;
  source: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

// ===== EMAIL CAMPAIGNS =====
export type CampaignType = "daily_brief" | "weekly_digest" | "ai_tools_weekly" | "custom";

export interface EmailCampaign {
  id: string;
  type: CampaignType;
  subject: string;
  preheader: string;
  bodyHtml: string;
  segmentDefinition: Record<string, unknown>;
  scheduledFor: Date | null;
  sentAt: Date | null;
  metrics: CampaignMetrics;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

// ===== AI TOOLS =====
export type PricingModel = "free" | "freemium" | "paid" | "enterprise" | "contact";

export interface AITool {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  websiteUrl: string;
  pricingModel: PricingModel;
  roles: string[];
  creUseCases: string[];
  screenshots: string[];
  status: "draft" | "published";
}

// ===== AI WORKFLOWS =====
export interface AIWorkflow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  steps: WorkflowStep[];
  roles: string[];
  dealPhases: string[];
  status: "draft" | "published";
}

export interface WorkflowStep {
  title: string;
  description: string;
  toolSlugs: string[];
  expectedOutput: string;
  timeSaved: string;
}

// ===== CONTENT ENGINE TYPES =====
export type ContentType = "learning" | "news";

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  category: string;
  enabled: boolean;
  lastFetched: Date | null;
}

export interface NewsItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  aiSummary: string | null;
  sourceUrl: string;
  sourceName: string;
  publishedAt: Date | null;
  category: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  validationScore: number | null;
}

// ===== SITE CONFIG =====
export interface SiteConfig {
  heroBarText: string;
  heroBarHighlight: string;
  heroBarStats: string;
  dateEdition: string;
  volumeNumber: number;
}
