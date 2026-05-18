import { describe, expect, it } from 'vitest';

import {
  createDockerClient,
  docker,
  setDockerClientForTesting,
} from '../src/docker.js';

describe('docker seam', () => {
  it('allows substituting and resetting the singleton via setDockerClientForTesting', () => {
    const baseline = docker;
    const stub = createDockerClient();
    setDockerClientForTesting(stub);
    expect(docker).toBe(stub);
    setDockerClientForTesting(null);
    expect(docker).not.toBe(stub);
    expect(typeof baseline.listContainers).toBe('function');
  });
});
