/**
 * Writes the Model D's sounds played by their mod lanes (`f-lane-sounds` t-301) from their specs
 * (`lane-sounds.ts`): each sound into the library file, its chained, laned pattern into a batch of its own, and that
 * pattern as the sound's default. The riff each sound stores is its pattern's first loop, so the two always agree.
 * Run again after changing a spec: each sound and pattern is replaced in place, nothing else is touched.
 *
 *   npx tsx scripts/app/sounds/model-d/write-lane-sounds.ts
 *
 * Then add the new sounds to the check baseline (`npm run check:synths -- model-d --add-sounds`). Printing goes
 * through `console`, as every script's does (the `scripts/**` override in `eslint.config.mjs`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import modelD from '@/lib/app/synths/defs/model-d';
import type { Preset } from '@/lib/app/synths/contract';
import { validatePreset } from '@/lib/app/synths/validate';
import { buildPattern, riffOf, writeLaneSounds } from '@/scripts/app/sounds/lane-kit';
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
for (const s of sounds) {
  const result = validatePreset(modelD, s);
  if (!result.ok)
    throw new Error(`${s.id}: ${result.problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
}

const ids = new Set(sounds.map((s) => s.id));
const library = JSON.parse(readFileSync(SOUNDS, 'utf8')) as { sounds: Preset[] };
const clash = library.sounds.filter(
  (s) => ids.has(s.id) && !built.some((b) => b.spec.id === s.id && b.spec.name === s.name)
);
if (clash.length) throw new Error(`already in the library: ${clash.map((s) => s.id).join(', ')}`);
library.sounds = [...library.sounds.filter((s) => !ids.has(s.id)), ...sounds];
writeFileSync(SOUNDS, `${JSON.stringify(library, null, 2)}\n`);

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

const defaults = JSON.parse(readFileSync(DEFAULTS, 'utf8')) as {
  defaults: { sound: string; pattern: string }[];
};
const mine = new Set(sounds.map((s) => `model-d/${s.id}`));
defaults.defaults = [
  ...defaults.defaults.filter((d) => !mine.has(d.sound)),
  ...built.map(({ spec }) => ({ sound: `model-d/${spec.id}`, pattern: spec.pattern.key })),
];
writeFileSync(DEFAULTS, `${JSON.stringify(defaults, null, 2)}\n`);

execFileSync('npx', ['prettier', '--write', SOUNDS, BATCH, DEFAULTS], {
  cwd: ROOT,
  stdio: 'ignore',
});
console.log(`${sounds.length} lane sounds written; the library has ${library.sounds.length}`);
