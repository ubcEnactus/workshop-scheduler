-- AlterTable
ALTER TABLE "ClassSection" ADD COLUMN     "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "defaultMaxPAs" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "defaultMinPAs" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "monthlyCadence" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "WorkshopBatch" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopBatch_requestKey_key" ON "WorkshopBatch"("requestKey");

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WorkshopBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_planning_defaults" CHECK ("monthlyCadence" BETWEEN 0 AND 31 AND "defaultDurationMinutes" BETWEEN 1 AND 1440 AND "defaultMinPAs" >= 1 AND "defaultMaxPAs" >= "defaultMinPAs");
