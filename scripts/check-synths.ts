/**
 * Validate every sound in the library and render it through the ported DSP, so a sound can be judged by numbers,
 * and so the port can be checked against the prototype's recorded baseline.
 *
 * A transliteration of the prototype's `prototype/check.mjs` (D3). What it runs:
 *
 * - **The ported engine** — `createSynth`, `SIGNALS`, `DESTS` from `lib/app/synths/audio/dsp-core.ts` — and the
 *   ported libraries: `presetState`, `cablesToEngine`, `controlMap`, `jackMap` (`lib/app/synths/lib/patch.ts`),
 *   `explainCable` (`…/lib/explain.ts`) and `modularDef` (`…/lib/layout.ts`).
 * - **The ported definitions** from the registry, `lib/app/synths/defs/`. A synth not ported yet runs on the
 *   prototype's definition: this script bundles `prototype/src/synths/index.js` with esbuild when it runs, exactly as
 *   `check.mjs` does, and loads the bundle from a temporary file. That is a build of a file path, not an import
 *   specifier; D13 (nothing in the app imports `prototype/`) is about the live app, and this is a dev-only checker.
 * - **The sounds and lineage.** A ported synth's come from the seed data the catalogue is seeded from
 *   (`prisma/seeds/app-knowyoursynth/data/`), each sound passed through `validatePreset` on the way in, so the check
 *   plays what the app will serve. Its "Heard on" list still comes from the prototype bundle, because the databank
 *   that fills it is not ported yet (b1). A synth not ported yet keeps the prototype's own sounds and lineage.
 * - **Parity with the prototype.** A ported definition must equal the prototype's as data: geometry, ids, help text,
 *   areas, decor, init (`definitionDrift`). The baseline only hears what a sound plays, and this catches a
 *   transliteration slip no sound would.
 *
 * Left out of the transliteration, and why:
 * - The "What is not modelled" check only asks that a ported synth's seed data has an entry. The prototype's
 *   `limitsFor` check ran on every synth, and the unported ones still have theirs in `prototype/src/lib/limits.js`.
 * - The databank check (`checkBank`): the databank is not ported yet (b1).
 * - `--write-baseline`: the baseline in `.context/app/check/` is the prototype's own rendering. The ported engine has
 *   to reproduce it, not overwrite it, so this script only reads it. Re-record it with the prototype's own checker
 *   (`node check.mjs --write-baseline`, run in the prototype folder) if a sound is ever meant to change.
 * - One tightening: under `--compare` a different sample hash is an error here, where `check.mjs` only noted it. The
 *   port is meant to be exact, so "agrees to the fingerprint's precision" is not good enough.
 *
 * Usage:
 *   npm run check:synths                          all synths, one process per synth
 *   npm run check:synths -- neutron               one synth
 *   npm run check:synths -- neutron reese         one synth, only sounds whose id contains "reese"
 *   npm run check:synths -- model-d --compare     one synth against its baseline
 * Flags (anywhere on the line, after npm's `--`):
 *   --seed=N            seed for Math.random, reset before every sound (default 20240919, as the sound-map probe)
 *   --compare           compare each synth's fingerprints with .context/app/check/<synth>.json; any difference is an error
 *   --jobs=N            how many synths to render at once when checking more than one (default: all cores)
 * Exit code 1 if anything is wrong (unknown control, value out of range, bad cable, NaN, silent sound, baseline mismatch).
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */

import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSynth, SIGNALS, DESTS } from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams, Lineage, Preset, SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { explainCable } from '@/lib/app/synths/lib/explain';
import { modularDef } from '@/lib/app/synths/lib/layout';
import {
  presetState,
  cablesToEngine,
  controlMap,
  jackMap,
  isRecord,
} from '@/lib/app/synths/lib/patch';

const ROOT = resolve(import.meta.dirname, '..');
const PROTOTYPE_SRC = join(ROOT, 'prototype', 'src');

