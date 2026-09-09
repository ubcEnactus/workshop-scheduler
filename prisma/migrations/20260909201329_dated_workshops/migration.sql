/*
  Warnings:

  - The values [PROPOSED,CONFIRMED,DECLINED] on the enum `AssignmentStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [UNSCHEDULED,SCHEDULED,CONFIRMED] on the enum `WorkshopStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `cycleId` on the `Workshop` table. All the data in the column will be lost.
  - You are about to drop the `Cycle` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `scheduledStart` on table `Workshop` required. This step will fail if there are existing NULL values in that column.
  - Made the column `scheduledEnd` on table `Workshop` required. This step will fail if there are existing NULL values in that column.

*/
-- Development scheduling data is disposable. Clear it before removing the old
-- enum values and making dates required; no legacy status mapping or backfill.
DELETE FROM "Assignment";
DELETE FROM "Workshop";

-- AlterEnum
BEGIN;
CREATE TYPE "AssignmentStatus_new" AS ENUM ('DRAFT', 'PUBLISHED');
ALTER TABLE "public"."Assignment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Assignment" ALTER COLUMN "status" TYPE "AssignmentStatus_new" USING ("status"::text::"AssignmentStatus_new");
ALTER TYPE "AssignmentStatus" RENAME TO "AssignmentStatus_old";
ALTER TYPE "AssignmentStatus_new" RENAME TO "AssignmentStatus";
DROP TYPE "public"."AssignmentStatus_old";
ALTER TABLE "Assignment" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "WorkshopStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Workshop" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Workshop" ALTER COLUMN "status" TYPE "WorkshopStatus_new" USING ("status"::text::"WorkshopStatus_new");
ALTER TYPE "WorkshopStatus" RENAME TO "WorkshopStatus_old";
ALTER TYPE "WorkshopStatus_new" RENAME TO "WorkshopStatus";
DROP TYPE "public"."WorkshopStatus_old";
ALTER TABLE "Workshop" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "Workshop" DROP CONSTRAINT "Workshop_cycleId_fkey";

-- DropIndex
DROP INDEX "Workshop_cycleId_idx";

-- AlterTable
ALTER TABLE "Assignment" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Workshop" DROP COLUMN "cycleId",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "scheduledStart" SET NOT NULL,
ALTER COLUMN "scheduledEnd" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- DropTable
DROP TABLE "Cycle";

-- DropEnum
DROP TYPE "CycleStatus";

-- CreateIndex
CREATE INDEX "Workshop_scheduledStart_idx" ON "Workshop"("scheduledStart");

-- Backstops for all writers, including seed and later staffing actions.
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_positive_duration"
  CHECK ("scheduledEnd" > "scheduledStart");
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_staffing_bounds"
  CHECK ("minPAs" >= 1 AND "maxPAs" >= "minPAs");
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_version_nonnegative"
  CHECK ("version" >= 0);
