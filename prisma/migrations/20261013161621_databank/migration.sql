-- CreateTable
CREATE TABLE "bank_maker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "born" TEXT,
    "died" TEXT,
    "country" TEXT NOT NULL,
    "companies" TEXT[],
    "summary" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "innovations" TEXT[],
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_maker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_instrument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "recreationOfId" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_instrument_person" (
    "instrumentId" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "bank_instrument_person_pkey" PRIMARY KEY ("instrumentId","makerId")
);

-- CreateTable
CREATE TABLE "bank_instrument_synth" (
    "instrumentId" TEXT NOT NULL,
    "synthId" TEXT NOT NULL,

    CONSTRAINT "bank_instrument_synth_pkey" PRIMARY KEY ("instrumentId","synthId")
);

-- CreateTable
CREATE TABLE "bank_artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "active" TEXT NOT NULL,
    "eras" TEXT[],
    "genres" TEXT[],
    "roles" TEXT[],
    "summary" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "innovations" TEXT[],
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_artist_member" (
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "bank_artist_member_pkey" PRIMARY KEY ("groupId","memberId")
);

-- CreateTable
CREATE TABLE "bank_artist_instrument" (
    "artistId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "bank_artist_instrument_pkey" PRIMARY KEY ("artistId","instrumentId")
);

-- CreateTable
CREATE TABLE "bank_song" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" TEXT,
    "album" TEXT,
    "credit" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_song_artist" (
    "songId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "bank_song_artist_pkey" PRIMARY KEY ("songId","artistId")
);

-- CreateTable
CREATE TABLE "bank_song_part" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "on" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "playerId" TEXT,

    CONSTRAINT "bank_song_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_part_instrument" (
    "partId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "bank_part_instrument_pkey" PRIMARY KEY ("partId","instrumentId")
);

-- CreateTable
CREATE TABLE "bank_part_synth" (
    "partId" TEXT NOT NULL,
    "synthId" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL,
    "sound" TEXT,
    "note" TEXT,

    CONSTRAINT "bank_part_synth_pkey" PRIMARY KEY ("partId","synthId")
);

-- CreateIndex
CREATE INDEX "bank_instrument_recreationOfId_idx" ON "bank_instrument"("recreationOfId");

-- CreateIndex
CREATE INDEX "bank_instrument_person_makerId_idx" ON "bank_instrument_person"("makerId");

-- CreateIndex
CREATE INDEX "bank_instrument_synth_synthId_idx" ON "bank_instrument_synth"("synthId");

-- CreateIndex
CREATE INDEX "bank_artist_member_memberId_idx" ON "bank_artist_member"("memberId");

-- CreateIndex
CREATE INDEX "bank_artist_instrument_instrumentId_idx" ON "bank_artist_instrument"("instrumentId");

-- CreateIndex
CREATE INDEX "bank_song_artist_artistId_idx" ON "bank_song_artist"("artistId");

-- CreateIndex
CREATE INDEX "bank_song_part_playerId_idx" ON "bank_song_part"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_song_part_songId_order_key" ON "bank_song_part"("songId", "order");

-- CreateIndex
CREATE INDEX "bank_part_instrument_instrumentId_idx" ON "bank_part_instrument"("instrumentId");

-- CreateIndex
CREATE INDEX "bank_part_synth_synthId_idx" ON "bank_part_synth"("synthId");

-- AddForeignKey
ALTER TABLE "bank_instrument" ADD CONSTRAINT "bank_instrument_recreationOfId_fkey" FOREIGN KEY ("recreationOfId") REFERENCES "bank_instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_instrument_person" ADD CONSTRAINT "bank_instrument_person_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_instrument_person" ADD CONSTRAINT "bank_instrument_person_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "bank_maker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_instrument_synth" ADD CONSTRAINT "bank_instrument_synth_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_instrument_synth" ADD CONSTRAINT "bank_instrument_synth_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_artist_member" ADD CONSTRAINT "bank_artist_member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "bank_artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_artist_member" ADD CONSTRAINT "bank_artist_member_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "bank_artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_artist_instrument" ADD CONSTRAINT "bank_artist_instrument_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "bank_artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_artist_instrument" ADD CONSTRAINT "bank_artist_instrument_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_song_artist" ADD CONSTRAINT "bank_song_artist_songId_fkey" FOREIGN KEY ("songId") REFERENCES "bank_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_song_artist" ADD CONSTRAINT "bank_song_artist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "bank_artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_song_part" ADD CONSTRAINT "bank_song_part_songId_fkey" FOREIGN KEY ("songId") REFERENCES "bank_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_song_part" ADD CONSTRAINT "bank_song_part_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "bank_artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_part_instrument" ADD CONSTRAINT "bank_part_instrument_partId_fkey" FOREIGN KEY ("partId") REFERENCES "bank_song_part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_part_instrument" ADD CONSTRAINT "bank_part_instrument_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_part_synth" ADD CONSTRAINT "bank_part_synth_partId_fkey" FOREIGN KEY ("partId") REFERENCES "bank_song_part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_part_synth" ADD CONSTRAINT "bank_part_synth_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
