import { PROJECT_STATUS } from '../constants/projectStatus.js';
import { docker } from '../docker.js';
import { parseStoredCourseOfferingSettings } from '../courseOfferings/courseOfferingSettingsSchema.js';
import { prisma } from '../prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import { checkTeachingStaffAccess } from '../utils/authorizationHelpers.js';

/**
 * Stop a running container and update project status
 * Validates that the user is an admin, teaching staff, or team member
 */
export const stopProject = async (
  projectId: number,
  userId: number,
  isAdmin: boolean,
) => {
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

  const offeringSettings = parseStoredCourseOfferingSettings(
    project.team.CourseOffering.settings,
  );
  const serverLocked =
    (offeringSettings as { serverLocked?: boolean }).serverLocked === true;

  if (!isAdmin) {
    const isTeachingStaff = await checkTeachingStaffAccess(
      userId,
      project.team.CourseOffering.id,
    );
    const isTeamMember = project.team.members.some(
      (membership) => membership.userId === userId,
    );

    if (serverLocked && !isTeachingStaff) {
      throw new ForbiddenError(
        'Project control is locked for this course offering',
      );
    }

    if (!isTeachingStaff && !isTeamMember) {
      throw new ForbiddenError(
        'You must be an admin, instructor, TA, or team member to stop this project',
      );
    }
  }

  try {
    const container = docker.getContainer(project.containerId);

    try {
      await container.kill();
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 304) {
        // ok
      } else {
        console.warn(`Failed to kill container ${project.containerId}:`, error);
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: PROJECT_STATUS.STOPPED,
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
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 304) {
      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: PROJECT_STATUS.STOPPED,
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
