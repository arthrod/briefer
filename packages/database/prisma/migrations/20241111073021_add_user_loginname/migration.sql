/*
  Warnings:

  - A unique constraint covering the columns `[loginName]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "User_loginName_key" ON "User"("loginName");
