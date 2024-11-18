-- AlterTable
ALTER TABLE "ChatRecord" ADD COLUMN     "status" SMALLINT NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ChatRecord_chatId_idx" ON "ChatRecord"("chatId");
