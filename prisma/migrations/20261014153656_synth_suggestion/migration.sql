-- f-databank t-37: a synth a user says is missing from the databank, queued for an admin.
-- The generator's drops of the vector and full-text indexes (and the searchVector default) were stripped: the schema
-- cannot model them (B13).

-- CreateEnum
CREATE TYPE "SynthSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'MERGED', 'DECLINED');

-- CreateTable
CREATE TABLE "synth_suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "link" TEXT,
    "note" TEXT,
    "status" "SynthSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "instrumentId" TEXT,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synth_suggestion_status_createdAt_idx" ON "synth_suggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "synth_suggestion_userId_idx" ON "synth_suggestion"("userId");

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). SET NULL keeps an
-- erased user's suggestion as databank history with nobody attached. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "synth_suggestion"
  ADD CONSTRAINT "synth_suggestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
