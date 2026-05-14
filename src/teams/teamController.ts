import type { Request, Response } from 'express';

import { EnvironmentScope } from '@prisma/client';
import { prisma } from '../prisma.js';
import { getTeamPreferredProject } from '../utils/projectUtils.js';
import {
  checkCourseOfferingAccess,
  checkInstructorAccess,
} from '../utils/authorizationHelpers.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';
import {
  createTeamWithMembers,
  updateTeamWithMembers,
  deleteTeamWithCleanup,
  addMembersToTeam,
  removeMemberFromTeam,
} from './teamService.js';

/** Formats member for API response: omits teamId, redacts user name/email unless canSeeNames */
const formatMember = <M extends { userId: number; user: { id: number } }>(
  m: M,
  canSeeNames: boolean,
): { userId: number; user: M['user'] | { id: number } } => ({
  userId: m.userId,
  user: canSeeNames ? m.user : { id: m.user.id },
});

// Helper function to get the appropriate project for a team
// Returns the newest running project if available, otherwise the newest project regardless of status
const getTeamProject = async (teamId: number) => {
  return await getTeamPreferredProject(teamId, {
    id: true,
    alias: true,
    githubUrl: true,
    imageHash: true,
    containerId: true,
    containerName: true,
    status: true,
    ports: true,
    deployedAt: true,
    stoppedAt: true,
    deployedBy: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  });
};

// GET /course-offerings/:offeringId/teams
export const getCourseOfferingTeams = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check if user has access to this course offering
  if (!isAdmin) {
    const hasAccess = await checkCourseOfferingAccess(userId, offeringId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this course offering');
    }
  }

  const teams = await prisma.team.findMany({
    where: { courseOfferingId: offeringId },
    include: {
      members: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const teamsWithProjects = await Promise.all(
    teams.map(async (team) => {
      const project = await getTeamPreferredProject(team.id, {
        deployedAt: true,
        status: true,
        githubUrl: true,
        containerName: true,
      });
      return {
        ...team,
        members: team.members.map((m) => formatMember(m, isAdmin)),
        projects: project
          ? [
              {
                deployedAt: project.deployedAt,
                status: project.status,
                githubUrl: project.githubUrl,
                containerName: project.containerName,
              },
            ]
          : [],
      };
    }),
  );

  return res.json(teamsWithProjects);
};

// GET /teams/:teamId
export const getTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: {
          userId: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      CourseOffering: true,
      environments: true,
    },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Access: admins, instructors of the course offering, or team members only
  const isTeamMember = team.members.some((m) => m.userId === userId);
  let isInstructor = false;
  if (!isAdmin) {
    const instructorAccess = await checkInstructorAccess(
      userId,
      team.courseOfferingId,
    );
    isInstructor = !!instructorAccess;
    if (!isInstructor && !isTeamMember) {
      throw new ForbiddenError('Access denied to this team');
    }
  } else {
    isInstructor = true; // admins have instructor-level visibility
  }

  const canSeeMemberNames = isAdmin || isTeamMember;
  const members = team.members.map((m) => formatMember(m, canSeeMemberNames));

  // Map environments: omit PRODUCTION keyValue unless admin or instructor
  const canSeeProductionValues = isAdmin || isInstructor;
  const environments = (team.environments ?? []).map((env) => {
    const shouldOmitValue =
      env.scope === EnvironmentScope.PRODUCTION && !canSeeProductionValues;
    return {
      id: env.id,
      teamId: env.teamId,
      keyName: env.keyName,
      keyValue: shouldOmitValue ? undefined : env.keyValue,
      scope: env.scope,
      isSecret: env.isSecret,
    };
  });

  // Get the appropriate project for this team
  const project = await getTeamProject(teamId);

  const projectTagLinks = await prisma.projectOfferingTag.findMany({
    where: {
      project: { teamId },
    },
    include: {
      offeringTag: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const seenTags = new Set<string>();
  const orderedTags: string[] = [];
  for (const link of projectTagLinks) {
    const name = link.offeringTag.name;
    if (!seenTags.has(name)) {
      seenTags.add(name);
      orderedTags.push(name);
    }
  }

  const { environments: _envs, members: _members, ...teamWithoutEnvs } = team;
  return res.json({
    ...teamWithoutEnvs,
    members,
    environments,
    projects: project ? [project] : [],
    tags: orderedTags,
  });
};

// POST /course-offerings/:offeringId/teams
export const createTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);
  const { name, memberEmails } = req.body;

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check permissions - admin or instructor of the offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(userId, offeringId);
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can create teams');
    }
  }

  // Create team using service (handles name validation, user creation, enrollment)
  const team = await createTeamWithMembers(name, offeringId, memberEmails);

  return res.status(201).json(team);
};

