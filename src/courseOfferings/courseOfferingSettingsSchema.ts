import { z } from 'zod';

/** JSON settings blob stored on CourseOffering.settings — validated at API/service boundaries. */
export const courseOfferingSettingsRecordSchema = z.record(z.string(), z.unknown());

export type CourseOfferingSettingsRecord = z.infer<
  typeof courseOfferingSettingsRecordSchema
>;

export function parseStoredCourseOfferingSettings(
  raw: unknown,
): CourseOfferingSettingsRecord {
  const value = raw === null || raw === undefined ? {} : raw;
  return courseOfferingSettingsRecordSchema.parse(value);
}
