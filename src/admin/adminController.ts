import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { pruneUntaggedProjects } from '../projects/containerMonitor.js';
import { NotFoundError } from '../utils/AppError.js';
import * as adminService from './adminService.js';
import { migrateProjectContainer } from './migrationService.js';

/**
 * Normalize container name: lowercase and replace spaces with dashes
 */
const normalizeContainerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

export const promoteUser = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  
  const updatedUser = await adminService.promoteUserToAdmin(userId);
  
  return res.json({
    message: 'User promoted to admin successfully',
    user: updatedUser,
  });
};

export const demoteUser = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  
  const updatedUser = await adminService.demoteUserFromAdmin(userId);
  
  return res.json({
    message: 'User demoted from admin successfully',
    user: updatedUser,
  });
};

export const updateUserName = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  const { name } = req.body;
  
  const updatedUser = await adminService.updateUserName(userId, name ?? null);
  
  return res.json({
    message: 'User name updated successfully',
    user: updatedUser,
  });
};

export const triggerPruning = async (_req: Request, res: Response) => {
  try {
    const result = await pruneUntaggedProjects();
    
    return res.json({
      message: 'Project pruning completed',
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to prune projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Migrate a project container from old network to projects_network
 */
export const migrateProject = async (req: Request, res: Response) => {
  try {
    const { projectName, teamId, githubUrl } = req.body;
    const { userId } = req.user!;
    
    const result = await migrateProjectContainer(
      projectName,
      teamId,
      githubUrl,
      userId,
    );
    
    return res.status(201).json({
      message: result.message,
      alias: result.alias,
      project: result.project,
      containerId: result.containerId,
      containerName: result.containerName,
      ports: result.ports,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        error: error.message,
        projectName: req.body.projectName,
      });
    }
    
    return res.status(500).json({
      error: 'Failed to migrate project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Helper function to format bytes to human-readable format
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Get all non-pruned projects organized by team
 * Returns all projects with their container, image, and data file information
 */
export const getAllProjects = async (_req: Request, res: Response) => {
  try {
    // Get all non-pruned projects
    const projects = await prisma.project.findMany({
      where: {
        status: {
          not: 'pruned',
        },
      },
      include: {
        team: {
          include: {
            CourseOffering: {
              include: {
                course: true,
                semester: true,
              },
            },
          },
        },
      },
    });

    const dataDir = process.env.DATA_FILES_DIR || '/app/data/project-data-files';

    // Organize by team
    const teamsMap = new Map<number, {
      team: {
        id: number;
        name: string;
        courseOffering: {
          id: number;
          course: {
            id: number;
            name: string;
            number: number;
            department: string;
          };
          semester: {
            id: number;
            season: string;
            year: number;
          };
        };
      };
      projects: Array<{
        id: number;
        githubUrl: string;
        status: string;
        tag: string | null;
        imageHash: string;
        imageName: string;
        containerId: string | null;
        containerName: string | null;
        dataFile: {
          fileName: string;
          filePath: string;
          size?: number;
          sizeFormatted?: string;
          created?: Date;
          modified?: Date;
          error?: string;
        } | null;
        deployedAt: Date;
        stoppedAt: Date | null;
      }>;
    }>();

    for (const project of projects) {
      const teamId = project.team.id;
      if (!teamsMap.has(teamId)) {
        teamsMap.set(teamId, {
          team: {
            id: project.team.id,
            name: project.team.name,
            courseOffering: {
              id: project.team.CourseOffering.id,
              course: {
                id: project.team.CourseOffering.course.id,
                name: project.team.CourseOffering.course.name,
                number: project.team.CourseOffering.course.number,
                department: project.team.CourseOffering.course.department,
              },
              semester: {
                id: project.team.CourseOffering.semester.id,
                season: project.team.CourseOffering.semester.season,
                year: project.team.CourseOffering.semester.year,
              },
            },
          },
          projects: [],
        });
      }

      // Reconstruct image name from team name and tag
      const tag = (project as { tag?: string | null }).tag;
      const imageName = tag
        ? `${normalizeContainerName(project.team.name)}:${tag}`
        : `${normalizeContainerName(project.team.name)}:latest`;

      const imageHash = (project as unknown as { imageHash: string }).imageHash;

      // Get data file info if it exists
      let dataFileInfo: {
        fileName: string;
        filePath: string;
        size?: number;
        sizeFormatted?: string;
        created?: Date;
        modified?: Date;
        error?: string;
      } | null = null;

      if (project.dataFile) {
        const fileName = path.basename(project.dataFile);
        const filePath = path.join(dataDir, fileName);
        
        dataFileInfo = {
          fileName,
          filePath,
        };

        if (fs.existsSync(filePath)) {
          try {
            const stats = fs.statSync(filePath);
            dataFileInfo.size = stats.size;
            dataFileInfo.sizeFormatted = formatBytes(stats.size);
            dataFileInfo.created = stats.birthtime;
            dataFileInfo.modified = stats.mtime;
          } catch (error) {
            dataFileInfo.error = error instanceof Error ? error.message : 'Failed to get file stats';
          }
        } else {
          dataFileInfo.error = 'File not found on disk';
        }
      }

      teamsMap.get(teamId)!.projects.push({
        id: project.id,
        githubUrl: project.githubUrl,
        status: project.status,
        tag: tag || null,
        imageHash: imageHash || '',
        imageName,
        containerId: project.containerId,
        containerName: project.containerName,
        dataFile: dataFileInfo,
        deployedAt: project.deployedAt,
        stoppedAt: project.stoppedAt,
      });
    }

    return res.json({
      totalProjects: projects.length,
      teams: Array.from(teamsMap.values()),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get all projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
 * Manually prune a single project by ID
 * Removes container, image (if not protected), and data file, then marks as pruned
 */
export const pruneProject = async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Get the project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        status: true,
        containerId: true,
        imageHash: true,
        dataFile: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.status === 'pruned') {
      return res.status(400).json({
        error: 'Project is already pruned',
        projectId,
      });
    }

    // Build protected images set (same logic as bulk pruning)
    const protectedImages = new Set<string>();

    // Get all running projects and add their image hashes to protected set
    const runningProjects = await prisma.project.findMany({
      where: {
        status: 'running',
        id: { not: projectId }, // Exclude current project
      },
      select: {
        imageHash: true,
      },
    });

    for (const runningProject of runningProjects) {
      const imageHash = (runningProject as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        protectedImages.add(imageHash);
      }
    }

    // Get all tagged projects and add their image hashes to protected set
    const taggedProjects = await prisma.project.findMany({
      where: {
        AND: [
          { tag: { not: null } },
          { status: { not: 'pruned' } },
          { id: { not: projectId } }, // Exclude current project
        ],
      },
      select: {
        imageHash: true,
      },
    });

    for (const taggedProject of taggedProjects) {
      const imageHash = (taggedProject as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        protectedImages.add(imageHash);
      }
    }

    const errors: string[] = [];
    const imageHash = (project as unknown as { imageHash: string }).imageHash;
    let containerRemoved = !project.containerId;

    // Remove container if it exists
    if (project.containerId) {
      try {
        const container = docker.getContainer(project.containerId);
        try {
          await container.kill(); // Force kill instead of stop
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
            containerRemoved = true;
          }
        }
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 404) {
          errors.push(`Container error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          containerRemoved = false;
        } else {
          containerRemoved = true;
        }
      }
    }

    // Check if image is protected
    const imageProtected = imageHash && protectedImages.has(imageHash);

    // Remove image if it's not protected
    if (imageHash && !imageProtected) {
      try {
        const image = docker.getImage(imageHash);
        await image.remove();
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 409) {
          // Image is in use - try to find and remove containers using it
          try {
            const allContainers = await docker.listContainers({ all: true });
            const containersUsingImage = allContainers.filter((container) => {
              return (
                container.ImageID?.startsWith(imageHash) ||
                imageHash.startsWith(container.ImageID || '')
              );
            });

            for (const containerInfo of containersUsingImage) {
              try {
                const container = docker.getContainer(containerInfo.Id);
                try {
                  await container.kill();
                } catch {
                  // Already stopped
                }
                try {
                  await container.remove();
                } catch {
                  // Ignore removal errors
                }
              } catch {
                // Ignore container access errors
              }
            }

            // Retry image removal
            try {
              const image = docker.getImage(imageHash);
              await image.remove();
            } catch (retryError) {
              if ((retryError as { statusCode?: number }).statusCode !== 404) {
                errors.push(`Failed to remove image after removing containers: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
              }
            }
          } catch (findError) {
            errors.push(`Failed to find containers using image: ${findError instanceof Error ? findError.message : 'Unknown error'}`);
          }
        } else if (statusCode !== 404) {
          errors.push(`Failed to remove image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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

    // Mark project as pruned if container was removed (or didn't exist)
    if (containerRemoved) {
      try {
        await prisma.project.update({
          where: { id: projectId },
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
      errors.push('Project not marked as pruned because container could not be removed');
    }

    return res.json({
      message: 'Project pruned successfully',
      projectId,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        error: error.message,
        projectId: req.params.projectId,
      });
    }
    return res.status(500).json({
      error: 'Failed to prune project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @deprecated Use getAllProjects instead
 */
export const getContainersByTeam = async (_req: Request, res: Response) => {
  try {
    // Get all non-pruned projects with containers and their team info
    const projects = await prisma.project.findMany({
      where: {
        AND: [
          { containerId: { not: null } },
          { status: { not: 'pruned' } },
        ],
      },
      include: {
        team: {
          include: {
            CourseOffering: {
              include: {
                course: true,
                semester: true,
              },
            },
          },
        },
      },
    });

    // Organize by team
    const teamsMap = new Map<number, {
      team: {
        id: number;
        name: string;
        courseOffering: {
          id: number;
          course: {
            id: number;
            name: string;
            number: number;
            department: string;
          };
          semester: {
            id: number;
            season: string;
            year: number;
          };
        };
      };
      containers: Array<{
        projectId: number;
        githubUrl: string;
        status: string;
        containerId: string;
        imageName: string;
      }>;
    }>();

    for (const project of projects) {
      if (project.containerId) {
        const teamId = project.team.id;
        if (!teamsMap.has(teamId)) {
          teamsMap.set(teamId, {
            team: {
              id: project.team.id,
              name: project.team.name,
              courseOffering: {
                id: project.team.CourseOffering.id,
                course: {
                  id: project.team.CourseOffering.course.id,
                  name: project.team.CourseOffering.course.name,
                  number: project.team.CourseOffering.course.number,
                  department: project.team.CourseOffering.course.department,
                },
                semester: {
                  id: project.team.CourseOffering.semester.id,
                  season: project.team.CourseOffering.semester.season,
                  year: project.team.CourseOffering.semester.year,
                },
              },
            },
            containers: [],
          });
        }
        // Reconstruct image name from team name and tag
        const tag = (project as { tag?: string | null }).tag;
        const imageName = tag
          ? `${normalizeContainerName(project.team.name)}:${tag}`
          : `${normalizeContainerName(project.team.name)}:latest`;

        teamsMap.get(teamId)!.containers.push({
          projectId: project.id,
          githubUrl: project.githubUrl,
          status: project.status,
          containerId: project.containerId,
          imageName,
        });
      }
    }

    return res.json({
      totalContainers: projects.filter((p) => p.containerId).length,
      teams: Array.from(teamsMap.values()),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get containers by team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @deprecated Use getAllProjects instead
 */
export const getDataFilesByTeam = async (_req: Request, res: Response) => {
  try {
    // Get all non-pruned projects with data files and their team info
    const projects = await prisma.project.findMany({
      where: {
        AND: [
          { dataFile: { not: null } },
          { status: { not: 'pruned' } },
        ],
      },
      include: {
        team: {
          include: {
            CourseOffering: {
              include: {
                course: true,
                semester: true,
              },
            },
          },
        },
      },
    });

    const dataDir = process.env.DATA_FILES_DIR || '/app/data/project-data-files';
    
    // Organize by team
    const teamsMap = new Map<number, {
      team: {
        id: number;
        name: string;
        courseOffering: {
          id: number;
          course: {
            id: number;
            name: string;
            number: number;
            department: string;
          };
          semester: {
            id: number;
            season: string;
            year: number;
          };
        };
      };
      files: Array<{
        projectId: number;
        githubUrl: string;
        status: string;
        fileName: string;
        filePath: string;
        size?: number;
        sizeFormatted?: string;
        created?: Date;
        modified?: Date;
        error?: string;
      }>;
    }>();

    for (const project of projects) {
      if (project.dataFile) {
        const teamId = project.team.id;
        if (!teamsMap.has(teamId)) {
          teamsMap.set(teamId, {
            team: {
              id: project.team.id,
              name: project.team.name,
              courseOffering: {
                id: project.team.CourseOffering.id,
                course: {
                  id: project.team.CourseOffering.course.id,
                  name: project.team.CourseOffering.course.name,
                  number: project.team.CourseOffering.course.number,
                  department: project.team.CourseOffering.course.department,
                },
                semester: {
                  id: project.team.CourseOffering.semester.id,
                  season: project.team.CourseOffering.semester.season,
                  year: project.team.CourseOffering.semester.year,
                },
              },
            },
            files: [],
          });
        }

        const fileName = path.basename(project.dataFile);
        const filePath = path.join(dataDir, fileName);
        
        let fileInfo: {
          projectId: number;
          githubUrl: string;
          status: string;
          fileName: string;
          filePath: string;
          size?: number;
          sizeFormatted?: string;
          created?: Date;
          modified?: Date;
          error?: string;
        } = {
          projectId: project.id,
          githubUrl: project.githubUrl,
          status: project.status,
          fileName,
          filePath,
        };

        if (fs.existsSync(filePath)) {
          try {
            const stats = fs.statSync(filePath);
            fileInfo.size = stats.size;
            fileInfo.sizeFormatted = formatBytes(stats.size);
            fileInfo.created = stats.birthtime;
            fileInfo.modified = stats.mtime;
          } catch (error) {
            fileInfo.error = error instanceof Error ? error.message : 'Failed to get file stats';
          }
        } else {
          fileInfo.error = 'File not found on disk';
        }

        teamsMap.get(teamId)!.files.push(fileInfo);
      }
    }

    return res.json({
      totalFiles: projects.filter((p) => p.dataFile).length,
      teams: Array.from(teamsMap.values()),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get data files by team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
