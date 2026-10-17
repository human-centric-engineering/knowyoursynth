-- f-sharing h1: the daily publish cap counts first publications kept on the profile, so deleting a published sound
-- does not give its place back.

-- AlterTable
ALTER TABLE "synth_profile" ADD COLUMN     "recentPublishes" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];
