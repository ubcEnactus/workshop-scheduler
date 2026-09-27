-- CreateTable
CREATE TABLE "ClassMeetingSkip" (
    "id" TEXT NOT NULL,
    "classMeetingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassMeetingSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassMeetingSkip_classMeetingId_date_key" ON "ClassMeetingSkip"("classMeetingId", "date");

-- AddForeignKey
ALTER TABLE "ClassMeetingSkip" ADD CONSTRAINT "ClassMeetingSkip_classMeetingId_fkey" FOREIGN KEY ("classMeetingId") REFERENCES "ClassMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
