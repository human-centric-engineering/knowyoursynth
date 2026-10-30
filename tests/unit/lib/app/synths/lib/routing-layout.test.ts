/**
 * Where the routing view draws each block and link (`layoutRouting`): Model D's routing, and small routings made to
 * show one rule each.
 *
 * @see lib/app/synths/lib/routing-layout.ts
 */
import { describe, expect, it } from 'vitest';
import type { RoutingBlock, RoutingEdge, SynthRouting } from '@/lib/app/synths/contract';
import { BLOCK_H, BLOCK_W, layoutRouting } from '@/lib/app/synths/lib/routing-layout';
import type { RoutingLayout } from '@/lib/app/synths/lib/routing-layout';
import { routing as modelD } from '@/lib/app/synths/routing/model-d';

const block = (id: string, over: Partial<RoutingBlock> = {}): RoutingBlock => ({
  id,
  name: id,
  module: 'util',
  description: id,
  ...over,
});
const edge = (id: string, from: string, to: string, signal: RoutingEdge['signal'] = 'audio') => ({
  id,
  from,
  to,
  signal,
});
const small = (blocks: string[], edges: RoutingEdge[]): SynthRouting => ({
  synth: 'test',
  out: 'out',
  blocks: blocks.map((b) => block(b)),
  edges,
  jacks: {},
});

/** The points an SVG path from `layoutRouting` passes through, coordinates in order. */
const points = (d: string) =>
  [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/** Whether block `b`'s box holds the point, inset by a pixel so a path ending on its side does not count. */
const inside = (l: RoutingLayout, b: string, p: { x: number; y: number }) => {
  const at = l.blocks[b];
  return p.x > at.x + 1 && p.x < at.x + BLOCK_W - 1 && p.y > at.y + 1 && p.y < at.y + BLOCK_H - 1;
};

describe('layoutRouting: Model D', () => {
  const layout = layoutRouting(modelD);
  const col = (id: string) => layout.blocks[id].col;

  it('runs the audio left to right: sources, mixer, filter, amplifier, output', () => {
    const sources = ['osc1', 'osc2', 'osc3', 'noise', 'ext_in'];
    expect(new Set(sources.map(col)).size).toBe(1);
    expect(col('mixer')).toBe(col('osc1') + 1);
    expect(col('filter')).toBe(col('mixer') + 1);
    expect(col('vca')).toBe(col('filter') + 1);
    expect(col('output')).toBe(col('vca') + 1);
    // The output is the last column.
    expect(Math.max(...Object.values(layout.blocks).map((b) => b.col))).toBe(col('output'));
  });

  it('puts the main line straight across, level with the middle of the sources', () => {
    const ys = ['mixer', 'filter', 'vca', 'output'].map((b) => layout.blocks[b].y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(layout.blocks.osc3.y);
  });

  it('puts the modulation, pitch and contours beneath the audio, each left of what it feeds', () => {
    const control = ['midi', 'pitch_bus', 'mod_bus', 'lfo', 'filter_contour', 'loudness_contour'];
    const lowestAudio = Math.max(
      ...Object.values(layout.blocks)
        .filter((b) => b.band === 'audio')
        .map((b) => b.y)
    );
    for (const b of control) {
      expect(layout.blocks[b].band).toBe('control');
      expect(layout.blocks[b].y).toBeGreaterThan(lowestAudio + BLOCK_H);
    }
    expect(col('loudness_contour')).toBe(col('vca') - 1);
    expect(col('pitch_bus')).toBe(col('osc1') - 1);
    expect(col('mod_bus')).toBe(col('osc1') - 1);
    expect(col('lfo')).toBe(col('mod_bus') - 1);
    expect(col('midi')).toBe(0);
  });

  it('draws the output fed back to the external input, and Oscillator 3 and noise into the mod bus, as back links', () => {
    const back = layout.edges.filter((e) => e.back).map((e) => e.id);
    expect(back.sort()).toEqual(['c20', 'c22', 'c45']);
  });

  it('overlaps no two blocks, and fits them all in the drawing', () => {
    const all = Object.values(layout.blocks);
    for (const a of all) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + BLOCK_W).toBeLessThanOrEqual(layout.width);
      expect(a.y + BLOCK_H).toBeLessThanOrEqual(layout.height);
      for (const b of all)
        if (a !== b)
          expect(
            a.x + BLOCK_W <= b.x ||
              b.x + BLOCK_W <= a.x ||
              a.y + BLOCK_H <= b.y ||
              b.y + BLOCK_H <= a.y
          ).toBe(true);
    }
  });

  it('runs no link through a block it does not join', () => {
    expect(layout.edges.length).toBe(modelD.edges.length);
    for (const e of layout.edges)
      for (const p of points(e.d))
        for (const b of Object.keys(layout.blocks))
          if (b !== e.from && b !== e.to)
            expect(inside(layout, b, p), `${e.id} in ${b}`).toBe(false);
  });

  it('draws two edges between the same blocks apart', () => {
    const [pitch, bend] = ['c01', 'c02'].map((id) => layout.edges.find((e) => e.id === id)?.d);
    expect(pitch).toBeDefined();
    expect(pitch).not.toBe(bend);
  });

  it('starts every link on its source’s right side and ends it on its target’s left', () => {
    for (const e of layout.edges) {
      const ps = points(e.d);
      expect(ps[0].x).toBe(layout.blocks[e.from].x + BLOCK_W);
      expect(ps[ps.length - 1].x).toBe(layout.blocks[e.to].x);
    }
  });

  it('lays out a cable between two blocks, and leaves out one whose end is no block', () => {
    const l = layoutRouting(modelD, [
      { id: 'cable:0', from: 'lfo', to: 'filter' },
      { id: 'cable:1', from: 'lfo', to: 'nowhere' },
    ]);
    expect(l.cables.map((c) => c.id)).toEqual(['cable:0']);
    expect(l.cables[0].d.startsWith(`M${l.blocks.lfo.x + BLOCK_W},`)).toBe(true);
    // The blocks are where they were without it.
    expect(l.blocks).toEqual(layout.blocks);
  });

  it('lays the same routing out the same way every time', () => {
    expect(layoutRouting(modelD)).toEqual(layout);
  });
});

