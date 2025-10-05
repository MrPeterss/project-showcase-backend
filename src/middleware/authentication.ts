import type { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../firebase.js';
import type { auth } from 'firebase-admin';

interface AuthRequest extends Request {
  user?: auth.DecodedIdToken;
}

export const authenticateFirebase = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res
      .status(401)
      .send({ error: 'Unauthorized: No token provided or wrong format.' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res
      .status(401)
      .send({ error: 'Unauthorized: Invalid or expired token.' });
  }
};
