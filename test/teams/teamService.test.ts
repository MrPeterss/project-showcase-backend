import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

const { cleanupTeamContainers } = vi.hoisted(() => ({
  cleanupTeamContainers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/projects/containerService.js', () => ({
  cleanupTeamContainers,
}));

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import {
  checkTeamNameExists,
  deleteTeamWithCleanup,
} from '../../src/teams/teamService.js';

describe('teamService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  it('checkTeamNameExists matches case-insensitively', async () => {
    vi.mocked(prismaMock.team.findMany as Mock).mockResolvedValue([
      { id: 1, name: 'Cornell Coders' },
    ]);

    await expect(checkTeamNameExists('cornell coders')).resolves.toBe(true);
    await expect(checkTeamNameExists('other team')).resolves.toBe(false);
  });

  it('checkTeamNameExists ignores the excluded team id', async () => {
    vi.mocked(prismaMock.team.findMany as Mock).mockResolvedValue([
      { id: 1, name: 'Unique' },
    ]);

    await expect(checkTeamNameExists('unique', 1)).resolves.toBe(false);
  });
});

describe('deleteTeamWithCleanup', () => {
  beforeEach(() => {
    resetPrismaMockFns();
    cleanupTeamContainers.mockClear();
    vi.mocked(prismaMock.project.deleteMany as Mock).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prismaMock.teamEnvironment.deleteMany as Mock).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prismaMock.teamMembership.deleteMany as Mock).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prismaMock.team.delete as Mock).mockResolvedValue({} as never);
  });

  it('stops containers, deletes projects, team environments, memberships, then team', async () => {
    await deleteTeamWithCleanup(42);

    expect(cleanupTeamContainers).toHaveBeenCalledWith(42);
    expect(prismaMock.project.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 42 },
    });
    expect(prismaMock.teamEnvironment.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 42 },
    });
    expect(prismaMock.teamMembership.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 42 },
    });
    expect(prismaMock.team.delete).toHaveBeenCalledWith({
      where: { id: 42 },
    });
  });
});
