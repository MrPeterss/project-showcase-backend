import request from 'supertest';
import express from 'express';
import * as adminController from './adminController';

const app = express();
app.use(express.json());
app.get('/users', adminController.listUsers);
app.post('/users', adminController.addUser);
app.delete('/users/:id', adminController.deleteUser);

jest.mock('../generated/prisma/client', () => {
  const mUser = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => ({ user: mUser })) };
});

const { PrismaClient } = require('../generated/prisma/client');
const prisma = new PrismaClient();

describe('Admin Controller', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listUsers', () => {
    it('should return users', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 1, email: 'a@b.com', team: {} }]);
      const res = await request(app).get('/users');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, email: 'a@b.com', team: {} }]);
    });
  });

  describe('addUser', () => {
    it('should create user', async () => {
      prisma.user.create.mockResolvedValue({ id: 2, email: 'c@d.com', teamId: 1, isAdmin: false });
      const res = await request(app).post('/users').send({ email: 'c@d.com', teamId: 1 });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 2);
    });
    it('should handle error', async () => {
      prisma.user.create.mockRejectedValue(new Error('fail'));
      const res = await request(app).post('/users').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      prisma.user.delete.mockResolvedValue({});
      const res = await request(app).delete('/users/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
    it('should handle error', async () => {
      prisma.user.delete.mockRejectedValue(new Error('fail'));
      const res = await request(app).delete('/users/1');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
});
