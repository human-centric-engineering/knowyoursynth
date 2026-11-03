// @vitest-environment happy-dom

/**
 * MIDI out from the sequencer (`f-midi-out` t-88): outputs from the page's one MIDI grant, the choice kept in this
 * browser, the pattern's notes sent to the chosen output on its channel, and everything let go on Stop, at the end, on
 * a change of output, when the output is unplugged, when the page is hidden and when it goes. Then the readout row:
 * what it says in a browser without MIDI, before MIDI is connected, and once it is. And MIDI clock (t-89): off until
 * it is turned on, for that output alone.
 *
 * `useMidi` and the scheduler are real; `navigator.requestMIDIAccess` is a fake with two outputs that record what they
 * are sent. With no engine, the clock takes every frame as heard now, so a note on beat 0 goes at once.
 *
 * @see components/app/sequencer/use-midi-out.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useMidi, type MidiHandlers } from '@/components/app/synth/use-midi';
import { useMidiOut, type MidiOut } from '@/components/app/sequencer/use-midi-out';
import { useSequencer } from '@/components/app/sequencer/use-sequencer';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { STORAGE_KEYS } from '@/components/app/synth/storage';
import type { LoopEvent } from '@/lib/app/synths/audio/pattern-player';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import type { SynthDef } from '@/lib/app/synths/contract';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

interface FakeOutput {
  id: string;
  name: string;
  state: string;
  send: ReturnType<typeof vi.fn<(data: number[], at?: number) => void>>;
}

let td3: FakeOutput;
let sh101: FakeOutput;
let access: {
  inputs: { forEach: (f: (i: never) => void) => void };
  outputs: {
    forEach: (f: (o: FakeOutput) => void) => void;
    get: (id: string) => FakeOutput | undefined;
  };
  onstatechange: (() => void) | null;
};
let request: ReturnType<typeof vi.fn>;

const handlers = (): MidiHandlers => ({
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  onWheel: vi.fn(),
  remember: vi.fn(),
  load: () => false,
});

beforeEach(() => {
  localStorage.clear();
  td3 = { id: 'td3', name: 'TD-3', state: 'connected', send: vi.fn() };
  sh101 = { id: 'sh101', name: 'SH-101', state: 'connected', send: vi.fn() };
  const outs = [td3, sh101];
  access = {
    inputs: { forEach: () => undefined },
    outputs: {
      forEach: (f) => outs.forEach(f),
      get: (id) => outs.find((o) => o.id === id),
    },
    onstatechange: null,
  };
  request = vi.fn().mockResolvedValue(access);
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: request,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'requestMIDIAccess');
  vi.restoreAllMocks();
});

/** The page's MIDI and its MIDI out, connected. */
async function connected() {
  const hook = renderHook(() => {
    const midi = useMidi(handlers());
    const out = useMidiOut({ midi, engine: null, connect: () => void midi.connect() });
    return { midi, out };
  });
  await act(async () => {
    await hook.result.current.midi.connect();
  });
  return hook;
}

const pattern: SynthMessage = {
  type: 'pattern',
  loop: { notes: [[0, 60, 4]], beats: 4 },
  bpm: 120,
  run: 1,
};
const loopStart: LoopEvent = {
  type: 'loop',
  index: 0,
  start: true,
  beat: 0,
  beats: 4,
  bpm: 120,
  frame: 0,
  run: 1,
};

/** The chosen output playing a pattern whose note 60 is held. */
async function playing(channel = 1) {
  const hook = await connected();
  act(() => hook.result.current.out.setOutput('td3'));
  if (channel !== 1) act(() => hook.result.current.out.setChannel(channel));
  act(() => {
    hook.result.current.out.out.message(pattern);
    hook.result.current.out.out.event(loopStart);
  });
  return hook;
}

const data = (o: FakeOutput) => o.send.mock.calls.map(([d]) => d);
const NOTE_OFF_60 = [0x80, 60, 0];
const ALL_NOTES_OFF = [0xb0, 123, 0];

