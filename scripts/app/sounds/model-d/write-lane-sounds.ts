/**
 * Writes the Model D's sounds played by their mod lanes from their specs: the thirty of `f-lane-sounds` t-301
 * (`lane-sounds.ts`) and the ten played on the mod wheel of `f-performance-wheels` t-312 (`wheel-sounds.ts`), each
 * set as its own batch. Each sound goes into the library file, its chained, laned pattern into its set's batch, and
 * that pattern as the sound's default. The riff each sound stores is its pattern's first loop, so the two always agree.
 * Run again after changing a spec: the sounds its last run wrote (named by the batch it wrote, so a renamed or dropped
 * spec's included) are replaced, and nothing else is touched.
 *
 *   npx tsx scripts/app/sounds/model-d/write-lane-sounds.ts
 *
 * Then add the new sounds to the check baseline (`npm run check:synths -- model-d --add-sounds`). Printing goes
 * through `console`, as every script's does (the `scripts/**` override in `eslint.config.mjs`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import modelD from '@/lib/app/synths/defs/model-d';
import type { Preset } from '@/lib/app/synths/contract';
import { validatePreset } from '@/lib/app/synths/validate';
import {
  buildPattern,
  checkHands,
  laneInWords,
  riffOf,
  writeLaneSounds,
} from '@/scripts/app/sounds/lane-kit';
import type { LaneSoundSpec } from '@/scripts/app/sounds/lane-kit';
import { LANE_SOUNDS, READOUTS } from '@/scripts/app/sounds/model-d/lane-sounds';
import { WHEEL_SOUNDS } from '@/scripts/app/sounds/model-d/wheel-sounds';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const DATA = join(ROOT, 'prisma', 'seeds', 'app-knowyoursynth', 'data');
const SOUNDS = join(DATA, 'sounds', 'model-d.json');
const DEFAULTS = join(DATA, 'pattern-defaults.json');

/** A set of lane sounds and the batch it is written as. */
interface LaneSet {
  specs: LaneSoundSpec[];
  batch: string;
  task: string;
  researchedAt: string;
}

const SETS: LaneSet[] = [
  {
    specs: LANE_SOUNDS,
    batch: join(DATA, 'patterns', 't301-model-d-lane-sounds.json'),
    task: 't-301',
    researchedAt: '2026-11-21',
  },
  {
    specs: WHEEL_SOUNDS,
    batch: join(DATA, 'patterns', 't312-model-d-wheel-sounds.json'),
    task: 't-312',
    researchedAt: '2026-11-24',
  },
];

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
// Read, not checked then read: a missing batch means a first run, any other failure stops.
function soundsBefore(batch: string): string[] {
  try {
    return readFile(BatchFile, batch).data.patterns.flatMap((p) => p.sounds);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return [];
    throw err;
  }
}

/** No lead exists for a song written for its sound (`pattern-library.md`, Free leads, and a best guess). */
const RULING =
  'no free lead has this part, so the notes are written to the style and taken from no record (owner ruling, 2026-11-02)';

/** Builds a set and checks every sound in it, or throws with every problem; writes nothing. */
function build(set: LaneSet) {
  const built = set.specs.map((s) => ({ spec: s, pattern: buildPattern(modelD, s.pattern) }));
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
  for (const s of sounds) {
    const result = validatePreset(modelD, s);
    if (!result.ok)
      problems.push(`${s.id}: ${result.problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  }
  return { set, built, sounds, problems };
}

/** A built set's batch: its laned patterns, each with the research record a written-for-the-sound song carries. */
function batchOf({ set, built }: ReturnType<typeof build>) {
  return {
    task: set.task,
    researchedBy: 'Claude Opus 5.5 (Claude Code), composed for the sound',
    researchedAt: set.researchedAt,
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
        part: `The whole song: parts ${pattern.chain.map((p) => 'AB'[p]).join('')}, with ${pattern.lanes!.map(laneInWords).join(' and ')} on mod lanes`,
        originalKey: null,
        originalBpm: null,
        leads: [],
        notes: `${spec.pattern.notes} An original song for the sound: ${RULING}.`,
        listenedAt: null,
      },
    })),
    notRecreated: [],
  };
}

// Every set is built and checked before any file is written, so a refused sound leaves every file as it was. The sets
// are written as one: what any set's last run wrote is this script's, so a sound may move from one set to the other.
const builds = SETS.map(build);
const problems = builds.flatMap((b) => b.problems);
const sounds = builds.flatMap((b) => b.sounds);
const ids = new Set<string>();
for (const s of sounds)
  if (ids.has(s.id)) problems.push(`${s.id}: in two sets`);
  else ids.add(s.id);
const mineBefore = new Set(
  SETS.flatMap((set) => soundsBefore(set.batch))
    .filter((k) => k.startsWith(SLUG))
    .map((k) => k.slice(SLUG.length))
);
const library = readFile(LibraryFile, SOUNDS);
const clash = library.data.sounds.filter((s) => ids.has(s.id) && !mineBefore.has(s.id));
if (clash.length) problems.push(`already in the library: ${clash.map((s) => s.id).join(', ')}`);
if (problems.length) throw new Error(problems.join('\n'));

const replaced = new Set([...ids, ...mineBefore]);
const kept = Items.parse(library.raw.sounds).filter(
  (_, i) => !replaced.has(library.data.sounds[i].id)
);
writeFileSync(
  SOUNDS,
  `${JSON.stringify({ ...library.raw, sounds: [...kept, ...(sounds satisfies Preset[])] }, null, 2)}\n`
);
for (const b of builds) writeFileSync(b.set.batch, `${JSON.stringify(batchOf(b), null, 2)}\n`);
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
        ...builds.flatMap((b) =>
          b.built.map(({ spec }) => ({ sound: `${SLUG}${spec.id}`, pattern: spec.pattern.key }))
        ),
      ],
    },
    null,
    2
  )}\n`
);

execFileSync('npx', ['prettier', '--write', SOUNDS, DEFAULTS, ...SETS.map((s) => s.batch)], {
  cwd: ROOT,
  stdio: 'ignore',
});
console.log(
  `${builds.map((b) => `${b.sounds.length} (${b.set.task})`).join(' and ')} lane sounds written; the library has ${kept.length + sounds.length}`
);
