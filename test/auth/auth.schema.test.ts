import { describe, expect, it } from 'vitest';

import { verifyFirebaseTokenSchema } from '../../src/auth/auth.schema.js';

describe('verifyFirebaseTokenSchema', () => {
  it('requires non-empty firebase token', () => {
    expect(() => verifyFirebaseTokenSchema.parse({ body: {} })).toThrow();
    expect(() =>
      verifyFirebaseTokenSchema.parse({ body: { firebaseToken: '' } }),
    ).toThrow();

    const parsed = verifyFirebaseTokenSchema.parse({
      body: { firebaseToken: 'tok' },
    });
    expect(parsed.body.firebaseToken).toBe('tok');
  });
});
