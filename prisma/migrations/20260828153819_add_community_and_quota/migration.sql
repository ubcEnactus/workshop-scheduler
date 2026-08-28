-- AlterTable
ALTER TABLE "School" ADD COLUMN     "community" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "community" TEXT,
ADD COLUMN     "monthlyQuota" INTEGER;

-- AlterTable
ALTER TABLE "Workshop" ALTER COLUMN "minPAs" SET DEFAULT 3,
ALTER COLUMN "maxPAs" SET DEFAULT 5;
