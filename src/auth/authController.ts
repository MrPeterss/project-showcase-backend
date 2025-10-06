import jwt from 'jsonwebtoken';

import type { Request, Response } from 'express';

import firebaseAdmin from '../firebase.js';
import { prisma } from '../prisma.js';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const verifyFirebaseToken = async (req: Request, res: Response) => {
  const { firebaseToken } = req.body;
  if (!firebaseToken) {
    return res.status(400).json({ error: 'Firebase token is required.' });
  }

  try {
    const firebaseUser = await firebaseAdmin
      .auth()
      .verifyIdToken(firebaseToken);

    if (!firebaseUser) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }

    if (!firebaseUser.email || !firebaseUser.email.endsWith('@cornell.edu')) {
      return res
        .status(403)
        .json({ error: 'Forbidden: Access is restricted to Cornell users.' });
    }

    // Fetch user from the database using the email
    const user = await prisma.user.findUnique({
      where: { email: firebaseUser.email },
    });

    if (!user) {
      // User was not created by admin (and is not admin), so deny access
      return res.status(403).json({
        error:
          'Forbidden: User not found in the database. Please contact an administrator.',
      });
    }

    // Fill in firebaseId field (if missing)
    if (!user.firebaseId) {
      await prisma.user.update({
        where: { email: firebaseUser.email },
        data: { firebaseId: firebaseUser.uid },
      });
    }

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: '7d' },
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: user.refreshToken },
    });

    res.cookie('refreshToken', refreshToken, cookieOptions);
    return res.json({ accessToken });
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }

  try {
    const payload = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET!,
    ) as { userId: number };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Forbidden: Invalid token.' });
    }

    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' },
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: '7d' },
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.cookie('refreshToken', newRefreshToken, cookieOptions);
    return res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
};
