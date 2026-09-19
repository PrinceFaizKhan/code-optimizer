import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect([allow(), allow(), allow()]).toEqual([true, true, true]);
  });

  it('refuses once the limit is reached', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    allow();
    allow();
    expect(allow()).toBe(false);
  });

  it('resets after the window elapses', () => {
    let clock = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    clock = 1000;
    expect(allow()).toBe(true);
  });

  it('does not reset early', () => {
    let clock = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    allow();
    clock = 999;
    expect(allow()).toBe(false);
  });
});
