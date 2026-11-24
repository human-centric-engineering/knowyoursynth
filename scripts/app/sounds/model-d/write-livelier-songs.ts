/**
 * Writes the Model D's livelier songs (`f-livelier-patterns` t-304) from their specs (`livelier-songs.ts`): each
 * song into a batch of its own, as its sound's default, and, for a sound whose riff was its own, the riff the sound
 * stores (the song's first loop, so the two always agree). A song built on a transcription keeps that transcription's
 * part A note for note, so its sound's riff does not move. Run again after changing a spec: the batch and the
 * defaults it wrote are replaced, and nothing else is touched.
 *
 *   npx tsx scripts/app/sounds/model-d/write-livelier-songs.ts
 *
 * Then re-record the changed riffs in the check baseline (`npm run check:synths -- model-d --compare`, see
 * `lane-sounds.md`). Printing goes through `console`, as every script's does.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import modelD from '@/lib/app/synths/defs/model-d';
import { validatePreset } from '@/lib/app/synths/validate';
import { phraseOf } from '@/lib/app/patterns/library';
import { PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { buildSong, checkHands, laneInWords, tweakNamesLane } from '@/scripts/app/sounds/lane-kit';
import {
  LIVELIER,
  livelierKey as key,
  songSpecOf,
  type LivelierSpec,
} from '@/scripts/app/sounds/model-d/livelier-songs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const DATA = join(ROOT, 'prisma', 'seeds', 'app-knowyoursynth', 'data');
const SOUNDS = join(DATA, 'sounds', 'model-d.json');
const PATTERNS = join(DATA, 'patterns');
const BATCH_NAME = 't304-model-d-livelier-songs.json';
const BATCH = join(PATTERNS, BATCH_NAME);
const DEFAULTS = join(DATA, 'pattern-defaults.json');
const SLUG = 'model-d/';

const Json = z.record(z.string(), z.unknown());
const Items = z.array(z.unknown());
const Researched = z.object({
  key: z.string(),
  inspiredBy: z.record(z.string(), z.unknown()),
  pattern: z.unknown(),
});
const BatchFile = z.object({ patterns: z.array(Researched) });
const LibraryFile = z.object({ sounds: z.array(z.object({ id: z.string() })) });
const DefaultsFile = z.object({
  defaults: z.array(z.object({ sound: z.string() })),
  notDefault: z.array(z.object({ sound: z.string() })),
});
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// The transcriptions a song keeps as its part A, from every other batch.
const transcriptions = new Map<string, { inspiredBy: Record<string, unknown>; pattern: Pattern }>();
for (const f of readdirSync(PATTERNS).filter((n) => n.endsWith('.json') && n !== BATCH_NAME))
  for (const p of BatchFile.parse(read(join(PATTERNS, f))).patterns)
    transcriptions.set(p.key, {
      inspiredBy: p.inspiredBy,
      pattern: PatternSchema.parse(p.pattern),
    });

const library = { raw: Json.parse(read(SOUNDS)), data: LibraryFile.parse(read(SOUNDS)) };
const rawSounds = Items.parse(library.raw.sounds).map((s) => Json.parse(s));

function build(s: LivelierSpec) {
  const from = typeof s.a === 'string' ? null : transcriptions.get(s.a.from);
  if (typeof s.a !== 'string' && !from) throw new Error(`${s.sound}: no transcription ${s.a.from}`);
  if (from && s.genre) throw new Error(`${s.sound}: a song keeps its transcription's Inspired by`);
  if (!from && !s.genre) throw new Error(`${s.sound}: a composed song names its genre`);
  if (from) {
    // The transcription's grid, so part A plays exactly as it did.
    const t = from.pattern;
    if (t.bpm !== s.bpm || t.stepSize !== (s.stepSize ?? '1/16') || t.swing !== (s.swing ?? 50))
      throw new Error(
        `${s.sound}: write it at the transcription's ${t.bpm} bpm, ${t.stepSize}, swing ${t.swing}`
      );
  }
  const spec = songSpecOf(s, from ? from.pattern.parts[0].steps : null);
  const pattern = buildSong(modelD, spec);
  const raw = rawSounds.find((r) => r.id === s.sound);
  if (!raw) throw new Error(`${s.sound}: not in the Model D's library`);
  const checked = validatePreset(modelD, raw);
  if (!checked.ok) throw new Error(`${s.sound}: ${JSON.stringify(checked.problems)}`);
  for (const id of pattern.lanes ?? [])
    if (!checked.value.tweaks.some((t) => tweakNamesLane(t, id)))
      throw new Error(`${s.sound}: a lane on ${id}, which none of its tweaks names`);
  if (pattern.lanes?.length) checkHands(modelD, checked.value, pattern);
  return { spec: s, pattern, from, raw };
}

const problems: string[] = [];
const built = LIVELIER.flatMap((s) => {
  try {
    return [build(s)];
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
    return [];
  }
});
if (problems.length) throw new Error(problems.join('\n'));
const slugs = built.map((b) => b.spec.sound);
if (new Set(slugs).size !== slugs.length) throw new Error('a sound is reworked twice');

// A composed song's sound stores its first loop as its riff. A song's sound follows its transcription already.
for (const b of built) if (!b.from) b.raw.phrase = phraseOf(b.pattern);
writeFileSync(SOUNDS, `${JSON.stringify({ ...library.raw, sounds: rawSounds }, null, 2)}\n`);

/** No lead exists for a song written for its sound (`pattern-library.md`, Free leads, and a best guess). */
const RULING =
  'no free lead has this part, so the notes are written to the style and taken from no record (owner ruling, 2026-11-02)';
