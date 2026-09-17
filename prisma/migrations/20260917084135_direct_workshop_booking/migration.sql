-- AlterTable
ALTER TABLE "SchedulingSettings" ALTER COLUMN "minimumGapDays" SET DEFAULT 7;

-- Initialize previously unconfigured installations without replacing deliberate settings.
UPDATE "SchedulingSettings"
SET "minimumGapDays" = 7, "revision" = "revision" + 1
WHERE "minimumGapDays" IS NULL;

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "hostingConfirmed" BOOLEAN NOT NULL DEFAULT false;
