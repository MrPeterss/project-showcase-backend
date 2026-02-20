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
 * Tag all preferred projects in a course offering with a specific tag.
 * Tags the Docker images and updates the database.
 * 
 * @param courseOfferingId - The ID of the course offering
 * @param tag - The tag to apply
 * @returns Statistics about the tagging operation
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
 * 
 * @param courseOfferingId - The ID of the course offering
 * @param tag - The tag to remove
 * @returns Statistics about the untagging operation
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
