// @vitest-environment happy-dom

/**
 * Following a MIDI clock (`f-midi-hardware-lead` t-91): the clock source chosen and kept in this browser, only its
 * input read, Start, Continue and Stop driving the sequencer, a clock gone quiet, the input going away, another pattern
 * mid-run kept on the clock's beat, the tempo not the pattern's, and no clock sent out meanwhile. Then the readout:
 * the Clock select and the read-only Tempo.
 *
 * `useMidi`, the follower, `useSequencer` and `useMidiOut` are real; `navigator.requestMIDIAccess` is a fake with two
 * inputs (a drum machine and a keyboard) and an output that records what it is sent. With no engine context, every
 * frame is taken as heard now. `performance.now()` is the test's to set, as the follower's timer reads it.
 *
 * @see components/app/sequencer/use-clock-in.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useMidi, type MidiHandlers } from '@/components/app/synth/use-midi';
import { CHECK_MS, useClockIn, type ClockIn } from '@/components/app/sequencer/use-clock-in';
import { useMidiOut } from '@/components/app/sequencer/use-midi-out';
import { useSequencer } from '@/components/app/sequencer/use-sequencer';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { STORAGE_KEYS } from '@/components/app/synth/storage';
import { newPattern } from '@/lib/app/sequencer/pattern';
import { CLOCK, PPQN, START, STOP } from '@/lib/app/midi/scheduler';
import { CONTINUE } from '@/lib/app/midi/follow';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

interface FakeInput {
  id: string;
  name: string;
  state: string;
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null;
}
interface FakeOutput {
  id: string;
  name: string;
  state: string;
  send: ReturnType<typeof vi.fn<(data: number[], at?: number) => void>>;
}

let tr8: FakeInput;
let keys: FakeInput;
let td3: FakeOutput;
let inputs: FakeInput[];
let access: {
  inputs: { forEach: (f: (i: FakeInput) => void) => void };
  outputs: { forEach: (f: (o: FakeOutput) => void) => void; get: (id: string) => FakeOutput };
  onstatechange: (() => void) | null;
};
let now = 0;

const handlers = (): MidiHandlers => ({
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  onWheel: vi.fn(),
  remember: vi.fn(),
  load: () => false,
});

beforeEach(() => {
  localStorage.clear();
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  tr8 = { id: 'tr8', name: 'TR-8', state: 'connected', onmidimessage: null };
  keys = { id: 'keys', name: 'Keystation', state: 'connected', onmidimessage: null };
  td3 = { id: 'td3', name: 'TD-3', state: 'connected', send: vi.fn() };
  inputs = [tr8, keys];
  access = {
    inputs: { forEach: (f) => inputs.forEach(f) },
    outputs: { forEach: (f) => [td3].forEach(f), get: () => td3 },
    onstatechange: null,
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: vi.fn().mockResolvedValue(access),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'requestMIDIAccess');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The page: MIDI, the clock followed, MIDI out, and the sequencer, with an engine that logs what it is sent. */
async function page() {
  const sent: SynthMessage[] = [];
  const engine = { send: (m: SynthMessage) => void sent.push(m), frame: 0, ctx: null };
  const hook = renderHook(() => {
    const midi = useMidi(handlers());
    const clockIn = useClockIn({ midi, engine: null });
    const out = useMidiOut({
      midi,
      engine: null,
      connect: () => void midi.connect(),
      following: clockIn.clock.following,
    });
    const seq = useSequencer({
      engine,
      ensureAudio: async () => true,
      riff: null,
      out: out.out,
      clock: clockIn.clock,
    });
    return { midi, clockIn, out, seq };
  });
  await act(async () => {
    await hook.result.current.midi.connect();
  });
  return { ...hook, sent };
}

const GAP = 60000 / (120 * PPQN);

/** A message on `input`, at the time now. */
async function msg(input: FakeInput, ...data: number[]) {
  await act(async () => {
    input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: now });
  });
}
/** `n` pulses at 120 BPM on `input`, the time moving with them. */
async function pulses(input: FakeInput, n: number) {
  await act(async () => {
    for (let k = 0; k < n; k++) {
      input.onmidimessage?.({ data: new Uint8Array([CLOCK]), timeStamp: now });
      now += GAP;
    }
  });
}

const patterns = (sent: SynthMessage[]) =>
  sent.filter((m): m is Extract<SynthMessage, { type: 'pattern' }> => m.type === 'pattern');
const stops = (sent: SynthMessage[]) => sent.filter((m) => m.type === 'stopPattern').length;

