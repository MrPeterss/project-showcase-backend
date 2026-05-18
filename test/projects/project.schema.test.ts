import { describe, expect, it } from 'vitest';

import { deployProjectSchema } from '../../src/projects/project.schema.js';

describe('deployProjectSchema', () => {
  const minimalBody = {
    teamId: '5',
    githubUrl: 'https://github.com/org/repo.git',
  };

  it('accepts minimal deploy payload', () => {
    const parsed = deployProjectSchema.parse({ body: minimalBody });
    expect(parsed.body.teamId).toBe(5);
    expect(parsed.body.githubUrl).toContain('github.com');
  });

  it('parses extraEnvVars JSON object strings', () => {
    const parsed = deployProjectSchema.parse({
      body: {
        ...minimalBody,
        extraEnvVars: '{"FOO":"bar"}',
      },
    });
    expect(parsed.body.extraEnvVars).toEqual({ FOO: 'bar' });
  });

  it('rejects invalid extraEnvVars JSON shape', () => {
    expect(() =>
      deployProjectSchema.parse({
        body: {
          ...minimalBody,
          extraEnvVars: '[1,2]',
        },
      }),
    ).toThrow();
  });
});
