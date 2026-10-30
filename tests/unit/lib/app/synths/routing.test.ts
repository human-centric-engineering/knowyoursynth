/**
 * Every registered routing against its definition and its spec.
 *
 * Against the definition (`routingProblems`): every control, value and jack it names exists, a normal is broken only
 * by an input that does not sum, every jack belongs to a block, every control the sound hears sets one, and every block has a way to the output. A renamed
 * control or jack therefore fails here rather than leaving part of the diagram dark for good.
 *
 * Against the spec it was projected from (`.context/app/synth-data/<id>/<id>.synth.json`): every module and
 * connection the spec lists is drawn, or left out with a reason.
 *
 * @see lib/app/synths/lib/routing.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SynthRouting } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { routingProblems } from '@/lib/app/synths/lib/routing';
import { getSynthRouting, SYNTH_ROUTINGS } from '@/lib/app/synths/routing';

const Spec = z.object({
  modules: z.array(z.object({ id: z.string() })),
  connections: z.array(z.object({ id: z.string() })).default([]),
});
const spec = (id: string) =>
  Spec.parse(
    JSON.parse(
      readFileSync(
        join(process.cwd(), '.context', 'app', 'synth-data', id, `${id}.synth.json`),
        'utf8'
      )
    )
  );

const defOf = (id: string) => {
  const def = getSynthDef(id);
  if (!def) throw new Error(`${id} is not a registered synth`);
  return def;
};

// Routed from their patch rather than from normals (t-145), so none of them has a routing yet.
const PATCHED = ['system-15', 'system-35', 'system-55', 'ems-vcs3', 'syntrx-ii'];

it('has a routing for every synth whose path is fixed, and none for the patched ones', () => {
  const routed = new Set(SYNTH_ROUTINGS.map((r) => r.synth));
  const ids = SYNTH_DEFS.map((d) => d.id);
  expect(PATCHED.every((id) => ids.includes(id))).toBe(true);
  expect(ids.filter((id) => !PATCHED.includes(id) && !routed.has(id))).toEqual([]);
  expect(PATCHED.filter((id) => routed.has(id))).toEqual([]);
});

it('has a routing for Model D, and one routing per synth', () => {
  const ids = SYNTH_ROUTINGS.map((r) => r.synth);
  expect(ids).toContain('model-d');
  expect(new Set(ids).size).toBe(ids.length);
  expect(getSynthRouting('model-d')?.synth).toBe('model-d');
  expect(getSynthRouting('no-such-synth')).toBeUndefined();
});

describe.each(SYNTH_ROUTINGS.map((r) => [r.synth, r] as const))('%s', (id, routing) => {
  it('names only what its definition has, and reaches the output from every block', () => {
    expect(routingProblems(defOf(id), routing)).toEqual([]);
  });

  it('draws every module and connection of its spec, or says why not', () => {
    const { modules, connections } = spec(id);
    expect(modules.length).toBeGreaterThan(0);
    const drawn = new Set([
      ...routing.blocks.map((b) => b.id),
      ...routing.edges.map((e) => e.id),
      ...Object.keys(routing.omitted ?? {}),
    ]);
    const missing = [...modules, ...connections].map((x) => x.id).filter((x) => !drawn.has(x));
    expect(missing).toEqual([]);
  });
});

describe('routingProblems', () => {
  const def = defOf('model-d');
  const base = getSynthRouting('model-d');
  if (!base) throw new Error('model-d has a routing');
  const edit = (change: (r: SynthRouting) => void): string[] => {
    const r = structuredClone(base);
    change(r);
    return routingProblems(def, r);
  };
  const edge = (r: SynthRouting, id: string) => {
    const e = r.edges.find((x) => x.id === id);
    if (!e) throw new Error(`no edge ${id}`);
    return e;
  };

  it('refuses a switch the definition does not have', () => {
    expect(
      edit((r) => {
        edge(r, 'c40').when = { id: 'mix.osc1Onn', eq: true };
      })
    ).toEqual(['edge c40: no control mix.osc1Onn']);
  });

  it('refuses a value the switch cannot take', () => {
    expect(
      edit((r) => {
        edge(r, 'c20').when = { id: 'mod.srcA', eq: 'lfo' };
      })
    ).toEqual(['edge c20: "lfo" is not a value of mod.srcA']);
  });

  it('refuses a level that is not a control, or not continuous without an off value', () => {
    expect(
      edit((r) => {
        edge(r, 'c40').levels = ['mix.osc9', 'mix.osc1On'];
      })
    ).toEqual([
      'edge c40: no control mix.osc9',
      'edge c40: mix.osc1On is not continuous; give it an off value',
    ]);
  });

  it('refuses a normal broken by a jack that sums, or by no jack at all', () => {
    expect(
      edit((r) => {
        edge(r, 'c22').breaks = 'j.cutCv';
        edge(r, 'c45').breaks = 'j.nope';
      })
    ).toEqual([
      'edge c22: j.cutCv sums with its normal, so cannot break it',
      'edge c45: no jack j.nope',
    ]);
  });

  it('refuses two normals broken by the same jack', () => {
    expect(
      edit((r) => {
        r.edges.push({ ...edge(r, 'c22'), id: 'c99', from: 'lfo' });
      })
    ).toEqual(['edge c99: j.modSrc already breaks edge c22']);
  });

  it('refuses a pow on a control that is not continuous, or one that is not above zero', () => {
    expect(
      edit((r) => {
        edge(r, 'c40').levels = [
          { id: 'mix.osc1On', off: false, pow: 2 },
          { id: 'mix.osc1', pow: 0 },
        ];
      })
    ).toEqual(['edge c40: mix.osc1On cannot take pow 2', 'edge c40: mix.osc1 cannot take pow 0']);
  });

  it('counts a cable as a way to the output for a block that has no edge out', () => {
    expect(
      edit((r) => {
        r.edges = r.edges.filter((e) => e.from !== 'lfo');
      })
    ).toEqual([]);
  });

  it('refuses a block that passes signal on with nothing to feed it', () => {
    expect(
      edit((r) => {
        r.blocks.find((b) => b.id === 'lfo')!.passes = true;
        delete r.jacks['j.lfoCv'];
      })
    ).toEqual([
      'jack j.lfoCv belongs to no block',
      'block lfo passes signal on, but nothing feeds it',
    ]);
  });

  it('refuses a jack id the definition does not have, and a definition jack left out', () => {
    expect(
      edit((r) => {
        r.jacks['j.modSource'] = r.jacks['j.modSrc'];
        delete r.jacks['j.modSrc'];
      })
    ).toEqual([
      'edge c22: j.modSrc does not feed mod_bus',
      'jacks: no jack j.modSource',
      'jack j.modSrc belongs to no block',
    ]);
  });

  it('refuses an edge to a block that does not exist, and a block with no way out', () => {
    expect(
      edit((r) => {
        edge(r, 'c55').to = 'outptu';
      })
    ).toEqual([
      'edge c55: no block outptu',
      // With the amplifier cut off from the output, everything behind it is too.
      ...[
        'midi',
        'pitch_bus',
        'mod_bus',
        'lfo',
        'osc1',
        'osc2',
        'osc3',
        'noise',
        'ext_in',
        'mixer',
        'filter',
        'filter_contour',
        'loudness_contour',
        'vca',
      ].map((b) => `block ${b} has no way to output`),
    ]);
  });
  it('refuses a control the definition does not have, a panel mode, and a heard control on no block', () => {
    const block = (r: SynthRouting, id: string) => {
      const b = r.blocks.find((x) => x.id === id);
      if (!b) throw new Error(`no block ${id}`);
      return b;
    };
    expect(
      edit((r) => {
        const filter = block(r, 'filter');
        filter.controls = (filter.controls ?? []).filter((c) => c !== 'filter.emphasis');
        filter.controls.push('filter.resonance', 'filter.cutoff');
        block(r, 'lfo').controls?.push('view.mode');
      })
    ).toEqual([
      'block lfo: no control view.mode',
      'block filter: no control filter.resonance',
      'block filter: filter.cutoff is listed twice',
      'control filter.emphasis sets no block',
    ]);
    // A panel mode changes what the panel shows, never the sound, so no block lists it.
    const moded = {
      ...def,
      controls: def.controls.map((c) => (c.id === 'out.a440' ? { ...c, ui: true } : c)),
    };
    expect(routingProblems(moded, base)).toEqual([
      'block output: out.a440 is a panel mode, not heard',
    ]);
  });
});
