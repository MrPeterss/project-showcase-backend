import jwt from 'jsonwebtoken';

import { Role } from '@prisma/client';

import type { NextFunction, Request, Response } from 'express';

import type { AuthJwtPayload } from '../types/express/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError.js';

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided or wrong format.');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('No token provided.');
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, (err, decodedToken) => {
    if (err || !decodedToken || typeof decodedToken === 'string') {
      throw new UnauthorizedError('Invalid token.');
    }
    req.user = decodedToken as AuthJwtPayload;
  });

  return next();
};

// Middleware to require admin role
// Must be used after requireAuth
export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.user!.role !== Role.ADMIN) {
    throw new ForbiddenError('Admin access required');
  }
  return next();
};

// Middleware to require instructor or admin role
// Must be used after requireAuth
export const requireInstructorOrAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.user!.role !== Role.ADMIN && req.user!.role !== Role.INSTRUCTOR) {
    throw new ForbiddenError('Instructor or admin access required');
  }
  return next();
};
