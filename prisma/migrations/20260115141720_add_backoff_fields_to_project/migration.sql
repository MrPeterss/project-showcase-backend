-- AlterTable
ALTER TABLE "Project" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "failedCheckCount" INTEGER NOT NULL DEFAULT 0;
