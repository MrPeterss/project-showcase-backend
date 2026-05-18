import { z } from 'zod';

import {
  offeringIdParam,
  teamIdParam,
  userIdParam,
} from '../schemas/paramCoercions.js';

export const createTeamSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    memberEmails: z.array(z.string().email()).min(1),
  }),
});

export const updateTeamSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    memberEmails: z.array(z.string().email()).optional(),
    hallOfFame: z.boolean().optional(),
  }),
});

export const addTeamMembersSchema = z.object({
  body: z.object({
    memberEmails: z.array(z.string().email()).min(1),
  }),
});

export const teamParamsSchema = z.object({
  params: z.object({
    teamId: teamIdParam,
  }),
});

export const courseOfferingTeamsParamsSchema = z.object({
  params: z.object({
    offeringId: offeringIdParam,
  }),
});

export const teamMemberParamsSchema = z.object({
  params: z.object({
    teamId: teamIdParam,
    userId: userIdParam,
  }),
});
