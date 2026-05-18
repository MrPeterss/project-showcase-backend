import type { Request, Response } from 'express';

import { prisma } from '../prisma.js';
import { NotFoundError } from '../utils/AppError.js';
import { getCourseByIdForAdmin } from './courseService.js';

export const getAllCourses = async (_req: Request, res: Response) => {
  const courses = await prisma.course.findMany();
  return res.json(courses);
};

export const getCourseById = async (req: Request, res: Response) => {
  const courseId = req.validated!.params!.courseId as number;
  const course = await getCourseByIdForAdmin(courseId);
  return res.json(course);
};

export const createCourse = async (req: Request, res: Response) => {
  const { name, number, department } = req.body;
  const newCourse = await prisma.course.create({
    data: { name, number, department },
  });
  return res.status(201).json(newCourse);
};

export const updateCourse = async (req: Request, res: Response) => {
  const courseId = req.validated!.params!.courseId as number;
  const { name, number, department } = req.body;

  const existingCourse = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!existingCourse) {
    throw new NotFoundError('Course not found');
  }

  const updatedCourse = await prisma.course.update({
    where: { id: courseId },
    data: { name, number, department },
  });

  return res.json(updatedCourse);
};

export const deleteCourse = async (req: Request, res: Response) => {
  const courseId = req.validated!.params!.courseId as number;

  const existingCourse = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!existingCourse) {
    throw new NotFoundError('Course not found');
  }

  await prisma.course.delete({
    where: { id: courseId },
  });

  return res.status(204).send();
};
