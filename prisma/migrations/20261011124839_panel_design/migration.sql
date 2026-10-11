-- Panel design per synth (D11, f-panel-designs t-27).
-- Hand-trimmed: Prisma also emitted drops for the vector and full-text indexes and the
-- searchVector default, which the schema cannot model (B13). Those are not this change.

-- CreateEnum
CREATE TYPE "PanelDesign" AS ENUM ('NEUTRAL', 'FAITHFUL');

-- AlterTable
ALTER TABLE "synth" ADD COLUMN     "design" "PanelDesign" NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN     "designApprovalNote" TEXT,
ADD COLUMN     "designApprovedAt" TIMESTAMP(3),
ADD COLUMN     "designApprovedBy" TEXT;
