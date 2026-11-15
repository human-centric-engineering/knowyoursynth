/**
 * Researched defaults (`f-pattern-library` t-254): the researched pattern each sound plays as its default, where the
 * pattern is of the song, artist or style the sound names.
 *
 * `syncResearchedPatterns` puts a researched pattern **behind** a sound's own riff, and the owner ruled on 2026-11-01
 * that it becomes the default only once an admin reorders the sound after the owner's listen. No reorder was ever
 * done, so a sound like the TEO-5's _Jump Brass_ ("In the style of Van Halen — “Jump”") still opened with its own
 * riff while _Jump: synth riff_ sat second on its list. The owner ruled again on 2026-11-15: a sound whose ref names a
 * work, artist or style, and that a researched pattern of it already names, takes that pattern as its default now.
 *
 * The choices are a committed file (`data/pattern-defaults.json`), not a rule worked out at seed time, so each one is
 * read in review. The seed keeps these rules, each tested:
 *
 * - **In front, the riff kept.** The pattern goes ahead of the sound's own riff pattern, which stays on the list.
 * - **The riff follows.** The sound's riff is rewritten to the pattern's first loop, as an admin's reorder rewrites it
 *   (`syncSoundPhrases`), so the panel and the sequencer play the same notes. The catalogue seed writes the riff of a
 *   sound that leads with another pattern only when it creates the row (`riffFollowers`, `seedCatalogue`'s
 *   `followsPattern`), so the two never take turns at it.
 * - **An admin's sound is never moved**: one an admin edited (a reorder that changes the default marks it), whose
 *   default is a pattern other than its own riff or a researched one, or with any other pattern ahead of its default
 *   (a disabled pick of an admin's, which becomes the default once enabled). An entry changed to another pattern
 *   moves the new one in front of the old, which stays on the list.
 * - **A re-run writes nothing**, and **an empty list writes nothing**.
 * - **Nothing is moved back.** Taking an entry out of the file leaves the sound as it is; demoting is an admin's act.
 * - **A sound, pattern or place that is not there is skipped and reported**, as is a pattern that cannot be a default
 *   (`headOf`: disabled, or `riffProblem`). A sound skipped so still has its riff brought to what it leads with, so a
 *   batch change that leaves a seeded default unplayable gives it its riff pattern's notes back.
 */
import { z } from 'zod';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import {
  DEFAULT_FIRST,
  headOf,
  riffKey,
  riffProblem,
  syncSoundPhrases,
  type LibraryDb,
} from '@/lib/app/patterns/library';

const SoundRef = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);
const ResearchedKey = z.string().regex(/^researched:[a-z0-9-]+\/[a-z0-9-]+$/);

export const PatternDefaultsSchema = z
  .object({
    /** The task that chose them: `t-254`. */
    task: z.string().regex(/^t-\d+$/),
    /** The owner's ruling they carry out, in a sentence. */
    ruling: z.string().trim().min(1).max(1000),
    /** Each sound and the researched pattern it plays as its default. */
    defaults: z.array(z.object({ sound: SoundRef, pattern: ResearchedKey }).strict()).max(5000),
    /** Sounds a researched pattern names that keep their own riff as their default, each with why. */
    notDefault: z
      .array(
        z
          .object({
            sound: SoundRef,
            pattern: ResearchedKey,
            reason: z.string().trim().min(1).max(1000),
          })
          .strict()
      )
      .max(5000),
  })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.defaults.forEach((d, i) => {
      if (seen.has(d.sound))
        ctx.addIssue({
          code: 'custom',
          path: ['defaults', i, 'sound'],
          message: 'A sound has one default',
        });
      seen.add(d.sound);
    });
  });
export type PatternDefaults = z.infer<typeof PatternDefaultsSchema>;
export type PatternDefault = PatternDefaults['defaults'][number];

/** What one run did. */
export interface DefaultSyncCounts {
  /** Sounds whose default it made the listed pattern. */
  promoted: number;
  /** Sounds whose default already was. */
  unchanged: number;
  /** Sounds an admin has made their own: left alone. */
  edited: number;
  /** Sounds whose riff it rewrote to their default's notes. */
  rewritten: number;
  skipped: { sound: string; reason: string }[];
}

