import jwt from 'jsonwebtoken';

import { Role } from '@prisma/client';

import type { NextFunction, Request, Response } from 'express';

import type { AuthJwtPayload } from '../types/express/index.js';

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Unauthorized: No token provided or wrong format.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, (err, decodedToken) => {
    if (err || !decodedToken || typeof decodedToken === 'string') {
      return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }

    req.user = decodedToken as AuthJwtPayload;
    return next();
  });

  return;
};

// Middleware to require admin role
// Must be used after requireAuth
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user!.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  return next();
};

// Middleware to require instructor or admin role
// Must be used after requireAuth
export const requireInstructorOrAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user!.role !== Role.ADMIN && req.user!.role !== Role.INSTRUCTOR) {
    return res.status(403).json({
      error: 'Forbidden: Instructor or admin access required',
    });
  }
  return next();
};
