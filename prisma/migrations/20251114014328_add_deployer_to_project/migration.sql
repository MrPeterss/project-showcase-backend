-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "githubUrl" TEXT NOT NULL,
    "imageName" TEXT NOT NULL,
    "containerId" TEXT,
    "containerName" TEXT,
    "status" TEXT NOT NULL,
    "ports" JSONB,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teamId" INTEGER NOT NULL,
    "deployedById" INTEGER,
    CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_deployedById_fkey" FOREIGN KEY ("deployedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("containerId", "containerName", "createdAt", "deployedAt", "githubUrl", "id", "imageName", "ports", "status", "stoppedAt", "teamId", "updatedAt") SELECT "containerId", "containerName", "createdAt", "deployedAt", "githubUrl", "id", "imageName", "ports", "status", "stoppedAt", "teamId", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_containerId_key" ON "Project"("containerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
