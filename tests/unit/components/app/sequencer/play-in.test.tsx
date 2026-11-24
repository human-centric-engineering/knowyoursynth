// @vitest-environment happy-dom

/**
 * Playing into the sequencer (`f-step-sequencer` t-86): step record writes a note or a chord on the chosen step and
 * moves on, with Rest and Tie; live record writes what is played over the loop on the step it was played on, quantised
 * or keeping its nudge; and arp mode plays the keys held through the pattern's steps, started by a press and stopped by
 * letting go unless Hold is on. The engine is a fake that records what it is sent, and its clock is moved by hand.
 *
 * @see components/app/sequencer/use-sequencer.ts
 * @see components/app/sequencer/sequencer.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import {
  useSequencer,
  type LaneTarget,
  type Sequencer as SeqState,
} from '@/components/app/sequencer/use-sequencer';
import type { Phrase, SynthDef } from '@/lib/app/synths/contract';
import { BEND } from '@/lib/app/synths/lib/performance';
import { WHEEL } from '@/lib/app/synths/lib/patch';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import type { LoopEvent } from '@/lib/app/synths/audio/pattern-player';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** C3, D♯3, G3 and C4 on steps 1, 3, 5 and 7 of eight sixteenths; G3 at 0.6. */
const RIFF: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 48, 0.25],
    [0.5, 51, 0.25],
    [1, 55, 0.25, 0.6],
    [1.5, 60, 0.5],
  ],
};

/** One sixteenth at 120 bpm, in frames at 48 kHz. */
const STEP = 6000;

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

function Harness({ riff, holdAtStart = false }: { riff: Phrase | null; holdAtStart?: boolean }) {
  const [hold, setHold] = useState(holdAtStart);
  const seq = useSequencer({ engine, ensureAudio: async () => true, riff, hold });
  state = seq;
  return (
    <Sequencer
      seq={seq}
      playing={seq.playing}
      onPlay={() => void seq.play()}
      onStop={seq.stop}
      hold={{ on: hold, set: setHold }}
      transport
    />
  );
}

const open = (riff: Phrase | null = RIFF, holdAtStart = false) =>
  render(<Harness riff={riff} holdAtStart={holdAtStart} />);
const keys = () =>
  within(screen.getByRole('group', { name: /^Steps of part/ })).getAllByRole('button');