describe('the clock source', () => {
  it('is Internal until an input is chosen, which is kept in this browser', async () => {
    const { result } = await page();
    expect(result.current.clockIn.inputs.map((i) => i.name)).toEqual(['TR-8', 'Keystation']);
    expect(result.current.clockIn.source).toBeNull();
    expect(result.current.clockIn.clock.following).toBe(false);
    act(() => result.current.clockIn.setSource('tr8'));
    expect(result.current.clockIn.source).toEqual({ id: 'tr8', name: 'TR-8' });
    expect(result.current.clockIn.clock.following).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.midiClock) ?? 'null')).toEqual({
      input: { id: 'tr8', name: 'TR-8' },
    });
    act(() => result.current.clockIn.setSource(null));
    expect(result.current.clockIn.clock.following).toBe(false);
  });

  it('a chosen input not plugged in is kept, and not followed until it is', async () => {
    localStorage.setItem(
      STORAGE_KEYS.midiClock,
      JSON.stringify({ input: { id: 'mpc', name: 'MPC' } })
    );
    const { result } = await page();
    expect(result.current.clockIn.source).toEqual({ id: 'mpc', name: 'MPC' });
    expect(result.current.clockIn.connected).toBe(false);
    expect(result.current.clockIn.clock.following).toBe(false);
  });

  it('reads only the chosen input’s clock', async () => {
    const { result } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await pulses(keys, PPQN * 2);
    expect(result.current.clockIn.clock.bpm).toBeNull();
    await pulses(tr8, PPQN * 2);
    expect(result.current.clockIn.clock.bpm).toBeCloseTo(120, 3);
  });
});

describe('the transport', () => {
  it('starts on Start and the pulse after it, at the clock’s tempo; clock alone starts nothing', async () => {
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await pulses(tr8, PPQN * 2);
    expect(patterns(sent)).toEqual([]);
    await msg(tr8, START);
    expect(patterns(sent)).toEqual([]);
    await pulses(tr8, 1);
    expect(patterns(sent)).toHaveLength(1);
    expect(patterns(sent)[0]).toMatchObject({ bpm: expect.closeTo(120, 3) });
    expect(patterns(sent)[0].index).toBeUndefined();
    expect(patterns(sent)[0].beat).toBeUndefined();
    expect(result.current.seq.playing).toBe(true);
  });

  it('stops on Stop, and Continue resumes from where the clock stopped, part-way into a loop', async () => {
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await msg(tr8, START);
    await pulses(tr8, PPQN * 6);
    await msg(tr8, STOP);
    expect(stops(sent)).toBe(1);
    expect(result.current.seq.playing).toBe(false);
    await msg(tr8, CONTINUE);
    await pulses(tr8, 1);
    // Beat 6 of a 4-beat pattern: loop 1, beat 2.
    expect(patterns(sent)[1]).toMatchObject({ index: 1, beat: 2 });
    expect(result.current.seq.playing).toBe(true);
  });

  it('a clock gone quiet for two beats stops what it started', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await msg(tr8, START);
    await pulses(tr8, PPQN * 2);
    now += 900;
    act(() => {
      vi.advanceTimersByTime(CHECK_MS);
    });
    expect(stops(sent)).toBe(0);
    now += 200;
    act(() => {
      vi.advanceTimersByTime(CHECK_MS);
    });
    expect(stops(sent)).toBe(1);
    expect(result.current.seq.playing).toBe(false);
  });

  it('the input let go of stops what its clock started', async () => {
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await msg(tr8, START);
    await pulses(tr8, 4);
    act(() => result.current.clockIn.setSource(null));
    expect(stops(sent)).toBe(1);
    expect(result.current.seq.playing).toBe(false);
  });

  it('another pattern mid-run starts where the clock is, not from its top', async () => {
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await msg(tr8, START);
    await pulses(tr8, PPQN * 5 + PPQN / 2);
    act(() => void result.current.seq.load(newPattern(), { id: null, name: 'Other' }));
    // 5.5 beats in: loop 1, beat 1.5.
    const again = patterns(sent)[1];
    expect(again.index).toBe(1);
    expect(again.beat).toBeCloseTo(1.5, 6);
  });

  it('plays the clock’s tempo, not the pattern’s, and Play here plays at it', async () => {
    const { result, sent } = await page();
    act(() => result.current.clockIn.setSource('tr8'));
    await pulses(tr8, PPQN * 2);
    await act(async () => {
      await result.current.seq.play();
    });
    expect(patterns(sent)[0].bpm).toBeCloseTo(120, 3);
    sent.length = 0;
    act(() => void result.current.seq.edit((p) => ({ ...p, bpm: 90 })));
    expect(sent.filter((m) => m.type === 'tempo' && 'bpm' in m && m.bpm === 90)).toEqual([]);
  });

  it('a run Play started here goes back to the pattern’s tempo once the clock is let go', async () => {
    const { result, sent } = await page();
    act(() => void result.current.seq.edit((p) => ({ ...p, bpm: 90 })));
    act(() => result.current.clockIn.setSource('tr8'));
    await pulses(tr8, PPQN * 2);
    await act(async () => {
      await result.current.seq.play();
    });
    expect(patterns(sent)[0].bpm).toBeCloseTo(120, 3);
    sent.length = 0;
    act(() => result.current.clockIn.setSource(null));
    expect(result.current.seq.playing).toBe(true);
    expect(sent.filter((m) => m.type === 'tempo')).toEqual([{ type: 'tempo', bpm: 90 }]);
  });
});