const partsOf = (p: Pattern) => p.chain.map((i) => 'AB'[i]).join('');
const batch = {
  task: 't-304',
  researchedBy: 'Claude Opus 5.5 (Claude Code), composed for the sound',
  researchedAt: '2026-11-22',
  patterns: built.map(({ spec, pattern, from }) => ({
    key: key(spec.sound),
    name: spec.name,
    role: spec.role,
    tempo: {
      min: Math.max(20, Math.round(pattern.bpm * 0.85)),
      max: Math.round(pattern.bpm * 1.15),
    },
    inspiredBy: from ? from.inspiredBy : { kind: 'genre', label: spec.genre },
    fidelity: 'in_the_style_of',
    sources: [],
    pattern,
    sounds: [`${SLUG}${spec.sound}`],
    research: {
      work: from
        ? `A variation on ${(spec.a as { from: string }).from.replace('researched:', '')}, written for the sound`
        : `An original pattern, written for the sound`,
      part: `The whole song: parts ${partsOf(pattern)}${pattern.lanes?.length ? `, with ${pattern.lanes.map(laneInWords).join(' and ')} on mod lanes` : ''}${pattern.fx ? `, with the ${Object.keys(pattern.fx).join(' and ')} on` : ''}`,
      originalKey: null,
      originalBpm: null,
      leads: [],
      notes: from
        ? `${spec.notes} Part B is ${RULING}.`
        : `${spec.notes} An original song for the sound: ${RULING}.`,
      listenedAt: null,
    },
  })),
  notRecreated: [],
};
writeFileSync(BATCH, `${JSON.stringify(batch, null, 2)}\n`);

const defaults = { raw: Json.parse(read(DEFAULTS)), data: DefaultsFile.parse(read(DEFAULTS)) };
const mine = new Set(slugs.map((s) => `${SLUG}${s}`));
// Any default this batch takes over is replaced in place; the rest are kept as they are.
const rawDefaults = Items.parse(defaults.raw.defaults);
const kept = rawDefaults.filter((_, i) => !mine.has(defaults.data.defaults[i].sound));
// A sound the file had ruled keeps its own riff now plays its song: it is decided here, once.
const keptNot = Items.parse(defaults.raw.notDefault).filter(
  (_, i) => !mine.has(defaults.data.notDefault[i].sound)
);
writeFileSync(
  DEFAULTS,
  `${JSON.stringify(
    {
      ...defaults.raw,
      notDefault: keptNot,
      defaults: [
        ...kept,
        ...built.map(({ spec }) => ({ sound: `${SLUG}${spec.sound}`, pattern: key(spec.sound) })),
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
const composed = built.filter((b) => !b.from).length;
console.log(
  `${built.length} songs written: ${composed} composed (their riffs moved), ${built.length - composed} on transcriptions`
);
