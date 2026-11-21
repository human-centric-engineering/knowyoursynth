/**
 * Default patch checklist tests
 *
 * A checklist step names every control in its part of the panel and says where each goes, in words someone can follow
 * on the hardware whatever its knobs say now. These pin the words for each kind of control, and how a step's patterns
 * pick its controls.
 *
 * @see lib/app/synths/lib/checklist.ts
 */
import { describe, expect, it } from 'vitest';
import type { Control } from '@/lib/app/synths/contract';
import {
  checklistControls,
  checklistRequired,
  patternTest,
  positionText,
} from '@/lib/app/synths/lib/checklist';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

const common = { x: 0, y: 0, module: 'osc' as const, help: '' };
const knob = (min: number, max: number, extra: object = {}): Control => ({
  ...common,
  id: 'k',
  type: 'knob',
  r: 10,
  style: 'neutron',
  kind: 'cont',
  min,
  max,
  def: min,
  ...extra,
});
const fader = (extra: object = {}): Control => ({
  ...common,
  id: 'f',
  type: 'fader',
  len: 100,
  orient: 'v',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  ...extra,
});

describe('positionText', () => {
  it('puts a knob at either end, at the top, or at the nearest clock position, with its value', () => {
    const k = knob(0, 10);

    expect(positionText(k, 0)).toBe('fully anticlockwise (0)');
    expect(positionText(k, 10)).toBe('fully clockwise (10)');
    expect(positionText(k, 5)).toBe('straight up, at 12 o’clock (5)');
    expect(positionText(k, 7)).toBe('at 7, about 2 o’clock');
    expect(positionText(k, 4.5)).toBe('at 4.5, between 11 and 12 o’clock');
    expect(positionText(k, 1)).toBe('at 1, about 8 o’clock');
  });

  it('reads a knob that runs either side of zero from its own range', () => {
    const k = knob(-5, 5, { fmt: (v: number) => `${v} st` });

    expect(positionText(k, 0)).toBe('straight up, at 12 o’clock (0 · 0 st)');
    expect(positionText(k, -5)).toBe('fully anticlockwise (−5 · -5 st)');
  });

  it('moves a fader up for more, down for more where its maximum is at the bottom, and right across', () => {
    expect(positionText(fader(), 0)).toBe('all the way down (0)');
    expect(positionText(fader(), 10)).toBe('all the way up (10)');
    expect(positionText(fader(), 5)).toBe('half way (5)');
    expect(positionText(fader(), 3)).toBe('at 3, about 3/10 of the way up');
    expect(positionText(fader({ maxAt: 'bottom' }), 0)).toBe('all the way up (0)');
    expect(positionText(fader({ maxAt: 'bottom' }), 3)).toBe('at 3, about 3/10 of the way down');
    expect(positionText(fader({ orient: 'h' }), 10)).toBe('all the way right (10)');
    expect(positionText(fader({ orient: 'h' }), 2)).toBe('at 2, about 2/10 of the way across');
  });

  it('says on or off for a switch, lit or not for a button, and the option for a selector', () => {
    const toggle: Control = { ...common, id: 't', type: 'toggle', w: 10, kind: 'bool', def: false };
    const button: Control = {
      ...common,
      id: 'b',
      type: 'button',
      w: 10,
      h: 10,
      kind: 'bool',
      def: false,
    };
    const select: Control = {
      ...common,
      id: 's',
      type: 'rocker',
      w: 10,
      h: 10,
      color: 'black',
      kind: 'enum',
      def: 'saw',
      options: [
        { v: 'saw', label: 'Sawtooth' },
        { v: 'sq', label: 'Square' },
      ],
    };

    expect(positionText(toggle, true)).toBe('on');
    expect(positionText(toggle, false)).toBe('off');
    expect(positionText(button, true)).toBe('on (lit)');
    expect(positionText(button, false)).toBe('off (not lit)');
    expect(positionText(select, 'sq')).toBe('set to Square');
  });

  it('centres a joystick, and sets a display row in the display', () => {
    const stick: Control = {
      ...common,
      id: 'j',
      type: 'joystick',
      r: 10,
      kind: 'cont',
      min: -1,
      max: 1,
      def: 0,
    };
    const menu: Control = {
      ...common,
      id: 'm',
      type: 'menu',
      w: 10,
      h: 10,
      size: 10,
      vw: 10,
      kind: 'cont',
      min: 0,
      max: 10,
      def: 0,
    };

    expect(positionText(stick, 0)).toBe('centred');
    expect(positionText(menu, 3)).toBe('set to 3 (in the display)');
  });
});

describe('patternTest', () => {
  it('matches an id as itself, and * as any run of characters', () => {
    expect(patternTest('osc1.wave')('osc1.wave')).toBe(true);
    expect(patternTest('osc1.wave')('osc1.waves')).toBe(false);
    expect(patternTest('osc*')('osc2.detune')).toBe(true);
    expect(patternTest('osc*')('mix.osc1')).toBe(false);
    expect(patternTest('vco1.*Mod')('vco1.shapeMod')).toBe(true);
    // a dot is a dot, not any character
    expect(patternTest('mix.*')('mixer.osc')).toBe(false);
  });
});

describe('checklistControls', () => {
  it('gives each control to the first step that names it, in panel order, and never a ui control', () => {
    const def = makeMiniD();
    const [first, rest] = checklistControls(def, [
      { title: 'a', module: 'filter', why: 'a', controls: ['filter.cutoff', 'osc1.wave'] },
      { title: 'b', module: 'osc', why: 'b', controls: ['*'] },
    ]);

    expect(first.map((c) => c.id)).toEqual(['osc1.wave', 'filter.cutoff']);
    expect(rest.map((c) => c.id)).not.toContain('osc1.wave');
    expect(rest.map((c) => c.id)).not.toContain('view.help');
    expect([...first, ...rest].map((c) => c.id).sort()).toEqual(
      checklistRequired(def)
        .map((c) => c.id)
        .sort()
    );
  });
});