describe('the outputs', () => {
  it('lists the outputs of the page’s MIDI grant, which the browser is asked for once', async () => {
    const { result } = await connected();
    expect(result.current.out.outputs).toEqual([
      { id: 'td3', name: 'TD-3' },
      { id: 'sh101', name: 'SH-101' },
    ]);
    act(() => result.current.out.setOutput('td3'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('plays on a chosen output alone by default, and keeps the choice in this browser', async () => {
    const { result } = await connected();
    expect(result.current.out.out.muted).toBe(false);
    act(() => result.current.out.setOutput('td3'));
    expect(result.current.out.choice).toEqual({
      output: { id: 'td3', name: 'TD-3' },
      channel: 1,
      plays: 'midi',
    });
    expect(result.current.out.sending).toBe(true);
    expect(result.current.out.out.muted).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.midiOut) ?? 'null')).toMatchObject({
      output: { id: 'td3' },
    });
  });

  it('with the synth alongside, sends to the output without muting the synth; synth only sends nothing', async () => {
    const { result } = await connected();
    act(() => result.current.out.setOutput('td3'));
    act(() => result.current.out.setPlays('both'));
    expect(result.current.out.out.muted).toBe(false);
    expect(result.current.out.sending).toBe(true);
    act(() => result.current.out.setPlays('synth'));
    expect(result.current.out.sending).toBe(false);
    act(() => {
      result.current.out.out.message(pattern);
      result.current.out.out.event(loopStart);
    });
    expect(td3.send).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('sends the pattern’s notes to the chosen output on the chosen channel', async () => {
    await playing(10);
    expect(data(td3)).toEqual([[0x99, 60, 108]]);
    expect(sh101.send).not.toHaveBeenCalled();
  });

  it('lets go of everything on Stop, then All Notes Off', async () => {
    const { result } = await playing();
    act(() => result.current.out.out.message({ type: 'stopPattern' }));
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
  });

  it('lets go at the pattern’s end, or a panic’s', async () => {
    const { result } = await playing();
    act(() => result.current.out.out.event({ type: 'patternEnd', run: 1 }));
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
  });

  it('lets go on the old output when another is chosen, and plays on from there', async () => {
    const { result } = await playing();
    act(() => result.current.out.setOutput('sh101'));
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
    expect(result.current.out.choice.output?.id).toBe('sh101');
  });

  it('lets go when the channel changes', async () => {
    const { result } = await playing();
    act(() => result.current.out.setChannel(2));
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
  });

  it('stops sending to an output that is unplugged, letting go first, and unmutes the synth', async () => {
    const { result } = await playing();
    td3.state = 'disconnected';
    act(() => access.onstatechange?.());
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
    expect(result.current.out.connected).toBe(false);
    expect(result.current.out.out.muted).toBe(false);
    // Still chosen: plugged back in, it is sent to again.
    expect(result.current.out.choice.output?.id).toBe('td3');
    td3.state = 'connected';
    act(() => access.onstatechange?.());
    expect(result.current.out.sending).toBe(true);
  });

  it('lets go when the page is hidden', async () => {
    await playing();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
  });

  it('plays on after the page is shown again from the back-forward cache, the run kept', async () => {
    const { result } = await playing();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    td3.send.mockClear();
    // The player plays on: its next loop starts, and MIDI out sends its notes.
    act(() => result.current.out.out.event({ ...loopStart, index: 1, frame: 2000 }));
    expect(data(td3)).toContainEqual([0x90, 60, 108]);
  });

  it('refills on a muted player’s tick, which a silent tab’s slowed timers would not', async () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(0);
    const { result } = await playing();
    td3.send.mockClear();
    // Two seconds on (a loop of 4 beats at 120 BPM): no timer has fired, a tick arrives.
    now.mockReturnValue(1990);
    act(() => result.current.out.out.event({ type: 'patternTick', run: 1 }));
    expect(data(td3)).toEqual([NOTE_OFF_60, [0x90, 60, 108]]);
  });

  it('lets go when the page goes', async () => {
    const { unmount } = await playing();
    unmount();
    expect(data(td3).slice(1)).toEqual([NOTE_OFF_60, ALL_NOTES_OFF]);
  });
});

describe('MIDI clock', () => {
  const realtime = (o: FakeOutput) => data(o).filter((d) => d[0] >= 0xf8);

  it('is not sent until it is turned on', async () => {
    const { result } = await playing();
    expect(result.current.out.clock).toBe(false);
    act(() => result.current.out.out.message({ type: 'stopPattern' }));
    expect(realtime(td3)).toEqual([]);
  });

  it('sends Start and pulses once on, and Stop on Stop, kept with the output it is on for', async () => {
    const { result } = await connected();
    act(() => result.current.out.setOutput('td3'));
    act(() => result.current.out.setClock(true));
    expect(result.current.out.clock).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.midiOut) ?? 'null')).toMatchObject({
      clock: ['td3'],
    });
    act(() => {
      result.current.out.out.message(pattern);
      result.current.out.out.event(loopStart);
    });
    expect(realtime(td3).slice(0, 2)).toEqual([[0xfa], [0xf8]]);
    act(() => result.current.out.out.message({ type: 'stopPattern' }));
    expect(realtime(td3).at(-1)).toEqual([0xfc]);
    // Another output has it off until it is turned on there; back on the first, it is on again.
    act(() => result.current.out.setOutput('sh101'));
    expect(result.current.out.clock).toBe(false);
    act(() => result.current.out.setOutput('td3'));
    expect(result.current.out.clock).toBe(true);
    act(() => result.current.out.setClock(false));
    expect(result.current.out.clock).toBe(false);
    expect(result.current.out.choice.clock).toEqual([]);
  });

  it('reads a choice kept before there was a clock', async () => {
    localStorage.setItem(
      STORAGE_KEYS.midiOut,
      JSON.stringify({ output: { id: 'td3', name: 'TD-3' }, channel: 3, plays: 'both' })
    );
    const { result } = await connected();
    expect(result.current.out.choice.channel).toBe(3);
    expect(result.current.out.clock).toBe(false);
  });

  it('keeps the rest of a choice whose clock list it cannot read', async () => {
    localStorage.setItem(
      STORAGE_KEYS.midiOut,
      JSON.stringify({
        output: { id: 'td3', name: 'TD-3' },
        channel: 3,
        plays: 'both',
        clock: ['x'.repeat(300)],
      })
    );
    const { result } = await connected();
    expect(result.current.out.choice.output?.id).toBe('td3');
    expect(result.current.out.choice.channel).toBe(3);
    expect(result.current.out.clock).toBe(false);
  });
});

