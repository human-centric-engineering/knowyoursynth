-- f-my-sounds s1: a sound a user made on a synth, kept under their account.
-- Stripped from the generator's output (B13): the drops of the vector and full-text indexes and of the searchVector
-- default, which the schema cannot model, and the drop of the hand-written synth_suggestion_userId_fkey (t-37), which
-- it cannot see.

-- CreateTable
CREATE TABLE "user_sound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "synthId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "values" JSONB NOT NULL,
    "cables" JSONB NOT NULL,
    "sourceSoundId" TEXT,
    "sourceSlug" TEXT,
    "sourceName" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_sound_userId_updatedAt_idx" ON "user_sound"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "user_sound_synthId_idx" ON "user_sound"("synthId");

-- CreateIndex
CREATE INDEX "user_sound_sourceSoundId_idx" ON "user_sound"("sourceSoundId");

-- AddForeignKey
ALTER TABLE "user_sound" ADD CONSTRAINT "user_sound_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sound" ADD CONSTRAINT "user_sound_sourceSoundId_fkey" FOREIGN KEY ("sourceSoundId") REFERENCES "synth_sound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- sounds with them. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "user_sound"
  ADD CONSTRAINT "user_sound_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
