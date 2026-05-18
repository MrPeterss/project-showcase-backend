import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

const fnCache = new Map<string, ReturnType<typeof vi.fn>>();

function getMockFn(path: string): ReturnType<typeof vi.fn> {
  let f = fnCache.get(path);
  if (!f) {
    f = vi.fn();
    fnCache.set(path, f);
  }
  return f;
}

/** Clears mock implementations/calls while keeping stable function references. */
export function resetPrismaMockFns(): void {
  for (const f of fnCache.values()) {
    f.mockReset();
  }
}

export const prismaMock = new Proxy({} as object, {
  get(_target, model: string | symbol) {
    const m = String(model);
    return new Proxy({} as object, {
      get(_t, method: string | symbol) {
        return getMockFn(`${m}.${String(method)}`);
      },
    });
  },
}) as unknown as PrismaClient;
