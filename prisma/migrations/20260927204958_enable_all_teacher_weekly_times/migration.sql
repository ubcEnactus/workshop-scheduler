-- AlterTable
ALTER TABLE "ClassMeeting" ALTER COLUMN "activeForScheduling" SET DEFAULT true;

-- All saved teacher weekly times authorize scheduling within their effective dates.
UPDATE "ClassMeeting" SET "activeForScheduling" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "activeForScheduling" = false;
