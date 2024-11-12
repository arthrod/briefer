-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" SMALLINT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" TIMESTAMP(3),

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDocumentRelation" (
    "id" BIGSERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDocumentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatFileRelation" (
    "id" BIGSERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFileRelation_pkey" PRIMARY KEY ("id")
);
