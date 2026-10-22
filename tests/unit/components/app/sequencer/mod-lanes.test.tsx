// @vitest-environment happy-dom

/**
 * Mod lanes in the module and the hook (`f-step-sequencer` t-82): a lane is added and drawn (by pointer and from the
 * keyboard), a stroke is one Undo, playing sends each loop with the voice's settings where the lanes change them, a
 * lane for a control this synth lacks is kept and sends nothing, the panel moving resends the loop playing, and the
 * hook says what the lanes set on the step being heard. The engine is a fake that records what it is sent.
 *
 * @see components/app/sequencer/mod-lanes.tsx
 * @see components/app/sequencer/use-sequencer.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import {
  useSequencer,
  type LaneTarget,
  type Sequencer as SeqState,
} from '@/components/app/sequencer/use-sequencer';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { Pattern } from '@/lib/app/sequencer/pattern';
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
  style: 'davies',
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
  const lanes: LaneTarget = { def, paramsFor: (set) => madeFor(set, panel) };
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
    fireEvent.click(screen.getByRole('button', { name: 'Mod lanes' }));
    expect(
      screen.getByText('Not on this synth: kept with the pattern, and silent here.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the cutoff lane' }));
    expect(state.pattern.lanes).toEqual(['gone']);
    expect(state.pattern.parts[0].steps[1].mod).toEqual({ gone: 3 });
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

function loopEvent(over: Partial<LoopEvent> = {}): LoopEvent {
  return { type: 'loop', index: 0, start: true, beat: 0, beats: 2, bpm: 120, frame: 0, ...over };
}
