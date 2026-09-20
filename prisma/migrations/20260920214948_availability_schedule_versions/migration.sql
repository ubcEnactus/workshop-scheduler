-- AlterTable
ALTER TABLE "ClassMeeting" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AvailabilityScheduleVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityScheduleVersion_userId_effectiveFrom_key" ON "AvailabilityScheduleVersion"("userId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "AvailabilityScheduleVersion" ADD CONSTRAINT "AvailabilityScheduleVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AvailabilityScheduleVersion" ("id", "userId", "effectiveFrom", "effectiveUntil")
SELECT gen_random_uuid()::text, "userId", "effectiveFrom", max("effectiveUntil")
FROM "Availability" GROUP BY "userId", "effectiveFrom";
ALTER TABLE "AvailabilityScheduleVersion" ADD CONSTRAINT "AvailabilityScheduleVersion_effective_dates"
  CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom");
