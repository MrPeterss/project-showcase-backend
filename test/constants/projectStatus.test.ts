import { describe, expect, it } from 'vitest';

import {
  PROJECT_STATUS,
  projectStatusSchema,
} from '../../src/constants/projectStatus.js';

describe('project status', () => {
  it('parses known status strings', () => {
    expect(projectStatusSchema.parse(PROJECT_STATUS.RUNNING)).toBe(
      PROJECT_STATUS.RUNNING,
    );
  });

  it('rejects unknown status strings', () => {
    expect(() => projectStatusSchema.parse('nope')).toThrow();
  });
});
