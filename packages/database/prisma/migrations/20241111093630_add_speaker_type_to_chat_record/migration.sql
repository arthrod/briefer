-- CreateEnum
CREATE TYPE "ChatSpeakerType" AS ENUM ('system', 'user', 'assistant');

-- AlterTable
ALTER TABLE "ChatRecord" ADD COLUMN     "speakerType" "ChatSpeakerType" NOT NULL DEFAULT 'user';
