import { describe, expect, it } from 'vitest';

import * as projectService from '../../src/projects/projectService.js';

describe('projectService (facade re-exports)', () => {
  it('exports deploy and query helpers used by the HTTP layer', () => {
    expect(typeof projectService.deploy).toBe('function');
    expect(typeof projectService.getAllProjects).toBe('function');
    expect(typeof projectService.getProjectById).toBe('function');
    expect(typeof projectService.getTeamProjects).toBe('function');
    expect(typeof projectService.stopProject).toBe('function');
  });

  it('exports stream and list helpers', () => {
    expect(typeof projectService.streamProjectLogs).toBe('function');
    expect(typeof projectService.streamBuildLogs).toBe('function');
    expect(typeof projectService.listRunningContainers).toBe('function');
    expect(typeof projectService.listAllImages).toBe('function');
  });
});
