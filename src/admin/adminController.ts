import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { pruneUntaggedProjects } from '../projects/containerMonitor.js';
import * as adminService from './adminService.js';

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
 * Get all Docker images with the projects that reference them
 * Only includes images from non-pruned projects
 */
export const getImagesWithProjects = async (_req: Request, res: Response) => {
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

    // Group projects by image hash
    const imageHashToProjects = new Map<string, Array<{
      id: number;
      githubUrl: string;
      status: string;
      tag: string | null;
      team: {
        id: number;
        name: string;
        CourseOffering: {
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
    }>>();

    for (const project of projects) {
      const imageHash = (project as unknown as { imageHash: string }).imageHash;
      if (imageHash) {
        if (!imageHashToProjects.has(imageHash)) {
          imageHashToProjects.set(imageHash, []);
        }
        imageHashToProjects.get(imageHash)!.push({
          id: project.id,
          githubUrl: project.githubUrl,
          status: project.status,
          tag: project.tag,
          team: {
            id: project.team.id,
            name: project.team.name,
            CourseOffering: {
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
        });
      }
    }

    // Get Docker image info
    const allImages = await docker.listImages({ all: true });
    const imagesWithProjects: Array<{
      image: {
        id: string;
        shortId: string;
        repoTags: string[];
        size: number;
        sizeFormatted: string;
        virtualSize: number;
        created: number;
        architecture?: string;
        os?: string;
      };
      projects: Array<{
        id: number;
        githubUrl: string;
        status: string;
        tag: string | null;
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
      }>;
    }> = [];

    for (const [imageHash, projectList] of imageHashToProjects) {
      const matchingImage = allImages.find(
        (img) =>
          img.Id === imageHash ||
          img.Id.startsWith(imageHash) ||
          imageHash.startsWith(img.Id),
      );

      if (matchingImage) {
        try {
          const imageInfo = await docker.getImage(matchingImage.Id).inspect();
          imagesWithProjects.push({
            image: {
              id: matchingImage.Id,
              shortId: matchingImage.Id.substring(7, 19),
              repoTags: matchingImage.RepoTags || [],
              size: matchingImage.Size,
              sizeFormatted: formatBytes(matchingImage.Size),
              virtualSize: matchingImage.VirtualSize,
              created: matchingImage.Created,
              architecture: imageInfo.Architecture,
              os: imageInfo.Os,
            },
            projects: projectList.map((p) => ({
              id: p.id,
              githubUrl: p.githubUrl,
              status: p.status,
              tag: p.tag,
              team: {
                id: p.team.id,
                name: p.team.name,
                courseOffering: {
                  id: p.team.CourseOffering.id,
                  course: p.team.CourseOffering.course,
                  semester: p.team.CourseOffering.semester,
                },
              },
            })),
          });
        } catch {
          imagesWithProjects.push({
            image: {
              id: matchingImage.Id,
              shortId: matchingImage.Id.substring(7, 19),
              repoTags: matchingImage.RepoTags || [],
              size: matchingImage.Size,
              sizeFormatted: formatBytes(matchingImage.Size),
              virtualSize: matchingImage.VirtualSize,
              created: matchingImage.Created,
            },
            projects: projectList.map((p) => ({
              id: p.id,
              githubUrl: p.githubUrl,
              status: p.status,
              tag: p.tag,
              team: {
                id: p.team.id,
                name: p.team.name,
                courseOffering: {
                  id: p.team.CourseOffering.id,
                  course: p.team.CourseOffering.course,
                  semester: p.team.CourseOffering.semester,
                },
              },
            })),
          });
        }
      }
    }

    return res.json({
      totalImages: imagesWithProjects.length,
      images: imagesWithProjects,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get images with projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all containers organized by team
 * Only includes containers from non-pruned projects
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
        teamsMap.get(teamId)!.containers.push({
          projectId: project.id,
          githubUrl: project.githubUrl,
          status: project.status,
          containerId: project.containerId,
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
 * Get all data files organized by team
 * Only includes files from non-pruned projects
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
