-- DropIndex
DROP INDEX "User_loginName_key";

-- DropIndex
DROP INDEX "User_name_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "loginName" DROP DEFAULT;
