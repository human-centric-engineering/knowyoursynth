// @vitest-environment happy-dom

/**
 * Mod lanes in the module and the hook (`f-step-sequencer` t-82): a lane is added and drawn (by pointer and from the
 * keyboard), a stroke is one Undo, playing sends each loop with the voice's settings where the lanes change them, a
 * lane for a control this synth lacks is kept and sends nothing, the panel moving resends the loop playing, and the
 * hook says what the lanes set on the step being heard. While a pattern longer than a page plays, the keys and the lanes
 * turn to the page the playhead is on (t-87), and a page chosen by hand holds until its next turn. The engine is a fake
 * that records what it is sent.
 *
 * @see components/app/sequencer/mod-lanes.tsx
 * @see components/app/sequencer/use-sequencer.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMemo } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { nudged } from '@/components/app/sequencer/mod-lanes';
import {
  useSequencer,
  type LaneTarget,
  type Sequencer as SeqState,
} from '@/components/app/sequencer/use-sequencer';
import { importPhrase } from '@/lib/app/sequencer/import';
import { newPattern, type Pattern } from '@/lib/app/sequencer/pattern';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import type { LoopEvent } from '@/lib/app/synths/audio/pattern-player';
import type {
  Control,
  ControlValues,
  EngineParams,
  Phrase,
  SynthDef,
} from '@/lib/app/synths/contract';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Eight sixteenths: a note on steps 1, 3, 5 and 7. */
const RIFF: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 48, 0.25],
    [0.5, 51, 0.25],
    [1, 55, 0.25],
    [1.5, 60, 0.25],
  ],
};

const CUTOFF: Control = {
  id: 'cutoff',
  x: 0,
  y: 0,
  module: 'filter',
  help: '',
  type: 'knob',
  r: 10,
  style: 'pro1',
  kind: 'cont',
  min: 0,
  max: 100,
  def: 40,
};
const DEF = {
  id: 'test',
  controls: [CUTOFF],
  init: { cutoff: 40 },
} as unknown as SynthDef;
const PANEL: ControlValues = { cutoff: 40 };

/** The voice's settings for a set of lane values: just enough to tell which set made them. */
const madeFor = (set: ControlValues, panel = PANEL) =>
  ({ made: { ...panel, ...set } }) as unknown as EngineParams;

function fakeEngine() {
  const sent: SynthMessage[] = [];
  return {
    sent,
    send: vi.fn((m: SynthMessage) => void sent.push(m)),
    frame: 0,
    ctx: { sampleRate: 48000 },
  };
}

let engine: ReturnType<typeof fakeEngine>;
let state: SeqState;

function Harness({ panel = PANEL, def = DEF }: { panel?: ControlValues; def?: SynthDef }) {
  // Made afresh only when the panel or the synth changes, as the page does.
  const lanes = useMemo<LaneTarget>(
    () => ({ def, paramsFor: (set) => madeFor(set, panel) }),
    [def, panel]
  );
  const seq = useSequencer({ engine, ensureAudio: async () => true, riff: RIFF, lanes });
  state = seq;
  return (
    <Sequencer
      seq={seq}
      playing={seq.playing}
      onPlay={() => void seq.play()}
      onStop={seq.stop}
      def={def}
      panel={panel}
      transport
    />
  );
}

const sentOf = <T extends SynthMessage['type']>(type: T) =>
  engine.sent.filter((m): m is Extract<SynthMessage, { type: T }> => m.type === type);
const cells = () =>
  within(screen.getByRole('group', { name: 'cutoff lane' })).getAllByRole('slider');
const addCutoff = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Mod lanes' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Mod lane' }));
  fireEvent.click(screen.getByRole('option', { name: 'cutoff' }));
};
const valueOn = (step: number) => state.pattern.parts[0].steps[step].mod?.cutoff;
/** Copy, paste and clear are in the Edit menu: opened, then the item chosen. */
const menu = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Copy, paste and clear' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
};
/** Lays the cells out 20 wide and 40 high, from the left. */
const layOut = () =>
  cells().forEach((c, k) => {
    c.getBoundingClientRect = () =>
      ({ left: k * 20, right: k * 20 + 18, top: 0, bottom: 40, height: 40, width: 18 }) as DOMRect;
  });

/** The riff with a cutoff lane at 80 on step 1 and 10 on step 3. */
function laned(): Pattern {
  const p = importPhrase(RIFF);
  p.lanes = ['cutoff'];
  p.parts[0].steps[0] = { ...p.parts[0].steps[0], mod: { cutoff: 80 } };
  p.parts[0].steps[2] = { ...p.parts[0].steps[2], mod: { cutoff: 10 } };
  return p;
}

beforeEach(() => {
  engine = fakeEngine();
});