describe('MIDI out meanwhile', () => {
  it('sends no clock while one is followed, and sends it again as chosen once let go', async () => {
    const { result, sent } = await page();
    act(() => result.current.out.setOutput('td3'));
    act(() => result.current.out.setClock(true));
    act(() => result.current.clockIn.setSource('tr8'));
    expect(result.current.out.following).toBe(true);
    expect(result.current.out.clock).toBe(true);
    const bytes = () => td3.send.mock.calls.map(([d]) => d[0]);
    /** The player's first loop of the run just started, heard now: MIDI out places what it sends from it. */
    const heard = () => {
      act(() => {
        const run = patterns(sent).at(-1)?.run;
        result.current.seq.onEvent({
          type: 'loop',
          index: 0,
          start: true,
          beat: 0,
          beats: 4,
          bpm: 120,
          frame: 0,
          run,
        });
        result.current.out.out.event({ type: 'patternTick', run });
      });
    };
    await msg(tr8, START);
    await pulses(tr8, 1);
    heard();
    await pulses(tr8, PPQN);
    expect(bytes()).not.toContain(START);
    expect(bytes()).not.toContain(CLOCK);
    // Let go of, the clock goes out as chosen: Start, then pulses, from the next run.
    await msg(tr8, STOP);
    act(() => result.current.clockIn.setSource(null));
    expect(result.current.out.following).toBe(false);
    await act(async () => {
      await result.current.seq.play();
    });
    heard();
    expect(bytes()).toContain(START);
    expect(bytes()).toContain(CLOCK);
  });
});

describe('the readout', () => {
  const engine = { send: vi.fn(), frame: 0, ctx: { sampleRate: 48000 } };
  function Module({ clockIn }: { clockIn: ClockIn }) {
    const seq = useSequencer({ engine, ensureAudio: async () => true, riff: null });
    return (
      <Sequencer
        seq={seq}
        playing={false}
        onPlay={() => undefined}
        onStop={() => undefined}
        clockIn={clockIn}
      />
    );
  }
  const fake = (over: Partial<ClockIn> = {}, following = false, bpm: number | null = null) => ({
    status: 'on' as const,
    inputs: [{ id: 'tr8', name: 'TR-8' }],
    source: null,
    setSource: vi.fn(),
    connected: following,
    clock: {
      following,
      bpm,
      attach: () => () => undefined,
      beat: () => null,
      rejoin: () => undefined,
      message: () => undefined,
      event: () => undefined,
    },
    ...over,
  });

  it('chooses the clock source beside Tempo, which is the pattern’s and set here on Internal', () => {
    const c = fake();
    render(<Module clockIn={c} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Clock' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Internal', 'TR-8']);
    fireEvent.click(screen.getByRole('option', { name: 'TR-8' }));
    expect(c.setSource).toHaveBeenCalledWith('tr8');
    const tempo = screen.getByRole('slider', { name: 'Tempo' });
    expect(tempo.getAttribute('aria-readonly')).toBeNull();
    fireEvent.keyDown(tempo, { key: 'ArrowUp' });
    expect(tempo.getAttribute('aria-valuenow')).toBe('121');
  });

  it('following, shows the clock’s tempo, read-only', () => {
    render(<Module clockIn={fake({ source: { id: 'tr8', name: 'TR-8' } }, true, 133.6)} />);
    const tempo = screen.getByRole('slider', { name: 'Tempo' });
    expect(tempo.getAttribute('aria-readonly')).toBe('true');
    expect(tempo.getAttribute('aria-valuetext')).toBe('134');
    fireEvent.keyDown(tempo, { key: 'ArrowUp' });
    fireEvent.keyDown(tempo, { key: 'Enter' });
    expect(tempo.getAttribute('aria-valuenow')).toBe('133.6');
    expect(screen.queryByRole('textbox', { name: /Tempo/ })).toBeNull();
  });

  it('keeps an unplugged source on the list; offers no Clock before MIDI is on', () => {
    const { rerender } = render(
      <Module clockIn={fake({ inputs: [], source: { id: 'mpc', name: 'MPC' } })} />
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Clock' }));
    expect(screen.getByRole('option', { name: 'MPC (not connected)' })).toBeTruthy();
    rerender(<Module clockIn={fake({ status: 'off' })} />);
    expect(screen.queryByRole('combobox', { name: 'Clock' })).toBeNull();
  });
});
