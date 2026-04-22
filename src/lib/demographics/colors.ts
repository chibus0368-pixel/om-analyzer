/**
 * Sequential color ramp (yellow -> orange -> red) for the choropleth.
 * Given a normalized value in [0,1] returns an RGB string. Robust min/max
 * helper trims the top/bottom 5% so a single outlier tract doesn't crush
 * the rest of the ramp.
 */
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [246, 211, 106]],
  [0.5, [233, 138, 74]],
  [1.0, [177, 47, 47]],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function rampColor(t: number): string {
  if (!Number.isFinite(t)) return "rgb(160,170,185)";
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (x >= t0 && x <= t1) {
      const local = (x - t0) / (t1 - t0);
      const [r, g, b] = lerpRgb(c0, c1, local);
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
  }
  const [r, g, b] = STOPS[STOPS.length - 1][1];
  return `rgb(${r}, ${g}, ${b})`;
}

export function robustRange(values: Array<number | null | undefined>): [number, number] {
  const clean = values.filter((v): v is number => Number.isFinite(v as number));
  if (clean.length === 0) return [0, 1];
  clean.sort((a, b) => a - b);
  const lo = clean[Math.floor(clean.length * 0.05)];
  const hi = clean[Math.floor(clean.length * 0.95)];
  if (lo === hi) return [clean[0], clean[clean.length - 1] || clean[0] + 1];
  return [lo, hi];
}
