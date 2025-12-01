-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "githubUrl" TEXT NOT NULL,
    "imageHash" TEXT,
    "imageName" TEXT,
    "tag" TEXT,
    "containerId" TEXT,
    "containerName" TEXT,
    "status" TEXT NOT NULL,
    "ports" JSONB,
    "buildLogs" TEXT,
    "buildArgs" JSONB,
    "dataFile" TEXT,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teamId" INTEGER NOT NULL,
    "deployedById" INTEGER,
    CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_deployedById_fkey" FOREIGN KEY ("deployedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("buildArgs", "buildLogs", "containerId", "containerName", "createdAt", "dataFile", "deployedAt", "deployedById", "githubUrl", "id", "imageName", "ports", "status", "stoppedAt", "tag", "teamId", "updatedAt") SELECT "buildArgs", "buildLogs", "containerId", "containerName", "createdAt", "dataFile", "deployedAt", "deployedById", "githubUrl", "id", "imageName", "ports", "status", "stoppedAt", "tag", "teamId", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_containerId_key" ON "Project"("containerId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
