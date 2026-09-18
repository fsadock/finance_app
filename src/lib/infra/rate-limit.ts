/** In-memory sliding window rate limiter. Not shared across workers (sufficient for a single-user app). */
const windows = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if the rate limit is exceeded.
 * @param key     Unique identifier for the rate limit bucket (e.g. route path)
 * @param max     Max requests allowed within the window
 * @param windowMs  Window size in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  windows.set(key, timestamps);
  return true;
}
