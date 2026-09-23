-- CreateTable
CREATE TABLE "DraftStaffingOperation" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "workshopDefinitionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoRequestKey" TEXT,
    "undoActorId" TEXT,

    CONSTRAINT "DraftStaffingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoFillExclusion" (
    "id" TEXT NOT NULL,
    "workshopSessionId" TEXT NOT NULL,
    "paId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoFillExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftStaffingOperation_requestKey_key" ON "DraftStaffingOperation"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "DraftStaffingOperation_undoRequestKey_key" ON "DraftStaffingOperation"("undoRequestKey");

-- CreateIndex
CREATE INDEX "DraftStaffingOperation_workshopDefinitionId_actorId_created_idx" ON "DraftStaffingOperation"("workshopDefinitionId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoFillExclusion_paId_idx" ON "AutoFillExclusion"("paId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoFillExclusion_workshopSessionId_paId_key" ON "AutoFillExclusion"("workshopSessionId", "paId");

-- AddForeignKey
ALTER TABLE "DraftStaffingOperation" ADD CONSTRAINT "DraftStaffingOperation_workshopDefinitionId_fkey" FOREIGN KEY ("workshopDefinitionId") REFERENCES "WorkshopDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoFillExclusion" ADD CONSTRAINT "AutoFillExclusion_workshopSessionId_fkey" FOREIGN KEY ("workshopSessionId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoFillExclusion" ADD CONSTRAINT "AutoFillExclusion_paId_fkey" FOREIGN KEY ("paId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
