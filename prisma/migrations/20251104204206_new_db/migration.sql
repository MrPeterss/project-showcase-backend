/*
  Warnings:

  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `semesterId` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `shortName` on the `Semester` table. All the data in the column will be lost.
  - You are about to drop the column `courseId` on the `Team` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `Team` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `teamId` on the `User` table. All the data in the column will be lost.
  - Added the required column `season` to the `Semester` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Semester` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseOfferingId` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Project_teamId_status_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Project";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProjectType";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "settings" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    CONSTRAINT "CourseOffering_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOffering_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseOfferingEnrollment" (
    "userId" INTEGER NOT NULL,
    "courseOfferingId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,

    PRIMARY KEY ("userId", "courseOfferingId"),
    CONSTRAINT "CourseOfferingEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOfferingEnrollment_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "teamId"),
    CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "department" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Course" ("department", "id", "name", "number") SELECT "department", "id", "name", "number" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE TABLE "new_Semester" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Semester" ("endDate", "id", "startDate") SELECT "endDate", "id", "startDate" FROM "Semester";
DROP TABLE "Semester";
ALTER TABLE "new_Semester" RENAME TO "Semester";
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseOfferingId" INTEGER NOT NULL,
    CONSTRAINT "Team_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT,
    "firebaseId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "firebaseId", "id", "refreshToken") SELECT "createdAt", "email", "firebaseId", "id", "refreshToken" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_firebaseId_key" ON "User"("firebaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_courseId_semesterId_key" ON "CourseOffering"("courseId", "semesterId");