/** Make each listed pattern its sound's default, and its sound's riff the pattern's first loop. */
export async function syncResearchedDefaults(
  db: LibraryDb,
  defaults: PatternDefault[]
): Promise<DefaultSyncCounts> {
  const counts: DefaultSyncCounts = {
    promoted: 0,
    unchanged: 0,
    edited: 0,
    rewritten: 0,
    skipped: [],
  };
  if (!defaults.length) return counts;

  const sounds = new Map(
    (
      await db.synthSound.findMany({
        where: {
          OR: defaults.map((d) => {
            const [synthId, slug] = d.sound.split('/');
            return { synthId, slug };
          }),
        },
        select: {
          id: true,
          synthId: true,
          slug: true,
          editedAt: true,
          patterns: {
            orderBy: DEFAULT_FIRST,
            select: {
              patternId: true,
              order: true,
              pattern: { select: { key: true, status: true, pattern: true } },
            },
          },
        },
      })
    ).map((s) => [`${s.synthId}/${s.slug}`, s])
  );

  const followed: string[] = [];
  const heads = new Set<string>();
  for (const d of defaults) {
    const skip = (reason: string) => counts.skipped.push({ sound: d.sound, reason });
    const sound = sounds.get(d.sound);
    if (!sound) {
      skip('Not in the catalogue');
      continue;
    }
    const place = sound.patterns.find((p) => p.pattern.key === d.pattern);
    if (!place) {
      skip(`${d.pattern} is not on its list`);
      continue;
    }
    const head = headOf(sound.patterns);
    const own = riffKey(sound.synthId, sound.slug);
    // Ahead of the default, only the sound's own riff or this pattern is the seed's: anything else an admin put there,
    // a disabled pick that becomes the default once enabled. With no default, what is ahead of the riff pattern.
    const stop = head ?? sound.patterns.find((p) => p.pattern.key === own);
    const ahead = stop ? sound.patterns.slice(0, sound.patterns.indexOf(stop)) : sound.patterns;
    if (head?.patternId === place.patternId) {
      counts.unchanged++;
    } else if (
      sound.editedAt ||
      // Its own riff, or a researched default the seed made before (this entry changed since): an admin's reorder
      // that changes the default marks the sound, so an unedited sound leads with one of these only by the seed.
      (head && head.pattern.key !== own && !head.pattern.key.startsWith('researched:')) ||
      ahead.some((p) => p.pattern.key !== own && p.patternId !== place.patternId)
    ) {
      counts.edited++;
      continue;
    } else {
      // `headOf` decides, as every read of the default does; the rest only words why not.
      if (!headOf([place])) {
        const parsed = PatternSchema.safeParse(place.pattern.pattern);
        const problem =
          place.pattern.status !== 'enabled'
            ? 'It is disabled'
            : !parsed.success
              ? 'It does not parse'
              : (riffProblem(parsed.data) ?? 'It cannot be a riff');
        skip(`${d.pattern} cannot be its default: ${problem}`);
        // The sound plays what leads it now, its riff pattern: a riff left on this pattern's old notes follows that.
        if (head) {
          followed.push(sound.id);
          heads.add(head.patternId);
        }
        continue;
      }
      const first = Math.min(...sound.patterns.map((p) => p.order));
      await db.synthSoundPattern.update({
        where: { soundId_patternId: { soundId: sound.id, patternId: place.patternId } },
        data: { order: first - 1 },
      });
      counts.promoted++;
    }
    followed.push(sound.id);
    heads.add(place.patternId);
  }

  // One pass for every sound it leads, whether moved now or before: a changed batch pattern, or a catalogue row
  // created afresh, leaves a riff that no longer plays its default.
  if (followed.length)
    counts.rewritten = (
      await syncSoundPhrases(db, { id: { in: followed } }, { heads: [...heads] })
    ).length;
  return counts;
}
