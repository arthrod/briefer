-- CreateTable
CREATE TABLE "ChatRecordFileRelation" (
    "id" UUID NOT NULL,
    "chatRecordId" UUID NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRecordFileRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRecordFileRelation_chatRecordId_idx" ON "ChatRecordFileRelation"("chatRecordId");

-- CreateIndex
CREATE INDEX "ChatRecordFileRelation_fileId_idx" ON "ChatRecordFileRelation"("fileId");

-- AddForeignKey
ALTER TABLE "ChatRecordFileRelation" ADD CONSTRAINT "ChatRecordFileRelation_chatRecordId_fkey" FOREIGN KEY ("chatRecordId") REFERENCES "ChatRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRecordFileRelation" ADD CONSTRAINT "ChatRecordFileRelation_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UserFile"("fileId") ON DELETE RESTRICT ON UPDATE CASCADE;