describe('the readout row', () => {
  const engine = { send: vi.fn(), frame: 0, ctx: { sampleRate: 48000 } };
  function Row({ midiOut }: { midiOut: MidiOut }) {
    const seq = useSequencer({ engine, ensureAudio: async () => true, riff: null });
    return (
      <Sequencer
        seq={seq}
        playing={false}
        onPlay={() => undefined}
        onStop={() => undefined}
        midiOut={midiOut}
      />
    );
  }
  const fake = (over: Partial<MidiOut>): MidiOut => ({
    status: 'off',
    connect: vi.fn(),
    outputs: [],
    choice: { output: null, channel: 1, plays: 'midi' },
    connected: false,
    sending: false,
    clock: false,
    ccs: {},
    setOutput: vi.fn(),
    setChannel: vi.fn(),
    setPlays: vi.fn(),
    setClock: vi.fn(),
    setCc: vi.fn(),
    out: { muted: false, message: vi.fn(), event: vi.fn() },
    ...over,
  });
  const row = () => screen.getByRole('group', { name: 'MIDI out' });

  it('says so in a browser without MIDI, where the output would be, and offers nothing to press', () => {
    render(<Row midiOut={fake({ status: 'unsupported' })} />);
    expect(row().textContent).toMatch(/can’t send MIDI.*Safari can’t/);
    expect(screen.queryByRole('combobox', { name: 'MIDI out' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect MIDI' })).toBeNull();
  });

  it('offers to connect before MIDI is on', () => {
    const m = fake({});
    render(<Row midiOut={m} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI' }));
    expect(m.connect).toHaveBeenCalledTimes(1);
  });

  it('chooses an output, and then its channel and where it plays', () => {
    const outputs = [{ id: 'td3', name: 'TD-3' }];
    const m = fake({ status: 'on', outputs });
    const { rerender } = render(<Row midiOut={m} />);
    expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: 'MIDI out' }));
    fireEvent.click(screen.getByRole('option', { name: 'TD-3' }));
    expect(m.setOutput).toHaveBeenCalledWith('td3');
    const chosen = fake({
      status: 'on',
      outputs,
      connected: true,
      sending: true,
      choice: { output: outputs[0], channel: 1, plays: 'midi' },
    });
    rerender(<Row midiOut={chosen} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Channel' }));
    fireEvent.click(screen.getByRole('option', { name: '10' }));
    expect(chosen.setChannel).toHaveBeenCalledWith(10);
    fireEvent.click(screen.getByRole('combobox', { name: 'Plays on' }));
    fireEvent.click(screen.getByRole('option', { name: 'MIDI + synth' }));
    expect(chosen.setPlays).toHaveBeenCalledWith('both');
    const send = screen.getByRole('button', { name: 'Send clock' });
    expect(send.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(send);
    expect(chosen.setClock).toHaveBeenCalledWith(true);
    // Synth only sends the output nothing, so there is no clock to turn on.
    rerender(
      <Row midiOut={{ ...chosen, choice: { output: outputs[0], channel: 1, plays: 'synth' } }} />
    );
    expect(screen.queryByRole('button', { name: 'Send clock' })).toBeNull();
  });

  it('keeps a chosen output that is unplugged on the list, and says the synth plays meanwhile', () => {
    render(
      <Row
        midiOut={fake({
          status: 'on',
          choice: { output: { id: 'td3', name: 'TD-3' }, channel: 1, plays: 'midi' },
        })}
      />
    );
    expect(row().textContent).toContain(
      'TD-3 is not connected: the synth plays the pattern until it is.'
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'MIDI out' }));
    expect(screen.getByRole('option', { name: 'TD-3 (not connected)' })).toBeTruthy();
  });
});

describe('lane CCs (t-90)', () => {
  const knob = { x: 0, y: 0, module: 'filter', help: '', type: 'knob', r: 10, kind: 'cont' };
  const synth = (id: string) =>
    ({
      id,
      controls: [
        { ...knob, id: 'cutoff', min: 0, max: 100, def: 50 },
        { ...knob, id: 'res', min: 0, max: 10, def: 0 },
      ],
      init: { cutoff: 50, res: 0 },
    }) as unknown as SynthDef;

  async function withSynth(def: SynthDef) {
    const hook = renderHook(
      ({ d }: { d: SynthDef }) => {
        const midi = useMidi(handlers());
        const out = useMidiOut({ midi, engine: null, connect: () => void midi.connect(), def: d });
        return { midi, out };
      },
      { initialProps: { d: def } }
    );
    await act(async () => {
      await hook.result.current.midi.connect();
    });
    return hook;
  }

  it('keeps a lane’s CC for this synth, in this browser, and another synth has its own', async () => {
    const hook = await withSynth(synth('sh101'));
    act(() => hook.result.current.out.setCc('cutoff', 74));
    expect(hook.result.current.out.ccs).toEqual({ cutoff: 74 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.midiCc) ?? 'null')).toEqual({
      sh101: { cutoff: 74 },
    });
    hook.rerender({ d: synth('td3') });
    expect(hook.result.current.out.ccs).toEqual({});
    act(() => hook.result.current.out.setCc('cutoff', 20));
    hook.rerender({ d: synth('sh101') });
    expect(hook.result.current.out.ccs).toEqual({ cutoff: 74 });
  });

  it('gives a CC to one lane at a time, takes one away, and refuses a channel-mode CC', async () => {
    const { result } = await withSynth(synth('sh101'));
    act(() => result.current.out.setCc('cutoff', 74));
    act(() => result.current.out.setCc('res', 74));
    expect(result.current.out.ccs).toEqual({ res: 74 });
    act(() => result.current.out.setCc('res', 123));
    expect(result.current.out.ccs).toEqual({ res: 74 });
    act(() => result.current.out.setCc('res', null));
    expect(result.current.out.ccs).toEqual({});
  });

  it('reads a stored map that doesn’t check as none for that synth', async () => {
    localStorage.setItem(
      STORAGE_KEYS.midiCc,
      JSON.stringify({ sh101: { cutoff: 500 }, td3: { res: 71 } })
    );
    const hook = await withSynth(synth('sh101'));
    expect(hook.result.current.out.ccs).toEqual({});
    hook.rerender({ d: synth('td3') });
    expect(hook.result.current.out.ccs).toEqual({ res: 71 });
  });

  it('sends a lane with a CC to the output on its channel, ahead of the note it shares a beat with', async () => {
    const { result } = await withSynth(synth('sh101'));
    act(() => result.current.out.setOutput('td3'));
    act(() => result.current.out.setChannel(2));
    act(() => result.current.out.setCc('cutoff', 74));
    act(() => {
      result.current.out.out.message({
        type: 'pattern',
        loop: { notes: [[0, 60, 4]], beats: 4, mods: [[0, { cutoff: 100, res: 5 }]] },
        bpm: 120,
        run: 1,
      });
      result.current.out.out.event(loopStart);
    });
    // res has no CC, so it sends nothing.
    expect(data(td3)).toEqual([
      [0xb1, 74, 127],
      [0x91, 60, 108],
    ]);
  });
});
