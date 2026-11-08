-- Slow melody becomes Ambient (f-pattern-picker t-215). Hand-written: the generator would recreate the enum and cast
-- the column, which fails on the rows that still hold `slow_melody`. The value is renamed in place instead, so its
-- rows keep it as `ambient`, and every one of them is then split as the default role rule now splits a slow line:
-- Ambient where at least half the sounds it is on are ambient-type (tagged `ambient`, or a pad or a drone), Lead line
-- otherwise (`isAmbientSound`, `lib/app/patterns/library-facts.ts`). A role an admin set to Slow melody is split the
-- same way: it said "a slow line", and that is still true of it under either name. `editedAt` is left alone.

-- AlterEnum
ALTER TYPE "PatternRole" RENAME VALUE 'slow_melody' TO 'ambient';

-- A slow line on no sound, or on sounds fewer than half of which are ambient-type, is a Lead line.
UPDATE "library_pattern" p
SET "role" = 'lead_line'
WHERE p."role" = 'ambient'
  AND (
    SELECT count(*) = 0
      OR 2 * count(*) FILTER (WHERE 'ambient' = ANY (s."tags") OR s."tags"[1] IN ('pad', 'drone')) < count(*)
    FROM "synth_sound_pattern" sp
    JOIN "synth_sound" s ON s."id" = sp."soundId"
    WHERE sp."patternId" = p."id"
  );
