import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import { FirebaseAppError } from 'firebase-admin/app';

import type { Request, Response } from 'express';

import firebaseAdmin from '../firebase.js';
import { prisma } from '../prisma.js';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError.js';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const verifyFirebaseToken = async (req: Request, res: Response) => {
  const { firebaseToken } = req.body;
  let firebaseUser;

  try {
    firebaseUser = await firebaseAdmin.auth().verifyIdToken(firebaseToken);
  } catch (error: unknown) {
    if (error instanceof FirebaseAppError) {
      if (error.code === 'auth/id-token-expired') {
        throw new UnauthorizedError('Token has expired');
      }
      if (error.code === 'auth/id-token-revoked') {
        throw new UnauthorizedError('Token has been revoked');
      }
      if (error.code === 'auth/argument-error') {
        throw new UnauthorizedError('Invalid token format');
      }
    }
    // Generic auth error
    throw new UnauthorizedError('Invalid Firebase token');
  }

  if (!firebaseUser.email || !firebaseUser.email.endsWith('@cornell.edu')) {
    throw new ForbiddenError('Access is restricted to Cornell users.');
  }

  // Fetch user from the database using the email
  const user = await prisma.user.findUnique({
    where: { email: firebaseUser.email },
  });

  if (!user) {
    // User was not created by admin (and is not admin), so deny access
    throw new ForbiddenError(
      'User not found in the database. Please contact an administrator.',
    );
  }

  // Fill in firebaseId field (if missing)
  if (!user.firebaseId) {
    await prisma.user.update({
      where: { email: firebaseUser.email },
      data: { firebaseId: firebaseUser.uid },
    });
  }

  const accessToken = jwt.sign(
    { userId: user.id, isAdmin: user.isAdmin },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: '15m' },
  );

  const refreshToken = crypto.randomBytes(64).toString('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: user.refreshToken },
  });

  res.cookie('refreshToken', refreshToken, cookieOptions);
  return res.json({ accessToken });
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    throw new UnauthorizedError('No refresh token provided');
  }

  const payload = jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET!,
  ) as { userId: number };

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user || user.refreshToken !== refreshToken) {
    throw new ForbiddenError('Invalid refresh token');
  }

  const newAccessToken = jwt.sign(
    { userId: user.id, isAdmin: user.isAdmin },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: '15m' },
  );

  const newRefreshToken = crypto.randomBytes(64).toString('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefreshToken },
  });

  res.cookie('refreshToken', newRefreshToken, cookieOptions);
  return res.json({ accessToken: newAccessToken });
};
