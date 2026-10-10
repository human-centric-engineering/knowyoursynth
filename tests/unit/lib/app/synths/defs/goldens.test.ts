/**
 * Every ported definition does what the prototype's does: its readouts, jack checks, jack depths, "what you will
 * hear" sentences and engine parameters, over a grid of panel settings, equal the goldens recorded from the prototype
 * (`tests/fixtures/synths/goldens/`, by `scripts/record-synth-goldens.ts`). The goldens are never re-recorded to make
 * a port pass (D3: the prototype is the spec).
 *
 * `npm run check:synths` proves the engine mapping on every library sound and compares the functions on controls and
 * jacks only by presence; this is the half it leaves.
 *
 * @see scripts/synth-goldens.ts
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import {
  ABSENT,
  canonicalJson,
  recordGoldens,
  settings,
  toJson,
  type Json,
  type SynthGoldens,
} from '@/scripts/synth-goldens';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'synths', 'goldens');

const JsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ])
);
const Rows = <T extends z.ZodType>(value: T) => z.record(z.string(), z.record(z.string(), value));
const GoldensFile = z.object({
  id: z.string(),
  readouts: z.record(z.string(), z.array(z.string())),
  engine: z.record(z.string(), JsonValue),
  checks: Rows(z.string().nullable()),
  depths: Rows(z.union([z.number(), z.string()]).nullable()),
  hears: Rows(z.string().nullable()),
});

const goldenFile = (id: string) => join(DIR, `${id}.json`);
const golden = (id: string): SynthGoldens =>
  GoldensFile.parse(JSON.parse(readFileSync(goldenFile(id), 'utf8')));

describe.each(SYNTH_DEFS.map((d) => d.id))('%s', (id) => {
  const def = getSynthDef(id);
  if (!def) throw new Error(`${id} is registered`);

  it('has goldens recorded from the prototype', () => {
    expect(
      existsSync(goldenFile(id)),
      `record them: npx tsx scripts/record-synth-goldens.ts ${id}`
    ).toBe(true);
  });

  it('does what the prototype does over the whole grid', () => {
    const want = golden(id);
    const got = recordGoldens(def);
    expect(got.id).toBe(want.id);
    expect(got.readouts).toEqual(want.readouts);
    expect(got.checks).toEqual(want.checks);
    expect(got.depths).toEqual(want.depths);
    expect(got.hears).toEqual(want.hears);
    expect(got.engine).toEqual(want.engine);
  });
});

describe('the recording', () => {
  const modelD = getSynthDef('model-d');
  if (!modelD) throw new Error('model-d is registered');
  const base = recordGoldens(modelD);

  /** Model D with one thing changed: the recording must see it. */
  const variant = (change: (def: SynthDef) => SynthDef) => recordGoldens(change(modelD));

  it('sees a changed readout', () => {
    const got = variant((def) => ({
      ...def,
      controls: def.controls.map((c) =>
        c.id === 'filter.cutoff' && c.kind === 'cont' ? { ...c, fmt: () => 'changed' } : c
      ),
    }));
    expect(got.readouts['filter.cutoff']).toEqual(Array(11).fill('changed'));
    expect(got.readouts['filter.cutoff']).not.toEqual(base.readouts['filter.cutoff']);
  });

  it('sees one engine value change at one setting, and only there', () => {
    const got = variant((def) => ({
      ...def,
      toEngine: (v, ctx) => {
        const p = def.toEngine(v, ctx);
        return v['filter.mode'] === 'hp' ? { ...p, tune: 0.5 } : p;
      },
    }));
    const changed = Object.keys(got.engine).filter(
      (k) => canonicalJson(got.engine[k]) !== canonicalJson(base.engine[k])
    );
    expect(changed).toEqual(['filter.mode="hp"', 'patched:* filter.mode="hp"']);
    expect(got.engine['filter.mode="hp"']).toMatchObject({ tune: 0.5 });
  });

  it('records each engine row as the parameters that differ from its base', () => {
    const got = variant((def) => ({
      ...def,
      toEngine: (v, ctx) => {
        const { tune: _tune, ...p } = def.toEngine(v, ctx);
        return ctx.wheel ? p : { ...p, tune: _tune };
      },
    }));
    expect(got.engine['wheel=1']).toEqual({ tune: ABSENT });
    expect(base.engine['wheel=1']).not.toHaveProperty('tune');
  });

  it('patches every jack at once, across the grid', () => {
    const got = variant((def) => ({
      ...def,
      toEngine: (v, ctx) => {
        const p = def.toEngine(v, ctx);
        const all = def.jacks.every((j) => ctx.patched[j.id]);
        return all && v['filter.mode'] === 'hp' ? { ...p, tune: 0.5 } : p;
      },
    }));
    const changed = Object.keys(got.engine).filter(
      (k) => canonicalJson(got.engine[k]) !== canonicalJson(base.engine[k])
    );
    expect(changed).toEqual(['patched:* filter.mode="hp"']);
  });

  it('keeps a depth that is not a finite number, rather than writing it as null', () => {
    const got = variant((def) => ({
      ...def,
      jacks: def.jacks.map((j) => (j.dir === 'in' ? { ...j, amt: () => Number.NaN } : j)),
    }));
    const inJack = modelD.jacks.find((j) => j.dir === 'in');
    if (!inJack) throw new Error('model-d has an input jack');
    expect(got.depths[inJack.id]).toEqual({ init: 'NaN' });
    expect(JSON.parse(JSON.stringify(got.depths))).toEqual(got.depths);
  });

  it('sees a changed jack check, at the setting where it changed', () => {
    const got = variant((def) => ({
      ...def,
      jacks: def.jacks.map((j) =>
        j.id === 'j.ext' ? { ...j, check: (v) => (v['mix.extOn'] ? null : 'switch it on') } : j
      ),
    }));
    expect(got.checks['j.ext']).not.toEqual(base.checks['j.ext']);
    expect(got.checks['j.ext'].init).toBe('switch it on');
  });

  it('records what a function threw instead of stopping', () => {
    const got = variant((def) => ({
      ...def,
      toEngine: () => {
        throw new Error('no engine');
      },
    }));
    expect(got.engine.init).toBe('throws: no engine');
    expect(new Set(Object.values(got.engine))).toEqual(new Set(['throws: no engine']));
  });

  it('moves each control on its own: every key but init names the one control it moved', () => {
    const grid = settings(modelD);
    expect(grid[0]).toEqual(['init', modelD.init]);
    for (const [key, values] of grid.slice(1)) {
      const moved = Object.keys(values).filter((k) => values[k] !== modelD.init[k]);
      expect(moved, key).toEqual([key.slice(0, key.indexOf('='))]);
    }
  });

  it('compares values, not key order', () => {
    expect(canonicalJson({ b: [1, { d: 2, c: 3 }], a: null })).toBe(
      canonicalJson({ a: null, b: [1, { c: 3, d: 2 }] })
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('keeps what JSON would lose', () => {
    expect(toJson({ a: Number.NaN, b: [Infinity, -Infinity, -0], c: undefined })).toEqual({
      a: 'NaN',
      b: ['Infinity', '-Infinity', 0],
    });
  });
});
