import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';

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

    await container.inspect();

    const logOptions: {
      follow: true;
      stdout: boolean;
      stderr: boolean;
      tail: number;
      timestamps: boolean;
      since?: string;
    } = {
      follow: true,
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

  const buildLogs = project.buildLogs
    ? project.buildLogs.split('\n').filter((line: string) => line.trim().length > 0)
    : [];

  return {
    project: {
      id: project.id,
      status: project.status,
      githubUrl: project.githubUrl,
      imageHash: project.imageHash,
      team: project.team,
      deployedAt: project.deployedAt,
    },
    buildLogs,
  };
};
