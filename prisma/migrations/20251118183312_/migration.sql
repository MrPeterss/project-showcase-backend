/*
  Warnings:

  - The primary key for the `CourseOfferingEnrollment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `id` to the `CourseOfferingEnrollment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CourseOfferingEnrollment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseOfferingId" INTEGER NOT NULL,
    "referringCourseId" INTEGER,
    CONSTRAINT "CourseOfferingEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOfferingEnrollment_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOfferingEnrollment_referringCourseId_fkey" FOREIGN KEY ("referringCourseId") REFERENCES "CourseOffering" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CourseOfferingEnrollment" ("courseOfferingId", "referringCourseId", "role", "userId") SELECT "courseOfferingId", "referringCourseId", "role", "userId" FROM "CourseOfferingEnrollment";
DROP TABLE "CourseOfferingEnrollment";
ALTER TABLE "new_CourseOfferingEnrollment" RENAME TO "CourseOfferingEnrollment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
