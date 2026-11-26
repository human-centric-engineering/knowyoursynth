-- The databank originals a synth family brings together (t-324). Empty: its members share one original.
ALTER TABLE "synth_family" ADD COLUMN "originals" TEXT[] DEFAULT ARRAY[]::TEXT[];
