-- AlterTable
ALTER TABLE "SchedulingSettings" ADD COLUMN     "minimumGapDays" INTEGER;

-- Preserve the deployed minute-based setting while switching to whole Vancouver
-- calendar days. Round partial legacy days up; the new rule compares local dates.
-- NULL remains unconfigured and continues to block staffing until the admin sets it.
UPDATE "SchedulingSettings"
SET
    "minimumGapDays" = CASE
        WHEN "minimumGapMinutes" IS NULL THEN NULL
        ELSE CEIL("minimumGapMinutes"::numeric / 1440)::integer
    END,
    "revision" = "revision" + 1;

ALTER TABLE "SchedulingSettings"
ADD CONSTRAINT "SchedulingSettings_valid_minimum_gap_days"
CHECK ("minimumGapDays" IS NULL OR "minimumGapDays" BETWEEN 1 AND 365);
