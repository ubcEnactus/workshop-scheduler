-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Availability_valid_slot" CHECK (
      "dayOfWeek" BETWEEN 0 AND 6
      AND "startMin" BETWEEN 0 AND 1439
      AND ("startMin" % 30) = 0
    )
);


-- CreateIndex
CREATE INDEX "Availability_dayOfWeek_startMin_idx" ON "Availability"("dayOfWeek", "startMin");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_dayOfWeek_startMin_key" ON "Availability"("userId", "dayOfWeek", "startMin");

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
