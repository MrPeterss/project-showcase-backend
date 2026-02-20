import type { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { cleanupCourseOfferingContainers } from '../projects/containerService.js';

/**
 * Delete a course offering and clean up all associated resources.
 * Stops and removes Docker containers, deletes projects, teams, team memberships, and enrollments.
 * 
 * @param offeringId - The ID of the course offering to delete
 */
export const deleteCourseOfferingWithCleanup = async (offeringId: number) => {
  // Stop and remove Docker containers for all projects using container service
  await cleanupCourseOfferingContainers(offeringId);

  // Delete all projects for all teams in this course offering
  await prisma.project.deleteMany({
    where: {
      team: {
        courseOfferingId: offeringId,
      },
    },
  });

  // Delete all team memberships for teams in this course offering
  await prisma.teamMembership.deleteMany({
    where: {
      team: {
        courseOfferingId: offeringId,
      },
    },
  });

  // Delete all teams in this course offering
  await prisma.team.deleteMany({
    where: { courseOfferingId: offeringId },
  });

  // Delete all enrollments in this course offering
  await prisma.courseOfferingEnrollment.deleteMany({
    where: { courseOfferingId: offeringId },
  });

  // Finally, delete the course offering itself
  await prisma.courseOffering.delete({
    where: { id: offeringId },
  });
};

/**
 * Update course offering settings and process any side effects.
 * 
 * @param offeringId - The ID of the course offering
 * @param newSettings - The new settings object
 * @param userId - The ID of the user making the update
 * @param isAdmin - Whether the user is an admin
 * @returns The updated course offering
 */
export const updateCourseOfferingSettings = async (
  offeringId: number,
  newSettings: Record<string, unknown>,
  userId: number,
  isAdmin: boolean,
) => {
  const { processCourseOfferingSettings } = await import('./courseOfferingSettings.js');
  
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    return null;
  }

  const oldSettings = (courseOffering.settings as Record<string, unknown>) || {};

  // Process settings changes (handles viewer enrollments, etc.)
  await processCourseOfferingSettings(
    offeringId,
    oldSettings,
    newSettings,
    userId,
    isAdmin,
  );

  // Update the course offering with new settings
  const updatedOffering = await prisma.courseOffering.update({
    where: { id: offeringId },
    data: { settings: newSettings as Prisma.InputJsonValue },
    include: {
      course: true,
      semester: true,
    },
  });

  return updatedOffering;
};

/**
 * Lock a course offering server (prevent new deployments).
 * 
 * @param offeringId - The ID of the course offering
 * @returns The updated course offering
 */
export const lockCourseOfferingServer = async (offeringId: number) => {
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    return null;
  }

  const oldSettings = (courseOffering.settings as Record<string, unknown>) || {};
  const newSettings = {
    ...oldSettings,
    serverLocked: true,
  };

  const updatedOffering = await prisma.courseOffering.update({
    where: { id: offeringId },
    data: { settings: newSettings as Prisma.InputJsonValue },
    include: {
      course: true,
      semester: true,
    },
  });

  return updatedOffering;
};

/**
 * Unlock a course offering server (allow new deployments).
 * 
 * @param offeringId - The ID of the course offering
 * @returns The updated course offering
 */
export const unlockCourseOfferingServer = async (offeringId: number) => {
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    return null;
  }

  const oldSettings = (courseOffering.settings as Record<string, unknown>) || {};
  const newSettings = {
    ...oldSettings,
    serverLocked: false,
  };

  const updatedOffering = await prisma.courseOffering.update({
    where: { id: offeringId },
    data: { settings: newSettings as Prisma.InputJsonValue },
    include: {
      course: true,
      semester: true,
    },
  });

  return updatedOffering;
};
