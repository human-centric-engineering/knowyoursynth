/**
 * Writes the Moog DFAM's and the Behringer EDGE's libraries (`prisma/seeds/app-knowyoursynth/data/sounds/dfam.json`,
 * `edge.json`; t-269, t-270) from their specs, designed by the method in `.context/app/sequencer-synths.md`. The
 * DFAM's begins with its manual's guided tour and patch sheets; the EDGE's are its own, since the DFAM's reach it as
 * its family's sibling sounds.
 *
 *   npx tsx scripts/app/sounds/dfam/write.ts
 *
 * Then run the synth check (`npm run check:synths -- dfam`, and `-- edge`). Printing goes through `console`, as every
 * script's does (the `scripts/**` override in `eslint.config.mjs`).
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import dfam from '@/lib/app/synths/defs/dfam';
import edge from '@/lib/app/synths/defs/edge';
import { writeSounds } from '@/scripts/app/sounds/lesson-writer';
import { MANUAL } from '@/scripts/app/sounds/dfam/manual';
import { DRUMS, KEYS, MELODIC } from '@/scripts/app/sounds/dfam/designed';
import { EDGE } from '@/scripts/app/sounds/dfam/edge';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const DIR = join(ROOT, 'prisma', 'seeds', 'app-knowyoursynth', 'data', 'sounds');

for (const [def, specs] of [
  [dfam, [...MANUAL, ...DRUMS, ...MELODIC, ...KEYS]],
  [edge, EDGE],
] as const) {
  const file = join(DIR, `${def.id}.json`);
  const sounds = writeSounds(def, [...specs]);
  writeFileSync(
    file,
    `${JSON.stringify({ synth: def.id, version: def.version, sounds }, null, 2)}\n`
  );
  execFileSync('npx', ['prettier', '--write', file], { cwd: ROOT, stdio: 'ignore' });
  console.log(`${def.id}: ${sounds.length} sounds written`);
}
