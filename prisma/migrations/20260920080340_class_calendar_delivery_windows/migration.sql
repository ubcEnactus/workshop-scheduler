-- Add class-wide availability without broadening any previously recorded
-- workshop-specific candidate. Existing IDs, bookings and assignments are untouched.
BEGIN;
-- AlterTable
ALTER TABLE "AvailabilitySlot" ADD COLUMN     "classSectionId" TEXT,
ALTER COLUMN "classWorkshopId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkshopDefinition" ADD COLUMN     "deliveryEndsOn" DATE,
ADD COLUMN     "deliveryStartsOn" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_classSectionId_start_end_key" ON "AvailabilitySlot"("classSectionId", "start", "end");

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_one_owner"
CHECK (("classSectionId" IS NULL) <> ("classWorkshopId" IS NULL));
ALTER TABLE "WorkshopDefinition" ADD CONSTRAINT "WorkshopDefinition_delivery_window"
CHECK (("deliveryStartsOn" IS NULL AND "deliveryEndsOn" IS NULL) OR
  ("deliveryStartsOn" IS NOT NULL AND "deliveryEndsOn" IS NOT NULL AND "deliveryEndsOn" >= "deliveryStartsOn"));

CREATE OR REPLACE FUNCTION refresh_class_workshop_status(target_id TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM 1 FROM "ClassWorkshop" WHERE "id" = target_id FOR UPDATE;
  UPDATE "ClassWorkshop" SET "status" = (
    CASE
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" IN ('DRAFT','PUBLISHED')) THEN 'SCHEDULED'
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" = 'COMPLETED') THEN 'COMPLETED'
      WHEN EXISTS (SELECT 1 FROM "Workshop" WHERE "classWorkshopId" = target_id AND "status" = 'CANCELLED') THEN 'CANCELLED'
      WHEN EXISTS (
        SELECT 1 FROM "AvailabilitySlot" a JOIN "ClassWorkshop" cw ON cw."id" = target_id
        JOIN "WorkshopDefinition" d ON d."id" = cw."workshopDefinitionId"
        WHERE (a."classWorkshopId" = cw."id" OR a."classSectionId" = cw."classSectionId")
        AND (d."deliveryStartsOn" IS NULL OR (a."start" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Vancouver')::date >= d."deliveryStartsOn")
        AND (d."deliveryEndsOn" IS NULL OR ((a."end" - INTERVAL '1 millisecond') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Vancouver')::date <= d."deliveryEndsOn")
      ) THEN 'READY_TO_SCHEDULE'
      ELSE 'NEEDS_AVAILABILITY'
    END)::"ClassWorkshopStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = target_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION sync_class_availability_status() RETURNS TRIGGER AS $$
DECLARE target_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    FOR target_id IN SELECT "id" FROM "ClassWorkshop" WHERE "id" = OLD."classWorkshopId" OR "classSectionId" = OLD."classSectionId" ORDER BY "id"
    LOOP PERFORM refresh_class_workshop_status(target_id); END LOOP;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    FOR target_id IN SELECT "id" FROM "ClassWorkshop" WHERE "id" = NEW."classWorkshopId" OR "classSectionId" = NEW."classSectionId" ORDER BY "id"
    LOOP PERFORM refresh_class_workshop_status(target_id); END LOOP;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER availability_class_workshop_status ON "AvailabilitySlot";
CREATE TRIGGER availability_class_workshop_status AFTER INSERT OR UPDATE OR DELETE ON "AvailabilitySlot"
FOR EACH ROW EXECUTE FUNCTION sync_class_availability_status();

CREATE FUNCTION sync_delivery_window_status() RETURNS TRIGGER AS $$
DECLARE target_id TEXT;
BEGIN
  FOR target_id IN SELECT "id" FROM "ClassWorkshop" WHERE "workshopDefinitionId" = NEW."id" ORDER BY "id"
  LOOP PERFORM refresh_class_workshop_status(target_id); END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER definition_delivery_window_status AFTER UPDATE OF "deliveryStartsOn", "deliveryEndsOn" ON "WorkshopDefinition"
FOR EACH ROW EXECUTE FUNCTION sync_delivery_window_status();
CREATE FUNCTION initialize_class_workshop_status() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_class_workshop_status(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER initialize_class_workshop_status AFTER INSERT OR UPDATE OF "workshopDefinitionId", "classSectionId" ON "ClassWorkshop"
FOR EACH ROW EXECUTE FUNCTION initialize_class_workshop_status();

UPDATE "MatchingPreview" SET "expiresAt" = CURRENT_TIMESTAMP WHERE "appliedAt" IS NULL;
UPDATE "SchedulingSettings" SET "revision" = "revision" + 1;
COMMIT;
