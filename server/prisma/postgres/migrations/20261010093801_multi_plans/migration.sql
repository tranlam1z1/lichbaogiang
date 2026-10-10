-- DropIndex
DROP INDEX "Plan_userId_key";

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Plan_userId_updatedAt_idx" ON "Plan"("userId", "updatedAt");
