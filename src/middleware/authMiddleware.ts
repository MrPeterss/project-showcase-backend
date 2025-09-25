import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

export const authenticateFirebase = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ error: 'Unauthorized: No token provided or wrong format.' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).send({ error: 'Unauthorized: Invalid or expired token.' });
  }
};