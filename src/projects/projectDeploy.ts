import * as fs from 'fs';
import * as path from 'path';

import { PROJECT_STATUS } from '../constants/projectStatus.js';
import { docker } from '../docker.js';
import { simpleGit } from '../git.js';
import { prisma } from '../prisma.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';
import { checkTeachingStaffAccess } from '../utils/authorizationHelpers.js';
import { parseStoredCourseOfferingSettings } from '../courseOfferings/courseOfferingSettingsSchema.js';
import { dockerDeploymentSlugForTeam } from '../utils/teamAlias.js';
import { resolveDockerBuildArgs } from './projectContainerEnv.js';
import { ensureProjectsNetwork, runProjectContainer } from './projectDockerOps.js';

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
export const deploy = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
  buildArgs?: Record<string, string>,
  dataFilePath?: string,
  originalFileName?: string,
  extraEnvVars?: Record<string, string>,
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
  const settings = parseStoredCourseOfferingSettings(team.CourseOffering.settings);
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    const isTeachingStaff = await checkTeachingStaffAccess(
      deployedById,
      team.CourseOffering.id,
    );

    // If not admin and not teaching staff, block deployment
    // Note: We don't have isAdmin flag here, so we need to check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isTeachingStaff) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);

  const mergedBuildArgs = await resolveDockerBuildArgs(teamId, buildArgs, extraEnvVars);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: PROJECT_STATUS.BUILDING,
      deployedById,
      buildArgs: mergedBuildArgs,
      dataFile: dataFilePath || null,
      originalDataFileName: originalFileName || null,
      extraEnvVars: extraEnvVars || {},
    },
  });

  try {
    // Shallow clone — only the tip commit needed.
    await simpleGit().clone(githubUrl, tempDir, ['--depth', '1']);

    // Exclude .git from the Docker build context
    const dockerIgnorePath = path.join(tempDir, '.dockerignore');
    if (!fs.existsSync(dockerIgnorePath)) {
      fs.writeFileSync(dockerIgnorePath, '.git\n');
    } else {
      const existing = fs.readFileSync(dockerIgnorePath, 'utf-8');
      if (!existing.split('\n').some((line) => line.trim() === '.git')) {
        fs.appendFileSync(dockerIgnorePath, '\n.git\n');
      }
    }

    // Build the image (slug from team alias when present, else normalized name)
    const imageSlug = dockerDeploymentSlugForTeam(team);
    const imageName = `${imageSlug}:latest`;
    const buildOptions: Record<string, unknown> = {
      t: imageName,
    };
    
    // Add build args
    if (Object.keys(mergedBuildArgs).length > 0) {
      buildOptions.buildargs = mergedBuildArgs;
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

    const containerSlug = dockerDeploymentSlugForTeam(team);
    const updatedProject = await runProjectContainer({
      teamId,
      projectId: project.id,
      imageHash,
      containerName: containerSlug,
      projectAlias: containerSlug,
      extraEnvVars,
      dataFile: dataFilePath,
      originalDataFileName: originalFileName,
    });

    const containerInfo = await docker.getContainer(updatedProject.containerId!).inspect();
    return {
      success: true,
      project: updatedProject,
      imageHash,
      containerId: updatedProject.containerId,
      containerName: updatedProject.containerName,
      ports: containerInfo.NetworkSettings.Ports,
      state: containerInfo.State,
    };
  } catch (error) {
    // Update project status to failed
    await prisma.project.update({
      where: { id: project.id },
      data: { status: PROJECT_STATUS.FAILED },
    });
    throw error;
  } finally {
    // Clean up the temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};
export const deployWithStreaming = async (
  teamId: number,
  githubUrl: string,
  deployedById: number,
  buildArgs?: Record<string, string>,
  dataFilePath?: string,
  originalFileName?: string,
  extraEnvVars?: Record<string, string>,
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
  const settings = parseStoredCourseOfferingSettings(team.CourseOffering.settings);
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    const isTeachingStaff = await checkTeachingStaffAccess(
      deployedById,
      team.CourseOffering.id,
    );

    // Check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isTeachingStaff) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);
  const deploySlug = dockerDeploymentSlugForTeam(team);
  const imageName = `${deploySlug}:latest`;

  const mergedBuildArgs = await resolveDockerBuildArgs(teamId, buildArgs, extraEnvVars);

  // Create initial project record
  const project = await prisma.project.create({
    data: {
      teamId,
      githubUrl,
      imageHash: '', // Will be set after build
      status: PROJECT_STATUS.BUILDING,
      deployedById,
      buildArgs: mergedBuildArgs,
      dataFile: dataFilePath || null,
      originalDataFileName: originalFileName || null,
      extraEnvVars: extraEnvVars || {},
    },
  });

  // onProgress receives plain log-line strings forwarded to the SSE stream
  // before Docker build events start arriving.
  const initBuild = async (onProgress?: (msg: string) => void) => {
    try {
      // Find and stop any running projects for this team
      onProgress?.('[build] Stopping existing containers...\n');
      const runningProjects = await prisma.project.findMany({
        where: {
          teamId,
          status: PROJECT_STATUS.RUNNING,
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
                status: PROJECT_STATUS.STOPPED,
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
      const containerName = deploySlug;
      
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

      // Shallow clone with real-time progress forwarded to the SSE stream.
      onProgress?.(`[build] Cloning ${githubUrl} (depth=1)...\n`);
      const gitInstance = simpleGit({
        progress: ({ method, stage, progress }) => {
          if (stage) {
            onProgress?.(`[git] ${method} | ${stage}: ${progress}%\n`);
          }
        },
      });
      await gitInstance.clone(githubUrl, tempDir, ['--depth', '1']);
      onProgress?.('[build] Clone complete.\n');

      // Ensure .git is excluded from the Docker build context so the daemon
      // never has to hash it when computing COPY layer cache keys.
      const dockerIgnorePath = path.join(tempDir, '.dockerignore');
      if (!fs.existsSync(dockerIgnorePath)) {
        fs.writeFileSync(dockerIgnorePath, '.git\n');
      } else {
        const existing = fs.readFileSync(dockerIgnorePath, 'utf-8');
        if (!existing.split('\n').some((line) => line.trim() === '.git')) {
          fs.appendFileSync(dockerIgnorePath, '\n.git\n');
        }
      }

      // Build the image and get the stream
      onProgress?.('[build] Sending build context to Docker daemon...\n');
      const buildOptions: Record<string, unknown> = {
        t: imageName,
      };

      if (Object.keys(mergedBuildArgs).length > 0) {
        buildOptions.buildargs = mergedBuildArgs;
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
        data: { status: PROJECT_STATUS.FAILED },
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

      const containerSlug = deploySlug;
      const updatedProject = await runProjectContainer({
        teamId,
        projectId: project.id,
        imageHash,
        containerName: containerSlug,
        projectAlias: containerSlug,
        extraEnvVars,
        dataFile: dataFilePath,
        originalDataFileName: originalFileName,
      });

      return updatedProject;
    } catch (error) {
      // Update project status to failed
      await prisma.project.update({
        where: { id: project.id },
        data: { status: PROJECT_STATUS.FAILED },
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
  const settings = parseStoredCourseOfferingSettings(sourceProject.team.CourseOffering.settings);
  const serverLocked = settings.serverLocked === true;

  if (serverLocked) {
    const isTeachingStaff = await checkTeachingStaffAccess(
      deployedById,
      sourceProject.team.CourseOffering.id,
    );

    // Check user's admin status
    const user = await prisma.user.findUnique({
      where: { id: deployedById },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin && !isTeachingStaff) {
      throw new ForbiddenError('Deployments are locked for this course offering');
    }
  }

  // Verify data file exists if specified
  if (sourceProject.dataFile && !fs.existsSync(sourceProject.dataFile)) {
    throw new NotFoundError('Data file not found. The file may have been deleted.');
  }

  const sourceTagLinks = await prisma.projectOfferingTag.findMany({
    where: { projectId: sourceProjectId },
    select: { offeringTagId: true },
  });

  // Create a new project record
  const newProject = await prisma.project.create({
    data: {
      teamId: sourceProject.teamId,
      githubUrl: sourceProject.githubUrl,
      imageHash: sourceProject.imageHash,
      tag: sourceProject.tag,
      status: PROJECT_STATUS.DEPLOYING,
      buildArgs: sourceProject.buildArgs || {},
      dataFile: sourceProject.dataFile,
      originalDataFileName: sourceProject.originalDataFileName,
      buildLogs: sourceProject.buildLogs,
      deployedById,
      extraEnvVars: (sourceProject.extraEnvVars as Record<string, string>) || {},
    },
  });

  if (sourceTagLinks.length > 0) {
    await prisma.projectOfferingTag.createMany({
      data: sourceTagLinks.map((l) => ({
        projectId: newProject.id,
        offeringTagId: l.offeringTagId,
      })),
    });
  }

  try {
    const extraEnvVars = (sourceProject.extraEnvVars as Record<string, string>) || {};
    const containerSlug = dockerDeploymentSlugForTeam(sourceProject.team);

    const updatedProject = await runProjectContainer({
      teamId: sourceProject.teamId,
      projectId: newProject.id,
      imageHash: sourceProject.imageHash,
      containerName: containerSlug,
      projectAlias: containerSlug,
      extraEnvVars,
      dataFile: sourceProject.dataFile,
      originalDataFileName: sourceProject.originalDataFileName,
    });

    return {
      success: true,
      project: updatedProject,
      imageHash: sourceProject.imageHash,
      containerId: updatedProject.containerId ?? undefined,
      containerName: updatedProject.containerName ?? undefined,
      ports: updatedProject.ports,
      state: updatedProject.containerId
        ? (await docker.getContainer(updatedProject.containerId).inspect()).State
        : undefined,
    };
  } catch (error) {
    // Update project status to failed
    await prisma.project.update({
      where: { id: newProject.id },
      data: { status: PROJECT_STATUS.FAILED },
    });
    throw error;
  }
};
