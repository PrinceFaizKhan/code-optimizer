export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/** Returns a function that reports whether a request may proceed, consuming budget when it may. */
export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): () => boolean {
  let windowStart = now();
  let used = 0;

  return function allow(): boolean {
    const currentTime = now();
    if (currentTime - windowStart >= windowMs) {
      windowStart = currentTime;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}
