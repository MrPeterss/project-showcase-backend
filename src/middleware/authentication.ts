import jwt from 'jsonwebtoken';
import { promisify } from 'node:util';

import type { NextFunction, Request, Response } from 'express';

import { getEnv } from '../config/env.js';
import type { AuthJwtPayload } from '../types/express/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError.js';

const verifyJwt = promisify(jwt.verify) as (
  token: string,
  secretOrKey: jwt.Secret,
) => Promise<string | jwt.JwtPayload>;

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const { ACCESS_TOKEN_SECRET } = getEnv();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided or wrong format.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('No token provided.');
    }

    const decoded = await verifyJwt(token, ACCESS_TOKEN_SECRET);
    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Invalid token.');
    }

    req.user = decoded as AuthJwtPayload;
    return next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return next(err);
    }
    return next(new UnauthorizedError('Invalid token.'));
  }
};

// Middleware to require admin role
// Must be used after requireAuth
export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user?.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }
  return next();
};
