import { randomUUID } from 'crypto';

import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';

const PROJECTS_NETWORK = 'projects_network';

/**
 * Normalize team name for use as alias: lowercase and replace spaces with dashes
 * Same pattern as normalizeContainerName used elsewhere in the codebase
 */
const normalizeTeamNameForAlias = (teamName: string): string => {
  return teamName.toLowerCase().replace(/\s+/g, '-');
};

/**
 * Check if an alias already exists on the projects_network
 */
const checkAliasExists = async (alias: string): Promise<boolean> => {
  try {
    const network = docker.getNetwork(PROJECTS_NETWORK);
    const networkInfo = await network.inspect();
    
    // Check all containers connected to the network
    if (networkInfo.Containers) {
      for (const containerId in networkInfo.Containers) {
        const containerInfo = networkInfo.Containers[containerId];
        if (containerInfo.Aliases && containerInfo.Aliases.includes(alias)) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    // If network doesn't exist, alias doesn't exist
    if ((error as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw error;
  }
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
 * Generate a unique alias by appending a 4-character UUID if the alias is taken
 */
const generateUniqueAlias = async (baseAlias: string): Promise<string> => {
  let alias = baseAlias;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (await checkAliasExists(alias)) {
    if (attempts >= maxAttempts) {
      throw new Error(`Unable to generate unique alias after ${maxAttempts} attempts`);
    }
    
    // Generate a 4-character UUID (take first 4 chars and make it lowercase)
    const uuid = randomUUID().replace(/-/g, '').substring(0, 4).toLowerCase();
    alias = `${baseAlias}-${uuid}`;
    attempts++;
  }
  
  return alias;
};


/**
 * Migrate a project's backend container to projects_network
 */
export const migrateProjectContainer = async (
  projectName: string,
  teamId: number,
  githubUrl?: string,
  deployedById?: number,
) => {
  // Find team by ID
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  
  if (!team) {
    throw new NotFoundError(`Team with ID ${teamId} not found`);
  }
  
  // Use team name for alias (normalized)
  const baseAlias = normalizeTeamNameForAlias(team.name);
  
  // Find the container by name
  let container;
  let containerInfo;
  
  try {
    const containers = await docker.listContainers({ all: true });
    
    // Find container by matching names (Docker container names have leading slash)
    const foundContainer = containers.find((c) => {
      return c.Names.some((name) => {
        const normalizedName = name.startsWith('/') ? name.substring(1) : name;
        const normalizedProjectName = projectName.startsWith('/') ? projectName.substring(1) : projectName;
        return normalizedName === normalizedProjectName || name === projectName || name === `/${projectName}`;
      });
    });
    
    if (!foundContainer) {
      throw new NotFoundError(`Container with name "${projectName}" not found`);
    }
    
    container = docker.getContainer(foundContainer.Id);
    containerInfo = await container.inspect();
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new Error(`Failed to find container "${projectName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Ensure projects network exists
  await ensureProjectsNetwork();
  
  // Generate unique alias if needed
  const alias = await generateUniqueAlias(baseAlias);
  
  // Check if container is already connected to projects_network
  const networks = containerInfo.NetworkSettings.Networks || {};
  const alreadyConnected = PROJECTS_NETWORK in networks;
  
  if (!alreadyConnected) {
    // Connect container to projects_network with the alias
    const network = docker.getNetwork(PROJECTS_NETWORK);
    await network.connect({
      Container: container.id,
      EndpointConfig: {
        Aliases: [alias],
      },
    });
  } else {
    // If already connected, check if it has the desired alias
    const existingAliases = networks[PROJECTS_NETWORK].Aliases || [];
    if (!existingAliases.includes(alias)) {
      // Disconnect and reconnect with the new alias
      const network = docker.getNetwork(PROJECTS_NETWORK);
      try {
        await network.disconnect({
          Container: container.id,
          Force: false,
        });
      } catch {
        // Ignore disconnect errors
      }
      
      await network.connect({
        Container: container.id,
        EndpointConfig: {
          Aliases: [alias],
        },
      });
    }
    // If alias already matches, no need to reconnect
  }
  
  // Get updated container info to extract port mappings and other details
  const updatedContainerInfo = await container.inspect();
  const ports = updatedContainerInfo.NetworkSettings.Ports || {};
  
  // Extract image hash from container
  const imageId = updatedContainerInfo.Image;
  let imageHash = '';
  if (imageId) {
    try {
      const image = docker.getImage(imageId);
      const imageInfo = await image.inspect();
      imageHash = imageInfo.Id || imageId;
    } catch {
      // If we can't get image info, use the image ID as hash
      imageHash = imageId;
    }
  }
  
  // Extract container creation time for deployedAt
  // Docker returns Created as an ISO 8601 string (e.g., "2024-01-15T10:30:00.123456789Z")
  let containerCreatedAt: Date;
  if (updatedContainerInfo.Created) {
    containerCreatedAt = new Date(updatedContainerInfo.Created);
    // Fallback to current date if the date is invalid
    if (isNaN(containerCreatedAt.getTime())) {
      containerCreatedAt = new Date();
    }
  } else {
    // Fallback to current date if Created is not available
    containerCreatedAt = new Date();
  }
  
  // Check if a project already exists for this container (containerId is unique)
  const existingProject = await prisma.project.findUnique({
    where: {
      containerId: container.id,
    },
    include: {
      team: true,
    },
  });
  
  if (existingProject) {
    // If project exists for the same team, just update it
    if (existingProject.teamId === team.id) {
      const updatedProject = await prisma.project.update({
        where: { id: existingProject.id },
        data: {
          containerName: updatedContainerInfo.Name,
          ports: ports as any,
          imageHash: imageHash || existingProject.imageHash,
          githubUrl: githubUrl || existingProject.githubUrl,
          status: updatedContainerInfo.State.Running ? 'running' : 'stopped',
          deployedAt: existingProject.deployedAt,
        },
        include: {
          team: true,
        },
      });
      
      return {
        success: true,
        alias,
        project: updatedProject,
        containerId: container.id,
        containerName: updatedContainerInfo.Name,
        ports,
        message: 'Project updated successfully',
      };
    } else {
      // Project exists but is associated with a different team - move it to the new team
      const movedProject = await prisma.project.update({
        where: { id: existingProject.id },
        data: {
          teamId: team.id,
          containerName: updatedContainerInfo.Name,
          ports: ports as any,
          imageHash: imageHash || existingProject.imageHash,
          githubUrl: githubUrl || existingProject.githubUrl,
          status: updatedContainerInfo.State.Running ? 'running' : 'stopped',
          deployedAt: existingProject.deployedAt,
          deployedById: deployedById || existingProject.deployedById,
        },
        include: {
          team: true,
        },
      });
      
      return {
        success: true,
        alias,
        project: movedProject,
        containerId: container.id,
        containerName: updatedContainerInfo.Name,
        ports,
        message: 'Project moved to new team successfully',
      };
    }
  }
  
  // Create new project entry
  const project = await prisma.project.create({
    data: {
      teamId: team.id,
      githubUrl: githubUrl || '',
      imageHash,
      containerId: container.id,
      containerName: updatedContainerInfo.Name,
      status: updatedContainerInfo.State.Running ? 'running' : 'stopped',
      ports: ports as any,
      buildArgs: {},
      deployedById: deployedById || null,
      deployedAt: containerCreatedAt,
    },
    include: {
      team: true,
    },
  });
  
  return {
    success: true,
    alias,
    project,
    containerId: container.id,
    containerName: updatedContainerInfo.Name,
    ports,
    message: 'Project migrated successfully',
  };
};

