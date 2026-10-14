-- f-databank t-36: the record of a databank row an admin removed, so the seed does not re-create it.
-- CreateTable
CREATE TABLE "bank_removal" (
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_removal_pkey" PRIMARY KEY ("kind","id")
);
