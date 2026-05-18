import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getContainer } = vi.hoisted(() => ({
  getContainer: vi.fn(),
}));

vi.mock('../../src/docker.js', () => ({
  docker: { getContainer },
}));

import {
  cleanupProjectContainers,
  stopAndRemoveContainer,
} from '../../src/projects/containerService.js';

describe('containerService', () => {
  beforeEach(() => {
    getContainer.mockReset();
  });

  it('stopAndRemoveContainer stops and removes an existing container', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    getContainer.mockReturnValue({ stop, remove });

    await stopAndRemoveContainer('cid-1');

    expect(getContainer).toHaveBeenCalledWith('cid-1');
    expect(stop).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it('cleanupProjectContainers only processes rows with container ids', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    getContainer.mockReturnValue({ stop, remove });

    await cleanupProjectContainers([{ containerId: null }, { containerId: 'x' }]);

    expect(getContainer).toHaveBeenCalledTimes(1);
    expect(getContainer).toHaveBeenCalledWith('x');
  });
});
