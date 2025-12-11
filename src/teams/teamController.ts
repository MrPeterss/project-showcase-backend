import type { Request, Response } from 'express';

import { COURSE_OFFERING_ROLES } from '../constants/roles.js';
import { docker } from '../docker.js';
import { prisma } from '../prisma.js';
import { getTeamPreferredProject } from '../utils/projectUtils.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/AppError.js';

// Helper function to get enrollment with highest access level
// Role hierarchy: INSTRUCTOR > STUDENT > VIEWER
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

// Helper function to check if user has access to course offering
const checkCourseOfferingAccess = async (
  userId: number,
  offeringId: number,
  requiredRoles?: string[],
) => {
  const enrollment = await getHighestAccessEnrollment(userId, offeringId);

  if (!enrollment) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(enrollment.role)) {
    return null;
  }

  return enrollment;
};

// Helper function to check if user is instructor of course offering
const checkInstructorAccess = async (userId: number, offeringId: number) => {
  return await checkCourseOfferingAccess(userId, offeringId, [
    COURSE_OFFERING_ROLES.INSTRUCTOR,
  ]);
};

// Helper function to check if a team name already exists (case-insensitive)
const checkTeamNameExists = async (
  teamName: string,
  excludeTeamId?: number,
): Promise<boolean> => {
  const allTeams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  // Check for case-insensitive match
  const normalizedName = teamName.toLowerCase().trim();
  
  return allTeams.some((team) => {
    // Skip the team we're updating (if excludeTeamId is provided)
    if (excludeTeamId && team.id === excludeTeamId) {
      return false;
    }
    return team.name.toLowerCase().trim() === normalizedName;
  });
};

// Helper function to get the appropriate project for a team
// Returns the newest running project if available, otherwise the newest project regardless of status
const getTeamProject = async (teamId: number) => {
  return await getTeamPreferredProject(teamId, {
    id: true,
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
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  // Get the appropriate project for each team
  const teamsWithProjects = await Promise.all(
    teams.map(async (team) => {
      const project = await getTeamProject(team.id);
      return {
        ...team,
        projects: project ? [project] : [],
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
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      CourseOffering: true,
    },
  });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if user has access to the course offering this team belongs to
  if (!isAdmin) {
    const hasAccess = await checkCourseOfferingAccess(
      userId,
      team.courseOfferingId,
    );
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this team');
    }
  }

  // Get the appropriate project for this team
  const project = await getTeamProject(teamId);

  // Get all projects with tags for this team to build the tags list
  const projectsWithTags = await prisma.project.findMany({
    where: {
      teamId,
      tag: { not: null },
    },
    orderBy: { deployedAt: 'desc' },
    select: {
      tag: true,
      deployedAt: true,
    },
  });

  // Extract unique tags in order (most recent first)
  const seenTags = new Set<string>();
  const orderedTags: string[] = [];
  
  for (const projectWithTag of projectsWithTags) {
    if (projectWithTag.tag && !seenTags.has(projectWithTag.tag)) {
      seenTags.add(projectWithTag.tag);
      orderedTags.push(projectWithTag.tag);
    }
  }

  return res.json({
    ...team,
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

  // Check if team name already exists (case-insensitive)
  const teamNameExists = await checkTeamNameExists(name);
  
  if (teamNameExists) {
    throw new ConflictError('Team name already exists');
  }

  // Process member emails - create users if they don't exist and enroll them
  const memberUserIds = [];
  for (const email of memberEmails) {
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
    let enrollment = await getHighestAccessEnrollment(user.id, offeringId);

    // If not enrolled, enroll as STUDENT
    if (!enrollment) {
      enrollment = await prisma.courseOfferingEnrollment.create({
        data: {
          userId: user.id,
          courseOfferingId: offeringId,
          role: COURSE_OFFERING_ROLES.STUDENT,
        },
      });
    }

    memberUserIds.push(user.id);
  }

  // Create team
  const team = await prisma.team.create({
    data: {
      name,
      courseOfferingId: offeringId,
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

  return res.status(201).json(team);
};

// PUT /teams/:teamId
export const updateTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);
  const { name, memberEmails } = req.body;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: true,
    },
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
    memberUserIds = [];
    for (const email of memberEmails) {
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
      let enrollment = await getHighestAccessEnrollment(user.id, team.courseOfferingId);

      // If not enrolled, enroll as STUDENT
      if (!enrollment) {
        enrollment = await prisma.courseOfferingEnrollment.create({
          data: {
            userId: user.id,
            courseOfferingId: team.courseOfferingId,
            role: COURSE_OFFERING_ROLES.STUDENT,
          },
        });
      }

      memberUserIds.push(user.id);
    }
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

  return res.json(updatedTeam);
};

// DELETE /teams/:teamId
export const deleteTeam = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      projects: true,
    },
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

  // Stop and remove Docker containers for all projects
  for (const project of team.projects) {
    if (project.containerId) {
      try {
        const container = docker.getContainer(project.containerId);
        try {
          await container.stop();
        } catch (stopError) {
          // Container might already be stopped, continue
          console.log(`Failed to stop container ${project.containerId}:`, stopError);
        }
        try {
          await container.remove();
        } catch (removeError) {
          // Container might already be removed, continue
          console.log(`Failed to remove container ${project.containerId}:`, removeError);
        }
      } catch (error) {
        // Container might not exist, continue with deletion
        console.log(`Container ${project.containerId} not found, continuing deletion`);
      }
    }
  }

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

  return res.status(204).send();
};

// POST /teams/:teamId/members
export const addTeamMembers = async (req: Request, res: Response) => {
  const { userId, isAdmin } = req.user!;
  const teamId = parseInt(req.params.teamId, 10);
  const { memberEmails } = req.body;

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

  // Process member emails
  const newMemberUserIds = [];
  const existingMemberEmails = team.members.map((member) => member.user.email);

  for (const email of memberEmails) {
    // Check if user is already a member
    if (existingMemberEmails.includes(email)) {
      throw new ConflictError(`User ${email} is already a member of this team`);
    }

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
    let enrollment = await prisma.courseOfferingEnrollment.findFirst({
      where: {
        userId: user.id,
        courseOfferingId: team.courseOfferingId,
      },
    });

    // If not enrolled, enroll as STUDENT
    if (!enrollment) {
      enrollment = await prisma.courseOfferingEnrollment.create({
        data: {
          userId: user.id,
          courseOfferingId: team.courseOfferingId,
          role: COURSE_OFFERING_ROLES.STUDENT,
        },
      });
    }

    newMemberUserIds.push(user.id);
  }

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

  await prisma.teamMembership.delete({
    where: {
      userId_teamId: {
        userId: targetUserId,
        teamId,
      },
    },
  });

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
            include: {
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
      return {
        ...membership.team,
        projects: project ? [project] : [],
      };
    }),
  );

  return res.json(teams);
};
