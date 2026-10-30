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
 * Against the drawn panel (`liveAreas`, `f-live-panel` t-151): every block with a control or a patched jack on the face
 * has a patch of it to glow over, and no two blocks glow over the same patch.
 *
 * @see lib/app/synths/lib/routing.ts
 * @see lib/app/synths/lib/live-areas.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SynthDef, SynthRouting } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { panelCells } from '@/lib/app/synths/lib/cells';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { liveAreas } from '@/lib/app/synths/lib/live-areas';
import { routingProblems } from '@/lib/app/synths/lib/routing';
import { DERIVED_ROUTINGS, getSynthRouting, SYNTH_ROUTINGS } from '@/lib/app/synths/routing';
import { moog900Routing } from '@/lib/app/synths/routing/moog900';

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

/** Every synth's routing, the derived ones (the System 15, 35 and 55) built from their definitions. */
const ROUTINGS = SYNTH_DEFS.flatMap((d) => getSynthRouting(d) ?? []);

type Pt = [number, number];
/** The convex pieces a cell path is made of (`panelCells()` writes each as `M x yL x y … Z`). */
const pieces = (d: string): Pt[][] =>
  [...d.matchAll(/M([^MZ]+)Z/g)].map((m) =>
    m[1].split('L').map((p) => {
      const [x, y] = p.trim().split(/\s+/).map(Number);
      return [x, y];
    })
  );
/**
 * Whether two convex pieces share more than an edge: no axis of either separates them by more than the rounding the
 * cells are written with (a tenth of a unit), so neighbours that only touch do not count.
 */
function overlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1e-6) continue;
      const nx = (y1 - y2) / len;
      const ny = (x2 - x1) / len;
      const span = (p: Pt[]) => p.map(([x, y]) => x * nx + y * ny);
      const [pa, pb] = [span(a), span(b)];
      if (Math.min(...pa) >= Math.max(...pb) - 0.2 || Math.min(...pb) >= Math.max(...pa) - 0.2)
        return false;
    }
  return true;
}

it('has a routing for every synth', () => {
  const routed = new Set(ROUTINGS.map((r) => r.synth));
  expect(SYNTH_DEFS.map((d) => d.id).filter((id) => !routed.has(id))).toEqual([]);
});

it('has one routing per synth, listed or derived but not both', () => {
  const ids = SYNTH_ROUTINGS.map((r) => r.synth);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(DERIVED_ROUTINGS).filter((id) => ids.includes(id))).toEqual([]);
  expect(getSynthRouting(defOf('model-d'))).toBe(SYNTH_ROUTINGS.find((r) => r.synth === 'model-d'));
  expect(getSynthRouting({ ...defOf('model-d'), id: 'no-such-synth' })).toBeUndefined();
  // A derived routing is built once per definition.
  expect(getSynthRouting(defOf('system-55'))).toBe(getSynthRouting(defOf('system-55')));
});

it('leaves a 900-series module it does not know out of the routing, and says so, rather than throwing', () => {
  const base = defOf('system-15');
  const known = base.areas?.find((a) => a.id !== 'appout')?.id;
  if (!known) throw new Error('system-15 has modules');
  // An unknown kind with the module's own controls and jacks, as a definition change that outran this file would be.
  const renamed = (id: string) =>
    id.replace(new RegExp(`^(j\\.)?${known}\\b`), (_, j = '') => `${j}m999`);
  const def = {
    ...base,
    areas: base.areas?.map((a) => (a.id === known ? { ...a, id: 'm999' } : a)),
    controls: base.controls.map((c) => ({ ...c, id: renamed(c.id) })),
    jacks: base.jacks.map((j) => ({ ...j, id: renamed(j.id) })),
  };
  const routing = moog900Routing(def);
  expect(routing.blocks.map((b) => b.id)).not.toContain('m999');
  expect(routingProblems(def, routing).some((p) => p.includes('belongs to no block'))).toBe(true);
});

