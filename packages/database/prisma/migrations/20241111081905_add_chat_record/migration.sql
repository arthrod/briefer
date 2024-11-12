-- CreateTable
CREATE TABLE "ChatRecord" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" BYTEA NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3),

    CONSTRAINT "ChatRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatRecord" ADD CONSTRAINT "ChatRecord_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
