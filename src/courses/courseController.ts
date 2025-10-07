import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';

export const listCourses = async (_req: Request, res: Response) => {
  const courses = await prisma.course.findMany();
  return res.json(courses);
};

export const getCourseById = async (req: Request, res: Response) => {
  const courseId = Number(req.params.courseId);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }

  return res.json(course);
};

export const createCourse = async (req: Request, res: Response) => {
  const { department, number, name, semesterId } = req.body;

  if (!department || !number || !name || !semesterId) {
    return res
      .status(400)
      .json({ error: 'Department, number, name, and semesterId are required' });
  }

  try {
    const newCourse = await prisma.course.create({
      data: { department, number, name, semesterId },
    });
    return res.status(201).json(newCourse);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  const courseId = Number(req.params.courseId);
  const { department, number, name, semesterId } = req.body;

  try {
    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: { department, number, name, semesterId },
    });
    return res.json(updatedCourse);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  const courseId = Number(req.params.courseId);

  try {
    await prisma.course.delete({
      where: { id: courseId },
    });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
