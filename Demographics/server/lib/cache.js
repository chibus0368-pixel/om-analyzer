/**
 * Tiny in-memory TTL cache. Keeps the Census APIs responsive and under
 * their rate limits. Keyed by arbitrary string.
 */
class TTLCache {
  constructor(defaultTtlMs = 1000 * 60 * 60 * 6) {
    this.map = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expires) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }
  set(key, value, ttlMs) {
    this.map.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }
  async wrap(key, fn, ttlMs) {
    const hit = this.get(key);
    if (hit !== null) return hit;
    const value = await fn();
    this.set(key, value, ttlMs);
    return value;
  }
}

module.exports = { TTLCache };
