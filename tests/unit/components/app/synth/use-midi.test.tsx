// @vitest-environment happy-dom

/**
 * Web MIDI input, and the outputs the same grant reaches (`f-midi-out` t-88).
 *
 * @see components/app/synth/use-midi.ts
 */

import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMidi } from '@/components/app/synth/use-midi';
import type { MidiHandlers } from '@/components/app/synth/use-midi';

interface FakeInput {
  id?: string;
  name: string | null;
  state: string;
  onmidimessage: ((e: { data: number[]; timeStamp?: number }) => void) | null;
}

interface FakeOutput {
  id: string;
  name: string | null;
  state: string;
  send: ReturnType<typeof vi.fn>;
}

function makeAccess(inputs: FakeInput[], outputs: FakeOutput[] = []) {
  return {
    inputs: { forEach: (f: (i: FakeInput) => void) => inputs.forEach(f) },
    outputs: {
      forEach: (f: (o: FakeOutput) => void) => outputs.forEach(f),
      get: (id: string) => outputs.find((o) => o.id === id),
    },
    onstatechange: null as (() => void) | null,
  };
}

type Spies = { [K in keyof MidiHandlers]: ReturnType<typeof vi.fn<MidiHandlers[K]>> };
const handlers = (over: Partial<MidiHandlers> = {}): Spies =>
  ({
    noteOn: vi.fn<MidiHandlers['noteOn']>(),
    noteOff: vi.fn<MidiHandlers['noteOff']>(),
    onWheel: vi.fn<MidiHandlers['onWheel']>(),
    remember: vi.fn<MidiHandlers['remember']>(),
    load: vi.fn<MidiHandlers['load']>(() => false),
    ...over,
  }) as Spies;

const setNav = (value: unknown) => {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value,
    configurable: true,
    writable: true,
  });
};

const send = (input: FakeInput, ...data: number[]) => input.onmidimessage?.({ data });

let input: FakeInput;
let access: ReturnType<typeof makeAccess>;

beforeEach(() => {
  input = { name: 'Keystation', state: 'connected', onmidimessage: null };
  access = makeAccess([input]);
  setNav(vi.fn().mockResolvedValue(access));
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'requestMIDIAccess');
  Reflect.deleteProperty(document, 'permissionsPolicy');
  vi.restoreAllMocks();
});

