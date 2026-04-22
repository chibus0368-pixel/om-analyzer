/**
 * Single source of truth for the demographics metrics the panel + map share.
 * Add/remove entries here and both the table and the Color By chips update.
 */
import { fmtInt, fmtMoney, fmtPct, fmtFixed1 } from './format.js';

export const METRICS = [
  { key: 'population',     label: 'Population',      fmt: fmtInt,    colorLabel: 'Pop. Density', colorKey: 'popDensity' },
  { key: 'medIncome',      label: 'Med. Income',     fmt: fmtMoney,  colorLabel: 'Med. Income',  colorKey: 'medIncome' },
  { key: 'households',     label: 'Households',      fmt: fmtInt,    colorLabel: 'Households',   colorKey: 'households' },
  { key: 'rentersPct',     label: 'Renters',         fmt: fmtPct,    colorLabel: 'Renters',      colorKey: 'rentersPct' },
  { key: 'medAge',         label: 'Med. Age',        fmt: fmtFixed1, colorLabel: 'Med. Age',     colorKey: 'medAge' },
  { key: 'medicaidPct',    label: 'Medicaid',        fmt: fmtPct,    colorLabel: 'Medicaid',     colorKey: 'medicaidPct' },
  { key: 'educationPct',   label: 'Education',       fmt: fmtPct,    colorLabel: 'Education',    colorKey: 'educationPct' },
  { key: 'homeValue',      label: 'Home Value',      fmt: fmtMoney,  colorLabel: 'Home Value',   colorKey: 'homeValue' },
  { key: 'walkability',    label: 'Walkability',     fmt: fmtFixed1, colorLabel: 'Walkability',  colorKey: null },
  { key: 'daytimeWorkers', label: 'Daytime Workers', fmt: fmtInt,    colorLabel: 'Daytime Workers', colorKey: 'daytimeWorkers' },
];

// default "color by" selection
export const DEFAULT_COLOR_KEY = 'medIncome';
