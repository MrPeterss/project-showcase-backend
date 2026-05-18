import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { globalErrorHandler } from '../../src/middleware/errorHandler.js';
import {
  UnauthorizedError,
  ValidationError,
} from '../../src/utils/AppError.js';

describe('globalErrorHandler', () => {
  it('serializes AppError instances as JSON', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;

    globalErrorHandler(
      new UnauthorizedError('no'),
      {} as Request,
      res,
      vi.fn() as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'no',
      }),
    );
  });

  it('includes validation payload on ValidationError', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;

    globalErrorHandler(
      new ValidationError('bad', { 'body.name': 'required' }),
      {} as Request,
      res,
      vi.fn() as NextFunction,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        data: { 'body.name': 'required' },
      }),
    );
  });

  it('returns 500 for unknown errors', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalErrorHandler(
      new Error('boom'),
      {} as Request,
      res,
      vi.fn() as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'boom',
      }),
    );

    consoleSpy.mockRestore();
    process.env.NODE_ENV = prev;
  });
});
