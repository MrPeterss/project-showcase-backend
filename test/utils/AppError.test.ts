import { describe, expect, it } from 'vitest';

import {
  ErrorCodes,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/utils/AppError.js';

describe('AppError subclasses', () => {
  it('marks client errors as fail status', () => {
    const err = new NotFoundError('missing');
    expect(err.status).toBe('fail');
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe(ErrorCodes.NOT_FOUND);
  });

  it('marks server-class codes as error status', () => {
    const err = new ValidationError('x');
    expect(err.statusCode).toBe(400);
    expect(err.status).toBe('fail');
  });

  it('carries optional structured data', () => {
    const err = new UnauthorizedError('nope', { hint: 'login' });
    expect(err.data).toEqual({ hint: 'login' });
  });

  it('ForbiddenError uses 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });
});
