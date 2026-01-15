import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { git } from '../git.js';
import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';

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
 * Normalize container name: lowercase and replace spaces with dashes
 */
const normalizeContainerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

/**
 * Ensure the projects network exists, create it if it doesn't
 */
const ensureProjectsNetwork = async (): Promise<void> => {
  try {
    await docker.getNetwork(PROJECTS_NETWORK).inspect();
  } catch (error) {
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
 * Build and deploy an old project using JSON Dockerfile
 */
export const buildOldJson = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Create project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: 'building',
      deployedById,
      buildArgs: {},
    },
  });

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `old-project-${Date.now()}-${repoName}`);
  const backendDir = path.join(tempDir, 'backend');

  try {
    // Find and stop any running projects for this team
    const runningProjects = await prisma.project.findMany({
      where: {
        teamId,
        status: 'running',
        id: { not: project.id },
      },
      select: {
        id: true,
        containerId: true,
      },
    });

    // Stop all running containers for this team
    for (const runningProject of runningProjects) {
      if (runningProject.containerId) {
        try {
          const container = docker.getContainer(runningProject.containerId);
          await container.stop();
          
          // Update project status to stopped
          await prisma.project.update({
            where: { id: runningProject.id },
            data: {
              status: 'stopped',
              stoppedAt: new Date(),
              failedCheckCount: 0,
              lastCheckedAt: null,
            },
          });
        } catch {
          // Continue even if stop fails (container might not exist)
        }
      }
    }

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Check if backend directory exists
    if (!fs.existsSync(backendDir)) {
      throw new Error('Project does not have a /backend directory');
    }

    // Copy Dockerfile_JSON to backend/Dockerfile
    const dockerfileSource = path.join(process.cwd(), 'templates', '2025-Dockerfile_JSON');
    const dockerfileDest = path.join(backendDir, 'Dockerfile');
    
    if (!fs.existsSync(dockerfileSource)) {
      throw new Error('Dockerfile template not found');
    }

    fs.copyFileSync(dockerfileSource, dockerfileDest);

    // Stop and remove existing containers
    const containerName = normalizeContainerName(team.name);
    const dbContainerName = `${containerName}-db`;
    const existingContainer = docker.getContainer(containerName);
    const existingDbContainer = docker.getContainer(dbContainerName);

    try { await existingContainer.stop(); } catch { /* do nothing */ }
    try { await existingContainer.remove(); } catch { /* do nothing */ }
    try { await existingDbContainer.stop(); } catch { /* do nothing */ }
    try { await existingDbContainer.remove(); } catch { /* do nothing */ }

    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Build the backend image (use team name for image name)
    const imageName = `${normalizeContainerName(team.name)}-old-json:latest`;
    const buildStream = await docker.buildImage(
      {
        context: backendDir,
        src: ['.'],
      },
      { t: imageName },
    );

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(buildStream, (err) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });

    // Get the image hash after build
    const builtImage = docker.getImage(imageName);
    const imageInfo = await builtImage.inspect();
    const imageHash = imageInfo.Id; // Full image ID (sha256:...)

    // Update project with image hash
    await prisma.project.update({
      where: { id: project.id },
      data: {
        imageHash,
      },
    });

    // Create and start database container
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
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [dbContainerName],
          },
        },
      },
    });

    await dbContainer.start();

    // Create and start backend container
    const backendContainer = await docker.createContainer({
      Image: imageHash, // Use image hash instead of image name
      name: containerName,
      Env: [
        `DB_NAME=${dbContainerName}`,
      ],
      Cmd: ['flask', 'run', '--host=0.0.0.0', '--port=5000'],
      HostConfig: {
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [containerName],
          },
        },
      },
    });

    await backendContainer.start();

    // Get container info
    const containerInfo = await backendContainer.inspect();

    // Update project with container information
    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        containerId: backendContainer.id,
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
      backendContainer: containerName,
      dbContainer: dbContainerName,
      imageName,
      imageHash,
      containerId: backendContainer.id,
      containerName: containerInfo.Name,
      ports: containerInfo.NetworkSettings.Ports,
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
 * Build and deploy an old project using SQL Dockerfile
 */
