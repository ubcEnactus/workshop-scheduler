-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'OPEN', 'SCHEDULED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WorkshopStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED');

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "grade" TEXT,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMeeting" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ClassMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "minPAs" INTEGER NOT NULL DEFAULT 1,
    "maxPAs" INTEGER NOT NULL DEFAULT 3,
    "status" "WorkshopStatus" NOT NULL DEFAULT 'UNSCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "paId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");

-- CreateIndex
CREATE INDEX "ClassSection_teacherId_idx" ON "ClassSection"("teacherId");

-- CreateIndex
CREATE INDEX "ClassSection_schoolId_idx" ON "ClassSection"("schoolId");

-- CreateIndex
CREATE INDEX "ClassMeeting_classSectionId_idx" ON "ClassMeeting"("classSectionId");

-- CreateIndex
CREATE INDEX "Workshop_cycleId_idx" ON "Workshop"("cycleId");

-- CreateIndex
CREATE INDEX "Workshop_classSectionId_idx" ON "Workshop"("classSectionId");

-- CreateIndex
CREATE INDEX "Workshop_status_idx" ON "Workshop"("status");

-- CreateIndex
CREATE INDEX "Assignment_paId_idx" ON "Assignment"("paId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_workshopId_paId_key" ON "Assignment"("workshopId", "paId");

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMeeting" ADD CONSTRAINT "ClassMeeting_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_paId_fkey" FOREIGN KEY ("paId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

