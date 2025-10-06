import type { auth } from 'firebase-admin';

import type { User } from '@prisma/client';
import { Role } from '@prisma/client';

import type { NextFunction, Request, Response } from 'express';

import firebaseAdmin from '../firebase.js';
import { prisma } from '../prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
  firebaseUser?: auth.DecodedIdToken;
}

export const authenticateFirebase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: 'Unauthorized: No token provided or wrong format.' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const firebaseUser = await firebaseAdmin.auth().verifyIdToken(idToken);

    if (!firebaseUser) {
      res.status(401).json({ message: 'Unauthorized: Invalid token' });
      return;
    }

    if (!firebaseUser.email || !firebaseUser.email.endsWith('@cornell.edu')) {
      res
        .status(403)
        .json({ error: 'Forbidden: Access is restricted to Cornell users.' });
      return;
    }

    req.firebaseUser = firebaseUser;

    // Fetch user from the database using the email
    const user = await prisma.user.findUnique({
      where: { email: firebaseUser.email },
    });

    if (!user) {
      // User was not created by admin (and is not admin), so deny access
      res.status(403).json({
        error:
          'Forbidden: User not found in the database. Please contact an administrator.',
      });
      return;
    }

    // Fill in firebaseId field (if missing) and attach user to request
    if (!user.firebaseId) {
      const updatedUser = await prisma.user.update({
        where: { email: firebaseUser.email },
        data: { firebaseId: firebaseUser.uid },
      });
      req.user = updatedUser;
    } else {
      req.user = user;
    }
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};

// Middleware to require admin role
// Must be used after authenticateFirebase
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user!.role !== Role.ADMIN) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  next();
};

// Middleware to require admin or instructor role
// Must be used after authenticateFirebase
export const requireInstructorOrAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user!.role !== Role.ADMIN && req.user!.role !== Role.INSTRUCTOR) {
    res.status(403).json({
      error: 'Forbidden: Instructor or admin access required',
    });
    return;
  }

  next();
};
