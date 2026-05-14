-- AlterTable
ALTER TABLE "Team" ADD COLUMN "alias" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "alias" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Team_alias_key" ON "Team"("alias");
