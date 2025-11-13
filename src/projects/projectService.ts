import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { docker } from '../docker.js';
import { git } from '../git.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';

const execAsync = promisify(exec);

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
 * Deploy legacy projects (SP25 and earlier) with Flask backend + MySQL database
 * Uses docker-compose with the projects_network
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
    // Check if team has an active project and stop/remove existing container
    const existingProject = await prisma.project.findFirst({
      where: {
        teamId,
        status: 'running',
      },
    });

    if (existingProject && existingProject.containerId) {
      // First try-catch: Stop the existing container
      try {
        const existingContainer = docker.getContainer(existingProject.containerId);
        await existingContainer.stop();
        console.log(`Stopped existing legacy container: ${existingProject.containerId}`);
      } catch (stopError) {
        console.log(`Failed to stop legacy container ${existingProject.containerId}:`, stopError);
        // Continue even if stop fails - container might already be stopped
      }

      // Second try-catch: Remove the existing container
      try {
        const existingContainer = docker.getContainer(existingProject.containerId);
        await existingContainer.remove();
        console.log(`Removed existing legacy container: ${existingProject.containerId}`);
        
        // Update the existing project status
        await prisma.project.update({
          where: { id: existingProject.id },
          data: {
            status: 'stopped',
            stoppedAt: new Date(),
          },
        });
      } catch (removeError) {
        console.log(`Failed to remove legacy container ${existingProject.containerId}:`, removeError);
        // Continue even if remove fails - we'll create a new container anyway
      }
    }

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

    // Copy the legacy docker-compose.yaml to the temp directory
    const legacyComposePath = path.join(process.cwd(), 'legacy-docker-compose.yaml');
    const targetComposePath = path.join(tempDir, 'docker-compose.yaml');
    
    if (!fs.existsSync(legacyComposePath)) {
      throw new BadRequestError('Legacy docker-compose.yaml not found');
    }
    
    fs.copyFileSync(legacyComposePath, targetComposePath);

    // Stop and remove existing containers if they exist
    const teamName = team.name.toLowerCase();
    try {
      await execAsync(`docker-compose -f ${targetComposePath} down`, {
        cwd: tempDir,
        env: {
          ...process.env,
          TEAM_NAME: teamName,
        },
      });
    } catch (error) {
      // Containers might not exist, continue
    }

    // Deploy using docker-compose
    const { stdout, stderr } = await execAsync(`docker-compose -f ${targetComposePath} up -d --build`, {
      cwd: tempDir,
      env: {
        ...process.env,
        TEAM_NAME: teamName,
      },
    });

    console.log('Docker-compose output:', stdout);
    if (stderr) {
      console.log('Docker-compose stderr:', stderr);
    }

    // Get container information
    const backendContainerName = `${teamName}_backend_app`;
    const dbContainerName = `${teamName}_db`;

    // Wait a bit for containers to start
    await new Promise(resolve => setTimeout(resolve, 10000));

    let backendContainer, dbContainer;
    try {
      backendContainer = docker.getContainer(backendContainerName);
      dbContainer = docker.getContainer(dbContainerName);
      
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
    } catch (inspectError) {
      throw new Error(`Failed to inspect containers: ${inspectError}`);
    }
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
    // Check if team has an active project and stop/remove existing container
    const existingProject = await prisma.project.findFirst({
      where: {
        teamId,
        status: 'running',
      },
    });

    if (existingProject && existingProject.containerId) {
      // First try-catch: Stop the existing container
      try {
        const existingContainer = docker.getContainer(existingProject.containerId);
        await existingContainer.stop();
        console.log(`Stopped existing container: ${existingProject.containerId}`);
      } catch (stopError) {
        console.log(`Failed to stop container ${existingProject.containerId}:`, stopError);
        // Continue even if stop fails - container might already be stopped
      }

      // Second try-catch: Remove the existing container
      try {
        const existingContainer = docker.getContainer(existingProject.containerId);
        await existingContainer.remove();
        console.log(`Removed existing container: ${existingProject.containerId}`);
        
        // Update the existing project status
        await prisma.project.update({
          where: { id: existingProject.id },
          data: {
            status: 'stopped',
            stoppedAt: new Date(),
          },
        });
      } catch (removeError) {
        console.log(`Failed to remove container ${existingProject.containerId}:`, removeError);
        // Continue even if remove fails - we'll create a new container anyway
      }
    }

    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Build the image
    const imageName = `${repoName}:latest`.toLowerCase();
    const stream = await docker.buildImage(
      {
        context: tempDir,
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
      name: `${team.name.toLowerCase()}`,
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
