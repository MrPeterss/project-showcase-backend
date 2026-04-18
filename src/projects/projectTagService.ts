import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import { getTeamPreferredProject } from '../utils/projectUtils.js';

/**
 * Normalize container name: lowercase and replace spaces with dashes
 */
const normalizeContainerName = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

/**
 * Sync legacy Project.tag to a single string for compatibility (most recent link wins by createdAt).
 */
const syncLegacyProjectTag = async (projectId: number) => {
  const links = await prisma.projectOfferingTag.findMany({
    where: { projectId },
    include: { offeringTag: true },
    orderBy: { createdAt: 'desc' },
  });
  const legacy =
    links.length > 0 ? links[0]!.offeringTag.name : null;
  await prisma.project.update({
    where: { id: projectId },
    data: { tag: legacy },
  });
};

/**
 * Tag all preferred projects in a course offering with a specific tag.
 * Tags the Docker images, creates/links OfferingTag rows, and appends ProjectOfferingTag links.
 *
 * @param courseOfferingId - The ID of the course offering
 * @param tag - The tag to apply
 * @returns Statistics about the tagging operation
 */
export const tagCourseOfferingProjects = async (
  courseOfferingId: number,
  tag: string,
) => {
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: courseOfferingId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  const settings = (courseOffering.settings as Record<string, unknown>) || {};
  const tags = Array.isArray(settings.project_tags)
    ? (settings.project_tags as string[])
    : [];

  const existingOfferingTag = await prisma.offeringTag.findUnique({
    where: {
      courseOfferingId_name: {
        courseOfferingId,
        name: tag,
      },
    },
  });

  if (existingOfferingTag) {
    throw new BadRequestError(
      `Tag "${tag}" already exists for this course offering`,
    );
  }

  const offeringTag = await prisma.offeringTag.create({
    data: {
      courseOfferingId,
      name: tag,
    },
  });

  const teams = await prisma.team.findMany({
    where: { courseOfferingId },
  });

  console.log(
    `[TAG DEBUG] Found ${teams.length} teams for course offering ${courseOfferingId}`,
  );

  let tagged = 0;
  let skipped = 0;
  const errors: Array<{ teamId: number; error: string }> = [];

  for (const team of teams) {
    const preferredProject = await getTeamPreferredProject(team.id);

    if (!preferredProject) {
      skipped++;
      continue;
    }

    try {
      const imageName = normalizeContainerName(team.name);
      const image = docker.getImage(preferredProject.imageHash);

      try {
        await image.inspect();
      } catch {
        console.warn(
          `Image ${preferredProject.imageHash} not found for team ${team.id}, skipping Docker tag`,
        );
        skipped++;
        continue;
      }

      await image.tag({ repo: imageName, tag });
      tagged++;

      await prisma.projectOfferingTag.create({
        data: {
          projectId: preferredProject.id,
          offeringTagId: offeringTag.id,
        },
      });

      await prisma.project.update({
        where: { id: preferredProject.id },
        data: { tag },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error processing tag for team ${team.id}:`, errorMessage);
      errors.push({
        teamId: team.id,
        error: errorMessage,
      });
    }
  }

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
 * Deletes ProjectOfferingTag rows and the OfferingTag; clears legacy Project.tag where needed.
 * Always removes tag from course offering settings.
 */
export const removeTagFromCourseOfferingProjects = async (
  courseOfferingId: number,
  tag: string,
) => {
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: courseOfferingId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  const settings = (courseOffering.settings as Record<string, unknown>) || {};
  const tags = Array.isArray(settings.project_tags)
    ? (settings.project_tags as string[])
    : [];

  const offeringTag = await prisma.offeringTag.findUnique({
    where: {
      courseOfferingId_name: {
        courseOfferingId,
        name: tag,
      },
    },
  });

  let untagged = 0;

  if (offeringTag) {
    const affectedLinks = await prisma.projectOfferingTag.findMany({
      where: { offeringTagId: offeringTag.id },
      select: { projectId: true },
    });
    const affectedProjectIds = [
      ...new Set(affectedLinks.map((l) => l.projectId)),
    ];

    await prisma.offeringTag.delete({
      where: { id: offeringTag.id },
    });
    untagged = affectedProjectIds.length;

    for (const projectId of affectedProjectIds) {
      try {
        await syncLegacyProjectTag(projectId);
      } catch (error) {
        console.error(
          `Failed to sync legacy tag for project ${projectId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

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

  return { untagged, errors: [] as Array<{ teamId: number; error: string }> };
};
