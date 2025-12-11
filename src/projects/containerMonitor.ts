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
 * Prune all untagged, non-running projects
 * Two-step process:
 * 1. Build a set of protected images from running containers and tagged projects
 * 2. Prune non-running, non-pruned, untagged projects and remove their resources
 */
export const pruneUntaggedProjects = async (): Promise<{
  totalFound: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ projectId: number; errors: string[] }>;
}> => {
  try {
    // Build a set of protected projects
    const protectedImages = new Set<string>();
    const protectedContainers = new Set<string>();

    // Get all running containers and add their image hashes to protected set
    const runningProjects = await prisma.project.findMany({
      where: {
        status: 'running',
      },
      select: {
        id: true,
        imageHash: true,
        containerId: true,
      },
    });

    for (const project of runningProjects) {
      const imageHash = (project as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        protectedImages.add(imageHash);
        project.containerId && protectedContainers.add(project.containerId);
      }
    }

    // Get all tagged projects and add their image hashes to protected set
    const taggedProjects = await prisma.project.findMany({
      where: {
        AND: [
          { tag: { not: null } },
          { status: { not: 'pruned' } },
        ],
      },
      select: {
        id: true,
        imageHash: true,
        containerId: true,
      },
    });

    for (const project of taggedProjects) {
      const imageHash = (project as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        protectedImages.add(imageHash);
        project.containerId && protectedContainers.add(project.containerId);
      }
    }

    // Get projects that need to be pruned
    // Non-running, non-pruned, untagged projects
    const projectsToPrune = await prisma.project.findMany({
      where: {
        AND: [
          { status: { not: 'running' } },
          { status: { not: 'pruned' } },
          { tag: null },
        ],
      },
      select: {
        id: true,
        containerId: true,
        imageHash: true,
        dataFile: true,
      },
    });

    console.log(`Found ${projectsToPrune.length} projects to prune`);

    // Prune each project
    const results = await Promise.allSettled(
      projectsToPrune.map(async (project: { id: number; containerId: string | null; imageHash: string | null; dataFile: string | null }) => {
        const errors: string[] = [];
        
        const containerProtected = project.containerId && protectedContainers.has(project.containerId);
        if (project.containerId && !containerProtected) {
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

        // Remove image if it's not protected
        if (project.imageHash && !protectedImages.has(project.imageHash)) {
          const imageHash = project.imageHash;
          
          try {
            const image = docker.getImage(imageHash);
            await image.remove();
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            
            // Image is in use (409) - check if protected containers are using it
            if (statusCode === 409) {
              try {
                const allContainers = await docker.listContainers({ all: true });
                
                // Find containers using this image (check both directions for hash matching)
                const containersUsingImage = allContainers.filter((container) => {
                  const containerImageId = container.ImageID || '';
                  return (
                    containerImageId.startsWith(imageHash) ||
                    imageHash.startsWith(containerImageId)
                  );
                });

                // Check if any containers using this image are protected
                const hasProtectedContainers = containersUsingImage.some(
                  (container) => protectedContainers.has(container.Id)
                );

                if (hasProtectedContainers) {
                  // Can't remove image - protected containers are using it
                  errors.push('Cannot remove image: protected containers are using it');
                } else {
                  // Remove non-protected containers using this image
                  for (const containerInfo of containersUsingImage) {
                    try {
                      const container = docker.getContainer(containerInfo.Id);
                      try {
                        await container.stop();
                      } catch {
                        // Already stopped, continue
                      }
                      try {
                        await container.remove();
                      } catch {
                        // Ignore removal errors for orphaned containers
                      }
                    } catch {
                      // Ignore container access errors
                    }
                  }

                  // Retry image removal after removing containers
                  try {
                    const image = docker.getImage(imageHash);
                    await image.remove();
                  } catch (retryError) {
                    const retryStatusCode = (retryError as { statusCode?: number }).statusCode;
                    if (retryStatusCode !== 404) {
                      errors.push(
                        `Failed to remove image after removing containers: ${
                          retryError instanceof Error ? retryError.message : 'Unknown error'
                        }`
                      );
                    }
                  }
                }
              } catch (findError) {
                errors.push(
                  `Failed to find containers using image: ${
                    findError instanceof Error ? findError.message : 'Unknown error'
                  }`
                );
              }
            } else if (statusCode !== 404) {
              // Other errors (not 404 or 409)
              errors.push(
                `Failed to remove image: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
            // 404 means image doesn't exist, which is fine - no error needed
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

        // Mark project as pruned
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
      }),
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

