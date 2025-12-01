import * as cron from 'node-cron';
import * as fs from 'fs';

import { docker } from '../docker.js';
import { prisma } from '../prisma.js';

/**
 * Check the status of a container and update project status if needed
 */
const checkContainerStatus = async (project: {
  id: number;
  containerId: string | null;
  containerName: string | null;
}) => {
  if (!project.containerId) {
    // No container ID, mark as stopped
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
      },
    });
    return;
  }

  try {
    const container = docker.getContainer(project.containerId);
    const containerInfo = await container.inspect();

    // Check if container is actually running
    const isRunning = containerInfo.State.Running === true;

    if (!isRunning) {
      // Container exists but is not running, update status
      await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'stopped',
          stoppedAt: new Date(),
        },
      });
    }
  } catch (error) {
    // Container doesn't exist or can't be accessed
    if ((error as { statusCode?: number }).statusCode === 404) {
      // Container not found, mark as stopped
      await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'stopped',
          stoppedAt: new Date(),
        },
      });
    } else {
      // Other error, log it but don't update status
      console.error(
        `Error checking container for project ${project.id}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
};

/**
 * Check all running projects and verify their containers are still running
 */
const checkRunningProjects = async () => {
  try {
    // Get all projects with status "running"
    const runningProjects = await prisma.project.findMany({
      where: {
        status: 'running',
      },
      select: {
        id: true,
        containerId: true,
        containerName: true,
      },
    });

    // Check each project's container
    await Promise.all(
      runningProjects.map((project) => checkContainerStatus(project)),
    );
  } catch (error) {
    console.error('Error in container monitoring job:', error);
  }
};

let monitorTask: cron.ScheduledTask | null = null;

/**
 * Start the container monitoring cron job
 * Runs every 30 seconds
 */
export const startContainerMonitor = () => {
  // Cron expression: every 30 seconds
  // Format: second minute hour day month day-of-week
  // "*/30 * * * * *" means every 30 seconds
  const cronExpression = '*/30 * * * * *';

  monitorTask = cron.schedule(cronExpression, checkRunningProjects);

  monitorTask.start();
  console.log('Container monitoring cron job started (every 30 seconds)');

  return monitorTask;
};

/**
 * Stop the container monitoring cron job
 */
export const stopContainerMonitor = () => {
  if (monitorTask) {
    monitorTask.stop();
    monitorTask = null;
    console.log('Container monitoring cron job stopped');
  }
};

/**
 * Get the host path for a data file
 */
const getHostDataFilePath = (filePath: string): string => {
  const containerDataDir = process.env.DATA_FILES_DIR || '/app/data/project-data-files';
  const hostDataDir = process.env.DATA_FILES_HOST_DIR;
  
  if (hostDataDir && filePath.startsWith(containerDataDir)) {
    return filePath.replace(containerDataDir, hostDataDir);
  }
  
  return filePath;
};

/**
 * Prune a single project: remove container, image, and data file
 */
const pruneProject = async (project: {
  id: number;
  containerId: string | null;
  imageName: string;
  dataFile: string | null;
}) => {
  const errors: string[] = [];

  // Remove container if it exists
  if (project.containerId) {
    try {
      const container = docker.getContainer(project.containerId);
      try {
        await container.stop();
      } catch {
        // Container might already be stopped, continue
      }
      try {
        await container.remove();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 404) {
          errors.push(`Failed to remove container: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        errors.push(`Container error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  // Remove Docker image
  try {
    const image = docker.getImage(project.imageName);
    await image.remove();
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) {
      errors.push(`Failed to remove image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Remove data file if it exists
  if (project.dataFile) {
    try {
      const hostFilePath = getHostDataFilePath(project.dataFile);
      if (fs.existsSync(hostFilePath)) {
        fs.unlinkSync(hostFilePath);
      }
    } catch (error) {
      errors.push(`Failed to remove data file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Update project status to pruned
  try {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'pruned',
        containerId: null,
        containerName: null,
        dataFile: null,
      } as { status: string; containerId: null; containerName: null; dataFile: null },
    });
  } catch (error) {
    errors.push(`Failed to update project status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return errors;
};

/**
 * Prune all untagged, non-running projects
 * Finds projects that are not running and have no tag, then removes their containers, images, and data files
 * Returns statistics about the pruning operation
 */
export const pruneUntaggedProjects = async (): Promise<{
  totalFound: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ projectId: number; errors: string[] }>;
}> => {
  try {
    // Get all projects that are not running and not already pruned
    // We'll filter for tag === null in memory due to TypeScript type issues
    const allNonRunningProjects = await prisma.project.findMany({
      where: {
        AND: [
          {
            status: {
              not: 'running',
            },
          },
          {
            status: {
              not: 'pruned',
            },
          },
        ],
      },
    });

    // Filter for projects with no tag (tag is null) and select only needed fields
    const projectsToPrune = allNonRunningProjects
      .filter((project) => (project as { tag?: string | null }).tag === null)
      .map((project) => ({
        id: project.id,
        containerId: project.containerId,
        imageName: project.imageName,
        dataFile: project.dataFile,
      }));

    console.log(`Found ${projectsToPrune.length} projects to prune`);

    // Also get projects that are already marked as pruned but might still have resources
    const prunedProjects = await prisma.project.findMany({
      where: {
        status: 'pruned',
        OR: [
          { containerId: { not: null } },
          { dataFile: { not: null } },
        ] as Array<{ containerId: { not: null } } | { dataFile: { not: null } }>,
      },
      select: {
        id: true,
        containerId: true,
        imageName: true,
        dataFile: true,
      },
    });

    const allProjectsToPrune = [...projectsToPrune, ...prunedProjects];
    console.log(`Total projects to prune (including already pruned): ${allProjectsToPrune.length}`);

    // Prune each project
    const results = await Promise.allSettled(
      allProjectsToPrune.map((project) => pruneProject(project)),
    );

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ projectId: number; errors: string[] }> = [];

    results.forEach((result, index) => {
      const projectId = allProjectsToPrune[index].id;
      if (result.status === 'fulfilled') {
        const projectErrors = result.value;
        if (projectErrors.length === 0) {
          successCount++;
        } else {
          errorCount++;
          errors.push({ projectId, errors: projectErrors });
          console.error(
            `Errors pruning project ${projectId}:`,
            projectErrors,
          );
        }
      } else {
        errorCount++;
        errors.push({
          projectId,
          errors: [
            result.reason instanceof Error
              ? result.reason.message
              : 'Unknown error',
          ],
        });
        console.error(
          `Failed to prune project ${projectId}:`,
          result.reason,
        );
      }
    });

    const summary = {
      totalFound: allProjectsToPrune.length,
      successCount,
      errorCount,
      errors,
    };

    console.log(
      `Pruning complete: ${successCount} successful, ${errorCount} with errors`,
    );

    return summary;
  } catch (error) {
    console.error('Error in project pruning job:', error);
    throw error;
  }
};

let pruneTask: cron.ScheduledTask | null = null;

/**
 * Start the project pruning cron job
 * Runs daily at 2 AM
 */
export const startProjectPruner = () => {
  // Cron expression: daily at 2 AM
  // Format: second minute hour day month day-of-week
  // "0 0 2 * * *" means at 2:00:00 AM every day
  const cronExpression = '0 0 2 * * *';

  pruneTask = cron.schedule(cronExpression, async () => {
    await pruneUntaggedProjects();
  });

  pruneTask.start();
  console.log('Project pruning cron job started (daily at 2 AM)');

  return pruneTask;
};

/**
 * Stop the project pruning cron job
 */
export const stopProjectPruner = () => {
  if (pruneTask) {
    pruneTask.stop();
    pruneTask = null;
    console.log('Project pruning cron job stopped');
  }
};

