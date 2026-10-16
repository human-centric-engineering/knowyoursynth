-- f-profiles r2: the synths a user owns and wants, picked from the databank's instruments.
-- Stripped from the generator's output (B13): the drops of the vector and full-text indexes and of the searchVector
-- default, which the schema cannot model, and the drops of the hand-written userId FKs on synth_suggestion,
-- user_sound, synth_preference, user_preference, lesson_progress, favourite and synth_profile, which it cannot see.

-- CreateEnum
CREATE TYPE "OwnedInstrumentKind" AS ENUM ('owned', 'wishlist');

-- CreateTable
CREATE TABLE "owned_instrument" (
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "kind" "OwnedInstrumentKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owned_instrument_pkey" PRIMARY KEY ("userId","instrumentId")
);

-- CreateIndex
CREATE INDEX "owned_instrument_userId_kind_position_idx" ON "owned_instrument"("userId", "kind", "position");

-- CreateIndex
CREATE INDEX "owned_instrument_instrumentId_idx" ON "owned_instrument"("instrumentId");

-- AddForeignKey
ALTER TABLE "owned_instrument" ADD CONSTRAINT "owned_instrument_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- lists with them. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "owned_instrument"
  ADD CONSTRAINT "owned_instrument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
