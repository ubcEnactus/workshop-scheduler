/*
  Warnings:

  - A unique constraint covering the columns `[userId,dayOfWeek,startMin,effectiveFrom]` on the table `Availability` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WorkshopIdentityStatus" AS ENUM ('IDENTIFIED', 'NEEDS_IDENTIFICATION');

-- CreateEnum
CREATE TYPE "ClassAvailabilityExceptionKind" AS ENUM ('CLOSED', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "PAAvailabilityExceptionKind" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

-- AlterEnum
ALTER TYPE "ClassWorkshopStatus" ADD VALUE 'WAIVED';

-- DropIndex
DROP INDEX "Availability_userId_dayOfWeek_startMin_key";

-- DropIndex
DROP INDEX "WorkshopDefinition_number_key";

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "overrideSameDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overrideWeek" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Availability" ADD COLUMN     "effectiveFrom" DATE NOT NULL DEFAULT '2000-01-01'::date,
ADD COLUMN     "effectiveUntil" DATE;

-- AlterTable
ALTER TABLE "ClassMeeting" ADD COLUMN     "activeForScheduling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "effectiveFrom" DATE NOT NULL DEFAULT '2000-01-01'::date,
ADD COLUMN     "effectiveUntil" DATE,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "ClassSection" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClassWorkshop" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedById" TEXT,
ADD COLUMN     "waiverReason" TEXT;

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "availabilityBasis" JSONB,
ADD COLUMN     "dateExceptionApprovedAt" TIMESTAMP(3),
ADD COLUMN     "dateExceptionApprovedBy" TEXT,
ADD COLUMN     "dateExceptionReason" TEXT,
ADD COLUMN     "hostClassName" TEXT,
ADD COLUMN     "hostSchoolName" TEXT,
ADD COLUMN     "hostTeacherName" TEXT,
ADD COLUMN     "participantInstructions" TEXT;

-- AlterTable
ALTER TABLE "WorkshopDefinition" ADD COLUMN     "defaultMaxPAs" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "defaultMinPAs" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "identityStatus" "WorkshopIdentityStatus" NOT NULL DEFAULT 'IDENTIFIED',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkshopEvent" ADD COLUMN     "communicatedAt" TIMESTAMP(3),
ADD COLUMN     "communicatedById" TEXT,
ADD COLUMN     "communicationNote" TEXT;

-- CreateTable
CREATE TABLE "ClassAvailabilityException" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "ClassAvailabilityExceptionKind" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClosure" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PAAvailabilityException" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "PAAvailabilityExceptionKind" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PAAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentBatch" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTeacherTransfer" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "fromTeacherId" TEXT NOT NULL,
    "toTeacherId" TEXT NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassTeacherTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassAvailabilityException_classSectionId_date_idx" ON "ClassAvailabilityException"("classSectionId", "date");

-- CreateIndex
CREATE INDEX "SchoolClosure_schoolId_date_idx" ON "SchoolClosure"("schoolId", "date");

-- CreateIndex
CREATE INDEX "PAAvailabilityException_userId_date_idx" ON "PAAvailabilityException"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentBatch_requestKey_key" ON "EnrollmentBatch"("requestKey");

-- CreateIndex
CREATE INDEX "ClassTeacherTransfer_classSectionId_effectiveOn_idx" ON "ClassTeacherTransfer"("classSectionId", "effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_dayOfWeek_startMin_effectiveFrom_key" ON "Availability"("userId", "dayOfWeek", "startMin", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ClassAvailabilityException" ADD CONSTRAINT "ClassAvailabilityException_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClosure" ADD CONSTRAINT "SchoolClosure_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PAAvailabilityException" ADD CONSTRAINT "PAAvailabilityException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacherTransfer" ADD CONSTRAINT "ClassTeacherTransfer_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the entire interval represented by every legacy half-hour PA cell.
ALTER TABLE "Availability" DROP CONSTRAINT "Availability_valid_slot";
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_valid_slot"
  CHECK ("dayOfWeek" BETWEEN 0 AND 4 AND "startMin" BETWEEN 0 AND 1425 AND "startMin" % 15 = 0);
INSERT INTO "Availability" ("id", "userId", "dayOfWeek", "startMin", "createdAt", "updatedAt", "effectiveFrom", "effectiveUntil")
SELECT gen_random_uuid()::text, "userId", "dayOfWeek", "startMin" + 15, "createdAt", "updatedAt", "effectiveFrom", "effectiveUntil"
FROM "Availability" WHERE "startMin" % 30 = 0;

UPDATE "WorkshopDefinition" SET "identityStatus" = 'NEEDS_IDENTIFICATION' WHERE "number" IS NULL;
UPDATE "Workshop" w SET "hostTeacherName" = COALESCE(u."name", u."email"), "hostClassName" = c."name", "hostSchoolName" = s."name"
FROM "ClassWorkshop" cw JOIN "ClassSection" c ON c."id" = cw."classSectionId"
JOIN "User" u ON u."id" = c."teacherId" JOIN "School" s ON s."id" = c."schoolId"
WHERE w."classWorkshopId" = cw."id";

ALTER TABLE "Availability" ADD CONSTRAINT "Availability_effective_dates" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom");
ALTER TABLE "ClassMeeting" ADD CONSTRAINT "ClassMeeting_effective_dates" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom");
ALTER TABLE "WorkshopDefinition" ADD CONSTRAINT "WorkshopDefinition_staffing_defaults" CHECK ("defaultMinPAs" >= 1 AND "defaultMaxPAs" >= "defaultMinPAs");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_override_reason" CHECK ((NOT "overrideSameDay" AND NOT "overrideWeek") OR ("overrideReason" IS NOT NULL AND length(btrim("overrideReason")) > 0));
ALTER TABLE "ClassAvailabilityException" ADD CONSTRAINT "ClassAvailabilityException_interval" CHECK (
  ("kind" = 'CLOSED' AND "startMinute" IS NULL AND "endMinute" IS NULL) OR
  ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);
ALTER TABLE "SchoolClosure" ADD CONSTRAINT "SchoolClosure_interval" CHECK (
  ("startMinute" IS NULL AND "endMinute" IS NULL) OR
  ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);
ALTER TABLE "PAAvailabilityException" ADD CONSTRAINT "PAAvailabilityException_interval" CHECK (
  ("kind" = 'UNAVAILABLE' AND "startMinute" IS NULL AND "endMinute" IS NULL) OR
  ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);
-- Pending previews use the old eligibility contract; preserve applied history.
UPDATE "MatchingPreview" SET "expiresAt" = LEAST("expiresAt", CURRENT_TIMESTAMP) WHERE "appliedAt" IS NULL;
