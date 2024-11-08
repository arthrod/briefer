-- CreateTable
CREATE TABLE "UserFile" (
    "id" SERIAL NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" SMALLINT NOT NULL DEFAULT 0,
    "createdUserId" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFile_fileId_idx" ON "UserFile"("fileId");
