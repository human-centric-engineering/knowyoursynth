/**
 * Writes the Model D's sounds played by their mod lanes (`f-lane-sounds` t-301) from their specs
 * (`lane-sounds.ts`): each sound into the library file, its chained, laned pattern into a batch of its own, and that
 * pattern as the sound's default. The riff each sound stores is its pattern's first loop, so the two always agree.
 * Run again after changing a spec: the sounds its last run wrote (named by the batch it wrote, so a renamed or dropped
 * spec's included) are replaced, and nothing else is touched.
 *
 *   npx tsx scripts/app/sounds/model-d/write-lane-sounds.ts
 *
 * Then add the new sounds to the check baseline (`npm run check:synths -- model-d --add-sounds`). Printing goes
 * through `console`, as every script's does (the `scripts/**` override in `eslint.config.mjs`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import modelD from '@/lib/app/synths/defs/model-d';
import type { Preset } from '@/lib/app/synths/contract';
import { validatePreset } from '@/lib/app/synths/validate';
import { buildPattern, checkHands, riffOf, writeLaneSounds } from '@/scripts/app/sounds/lane-kit';
import { LANE_SOUNDS, READOUTS } from '@/scripts/app/sounds/model-d/lane-sounds';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const DATA = join(ROOT, 'prisma', 'seeds', 'app-knowyoursynth', 'data');
const SOUNDS = join(DATA, 'sounds', 'model-d.json');
const BATCH = join(DATA, 'patterns', 't301-model-d-lane-sounds.json');
const DEFAULTS = join(DATA, 'pattern-defaults.json');

const built = LANE_SOUNDS.map((s) => {
  const pattern = buildPattern(modelD, s.pattern);
  return { spec: s, pattern };
});

const sounds = writeLaneSounds(
  modelD,
  READOUTS,
  built.map(({ spec, pattern }) => ({ spec, riff: riffOf(pattern), bpm: pattern.bpm }))
);
const problems: string[] = [];
sounds.forEach((s, k) => {
  try {
    checkHands(modelD, s, built[k].pattern);
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
});
if (problems.length) throw new Error(problems.join('\n'));
for (const s of sounds) {
  const result = validatePreset(modelD, s);
  if (!result.ok)
    throw new Error(`${s.id}: ${result.problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
}

// Each file is checked for the shape this script reads, and written back from the JSON as it came, so a field this
// script does not know, and every key's place, are kept.
const Json = z.record(z.string(), z.unknown());
const Items = z.array(z.unknown());
const LibraryFile = z.object({ sounds: z.array(z.object({ id: z.string() })) });
const BatchFile = z.object({ patterns: z.array(z.object({ sounds: z.array(z.string()) })) });
const DefaultsFile = z.object({ defaults: z.array(z.object({ sound: z.string() })) });
function readFile<T>(
  schema: z.ZodType<T>,
  path: string
): { raw: Record<string, unknown>; data: T } {
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return { raw: Json.parse(json), data: schema.parse(json) };
}

/** The sounds this script wrote last time, by the batch it wrote them with: renamed or dropped specs included. */
const SLUG = 'model-d/';
const before = existsSync(BATCH)
  ? readFile(BatchFile, BATCH).data.patterns.flatMap((p) => p.sounds)
  : [];
const mineBefore = new Set(
  before.filter((k) => k.startsWith(SLUG)).map((k) => k.slice(SLUG.length))
);
const ids = new Set(sounds.map((s) => s.id));
const library = readFile(LibraryFile, SOUNDS);
const clash = library.data.sounds.filter((s) => ids.has(s.id) && !mineBefore.has(s.id));
if (clash.length) throw new Error(`already in the library: ${clash.map((s) => s.id).join(', ')}`);
const replaced = new Set([...ids, ...mineBefore]);
const kept = Items.parse(library.raw.sounds).filter(
  (_, i) => !replaced.has(library.data.sounds[i].id)
);
writeFileSync(
  SOUNDS,
  `${JSON.stringify({ ...library.raw, sounds: [...kept, ...(sounds satisfies Preset[])] }, null, 2)}\n`
);
const total = kept.length + sounds.length;

/** No lead exists for a song written for its sound (`pattern-library.md`, Free leads, and a best guess). */
const RULING =
  'no free lead has this part, so the notes are written to the style and taken from no record (owner ruling, 2026-11-02)';

const batch = {
  task: 't-301',
  researchedBy: 'Claude Opus 5.5 (Claude Code), composed for the sound',
  researchedAt: '2026-11-21',
  patterns: built.map(({ spec, pattern }) => ({
    key: spec.pattern.key,
    name: spec.pattern.name,
    role: spec.pattern.role,
    tempo: {
      min: Math.max(20, Math.round(pattern.bpm * 0.85)),
      max: Math.round(pattern.bpm * 1.15),
    },
    inspiredBy: { kind: 'genre', label: spec.pattern.genre },
    fidelity: 'in_the_style_of',
    sources: [],
    pattern,
    sounds: [`model-d/${spec.id}`],
    research: {
      work: `An original pattern, written for ${spec.name}`,
      part: `The whole song: parts ${pattern.chain.map((p) => 'AB'[p]).join('')}, with ${pattern.lanes!.join(' and ')} on mod lanes`,
      originalKey: null,
      originalBpm: null,
      leads: [],
      notes: `${spec.pattern.notes} An original song for the sound: ${RULING}.`,
      listenedAt: null,
    },
  })),
  notRecreated: [],
};
writeFileSync(BATCH, `${JSON.stringify(batch, null, 2)}\n`);

const defaults = readFile(DefaultsFile, DEFAULTS);
const mine = new Set([...replaced].map((id) => `${SLUG}${id}`));
const keptDefaults = Items.parse(defaults.raw.defaults).filter(
  (_, i) => !mine.has(defaults.data.defaults[i].sound)
);
writeFileSync(
  DEFAULTS,
  `${JSON.stringify(
    {
      ...defaults.raw,
      defaults: [
        ...keptDefaults,
        ...built.map(({ spec }) => ({ sound: `${SLUG}${spec.id}`, pattern: spec.pattern.key })),
      ],
    },
    null,
    2
  )}\n`
);

execFileSync('npx', ['prettier', '--write', SOUNDS, BATCH, DEFAULTS], {
  cwd: ROOT,
  stdio: 'ignore',
});
console.log(`${sounds.length} lane sounds written; the library has ${total}`);