/** One baseline fingerprint (see `.context/app/check/README.md`). */
interface Fingerprint {
  peak: number;
  rms: number;
  win: number[];
  bright: number[];
  bands: (number | null)[];
  hash: string;
}
type FingerprintField = keyof Fingerprint;
const FIELDS: FingerprintField[] = ['peak', 'rms', 'win', 'bright', 'bands', 'hash'];

interface Baseline {
  synth: string;
  seed: number;
  sounds: Record<string, Fingerprint>;
}

const isSynthDefList = (v: unknown): v is SynthDef[] =>
  Array.isArray(v) &&
  v.every(
    (d) =>
      isRecord(d) &&
      typeof d.id === 'string' &&
      typeof d.toEngine === 'function' &&
      Array.isArray(d.controls) &&
      Array.isArray(d.jacks) &&
      (d.presets === undefined || Array.isArray(d.presets))
  );

const isBaseline = (v: unknown): v is Baseline =>
  isRecord(v) && typeof v.seed === 'number' && isRecord(v.sounds);

/** The prototype's definitions (with their sounds), bundled from source for this run. */
async function loadPrototypeSynths(): Promise<SynthDef[]> {
  const outDir = join(tmpdir(), 'kys-check-synths');
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

/**
 * The first place a ported definition differs from the prototype's, as data, or `null` when they match. Functions
 * compare by presence only (the baseline renders `toEngine`; the explainer runs `hear` and `check`). What the port
 * changes on purpose is left out: the content it no longer carries (presets, lineage, unusual notes), its `version`,
 * and the `brand` tags.
 */
function definitionDrift(ported: SynthDef, prototype: SynthDef): string | null {
  const OMIT = new Set(['presets', 'lineage', 'unusual', 'version', 'brand']);
  const plain = (def: SynthDef): unknown =>
    JSON.parse(
      JSON.stringify(def, (k, v: unknown) =>
        OMIT.has(k) ? undefined : typeof v === 'function' ? '[function]' : v
      )
    );
  const diff = (a: unknown, b: unknown, path: string): string | null => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${path}: ${a.length} items, the prototype has ${b.length}`;
      for (let i = 0; i < a.length; i++) {
        const d = diff(a[i], b[i], `${path}[${i}]`);
        if (d) return d;
      }
      return null;
    }
    if (isRecord(a) && isRecord(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const d = diff(a[k], b[k], path ? `${path}.${k}` : k);
        if (d) return d;
      }
      return null;
    }
    return a === b ? null : `${path}: ${JSON.stringify(a)}, the prototype has ${JSON.stringify(b)}`;
  };
  return diff(plain(ported), plain(prototype), '');
}

/**
 * The definitions to check: each ported one in place of the prototype's, carrying its sounds and lineage from the seed
 * data. `orphans` are registered ids with no prototype definition (a mistyped id, or a synth the prototype never had):
 * nothing below would check them, so the run refuses to start rather than pass them by. `content` lists what is wrong
 * with a ported synth's seed data, per synth.
 */
function withPorted(
  prototypes: SynthDef[],
  data: CatalogueSeedData
): {
  synths: SynthDef[];
  drift: Map<string, string>;
  orphans: string[];
  content: Map<string, string[]>;
} {
  const protoIds = new Set(prototypes.map((p) => p.id));
  const orphans = SYNTH_DEFS.map((d) => d.id).filter((id) => !protoIds.has(id));
  const drift = new Map<string, string>();
  const content = new Map<string, string[]>();
  const synths = prototypes.map((proto) => {
    const ported = getSynthDef(proto.id);
    if (!ported) return proto;
    const d = definitionDrift(ported, proto);
    if (d) drift.set(proto.id, d);
    const problems: string[] = [];
    const sounds = data.sounds.find((f) => f.synth === ported.id);
    const lineage = data.lineage.find((f) => f.synth === ported.id);
    if (!sounds)
      problems.push('has no sounds in the seed data (run prototype/tools/export-content.mjs)');
    else if (sounds.version !== ported.version)
      problems.push(
        `seed data sounds are on version ${sounds.version}, the definition is at ${ported.version}`
      );
    if (!lineage) problems.push('has no lineage in the seed data');
    if (!data.notes.some((f) => f.synth === ported.id))
      problems.push('has no notes (unusual, limits) in the seed data');
    const presets: Preset[] = [];
    for (const input of sounds?.sounds ?? []) {
      const r = validatePreset(ported, input);
      if (r.ok) presets.push(r.value);
      else
        problems.push(
          ...r.problems.map((p) => `seed sound ${String(input.id)} ${p.path}: ${p.message}`)
        );
    }
    if (problems.length) content.set(ported.id, problems);
    let history: Lineage | undefined;
    if (lineage) {
      const { synth: _synth, ...rest } = lineage;
      history = { ...rest, heard: proto.lineage?.heard };
    }
    return { ...ported, presets, lineage: history };
  });
  return { synths, drift, orphans, content };
}

async function main(): Promise<void> {
  const {
    synths: SYNTHS,
    drift,
    orphans,
    content,
  } = withPorted(await loadPrototypeSynths(), loadCatalogueData());
  if (orphans.length) {
    console.log(
      `ERR registered with no prototype definition to check against: ${orphans.join(', ')}`
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [onlySynthArg, onlyPreset] = args.filter((a) => !a.startsWith('--'));
  const opt = (name: string): string | undefined =>
    flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`));
  const optValue = (name: string): string | undefined => (opt(name) || '').split('=')[1];
  for (const f of flags) {
    if (!['seed', 'compare', 'jobs'].some((n) => f === `--${n}` || f.startsWith(`--${n}=`))) {
      console.log(
        f.startsWith('--write-baseline')
          ? "ERR --write-baseline is not ported: the baseline is the prototype's; re-record it from prototype/ (node check.mjs --write-baseline)"
          : `ERR unknown flag ${f}`
      );
      process.exit(1);
    }
  }
  const SEED = opt('seed') ? Number(optValue('seed')) : 20240919;
  if (!Number.isInteger(SEED)) {
    console.log('ERR --seed needs a whole number, as --seed=42');
    process.exit(1);
  }
  const COMPARE = !!opt('compare');
  const BASELINE_DIR = join(ROOT, '.context', 'app', 'check');

  const norm = (t: string | undefined): string =>
    String(t || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const onlySynth = onlySynthArg
    ? (SYNTHS.find((d) => norm(d.id) === norm(onlySynthArg))?.id ?? null)
    : null;
  if (onlySynthArg && !onlySynth) {
    console.log(
      `ERR no synth "${onlySynthArg}" – use one of: ${SYNTHS.map((d) => d.id).join(', ')}`
    );
    process.exit(1);
  }
  const CATS = [
    'bass',
    'lead',
    'pad',
    'pluck',
    'keys',
    'fx',
    'drone',
    'perc',
    'seq',
    'brass',
    'strings',
    'wind',
  ];
  let errs = 0;
  let rendered = 0;
  const E = (m: string): void => {
    errs++;
    console.log('ERR', m);
  };
  const SR = 48000;

  // Every synth at once: one process per synth, as many at a time as there are cores. A full run is about 1,100 sounds of
  // 3 s each, roughly half an hour on one core and about ten minutes on eight. Each synth's report is printed whole, in
  // catalogue order.
  if (!onlySynth) {
    const jobs = Math.max(1, Number(optValue('jobs')) || availableParallelism());
    const self = fileURLToPath(import.meta.url);
    const results = new Array<{ out: string; code: number | null } | undefined>(SYNTHS.length);
    const t0 = Date.now();
    let next = 0,
      printed = 0;
    const flush = (): void => {
      while (printed < results.length && results[printed]) {
        process.stdout.write(results[printed]!.out);
        printed++;
      }
    };
    // `execArgv` carries tsx's loader, so the child runs this TypeScript file the same way.
    const run = (i: number): Promise<void> =>
      new Promise((done) => {
        const child = spawn(
          process.execPath,
          [...process.execArgv, self, SYNTHS[i].id, ...(onlyPreset ? [onlyPreset] : []), ...flags],
          { env: { ...process.env, KYS_CHECK_CHILD: '1' } }
        );
        let out = '';
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
          out += d.toString();
        });
        child.on('close', (code) => {
          results[i] = { out, code };
          flush();
          done();
        });
      });
    const worker = async (): Promise<void> => {
      while (next < SYNTHS.length) await run(next++);
    };
    await Promise.all(Array.from({ length: Math.min(jobs, SYNTHS.length) }, worker));
    const failed = SYNTHS.filter((_, i) => results[i]!.code !== 0).map((d) => d.id);
    console.log(
      `\n${SYNTHS.length} synths in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${jobs} processes`
    );
    console.log(failed.length ? `failed: ${failed.join(', ')}` : 'every synth passed');
    process.exit(failed.length ? 1 : 0);
  }

  // The voice uses Math.random for oscillator start phase, noise, dither, sample-and-hold and the random arpeggio. Reset
  // to the same seed before every sound, so a sound's numbers do not depend on what was rendered before it. The same
  // generator as the sound-map probe (lib/app/synths/audio/probe.ts).
  const seeded = (seed: number): (() => number) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Rough brightness: zero crossings per second over a window, as Hz. */
  const zcr = (buf: Float32Array, from: number, to: number): number => {
    let n = 0;
    for (let i = from + 1; i < to; i++) if (buf[i - 1] < 0 !== buf[i] < 0) n++;
    return Math.round(n / 2 / ((to - from) / SR));
  };
  const rmsOf = (buf: Float32Array, from: number, to: number): number => {
    let s = 0;
    for (let i = from; i < to; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / (to - from));
  };

  // ── the fingerprint the baseline keeps: enough to see a sound move, rounded so it reads in a diff ──
  const r4 = (x: number): number => Number(x.toFixed(4));
  const FFT_N = 4096;
  const hann = Float64Array.from(
    { length: FFT_N },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1))
  );
  /** Power spectrum of one Hann-windowed frame (radix-2, in place). */
  const powerAt = (buf: Float32Array, from: number): Float64Array => {
    const re = new Float64Array(FFT_N),
      im = new Float64Array(FFT_N);
    for (let i = 0; i < FFT_N; i++) re[i] = (buf[from + i] || 0) * hann[i];
    for (let i = 1, j = 0; i < FFT_N; i++) {
      let bit = FFT_N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= FFT_N; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      for (let i = 0; i < FFT_N; i += len)
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(a * k),
            wi = Math.sin(a * k);
          const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi,
            xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k + len / 2] = re[i + k] - xr;
          im[i + k + len / 2] = im[i + k] - xi;
          re[i + k] += xr;
          im[i + k] += xi;
        }
    }
    return Float64Array.from({ length: FFT_N / 2 }, (_, k) => re[k] * re[k] + im[k] * im[k]);
  };
  // Octave bands, as the share of the sound's energy in each (dB). Four frames across the 3 s phrase.
  const BAND_EDGES = [0, 63, 125, 250, 500, 1000, 2000, 4000, 8000, SR / 2];
  const bandsOf = (buf: Float32Array): (number | null)[] => {
    const band = new Float64Array(BAND_EDGES.length - 1);
    for (const at of [0.1, 0.5, 1.0, 2.0]) {
      const pw = powerAt(buf, Math.round(at * SR));
      for (let k = 1; k < pw.length; k++) {
        const hz = (k * SR) / FFT_N;
        band[BAND_EDGES.findIndex((e, b) => hz >= e && hz < BAND_EDGES[b + 1])] += pw[k];
      }
    }
    const total = band.reduce((a, b) => a + b, 0);
    return Array.from(band, (e) =>
      total > 0 ? Number((10 * Math.log10(e / total + 1e-12)).toFixed(1)) : null
    );
  };
  /** FNV-1a over the raw samples: tells an exact match from one that only agrees to the fingerprint's precision. */
  const hashOf = (buf: Float32Array): string => {
    let h = 0x811c9dc5;
    for (const b of new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      h = Math.imul(h ^ b, 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  const baselineFile = (id: string): string => join(BASELINE_DIR, `${id}.json`);

  /** The engine gets a plain-data copy of the params, as it does through the worklet port (functions and undefined dropped). */
  const jsonCopy = (p: EngineParams): EngineParams => {
    const copy: unknown = JSON.parse(JSON.stringify(p));
    // The copy has the shape of `p` by construction; JSON.parse only cannot say so.
    return copy as EngineParams;
  };

  type Sound = Pick<Preset, 'id' | 'steps' | 'phrase'> & Partial<Preset>;

  for (const def of SYNTHS) {
    if (onlySynth && def.id !== onlySynth) continue;
    const d = drift.get(def.id);
    if (d) E(`${def.id} definition differs from the prototype's at ${d}`);
    const cm = controlMap(def),
      jm = jackMap(def);
    for (const j of def.jacks) {
      if (j.dir === 'out' && j.signal && !SIGNALS.includes(j.signal))
        E(`${def.id} jack ${j.id} bad signal ${j.signal}`);
      if (j.dir === 'in' && j.dest && !DESTS.includes(j.dest))
        E(`${def.id} jack ${j.id} bad dest ${j.dest}`);
    }
    for (const c of def.controls)
      if (def.init[c.id] === undefined) E(`${def.id} init missing ${c.id}`);
    const seenIds = new Set<string>();
    for (const x of [...def.controls, ...def.jacks]) {
      if (seenIds.has(x.id)) E(`${def.id} duplicate control/jack id ${x.id}`);
      seenIds.add(x.id);
    }
    // Areas: every control and jack sits in exactly one (the search and the section cards rely on it).
    const areasAt = (p: { x: number; y: number } | undefined): SynthDef['areas'] =>
      (def.areas || []).filter((a) =>
        a.rects.some((r) => p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      );
    if (!def.areas || !def.areas.length) E(`${def.id} has no areas`);
    else
      for (const p of [...def.controls, ...def.jacks]) {
        const n = areasAt(p).map((a) => a.id);
        if (n.length !== 1)
          E(`${def.id} ${p.id} is in ${n.length} areas${n.length ? ` (${n.join(', ')})` : ''}`);
      }
    // The modular layout must keep every control in one area of its own, inside the case, with no areas overlapping.
    if (def.modular) {
      let m: SynthDef | null = null;
      try {
        m = modularDef(def);
      } catch (err) {
        E(err instanceof Error ? err.message : String(err));
      }
      if (m) {
        const md = m;
        const at = (p: { x: number; y: number }): string[] =>
          md.areas
            .filter((a) =>
              a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
            )
            .map((a) => a.id);
        for (const p of [...md.controls, ...md.jacks]) {
          const was = areasAt(
            def.controls.find((c) => c.id === p.id) || def.jacks.find((j) => j.id === p.id)
          ).map((a) => a.id);
          const n = at(p);
          if (n.length !== 1 || n[0] !== was[0])
            E(
              `${def.id} modular: ${p.id} is in ${n.join(', ') || 'no area'}, was ${was.join(', ')}`
            );
          if (p.x < 0 || p.y < 0 || p.x > md.view.w || p.y > md.view.h)
            E(`${def.id} modular: ${p.id} is outside the case`);
        }
        const rs = md.areas.flatMap((a) => a.rects.map((r) => ({ ...r, id: a.id })));
        rs.forEach((a, i) =>
          rs.slice(i + 1).forEach((b) => {
            if (
              a.id !== b.id &&
              Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
              Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5
            )
              E(`${def.id} modular: areas ${a.id} and ${b.id} overlap`);
          })
        );
      }
    }
    const ids = new Set<string>();
    const prints: Record<string, Fingerprint> = {};
    let baseline: Baseline | null = null;
    if (COMPARE) {
      try {
        const raw: unknown = JSON.parse(readFileSync(baselineFile(def.id), 'utf8'));
        if (isBaseline(raw)) baseline = raw;
        else E(`${def.id} baseline is not a baseline file`);
      } catch {
        E(
          `${def.id} has no baseline – record one from prototype/ (node check.mjs --write-baseline)`
        );
      }
      if (baseline && baseline.seed !== SEED)
        E(`${def.id} baseline was recorded with --seed=${baseline.seed}, this run used ${SEED}`);
    }
    for (const problem of content.get(def.id) ?? []) E(`${def.id} ${problem}`);
    const presets = def.presets || [];
    if (!def.lineage) E(`${def.id} has no lineage`);
    else
      for (const h of def.lineage.heard || [])
        if (h.sound && !presets.some((p) => p.id === h.sound))
          E(`${def.id} lineage "${h.who}" points at unknown sound ${h.sound}`);
    const all: Sound[] = [
      {
        id: '(init)',
        name: 'init',
        tags: ['lead'],
        level: 1,
        steps: [],
        phrase: {
          bpm: 120,
          loop: true,
          steps: [
            [0, 48, 1],
            [1, 60, 1],
          ],
        },
      },
      ...presets,
    ];
    // (check.mjs's init phrase has no `loop`, which the engine reads as "loop"; `loop: true` here is the same riff.)
    console.log(`\n${def.name} — ${presets.length} sounds`);
    console.log(
      `${'id'.padEnd(24)} peak  rms   rms per 0.5 s window              bright@0.05s → @1s   cpu`
    );
    for (const p of all) {
      if (onlyPreset && !p.id.includes(onlyPreset)) continue;
      const tag = `${def.id}/${p.id}`;
      if (ids.has(p.id)) E(`${tag} duplicate id`);
      ids.add(p.id);
      if (p.id !== '(init)') {
        for (const k of ['name', 'ref', 'artist', 'blurb', 'how'] as const)
          if (typeof p[k] !== 'string' || !p[k]) E(`${tag} missing ${k}`);
        if (!Array.isArray(p.tags) || !CATS.includes(p.tags[0]))
          E(`${tag} first tag must be a category (${CATS.join(' ')})`);
        if (p.level === undefined || ![1, 2, 3].includes(p.level))
          E(`${tag} level must be 1, 2 or 3`);
        if (!p.steps.length) E(`${tag} has no steps`);
        if (!p.phrase || !Array.isArray(p.phrase.steps) || !p.phrase.steps.length)
          E(`${tag} has no phrase`);
      }
      for (const s of p.steps) {
        if (p.id !== '(init)' && (!s.title || !s.why || !s.module))
          E(`${tag} step needs title, module and why`);
        for (const [id, v] of Object.entries(s.set || {})) {
          const c = cm[id];
          if (!c) {
            E(`${tag} unknown control ${id}`);
            continue;
          }
          if (c.kind === 'cont' && (typeof v !== 'number' || v < c.min || v > c.max))
            E(`${tag} ${id}=${String(v)} out of range ${c.min}..${c.max}`);
          if (c.kind === 'enum' && !c.options.some((o) => o.v === v))
            E(
              `${tag} ${id}=${JSON.stringify(v)} not one of ${c.options.map((o) => JSON.stringify(o.v)).join(' ')}`
            );
          if (c.kind === 'bool' && typeof v !== 'boolean') E(`${tag} ${id} must be true/false`);
        }
        for (const [a, b] of s.cables || []) {
          const ja = jm[a],
            jb = jm[b];
          if (!ja || !jb || ja.dir !== 'out' || jb.dir !== 'in')
            E(`${tag} bad cable ${a} > ${b} (must be [outJackId, inJackId])`);
          else if (!ja.signal || !jb.dest)
            E(`${tag} cable ${a} > ${b} uses a jack that is not modelled`);
        }
      }
      for (const t of p.tweaks || []) if (!cm[t.id]) E(`${tag} tweak unknown control ${t.id}`);
      for (const id of Object.keys(p.context || {}))
        if (!cm[id]) E(`${tag} context unknown control ${id}`);

      const st = presetState(def, p);
      const patched = Object.fromEntries(
        st.cables.flatMap((c) => [
          [c.to, true],
          [c.from, true],
        ])
      );
      let ep: EngineParams;
      try {
        ep = def.toEngine(st.values, { wheel: 0, patched });
      } catch (e) {
        E(`${tag} toEngine threw ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      ep.cables = cablesToEngine(def, st.cables, st.values);
      for (const r of [...(ep.routes || []), ...ep.cables]) {
        if (!SIGNALS.includes(r.src)) E(`${tag} route src ${r.src}`);
        if (!DESTS.includes(r.dst)) E(`${tag} route dst ${r.dst}`);
        if (!Number.isFinite(r.amt)) E(`${tag} route amt ${r.amt}`);
      }
      for (const c of st.cables) {
        try {
          const x = explainCable(def, c.from, c.to, st.values, st.cables);
          if (!x || !x.hear) E(`${tag} no explanation for ${c.from} > ${c.to}`);
        } catch (e) {
          E(
            `${tag} explainCable threw for ${c.from} > ${c.to}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      rendered++;
      Math.random = seeded(SEED);
      const syn = createSynth(SR, () => {});
      syn.handle({ type: 'params', p: jsonCopy(ep) });
      syn.handle({ type: 'phrase', phrase: p.phrase });
      const buf = new Float32Array(SR * 3);
      const t0 = performance.now();
      for (let o = 0; o < buf.length; o += 128) syn.process(buf.subarray(o, o + 128), 128);
      const ms = performance.now() - t0;
      let peak = 0,
        nan = false;
      for (const x of buf) {
        if (!Number.isFinite(x)) nan = true;
        peak = Math.max(peak, Math.abs(x));
      }
      const rms = rmsOf(buf, 0, buf.length);
      const wins = [0, 1, 2, 3, 4, 5]
        .map((k) => rmsOf(buf, (k * SR) / 2, ((k + 1) * SR) / 2).toFixed(2))
        .join(' ');
      // `silentInit`: a synth with nothing connected until it is patched (the VCS3) is meant to be silent as initialised.
      const quietOk = p.id === '(init)' && !!def.silentInit;
      const flag = nan
        ? 'NaN!'
        : rms < 0.004
          ? quietOk
            ? 'silent (as designed)'
            : 'SILENT?'
          : peak > 0.98
            ? 'hot'
            : rms < 0.03
              ? 'quiet'
              : '';
      if (nan || (rms < 0.004 && !quietOk)) errs++;
      const print: Fingerprint = {
        peak: r4(peak),
        rms: r4(rms),
        win: [0, 1, 2, 3, 4, 5].map((k) => r4(rmsOf(buf, (k * SR) / 2, ((k + 1) * SR) / 2))),
        bright: [zcr(buf, SR * 0.02, SR * 0.08), zcr(buf, SR * 1.0, SR * 1.1)],
        bands: bandsOf(buf),
        hash: hashOf(buf),
      };
      prints[p.id] = print;
      if (baseline) {
        const was = baseline.sounds[p.id];
        if (!was) E(`${tag} is not in the baseline`);
        else {
          const moved = FIELDS.filter((k) => JSON.stringify(print[k]) !== JSON.stringify(was[k]));
          if (moved.length)
            E(
              `${tag} differs from the baseline: ${moved.map((k) => `${k} ${JSON.stringify(was[k])} → ${JSON.stringify(print[k])}`).join('; ')}`
            );
        }
      }
      console.log(
        `${p.id.padEnd(24)} ${peak.toFixed(2)}  ${rms.toFixed(3)} ${wins}   ${String(zcr(buf, SR * 0.02, SR * 0.08)).padStart(5)} → ${String(zcr(buf, SR * 1.0, SR * 1.1)).padEnd(5)} Hz     ${(ms / 30).toFixed(1)}% ${flag}${baseline && baseline.sounds[p.id]?.hash === print.hash ? ' =' : ''}`
      );
    }
    if (baseline && !onlyPreset)
      for (const id of Object.keys(baseline.sounds))
        if (!prints[id]) E(`${def.id}/${id} is in the baseline but no longer in the library`);
  }
  if (!rendered) {
    console.log('ERR nothing matched – no sounds were checked');
    process.exit(1);
  }
  console.log(
    errs
      ? `\n${errs} errors`
      : `\nno errors (${rendered} sounds rendered${COMPARE ? ', every one identical to the baseline' : ''})`
  );
  process.exit(errs ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('check-synths failed:', err);
  process.exit(1);
});
