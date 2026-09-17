-- WorkshopSession maps to the existing Workshop table so IDs, assignment FKs,
-- publication metadata, batches, and change history are preserved in place.
BEGIN;
-- CreateEnum
CREATE TYPE "ClassWorkshopStatus" AS ENUM ('NEEDS_AVAILABILITY', 'READY_TO_SCHEDULE', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- DropForeignKey
ALTER TABLE "Workshop" DROP CONSTRAINT "Workshop_classSectionId_fkey";

-- DropIndex
DROP INDEX "Workshop_classSectionId_idx";

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN "classWorkshopId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mode" "SessionMode" NOT NULL DEFAULT 'IN_PERSON',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "WorkshopDefinition" (
    "id" TEXT NOT NULL,
    "number" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassWorkshop" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "workshopDefinitionId" TEXT NOT NULL,
    "status" "ClassWorkshopStatus" NOT NULL DEFAULT 'NEEDS_AVAILABILITY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassWorkshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "classWorkshopId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopDefinition_number_key" ON "WorkshopDefinition"("number");

-- The old schema recorded no curriculum identity. Do not infer one from dates
-- or class names. Keep an explicitly unidentified definition per occurrence;
-- admins can identify these records later without losing any original IDs.
INSERT INTO "WorkshopDefinition" ("id", "title", "description", "updatedAt")
SELECT 'imported-definition-' || "id", 'Imported workshop ' || "id",
  'Imported dated workshop. The original record did not identify its workshop definition.', CURRENT_TIMESTAMP
FROM "Workshop";
INSERT INTO "ClassWorkshop" ("id", "classSectionId", "workshopDefinitionId", "status", "createdAt", "updatedAt")
SELECT 'imported-class-workshop-' || "id", "classSectionId", 'imported-definition-' || "id",
  (CASE WHEN "status" = 'COMPLETED' THEN 'COMPLETED' WHEN "status" = 'CANCELLED' THEN 'CANCELLED' ELSE 'SCHEDULED' END)::"ClassWorkshopStatus",
  "createdAt", "updatedAt" FROM "Workshop";
UPDATE "Workshop" SET "classWorkshopId" = 'imported-class-workshop-' || "id";
INSERT INTO "AvailabilitySlot" ("id", "classWorkshopId", "start", "end", "notes", "updatedAt")
SELECT 'imported-availability-' || "id", "classWorkshopId", "scheduledStart", "scheduledEnd",
  'Imported booked time. Other candidate dates were not recorded.', CURRENT_TIMESTAMP FROM "Workshop";
ALTER TABLE "Workshop" ALTER COLUMN "classWorkshopId" SET NOT NULL;
ALTER TABLE "Workshop" DROP COLUMN "classSectionId";

-- CreateIndex
CREATE INDEX "ClassWorkshop_workshopDefinitionId_idx" ON "ClassWorkshop"("workshopDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassWorkshop_classSectionId_workshopDefinitionId_key" ON "ClassWorkshop"("classSectionId", "workshopDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_classWorkshopId_start_end_key" ON "AvailabilitySlot"("classWorkshopId", "start", "end");

-- CreateIndex
CREATE INDEX "Workshop_classWorkshopId_idx" ON "Workshop"("classWorkshopId");

-- AddForeignKey
ALTER TABLE "ClassWorkshop" ADD CONSTRAINT "ClassWorkshop_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassWorkshop" ADD CONSTRAINT "ClassWorkshop_workshopDefinitionId_fkey" FOREIGN KEY ("workshopDefinitionId") REFERENCES "WorkshopDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_classWorkshopId_fkey" FOREIGN KEY ("classWorkshopId") REFERENCES "ClassWorkshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_classWorkshopId_fkey" FOREIGN KEY ("classWorkshopId") REFERENCES "ClassWorkshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A cancellation can be followed by a replacement session. Completed delivery
-- is final for this class/definition pair; it cannot accidentally be delivered twice.
CREATE UNIQUE INDEX "Workshop_one_delivery_per_class_workshop" ON "Workshop"("classWorkshopId") WHERE "status" <> 'CANCELLED';
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_positive_duration" CHECK ("end" > "start");
ALTER TABLE "WorkshopDefinition" ADD CONSTRAINT "WorkshopDefinition_positive_number" CHECK ("number" > 0);
ALTER TABLE "WorkshopDefinition" ADD CONSTRAINT "WorkshopDefinition_positive_duration" CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440);

-- Keep the summary lifecycle consistent for every writer, including the seed.
CREATE FUNCTION refresh_class_workshop_status(target_id TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM 1 FROM "ClassWorkshop" WHERE "id" = target_id FOR UPDATE;
  UPDATE "ClassWorkshop" SET "status" = (
    CASE
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" IN ('DRAFT','PUBLISHED')) THEN 'SCHEDULED'
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" = 'COMPLETED') THEN 'COMPLETED'
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" = 'CANCELLED') THEN 'CANCELLED'
      WHEN EXISTS (SELECT 1 FROM "AvailabilitySlot" WHERE "classWorkshopId" = target_id) THEN 'READY_TO_SCHEDULE'
      ELSE 'NEEDS_AVAILABILITY'
    END)::"ClassWorkshopStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = target_id;
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION sync_class_workshop_status() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM refresh_class_workshop_status(OLD."classWorkshopId"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM refresh_class_workshop_status(NEW."classWorkshopId"); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER session_class_workshop_status AFTER INSERT OR UPDATE OR DELETE ON "Workshop"
FOR EACH ROW EXECUTE FUNCTION sync_class_workshop_status();
CREATE TRIGGER availability_class_workshop_status AFTER INSERT OR UPDATE OR DELETE ON "AvailabilitySlot"
FOR EACH ROW EXECUTE FUNCTION sync_class_workshop_status();

-- Pending previews predate the new domain shape; durable applied history stays.
UPDATE "MatchingPreview" p SET "plan" = COALESCE((
  SELECT jsonb_agg(CASE WHEN item ? 'workshopId'
    THEN (item - 'workshopId') || jsonb_build_object('workshopSessionId', item->'workshopId')
    ELSE item END)
  FROM jsonb_array_elements(p."plan") item
), '[]'::jsonb) WHERE jsonb_typeof(p."plan") = 'array';
UPDATE "MatchingPreview" SET "expiresAt" = CURRENT_TIMESTAMP WHERE "appliedAt" IS NULL;
UPDATE "SchedulingSettings" SET "revision" = "revision" + 1;
COMMIT;
