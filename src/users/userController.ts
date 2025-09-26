import { Request, Response } from 'express';
import { prisma } from '../prisma.js';


export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

export const getProtectedData = (req: Request, res: Response): void => {
  res.json({
    message: `Hello, ${(req as any).user.email}! This data is protected.`,
    uid: (req as any).user.uid
  });
};
