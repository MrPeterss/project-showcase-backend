-- CreateTable
CREATE TABLE "OfferingTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseOfferingId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferingTag_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectOfferingTag" (
    "projectId" INTEGER NOT NULL,
    "offeringTagId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectOfferingTag_pkey" PRIMARY KEY ("projectId", "offeringTagId"),
    CONSTRAINT "ProjectOfferingTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectOfferingTag_offeringTagId_fkey" FOREIGN KEY ("offeringTagId") REFERENCES "OfferingTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OfferingTag_courseOfferingId_name_key" ON "OfferingTag"("courseOfferingId", "name");

-- CreateIndex
CREATE INDEX "OfferingTag_courseOfferingId_idx" ON "OfferingTag"("courseOfferingId");

-- CreateIndex
CREATE INDEX "ProjectOfferingTag_offeringTagId_idx" ON "ProjectOfferingTag"("offeringTagId");

-- Data migration: OfferingTag rows from existing Project.tag values
INSERT OR IGNORE INTO "OfferingTag" ("courseOfferingId", "name")
SELECT DISTINCT t."courseOfferingId", p."tag"
FROM "Project" p
INNER JOIN "Team" t ON t."id" = p."teamId"
WHERE p."tag" IS NOT NULL AND TRIM(p."tag") != '';

-- Data migration: OfferingTag rows from course offering settings.project_tags (catalog entries without a project row)
INSERT OR IGNORE INTO "OfferingTag" ("courseOfferingId", "name")
SELECT co."id", j.value
FROM "CourseOffering" co,
json_each(json_extract(co."settings", '$.project_tags')) AS j
WHERE json_type(json_extract(co."settings", '$.project_tags')) = 'array';

-- Data migration: link projects to tags (from legacy Project.tag)
INSERT OR IGNORE INTO "ProjectOfferingTag" ("projectId", "offeringTagId")
SELECT p."id", o."id"
FROM "Project" p
INNER JOIN "Team" t ON t."id" = p."teamId"
INNER JOIN "OfferingTag" o ON o."courseOfferingId" = t."courseOfferingId" AND o."name" = p."tag"
WHERE p."tag" IS NOT NULL AND TRIM(p."tag") != '';
