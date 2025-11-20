-- CreateTable
CREATE TABLE "CourseOfferingEnrollment_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseOfferingId" INTEGER NOT NULL,
    "referringCourseId" INTEGER,
    CONSTRAINT "CourseOfferingEnrollment_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOfferingEnrollment_new_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseOfferingEnrollment_new_referringCourseId_fkey" FOREIGN KEY ("referringCourseId") REFERENCES "CourseOffering" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data from old table to new table, generating sequential IDs
INSERT INTO "CourseOfferingEnrollment_new" ("role", "userId", "courseOfferingId", "referringCourseId")
SELECT 
    "role",
    "userId",
    "courseOfferingId",
    "referringCourseId"
FROM "CourseOfferingEnrollment"
ORDER BY "userId", "courseOfferingId";

-- DropTable
DROP TABLE "CourseOfferingEnrollment";

-- RenameTable
ALTER TABLE "CourseOfferingEnrollment_new" RENAME TO "CourseOfferingEnrollment";

-- CreateIndex
CREATE UNIQUE INDEX "CourseOfferingEnrollment_userId_courseOfferingId_key" ON "CourseOfferingEnrollment"("userId", "courseOfferingId");

