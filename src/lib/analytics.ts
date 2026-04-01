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
