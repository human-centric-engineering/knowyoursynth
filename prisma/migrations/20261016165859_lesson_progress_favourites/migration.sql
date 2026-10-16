-- f-my-sounds s4: how far a signed-in user has got through each lesson, and what they have starred.
-- Stripped from the generator's output (B13): the drops of the vector and full-text indexes and of the searchVector
-- default, which the schema cannot model, and the drops of the hand-written synth_suggestion_userId_fkey (t-37),
-- user_sound_userId_fkey (s1), synth_preference_userId_fkey and user_preference_userId_fkey (s3), which it cannot see.

-- CreateTable
CREATE TABLE "lesson_progress" (
    "userId" TEXT NOT NULL,
    "soundId" TEXT NOT NULL,
    "furthestStep" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("userId","soundId")
);

-- CreateTable
CREATE TABLE "favourite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "synthId" TEXT,
    "synthSoundId" TEXT,
    "userSoundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_progress_soundId_idx" ON "lesson_progress"("soundId");

-- CreateIndex
CREATE INDEX "favourite_synthId_idx" ON "favourite"("synthId");

-- CreateIndex
CREATE INDEX "favourite_synthSoundId_idx" ON "favourite"("synthSoundId");

-- CreateIndex
CREATE INDEX "favourite_userSoundId_idx" ON "favourite"("userSoundId");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_userId_synthId_key" ON "favourite"("userId", "synthId");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_userId_synthSoundId_key" ON "favourite"("userId", "synthSoundId");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_userId_userSoundId_key" ON "favourite"("userId", "userSoundId");

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_soundId_fkey" FOREIGN KEY ("soundId") REFERENCES "synth_sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite" ADD CONSTRAINT "favourite_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite" ADD CONSTRAINT "favourite_synthSoundId_fkey" FOREIGN KEY ("synthSoundId") REFERENCES "synth_sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite" ADD CONSTRAINT "favourite_userSoundId_fkey" FOREIGN KEY ("userSoundId") REFERENCES "user_sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- lesson progress and favourites with them. Pinned by drift probes (lib/app/db-drift.ts).
ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "lesson_progress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favourite"
  ADD CONSTRAINT "favourite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
