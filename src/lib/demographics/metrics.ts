/**
 * Single source of truth for the demographics metrics. The panel and the
 * choropleth color picker both consume this list, so adding or removing a
 * metric only takes one edit.
 */
import { fmtInt, fmtMoney, fmtPct, fmtFixed1 } from "./format";
import type { RingAggregate } from "./aggregate";

export type MetricKey =
  | "population"
  | "medIncome"
  | "households"
  | "rentersPct"
  | "medAge"
  | "medicaidPct"
  | "educationPct"
  | "homeValue"
  | "walkability"
  | "daytimeWorkers";

// What we color the choropleth by. Maps to a numeric key on TractMetrics
// (or "popDensity" computed from population).
export type ColorKey =
  | "popDensity"
  | "medIncome"
  | "households"
  | "rentersPct"
  | "medAge"
  | "medicaidPct"
  | "educationPct"
  | "homeValue"
  | "daytimeWorkers";

export interface MetricDef {
  key: MetricKey;
  label: string;
  fmt: (v: number | null | undefined) => string;
  colorLabel: string | null;
  colorKey: ColorKey | null;
}

export const METRICS: MetricDef[] = [
  { key: "population",     label: "Population",      fmt: fmtInt,    colorLabel: "Pop. Density",   colorKey: "popDensity" },
  { key: "medIncome",      label: "Med. Income",     fmt: fmtMoney,  colorLabel: "Med. Income",    colorKey: "medIncome" },
  { key: "households",     label: "Households",      fmt: fmtInt,    colorLabel: "Households",     colorKey: "households" },
  { key: "rentersPct",     label: "Renters",         fmt: fmtPct,    colorLabel: "Renters",        colorKey: "rentersPct" },
  { key: "medAge",         label: "Med. Age",        fmt: fmtFixed1, colorLabel: "Med. Age",       colorKey: "medAge" },
  { key: "medicaidPct",    label: "Medicaid",        fmt: fmtPct,    colorLabel: "Medicaid",       colorKey: "medicaidPct" },
  { key: "educationPct",   label: "Education",       fmt: fmtPct,    colorLabel: "Education",      colorKey: "educationPct" },
  { key: "homeValue",      label: "Home Value",      fmt: fmtMoney,  colorLabel: "Home Value",     colorKey: "homeValue" },
  { key: "walkability",    label: "Walkability",     fmt: fmtFixed1, colorLabel: null,             colorKey: null },
  { key: "daytimeWorkers", label: "Daytime Workers", fmt: fmtInt,    colorLabel: "Daytime Workers", colorKey: "daytimeWorkers" },
];

export const DEFAULT_COLOR_KEY: ColorKey = "medIncome";

// Helper for table reads.
export function metricValue(ring: RingAggregate, key: MetricKey): number | null {
  const v = (ring as any)[key];
  return v == null ? null : Number(v);
}
