-- CreateEnum
CREATE TYPE "SynthNoteKind" AS ENUM ('UNUSUAL', 'LIMIT_INTRO', 'LIMIT');

-- CreateTable
CREATE TABLE "synth" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "heritage" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synth_sound" (
    "id" TEXT NOT NULL,
    "synthId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "tags" TEXT[],
    "level" INTEGER NOT NULL,
    "blurb" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "phrase" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "tweaks" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_sound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synth_lineage" (
    "synthId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "timeline" JSONB NOT NULL,
    "relatives" JSONB NOT NULL,
    "users" TEXT[],
    "note" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_lineage_pkey" PRIMARY KEY ("synthId")
);

-- CreateTable
CREATE TABLE "synth_note" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SynthNoteKind" NOT NULL,
    "synthId" TEXT,
    "target" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synth_listed_order_idx" ON "synth"("listed", "order");

-- CreateIndex
CREATE INDEX "synth_sound_synthId_order_idx" ON "synth_sound"("synthId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "synth_sound_synthId_slug_key" ON "synth_sound"("synthId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "synth_note_key_key" ON "synth_note"("key");

-- CreateIndex
CREATE INDEX "synth_note_synthId_kind_order_idx" ON "synth_note"("synthId", "kind", "order");

-- AddForeignKey
ALTER TABLE "synth_sound" ADD CONSTRAINT "synth_sound_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synth_lineage" ADD CONSTRAINT "synth_lineage_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synth_note" ADD CONSTRAINT "synth_note_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