export const buildOldSql = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Create project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: 'building',
      deployedById,
      buildArgs: {},
    },
  });

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `old-project-${Date.now()}-${repoName}`);
  const backendDir = path.join(tempDir, 'backend');

  try {
    // Find and stop any running projects for this team
    const runningProjects = await prisma.project.findMany({
      where: {
        teamId,
        status: 'running',
        id: { not: project.id },
      },
      select: {
        id: true,
        containerId: true,
      },
    });

    // Stop all running containers for this team
    for (const runningProject of runningProjects) {
      if (runningProject.containerId) {
        try {
          const container = docker.getContainer(runningProject.containerId);
          await container.stop();
          
          // Update project status to stopped
          await prisma.project.update({
            where: { id: runningProject.id },
            data: {
              status: 'stopped',
              stoppedAt: new Date(),
              failedCheckCount: 0,
              lastCheckedAt: null,
            },
          });
        } catch {
          // Continue even if stop fails (container might not exist)
        }
      }
    }

    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Check if backend directory exists
    if (!fs.existsSync(backendDir)) {
      throw new Error('Project does not have a /backend directory');
    }

    // Copy Dockerfile_SQL to backend/Dockerfile
    const dockerfileSource = path.join(process.cwd(), 'templates', '2025-Dockerfile_SQL');
    const dockerfileDest = path.join(backendDir, 'Dockerfile');
    
    if (!fs.existsSync(dockerfileSource)) {
      throw new Error('Dockerfile template not found');
    }

    fs.copyFileSync(dockerfileSource, dockerfileDest);

    // Stop and remove existing containers
    const containerName = normalizeContainerName(team.name);
    const dbContainerName = `${containerName}-db`;
    const existingContainer = docker.getContainer(containerName);
    const existingDbContainer = docker.getContainer(dbContainerName);

    try { await existingContainer.stop(); } catch { /* do nothing */ }
    try { await existingContainer.remove(); } catch { /* do nothing */ }
    try { await existingDbContainer.stop(); } catch { /* do nothing */ }
    try { await existingDbContainer.remove(); } catch { /* do nothing */ }

    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Build the backend image (use team name for image name)
    const imageName = `${normalizeContainerName(team.name)}-old-sql:latest`;
    const buildStream = await docker.buildImage(
      {
        context: backendDir,
        src: ['.'],
      },
      { t: imageName },
    );

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(buildStream, (err) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });

    // Get the image hash after build
    const builtImage = docker.getImage(imageName);
    const imageInfo = await builtImage.inspect();
    const imageHash = imageInfo.Id; // Full image ID (sha256:...)

    // Update project with image hash
    await prisma.project.update({
      where: { id: project.id },
      data: {
        imageHash,
      },
    });

    // Create and start database container
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
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [dbContainerName],
          },
        },
      },
    });

    await dbContainer.start();

    // Create and start backend container
    const backendContainer = await docker.createContainer({
      Image: imageHash, // Use image hash instead of image name
      name: containerName,
      Env: [
        `DB_NAME=${dbContainerName}`,
      ],
      Cmd: ['flask', 'run', '--host=0.0.0.0', '--port=5000'],
      HostConfig: {
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [containerName],
          },
        },
      },
    });

    await backendContainer.start();

    // Get container info
    const containerInfo = await backendContainer.inspect();

    // Update project with container information
    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        containerId: backendContainer.id,
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
      backendContainer: containerName,
      dbContainer: dbContainerName,
      imageName,
      imageHash,
      containerId: backendContainer.id,
      containerName: containerInfo.Name,
      ports: containerInfo.NetworkSettings.Ports,
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

