/*
  Warnings:

  - You are about to drop the column `dueDate` on the `Flashcard` table. All the data in the column will be lost.
  - You are about to drop the column `easeFactor` on the `Flashcard` table. All the data in the column will be lost.
  - You are about to drop the column `interval` on the `Flashcard` table. All the data in the column will be lost.
  - You are about to drop the column `isBookmarked` on the `Flashcard` table. All the data in the column will be lost.
  - You are about to drop the column `lastReviewed` on the `Flashcard` table. All the data in the column will be lost.
  - You are about to drop the column `repetitions` on the `Flashcard` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Flashcard" DROP COLUMN "dueDate",
DROP COLUMN "easeFactor",
DROP COLUMN "interval",
DROP COLUMN "isBookmarked",
DROP COLUMN "lastReviewed",
DROP COLUMN "repetitions";

-- CreateTable
CREATE TABLE "UserFlashcardStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewed" TIMESTAMP(3),
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "isLearned" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFlashcardStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFlashcardStatus_userId_flashcardId_key" ON "UserFlashcardStatus"("userId", "flashcardId");

-- AddForeignKey
ALTER TABLE "UserFlashcardStatus" ADD CONSTRAINT "UserFlashcardStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFlashcardStatus" ADD CONSTRAINT "UserFlashcardStatus_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
