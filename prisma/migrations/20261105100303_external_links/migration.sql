-- Videos and links (f-videos-and-links t-179). Spec: .context/app/links.md.
--
-- Hand-edited: the generator also emitted drops for the hand-written user FKs, the vector and full-text indexes and
-- the search-vector default, none of which this migration may touch (B13). They were stripped.

-- CreateEnum
CREATE TYPE "LinkProvider" AS ENUM ('youtube', 'vimeo', 'spotify', 'bandcamp', 'soundcloud', 'other');

-- CreateEnum
CREATE TYPE "LinkKind" AS ENUM ('demo', 'review', 'performance', 'lesson', 'original');

-- CreateTable
CREATE TABLE "external_link" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT,
    "soundId" TEXT,
    "songId" TEXT,
    "artistId" TEXT,
    "url" TEXT NOT NULL,
    "provider" "LinkProvider" NOT NULL,
    "providerId" TEXT,
    "kind" "LinkKind" NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "ours" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "statsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_link_provider_idx" ON "external_link"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "external_link_instrumentId_url_key" ON "external_link"("instrumentId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "external_link_soundId_url_key" ON "external_link"("soundId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "external_link_songId_url_key" ON "external_link"("songId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "external_link_artistId_url_key" ON "external_link"("artistId", "url");

-- AddForeignKey
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_soundId_fkey" FOREIGN KEY ("soundId") REFERENCES "synth_sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_songId_fkey" FOREIGN KEY ("songId") REFERENCES "bank_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "bank_artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A link is about exactly one thing. Prisma cannot model a CHECK, so this is hand-written and pinned by a drift probe
-- (lib/app/db-drift.ts).
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_one_owner"
  CHECK (num_nonnulls("instrumentId", "soundId", "songId", "artistId") = 1);
