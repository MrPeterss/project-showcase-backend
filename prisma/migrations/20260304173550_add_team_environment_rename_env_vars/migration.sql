/*
  Warnings:

  - You are about to drop the column `envVars` on the `Project` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TeamEnvironment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "keyName" TEXT NOT NULL,
    "keyValue" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TeamEnvironment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "githubUrl" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "tag" TEXT,
    "containerId" TEXT,
    "containerName" TEXT,
    "status" TEXT NOT NULL,
    "ports" JSONB,
    "buildLogs" TEXT,
    "buildArgs" JSONB,
    "extraEnvVars" JSONB,
    "dataFile" TEXT,
    "originalDataFileName" TEXT,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "failedCheckCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teamId" INTEGER NOT NULL,
    "deployedById" INTEGER,
    CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_deployedById_fkey" FOREIGN KEY ("deployedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("buildArgs", "buildLogs", "containerId", "containerName", "createdAt", "dataFile", "deployedAt", "deployedById", "failedCheckCount", "githubUrl", "id", "imageHash", "lastCheckedAt", "originalDataFileName", "ports", "status", "stoppedAt", "tag", "teamId", "updatedAt") SELECT "buildArgs", "buildLogs", "containerId", "containerName", "createdAt", "dataFile", "deployedAt", "deployedById", "failedCheckCount", "githubUrl", "id", "imageHash", "lastCheckedAt", "originalDataFileName", "ports", "status", "stoppedAt", "tag", "teamId", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_containerId_key" ON "Project"("containerId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TeamEnvironment_teamId_keyName_scope_key" ON "TeamEnvironment"("teamId", "keyName", "scope");
