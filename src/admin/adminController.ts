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

export const getAllDockerContainers = async (_req: Request, res: Response) => {
  try {
    // Get all project container IDs and names from database
    const projects = await prisma.project.findMany({
      where: {
        containerId: { not: null },
      },
      select: {
        containerId: true,
        containerName: true,
      },
    });

    const projectContainerIds = new Set(
      projects
        .map((p) => p.containerId)
        .filter((id): id is string => id !== null),
    );
    const projectContainerNames = new Set(
      projects
        .map((p) => p.containerName)
        .filter((name): name is string => name !== null)
        .map((name) => name.startsWith('/') ? name : `/${name}`), // Docker names usually start with /
    );

    // Get all containers (running and stopped)
    const containers = await docker.listContainers({ all: true });
    
    // Filter to only containers associated with projects
    const projectContainers = containers.filter((container) => {
      const containerId = container.Id;
      const containerNames = container.Names || [];
      
      // Check if container ID or name matches a project
      return (
        projectContainerIds.has(containerId) ||
        containerNames.some((name) => projectContainerNames.has(name))
      );
    });
    
    // Get detailed information for each container
    const containerDetails = await Promise.all(
      projectContainers.map(async (container) => {
        try {
          const containerInfo = await docker.getContainer(container.Id).inspect();
          return {
            id: container.Id,
            shortId: container.Id.substring(0, 12),
            names: container.Names,
            image: container.Image,
            imageId: container.ImageID,
            command: container.Command,
            created: container.Created,
            status: container.Status,
            ports: container.Ports,
            labels: container.Labels,
            mounts: container.Mounts,
            networkSettings: containerInfo.NetworkSettings,
            config: {
              hostname: containerInfo.Config.Hostname,
              env: containerInfo.Config.Env,
              workingDir: containerInfo.Config.WorkingDir,
            },
            state: {
              status: containerInfo.State.Status,
              running: containerInfo.State.Running,
              paused: containerInfo.State.Paused,
              restarting: containerInfo.State.Restarting,
              startedAt: containerInfo.State.StartedAt,
              finishedAt: containerInfo.State.FinishedAt,
            },
          };
        } catch (error) {
          // If we can't inspect the container, return basic info
          return {
            id: container.Id,
            shortId: container.Id.substring(0, 12),
            names: container.Names,
            image: container.Image,
            imageId: container.ImageID,
            command: container.Command,
            created: container.Created,
            state: container.State,
            status: container.Status,
            ports: container.Ports,
            error: error instanceof Error ? error.message : 'Failed to inspect container',
          };
        }
      }),
    );
    
    return res.json({
      total: containerDetails.length,
      containers: containerDetails,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get Docker containers',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getAllDockerImages = async (_req: Request, res: Response) => {
  try {
    // Get all project image hashes from database
    const projects = await prisma.project.findMany({
      select: {
        imageHash: true,
      },
    });

    const projectImageHashes = new Set(projects.map((p) => p.imageHash));

    // Get all images
    const images = await docker.listImages({ all: true });
    
    // Filter to only images associated with projects
    // Match by image ID/hash
    const projectImages = images.filter((image) => {
      const imageId = image.Id;
      
      // Check if image ID matches a project image hash
      // Match by full ID or if hash starts with image ID (or vice versa)
      return projectImageHashes.has(imageId) ||
        Array.from(projectImageHashes).some((hash) => 
          imageId.startsWith(hash) || hash.startsWith(imageId)
        );
    });
    
    // Get detailed information for each image
    const imageDetails = await Promise.all(
      projectImages.map(async (image) => {
        try {
          const imageInfo = await docker.getImage(image.Id).inspect();
          return {
            id: image.Id,
            shortId: image.Id.substring(7, 19), // Skip 'sha256:' prefix
            repoTags: image.RepoTags || [],
            repoDigests: image.RepoDigests || [],
            created: image.Created,
            size: image.Size,
            virtualSize: image.VirtualSize,
            parent: image.ParentId,
            labels: imageInfo.Config?.Labels || {},
            architecture: imageInfo.Architecture,
            os: imageInfo.Os,
            config: {
              env: imageInfo.Config?.Env || [],
              cmd: imageInfo.Config?.Cmd || [],
              workingDir: imageInfo.Config?.WorkingDir,
              exposedPorts: imageInfo.Config?.ExposedPorts || {},
            },
            rootFs: {
              type: imageInfo.RootFS?.Type,
              layers: imageInfo.RootFS?.Layers || [],
            },
          };
        } catch (error) {
          // If we can't inspect the image, return basic info
          return {
            id: image.Id,
            shortId: image.Id.substring(7, 19),
            repoTags: image.RepoTags || [],
            repoDigests: image.RepoDigests || [],
            created: image.Created,
            size: image.Size,
            virtualSize: image.VirtualSize,
            parent: image.ParentId,
            error: error instanceof Error ? error.message : 'Failed to inspect image',
          };
        }
      }),
    );
    
    return res.json({
      total: imageDetails.length,
      images: imageDetails,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get Docker images',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getAllDataFiles = async (_req: Request, res: Response) => {
  try {
    // Get all project data file paths from database
    const projects = await prisma.project.findMany({
      where: {
        dataFile: { not: null },
      },
      select: {
        dataFile: true,
      },
    });

    const projectDataFiles = new Set(
      projects
        .map((p) => p.dataFile)
        .filter((file): file is string => file !== null)
        .map((file) => path.basename(file)), // Get just the filename
    );

    // Use the container directory (server runs inside container)
    const dataDir =
      process.env.DATA_FILES_DIR || '/app/data/project-data-files';

    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
      return res.json({
        total: 0,
        directory: dataDir,
        files: [],
        message: 'Data files directory does not exist',
      });
    }

    // Read all files in the directory
    const files = fs.readdirSync(dataDir, { withFileTypes: true });

    // Filter to only files associated with projects
    const projectFiles = files.filter(
      (file) => file.isFile() && projectDataFiles.has(file.name),
    );

    // Get detailed information for each file
    const fileDetails = projectFiles.map((file) => {
        const filePath = path.join(dataDir, file.name);
        try {
          const stats = fs.statSync(filePath);
          return {
            name: file.name,
            path: filePath,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
          };
        } catch (error) {
          return {
            name: file.name,
            path: filePath,
            error: error instanceof Error ? error.message : 'Failed to get file stats',
          };
        }
      });

    // Sort by modified date (newest first)
    fileDetails.sort((a, b) => {
      const aModified = 'modified' in a ? a.modified : undefined;
      const bModified = 'modified' in b ? b.modified : undefined;
      if (aModified && bModified) {
        return bModified.getTime() - aModified.getTime();
      }
      return 0;
    });

    // Calculate total size
    const totalSize = fileDetails.reduce((sum, file) => {
      return sum + ('size' in file && file.size !== undefined ? file.size : 0);
    }, 0);

    return res.json({
      total: fileDetails.length,
      directory: dataDir,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      files: fileDetails,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get data files',
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

export const stopContainer = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    // Verify container is associated with a project
    const project = await prisma.project.findFirst({
      where: {
        containerId: containerId,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Container not found',
        message: 'This container is not associated with any project in the database',
        containerId,
      });
    }

    const container = docker.getContainer(containerId);

    // Try to stop the container
    try {
      await container.stop();
      return res.json({
        message: 'Container stopped successfully',
        containerId,
      });
    } catch (error) {
      // Check if container is already stopped or doesn't exist
      if ((error as { statusCode?: number }).statusCode === 304) {
        return res.json({
          message: 'Container is already stopped',
          containerId,
        });
      }
      if ((error as { statusCode?: number }).statusCode === 404) {
        return res.status(404).json({
          error: 'Container not found',
          containerId,
        });
      }
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to stop container',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const removeContainer = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    // Verify container is associated with a project
    const project = await prisma.project.findFirst({
      where: {
        containerId: containerId,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Container not found',
        message: 'This container is not associated with any project in the database',
        containerId,
      });
    }

    const container = docker.getContainer(containerId);

    // Try to stop the container first (if it's running)
    try {
      await container.stop();
    } catch (error) {
      // Ignore errors if container is already stopped or doesn't exist
      if ((error as { statusCode?: number }).statusCode !== 304 && (error as { statusCode?: number }).statusCode !== 404) {
        // Re-throw if it's a different error
        throw error;
      }
    }

    // Remove the container
    try {
      await container.remove();
      return res.json({
        message: 'Container removed successfully',
        containerId,
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return res.status(404).json({
          error: 'Container not found',
          containerId,
        });
      }
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to remove container',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const removeImage = async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;

    // Get image info to find its ID/hash
    let imageHash: string | null = null;
    try {
      const image = docker.getImage(imageId);
      const imageInfo = await image.inspect();
      imageHash = imageInfo.Id; // Full image ID (sha256:...)
    } catch {
      return res.status(404).json({
        error: 'Image not found',
        message: 'Could not find or inspect the specified image',
        imageId,
      });
    }

    // Verify image is associated with a project by checking if the image hash matches
    // First try exact match
    let matchingProject = await prisma.project.findFirst({
      where: {
        imageHash: {
          equals: imageHash,
        },
      },
      select: {
        id: true,
        imageHash: true,
      },
    });

    // If no exact match, check for partial matches (handles short/long hash variations)
    if (!matchingProject) {
      const allProjects = await prisma.project.findMany({
        select: {
          id: true,
          imageHash: true,
        },
      });
      
      matchingProject = allProjects.find((p) => 
        p.imageHash === imageHash ||
        imageHash.startsWith(p.imageHash) ||
        p.imageHash.startsWith(imageHash)
      ) || null;
    }

    if (!matchingProject) {
      return res.status(404).json({
        error: 'Image not found',
        message: 'This image is not associated with any project in the database',
        imageId,
      });
    }

    const image = docker.getImage(imageId);

    try {
      await image.remove();
      return res.json({
        message: 'Image removed successfully',
        imageId,
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        return res.status(404).json({
          error: 'Image not found',
          imageId,
        });
      }
      if ((error as { statusCode?: number }).statusCode === 409) {
        return res.status(409).json({
          error: 'Image is in use and cannot be removed',
          imageId,
          message: 'The image is being used by one or more containers. Remove the containers first.',
        });
      }
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to remove image',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const removeDataFile = async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;

    // Verify file is associated with a project
    const project = await prisma.project.findFirst({
      where: {
        dataFile: {
          endsWith: fileName,
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'File not found',
        message: 'This file is not associated with any project in the database',
        fileName,
      });
    }

    // Use the container directory (server runs inside container)
    const dataDir =
      process.env.DATA_FILES_DIR || '/app/data/project-data-files';

    // Construct the full file path
    const filePath = path.join(dataDir, fileName);

    // Security check: ensure the file path is within the data directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDataDir = path.resolve(dataDir);
    if (!resolvedPath.startsWith(resolvedDataDir)) {
      return res.status(400).json({
        error: 'Invalid file path',
        message: 'File path must be within the data files directory',
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        fileName,
        path: filePath,
      });
    }

    // Check if it's actually a file (not a directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Path is not a file',
        fileName,
        message: 'The specified path is a directory, not a file',
      });
    }

    // Remove the file
    fs.unlinkSync(filePath);

    return res.json({
      message: 'Data file removed successfully',
      fileName,
      path: filePath,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to remove data file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