// PUT /teams/:teamId
export const updateTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);
  const { name, memberEmails, hallOfFame } = req.body;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check permissions - admin or instructor of the course offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(
      userId,
      team.courseOfferingId,
    );
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can update teams');
    }
  }

  // Update team using service (handles name validation, user creation, enrollment)
  const updatedTeam = await updateTeamWithMembers(teamId, name, memberEmails, hallOfFame);

  return res.json(updatedTeam);
};

// DELETE /teams/:teamId
export const deleteTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check permissions - admin or instructor of the course offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(
      userId,
      team.courseOfferingId,
    );
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can delete teams');
    }
  }

  // Delete team using service (handles container cleanup, project deletion, etc.)
  await deleteTeamWithCleanup(teamId);

  return res.status(204).send();
};

// POST /teams/:teamId/members
export const addTeamMembers = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);
  const { memberEmails } = req.body;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check permissions - admin or instructor of the course offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(
      userId,
      team.courseOfferingId,
    );
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can add team members');
    }
  }

  // Add members using service (handles user creation, enrollment, duplicate checking)
  const updatedTeam = await addMembersToTeam(teamId, memberEmails);

  return res.json(updatedTeam);
};

// DELETE /teams/:teamId/members/:userId
export const removeTeamMember = async (req: Request, res: Response) => {
  const { userId: currentUserId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);
  const targetUserId = parseInt(req.params.userId, 10);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check permissions - admin or instructor of the course offering
  if (!isAdmin) {
    const isInstructor = await checkInstructorAccess(
      currentUserId,
      team.courseOfferingId,
    );
    if (!isInstructor) {
      throw new ForbiddenError('Only instructors can remove team members');
    }
  }

  // Check if user is actually a member of the team
  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: {
        userId: targetUserId,
        teamId,
      },
    },
  });

  if (!membership) {
    throw new NotFoundError('User is not a member of this team');
  }

  // Remove member using service
  await removeMemberFromTeam(teamId, targetUserId);

  return res.status(204).send();
};

// GET /course-offerings/:offeringId/teams/me
export const getMyTeamsInOffering = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const offeringId = parseInt(req.params.offeringId, 10);

  // Check if course offering exists
  const courseOffering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
  });

  if (!courseOffering) {
    throw new NotFoundError('Course offering not found');
  }

  // Check if user has access to this course offering
  if (!isAdmin) {
    const hasAccess = await checkCourseOfferingAccess(userId, offeringId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this course offering');
    }
  }

  // Get teams the user is a member of in this specific course offering
  const teamMemberships = await prisma.teamMembership.findMany({
    where: {
      userId,
      team: {
        courseOfferingId: offeringId,
      },
    },
    include: {
      team: {
        include: {
          members: {
            select: {
              userId: true,
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  // Get the appropriate project for each team
  const teams = await Promise.all(
    teamMemberships.map(async (membership) => {
      const project = await getTeamProject(membership.team.id);
      const members = membership.team.members.map((m) =>
        formatMember(m, isAdmin),
      );
      const { members: _m, ...teamWithoutMembers } = membership.team;
      return {
        ...teamWithoutMembers,
        members,
        projects: project ? [project] : [],
      };
    }),
  );

  return res.json(teams);
};
