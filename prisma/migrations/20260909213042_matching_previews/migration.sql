-- CreateTable
CREATE TABLE "MatchingPreview" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "classIds" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "MatchingPreview_pkey" PRIMARY KEY ("id")
);
