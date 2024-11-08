/*
  Warnings:

  - Changed the type of `chatId` on the `ChatDocumentRelation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `chatId` on the `ChatFileRelation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "ChatDocumentRelation" DROP COLUMN "chatId",
ADD COLUMN     "chatId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "ChatFileRelation" DROP COLUMN "chatId",
ADD COLUMN     "chatId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelation" ADD CONSTRAINT "ChatDocumentRelation_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFileRelation" ADD CONSTRAINT "ChatFileRelation_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
