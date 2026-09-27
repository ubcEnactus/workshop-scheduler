/*
  Warnings:

  - You are about to drop the `ClassTeacherTransfer` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClassTeacherTransfer" DROP CONSTRAINT "ClassTeacherTransfer_classSectionId_fkey";

-- DropTable
DROP TABLE "ClassTeacherTransfer";

-- CreateTable
CREATE TABLE "PublicationReceipt" (
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sessionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationReceipt_pkey" PRIMARY KEY ("requestKey")
);
