export const TOPIC_OPTIONS = [
  'Retail', 'Industrial', 'Office', 'Multifamily',
  'Data Centers', 'Risk & Alerts', 'Analysis', 'Learning Center',
] as const;

export type Topic = typeof TOPIC_OPTIONS[number];

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained';
export type Frequency = 'daily' | 'weekly' | 'both';

export interface SubscriberDoc {
  email: string;
  status: SubscriberStatus;
  frequency: Frequency;
  topics: string[];
  paused: boolean;
  createdAt: string;
  confirmedAt?: string;
  updatedAt?: string;
  unsubscribedAt?: string;
  resubscribedAt?: string;
  source: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  confirmTokenHash?: string;
  confirmTokenExpiresAt?: string;
  manageTokenHash?: string;
  manageTokenExpiresAt?: string;
  bounceCount: number;
  lastEmailSentAt?: string;
  resendContactId?: string;
  ipHash?: string;
  feedbackReason?: string;
  feedbackComment?: string;
}

export interface SubscriptionEvent {
  subscriberId: string;
  email: string;
  eventType: 'subscribe_requested' | 'confirmed' | 'preferences_updated' | 'unsubscribed' | 'resubscribed' | 'bounced' | 'complained' | 'email_sent' | 'confirmation_resent';
  timestamp: string;
  details?: Record<string, unknown>;
}

