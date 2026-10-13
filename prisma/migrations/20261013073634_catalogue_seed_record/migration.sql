-- What the catalogue seed last planned for each row (f-catalogue-admin t-32).
-- Hand-trimmed: Prisma also emitted drops for the vector and full-text indexes and the
-- searchVector default, which the schema cannot model (B13). Those are not this change.

-- CreateEnum
CREATE TYPE "CatalogueTable" AS ENUM ('SYNTH', 'SOUND', 'LINEAGE', 'NOTE');

-- CreateTable
CREATE TABLE "catalogue_seed_record" (
    "table" "CatalogueTable" NOT NULL,
    "key" TEXT NOT NULL,
    "synthId" TEXT,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_seed_record_pkey" PRIMARY KEY ("table","key")
);

-- CreateIndex
CREATE INDEX "catalogue_seed_record_synthId_idx" ON "catalogue_seed_record"("synthId");
