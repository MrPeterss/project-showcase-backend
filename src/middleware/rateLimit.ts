import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

// TODO: Switch to bucket-based rate limiting for distributed environments

// Configurable rate limiting per IP
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

// Rate limiting per authenticated user account
// This should be used after authentication middleware
export const userLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID as the key instead of IP
  keyGenerator: (req: Request): string => {
    return `${req.user!.userId}`; // Assumes req.user is populated by authentication middleware
  },
  // Custom handler to provide user-specific error message
  handler: (req: Request, res: Response): void => {
    res.status(429).json({
      error: 'Too many requests from your account, please try again later.',
      userId: req.user!.userId,
    });
  },
  skip: (req: Request): boolean => {
    // Skip rate limiting for admin users
    return req.user!.role === 'ADMIN';
  },
});