const label = (n: number) => keys()[n - 1].getAttribute('aria-label');
const chosen = () => keys().findIndex((k) => k.getAttribute('aria-current') === 'true') + 1;
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const pick = (name: string, option: string) => {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const sentOf = <T extends SynthMessage['type']>(type: T) =>
  engine.sent.filter((m): m is Extract<SynthMessage, { type: T }> => m.type === type);
const lastOf = <T extends SynthMessage['type']>(type: T) => sentOf(type).at(-1);
const steps = () => state.pattern.parts[0].steps;

const loopEvent = (over: Partial<LoopEvent> = {}): LoopEvent => ({
  type: 'loop',
  index: 0,
  start: true,
  beat: 0,
  beats: 2,
  bpm: 120,
  frame: 0,
  ...over,
});
const fire = (e: LoopEvent) => act(() => state.onEvent(e));
const play = async () => {
  await act(async () => {
    fireEvent.click(button('Play'));
  });
};
const press = (n: number, v?: number) => {
  let took = false;
  act(() => {
    took = state.noteIn(n, v);
  });
  return took;
};
const pressNow = async (n: number) => {
  let took = false;
  await act(async () => {
    took = state.noteIn(n);
  });
  return took;
};
const release = (n: number) => act(() => state.noteOut(n));
/** The pattern's notes the engine was last sent for the loop playing, by pitch. */
const playingNotes = () => lastOf('patternEdit')?.loop?.notes.map((n) => n[1]);

beforeEach(() => {
  engine = fakeEngine();
});

describe('step record', () => {
  it('writes a note on the chosen step and moves on once the key is up', () => {
    open(null);
    pick('Keys', 'Step record');
    expect(press(60)).toBe(false);
    // the step is written as the key goes down; the next is chosen as it comes up
    expect(label(1)).toBe('Step 1: C4, on');
    expect(chosen()).toBe(1);
    release(60);
    expect(chosen()).toBe(2);
  });

  it('writes keys down together as a chord on one step, with a MIDI key’s velocity', () => {
    open(null);
    pick('Keys', 'Step record');
    press(48);
    press(52, 100 / 127);
    press(55);
    release(48);
    release(52);
    expect(chosen()).toBe(1);
    release(55);
    expect(chosen()).toBe(2);
    expect(steps()[0].notes).toEqual([
      { note: 48, gate: 1 },
      { note: 52, gate: 1, velocity: 0.787 },
      { note: 55, gate: 1 },
    ]);
    // the next chord starts fresh on the next step
    press(50);
    release(50);
    expect(steps()[1].notes).toEqual([{ note: 50, gate: 1 }]);
    expect(chosen()).toBe(3);
  });

  it('puts a key pressed before the move is drawn on the step after, not over the one just written', () => {
    open(null);
    pick('Keys', 'Step record');
    press(60);
    // let go and the next pressed in one go, before React draws step 2 chosen
    act(() => {
      state.noteOut(60);
      state.noteIn(62);
    });
    expect(label(1)).toBe('Step 1: C4, on');
    expect(label(2)).toBe('Step 2: D4, on');
  });

  it('still moves on after a key pressed here is let go in another mode', () => {
    open(null);
    pick('Keys', 'Step record');
    press(60);
    pick('Keys', 'Live record');
    release(60);
    pick('Keys', 'Step record');
    press(62);
    release(62);
    // 62 went on step 1, alone (no stale 60 in its chord), and step record moved on
    expect(label(1)).toBe('Step 1: D4, on');
    expect(chosen()).toBe(2);
  });

  it('rests and ties, moving on each time, and one Undo takes back each step', () => {
    open(null);
    pick('Keys', 'Step record');
    press(60);
    release(60);
    fireEvent.click(button('Tie'));
    fireEvent.click(button('Tie'));
    fireEvent.click(button('Rest'));
    press(62);
    release(62);
    expect(steps()[0].notes).toEqual([{ note: 60, gate: 3 }]);
    expect(steps()[1].notes).toEqual([]);
    expect(steps()[2].notes).toEqual([]);
    expect(steps()[3].notes).toEqual([]);
    expect(steps()[4].notes).toEqual([{ note: 62, gate: 1 }]);
    expect(chosen()).toBe(6);
    fireEvent.click(button('Undo'));
    expect(steps()[4].notes).toEqual([]);
    // a rest on a rest changed nothing, so it is not an Undo: the next takes back the second tie
    fireEvent.click(button('Undo'));
    expect(steps()[0].notes).toEqual([{ note: 60, gate: 2 }]);
  });

  it('wraps from the last step to the first', () => {
    open(RIFF);
    pick('Keys', 'Step record');
    fireEvent.click(keys()[7]);
    press(64);
    release(64);
    expect(chosen()).toBe(1);
  });

  it('leaves the chosen step where it is in Edit step', () => {
    open(null);
    press(60);
    release(60);
    expect(label(1)).toBe('Step 1: C4, on');
    expect(chosen()).toBe(1);
  });
});

describe('live record', () => {
  /** Sixteen sixteenths of rests: four beats. */
  const start = async () => {
    open(null);
    pick('Keys', 'Live record');
    await play();
    fire(loopEvent({ beats: 4 }));
  };
  const at = (steps: number) => {
    engine.frame = Math.round(steps * STEP);
  };

  it('quantised, writes a note on the nearest step, its length in whole steps, and still sounds it', async () => {
    await start();
    at(4.4);
    expect(press(60)).toBe(false);
    at(5.6);
    release(60);
    expect(steps()[4].notes).toEqual([{ note: 60, gate: 1 }]);
    // a late press goes on the step after, and is heard from there: the loop playing is sent again
    at(6.7);
    press(62);
    at(9.4);
    release(62);
    expect(steps()[7].notes).toEqual([{ note: 62, gate: 3 }]);
    expect(lastOf('patternEdit')?.loop?.notes.map((n) => n[1])).toEqual([60, 62]);
  });

  it('with quantise off, keeps how late the note was and how long it was held', async () => {
    await start();
    fireEvent.click(button('Quantise'));
    at(8.25);
    press(64, 0.5);
    at(9);
    release(64);
    expect(steps()[8].notes).toEqual([{ note: 64, gate: 0.75, nudge: 0.25, velocity: 0.5 }]);
  });

  it('places a note held over the loop’s end where it went down, with its whole length', async () => {
    await start();
    at(14);
    press(60);
    fire(loopEvent({ index: 1, beats: 4, frame: 16 * STEP }));
    at(18);
    release(60);
    expect(steps()[14].notes).toEqual([{ note: 60, gate: 4 }]);
  });

  it('overdubs onto a step’s notes, or replaces them, and keys struck together are a chord', async () => {
    await start();
    const strike = (n: number, s: number) => {
      at(s);
      press(n);
      at(s + 0.5);
      release(n);
    };
    strike(48, 0);
    strike(52, 0.1);
    expect(steps()[0].notes.map((n) => n.note)).toEqual([48, 52]);
    pick('Record', 'Replace');
    fire(loopEvent({ index: 1, beats: 4, frame: 16 * STEP }));
    strike(55, 16);
    expect(steps()[0].notes.map((n) => n.note)).toEqual([55]);
    strike(59, 16.2);
    expect(steps()[0].notes.map((n) => n.note)).toEqual([55, 59]);
  });

  it('puts a note quantised past the last step on the first step of the part the next loop plays', async () => {
    open(null);
    act(() => {
      state.edit((q) => ({
        ...q,
        parts: [q.parts[0], structuredClone(q.parts[0])],
        chain: [0, 1],
      }));
    });
    pick('Keys', 'Live record');
    await play();
    fire(loopEvent({ beats: 4 }));
    at(15.7);
    press(60);
    at(16.2);
    release(60);
    expect(state.pattern.parts[1].steps[0].notes.map((n) => n.note)).toEqual([60]);
    expect(state.pattern.parts[0].steps[0].notes).toEqual([]);
  });

  it('with nothing queued after (a pattern that doesn’t loop), puts it on the next part in the chain', async () => {
    open(null);
    act(() => {
      state.edit((q) => ({
        ...q,
        loop: false,
        parts: [q.parts[0], structuredClone(q.parts[0])],
        chain: [0, 1],
      }));
    });
    pick('Keys', 'Live record');
    await play();
    fire(loopEvent({ beats: 4 }));
    at(15.7);
    press(60);
    at(16.2);
    release(60);
    expect(state.pattern.parts[1].steps[0].notes.map((n) => n.note)).toEqual([60]);
    expect(state.pattern.parts[0].steps[0].notes).toEqual([]);
  });

  it('replaces a step’s notes again after Stop and Play: the last run’s strikes are not this run’s chord', async () => {
    await start();
    pick('Record', 'Replace');
    at(2);
    press(48);
    at(2.5);
    release(48);
    fireEvent.click(button('Stop'));
    await play();
    fire(loopEvent({ beats: 4 }));
    at(2);
    press(52);
    at(2.5);
    release(52);
    expect(steps()[2].notes.map((n) => n.note)).toEqual([52]);
  });

  it('records nothing while stopped, or for a key still down at Stop', async () => {
    open(null);
    pick('Keys', 'Live record');
    press(60);
    release(60);
    expect(steps().every((s) => s.notes.length === 0)).toBe(true);
    await play();
    fire(loopEvent({ beats: 4 }));
    at(2);
    press(62);
    fireEvent.click(button('Stop'));
    release(62);
    expect(steps().every((s) => s.notes.length === 0)).toBe(true);
  });
});

describe('arp mode', () => {
  it('takes the keys from the page, starts the pattern on a press, and plays them through the steps that play', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    expect(await pressNow(48)).toBe(true);
    expect(state.playing).toBe(true);
    // the first loop plays the one key held on every step that plays, with the steps' own velocity
    expect(sentOf('pattern').at(-1)?.loop.notes).toEqual([
      [0, 48, 0.25],
      [0.5, 48, 0.25],
      [1, 48, 0.25, 0.6],
      [1.5, 48, 0.5],
    ]);
    fire(loopEvent());
    press(55);
    press(52);
    expect(playingNotes()).toEqual([48, 52, 55, 48]);
    expect(screen.getByText('Playing C3 G3 E3')).toBeTruthy();
  });

  it('starts on the key at once, with no count-in even with Count-in on', async () => {
    open(RIFF);
    act(() => state.setBacking({ countIn: true, settings: { click: false, drums: null } }));
    pick('Keys', 'Arp');
    expect(await pressNow(48)).toBe(true);
    expect(sentOf('pattern').at(-1)).not.toHaveProperty('countIn');
  });

  it('plays the order and octaves chosen', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await pressNow(48);
    fire(loopEvent());
    press(52);
    pick('Order', 'Down');
    expect(playingNotes()).toEqual([52, 48, 52, 48]);
    pick('Order', 'As played');
    act(() => state.setArp({ ...state.arp, octaves: 2 }));
    expect(playingNotes()).toEqual([48, 52, 60, 64]);
  });

  it('carries the arp on into the next loop', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await pressNow(48);
    fire(loopEvent());
    press(52);
    press(55);
    // four steps play of three notes: the loop after starts on the second
    expect(lastOf('patternNext')?.loop?.notes.map((n) => n[1])).toEqual([52, 55, 48, 52]);
  });

  it('stops when every key is let go, unless Hold is on', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await pressNow(48);
    fire(loopEvent());
    press(52);
    release(48);
    expect(state.playing).toBe(true);
    expect(playingNotes()).toEqual([52, 52, 52, 52]);
    release(52);
    expect(state.playing).toBe(false);
    expect(lastOf('stopPattern')).toBeTruthy();
  });

  it('with Hold on, keeps playing keys let go, until Hold goes off', async () => {
    open(RIFF, true);
    pick('Keys', 'Arp');
    await pressNow(48);
    fire(loopEvent());
    press(55);
    release(48);
    release(55);
    expect(state.playing).toBe(true);
    expect(playingNotes()).toEqual([48, 55, 48, 55]);
    fireEvent.click(button('Hold'));
    expect(state.playing).toBe(false);
  });

  it('starts again on a press after Stop, with Hold keeping keys from before', async () => {
    open(RIFF, true);
    pick('Keys', 'Arp');
    await pressNow(48);
    release(48);
    fireEvent.click(button('Stop'));
    expect(state.playing).toBe(false);
    await pressNow(52);
    expect(state.playing).toBe(true);
  });

  it('joins a Play still waiting for the sound, and leaves that run playing when the key is let go', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await act(async () => {
      fireEvent.click(button('Play'));
      state.noteIn(48);
    });
    expect(state.playing).toBe(true);
    release(48);
    expect(state.playing).toBe(true);
  });

  it('stops the run a tap started when the key is up before the sound is ready', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await act(async () => {
      state.noteIn(48);
      state.noteOut(48);
    });
    expect(state.playing).toBe(false);
    expect(lastOf('stopPattern')).toBeTruthy();
  });

  it('sends nothing again when Hold changes what nobody holds', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await play();
    fire(loopEvent());
    const before = sentOf('patternEdit').length;
    fireEvent.click(button('Hold'));
    fireEvent.click(button('Hold'));
    expect(sentOf('patternEdit')).toHaveLength(before);
  });

  it('leaves a pattern started with Play running, silent, when the keys are let go', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await play();
    fire(loopEvent());
    press(48);
    release(48);
    expect(state.playing).toBe(true);
    expect(playingNotes()).toEqual([]);
  });

  it('gives the steps their own notes back when another mode is chosen', async () => {
    open(RIFF);
    pick('Keys', 'Arp');
    await pressNow(48);
    fire(loopEvent());
    pick('Keys', 'Edit step');
    expect(playingNotes()).toEqual([48, 51, 55, 60]);
    // and keys reach the chosen step again, sounded by the page
    expect(press(62)).toBe(false);
  });
});

