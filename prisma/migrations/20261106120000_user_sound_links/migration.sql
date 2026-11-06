-- f-link-suggestions t-187: an owner's videos and recordings on their own sound, at most five, in their order.
-- Written by hand, as `prisma migrate diff` would emit this change: the generator also emits drops for the hand-written
-- user FKs and the vector/full-text indexes it cannot model (B13), which are left out.

-- AlterTable
ALTER TABLE "user_sound" ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]';
