/**
 * Records the golden values of every ported synth from the prototype's definition, into
 * `tests/fixtures/synths/goldens/<id>.json` (see `scripts/synth-goldens.ts` for what is recorded and why).
 *
 *   npx tsx scripts/record-synth-goldens.ts            every synth in SYNTH_DEFS
 *   npx tsx scripts/record-synth-goldens.ts <id> ...   only these
 *
 * Run it once when a synth is ported, and commit the file. The prototype is the spec (D3), so the goldens are never
 * re-recorded to make a port pass: a mismatch is a port that differs from the prototype. Like `check:synths`, this
 * bundles `prototype/src/synths/index.js` with esbuild when it runs; it is a dev-only tool, and nothing in the app
 * imports `prototype/` (D13).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { SynthDef } from '@/lib/app/synths/contract';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import { recordGoldens } from '@/scripts/synth-goldens';

const ROOT = resolve(import.meta.dirname, '..');
const PROTOTYPE_SRC = join(ROOT, 'prototype', 'src');
const OUT_DIR = join(ROOT, 'tests', 'fixtures', 'synths', 'goldens');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
/** The shape `recordGoldens` reads; the prototype's definitions are untyped JavaScript. */
const isSynthDef = (v: unknown): v is SynthDef =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  Array.isArray(v.controls) &&
  Array.isArray(v.jacks) &&
  isRecord(v.init) &&
  typeof v.toEngine === 'function';

async function loadPrototypeSynths(): Promise<SynthDef[]> {
  const outDir = join(tmpdir(), 'kys-synth-goldens');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `synths.${process.pid}.out.mjs`);
  await build({
    entryPoints: [join(PROTOTYPE_SRC, 'synths', 'index.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: outFile,
    alias: { '@': PROTOTYPE_SRC },
    loader: { '.js': 'jsx' },
    logLevel: 'warning',
  });
  try {
    const mod: unknown = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
    const synths = isRecord(mod) ? mod.SYNTHS : undefined;
    if (!Array.isArray(synths) || !synths.every(isSynthDef))
      throw new Error('prototype/src/synths/index.js did not export a SYNTHS list of definitions');
    return synths;
  } finally {
    rmSync(outFile, { force: true });
  }
}

async function main(ids: string[]): Promise<void> {
  const wanted = ids.length ? ids : SYNTH_DEFS.map((d) => d.id);
  const prototypes = new Map((await loadPrototypeSynths()).map((d) => [d.id, d]));
  mkdirSync(OUT_DIR, { recursive: true });
  for (const id of wanted) {
    const def = prototypes.get(id);
    if (!def) throw new Error(`the prototype has no synth ${id}`);
    const goldens = recordGoldens(def);
    writeFileSync(join(OUT_DIR, `${id}.json`), `${JSON.stringify(goldens, null, 2)}\n`);
    console.log(
      `${id}: ${Object.keys(goldens.readouts).length} readouts, ${Object.keys(goldens.engine).length} engine settings, ${Object.keys(goldens.checks).length} checks, ${Object.keys(goldens.depths).length} depths, ${Object.keys(goldens.hears).length} hears`
    );
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.log('ERR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
