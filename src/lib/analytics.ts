declare global {
  interface Window {
    gtag: (command: string, eventName: string, params?: Record<string, any>) => void;
  }
}

export function trackEvent(action: string, category: string, label?: string, value?: number): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  const params: Record<string, any> = {
    event_category: category,
  };

  if (label) {
    params.event_label = label;
  }

  if (value !== undefined) {
    params.value = value;
  }

  window.gtag('event', action, params);
}

export function trackSubscribe(source: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'subscribe', {
    event_category: 'engagement',
    event_label: source,
  });
}

/** Fire when user clicks the subscribe button (form submit attempt) */
export function trackSubscribeSubmit(source: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'subscribe_submit', {
    event_category: 'newsletter',
    event_label: source,
    source,
  });
}

/** Fire when subscribe API returns success - mark this as a CONVERSION in GA4 */
export function trackSubscribeSuccess(source: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'subscribe_success', {
    event_category: 'newsletter',
    event_label: source,
    source,
  });

  // Also fire the standard GA4 "generate_lead" event for built-in reporting
  window.gtag('event', 'generate_lead', {
    event_category: 'newsletter',
    event_label: source,
    currency: 'USD',
    value: 1,
  });
}

/** Fire when subscribe API returns an error */
export function trackSubscribeError(source: string, errorMessage: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'subscribe_error', {
    event_category: 'newsletter',
    event_label: source,
    source,
    error_message: errorMessage,
  });
}

export function trackArticleView(slug: string, title: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'article_view', {
    event_category: 'content',
    event_label: slug,
    article_title: title,
  });
}

export function trackToolUse(toolName: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'tool_use', {
    event_category: 'tools',
    event_label: toolName,
  });
}

export function trackDealView(tenant: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'deal_view', {
    event_category: 'deals',
    event_label: tenant,
  });
}

export function trackSearch(query: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'search', {
    event_category: 'engagement',
    search_term: query,
  });
}

export function trackShareClick(platform: string, articleSlug: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'share', {
    event_category: 'engagement',
    event_label: `${platform}_${articleSlug}`,
    share_platform: platform,
  });
}

// ─── DEALSIGNALS CONVERSION FUNNEL EVENTS ────────────────────────────

/** Lite analyzer: user uploads a file */
export function trackLiteUpload(fileName: string, fileType: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'lite_upload', {
    event_category: 'analyzer',
    event_label: fileName,
    file_type: fileType,
  });
}

/** Lite analyzer: analysis result shown */
export function trackLiteResult(propertyName: string, dealScore: number): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'lite_result_view', {
    event_category: 'analyzer',
    event_label: propertyName,
    deal_score: dealScore,
  });
  // GA4 built-in: view_item
  window.gtag('event', 'view_item', {
    items: [{ item_name: propertyName, item_category: 'deal_analysis', price: 0 }],
  });
}

/** Lead capture: user submits email on lite report */
export function trackLeadCapture(source: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'generate_lead', {
    event_category: 'conversion',
    event_label: source,
    currency: 'USD',
    value: 5,
  });
}

/** User clicks Upgrade to Pro CTA */
export function trackProCTAClick(location: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'pro_cta_click', {
    event_category: 'conversion',
    event_label: location,
  });
}

/** User starts signup / login flow */
export function trackSignupStart(source: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'sign_up', {
    event_category: 'conversion',
    event_label: source,
    method: 'google',
  });
}

/** User completes paid subscription */
export function trackPurchase(tier: string, value: number): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'purchase', {
    event_category: 'conversion',
    event_label: tier,
    currency: 'USD',
    value,
    items: [{ item_name: `DealSignals ${tier}`, item_category: 'subscription', price: value }],
  });
}

/** User downloads a file from lite report */
export function trackDownload(fileType: string, propertyName: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'file_download', {
    event_category: 'engagement',
    event_label: `${fileType}_${propertyName}`,
    file_type: fileType,
  });
}
