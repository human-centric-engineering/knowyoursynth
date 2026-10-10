/**
 * The prototype's synth definitions (with their sounds), bundled out of `prototype/src/synths/index.js` with
 * esbuild for this run and loaded from a temporary file. Shared by the dev-only tools that hold the port to the prototype
 * (D3): `check-synths.ts` and `record-synth-goldens.ts`. That is a build of a file path, not an import specifier;
 * nothing in the app imports `prototype/` (D13).
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { SynthDef } from '@/lib/app/synths/contract';
import { isRecord } from '@/lib/app/synths/lib/patch';

const PROTOTYPE_SRC = join(resolve(import.meta.dirname, '..'), 'prototype', 'src');

/** The shape the tools read; the prototype's definitions are untyped JavaScript. */
const isSynthDefList = (v: unknown): v is SynthDef[] =>
  Array.isArray(v) &&
  v.every(
    (d) =>
      isRecord(d) &&
      typeof d.id === 'string' &&
      typeof d.toEngine === 'function' &&
      Array.isArray(d.controls) &&
      Array.isArray(d.jacks) &&
      isRecord(d.init) &&
      (d.presets === undefined || Array.isArray(d.presets))
  );

export async function loadPrototypeSynths(): Promise<SynthDef[]> {
  const outDir = join(tmpdir(), 'kys-prototype-synths');
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
    if (!isSynthDefList(synths))
      throw new Error('prototype/src/synths/index.js did not export a SYNTHS list of definitions');
    return synths;
  } finally {
    rmSync(outFile, { force: true });
  }
}
