import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { addStudentEnrollment } from '../enrollment/enrollmentService.js';
import { prisma } from '../prisma.js';
import { cleanupTeamContainers } from '../projects/containerService.js';
import { ConflictError } from '../utils/AppError.js';
import { getHighestAccessEnrollment } from '../utils/authorizationHelpers.js';

/**
 * Check if a team name already exists (case-insensitive).
 * 
 * @param teamName - The team name to check
 * @param excludeTeamId - Optional team ID to exclude from the check (for updates)
 * @returns True if the team name exists, false otherwise
 */
export const checkTeamNameExists = async (
  teamName: string,
  excludeTeamId?: number,
): Promise<boolean> => {
  const allTeams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  const normalizedName = teamName.toLowerCase().trim();
  
  return allTeams.some((team) => {
    if (excludeTeamId && team.id === excludeTeamId) {
      return false;
    }
    return team.name.toLowerCase().trim() === normalizedName;
  });
};

/**
 * Ensure users are enrolled in a course offering as students.
 * Creates users if they don't exist, and enrolls them if not already enrolled.
 * 
 * @param emails - Array of email addresses
 * @param courseOfferingId - The ID of the course offering
 * @returns Array of user IDs
 */
export const ensureUsersEnrolled = async (
  emails: string[],
  courseOfferingId: number,
): Promise<number[]> => {
  const userIds: number[] = [];

  for (const email of emails) {
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email },
      });
    }

    // Check if user is enrolled in course offering
    const enrollment = await getHighestAccessEnrollment(user.id, courseOfferingId);

    // If not enrolled, enroll as STUDENT (handles viewer enrollments automatically)
    if (!enrollment) {
      await addStudentEnrollment(
        user.id,
        courseOfferingId,
        COURSE_OFFERING_ROLES.STUDENT,
      );
    }

    userIds.push(user.id);
  }

  return userIds;
};

/**
 * Create a new team with members.
 * Automatically creates users and enrolls them if needed.
 * 
 * @param name - The team name
 * @param courseOfferingId - The ID of the course offering
 * @param memberEmails - Array of member email addresses
 * @returns The created team with members
 */
export const createTeamWithMembers = async (
  name: string,
  courseOfferingId: number,
  memberEmails: string[],
) => {
  // Check if team name already exists (case-insensitive)
  const teamNameExists = await checkTeamNameExists(name);
  
  if (teamNameExists) {
    throw new ConflictError('Team name already exists');
  }

  // Ensure all members are enrolled
  const memberUserIds = await ensureUsersEnrolled(memberEmails, courseOfferingId);

  // Create team
  const team = await prisma.team.create({
    data: {
      name,
      courseOfferingId,
      members: {
        create: memberUserIds.map((userId) => ({
          userId,
        })),
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  return team;
};

/**
 * Update a team's name and/or members.
 * 
 * @param teamId - The ID of the team to update
 * @param name - Optional new team name
 * @param memberEmails - Optional new list of member emails (replaces existing members)
 * @returns The updated team
 */
export const updateTeamWithMembers = async (
  teamId: number,
  name?: string,
  memberEmails?: string[],
) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });

  if (!team) {
    return null;
  }

  // Check if new team name conflicts (case-insensitive, if name is being changed)
  if (name && name.toLowerCase().trim() !== team.name.toLowerCase().trim()) {
    const teamNameExists = await checkTeamNameExists(name, teamId);
    
    if (teamNameExists) {
      throw new ConflictError('Team name already exists');
    }
  }

  // Process member emails if provided
  let memberUserIds: number[] | undefined;
  if (memberEmails) {
    memberUserIds = await ensureUsersEnrolled(memberEmails, team.courseOfferingId);
  }

  // Update team
  const updatedTeam = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(name && { name }),
      ...(memberUserIds && {
        members: {
          deleteMany: {},
          create: memberUserIds.map((userId) => ({
            userId,
          })),
        },
      }),
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  return updatedTeam;
};

/**
 * Delete a team and clean up all associated resources.
 * Stops and removes Docker containers, deletes projects, and removes team memberships.
 * 
 * @param teamId - The ID of the team to delete
 */
export const deleteTeamWithCleanup = async (teamId: number) => {
  // Stop and remove Docker containers for all projects
  await cleanupTeamContainers(teamId);

  // Delete all projects for this team
  await prisma.project.deleteMany({
    where: { teamId },
  });

  // Delete all team memberships for this team
  await prisma.teamMembership.deleteMany({
    where: { teamId },
  });

  // Finally, delete the team
  await prisma.team.delete({
    where: { id: teamId },
  });
};

/**
 * Add members to an existing team.
 * Automatically creates users and enrolls them if needed.
 * 
 * @param teamId - The ID of the team
 * @param memberEmails - Array of email addresses to add
 * @returns The updated team with all members
 */
export const addMembersToTeam = async (
  teamId: number,
  memberEmails: string[],
) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  const existingMemberEmails = team.members.map((member) => member.user.email);

  // Check for duplicates
  for (const email of memberEmails) {
    if (existingMemberEmails.includes(email)) {
      throw new ConflictError(`User ${email} is already a member of this team`);
    }
  }

  // Ensure all new members are enrolled
  const newMemberUserIds = await ensureUsersEnrolled(
    memberEmails,
    team.courseOfferingId,
  );

  // Add new members to team
  await prisma.teamMembership.createMany({
    data: newMemberUserIds.map((userId) => ({
      userId,
      teamId,
    })),
  });

  // Return updated team
  const updatedTeam = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  return updatedTeam;
};

/**
 * Remove a member from a team.
 * 
 * @param teamId - The ID of the team
 * @param userId - The ID of the user to remove
 */
export const removeMemberFromTeam = async (teamId: number, userId: number) => {
  await prisma.teamMembership.delete({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
  });
};
