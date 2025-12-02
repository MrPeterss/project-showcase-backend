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
 * Only marks as pruned if all resources are successfully removed
 * @param project - The project to prune
 * @param imageHashToProjectIds - Map of imageHash to set of project IDs that use it (for checking if image is shared)
 */
const pruneProject = async (
  project: {
    id: number;
    containerId: string | null;
    imageHash: string;
    dataFile: string | null;
  },
  imageHashToProjectIds: Map<string, Set<number>>,
) => {
  const errors: string[] = [];
  let containerRemoved = !project.containerId; // true if no container to remove
  let imageRemoved = false;
  let dataFileRemoved = !project.dataFile; // true if no data file to remove

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
        containerRemoved = true;
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 404) {
          errors.push(`Failed to remove container: ${error instanceof Error ? error.message : 'Unknown error'}`);
          containerRemoved = false;
        } else {
          // 404 means container doesn't exist, which is fine
          containerRemoved = true;
        }
      }
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        errors.push(`Container error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        containerRemoved = false;
      } else {
        // 404 means container doesn't exist, which is fine
        containerRemoved = true;
      }
    }
  }

  // Check if other projects (especially tagged ones) still reference this image
  // Use the pre-built map for O(1) lookup instead of database query
  const projectsUsingImage = imageHashToProjectIds.get(project.imageHash);
  const otherProjectsUsingImage = projectsUsingImage 
    ? projectsUsingImage.size > 1 || !projectsUsingImage.has(project.id)
    : false;

  if (otherProjectsUsingImage) {
    // Other projects still reference this image, so we shouldn't remove it
    // Mark as successfully "removed" from this project's perspective
    // (it's not this project's responsibility to clean it up)
    imageRemoved = true;
    console.log(
      `Skipping image removal for project ${project.id}: other projects still reference image ${project.imageHash.substring(0, 12)}`,
    );
  } else {
    // No other projects reference this image, safe to remove
    // Remove Docker image by hash
    // If image removal fails due to conflict (409), find and remove containers using it
    try {
      const image = docker.getImage(project.imageHash);
      await image.remove();
      imageRemoved = true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 409) {
        // Image is in use by a container - find and remove all containers using this image
        try {
          const allContainers = await docker.listContainers({ all: true });

          // Find containers using this image (match by ImageID)
          const containersUsingImage = allContainers.filter((container) => {
            return (
              container.ImageID?.startsWith(project.imageHash) ||
              project.imageHash.startsWith(container.ImageID || '')
            );
          });

          for (const containerInfo of containersUsingImage) {
            try {
              const container = docker.getContainer(containerInfo.Id);
              try {
                await container.stop();
              } catch {
                // Container might already be stopped
              }
              try {
                await container.remove();
              } catch (containerError) {
                errors.push(
                  `Failed to remove container ${containerInfo.Id.substring(0, 12)} using image: ${containerError instanceof Error ? containerError.message : 'Unknown error'}`,
                );
              }
            } catch (containerError) {
              errors.push(
                `Failed to access container ${containerInfo.Id.substring(0, 12)}: ${containerError instanceof Error ? containerError.message : 'Unknown error'}`,
              );
            }
          }

          // Retry removing the image after removing containers
          try {
            const image = docker.getImage(project.imageHash);
            await image.remove();
            imageRemoved = true;
          } catch (retryError) {
            if ((retryError as { statusCode?: number }).statusCode !== 404) {
              errors.push(
                `Failed to remove image after removing containers: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`,
              );
              imageRemoved = false;
            } else {
              // 404 means image doesn't exist, which is fine
              imageRemoved = true;
            }
          }
        } catch (findError) {
          errors.push(
            `Failed to find containers using image: ${findError instanceof Error ? findError.message : 'Unknown error'}`,
          );
          imageRemoved = false;
        }
      } else if (statusCode !== 404) {
        errors.push(`Failed to remove image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        imageRemoved = false;
      } else {
        // 404 means image doesn't exist, which is fine
        imageRemoved = true;
      }
    }
  }

  // Remove data file if it exists
  if (project.dataFile) {
    try {
      const hostFilePath = getHostDataFilePath(project.dataFile);
      if (fs.existsSync(hostFilePath)) {
        fs.unlinkSync(hostFilePath);
        dataFileRemoved = true;
      } else {
        // File doesn't exist, which is fine
        dataFileRemoved = true;
      }
    } catch (error) {
      errors.push(`Failed to remove data file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      dataFileRemoved = false;
    }
  }

  // Only mark as pruned if all resources were successfully removed
  if (containerRemoved && imageRemoved && dataFileRemoved) {
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
  } else {
    errors.push('Project not marked as pruned because some resources could not be removed');
  }

  return errors;
};

/**
 * Prune all untagged, non-running projects
 * Finds projects that are not running and have no tag, then removes their containers, images, and data files
 * Only prunes resources that are associated with projects in the database
 * Returns statistics about the pruning operation
 */
export const pruneUntaggedProjects = async (): Promise<{
  totalFound: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ projectId: number; errors: string[] }>;
}> => {
  try {
    // Build a map of imageHash -> Set of project IDs that use it
    // This allows O(1) lookup to check if an image is shared by other projects
    // Single query upfront instead of N queries during pruning
    const allNonPrunedProjects = await prisma.project.findMany({
      where: {
        status: {
          not: 'pruned',
        },
      },
    });

    const imageHashToProjectIds = new Map<string, Set<number>>();
    for (const project of allNonPrunedProjects) {
      const imageHash = (project as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        if (!imageHashToProjectIds.has(imageHash)) {
          imageHashToProjectIds.set(imageHash, new Set());
        }
        imageHashToProjectIds.get(imageHash)!.add(project.id);
      }
    }

    // Get all projects that are not running and not already pruned
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
        imageHash: (project as unknown as { imageHash: string }).imageHash,
        dataFile: project.dataFile,
      }));

    console.log(`Found ${projectsToPrune.length} untagged projects to prune`);

    // Prune each project, passing the image hash map for efficient lookups
    const results = await Promise.allSettled(
      projectsToPrune.map((project) => pruneProject(project, imageHashToProjectIds)),
    );

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ projectId: number; errors: string[] }> = [];

    results.forEach((result, index) => {
      const projectId = projectsToPrune[index].id;
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
      totalFound: projectsToPrune.length,
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

