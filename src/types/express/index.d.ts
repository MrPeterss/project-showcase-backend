export interface AuthJwtPayload {
  userId: string;
  isAdmin: boolean;
}

// Extend the Express Request interface to include injected user property
declare global {
  namespace Express {
    export interface Request {
      user?: AuthJwtPayload;
    }
  }
}
