import { describe, expect, it } from 'vitest';

import { userRateLimiter } from '../../src/middleware/rateLimit.js';

describe('userRateLimiter', () => {
  it('exports Express middleware', () => {
    expect(typeof userRateLimiter).toBe('function');
  });
});
