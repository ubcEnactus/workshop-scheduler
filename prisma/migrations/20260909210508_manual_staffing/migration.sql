-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MonthlyPAQuota" (
    "id" TEXT NOT NULL,
    "paId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "quota" INTEGER NOT NULL,

    CONSTRAINT "MonthlyPAQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minimumGapMinutes" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SchedulingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyPAQuota_month_idx" ON "MonthlyPAQuota"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPAQuota_paId_month_key" ON "MonthlyPAQuota"("paId", "month");

-- AddForeignKey
ALTER TABLE "MonthlyPAQuota" ADD CONSTRAINT "MonthlyPAQuota_paId_fkey" FOREIGN KEY ("paId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The singleton is the shared lock for all scheduling mutations.
INSERT INTO "SchedulingSettings" ("id", "revision") VALUES (1, 0);
ALTER TABLE "SchedulingSettings" ADD CONSTRAINT "SchedulingSettings_singleton" CHECK ("id" = 1);
ALTER TABLE "SchedulingSettings" ADD CONSTRAINT "SchedulingSettings_positive_gap" CHECK ("minimumGapMinutes" IS NULL OR "minimumGapMinutes" BETWEEN 1 AND 10080);
ALTER TABLE "MonthlyPAQuota" ADD CONSTRAINT "MonthlyPAQuota_valid" CHECK ("quota" >= 0 AND "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
