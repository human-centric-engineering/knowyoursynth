// @vitest-environment happy-dom
/**
 * The page's one audio engine and its event fan-out.
 *
 * @see components/app/synth/engine.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SynthEvent } from '@/lib/app/synths/audio/dsp-core';

const made = vi.hoisted(() => ({
  callbacks: [] as Array<(e: unknown) => void>,
  engines: [] as Array<{ unlock: () => void }>,
}));

vi.mock('@/lib/app/synths/audio/engine', () => ({
  Engine: vi.fn(function (this: { unlock: () => void }, cb: (e: unknown) => void) {
    made.callbacks.push(cb);
    this.unlock = vi.fn();
    made.engines.push(this);
  }),
}));

// Reloaded each test: the module keeps the engine and the listener as module state.
async function load() {
  vi.resetModules();
  const mod = await import('@/components/app/synth/engine');
  const stores = await import('@/components/app/synth/stores');
  const { Engine } = await import('@/lib/app/synths/audio/engine');
  return { ...mod, ...stores, Engine };
}

const meter = (over: Record<string, unknown> = {}): SynthEvent =>
  ({ type: 'meter', gate: true, lfo: 0.5, overload: 0.1, ...over }) as unknown as SynthEvent;
const note = (n: number, on: boolean): SynthEvent =>
  ({ type: 'note', n, on }) as unknown as SynthEvent;

beforeEach(() => {
  made.callbacks.length = 0;
  made.engines.length = 0;
  vi.clearAllMocks();
});

describe('toStores', () => {
  it('writes a meter event into the meter store, defaulting the optional fields', async () => {
    const { toStores, meterStore } = await load();
    toStores(meter());
    expect(meterStore.get()).toMatchObject({
      gate: true,
      lfo: 0.5,
      overload: 0.1,
      voices: 0,
      env1: 0,
      env2: 0,
      seq: -1,
      pulser: 0,
      power: false,
    });
    // A stage the engine does not report stays unknown, not idle.
    expect(meterStore.get().env1Stage).toBeUndefined();
    // Nor is a cutoff the engine does not report: a live pointer then rests under its knob.
    expect(meterStore.get().cutoff).toBeUndefined();
  });

  it('keeps the optional meter fields when given, including envelope stages and a sequencer step of 0', async () => {
    const { toStores, meterStore } = await load();
    toStores(
      meter({
        voices: 3,
        env1: 0.7,
        env2: 0.4,
        env1Stage: 'decay',
        env2Stage: 'sustain',
        seq: 0,
        pulser: 0.2,
        cutoff: 880,
        amp: 0.6,
      })
    );
    expect(meterStore.get()).toMatchObject({
      voices: 3,
      env1: 0.7,
      env2: 0.4,
      env1Stage: 'decay',
      env2Stage: 'sustain',
      seq: 0,
      pulser: 0.2,
      cutoff: 880,
      amp: 0.6,
    });
  });

  it('adds a note on, once, and removes it on note off', async () => {
    const { toStores, notesStore } = await load();
    toStores(note(60, true));
    toStores(note(64, true));
    toStores(note(60, true));
    expect(notesStore.get()).toEqual([60, 64]);

    toStores(note(60, false));
    expect(notesStore.get()).toEqual([64]);
  });

  it('does not notify when a duplicate note on changes nothing', async () => {
    const { toStores, notesStore } = await load();
    toStores(note(60, true));
    const f = vi.fn();
    notesStore.subscribe(f);
    toStores(note(60, true));
    expect(f).not.toHaveBeenCalled();
  });

  it('clears every note on allOff', async () => {
    const { toStores, notesStore } = await load();
    toStores(note(60, true));
    toStores(note(62, true));
    toStores({ type: 'allOff' } as unknown as SynthEvent);
    expect(notesStore.get()).toEqual([]);
  });

  it('ignores other events', async () => {
    const { toStores, notesStore, meterStore } = await load();
    const m = meterStore.get();
    toStores({ type: 'something-else' } as unknown as SynthEvent);
    expect(meterStore.get()).toBe(m);
    expect(notesStore.get()).toEqual([]);
  });
});

describe('getEngine', () => {
  it('makes the engine lazily, once', async () => {
    const { getEngine, Engine } = await load();
    expect(Engine).not.toHaveBeenCalled();

    const a = getEngine();
    const b = getEngine();

    expect(a).toBe(b);
    expect(Engine).toHaveBeenCalledTimes(1);
  });

  it('fans the engine callback to the stores and the current listener', async () => {
    const { getEngine, listen, notesStore } = await load();
    const heard = vi.fn();
    listen(heard);
    getEngine();

    const e = note(67, true);
    made.callbacks[0](e);

    expect(notesStore.get()).toEqual([67]);
    expect(heard).toHaveBeenCalledWith(e);
  });

  it('unlocks the engine on every gesture, before the page handles it, from the moment it is made', async () => {
    const { getEngine, GESTURES } = await load();
    const btn = document.createElement('button');
    document.body.append(btn);
    // The page's own handler, which may start a note: the engine has been asked to run by then.
    let unlockedFirst = false;
    btn.addEventListener('pointerup', () => {
      const e = made.engines[0];
      unlockedFirst = !!e && vi.mocked(e.unlock).mock.calls.length === 1;
    });
    btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(made.engines).toHaveLength(0); // no engine yet: nothing listening

    getEngine();
    getEngine(); // once: a second call adds no listeners
    const unlock = vi.mocked(made.engines[0].unlock);
    btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlockedFirst).toBe(true);

    // The finger lifting is the touch gesture iOS counts; a click and a key press are the others.
    expect(GESTURES).toEqual(['pointerup', 'touchend', 'click', 'keydown']);
    GESTURES.forEach((type) => btn.dispatchEvent(new Event(type, { bubbles: true })));
    expect(unlock).toHaveBeenCalledTimes(1 + GESTURES.length);
    btn.remove();
  });

  it('still feeds the stores with no listener', async () => {
    const { getEngine, notesStore } = await load();
    getEngine();
    made.callbacks[0](note(50, true));
    expect(notesStore.get()).toEqual([50]);
  });
});

describe('listen', () => {
  it('replaces an older listener', async () => {
    const { getEngine, listen } = await load();
    const older = vi.fn();
    const newer = vi.fn();
    listen(older);
    listen(newer);
    getEngine();

    made.callbacks[0](note(60, true));

    expect(older).not.toHaveBeenCalled();
    expect(newer).toHaveBeenCalledTimes(1);
  });

  it('undo removes its own listener', async () => {
    const { getEngine, listen } = await load();
    const f = vi.fn();
    const off = listen(f);
    getEngine();
    off();
    made.callbacks[0](note(60, true));
    expect(f).not.toHaveBeenCalled();
  });

  it('undo of a replaced listener leaves the newer one in place', async () => {
    const { getEngine, listen } = await load();
    const older = vi.fn();
    const newer = vi.fn();
    const offOlder = listen(older);
    listen(newer);
    getEngine();

    offOlder();
    made.callbacks[0](note(60, true));

    expect(newer).toHaveBeenCalledTimes(1);
  });
});
