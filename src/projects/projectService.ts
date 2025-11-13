import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { git } from '../git.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';

const PROJECTS_NETWORK = 'projects_network';

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
 * Deploy legacy projects (SP24 and earlier) with Flask backend + MySQL database
 * This replicates the old docker-compose setup but uses the projects_network
 */
export const deployLegacyProject = async (teamId: number, githubUrl: string) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `legacy-project-${Date.now()}-${repoName}`);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageName: `${repoName}:latest`.toLowerCase(),
      status: 'building',
    },
  });

  try {
    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Check for backend directory (required for legacy projects)
    const backendDockerfilePath = path.join(tempDir, 'backend', 'Dockerfile');
    if (!fs.existsSync(backendDockerfilePath)) {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'failed' },
      });
      throw new BadRequestError('Legacy project requires backend/Dockerfile');
    }

    const buildContext = path.join(tempDir, 'backend');

    // Build the Flask backend image
    const backendImageName = `${repoName}-backend:latest`.toLowerCase();
    const stream = await docker.buildImage(
      {
        context: buildContext,
        src: ['.'],
      },
      {
        t: backendImageName,
      },
    );

    // Wait for the build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    // Create MySQL database container first
    const dbContainerName = `${team.name.toLowerCase()}-db`;
    const dbContainer = await docker.createContainer({
      Image: 'mysql:latest',
      name: dbContainerName,
      Env: [
        'MYSQL_USER=admin',
        'MYSQL_PASSWORD=admin',
        'MYSQL_DATABASE=kardashiandb',
        'MYSQL_ROOT_PASSWORD=admin',
      ],
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 512 * 1024 * 1024, // 512MB for MySQL
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [`${team.name.toLowerCase()}-db`],
          },
        },
      },
    });

    await dbContainer.start();

    // Wait a bit for MySQL to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Create Flask backend container
    const backendContainerName = `${team.name.toLowerCase()}-backend`;
    const backendContainer = await docker.createContainer({
      Image: backendImageName,
      name: backendContainerName,
      Env: [
        `DB_NAME=${team.name.toLowerCase()}-db`,
      ],
      Cmd: ['flask', 'run', '--host=0.0.0.0', '--port=5000'],
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB for Flask
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [`${team.name.toLowerCase()}-backend`],
          },
        },
      },
    });

    await backendContainer.start();

    // Get container info
    const backendInfo = await backendContainer.inspect();
    const dbInfo = await dbContainer.inspect();

    // Update project with container information
    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        containerId: backendContainer.id,
        containerName: backendInfo.Name,
        status: 'running',
        ports: backendInfo.NetworkSettings.Ports,
        deployedAt: new Date(),
      },
      include: {
        team: true,
      },
    });

    return {
      success: true,
      project: updatedProject,
      backend: {
        imageName: backendImageName,
        containerId: backendContainer.id,
        containerName: backendInfo.Name,
        state: backendInfo.State,
      },
      database: {
        containerId: dbContainer.id,
        containerName: dbInfo.Name,
        state: dbInfo.State,
      },
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
 * Clone a GitHub repository, build a Docker image from it, and run a container
 */
export const deploy = async (teamId: number, githubUrl: string) => {
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
    },
  });

  try {
    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Check for Dockerfile in backend directory first, then root
    const backendDockerfilePath = path.join(tempDir, 'backend', 'Dockerfile');
    const rootDockerfilePath = path.join(tempDir, 'Dockerfile');
    
    let buildContext = tempDir;
    let isBackendProject = false;
    
    // This is to support SP24 projects which have a backend directory
    if (fs.existsSync(backendDockerfilePath)) {
      // Use backend directory if it has a Dockerfile
      buildContext = path.join(tempDir, 'backend');
      isBackendProject = true;
    } else if (!fs.existsSync(rootDockerfilePath)) {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'failed' },
      });
      throw new BadRequestError('No Dockerfile found in the repository');
    }

    // Build the image
    const imageName = `${repoName}:latest`.toLowerCase();
    const stream = await docker.buildImage(
      {
        context: buildContext,
        src: ['.'],
      },
      {
        t: imageName,
      },
    );

    // Wait for the build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    // Run the container with appropriate startup command
    const containerConfig: any = {
      Image: imageName,
      name: `${repoName}-${Date.now()}`,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [team.name.toLowerCase()],
          },
        },
      },
    };

    // Override startup command for backend directory projects (SP24 Flask apps)
    if (isBackendProject) {
      containerConfig.Cmd = ['flask', 'run', '--host=0.0.0.0', '--port=5000'];
    }

    const container = await docker.createContainer(containerConfig);

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
    },
  });

  return projects;
};

/**
 * Get logs from a running container
 */
export const getProjectLogs = async (
  projectId: number,
  options: {
    tail?: number;
    since?: string;
    timestamps?: boolean;
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

    // Check if container exists and get its state
    const containerInfo = await container.inspect();

    const logOptions: {
      follow?: false;
      stdout: boolean;
      stderr: boolean;
      tail?: number;
      since?: string;
      timestamps?: boolean;
    } = {
      follow: false,
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      timestamps: options.timestamps || false,
    };

    if (options.since) {
      logOptions.since = options.since;
    }

    const logs = await container.logs(logOptions);

    // Convert buffer to string
    const logsString = logs.toString();

    return {
      projectId,
      containerId: project.containerId,
      containerName: project.containerName,
      status: project.status,
      containerState: containerInfo.State,
      logs: logsString,
    };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw new NotFoundError('Container not found');
    }
    throw error;
  }
};
