-- A link the seed has applied in this database (f-videos-and-links t-200). The generator also emitted drops of the
-- hand-written user foreign keys, the knowledge search and vector indexes and a column default, which the schema
-- cannot model (B13); they were removed, so this migration only creates the table.

-- CreateTable
CREATE TABLE "link_seed_record" (
    "ownerKind" "LinkTargetKind" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_seed_record_pkey" PRIMARY KEY ("ownerKind","ownerId","url")
);
