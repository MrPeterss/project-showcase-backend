import { describe, expect, it } from 'vitest';

import { positiveIntParam } from '../../src/schemas/paramCoercions.js';

describe('positiveIntParam', () => {
  const schema = positiveIntParam('widget ID');

  it('coerces valid numeric strings', () => {
    expect(schema.parse('7')).toBe(7);
  });

  it('rejects non-numeric strings', () => {
    expect(() => schema.parse('abc')).toThrow();
  });

  it('rejects zero and negative numbers', () => {
    expect(() => schema.parse('0')).toThrow();
    expect(() => schema.parse('-3')).toThrow();
  });
});
