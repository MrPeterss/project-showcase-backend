import * as fs from 'fs';
import * as path from 'path';

import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { docker } from '../docker.js';
import { git } from '../git.js';
import { prisma } from '../prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError.js';
import { getTeamPreferredProject } from '../utils/projectUtils.js';

const PROJECTS_NETWORK = 'projects_network';
const DATA_MOUNT_PATH = '/var/www';

// Get the host path for Docker bind mounts
const getHostDataFilePath = (filePath: string): string => {
  const containerDataDir = process.env.DATA_FILES_DIR || '/app/data/project-data-files';
  const hostDataDir = process.env.DATA_FILES_HOST_DIR;
  
  if (hostDataDir && filePath.startsWith(containerDataDir)) {
    return filePath.replace(containerDataDir, hostDataDir);
  }
  
  return filePath;
};

const getContainerDataFilePath = (filePath: string, originalFileName?: string): string => {
  const fileName = originalFileName || path.basename(filePath);
  return path.posix.join(DATA_MOUNT_PATH, fileName);
}

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
  originalFileName?: string,
  envVars?: Record<string, string>,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      CourseOffering: true,
    },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if course offering is locked
  const settings = (team.CourseOffering.settings as Record<string, unknown>) || {};
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    // Check if user is admin or instructor
    const isInstructor = await checkInstructorAccess(deployedById, team.CourseOffering.id);
    
    // If not admin and not instructor, block deployment
    // Note: We don't have isAdmin flag here, so we need to check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isInstructor) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: 'building',
      deployedById,
      buildArgs: buildArgs || {},
      dataFile: dataFilePath || null,
      originalDataFileName: originalFileName || null,
    },
  });

  try {
    // Find and stop any running projects for this team
    const runningProjects = await prisma.project.findMany({
      where: {
        teamId,
        status: 'running',
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
          console.log(`Stopped running container for project ${runningProject.id}`);
        } catch (error) {
          // Continue even if stop fails (container might not exist)
          console.log(
            `Failed to stop container ${runningProject.containerId}:`,
            error,
          );
        }
      }
    }

    // Stop and remove existing container with the same name if it exists
    const containerName = normalizeContainerName(team.name);
    
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

    // Build the image (use team name for image name)
    const imageName = `${normalizeContainerName(team.name)}:latest`;
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

    // Get the image hash after build
    const builtImage = docker.getImage(imageName);
    const imageInfo = await builtImage.inspect();
    const imageHash = imageInfo.Id; // This is the full image ID (sha256:...)

    // Store build logs and image hash in database
    await prisma.project.update({
      where: { id: project.id },
      data: {
        buildLogs: buildLogLines.join(''),
        imageHash,
      },
    });

      // Run the container with appropriate startup command
      // Use imageHash directly - Docker accepts image IDs
      const containerConfig: unknown = {
        Image: imageHash,
      name: normalizeContainerName(team.name),
      Env: envVars ? Object.entries(envVars).map(([key, value]) => `${key}=${value}`) : undefined,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
        Binds: dataFilePath
          ? [`${getHostDataFilePath(dataFilePath)}:${getContainerDataFilePath(dataFilePath, originalFileName)}:ro`]
          : undefined,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [PROJECTS_NETWORK]: {
            Aliases: [normalizeContainerName(team.name)],
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
      imageHash,
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
 * Helper function to get enrollment with highest access level
 * Role hierarchy: INSTRUCTOR > STUDENT > VIEWER
 */
const getHighestAccessEnrollment = async (
  userId: number,
  offeringId: number,
) => {
  const enrollments = await prisma.courseOfferingEnrollment.findMany({
    where: {
      userId,
      courseOfferingId: offeringId,
    },
  });

  if (enrollments.length === 0) {
    return null;
  }

  // If multiple enrollments exist, return the one with highest access level
  const rolePriority: Record<string, number> = {
    INSTRUCTOR: 3,
    STUDENT: 2,
    VIEWER: 1,
  };

  return enrollments.reduce((highest, current) => {
    return rolePriority[current.role] > rolePriority[highest.role]
      ? current
      : highest;
  });
};

/**
 * Helper function to check if user is instructor of course offering
 */
const checkInstructorAccess = async (userId: number, offeringId: number) => {
  const enrollment = await getHighestAccessEnrollment(userId, offeringId);
  return enrollment?.role === COURSE_OFFERING_ROLES.INSTRUCTOR;
};

/**
 * Stop a running container and update project status
 * Validates that the user is an admin, instructor, or team member
 */
export const stopProject = async (projectId: number, userId: number, isAdmin: boolean) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        include: {
          CourseOffering: true,
          members: true,
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (!project.containerId) {
    throw new BadRequestError('No container associated with this project');
  }

  // Check course offering lock state
  const offeringSettings =
    (project.team.CourseOffering.settings as Record<string, unknown>) || {};
  const serverLocked =
    (offeringSettings as { serverLocked?: boolean }).serverLocked === true;

  // Check permissions - admin, instructor, or team member
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(
      userId,
      project.team.CourseOffering.id,
    );
    const isTeamMember = project.team.members.some(
      (membership) => membership.userId === userId,
    );

    // If server is locked, only admins or instructors can stop projects
    if (serverLocked && !isInstructor) {
      throw new ForbiddenError(
        'Project control is locked for this course offering',
      );
    }

    if (!isInstructor && !isTeamMember) {
      throw new ForbiddenError('You must be an admin, instructor, or team member to stop this project');
    }
  }

  try {
    const container = docker.getContainer(project.containerId);
    
    // Force kill the container (immediate termination)
    try {
      await container.kill();
    } catch (error) {
      // If kill fails, check if container is already stopped/doesn't exist
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 304) {
        // 404 = doesn't exist, 304 = already stopped - both are fine, continue
      } else {
        // Other error from kill, but we'll still try to update status
        console.warn(`Failed to kill container ${project.containerId}:`, error);
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
        failedCheckCount: 0,
        lastCheckedAt: null,
      },
      include: {
        team: true,
      },
    });

    return updatedProject;
  } catch (error) {
    // If container doesn't exist or is already stopped, just update the status
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 304) {
      // 404 = doesn't exist, 304 = already stopped
      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'stopped',
          stoppedAt: new Date(),
          failedCheckCount: 0,
          lastCheckedAt: null,
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
      imageHash: project.imageHash,
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
  originalFileName?: string,
  envVars?: Record<string, string>,
) => {
  // Verify team exists
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      CourseOffering: true,
    },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if course offering is locked
  const settings = (team.CourseOffering.settings as Record<string, unknown>) || {};
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    // Check if user is admin or instructor
    const isInstructor = await checkInstructorAccess(deployedById, team.CourseOffering.id);
    
    // Check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isInstructor) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);
  // Use team name for image name
  const imageName = `${normalizeContainerName(team.name)}:latest`;

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: 'building',
      deployedById,
      buildArgs: buildArgs || {},
      dataFile: dataFilePath || null,
      originalDataFileName: originalFileName || null,
      envVars: envVars || {},
    },
  });

  // This will be populated with the actual docker build stream
  const initBuild = async () => {
    try {
      // Find and stop any running projects for this team
      const runningProjects = await prisma.project.findMany({
        where: {
          teamId,
          status: 'running',
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
          } catch (error) {
            // Continue even if stop fails (container might not exist)
            console.log(
              `Failed to stop container ${runningProject.containerId}:`,
              error,
            );
          }
        }
      }

      // Stop and remove existing container with the same name if it exists
      const containerName = normalizeContainerName(team.name);
      
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
      // Get the image hash after build
      const builtImage = docker.getImage(imageName);
      const imageInfo = await builtImage.inspect();
      const imageHash = imageInfo.Id; // This is the full image ID (sha256:...)

      // Store build logs and image hash in database
      await prisma.project.update({
        where: { id: project.id },
        data: {
          buildLogs: buildLogsToStore.join(''),
          imageHash,
        },
      });

      // Run the container
      // Use imageHash directly - Docker accepts image IDs
      const containerConfig: unknown = {
        Image: imageHash,
        name: normalizeContainerName(team.name),
        Env: envVars ? Object.entries(envVars).map(([key, value]) => `${key}=${value}`) : undefined,
        HostConfig: {
          AutoRemove: false,
          NetworkMode: PROJECTS_NETWORK,
          Memory: 800 * 1024 * 1024, // 800MB
          Binds: dataFilePath
            ? [`${getHostDataFilePath(dataFilePath)}:${getContainerDataFilePath(dataFilePath, originalFileName)}:ro`]
            : undefined,
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [PROJECTS_NETWORK]: {
              Aliases: [normalizeContainerName(team.name)],
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
      imageHash: project.imageHash,
      status: project.status,
    },
    initBuild,
    completeBuild,
  };
};

/**
 * Tag the preferred project for all teams in a course offering.
 * Tags the newest running project if available, otherwise the most recent project regardless of status.
 * Updates the project's tag field in the database and adds tag to course offering settings.
 */
export const tagCourseOfferingProjects = async (
  courseOfferingId: number,
  tag: string,
) => {
  // Get course offering to check settings
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: courseOfferingId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Get current settings
  const settings = (courseOffering.settings as Record<string, unknown>) || {};
  const tags = Array.isArray(settings.project_tags) ? (settings.project_tags as string[]) : [];

  // Check for duplicate tag
  if (tags.includes(tag)) {
    throw new BadRequestError(`Tag "${tag}" already exists for this course offering`);
  }

  // Get all teams for this course offering
  const teams = await prisma.team.findMany({
    where: { courseOfferingId },
  });

  console.log(`[TAG DEBUG] Found ${teams.length} teams for course offering ${courseOfferingId}`);

  let tagged = 0;
  let skipped = 0;
  const errors: Array<{ teamId: number; error: string }> = [];

  for (const team of teams) {
    // Get the preferred project (running if available, otherwise most recent)
    const preferredProject = await getTeamPreferredProject(team.id);
    
    if (!preferredProject) {
      skipped++;
      continue;
    }

    try {
      const imageName = normalizeContainerName(team.name);
      
      // Get the Docker image by hash
      const image = docker.getImage(preferredProject.imageHash);

      // Verify image exists
      try {
        await image.inspect();
      } catch (inspectError) {
        console.warn(`Image ${preferredProject.imageHash} not found for team ${team.id}, skipping Docker tag`);
        skipped++;
        continue;
      }

      // Tag the image with the new tag
      await image.tag({ repo: imageName, tag });
      tagged++;

      // Update the project's tag field in the database
      await prisma.project.update({
        where: { id: preferredProject.id },
        data: {
          tag,
        },
      });
    } catch (error) {
      // Catch any other errors (like database errors)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error processing tag for team ${team.id}:`, errorMessage);
      errors.push({
        teamId: team.id,
        error: errorMessage,
      });
    }
  }

  // Add tag to course offering settings
  const updatedTags = [...tags, tag];
  await prisma.courseOffering.update({
    where: { id: courseOfferingId },
    data: {
      settings: {
        ...settings,
        project_tags: updatedTags,
      },
    },
  });

  return { tagged, skipped, errors };
};

/**
 * Remove a tag from all projects in a course offering.
 * Sets the project's tag field to null for any projects that have the tag.
 * Always removes tag from course offering settings, even if no projects have it.
 */
export const removeTagFromCourseOfferingProjects = async (
  courseOfferingId: number,
  tag: string,
) => {
  // Get course offering to check settings
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: courseOfferingId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Get current settings
  const settings = (courseOffering.settings as Record<string, unknown>) || {};
  const tags = Array.isArray(settings.project_tags) ? (settings.project_tags as string[]) : [];

  // Get all teams for this course offering
  const teams = await prisma.team.findMany({
    where: { courseOfferingId },
    include: {
      projects: {
        orderBy: { deployedAt: 'desc' },
      },
    },
  });

  // Filter projects that have the specified tag
  const projectsWithTag: Array<{
    id: number;
    teamId: number;
    imageHash: string;
  }> = [];
  for (const team of teams) {
    for (const project of team.projects) {
      // Use type assertion to access tag field (TypeScript cache issue)
      const projectTag = project.tag;
      if (projectTag === tag) {
        projectsWithTag.push({
          id: project.id,
          teamId: team.id,
          imageHash: project.imageHash,
        });
      }
    }
  }

  let untagged = 0;
  const errors: Array<{ teamId: number; error: string }> = [];

  // Untag projects if any have this tag
  for (const project of projectsWithTag) {
    try {
      // Update the project's tag to null
      // The imageHash stays the same
      await prisma.project.update({
        where: { id: project.id },
        data: {
          tag: null,
        },
      });

      untagged++;
    } catch (error) {
      errors.push({
        teamId: project.teamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Always update settings to ensure tag is removed
  // Filter out the tag even if it doesn't exist (idempotent operation)
  const updatedTags = tags.filter((t) => t !== tag);
  await prisma.courseOffering.update({
    where: { id: courseOfferingId },
    data: {
      settings: {
        ...settings,
        project_tags: updatedTags,
      },
    },
  });

  return { untagged, errors };
};

/**
 * Deploy a project using an existing project entry's configuration.
 * This reuses the stored image, build args, and data file without rebuilding.
 * Useful for redeploying tagged projects.
 */
export const deployFromProject = async (
  sourceProjectId: number,
  deployedById: number,
) => {
  // Get the source project
  const sourceProject = await prisma.project.findUnique({
    where: { id: sourceProjectId },
    include: {
      team: {
        include: {
          CourseOffering: true,
        },
      },
    },
  });

  if (!sourceProject) {
    throw new NotFoundError('Project not found');
  }

  // Verify the image exists
  try {
    const image = docker.getImage(sourceProject.imageHash);
    await image.inspect();
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw new NotFoundError('Docker image not found. The project may need to be rebuilt.');
    }
    throw error;
  }

  // Check if course offering is locked
  const settings = (sourceProject.team.CourseOffering.settings as Record<string, unknown>) || {};
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    // Check if user is admin or instructor
    const isInstructor = await checkInstructorAccess(deployedById, sourceProject.team.CourseOffering.id);
    
    // Check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isInstructor) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  // Verify data file exists if specified
  if (sourceProject.dataFile && !fs.existsSync(sourceProject.dataFile)) {
    throw new NotFoundError('Data file not found. The file may have been deleted.');
  }

  // Create a new project record
  const newProject = await prisma.project.create({
    data: {
      teamId: sourceProject.teamId,
      githubUrl: sourceProject.githubUrl,
      imageHash: sourceProject.imageHash,
      tag: sourceProject.tag,
      status: 'deploying',
      buildArgs: sourceProject.buildArgs || {},
      dataFile: sourceProject.dataFile,
      originalDataFileName: sourceProject.originalDataFileName,
      buildLogs: sourceProject.buildLogs,
      deployedById,
      envVars: sourceProject.envVars || {},
    },
  });

  try {
    // Find and stop any running projects for this team
    const runningProjects = await prisma.project.findMany({
      where: {
        teamId: sourceProject.teamId,
        status: 'running',
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
          console.log(`Stopped running container for project ${runningProject.id}`);
        } catch (error) {
          console.log(
            `Failed to stop container ${runningProject.containerId}:`,
            error,
          );
        }
      }
    }

    // Stop and remove existing container with the same name if it exists
    const containerName = normalizeContainerName(sourceProject.team.name);
    
    try {
      const existingContainer = docker.getContainer(containerName);
      await existingContainer.stop();
      console.log(`Stopped existing container: ${containerName}`);
    } catch (stopError) {
      console.log(`Failed to stop container ${containerName}:`, stopError);
    }

    try {
      const existingContainer = docker.getContainer(containerName);
      await existingContainer.remove();
      console.log(`Removed existing container: ${containerName}`);
    } catch (removeError) {
      console.log(`Failed to remove container ${containerName}:`, removeError);
    }

    // Ensure the projects network exists
    await ensureProjectsNetwork();

    // Run the container with the same configuration
    const envVars = (sourceProject.envVars as Record<string, string>) || {};
    const containerConfig: unknown = {
      Image: sourceProject.imageHash,
      name: containerName,
      Env: Object.keys(envVars).length > 0 ? Object.entries(envVars).map(([key, value]) => `${key}=${value}`) : undefined,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: PROJECTS_NETWORK,
        Memory: 800 * 1024 * 1024, // 800MB
        Binds: sourceProject.dataFile
          ? [`${getHostDataFilePath(sourceProject.dataFile)}:${getContainerDataFilePath(sourceProject.dataFile, sourceProject.originalDataFileName || undefined)}:ro`]
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

    const container = await docker.createContainer(containerConfig!);
    await container.start();

    // Get container info
    const containerInfo = await container.inspect();

    // Update project with container information
    const updatedProject = await prisma.project.update({
      where: { id: newProject.id },
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
      imageHash: sourceProject.imageHash,
      containerId: container.id,
      containerName: containerInfo.Name,
      ports: containerInfo.NetworkSettings.Ports,
      state: containerInfo.State,
    };
  } catch (error) {
    // Update project status to failed
    await prisma.project.update({
      where: { id: newProject.id },
      data: { status: 'failed' },
    });
    throw error;
  }
};
