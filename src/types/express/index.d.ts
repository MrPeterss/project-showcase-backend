export interface AuthJwtPayload {
  userId: number;
  isAdmin: boolean;
}

/** Populated by validateRequest middleware after successful Zod parse */
export interface ValidatedRequestParts {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

// Extend the Express Request interface to include injected user property
declare global {
  namespace Express {
    export interface Request {
      user?: AuthJwtPayload;
      validated?: ValidatedRequestParts;
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
