/**
 * Number/currency formatters that match the reference SiteMap CRE tool.
 */
export const fmtInt = v => (v == null ? '-' : Math.round(v).toLocaleString());
export const fmtMoney = v =>
  v == null ? '-' : '$' + Math.round(v).toLocaleString();
export const fmtPct = v =>
  v == null ? '-' : `${(Math.round(v * 10) / 10).toFixed(1)}%`;
export const fmtFixed1 = v =>
  v == null ? '-' : (Math.round(v * 10) / 10).toFixed(1);
