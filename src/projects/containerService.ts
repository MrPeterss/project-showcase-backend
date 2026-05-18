import { docker } from '../docker.js';
import { prisma } from '../prisma.js';

/**
 * Stop and remove a Docker container by container ID.
 * Handles errors gracefully - logs but doesn't throw if container doesn't exist.
 * 
 * @param containerId - The Docker container ID
 */
export const stopAndRemoveContainer = async (containerId: string) => {
  try {
    const container = docker.getContainer(containerId);
    
    try {
      await container.stop();
    } catch (stopError) {
      console.log(`Failed to stop container ${containerId}:`, stopError);
    }
    
    try {
      await container.remove();
    } catch (removeError) {
      console.log(`Failed to remove container ${containerId}:`, removeError);
    }
  } catch {
    console.log(`Container ${containerId} not found, continuing`);
  }
};

/**
 * Clean up containers for a list of projects.
 * Stops and removes all containers associated with the projects.
 * 
 * @param projects - Array of projects with containerId property
 */
export const cleanupProjectContainers = async (
  projects: Array<{ containerId: string | null }>,
) => {
  for (const project of projects) {
    if (project.containerId) {
      await stopAndRemoveContainer(project.containerId);
    }
  }
};

/**
 * Clean up all containers for a specific team.
 * Fetches all projects for the team and stops/removes their containers.
 * 
 * @param teamId - The ID of the team
 */
export const cleanupTeamContainers = async (teamId: number) => {
  const projects = await prisma.project.findMany({
    where: { teamId },
    select: { containerId: true },
  });

  await cleanupProjectContainers(projects);
};

/**
 * Clean up all containers for teams in a course offering.
 * 
 * @param courseOfferingId - The ID of the course offering
 */
export const cleanupCourseOfferingContainers = async (
  courseOfferingId: number,
) => {
  const projects = await prisma.project.findMany({
    where: {
      team: {
        courseOfferingId,
      },
    },
    select: { containerId: true },
  });

  await cleanupProjectContainers(projects);
};
