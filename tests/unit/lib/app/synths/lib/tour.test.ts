/**
 * Orientation tour tests
 *
 * @see lib/app/synths/lib/tour.ts
 */
import { describe, expect, it } from 'vitest';
import { buildTour, type TourStop } from '@/lib/app/synths/lib/tour';
import { MODULES } from '@/lib/app/synths/lib/modules';
import type { Control, Jack, UnusualNotes } from '@/lib/app/synths/contract';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

const RES_NOTE = 'EMPHASIS is Moog’s word for resonance.';
const NOTES: UnusualNotes = {
  'filter.emphasis': RES_NOTE,
  'filter.contour': RES_NOTE,
  'mix.osc1': 'The mixer can be overdriven on purpose.',
  'mix.osc2': 'Each channel has its own on/off switch.',
  'mix.noise': 'There is no pink noise.',
  'osc2.detune': 'Detune runs a full fifth either way.',
  'lfo.tri': 'Known as the modulation output on the hardware.',
  'env1.out': 'Patched straight from the contour generator.',
  mixer: 'The mixer has five inputs.',
};

const byKind = <K extends TourStop['kind']>(stops: TourStop[], kind: K) =>
  stops.filter((s): s is Extract<TourStop, { kind: K }> => s.kind === kind);

describe('buildTour', () => {
  it('opens with the synth, walks the modules in signal-flow order, and closes', () => {
    const def = makeMiniD();
    const stops = buildTour(def, {});

    expect(stops.map((s) => s.kind)).toEqual([
      'intro',
      'module',
      'module',
      'module',
      'module',
      'module',
      'outro',
    ]);
    const [intro] = byKind(stops, 'intro');
    expect(intro).toMatchObject({
      title: 'Test Mini D',
      lead: def.heritage,
      body: def.summary,
      counts: { controls: def.controls.length, jacks: def.jacks.length, sections: 5 },
      chain: ['osc', 'mixer', 'filter', 'mod', 'patch'],
    });
    expect(byKind(stops, 'module').map((s) => s.module)).toEqual([
      'osc',
      'mixer',
      'filter',
      'mod',
      'patch',
    ]);
    expect(stops[stops.length - 1].title).toBe('That is the whole panel');
  });

  it('carries the areas, members and colour of each module', () => {
    const stops = buildTour(makeMiniD(), {});
    const mixer = byKind(stops, 'module').find((s) => s.module === 'mixer');

    expect(mixer).toMatchObject({ title: 'Mixer', color: MODULES.mixer.color, areaIds: ['mixer'] });
    expect(mixer?.controls.map((c) => c.id)).toEqual(['mix.osc1', 'mix.osc2', 'mix.noise']);
    expect(byKind(stops, 'module').find((s) => s.module === 'patch')?.jacks).toHaveLength(
      makeMiniD().jacks.length
    );
  });

  it('gathers naming notes into their own stop, one entry per wording', () => {
    const stops = buildTour(makeMiniD(), NOTES);
    const [naming] = byKind(stops, 'naming');

    expect(stops[1].kind).toBe('naming');
    expect(naming.notes).toEqual([
      {
        key: 'control:filter.emphasis',
        kind: 'control',
        id: 'filter.emphasis',
        ids: ['filter.emphasis', 'filter.contour'],
        module: 'filter',
        names: ['EMPHASIS', 'AMOUNT OF CONTOUR'],
        text: RES_NOTE,
      },
      {
        key: 'jack:lfo.tri',
        kind: 'jack',
        id: 'lfo.tri',
        ids: ['lfo.tri'],
        module: 'patch',
        names: ['LFO TRI socket'],
        text: 'Known as the modulation output on the hardware.',
      },
    ]);
  });

  it('puts the other notes on their module stop, at most three, never repeating the naming stop', () => {
    const stops = buildTour(makeMiniD(), NOTES);
    const modules = byKind(stops, 'module');
    const mixer = modules.find((s) => s.module === 'mixer');
    const filter = modules.find((s) => s.module === 'filter');
    const patch = modules.find((s) => s.module === 'patch');

    expect(mixer?.extra.map((n) => n.id)).toEqual(['mix.osc1', 'mix.osc2', 'mix.noise']);
    expect(filter?.extra).toEqual([]);
    expect(patch?.extra.map((n) => n.id)).toEqual(['env1.out']);
  });

  it('caps the module notes at three', () => {
    const notes: UnusualNotes = {
      'mix.osc1': 'One.',
      'mix.osc2': 'Two.',
      'mix.noise': 'Three.',
    };
    const base = makeMiniD();
    const src = base.controls.find((c) => c.id === 'mix.osc1');
    if (!src) throw new Error('fixture control missing');
    const extra: Control = { ...src, id: 'mix.ext', y: 350 };
    const stops = buildTour(makeMiniD({ controls: [...base.controls, extra] }), {
      ...notes,
      'mix.ext': 'Four.',
    });

    expect(byKind(stops, 'module').find((s) => s.module === 'mixer')?.extra).toHaveLength(3);
  });

  it('gives the passed notes to the areas on a module stop', () => {
    const stops = buildTour(makeMiniD(), NOTES);
    const modules = byKind(stops, 'module');

    expect(modules.find((s) => s.module === 'mixer')?.areas[0].unusual).toBe(
      'The mixer has five inputs.'
    );
    // the passed notes replace what is attached: the fixture's own oscillator-bank note is not in them
    expect(modules.find((s) => s.module === 'osc')?.areas[0].unusual).toBeUndefined();
  });

  it('reads the notes attached to the definition when none are passed', () => {
    const base = makeMiniD();
    const controls: Control[] = base.controls.map((c) =>
      c.id === 'filter.emphasis' ? { ...c, unusual: RES_NOTE } : c
    );
    const jacks: Jack[] = base.jacks.map((j) =>
      j.id === 'env1.out' ? { ...j, unusual: 'Straight from the contour.' } : j
    );
    const stops = buildTour(makeMiniD({ controls, jacks }));

    expect(byKind(stops, 'naming')[0].notes.map((n) => n.id)).toEqual(['filter.emphasis']);
    expect(
      byKind(stops, 'module')
        .find((s) => s.module === 'patch')
        ?.extra.map((n) => n.id)
    ).toEqual(['env1.out']);
    expect(byKind(stops, 'module').find((s) => s.module === 'osc')?.areas[0].unusual).toBe(
      'The oscillators are called the oscillator bank on this panel.'
    );
  });

  it('borrows the section name for a one- or two-character control name', () => {
    const base = makeMiniD();
    const controls: Control[] = base.controls.map((c) =>
      c.id === 'mix.noise' ? { ...c, name: '2' } : c
    );
    const stops = buildTour(makeMiniD({ controls }), { 'mix.noise': 'Short label.' });

    expect(byKind(stops, 'module').find((s) => s.module === 'mixer')?.extra[0].names).toEqual([
      'Mixer · 2',
    ]);
  });
});
