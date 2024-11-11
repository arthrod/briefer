/*
  Warnings:

  - A unique constraint covering the columns `[fileId]` on the table `UserFile` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `documentId` on the `ChatDocumentRelation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "ChatDocumentRelation" DROP COLUMN "documentId",
ADD COLUMN     "documentId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_fileId_key" ON "UserFile"("fileId");

-- AddForeignKey
ALTER TABLE "ChatDocumentRelation" ADD CONSTRAINT "ChatDocumentRelation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFileRelation" ADD CONSTRAINT "ChatFileRelation_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UserFile"("fileId") ON DELETE RESTRICT ON UPDATE CASCADE;
