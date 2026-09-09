-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkshopChange" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "WorkshopChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopEvent" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "wasPublished" BOOLEAN NOT NULL,
    "affectedPAIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopChange_workshopId_idx" ON "WorkshopChange"("workshopId");

-- CreateIndex
CREATE INDEX "WorkshopEvent_workshopId_createdAt_idx" ON "WorkshopEvent"("workshopId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkshopChange" ADD CONSTRAINT "WorkshopChange_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopEvent" ADD CONSTRAINT "WorkshopEvent_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
