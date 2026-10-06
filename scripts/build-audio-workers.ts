/**
 * Bundle the sound engine's two off-main-thread entry points into static files Next serves.
 *
 *   lib/app/synths/audio/worklet-entry.ts       → public/worklets/kys-voice.js  (the AudioWorklet, WORKLET_URL)
 *   lib/app/synths/audio/probe-worker-entry.ts  → public/worklets/kys-probe.js  (the sound-map Worker, PROBE_WORKER_URL)
 *
 * The prototype embedded both as strings in its one HTML file (`prototype/build.mjs`, `__WORKLET_SRC__` /
 * `__PROBE_SRC__`). An AudioWorklet module and a Worker script are each loaded by URL and run in their own global
 * scope, so they cannot be ordinary Next chunks: each is bundled stand-alone, with everything it imports, as one IIFE.
 *
 * Runs before `npm run dev` and `npm run build` (the `predev` / `prebuild` scripts). The outputs are build products
 * and are gitignored.
 *
 * Usage:
 *   npx tsx scripts/build-audio-workers.ts
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'worklets');

/** Entry → output file name. The URLs the app loads them from are WORKLET_URL and PROBE_WORKER_URL. */
const AUDIO_WORKERS: { entry: string; out: string }[] = [
  { entry: 'lib/app/synths/audio/worklet-entry.ts', out: 'kys-voice.js' },
  { entry: 'lib/app/synths/audio/probe-worker-entry.ts', out: 'kys-probe.js' },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { entry, out } of AUDIO_WORKERS) {
    const outfile = join(OUT_DIR, out);
    await build({
      entryPoints: [join(ROOT, entry)],
      outfile,
      bundle: true,
      minify: true,
      format: 'iife',
      target: 'es2020',
      legalComments: 'none',
      // `@/…` resolves through tsconfig.json's `paths`, which esbuild reads from the project root.
      tsconfig: join(ROOT, 'tsconfig.json'),
      logLevel: 'warning',
    });
    console.log(`audio worker: ${entry} → ${relative(ROOT, outfile)}`);
  }
}

main().catch((err: unknown) => {
  console.error('build-audio-workers failed:', err);
  process.exit(1);
});
