/**
 * Number / currency formatters that match the SiteMap CRE reference panel.
 */
export const fmtInt = (v: number | null | undefined): string =>
  v == null ? "--" : Math.round(v).toLocaleString();

export const fmtMoney = (v: number | null | undefined): string =>
  v == null ? "--" : "$" + Math.round(v).toLocaleString();

export const fmtPct = (v: number | null | undefined): string =>
  v == null ? "--" : `${(Math.round(v * 10) / 10).toFixed(1)}%`;

export const fmtFixed1 = (v: number | null | undefined): string =>
  v == null ? "--" : (Math.round(v * 10) / 10).toFixed(1);
