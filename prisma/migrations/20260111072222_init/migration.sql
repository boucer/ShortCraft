/*
  Warnings:

  - You are about to drop the column `industry` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `outputLanguage` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Project` table. All the data in the column will be lost.
  - The `status` column on the `Project` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `type` on the `ProjectOutput` table. All the data in the column will be lost.
  - You are about to drop the column `uiLocale` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationToken` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `userId` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Made the column `title` on table `Project` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `kind` to the `ProjectOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locale` to the `ProjectOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ProjectOutput` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropIndex
DROP INDEX "Client_ownerId_idx";

-- DropIndex
DROP INDEX "Project_ownerId_idx";

-- DropIndex
DROP INDEX "ProjectOutput_projectId_type_key";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "industry",
DROP COLUMN "ownerId",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "outputLanguage",
DROP COLUMN "ownerId",
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "title" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "ProjectOutput" DROP COLUMN "type",
ADD COLUMN     "kind" TEXT NOT NULL,
ADD COLUMN     "locale" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "uiLocale";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "VerificationToken";

-- DropEnum
DROP TYPE "OutputLanguage";

-- DropEnum
DROP TYPE "OutputType";

-- DropEnum
DROP TYPE "ProjectStatus";

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "ProjectOutput_projectId_locale_kind_idx" ON "ProjectOutput"("projectId", "locale", "kind");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
