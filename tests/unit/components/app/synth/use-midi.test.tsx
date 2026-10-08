// @vitest-environment happy-dom

/**
 * Web MIDI input.
 *
 * @see components/app/synth/use-midi.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMidi } from '@/components/app/synth/use-midi';
import type { MidiHandlers } from '@/components/app/synth/use-midi';

interface FakeInput {
  name: string | null;
  state: string;
  onmidimessage: ((e: { data: number[] }) => void) | null;
}

function makeAccess(inputs: FakeInput[]) {
  return {
    inputs: { forEach: (f: (i: FakeInput) => void) => inputs.forEach(f) },
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
});
