/**
 * Tiny in-memory TTL cache. Keeps the Census APIs responsive and under
 * their rate limits. Keyed by arbitrary string. Module-level singleton
 * survives across hot reloads in dev and across requests in serverless
 * warm starts.
 */
type Entry<T> = { value: T; expires: number };

export class TTLCache {
  private map = new Map<string, Entry<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 1000 * 60 * 60 * 6) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | null {
    const hit = this.map.get(key) as Entry<T> | undefined;
    if (!hit) return null;
    if (Date.now() > hit.expires) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.map.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    this.set(key, value, ttlMs);
    return value;
  }
}
