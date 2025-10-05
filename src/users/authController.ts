import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import type { auth } from 'firebase-admin';

interface AuthRequest extends Request {
  user?: auth.DecodedIdToken;
}

/**
 * Handles user authentication and registration.
 * When a user logs in for the first time, this endpoint:
 * 1. Checks if the user exists by email
 * 2. If exists but no firebaseId, updates it (for pre-seeded admin users)
 * 3. If doesn't exist, creates a new user with STUDENT role
 */
export const authenticateUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const firebaseUser = req.user;
    if (!firebaseUser || !firebaseUser.email) {
      res.status(401).json({ message: 'Unauthorized: Invalid token' });
      return;
    }

    const { email, uid: firebaseId } = firebaseUser;

    // Check if user exists by email
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // User exists - check if we need to update firebaseId
      if (!user.firebaseId) {
        // This is a pre-seeded admin user logging in for the first time
        user = await prisma.user.update({
          where: { id: user.id },
          data: { firebaseId },
        });
        console.log(`Updated firebaseId for user: ${email}`);
      } else if (user.firebaseId !== firebaseId) {
        // FirebaseId mismatch - this shouldn't happen normally
        res.status(400).json({
          message: 'Firebase ID mismatch for existing user',
        });
        return;
      }
    } else {
      // User doesn't exist - create new user with STUDENT role
      // Note: New users won't have a team initially
      user = await prisma.user.create({
        data: {
          email,
          firebaseId,
          role: 'STUDENT',
        },
      });
      console.log(`Created new user: ${email}`);
    }

    // Return user data
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamId: user.teamId,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Error authenticating user:', error);
    res.status(500).json({ message: 'Error authenticating user' });
  }
};

/**
 * Gets the current user's information
 */
export const getCurrentUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const firebaseUser = req.user;
    if (!firebaseUser || !firebaseUser.uid) {
      res.status(401).json({ message: 'Unauthorized: Invalid token' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { firebaseId: firebaseUser.uid },
      include: {
        team: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamId: user.teamId,
      team: user.team,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};
