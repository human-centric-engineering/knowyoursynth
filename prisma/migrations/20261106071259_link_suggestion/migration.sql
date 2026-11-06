-- Link suggestions (f-link-suggestions t-185): a video or link a user says belongs on an instrument, a library sound,
-- a song or an artist, queued for an admin. Spec: .context/app/links.md (Suggestions).
--
-- Hand-edited: the generator also emitted drops for the hand-written user FKs, the vector and full-text indexes and
-- the search-vector default, none of which this migration may touch (B13). They were stripped.

-- CreateEnum
CREATE TYPE "LinkTargetKind" AS ENUM ('instrument', 'sound', 'song', 'artist');

-- CreateEnum
CREATE TYPE "LinkSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "link_suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "targetKind" "LinkTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "status" "LinkSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "linkId" TEXT,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "link_suggestion_status_createdAt_idx" ON "link_suggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "link_suggestion_userId_idx" ON "link_suggestion"("userId");

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). SET NULL keeps an
-- erased user's suggestion as history with nobody attached. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "link_suggestion"
  ADD CONSTRAINT "link_suggestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
