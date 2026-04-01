/**
 * Site-wide constants derived from actual data sources.
 * Import from here instead of hardcoding counts anywhere.
 */

import { GUIDES, GUIDE_CATEGORIES } from "./guides-data";

// ─── GUIDE COUNTS ──────────────────────────────────────────────────
// Single source of truth - updates automatically when guides-data.ts changes

export const GUIDE_COUNT = GUIDES.length;

export const GUIDE_CATEGORY_COUNTS = GUIDE_CATEGORIES
  .filter((cat) => cat.id !== "all")
  .map((cat) => ({
    id: cat.id,
    label: cat.label,
    count: GUIDES.filter((g) => g.category === cat.id).length,
  }));

// ─── TERMINOLOGY ──────────────────────────────────────────────────
// Preferred terms for consistency across the site

export const TERMS = {
  /** Learning Center content - always "Guides" */
  guides: "Guides",
  /** News and analysis content - always "Articles" */
  articles: "Articles",
} as const;
