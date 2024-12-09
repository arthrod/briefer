-- CreateTable
CREATE TABLE "ChatRecordTask" (
    "id" UUID NOT NULL,
    "chatRecordId" UUID NOT NULL,
    "agentTaskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" UUID,
    "subTaskCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "variable" TEXT,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRecordTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRecordTask_chatRecordId_idx" ON "ChatRecordTask"("chatRecordId");

-- CreateIndex
CREATE INDEX "ChatRecordTask_parentId_idx" ON "ChatRecordTask"("parentId");

-- AddForeignKey
ALTER TABLE "ChatRecordTask" ADD CONSTRAINT "ChatRecordTask_chatRecordId_fkey" FOREIGN KEY ("chatRecordId") REFERENCES "ChatRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRecordTask" ADD CONSTRAINT "ChatRecordTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatRecordTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