describe('live record of the performance wheels (t-310)', () => {
  /** A synth with a mod wheel and a pitch wheel, and nothing on its panel. */
  const WHEELS = {
    controls: [],
    performance: { wheel: { cc: 1 }, bend: { range: 2 } },
  } as unknown as SynthDef;

  function WheelHarness({ def }: { def: SynthDef }) {
    const [lanes] = useState<LaneTarget>(() => ({ def, paramsFor: () => null }));
    state = useSequencer({ engine, ensureAudio: async () => true, riff: null, lanes });
    return null;
  }

  const at = (steps: number) => {
    engine.frame = Math.round(steps * STEP);
  };
  /** Sixteen sixteenths of rests, playing, in live record. */
  const start = async (def: SynthDef = WHEELS, keys: 'live' | 'edit' = 'live') => {
    render(<WheelHarness def={def} />);
    act(() => state.setKeys(keys));
    await act(async () => {
      await state.play({ countIn: false });
    });
    fire(loopEvent({ beats: 4 }));
  };
  const move = (id: string, v: number, step: number) => {
    at(step);
    act(() => state.wheelIn(id, v));
  };
  /** Lets the wheels' wait run out, so what was moved is written. */
  const settle = (ms = 60) => act(() => void vi.advanceTimersByTime(ms));
  const lane = (id: string) => steps().map((s) => s.mod?.[id]);

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the mod wheel into a lane it adds, on the steps it was moved in, and is heard', async () => {
    await start();
    expect(state.pattern.lanes).toBeUndefined();
    move(WHEEL, 0.2, 1.1);
    move(WHEEL, 0.4, 1.6);
    // still on step 2: only its newest position is kept
    move(WHEEL, 0.7, 2.3);
    move(WHEEL, 1, 4.9);
    settle();
    expect(state.pattern.lanes).toEqual([WHEEL]);
    const want: (number | undefined)[] = Array(16).fill(undefined);
    want[1] = 0.4;
    want[2] = 0.7;
    // quantise on still writes a wheel on the step it was moved in, not the nearest
    want[4] = 1;
    expect(lane(WHEEL)).toEqual(want);
    // the loop playing is sent again with the lane in it
    expect(lastOf('patternEdit')).toBeDefined();
  });

  it('writes the pitch wheel bent and sprung back to the middle', async () => {
    await start();
    move(BEND, -0.5, 3.2);
    move(BEND, 0, 5.5);
    settle();
    expect(state.pattern.lanes).toEqual([BEND]);
    expect(lane(BEND)[3]).toBe(-0.5);
    expect(lane(BEND)[5]).toBe(0);
  });

  it('writes nothing new for a wheel left still', async () => {
    await start();
    move(WHEEL, 0.5, 2.2);
    move(WHEEL, 0.5, 6.2);
    fire(loopEvent({ index: 1, beats: 4, frame: 16 * STEP }));
    move(WHEEL, 0.5, 19.5);
    settle();
    expect(lane(WHEEL).filter((v) => v !== undefined)).toEqual([0.5]);
    expect(lane(WHEEL)[2]).toBe(0.5);
  });

  it('takes a whole take back in one Undo, the lane it added with it', async () => {
    await start();
    for (let k = 0; k < 10; k++) {
      move(WHEEL, k / 10, 1 + k);
      move(BEND, -k / 10, 1 + k);
      settle(100);
    }
    expect(lane(WHEEL)[10]).toBe(0.9);
    expect(lane(BEND)[10]).toBe(-0.9);
    act(() => state.undo());
    expect(state.pattern.lanes).toBeUndefined();
    expect(steps().every((s) => s.mod === undefined)).toBe(true);
    expect(state.canUndo).toBe(false);
  });

  describe('riding the wheel along with the pattern (t-311)', () => {
    /** A take on the mod wheel: 0.4 on step 2 and 0.8 on step 5, written, then out of live record. */
    const recorded = async () => {
      await start();
      move(WHEEL, 0.4, 1.2);
      move(WHEEL, 0.8, 4.2);
      settle();
      act(() => state.setKeys('edit'));
    };

    it('sends the loop without the wheel lane while on, and with it again once off', async () => {
      await recorded();
      expect(state.canPlayAlong).toBe(true);
      expect(lastOf('patternEdit')?.loop.lanes).toEqual([WHEEL]);
      act(() => state.setPlayAlong(true));
      const along = lastOf('patternEdit')?.loop;
      expect(along?.lanes).toBeUndefined();
      expect(along?.mods).toBeUndefined();
      act(() => state.setPlayAlong(false));
      expect(lastOf('patternEdit')?.loop.lanes).toEqual([WHEEL]);
    });

    it('shows the lane’s wheel as the ghost, not on the wheel, on the step being heard', async () => {
      await recorded();
      act(() => state.setPlayAlong(true));
      at(1.5);
      act(() => void vi.advanceTimersByTime(50));
      expect(state.ghost).toEqual({ [WHEEL]: 0.4 });
      expect(state.modShown).toBeNull();
      act(() => state.setPlayAlong(false));
      act(() => void vi.advanceTimersByTime(50));
      expect(state.ghost).toBeNull();
      expect(state.modShown).toEqual({ [WHEEL]: 0.4 });
    });

    it('is not offered on a pattern without a wheel lane', async () => {
      await start();
      expect(state.canPlayAlong).toBe(false);
    });
  });

  it('starts another Undo for a wheel moved again after a pause', async () => {
    await start();
    move(WHEEL, 0.3, 1.2);
    settle();
    settle(1500);
    move(WHEEL, 0.6, 7.2);
    settle();
    act(() => state.undo());
    expect(lane(WHEEL)[1]).toBe(0.3);
    expect(lane(WHEEL)[7]).toBeUndefined();
  });

  it('drops a wheel move not yet written when Undo takes the take back', async () => {
    await start();
    move(WHEEL, 0.3, 1.2);
    settle();
    move(WHEEL, 0.6, 2.2);
    act(() => state.undo());
    settle();
    expect(state.pattern.lanes).toBeUndefined();
    expect(state.canUndo).toBe(false);
  });

  it('records the wheel at the position it was left at again, after an Undo', async () => {
    await start();
    move(WHEEL, 0.6, 1.2);
    settle();
    act(() => state.undo());
    move(WHEEL, 0.6, 3.2);
    settle();
    expect(lane(WHEEL)[3]).toBe(0.6);
  });

  it('writes a wheel moved just before Stop', async () => {
    await start();
    move(WHEEL, 0.8, 3.1);
    act(() => state.stop());
    expect(lane(WHEEL)[3]).toBe(0.8);
  });

  it('writes nothing outside live record, or while stopped', async () => {
    await start(WHEELS, 'edit');
    move(WHEEL, 0.5, 2.2);
    settle();
    expect(state.pattern.lanes).toBeUndefined();

    act(() => state.setKeys('live'));
    act(() => state.stop());
    move(WHEEL, 0.5, 2.2);
    settle();
    expect(state.pattern.lanes).toBeUndefined();
  });

  it('writes nothing for a wheel the synth hasn’t got, nor for a panel control', async () => {
    await start({ ...WHEELS, performance: { wheel: { cc: 1 } } });
    move(BEND, 0.5, 2.2);
    move('cutoff', 0.5, 3.2);
    settle();
    expect(state.pattern.lanes).toBeUndefined();
  });
});
