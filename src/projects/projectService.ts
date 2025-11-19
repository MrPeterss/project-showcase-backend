import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { git } from '../git.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';

const PROJECTS_NETWORK = 'projects_network';
const DATA_MOUNT_PATH = '/var/www/data'; // Standardized mount path in container

/**
 * Extract repository name from GitHub URL
 */
const extractRepoName = (githubUrl: string): string => {
  const match = githubUrl.match(/\/([^/]+?)(\.git)?$/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }
  return match[1].replace('.git', '');
};

/**
 * Ensure the projects network exists, create it if it doesn't
 */
const ensureProjectsNetwork = async (): Promise<void> => {
  try {
    // Try to inspect the network to see if it exists
    await docker.getNetwork(PROJECTS_NETWORK).inspect();
  } catch (error) {
    // Network doesn't exist, create it
    if ((error as { statusCode?: number }).statusCode === 404) {
      await docker.createNetwork({
        Name: PROJECTS_NETWORK,
        Driver: 'bridge',
        Internal: false,
        Attachable: true,
        IPAM: {
          Driver: 'default',
        },
      });
    } else {
      throw error;
    }
  }
};

/**
 * List all running Docker containers
 */
export const listRunningContainers = async () => {
  const containers = await docker.listContainers({ all: false });
  return containers.map((container) => ({
    id: container.Id,
    names: container.Names,
    image: container.Image,
    state: container.State,
    status: container.Status,
    ports: container.Ports,
    created: container.Created,
  }));
};

/**
 * List all Docker images
 */
export const listAllImages = async () => {
  const images = await docker.listImages({ all: true });
  return images.map((image) => ({
    id: image.Id,
    repoTags: image.RepoTags,
    repoDigests: image.RepoDigests,
    created: image.Created,
    size: image.Size,
    virtualSize: image.VirtualSize,
  }));
};


/**
 * Clone a GitHub repository, build a Docker image from it, and run a container
 */
export const deploy = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
  buildArgs?: Record<string, string>,
  dataFilePath?: string,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageName: `${repoName}:latest`.toLowerCase(),
      status: 'building',
      deployedById,
      buildArgs: buildArgs || {},
    },
  });

  try {
    // Stop and remove existing container with the same name if it exists
    const containerName = team.name.toLowerCase();
    
    // First try-catch: Stop the existing container
    try {
      const existingContainer = docker.getContainer(containerName);
      await existingContainer.stop();
      console.log(`Stopped existing container: ${containerName}`);
    } catch (stopError) {
      console.log(`Failed to stop container ${containerName}:`, stopError);
      // Continue even if stop fails - container might not exist or already be stopped
    }

    // Second try-catch: Remove the existing container
    try {
      const existingContainer = docker.getContainer(containerName);
      await existingContainer.remove();
      console.log(`Removed existing container: ${containerName}`);
    } catch (removeError) {
      console.log(`Failed to remove container ${containerName}:`, removeError);
      // Continue even if remove fails - we'll create a new container anyway
    }

    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Build the image
    const imageName = `${repoName}:latest`.toLowerCase();
    const buildOptions: Record<string, unknown> = {
      t: imageName,
    };
    
    // Add build args if provided
    if (buildArgs && Object.keys(buildArgs).length > 0) {
      buildOptions.buildargs = buildArgs;
    }
    
    const stream = await docker.buildImage(
      {
        context: tempDir,
        src: ['.'],
      },
      buildOptions,
    );

    // Capture build logs
    const buildLogLines: string[] = [];

    // Wait for the build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
        (event) => {
          // Capture build output
          if (event.stream) {
            buildLogLines.push(event.stream);
          } else if (event.status) {
            buildLogLines.push(`${event.status}${event.progress ? ` ${event.progress}` : ''}\n`);
          } else if (event.error) {
            buildLogLines.push(`ERROR: ${event.error}\n`);
          }
        },
      );
    });

    // Store build logs in database
    await prisma.project.update({
      where: { id: project.id },
      data: { buildLogs: buildLogLines.join('') },
    });

    // Run the container with appropriate startup command
    const containerConfig: unknown = {
      Image: imageName,
      name: `${team.name.toLowerCase()}`,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
        Binds: dataFilePath ? [`${dataFilePath}:${DATA_MOUNT_PATH}:ro`] : undefined,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [team.name.toLowerCase()],
          },
        },
      },
    };

    const container = await docker.createContainer(containerConfig!);

    await container.start();

    // Get container info
    const containerInfo = await container.inspect();

    // Update project with container information
    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        containerId: container.id,
        containerName: containerInfo.Name,
        status: 'running',
        ports: containerInfo.NetworkSettings.Ports,
        deployedAt: new Date(),
      },
      include: {
        team: true,
      },
    });

    return {
      success: true,
      project: updatedProject,
      imageName,
      containerId: container.id,
      containerName: containerInfo.Name,
      ports: containerInfo.NetworkSettings.Ports,
      state: containerInfo.State,
    };
  } catch (error) {
    // Update project status to failed
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'failed' },
    });
    throw error;
  } finally {
    // Clean up the temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};

/**
 * Get all projects for a team
 */
export const getTeamProjects = async (teamId: number) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const projects = await prisma.project.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return projects;
};

/**
 * Get a single project by ID
 */
export const getProjectById = async (projectId: number) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
};

/**
 * Stop a running container and update project status
 */