describe('useMidi', () => {
  it('starts off', () => {
    const { result } = renderHook(() => useMidi(handlers()));
    expect(result.current.status).toBe('off');
    expect(result.current.devices).toEqual([]);
  });

  it('is unsupported, and does not remember, when the browser has no Web MIDI', async () => {
    Reflect.deleteProperty(navigator, 'requestMIDIAccess');
    const h = handlers();
    const { result } = renderHook(() => useMidi(h));

    let ok = true;
    await act(async () => {
      ok = await result.current.connect();
    });

    expect(ok).toBe(false);
    expect(result.current.status).toBe('unsupported');
    expect(h.remember).not.toHaveBeenCalled();
  });

  it('connects: on, devices listed (skipping disconnected, naming the unnamed), and remembered', async () => {
    access = makeAccess([
      input,
      { name: null, state: 'connected', onmidimessage: null },
      { name: 'Gone', state: 'disconnected', onmidimessage: null },
    ]);
    setNav(vi.fn().mockResolvedValue(access));
    const h = handlers();
    const { result } = renderHook(() => useMidi(h));

    let ok = false;
    await act(async () => {
      ok = await result.current.connect();
    });

    expect(ok).toBe(true);
    expect(navigator.requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(result.current.status).toBe('on');
    expect(result.current.devices).toEqual(['Keystation', 'MIDI input']);
    expect(h.remember).toHaveBeenCalledWith(true);
  });

  it('refreshes the device list when the inputs change', async () => {
    const h = handlers();
    const { result } = renderHook(() => useMidi(h));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.devices).toEqual(['Keystation']);

    input.state = 'disconnected';
    act(() => access.onstatechange?.());

    expect(result.current.devices).toEqual([]);
  });

  describe('outputs', () => {
    let synth: FakeOutput;
    beforeEach(() => {
      synth = { id: 'out-1', name: 'TD-3', state: 'connected', send: vi.fn() };
      access = makeAccess(
        [input],
        [
          synth,
          { id: 'out-2', name: null, state: 'connected', send: vi.fn() },
          { id: 'out-3', name: 'Gone', state: 'disconnected', send: vi.fn() },
        ]
      );
      setNav(vi.fn().mockResolvedValue(access));
    });

    it('lists the connected outputs from the same grant, asking the browser once', async () => {
      const { result } = renderHook(() => useMidi(handlers()));
      await act(async () => {
        await result.current.connect();
      });
      expect(navigator.requestMIDIAccess).toHaveBeenCalledTimes(1);
      expect(result.current.outputs).toEqual([
        { id: 'out-1', name: 'TD-3' },
        { id: 'out-2', name: 'MIDI output' },
      ]);
      expect(result.current.output('out-1')).toBe(synth);
      expect(result.current.output('out-3')).toBeNull();
    });

    it('drops an output that is unplugged, and lists none once MIDI is stopped', async () => {
      const { result } = renderHook(() => useMidi(handlers()));
      await act(async () => {
        await result.current.connect();
      });
      synth.state = 'disconnected';
      act(() => access.onstatechange?.());
      expect(result.current.outputs.map((o) => o.id)).toEqual(['out-2']);
      expect(result.current.output('out-1')).toBeNull();
      act(() => result.current.disconnect());
      expect(result.current.outputs).toEqual([]);
    });

    it('keeps the same list when a change leaves the outputs as they were', async () => {
      const { result } = renderHook(() => useMidi(handlers()));
      await act(async () => {
        await result.current.connect();
      });
      const was = result.current.outputs;
      act(() => access.onstatechange?.());
      expect(result.current.outputs).toBe(was);
    });
  });

  describe('messages', () => {
    async function connected() {
      const h = handlers();
      const hook = renderHook(() => useMidi(h));
      await act(async () => {
        await hook.result.current.connect();
      });
      return h;
    }

    it('note on with velocity plays the note at velocity / 127', async () => {
      const h = await connected();
      send(input, 0x90, 60, 127);
      send(input, 0x93, 62, 64); // any channel
      expect(h.noteOn).toHaveBeenNthCalledWith(1, 60, 1);
      expect(h.noteOn).toHaveBeenNthCalledWith(2, 62, 64 / 127);
      expect(h.noteOff).not.toHaveBeenCalled();
    });

    it('note on with velocity 0 and note off both release the note', async () => {
      const h = await connected();
      send(input, 0x90, 60, 0);
      send(input, 0x80, 62, 40);
      expect(h.noteOff.mock.calls).toEqual([[60], [62]]);
      expect(h.noteOn).not.toHaveBeenCalled();
    });

    it('CC 1 moves the wheel; other controllers do not', async () => {
      const h = await connected();
      send(input, 0xb0, 1, 127);
      send(input, 0xb0, 7, 100);
      expect(h.onWheel).toHaveBeenCalledTimes(1);
      expect(h.onWheel).toHaveBeenCalledWith(1);
    });

    it('uses the latest handlers, not those from when it connected', async () => {
      const first = handlers();
      const second = handlers();
      const hook = renderHook((h: MidiHandlers) => useMidi(h), { initialProps: first });
      await act(async () => {
        await hook.result.current.connect();
      });
      hook.rerender(second);
      send(input, 0x90, 60, 100);
      expect(first.noteOn).not.toHaveBeenCalled();
      expect(second.noteOn).toHaveBeenCalledWith(60, 100 / 127);
    });
  });

  describe('releasing what the keyboard holds', () => {
    async function holding() {
      const h = handlers();
      const hook = renderHook(() => useMidi(h));
      await act(async () => {
        await hook.result.current.connect();
      });
      send(input, 0x90, 60, 100);
      send(input, 0x90, 64, 100);
      send(input, 0x80, 64, 0); // let go of one
      h.noteOff.mockClear();
      return { h, hook };
    }

    it('Stop MIDI releases the notes still held, whose key-ups will never arrive', async () => {
      const { h, hook } = await holding();
      act(() => hook.result.current.disconnect());
      expect(h.noteOff.mock.calls).toEqual([[60]]);
    });

    it('unmounting releases them too, and drops the device-change listener', async () => {
      const { h, hook } = await holding();
      expect(access.onstatechange).not.toBeNull();
      hook.unmount();
      expect(h.noteOff.mock.calls).toEqual([[60]]);
      expect(input.onmidimessage).toBeNull();
      // Left attached, the next plug-in would re-bind the unmounted page's handlers.
      expect(access.onstatechange).toBeNull();
    });
  });

  it('attaches nothing when the browser answers after the page has gone', async () => {
    let grant: (a: unknown) => void = () => undefined;
    setNav(vi.fn(() => new Promise((resolve) => (grant = resolve))));
    const h = handlers();
    const hook = renderHook(() => useMidi(h));
    let ok: Promise<boolean> = Promise.resolve(true);
    act(() => {
      ok = hook.result.current.connect();
    });
    hook.unmount();
    await act(async () => {
      grant(access);
      await ok;
    });
    await expect(ok).resolves.toBe(false);
    expect(input.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
    expect(h.remember).not.toHaveBeenCalledWith(true);
  });

  describe('requests that overlap', () => {
    /** Each grant is its own MIDIAccess with its own input objects, as in the browser. */
    function twoGrants() {
      const inputs = [0, 1].map((): FakeInput => ({
        name: 'Keystation',
        state: 'connected',
        onmidimessage: null,
      }));
      const grants = inputs.map((i) => makeAccess([i]));
      const answers: ((a: unknown) => void)[] = [];
      setNav(vi.fn(() => new Promise((resolve) => answers.push(resolve))));
      return { inputs, grants, answers };
    }

    it('binds only the latest, so Stop MIDI silences the keyboard', async () => {
      const { inputs, grants, answers } = twoGrants();
      const h = handlers();
      const { result } = renderHook(() => useMidi(h));
      let first: Promise<boolean> = Promise.resolve(true);
      let second: Promise<boolean> = Promise.resolve(true);
      act(() => {
        first = result.current.connect();
        second = result.current.connect();
      });
      // The older request answers last, as it can in the browser.
      await act(async () => {
        answers[1](grants[1]);
        await second;
        answers[0](grants[0]);
        await first;
      });
      await expect(first).resolves.toBe(false);
      expect(result.current.status).toBe('on');
      expect(inputs[0].onmidimessage).toBeNull();
      expect(grants[0].onstatechange).toBeNull();

      act(() => result.current.disconnect());
      inputs.forEach((i) => send(i, 0x90, 60, 100));
      expect(h.noteOn).not.toHaveBeenCalled();
    });

    it('detaches what was bound when a later request is refused, as blocked offers no Stop', async () => {
      const h = handlers();
      const { result } = renderHook(() => useMidi(h));
      await act(async () => {
        await result.current.connect();
      });
      expect(input.onmidimessage).not.toBeNull();
      setNav(vi.fn().mockRejectedValue(new Error('Permission denied')));
      await act(async () => {
        await result.current.connect();
      });
      expect(result.current.status).toBe('blocked');
      expect(result.current.devices).toEqual([]);
      send(input, 0x90, 60, 100);
      expect(h.noteOn).not.toHaveBeenCalled();
    });

    it('stays off when Stop MIDI comes while the browser is still asking', async () => {
      const { inputs, grants, answers } = twoGrants();
      const h = handlers();
      const { result } = renderHook(() => useMidi(h));
      let ok: Promise<boolean> = Promise.resolve(true);
      act(() => {
        ok = result.current.connect();
      });
      act(() => result.current.disconnect());
      await act(async () => {
        answers[0](grants[0]);
        await ok;
      });
      await expect(ok).resolves.toBe(false);
      expect(result.current.status).toBe('off');
      expect(inputs[0].onmidimessage).toBeNull();
      expect(h.remember).not.toHaveBeenCalledWith(true);
    });

    it('reconnecting under StrictMode’s double mount leaves one binding that Stop MIDI removes', async () => {
      const { inputs, grants, answers } = twoGrants();
      const h = handlers({ load: vi.fn(() => true) });
      const { result } = renderHook(() => useMidi(h), { wrapper: StrictMode });
      await act(async () => {
        answers.forEach((answer, i) => answer(grants[i]));
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.status).toBe('on'));

      act(() => result.current.disconnect());
      inputs.forEach((i) => send(i, 0x90, 60, 100));
      expect(h.noteOn).not.toHaveBeenCalled();
    });
  });

  it('is blocked on refusal, with the error, and forgets', async () => {
    setNav(vi.fn().mockRejectedValue(new Error('Permission denied')));
    const h = handlers();
    const { result } = renderHook(() => useMidi(h));

    let ok = true;
    await act(async () => {
      ok = await result.current.connect();
    });

    expect(ok).toBe(false);
    expect(result.current.status).toBe('blocked');
    expect(result.current.error).toBe('Permission denied');
    expect(h.remember).toHaveBeenCalledWith(false);
  });

  it('stringifies a refusal that is not an Error', async () => {
    setNav(vi.fn().mockRejectedValue('nope'));
    const { result } = renderHook(() => useMidi(handlers()));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toBe('nope');
  });

  it('disconnect: off, devices gone, forgotten and handlers detached', async () => {
    const h = handlers();
    const { result } = renderHook(() => useMidi(h));
    await act(async () => {
      await result.current.connect();
    });
    expect(input.onmidimessage).not.toBeNull();

    act(() => result.current.disconnect());

    expect(result.current.status).toBe('off');
    expect(result.current.devices).toEqual([]);
    expect(input.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
    expect(h.remember).toHaveBeenLastCalledWith(false);
  });

  it('detaches the input handlers on unmount', async () => {
    const { result, unmount } = renderHook(() => useMidi(handlers()));
    await act(async () => {
      await result.current.connect();
    });
    unmount();
    expect(input.onmidimessage).toBeNull();
  });

  it('reconnects on mount when it was remembered', async () => {
    const h = handlers({ load: vi.fn(() => true) });
    const { result } = renderHook(() => useMidi(h));
    await waitFor(() => expect(result.current.status).toBe('on'));
    expect(navigator.requestMIDIAccess).toHaveBeenCalledTimes(1);
    expect(result.current.devices).toEqual(['Keystation']);
  });

  it('does not ask on mount when it was not remembered', () => {
    renderHook(() => useMidi(handlers()));
    expect(navigator.requestMIDIAccess).not.toHaveBeenCalled();
  });

  describe('framed pages', () => {
    const policy = (allows: boolean) =>
      Object.defineProperty(document, 'permissionsPolicy', {
        value: { allowsFeature: vi.fn(() => allows) },
        configurable: true,
      });

    it('shows frame on mount when the permissions policy disallows midi, and never asks', () => {
      policy(false);
      const h = handlers({ load: vi.fn(() => true) });
      const { result } = renderHook(() => useMidi(h));
      expect(result.current.status).toBe('frame');
      expect(navigator.requestMIDIAccess).not.toHaveBeenCalled();
    });

    it('connect in a blocking frame says frame and forgets', async () => {
      policy(false);
      const h = handlers();
      const { result } = renderHook(() => useMidi(h));
      let ok = true;
      await act(async () => {
        ok = await result.current.connect();
      });
      expect(ok).toBe(false);
      expect(result.current.status).toBe('frame');
      expect(h.remember).toHaveBeenCalledWith(false);
    });

    it('is not framed when the policy allows midi', async () => {
      policy(true);
      const { result } = renderHook(() => useMidi(handlers()));
      expect(result.current.status).toBe('off');
    });

    it('treats a policy that throws as not framed', () => {
      Object.defineProperty(document, 'permissionsPolicy', {
        value: {
          allowsFeature: () => {
            throw new Error('x');
          },
        },
        configurable: true,
      });
      const { result } = renderHook(() => useMidi(handlers()));
      expect(result.current.status).toBe('off');
    });
  });

  describe('MIDI clock in (f-midi-hardware-lead t-91)', () => {
    it('lists the inputs with their ids, skipping disconnected ones', async () => {
      input.id = 'ks';
      const drums: FakeInput = { id: 'tr8', name: 'TR-8', state: 'connected', onmidimessage: null };
      const gone: FakeInput = { id: 'x', name: 'Gone', state: 'disconnected', onmidimessage: null };
      setNav(vi.fn().mockResolvedValue(makeAccess([input, drums, gone])));
      const { result } = renderHook(() => useMidi(handlers()));
      await act(async () => {
        await result.current.connect();
      });
      expect(result.current.inputs).toEqual([
        { id: 'ks', name: 'Keystation' },
        { id: 'tr8', name: 'TR-8' },
      ]);
    });

    it('hands clock, Start, Continue, Stop and Song Position to listeners, with when and where they came', async () => {
      input.id = 'ks';
      const drums: FakeInput = { id: 'tr8', name: 'TR-8', state: 'connected', onmidimessage: null };
      setNav(vi.fn().mockResolvedValue(makeAccess([input, drums])));
      const h = handlers();
      const { result } = renderHook(() => useMidi(h));
      await act(async () => {
        await result.current.connect();
      });
      const heard: [number[], number, string][] = [];
      const undo = result.current.listen((data, ms, from) => heard.push([[...data], ms, from]));
      drums.onmidimessage?.({ data: [0xfa], timeStamp: 10 });
      drums.onmidimessage?.({ data: [0xf8], timeStamp: 11 });
      input.onmidimessage?.({ data: [0xfb], timeStamp: 12 });
      drums.onmidimessage?.({ data: [0xf2, 4, 1], timeStamp: 13 });
      drums.onmidimessage?.({ data: [0xfc], timeStamp: 14 });
      // Active sensing and a sysex byte are not clock, and are no note either.
      drums.onmidimessage?.({ data: [0xfe], timeStamp: 15 });
      drums.onmidimessage?.({ data: [0xf0, 0x7e], timeStamp: 16 });
      // A note goes on working, on the same input, while it is listened to.
      drums.onmidimessage?.({ data: [0x99, 36, 127], timeStamp: 17 });
      expect(heard).toEqual([
        [[0xfa], 10, 'tr8'],
        [[0xf8], 11, 'tr8'],
        [[0xfb], 12, 'ks'],
        [[0xf2, 4, 1], 13, 'tr8'],
        [[0xfc], 14, 'tr8'],
      ]);
      expect(h.noteOn).toHaveBeenCalledTimes(1);
      expect(h.noteOn).toHaveBeenCalledWith(36, 1);
      undo();
      drums.onmidimessage?.({ data: [0xf8], timeStamp: 20 });
      expect(heard).toHaveLength(5);
    });
  });
});
