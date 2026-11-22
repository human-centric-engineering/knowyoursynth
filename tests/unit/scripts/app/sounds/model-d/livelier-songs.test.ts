/**
 * The Model D's livelier songs (`f-livelier-patterns` t-304): the batch on disk is what the specs write, so a spec
 * edited without running the writer (or a batch edited by hand) fails here. What the seed requires of the batch is
 * tested with every batch, in `library-researched.test.ts`.
 *
 * @see scripts/app/sounds/model-d/livelier-songs.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import modelD from '@/lib/app/synths/defs/model-d';
import { PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { buildSong } from '@/scripts/app/sounds/lane-kit';
import {
  LIVELIER,
  livelierKey,
  songSpecOf,
  stacc,
} from '@/scripts/app/sounds/model-d/livelier-songs';

const BatchFileSchema = z.object({
  patterns: z.array(z.object({ key: z.string(), pattern: z.unknown() })),
});
const DIR = join(process.cwd(), 'prisma/seeds/app-knowyoursynth/data/patterns');
const NAME = 't304-model-d-livelier-songs.json';
const patternsIn = (file: string): Map<string, Pattern> => {
  const raw = BatchFileSchema.parse(JSON.parse(readFileSync(join(DIR, file), 'utf8')));
  return new Map(raw.patterns.map((p) => [p.key, PatternSchema.parse(p.pattern)]));
};
const batch = patternsIn(NAME);
const others = new Map(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== NAME)
    .flatMap((f) => [...patternsIn(f)])
);

describe('the livelier songs batch', () => {
  it('holds exactly one song for each spec', () => {
    expect(batch.size).toBe(LIVELIER.length);
    expect([...batch.keys()].sort()).toEqual(LIVELIER.map((s) => livelierKey(s.sound)).sort());
  });

  it.each(LIVELIER.map((s) => [s.sound, s] as const))('%s is what its spec writes', (_, s) => {
    const from = typeof s.a === 'string' ? null : others.get(s.a.from);
    if (typeof s.a !== 'string') expect(from, s.a.from).toBeDefined();
    const built = buildSong(modelD, songSpecOf(s, from ? from.parts[0].steps : null));
    expect(batch.get(livelierKey(s.sound))).toEqual(built);
    // A song on a transcription keeps its part A note for note, so its sound's riff does not move.
    if (from) expect(built.parts[0]).toEqual(from.parts[0]);
  });
});

describe('stacc', () => {
  it('cuts only one-step notes to the gate, keeping accents, slides and ratchets', () => {
    expect(stacc('A2 . C3:2 D3! E3^ F3*2 |', 0.4)).toBe('A2:0.4 . C3:2 D3:0.4! E3:0.4^ F3:0.4*2 |');
  });
});
