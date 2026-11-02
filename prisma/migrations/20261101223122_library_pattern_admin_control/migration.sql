-- Admin control of the pattern library (f-pattern-library t-156, `.context/app/pattern-library.md`, Admin control):
-- who made each pattern, its rights risk, its status, a research batch's record, and admins' comments.
--
-- Generated with --create-only. The generator also emitted drops of every hand-written User FK, the vector and
-- full-text indexes, and the search vector's default, which the schema cannot model (B13); they are stripped.

-- CreateEnum
CREATE TYPE "PatternRightsRisk" AS ENUM ('none', 'needs_review', 'cleared', 'blocked');

-- CreateEnum
CREATE TYPE "PatternStatus" AS ENUM ('enabled', 'disabled');

-- AlterTable
ALTER TABLE "library_pattern" ADD COLUMN     "madeAt" TIMESTAMP(3),
ADD COLUMN     "madeBy" TEXT,
ADD COLUMN     "madeByUserId" TEXT,
ADD COLUMN     "research" JSONB,
ADD COLUMN     "rightsReason" TEXT,
ADD COLUMN     "rightsRisk" "PatternRightsRisk" NOT NULL DEFAULT 'none',
ADD COLUMN     "status" "PatternStatus" NOT NULL DEFAULT 'enabled',
ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "library_pattern_comment" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_pattern_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_pattern_comment_patternId_createdAt_idx" ON "library_pattern_comment"("patternId", "createdAt");

-- CreateIndex
CREATE INDEX "library_pattern_comment_authorId_idx" ON "library_pattern_comment"("authorId");

-- CreateIndex
CREATE INDEX "library_pattern_status_idx" ON "library_pattern"("status");

-- CreateIndex
CREATE INDEX "library_pattern_rightsRisk_idx" ON "library_pattern"("rightsRisk");

-- CreateIndex
CREATE INDEX "library_pattern_origin_idx" ON "library_pattern"("origin");

-- CreateIndex
CREATE INDEX "library_pattern_madeByUserId_idx" ON "library_pattern"("madeByUserId");

-- AddForeignKey
ALTER TABLE "library_pattern_comment" ADD CONSTRAINT "library_pattern_comment_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "library_pattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). SET NULL on both, so a
-- pattern and a comment outlive the person who made them. Pinned by drift probes (lib/app/db-drift.ts).
ALTER TABLE "library_pattern"
  ADD CONSTRAINT "library_pattern_madeByUserId_fkey"
  FOREIGN KEY ("madeByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "library_pattern_comment"
  ADD CONSTRAINT "library_pattern_comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (owner ruling, 2026-10-31): a transcribed or reconstructed pattern starts at Needs review, one in the style
-- of at None (the column's default). The riffs every sound came with were written by agents with the library.
UPDATE "library_pattern" SET "rightsRisk" = 'needs_review' WHERE "fidelity" IN ('transcribed', 'reconstructed');
UPDATE "library_pattern" SET "madeBy" = 'An AI agent, writing the sound library' WHERE "key" LIKE 'riff:%' AND "madeBy" IS NULL;
