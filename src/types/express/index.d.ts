export interface AuthJwtPayload {
  userId: number;
  isAdmin: boolean;
}

// Extend the Express Request interface to include injected user property
declare global {
  namespace Express {
    export interface Request {
      user?: AuthJwtPayload;
      file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        destination: string;
        filename: string;
        path: string;
        size: number;
      };
    }
  }
}