export const stopProject = async (projectId: number) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (!project.containerId) {
    throw new BadRequestError('No container associated with this project');
  }

  try {
    const container = docker.getContainer(project.containerId);
    await container.stop();

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
      },
      include: {
        team: true,
      },
    });

    return updatedProject;
  } catch (error) {
    // If container doesn't exist, just update the status
    if ((error as { statusCode?: number }).statusCode === 404) {
      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'stopped',
          stoppedAt: new Date(),
        },
        include: {
          team: true,
        },
      });
      return updatedProject;
    }
    throw error;
  }
};

/**
 * Get all projects across all teams
 */
export const getAllProjects = async () => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      deployedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return projects;
};

/**
 * Stream logs from a running container in real-time
 * Returns a stream that can be piped to a response
 */
export const streamProjectLogs = async (
  projectId: number,
  options: {
    tail?: number;
    since?: string;
    timestamps?: boolean;
    follow?: boolean;
  } = {},
) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (!project.containerId) {
    throw new BadRequestError('No container associated with this project');
  }

  try {
    const container = docker.getContainer(project.containerId);

    // Check if container exists
    await container.inspect();

    const logOptions: {
      follow: true;
      stdout: boolean;
      stderr: boolean;
      tail: number;
      timestamps: boolean;
      since?: string;
    } = {
      follow: true, // Explicitly set as true for type safety
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      timestamps: options.timestamps || false,
    };

    if (options.since) {
      logOptions.since = options.since;
    }

    const logStream = await container.logs(logOptions);

    return {
      project: {
        id: project.id,
        containerId: project.containerId,
        containerName: project.containerName,
        status: project.status,
      },
      stream: logStream,
    };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw new NotFoundError('Container not found');
    }
    throw error;
  }
};

/**
 * Stream build logs for a project
 * Returns stored build logs from when the project was built
 */
export const streamBuildLogs = async (projectId: number) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Parse build logs into array of lines
  const buildLogs = project.buildLogs
    ? project.buildLogs.split('\n').filter((line: string) => line.trim().length > 0)
    : [];

  return {
    project: {
      id: project.id,
      status: project.status,
      githubUrl: project.githubUrl,
      imageName: project.imageName,
      team: project.team,
      deployedAt: project.deployedAt,
    },
    buildLogs,
  };
};

/**
 * Build and deploy a project with real-time log streaming
 * This version returns a stream that emits build events in real-time
 */
export const buildWithStreaming = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
  buildArgs?: Record<string, string>,
  dataFilePath?: string,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageName: `${repoName}:latest`.toLowerCase(),
      status: 'building',
      deployedById,
      buildArgs: buildArgs || {},
      dataFile: dataFilePath || null,
    },
  });

  // This will be populated with the actual docker build stream
  const initBuild = async () => {
    try {
      // Stop and remove existing container with the same name if it exists
      const containerName = team.name.toLowerCase();
      
      try {
        const existingContainer = docker.getContainer(containerName);
        await existingContainer.stop();
      } catch {
        // Continue even if stop fails
      }

      try {
        const existingContainer = docker.getContainer(containerName);
        await existingContainer.remove();
      } catch {
        // Continue even if remove fails
      }

      // Ensure the projects network exists
      await ensureProjectsNetwork();

      // Clone the repository
      await git.clone(githubUrl, tempDir);

      // Build the image and get the stream
      const imageName = `${repoName}:latest`.toLowerCase();
      const buildOptions: Record<string, unknown> = {
        t: imageName,
      };
      
      // Add build args if provided
      if (buildArgs && Object.keys(buildArgs).length > 0) {
        buildOptions.buildargs = buildArgs;
      }
      
      const buildStream = await docker.buildImage(
        {
          context: tempDir,
          src: ['.'],
        },
        buildOptions,
      );

      // Return the raw stream - caller will handle progress events
      return buildStream;
    } catch (error) {
      // Update project status to failed
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  };

  const completeBuild = async (buildLogsToStore: string[]) => {
    try {
      const imageName = `${repoName}:latest`.toLowerCase();

      // Store build logs in database
      await prisma.project.update({
        where: { id: project.id },
        data: { buildLogs: buildLogsToStore.join('') },
      });

      // Run the container
      const containerConfig: unknown = {
        Image: imageName,
        name: `${team.name.toLowerCase()}`,
        HostConfig: {
          AutoRemove: false,
          NetworkMode: PROJECTS_NETWORK,
          Memory: 800 * 1024 * 1024, // 800MB
          Binds: dataFilePath ? [`${dataFilePath}:${DATA_MOUNT_PATH}:ro`] : undefined,
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [PROJECTS_NETWORK]: {
              Aliases: [team.name.toLowerCase()],
            },
          },
        },
      };

      const container = await docker.createContainer(containerConfig!);
      await container.start();

      // Get container info
      const containerInfo = await container.inspect();

      // Update project with container information
      const updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          containerId: container.id,
          containerName: containerInfo.Name,
          status: 'running',
          ports: containerInfo.NetworkSettings.Ports,
          deployedAt: new Date(),
        },
        include: {
          team: true,
        },
      });

      return updatedProject;
    } catch (error) {
      // Update project status to failed
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'failed' },
      });
      throw error;
    } finally {
      // Clean up the temporary directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  };

  return {
    project: {
      id: project.id,
      teamId: project.teamId,
      githubUrl: project.githubUrl,
      imageName: project.imageName,
      status: project.status,
    },
    initBuild,
    completeBuild,
  };
};
