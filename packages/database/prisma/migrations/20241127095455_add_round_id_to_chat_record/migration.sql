-- AlterTable
ALTER TABLE "ChatRecord" ADD COLUMN     "roundId" UUID;

-- CreateIndex
CREATE INDEX "ChatRecord_roundId_idx" ON "ChatRecord"("roundId");
