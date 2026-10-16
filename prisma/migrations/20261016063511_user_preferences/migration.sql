-- f-my-sounds s3: a signed-in user's settings and last panel on each synth, kept under their account.
-- Stripped from the generator's output (B13): the drops of the vector and full-text indexes and of the searchVector
-- default, which the schema cannot model, and the drops of the hand-written synth_suggestion_userId_fkey (t-37) and
-- user_sound_userId_fkey (s1), which it cannot see.

-- CreateTable
CREATE TABLE "synth_preference" (
    "userId" TEXT NOT NULL,
    "synthId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "presetId" TEXT,
    "step" INTEGER,
    "soundId" TEXT,
    "values" JSONB NOT NULL,
    "cables" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_preference_pkey" PRIMARY KEY ("userId","synthId")
);

-- CreateTable
CREATE TABLE "user_preference" (
    "userId" TEXT NOT NULL,
    "tips" BOOLEAN,
    "dim" BOOLEAN,
    "heat" BOOLEAN,
    "harm" BOOLEAN,
    "fx" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "synth_preference_synthId_idx" ON "synth_preference"("synthId");

-- AddForeignKey
ALTER TABLE "synth_preference" ADD CONSTRAINT "synth_preference_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- last panels and settings with them. Pinned by drift probes (lib/app/db-drift.ts).
ALTER TABLE "synth_preference"
  ADD CONSTRAINT "synth_preference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_preference"
  ADD CONSTRAINT "user_preference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
