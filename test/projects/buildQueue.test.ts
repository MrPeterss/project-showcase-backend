import { describe, expect, it } from 'vitest';

import { buildQueue } from '../../src/projects/buildQueue.js';

describe('buildQueue', () => {
  it('reports a positive concurrency limit', () => {
    expect(buildQueue.getMaxConcurrent()).toBeGreaterThanOrEqual(1);
  });

  it('runs an enqueued task and invokes onStart', async () => {
    let started = false;
    await buildQueue.enqueue({
      id: `vitest-${Math.random().toString(36).slice(2)}`,
      onPositionUpdate: () => {},
      onStart: () => {
        started = true;
      },
      run: async () => {},
    });
    expect(started).toBe(true);
  });

  it('cancel resolves a queued task without running it', async () => {
    const max = buildQueue.getMaxConcurrent();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    const blockers: Promise<void>[] = [];
    for (let i = 0; i < max; i++) {
      blockers.push(
        buildQueue.enqueue({
          id: `block-${i}-${Math.random().toString(36).slice(2)}`,
          onPositionUpdate: () => {},
          onStart: () => {},
          run: async () => {
            await barrier;
          },
        }),
      );
    }

    let victimStarted = false;
    const victimId = `victim-${Math.random().toString(36).slice(2)}`;
    const victim = buildQueue.enqueue({
      id: victimId,
      onPositionUpdate: () => {},
      onStart: () => {
        victimStarted = true;
      },
      run: async () => {},
    });

    expect(buildQueue.getQueuedCount()).toBeGreaterThanOrEqual(1);

    buildQueue.cancel(victimId);
    await victim;
    expect(victimStarted).toBe(false);

    release();
    await Promise.all(blockers);
  });
});