describe.each(ROUTINGS.map((r) => [r.synth, r] as const))('%s', (id, routing) => {
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

/** Each face a synth's panel is drawn in: its own, and a modular's case as the page opens it (`modularDef()`). */
const FACES = ROUTINGS.flatMap((routing): [string, SynthRouting, SynthDef][] => {
  const def = defOf(routing.synth);
  return def.modular
    ? [
        [`${routing.synth} (modular)`, routing, modularDef(def)],
        [`${routing.synth} (long)`, routing, def],
      ]
    : [[routing.synth, routing, def]];
});

describe.each(FACES)('the live glow on %s', (_, routing, def) => {
  const values = def.init;
  const jacksOf = (block: string) =>
    Object.keys(routing.jacks).filter((j) => routing.jacks[j] === block);

  // With nothing patched, and with every jack patched: the most a patch can give the jacks.
  describe.each([
    ['nothing patched', [] as string[]],
    ['every jack patched', def.jacks.map((j) => j.id)],
  ])('with %s', (__, patched) => {
    const areas = liveAreas(def, routing, patched, values);
    const { cells } = panelCells(def, patched, values);

    it('gives every block with a control or a patched jack on the panel a patch of it to glow over', () => {
      const due = routing.blocks
        .filter(
          (b) =>
            (b.controls ?? []).some((c) => cells[c]) ||
            jacksOf(b.id).some((j) => patched.includes(j) && cells[j])
        )
        .map((b) => b.id);
      expect(due.length).toBeGreaterThan(0);
      // An area's id is its blocks joined by spaces, which the layer splits back.
      expect(routing.blocks.filter((b) => /\s/.test(b.id))).toEqual([]);
      const lit = new Set(areas.filter((a) => a.d).flatMap((a) => a.blocks));
      expect(due.filter((b) => !lit.has(b))).toEqual([]);
      // And nothing for a block with neither.
      expect([...lit].filter((b) => !due.includes(b))).toEqual([]);
    });

    it('lets no two blocks glow over the same patch of panel', () => {
      const shapes = areas.flatMap((a) =>
        pieces(a.d).map((p) => {
          const xs = p.map((q) => q[0]);
          const ys = p.map((q) => q[1]);
          const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          return { id: a.id, p, box };
        })
      );
      expect(shapes.length).toBeGreaterThan(0);
      const clashes: string[] = [];
      for (let i = 0; i < shapes.length; i++)
        for (let j = i + 1; j < shapes.length; j++) {
          const [s, t] = [shapes[i], shapes[j]];
          if (s.id === t.id) continue;
          const apart =
            s.box[0] >= t.box[2] ||
            t.box[0] >= s.box[2] ||
            s.box[1] >= t.box[3] ||
            t.box[1] >= s.box[3];
          if (!apart && overlap(s.p, t.p)) clashes.push(`${s.id} / ${t.id}`);
        }
      expect([...new Set(clashes)]).toEqual([]);
    });
  });
});

describe('the overlap check the live glow is held to', () => {
  const square = (x: number, y: number): Pt[] => [
    [x, y],
    [x + 10, y],
    [x + 10, y + 10],
    [x, y + 10],
  ];

  it('tells pieces that overlap from neighbours that only share an edge', () => {
    expect(overlap(square(0, 0), square(5, 5))).toBe(true);
    expect(overlap(square(0, 0), square(10, 0))).toBe(false);
    expect(overlap(square(0, 0), square(10.1, 3))).toBe(false);
    expect(pieces('M0 0L10 0L10 10ZM1.5 2L3 4L5 6Z')).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [1.5, 2],
        [3, 4],
        [5, 6],
      ],
    ]);
  });
});

describe('routingProblems', () => {
  const def = defOf('model-d');
  const base = getSynthRouting(def);
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

  it('refuses an audio jack the routing does not place, or one listed twice', () => {
    expect(
      edit((r) => {
        r.audioJacks = ['j.ext', 'j.nope', 'j.ext'];
      })
    ).toEqual(['audioJacks: j.nope belongs to no block', 'audio jack j.ext is listed twice']);
  });
});

describe('routingProblems: a block that only measures', () => {
  const vcs3 = defOf('ems-vcs3');
  const base = getSynthRouting(vcs3);
  if (!base) throw new Error('ems-vcs3 has a routing');

  it('lets the VCS3’s meter have no way out, since nothing pinned to it is heard', () => {
    expect(routingProblems(vcs3, base)).toEqual([]);
  });

  it('refuses a block with no way out once a jack on it is heard', () => {
    const r = structuredClone(base);
    r.jacks['c.vcf'] = 'meter';
    expect(routingProblems(vcs3, r)).toEqual(['block meter has no way to output']);
  });
});
