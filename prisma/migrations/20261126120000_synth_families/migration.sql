-- CreateTable
CREATE TABLE "synth_family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultMember" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synth_family_member" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "synthId" TEXT,
    "differences" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synth_family_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "synth_family_member_synthId_key" ON "synth_family_member"("synthId");

-- CreateIndex
CREATE INDEX "synth_family_member_instrumentId_idx" ON "synth_family_member"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "synth_family_member_familyId_slug_key" ON "synth_family_member"("familyId", "slug");

-- AddForeignKey
ALTER TABLE "synth_family_member" ADD CONSTRAINT "synth_family_member_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "synth_family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synth_family_member" ADD CONSTRAINT "synth_family_member_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synth_family_member" ADD CONSTRAINT "synth_family_member_synthId_fkey" FOREIGN KEY ("synthId") REFERENCES "synth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

