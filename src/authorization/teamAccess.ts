import { prisma } from '../prisma.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';
import { checkTeachingStaffAccess } from '../utils/authorizationHelpers.js';

type MinimalMember = { userId: number };

export async function assertTeamBelongsToOffering(
  teamId: number,
  offeringId: number,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { courseOfferingId: true },
  });
  if (!team) {
    throw new NotFoundError('Team not found');
  }
  if (team.courseOfferingId !== offeringId) {
    throw new ForbiddenError('Team does not belong to this course offering');
  }
}

/**
 * Single rule for team detail/read access: admin, teaching staff of the offering, or team member.
 */
export async function assertTeamReadableByUser(params: {
  userId: number;
  isAdmin: boolean;
  team: {
    courseOfferingId: number;
    members: MinimalMember[];
  };
}): Promise<{ isTeachingStaff: boolean; isTeamMember: boolean }> {
  const { userId, isAdmin, team } = params;
  const isTeamMember = team.members.some((m) => m.userId === userId);

  if (isAdmin) {
    return { isTeachingStaff: true, isTeamMember };
  }

  const staffAccess = await checkTeachingStaffAccess(
    userId,
    team.courseOfferingId,
  );
  const isTeachingStaff = !!staffAccess;

  if (!isTeachingStaff && !isTeamMember) {
    throw new ForbiddenError('Access denied to this team');
  }

  return { isTeachingStaff, isTeamMember };
}
