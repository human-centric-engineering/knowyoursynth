-- f-profiles r1: a user's synth profile (username, links, visibility) and the usernames held after a change.
-- Stripped from the generator's output (B13): the drops of the vector and full-text indexes and of the searchVector
-- default, which the schema cannot model, and the drops of the hand-written userId FKs on synth_suggestion,
-- user_sound, synth_preference, user_preference, lesson_progress and favourite, which it cannot see.

-- CreateTable
CREATE TABLE "synth_profile" (
    "userId" TEXT NOT NULL,
    "username" VARCHAR(24) NOT NULL,
    "usernameChangedAt" TIMESTAMP(3),
    "youtube" TEXT,
    "spotify" TEXT,
    "instagram" TEXT,
    "bandcamp" TEXT,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "showOwned" BOOLEAN NOT NULL DEFAULT false,
    "showWishlist" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "held_username" (
    "username" VARCHAR(24) NOT NULL,
    "heldUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "held_username_pkey" PRIMARY KEY ("username")
);

-- CreateIndex
CREATE UNIQUE INDEX "synth_profile_username_key" ON "synth_profile"("username");

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- profile with them. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "synth_profile"
  ADD CONSTRAINT "synth_profile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