describe('layoutRouting: the rules', () => {
  it('breaks a loop rather than looping forever, and draws the closing edge back', () => {
    const l = layoutRouting(
      small(['a', 'b', 'out'], [edge('1', 'a', 'b'), edge('2', 'b', 'a'), edge('3', 'b', 'out')])
    );
    expect(l.blocks.a.col).toBeLessThan(l.blocks.b.col);
    expect(l.edges.find((e) => e.id === '2')?.back).toBe(true);
    expect(l.edges.find((e) => e.id === '1')?.back).toBe(false);
  });

  it('draws a back link between two audio blocks over the top, and one from beneath under the bottom', () => {
    const l = layoutRouting(
      small(
        ['a', 'b', 'out', 'lfo'],
        [
          edge('1', 'a', 'b'),
          edge('2', 'b', 'out'),
          edge('3', 'out', 'a'),
          edge('4', 'lfo', 'a', 'cv'),
          edge('5', 'b', 'lfo', 'cv'),
        ]
      )
    );
    const ys = (id: string) => points(l.edges.find((e) => e.id === id)?.d ?? '').map((p) => p.y);
    expect(Math.min(...ys('3'))).toBeLessThan(l.blocks.a.y);
    expect(Math.max(...ys('5'))).toBeGreaterThan(l.blocks.lfo.y + BLOCK_H);
  });

  it('puts a block beneath that feeds nothing, fed only by a cable, in the first column', () => {
    const l = layoutRouting(small(['a', 'out', 'idle'], [edge('1', 'a', 'out')]), [
      { id: 'cable:0', from: 'idle', to: 'idle' },
    ]);
    expect(l.blocks.idle).toMatchObject({ col: 0, band: 'control' });
  });

  it('ends an audio chain with no way to the output one column left of it, not in its column', () => {
    const l = layoutRouting(
      small(['a', 'out', 'ring', 'carrier'], [edge('1', 'a', 'out'), edge('2', 'carrier', 'ring')])
    );
    expect(l.blocks.ring).toMatchObject({ band: 'audio', col: l.blocks.out.col - 1 });
    expect(l.blocks.carrier.col).toBe(l.blocks.ring.col - 1);
    expect(Math.max(...Object.values(l.blocks).map((b) => b.col))).toBe(l.blocks.out.col);
  });

  it('puts a block no edge or cable joins in the spare grid beneath the rest', () => {
    const l = layoutRouting(
      small(['a', 'out', 'lfo', 'idle'], [edge('1', 'a', 'out'), edge('2', 'lfo', 'a', 'cv')])
    );
    expect(l.blocks.idle).toMatchObject({ col: 0, band: 'spare' });
    expect(l.blocks.idle.y).toBeGreaterThan(l.blocks.lfo.y + BLOCK_H);
    expect(l.height).toBeGreaterThanOrEqual(l.blocks.idle.y + BLOCK_H);
  });

  it('lays a modular with nothing patched out as a grid about twice as wide as it is tall', () => {
    const mods = Array.from({ length: 18 }, (_, k) => `m${k}`);
    const l = layoutRouting(small([...mods, 'out'], []));
    expect(mods.every((m) => l.blocks[m].band === 'spare')).toBe(true);
    const cols = new Set(mods.map((m) => l.blocks[m].col)).size;
    const rows = new Set(mods.map((m) => l.blocks[m].y)).size;
    expect([cols, rows]).toEqual([6, 3]);
    // The routing's order, row by row.
    expect(mods.slice(0, 6).map((m) => l.blocks[m].col)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(l.width).toBeGreaterThanOrEqual(l.blocks.m5.x + BLOCK_W);
  });

  describe('cables placing a routing with no edges', () => {
    const modular = small(['vco', 'vcf', 'vca', 'env', 'kbd', 'lfo', 'out'], []);
    const patch = [
      { id: 'cable:0', from: 'vco', to: 'vcf', signal: 'audio' as const },
      { id: 'cable:1', from: 'vcf', to: 'vca', signal: 'audio' as const },
      { id: 'cable:2', from: 'vca', to: 'out', signal: 'audio' as const },
      { id: 'cable:3', from: 'env', to: 'vca', signal: 'cv' as const },
      { id: 'cable:4', from: 'kbd', to: 'vco', signal: 'cv' as const },
    ];

    it('runs the audio cables left to right on the main line, the control beneath, the rest spare', () => {
      const l = layoutRouting(modular, patch);
      // The keyboard one column left of the oscillator it plays, the envelope just before the amplifier it opens.
      expect(l.blocks.kbd).toMatchObject({ band: 'control', col: 0 });
      expect(['vco', 'vcf', 'vca', 'out'].map((b) => l.blocks[b].col)).toEqual([1, 2, 3, 4]);
      expect(['vco', 'vcf', 'vca', 'out'].every((b) => l.blocks[b].band === 'audio')).toBe(true);
      expect(l.blocks.env).toMatchObject({ band: 'control', col: 2 });
      expect(l.blocks.lfo.band).toBe('spare');
      expect(l.cables.map((c) => c.id)).toEqual(patch.map((c) => c.id));
      expect(l.cables.some((c) => c.back)).toBe(false);
    });

    it('changes shape as a cable goes in, and goes back when it comes out', () => {
      const before = layoutRouting(modular, patch);
      const lfo = { id: 'cable:5', from: 'lfo', to: 'vcf', signal: 'cv' as const };
      const after = layoutRouting(modular, [...patch, lfo]);
      expect(before.blocks.lfo.band).toBe('spare');
      expect(after.blocks.lfo).toMatchObject({ band: 'control', col: after.blocks.vcf.col - 1 });
      expect(layoutRouting(modular, patch)).toEqual(before);
    });

    it('puts an audio cable between two blocks edges place on the main line', () => {
      // A pin-matrix synth: the oscillator and filter are on control edges only, and pins carry the audio.
      const matrix = small(
        ['kbd', 'osc', 'vcf', 'amp', 'out'],
        [edge('1', 'kbd', 'osc', 'cv'), edge('2', 'kbd', 'vcf', 'cv'), edge('3', 'amp', 'out')]
      );
      const bare = layoutRouting(matrix);
      expect(bare.blocks.osc.band).toBe('control');
      const l = layoutRouting(matrix, [
        { id: 'cable:0', from: 'osc', to: 'vcf', signal: 'audio' },
        { id: 'cable:1', from: 'vcf', to: 'amp', signal: 'audio' },
      ]);
      expect(['osc', 'vcf', 'amp', 'out'].map((b) => l.blocks[b].band)).toEqual(
        Array(4).fill('audio')
      );
      expect(['osc', 'vcf', 'amp', 'out'].map((b) => l.blocks[b].col)).toEqual([1, 2, 3, 4]);
      expect(l.blocks.kbd).toMatchObject({ band: 'control', col: 0 });
    });

    it('never moves a block an edge places for a control cable out of it', () => {
      const fixed = small(['a', 'out', 'util'], [edge('1', 'a', 'out')]);
      const alone = layoutRouting(fixed, [{ id: 'cable:0', from: 'util', to: 'a' }]);
      const both = layoutRouting(fixed, [
        { id: 'cable:0', from: 'util', to: 'a' },
        { id: 'cable:1', from: 'out', to: 'util' },
        { id: 'cable:2', from: 'a', to: 'util' },
      ]);
      expect(both.blocks.a).toEqual(alone.blocks.a);
      expect(both.blocks.out).toEqual(alone.blocks.out);
    });
  });

  it('puts a block beneath that feeds nothing one column right of what feeds it, so the edge runs forward', () => {
    const l = layoutRouting(
      small(
        ['a', 'out', 'lfo', 'sink'],
        [edge('1', 'a', 'out'), edge('2', 'lfo', 'a', 'cv'), edge('3', 'lfo', 'sink', 'cv')]
      )
    );
    expect(l.blocks.sink.col).toBe(l.blocks.lfo.col + 1);
    expect(l.edges.find((e) => e.id === '3')?.back).toBe(false);
  });

  it('puts a sink fed by a later sink right of it too', () => {
    // `s1` comes first in the routing's order but is fed by `s2`, itself a sink of `lfo`.
    const l = layoutRouting(
      small(
        ['a', 'out', 's1', 'lfo', 's2'],
        [
          edge('1', 'a', 'out'),
          edge('2', 'lfo', 'a', 'cv'),
          edge('3', 'lfo', 's2', 'cv'),
          edge('4', 's2', 's1', 'cv'),
          edge('5', 'lfo', 's1', 'cv'),
        ]
      )
    );
    expect(l.blocks.s2.col).toBe(l.blocks.lfo.col + 1);
    expect(l.blocks.s1.col).toBe(l.blocks.s2.col + 1);
    expect(l.edges.some((e) => e.back)).toBe(false);
  });

  it('keeps many back links round the top inside the margin, above the blocks', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const l = layoutRouting(
      small(
        [...many, 'out'],
        [
          ...many.map((b) => edge(`in-${b}`, b, 'out')),
          ...many.map((b) => edge(`back-${b}`, 'out', b)),
        ]
      )
    );
    const top = Math.min(...Object.values(l.blocks).map((b) => b.y));
    const lanes = l.edges
      .filter((e) => e.back)
      .map((e) => Math.min(...points(e.d).map((p) => p.y)));
    expect(lanes).toHaveLength(8);
    expect(new Set(lanes).size).toBe(8);
    for (const y of lanes) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(top);
    }
  });

  it('gives each back link round the same side a lane of its own', () => {
    const l = layoutRouting(
      small(
        ['a', 'b', 'out'],
        [edge('1', 'a', 'b'), edge('2', 'b', 'out'), edge('3', 'out', 'a'), edge('4', 'out', 'b')]
      )
    );
    const lane = (id: string) =>
      Math.min(...points(l.edges.find((e) => e.id === id)?.d ?? '').map((p) => p.y));
    expect(l.edges.filter((e) => e.back).map((e) => e.id)).toEqual(['3', '4']);
    expect(lane('3')).not.toBe(lane('4'));
    expect(Math.min(lane('3'), lane('4'))).toBeGreaterThanOrEqual(0);
  });

  it('lays out a routing with one band only, without a channel', () => {
    const l = layoutRouting(
      small(['a', 'b', 'out'], [edge('1', 'a', 'b'), edge('2', 'b', 'out'), edge('3', 'a', 'out')])
    );
    expect(Object.values(l.blocks).every((b) => b.band === 'audio')).toBe(true);
    const skip = points(l.edges.find((e) => e.id === '3')?.d ?? '');
    expect(skip).toHaveLength(4); // one curve, not a turn into a channel
  });
});
