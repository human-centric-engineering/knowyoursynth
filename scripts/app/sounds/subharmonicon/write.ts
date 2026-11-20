/**
 * Writes the Subharmonicon's library (`prisma/seeds/app-knowyoursynth/data/sounds/subharmonicon.json`) from its
 * specs (`f-own-sequencer` t-289), designed by the method in `.context/app/sequencer-synths.md`. The manual's guided
 * start and patch sheets, already in the file, are kept as they are and listed after the new sounds' first family.
 *
 *   npx tsx scripts/app/sounds/subharmonicon/write.ts
 *
 * Then run the synth check (`npm run check:synths -- subharmonicon`). Printing goes through `console`, as every
 * script's does (the `scripts/**` override in `eslint.config.mjs`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import subharmonicon from '@/lib/app/synths/defs/subharmonicon';
import type { Preset } from '@/lib/app/synths/contract';
import { writeSounds } from '@/scripts/app/sounds/lesson-writer';
import { FAMILIES } from '@/scripts/app/sounds/subharmonicon/families';

/** The manual's sounds, kept from the file: its guided start, then its patch sheets. */
const MANUAL = [
  'shc-first-sequence',
  'shc-poly-rock',
  'shc-cloud-path',
  'shc-aquatic-chords',
  'shc-mellow-harmonies',
  'shc-point-zero',
  'shc-three-hands',
  'shc-bateria',
  'shc-spiral-ways',
  'shc-star-gate',
];

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const FILE = join(
  ROOT,
  'prisma',
  'seeds',
  'app-knowyoursynth',
  'data',
  'sounds',
  'subharmonicon.json'
);

const data = JSON.parse(readFileSync(FILE, 'utf8')) as {
  synth: string;
  version: number;
  sounds: Preset[];
};
const kept = MANUAL.map((id) => {
  const s = data.sounds.find((x) => x.id === id);
  if (!s) throw new Error(`the manual's ${id} is not in the file`);
  return s;
});
const [guided, ...sheets] = kept;
const written = writeSounds(subharmonicon, FAMILIES.flat());
data.sounds = [guided, ...written, ...sheets];
writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
execFileSync('npx', ['prettier', '--write', FILE], { cwd: ROOT, stdio: 'ignore' });
console.log(
  `${data.sounds.length} sounds written (${written.length} new, ${kept.length} from the manual)`
);
