import { PROJECT_STATUS } from '../constants/projectStatus.js';
import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { buildContainerEnv } from './projectContainerEnv.js';
import {
  getContainerDataFilePath,
  getHostDataFilePath,
} from './projectPaths.js';

export const PROJECTS_NETWORK = 'projects_network';

export async function ensureProjectsNetwork(): Promise<void> {
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
}

export async function runProjectContainer(params: {
  teamId: number;
  projectId: number;
  imageHash: string;
  containerName: string;
  projectAlias: string | null;
  extraEnvVars?: Record<string, string>;
  dataFile?: string | null;
  originalDataFileName?: string | null;
}) {
  const {
    teamId,
    projectId,
    imageHash,
    containerName,
    projectAlias,
    extraEnvVars,
    dataFile,
    originalDataFileName,
  } = params;

  const runningProjects = await prisma.project.findMany({
    where: { teamId, status: PROJECT_STATUS.RUNNING },
    select: { id: true, containerId: true },
  });
  for (const runningProject of runningProjects) {
    if (runningProject.containerId) {
      try {
        const container = docker.getContainer(runningProject.containerId);
        await container.stop();
        await prisma.project.update({
          where: { id: runningProject.id },
          data: {
            status: PROJECT_STATUS.STOPPED,
            stoppedAt: new Date(),
            failedCheckCount: 0,
            lastCheckedAt: null,
          },
        });
        console.log(`Stopped running container for project ${runningProject.id}`);
      } catch (error) {
        console.log(
          `Failed to stop container ${runningProject.containerId}:`,
          error,
        );
      }
    }
  }

  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.stop();
    console.log(`Stopped existing container: ${containerName}`);
  } catch {
    // Continue if container doesn't exist or already stopped
  }
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.remove();
    console.log(`Removed existing container: ${containerName}`);
  } catch {
    // Continue if remove fails
  }

  await ensureProjectsNetwork();

  const containerEnv = await buildContainerEnv(teamId, extraEnvVars);
  const containerConfig = {
    Image: imageHash,
    name: containerName,
    Env: containerEnv,
    HostConfig: {
      AutoRemove: false,
      NetworkMode: PROJECTS_NETWORK,
      Memory: 800 * 1024 * 1024,
      Binds: dataFile
        ? [
            `${getHostDataFilePath(dataFile)}:${getContainerDataFilePath(dataFile, originalDataFileName ?? undefined)}:ro`,
          ]
        : undefined,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [PROJECTS_NETWORK]: {
          Aliases: [containerName],
        },
      },
    },
  };

  const container = await docker.createContainer(containerConfig);
  await container.start();
  const containerInfo = await container.inspect();

  return prisma.project.update({
    where: { id: projectId },
    data: {
      containerId: container.id,
      containerName: containerInfo.Name,
      alias: projectAlias,
      status: PROJECT_STATUS.RUNNING,
      ports: containerInfo.NetworkSettings.Ports,
      deployedAt: new Date(),
    },
    include: { team: true },
  });
}

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
