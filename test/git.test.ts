import { describe, expect, it } from 'vitest';

import { git } from '../src/git.js';

describe('git', () => {
  it('exports a simple-git instance', () => {
    expect(git).toBeDefined();
    expect(typeof git.cwd).toBe('function');
  });
});
