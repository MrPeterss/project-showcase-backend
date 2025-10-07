import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';

export const listSemesters = async (_req: Request, res: Response) => {
  const semesters = await prisma.semester.findMany();
  return res.json(semesters);
};

export const getSemesterById = async (req: Request, res: Response) => {
  const semesterId = Number(req.params.semesterId);
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
  });

  if (!semester) {
    return res.status(404).json({ error: 'Semester not found' });
  }

  return res.json(semester);
};

export const createSemester = async (req: Request, res: Response) => {
  const { shortName, startDate, endDate } = req.body;

  if (!shortName || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: 'Short name, start date, and end date are required' });
  }

  try {
    const newSemester = await prisma.semester.create({
      data: {
        shortName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });
    return res.status(201).json(newSemester);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSemester = async (req: Request, res: Response) => {
  const semesterId = Number(req.params.semesterId);
  const { shortName, startDate, endDate } = req.body;

  try {
    const updatedSemester = await prisma.semester.update({
      where: { id: semesterId },
      data: {
        shortName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });
    return res.json(updatedSemester);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSemester = async (req: Request, res: Response) => {
  const semesterId = Number(req.params.semesterId);

  try {
    await prisma.semester.delete({ where: { id: semesterId } });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
