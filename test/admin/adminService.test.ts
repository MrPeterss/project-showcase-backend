import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { prismaMock, resetPrismaMockFns } from '../helpers/prismaMock.js';

vi.mock('../../src/prisma.js', () => ({ prisma: prismaMock }));

import {
  demoteUserFromAdmin,
  promoteUserToAdmin,
  updateUserName,
} from '../../src/admin/adminService.js';

describe('adminService', () => {
  beforeEach(() => {
    resetPrismaMockFns();
  });

  const userRow = {
    id: 1,
    email: 'a@test.edu',
    name: 'A',
    isAdmin: false,
    createdAt: new Date(),
  };

  it('promoteUserToAdmin updates role when user exists', async () => {
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue(userRow);
    vi.mocked(prismaMock.user.update as Mock).mockResolvedValue({
      ...userRow,
      isAdmin: true,
    });

    const out = await promoteUserToAdmin(1);
    expect(out.isAdmin).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { isAdmin: true },
      }),
    );
  });

  it('promoteUserToAdmin throws when user missing', async () => {
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue(null);

    await expect(promoteUserToAdmin(404)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('demoteUserFromAdmin sets isAdmin false', async () => {
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue({
      ...userRow,
      isAdmin: true,
    });
    vi.mocked(prismaMock.user.update as Mock).mockResolvedValue(userRow);

    await demoteUserFromAdmin(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isAdmin: false },
      }),
    );
  });

  it('updateUserName persists name', async () => {
    vi.mocked(prismaMock.user.findUnique as Mock).mockResolvedValue(userRow);
    vi.mocked(prismaMock.user.update as Mock).mockResolvedValue({
      ...userRow,
      name: 'New',
    });

    await updateUserName(1, 'New');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'New' },
      }),
    );
  });
});
