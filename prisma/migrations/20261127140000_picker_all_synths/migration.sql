-- f-synth-picker t-330: every synth ever made in the picker, and asking for one to be modelled.
--
-- Hand-written, as `migrate dev` would want to reset a database carrying the hand-written user FKs it cannot see.

-- What the picker lists for a visitor who has not changed it: the synths that play, or every synth ever made.
ALTER TABLE "synth_picker_settings" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'play';

-- One user's request for one databank instrument to be modelled.
CREATE TABLE "model_request" (
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_request_pkey" PRIMARY KEY ("userId","instrumentId")
);

CREATE INDEX "model_request_instrumentId_idx" ON "model_request"("instrumentId");

ALTER TABLE "model_request" ADD CONSTRAINT "model_request_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "bank_instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the schema has no @relation (that would need a field on the platform's User). CASCADE erases a user's
-- requests with them. Pinned by a drift probe (lib/app/db-drift.ts).
ALTER TABLE "model_request"
  ADD CONSTRAINT "model_request_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