describe('the lanes in the module', () => {
  it('adds a lane for a control of the synth on the panel', () => {
    render(<Harness />);
    addCutoff();
    expect(state.pattern.lanes).toEqual(['cutoff']);
    expect(cells()).toHaveLength(8);
    expect(cells()[0]).toHaveAttribute('aria-valuetext', 'panel value, 40');
  });

  it('sets a value from the keyboard, starting at the panel’s, and clears it with Delete', () => {
    render(<Harness />);
    addCutoff();
    fireEvent.keyDown(cells()[0], { key: 'ArrowUp' });
    expect(valueOn(0)).toBe(42);
    fireEvent.keyDown(cells()[0], { key: 'PageUp' });
    expect(valueOn(0)).toBe(52);
    fireEvent.keyDown(cells()[0], { key: 'ArrowRight' });
    expect(cells()[1]).toHaveFocus();
    fireEvent.keyDown(cells()[0], { key: 'Delete' });
    expect(state.pattern.parts[0].steps[0].mod).toBeUndefined();
  });

  it('draws a stroke across the cells at their heights, undone as one', () => {
    render(<Harness />);
    addCutoff();
    cells().forEach((c, k) => {
      c.getBoundingClientRect = () =>
        ({
          left: k * 20,
          right: k * 20 + 18,
          top: 0,
          bottom: 40,
          height: 40,
          width: 18,
        }) as DOMRect;
    });
    const strip = screen.getByRole('group', { name: 'cutoff lane' });
    fireEvent.pointerDown(strip, { button: 0, clientX: 5, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 25, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(strip, { clientX: 45, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    expect([valueOn(0), valueOn(1), valueOn(2)]).toEqual([100, 25, 50]);
    // A move with the button up draws nothing
    fireEvent.pointerMove(strip, { clientX: 65, clientY: 0, pointerId: 1 });
    expect(valueOn(3)).toBeUndefined();
    act(() => state.undo());
    expect(state.pattern.parts[0].steps.every((s) => !s.mod)).toBe(true);
    expect(state.pattern.lanes).toEqual(['cutoff']);
  });

  it('keeps a lane for a control this synth lacks, says so, and removes a lane', () => {
    render(<Harness />);
    const p = laned();
    p.lanes = ['cutoff', 'gone'];
    p.parts[0].steps[1] = { ...p.parts[0].steps[1], mod: { gone: 3 } };
    act(() => void state.load(p, { id: null, name: 'test' }));
    expect(
      screen.getByText('Not on this synth: kept with the pattern, and silent here.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the cutoff lane' }));
    expect(state.pattern.lanes).toEqual(['gone']);
    expect(state.pattern.parts[0].steps[1].mod).toEqual({ gone: 3 });
  });
});

describe('editing around the lanes', () => {
  it('shows the lanes of a pattern opened while they were hidden', () => {
    render(<Harness />);
    const mod = screen.getByRole('button', { name: 'Mod lanes' });
    expect(mod).toHaveAttribute('aria-pressed', 'false');
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    expect(mod).toHaveAttribute('aria-pressed', 'true');
    expect(cells()).toHaveLength(8);
  });

  it('clears a cell on a double press, undone as one with the presses before it', () => {
    render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    layOut();
    const strip = screen.getByRole('group', { name: 'cutoff lane' });
    // Two presses at the top of the first cell, then the double click they make
    for (let k = 0; k < 2; k++) {
      fireEvent.pointerDown(strip, { button: 0, clientX: 5, clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(strip, { pointerId: 1 });
    }
    expect(valueOn(0)).toBe(100);
    fireEvent.doubleClick(cells()[0]);
    expect(valueOn(0)).toBeUndefined();
    act(() => state.undo());
    expect(valueOn(0)).toBe(80);
  });

  it('pastes a step copied before its lane was removed, without the lane’s value', () => {
    render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    const first = structuredClone(state.pattern.parts[0].steps[0]);
    menu('Copy step');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the cutoff lane' }));
    // The step emptied, so the paste is a change
    act(() =>
      state.edit((q) => ({
        ...q,
        parts: [
          { steps: q.parts[0].steps.map((x, i) => (i === 0 ? { on: false, notes: [] } : x)) },
        ],
      }))
    );
    menu('Paste step');
    const { mod: _mod, ...notes } = first;
    expect(state.pattern.parts[0].steps[0]).toEqual(notes);
  });

  it('keeps the lanes’ values through Clear', () => {
    render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    menu('Clear');
    const steps = state.pattern.parts[0].steps;
    expect(steps.every((s) => s.notes.length === 0)).toBe(true);
    expect([valueOn(0), valueOn(2)]).toEqual([80, 10]);
  });

  it('moves a switch or a choice by one option on every press from the keyboard', () => {
    const at = {
      x: 0,
      y: 0,
      module: 'filter' as const,
      help: '',
      type: 'button' as const,
      w: 10,
      h: 10,
    };
    const sw: Control = { ...at, id: 'sw', kind: 'bool', def: false };
    const wave: Control = {
      ...at,
      id: 'wave',
      kind: 'enum',
      def: 'saw',
      options: [
        { v: 'saw', label: 'Saw' },
        { v: 'tri', label: 'Triangle' },
        { v: 'sq', label: 'Square' },
      ],
    };
    expect(nudged(sw, false, 1, 1 / 50)).toBe(true);
    expect(nudged(sw, true, -1, 1 / 10)).toBe(false);
    expect(nudged(sw, true, 1, 1 / 50)).toBe(true);
    expect(nudged(wave, 'tri', 1, 1 / 50)).toBe('sq');
    expect(nudged(wave, 'tri', -1, 1 / 10)).toBe('saw');
    expect(nudged(wave, 'sq', 1, 1 / 50)).toBe('sq');
  });
});

describe('the lanes playing', () => {
  it('sends each loop with the voice’s settings where the lanes change them', async () => {
    render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    const start = sentOf('pattern').at(-1)!;
    // Sixteenths at 120 BPM: step 3 is half a beat in
    expect(start.loop.params).toEqual([
      [0, madeFor({ cutoff: 80 })],
      [0.25, null],
      [0.5, madeFor({ cutoff: 10 })],
      [0.75, null],
    ]);
  });

  it('sends no settings at all for lanes this synth has no control for', async () => {
    render(<Harness />);
    const p = laned();
    p.lanes = ['gone'];
    p.parts[0].steps[0].mod = { gone: 80 };
    p.parts[0].steps[2].mod = { gone: 10 };
    act(() => void state.load(p, { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    expect(sentOf('pattern').at(-1)!.loop.params).toBeUndefined();
    // And the pattern is held as it was
    expect(state.pattern).toEqual(p);
  });

  it('sends the loop playing again when the panel moves, with what the lanes leave alone moved', async () => {
    const { rerender } = render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    act(() => state.onEvent(loopEvent()));
    const before = sentOf('patternEdit').length;
    rerender(<Harness panel={{ cutoff: 40, res: 9 }} />);
    const edit = sentOf('patternEdit').at(-1)!;
    expect(sentOf('patternEdit')).toHaveLength(before + 1);
    expect(edit.loop.params?.[0]).toEqual([0, madeFor({ cutoff: 80 }, { cutoff: 40, res: 9 })]);
  });

  it('sends the loop again at most once a moment while the panel keeps moving, with the newest panel', async () => {
    const { rerender } = render(<Harness />);
    // Every note a coin toss, so a loop compiled from fresh draws would almost surely differ
    const p = laned();
    p.parts[0].steps = p.parts[0].steps.map((x) =>
      x.notes.length > 0 ? { ...x, probability: 0.5 } : x
    );
    act(() => void state.load(p, { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    act(() => state.onEvent(loopEvent()));
    const before = sentOf('patternEdit').length;
    const queued = sentOf('patternNext').at(-1)!.loop;
    rerender(<Harness panel={{ cutoff: 40, res: 1 }} />);
    rerender(<Harness panel={{ cutoff: 40, res: 2 }} />);
    rerender(<Harness panel={{ cutoff: 40, res: 3 }} />);
    expect(sentOf('patternEdit')).toHaveLength(before + 1);
    await waitFor(() => expect(sentOf('patternEdit')).toHaveLength(before + 2));
    expect(sentOf('patternEdit').at(-1)!.loop.params?.[0]).toEqual([
      0,
      madeFor({ cutoff: 80 }, { cutoff: 40, res: 3 }),
    ]);
    // The loop queued after it keeps its notes' draws: only its settings follow the panel
    expect(sentOf('patternNext').at(-1)!.loop?.notes).toEqual(queued?.notes);
  });

  it('sends nothing again for the panel moving when no lane plays on this synth', async () => {
    const { rerender } = render(<Harness />);
    const p = laned();
    p.lanes = ['gone'];
    p.parts[0].steps[0].mod = { gone: 80 };
    p.parts[0].steps[2].mod = { gone: 10 };
    act(() => void state.load(p, { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    const before = sentOf('patternEdit').length;
    rerender(<Harness panel={{ cutoff: 40, res: 9 }} />);
    await new Promise((r) => setTimeout(r, 80));
    expect(sentOf('patternEdit')).toHaveLength(before);
  });

  it('says what the lanes set on the step being heard, and nothing once stopped', async () => {
    render(<Harness />);
    act(() => void state.load(laned(), { id: null, name: 'test' }));
    await act(async () => void (await state.play()));
    act(() => state.onEvent(loopEvent()));
    await waitFor(() => expect(state.modShown).toEqual({ cutoff: 80 }));
    // Half a beat on at 120 BPM and 48 kHz: step 3
    engine.frame = 12000;
    await waitFor(() => expect(state.modShown).toEqual({ cutoff: 10 }));
    engine.frame = 6000;
    await waitFor(() => expect(state.modShown).toBeNull());
    engine.frame = 0;
    await waitFor(() => expect(state.modShown).toEqual({ cutoff: 80 }));
    act(() => state.stop());
    await waitFor(() => expect(state.modShown).toBeNull());
  });
});

describe('following the playhead across pages', () => {
  const stepKeys = () =>
    within(screen.getByRole('group', { name: /^Steps of part/ })).getAllByRole('button');
  const firstKey = () => stepKeys()[0].getAttribute('aria-label');
  const firstCell = () => cells()[0].getAttribute('aria-label');
  /** The playhead on this step: sixteenths at 120 BPM are an eighth of a second. */
  const playheadOn = (step: number) => {
    engine.frame = (step * 0.125 + 0.01) * 48000;
  };
  /** One frame: the module's own frame read is queued before this one, so it has run when this resolves. */
  const aFrame = () => act(async () => void (await new Promise(requestAnimationFrame)));
  const playLong = async () => {
    render(<Harness />);
    const p = newPattern(48);
    p.lanes = ['cutoff'];
    // a pattern with lanes opens with them shown
    act(() => void state.load(p, { id: null, name: 'long' }));
    await act(async () => void (await state.play()));
    act(() => state.onEvent(loopEvent({ beats: 12 })));
    playheadOn(0);
    await aFrame();
  };

  it('turns the keys and the lanes to the page being heard, leaving the chosen step where it is', async () => {
    await playLong();
    fireEvent.click(stepKeys()[2]);
    expect(firstKey()).toMatch(/^Step 1:/);

    playheadOn(16);
    await waitFor(() => expect(firstKey()).toMatch(/^Step 17:/));
    expect(firstCell()).toBe('cutoff, step 17');
    // the chosen step is off the page: none is current, and Tab reaches the key in its place
    expect(stepKeys().some((k) => k.getAttribute('aria-current'))).toBe(false);
    expect(
      stepKeys()
        .map((k) => k.tabIndex)
        .indexOf(0)
    ).toBe(2);

    // stopped, the keys go back to the page of the chosen step, which is still step 3
    act(() => state.stop());
    await waitFor(() => expect(firstKey()).toMatch(/^Step 1:/));
    expect(stepKeys()[2]).toHaveAttribute('aria-current', 'true');
  });

  it('holds a page chosen by hand while the playhead stays on its page, and gives way at its next turn', async () => {
    await playLong();
    playheadOn(16);
    await waitFor(() => expect(firstKey()).toMatch(/^Step 17:/));

    fireEvent.click(screen.getByRole('button', { name: /^Page 1/ }));
    expect(firstKey()).toMatch(/^Step 1:/);
    playheadOn(20);
    await aFrame();
    expect(state.position()).toEqual({ step: 20, part: 0 });
    expect(firstKey()).toMatch(/^Step 1:/);

    playheadOn(33);
    await waitFor(() => expect(firstKey()).toMatch(/^Step 33:/));
    expect(firstCell()).toBe('cutoff, step 33');
  });

  it('keeps focus on the keys as the page turns under a key holding it', async () => {
    await playLong();
    stepKeys()[4].focus();
    playheadOn(16);
    await waitFor(() => expect(firstKey()).toMatch(/^Step 17:/));
    expect(document.activeElement).toBe(stepKeys()[4]);
    expect(stepKeys()[4].getAttribute('aria-label')).toMatch(/^Step 21:/);
  });

  it('holds the page still while a lane is being drawn on, so the stroke stays on the steps it started on', async () => {
    await playLong();
    const strip = screen.getByRole('group', { name: 'cutoff lane' });
    fireEvent.pointerDown(strip, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    playheadOn(16);
    await aFrame();
    expect(state.position()).toEqual({ step: 16, part: 0 });
    expect(firstCell()).toBe('cutoff, step 1');
    fireEvent.pointerMove(strip, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    expect(valueOn(16)).toBeUndefined();

    // the stroke over, the next turn shows the page being heard
    playheadOn(33);
    await waitFor(() => expect(firstCell()).toBe('cutoff, step 33'));
  });
});

function loopEvent(over: Partial<LoopEvent> = {}): LoopEvent {
  return { type: 'loop', index: 0, start: true, beat: 0, beats: 2, bpm: 120, frame: 0, ...over };
}
