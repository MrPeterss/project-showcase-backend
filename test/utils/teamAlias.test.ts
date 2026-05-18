import { describe, expect, it, vi } from 'vitest';

import {
  baseTeamAliasFromName,
  dockerDeploymentSlugForTeam,
  legacyDockerSlugFromTeamName,
  resolveUniqueTeamAlias,
  sanitizeTeamNameForAliasSegment,
} from '../../src/utils/teamAlias.js';

describe('sanitizeTeamNameForAliasSegment', () => {
  it('normalizes casing, whitespace, and strips invalid chars', () => {
    expect(sanitizeTeamNameForAliasSegment('  Foo Bar!!!  ')).toBe('foo-bar');
  });

  it('returns fallback slug when nothing alphanumeric remains', () => {
    expect(sanitizeTeamNameForAliasSegment('!!!')).toBe('team');
  });
});

describe('baseTeamAliasFromName', () => {
  it('delegates to sanitize', () => {
    expect(baseTeamAliasFromName('Team A')).toBe('team-a');
  });
});

describe('legacyDockerSlugFromTeamName', () => {
  it('lowercases and swaps spaces for dashes', () => {
    expect(legacyDockerSlugFromTeamName('Demo Team')).toBe('demo-team');
  });
});

describe('dockerDeploymentSlugForTeam', () => {
  it('prefers persisted alias when present', () => {
    expect(
      dockerDeploymentSlugForTeam({ alias: 'slug-a', name: 'Ignored Name' }),
    ).toBe('slug-a');
  });

  it('falls back to legacy slug when alias is null', () => {
    expect(dockerDeploymentSlugForTeam({ alias: null, name: 'Legacy Team' })).toBe(
      'legacy-team',
    );
  });
});

describe('resolveUniqueTeamAlias', () => {
  it('returns base when unused', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { team: { findFirst } };
    await expect(
      resolveUniqueTeamAlias(db as never, 'Clean Name'),
    ).resolves.toBe('clean-name');
    expect(findFirst).toHaveBeenCalled();
  });

  it('allocates numeric suffix when base is taken', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 9 }) // candidate taken
      .mockResolvedValueOnce(null); // base-2 free

    const db = { team: { findFirst } };
    await expect(resolveUniqueTeamAlias(db as never, 'Dup')).resolves.toBe(
      'dup-2',
    );
  });
});
