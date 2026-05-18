import jwt from 'jsonwebtoken';

export function signTestJwt(payload: {
  userId: number;
  isAdmin: boolean;
}): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ACCESS_TOKEN_SECRET must be set for JWT tests');
  }
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}
