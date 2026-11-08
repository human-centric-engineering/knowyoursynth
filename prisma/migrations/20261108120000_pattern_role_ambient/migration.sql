-- Slow melody becomes Ambient (f-pattern-picker t-215). Hand-written: the generator would recreate the enum and cast
-- the column, which fails on the rows that still hold `slow_melody`. The value is renamed in place instead, so its
-- rows keep it as `ambient`, and every one of them is then split as the default role rule now splits a slow line:
-- Ambient where at least half the sounds it is on are ambient-type (tagged `ambient`, or a pad or a drone), Lead line
-- otherwise (`isAmbientSound`, `lib/app/patterns/library-facts.ts`). "The sounds it is on" is read as the seed reads
-- it, so the next seed agrees: a sound's riff pattern by its own sound alone (`planRiffPattern`), a research batch's
-- -low or -high copy by the pattern it copies, and every other pattern by the sounds it is placed on. A research
-- pattern's role is its batch's, which this cannot read; the seed sets it on every one nobody edited. A role an admin
-- set to Slow melody is split the same way: it said "a slow line", and that is still true of it under either name.
-- `editedAt` is left alone.

-- AlterEnum
ALTER TYPE "PatternRole" RENAME VALUE 'slow_melody' TO 'ambient';

-- A riff pattern is a Lead line unless its own sound is ambient-type.
UPDATE "library_pattern" p
SET "role" = 'lead_line'
WHERE p."role" = 'ambient'
  AND p."key" LIKE 'riff:%'
  AND NOT EXISTS (
    SELECT 1
    FROM "synth_sound" s
    WHERE p."key" = 'riff:' || s."synthId" || '/' || s."slug"
      AND ('ambient' = ANY (s."tags") OR s."tags"[1] IN ('pad', 'drone'))
  );

-- Any other pattern, but a copy whose pattern is in the library, is a Lead line on no sound, or on sounds fewer than
-- half of which are ambient-type.
UPDATE "library_pattern" p
SET "role" = 'lead_line'
WHERE p."role" = 'ambient'
  AND p."key" NOT LIKE 'riff:%'
  AND NOT (
    p."key" ~ '^researched:.*-(low|high)(-2)?$'
    AND EXISTS (
      SELECT 1 FROM "library_pattern" b WHERE b."key" = regexp_replace(p."key", '-(low|high)(-2)?$', '')
    )
  )
  AND (
    SELECT count(*) = 0
      OR 2 * count(*) FILTER (WHERE 'ambient' = ANY (s."tags") OR s."tags"[1] IN ('pad', 'drone')) < count(*)
    FROM "synth_sound_pattern" sp
    JOIN "synth_sound" s ON s."id" = sp."soundId"
    WHERE sp."patternId" = p."id"
  );

-- A copy plays its pattern's part an octave away, so it takes that pattern's role, now split above.
UPDATE "library_pattern" c
SET "role" = 'lead_line'
FROM "library_pattern" b
WHERE c."role" = 'ambient'
  AND c."key" ~ '^researched:.*-(low|high)(-2)?$'
  AND b."key" = regexp_replace(c."key", '-(low|high)(-2)?$', '')
  AND b."role" = 'lead_line';
