-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Deck_isPublic_idx" ON "Deck"("isPublic");
