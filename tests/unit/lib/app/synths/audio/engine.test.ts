/**
 * Engine shell tests: the AudioContext wiring, the worklet load (from the static file, with its timeout), and the two
 * fallbacks — a ScriptProcessor running the same DSP on the main thread, and an error when there is no Web Audio.
 * Run against a stand-in audio graph; the node test environment has no Web Audio.
 *
 * @see lib/app/synths/audio/engine.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import type { SynthEvent } from '@/lib/app/synths/audio/dsp-core';
import { Engine, WORKLET_TIMEOUT_MS, WORKLET_URL } from '@/lib/app/synths/audio/engine';
import { logger } from '@/lib/logging';
import { FakeContext, FakeNode } from '@/tests/unit/lib/app/synths/audio/fake-audio';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

class FakePort {
  sent: unknown[] = [];
  onmessage: ((m: { data: SynthEvent }) => void) | null = null;
  postMessage(m: unknown): void {
    this.sent.push(m);
  }
}

class FakeWorkletNode extends FakeNode {
  static made: FakeWorkletNode[] = [];
  port = new FakePort();
  constructor(
    public ctx: unknown,
    public name: string,
    public opts: unknown
  ) {
    super();
    FakeWorkletNode.made.push(this);
  }
}

class FakeScriptNode extends FakeNode {
  onaudioprocess:
    ((e: { outputBuffer: { getChannelData: (c: number) => Float32Array } }) => void) | null = null;
}

type Load = 'ok' | 'fail' | 'hang' | 'none';

function contextClass(load: Load) {
  return class Ctx extends FakeContext {
    static last: Ctx | null = null;
    state = 'suspended';
    loaded: string[] = [];
    script: FakeScriptNode | null = null;
    audioWorklet =
      load === 'none'
        ? undefined
        : {
            addModule: (url: string): Promise<void> => {
              this.loaded.push(url);
              if (load === 'ok') return Promise.resolve();
              if (load === 'fail') return Promise.reject(new Error('blocked'));
              return new Promise(() => {});
            },
          };
    constructor(public opts: unknown) {
      super();
      Ctx.last = this;
    }
    createScriptProcessor(): FakeScriptNode {
      this.script = new FakeScriptNode();
      return this.script;
    }
    resume(): Promise<void> {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend(): Promise<void> {
      this.state = 'suspended';
      return Promise.resolve();
    }
  };
}

function setup(load: Load, prefixed = false) {
  const Ctx = contextClass(load);
  vi.stubGlobal('window', prefixed ? { webkitAudioContext: Ctx } : { AudioContext: Ctx });
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  FakeWorkletNode.made = [];
  const events: SynthEvent[] = [];
  const engine = new Engine((e) => events.push(e));
  return { Ctx, engine, events };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Engine', () => {
  it('loads the voice as an AudioWorklet from the static file and wires voice → scope → rack → speakers', async () => {
    const { Ctx, engine, events } = setup('ok');
    engine.send({ type: 'params', p: monoParams() });
    engine.setFx({ on: true });
    expect(engine.running).toBe(false);
    const started = engine.start();
    expect(engine.start()).toBe(started);
    await expect(started).resolves.toBe('worklet');
    const ctx = Ctx.last!;
    expect(ctx.loaded).toEqual([WORKLET_URL]);
    expect(WORKLET_URL).toBe('/worklets/kys-voice.js');
    const node = FakeWorkletNode.made[0];
    expect(node.name).toBe('kys-voice');
    expect(node.opts).toEqual({ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    expect(node.outputs).toContain(engine.analyser);
    expect(engine.analyser!.fftSize).toBe(4096);
    // the params sent before the start reached the worklet once it was up
    expect(node.port.sent).toEqual([{ type: 'params', p: monoParams() }]);
    expect(engine.running).toBe(true);
    // events from the worklet reach the page
    node.port.onmessage!({ data: { type: 'allOff' } });
    expect(events).toEqual([{ type: 'allOff' }]);
    engine.send({ type: 'noteOn', n: 60 });
    expect(node.port.sent.at(-1)).toEqual({ type: 'noteOn', n: 60 });
  });

  it('falls back to a ScriptProcessor running the same DSP when the worklet will not load', async () => {
    const { Ctx, engine } = setup('fail');
    await expect(engine.start()).resolves.toBe('script');
    const sp = Ctx.last!.script!;
    engine.send({ type: 'params', p: monoParams() });
    engine.send({ type: 'noteOn', n: 60 });
    const l = new Float32Array(1024),
      r = new Float32Array(1024);
    sp.onaudioprocess!({ outputBuffer: { getChannelData: (c) => (c ? r : l) } });
    expect(l.some((x) => x !== 0)).toBe(true);
    expect(Array.from(r)).toEqual(Array.from(l));
  });

  it('asks the context to run while the click still counts, before the worklet has loaded', async () => {
    vi.useFakeTimers(); // the hanging load's timeout must not outlive the test
    const { Ctx, engine } = setup('hang');
    void engine.start();
    // addModule never settles here, so the only resume() that can have run is the early one.
    await Promise.resolve();
    expect(Ctx.last!.state).toBe('running');
  });

  it('clears the load timeout once the worklet has loaded', async () => {
    vi.useFakeTimers();
    const { engine } = setup('ok');
    await engine.start();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits out a slow worklet fetch, then gives up and says why', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { engine } = setup('hang');
    let settled = false;
    const started = engine.start().finally(() => (settled = true));
    // The prototype's 3 s, sized for a Blob URL, is no longer enough for a network fetch.
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(WORKLET_TIMEOUT_MS - 3000);
    await expect(started).resolves.toBe('script');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('worklet unavailable'),
      expect.objectContaining({ url: WORKLET_URL, error: 'worklet timeout' })
    );
  });

  it('uses the ScriptProcessor straight away where there is no AudioWorklet, and the prefixed constructor', async () => {
    const { engine } = setup('none', true);
    await expect(engine.start()).resolves.toBe('script');
    expect(engine.mode).toBe('script');
  });

  it('refuses to start without Web Audio', async () => {
    vi.stubGlobal('window', {});
    const engine = new Engine(() => {});
    await expect(engine.start()).rejects.toThrow('Web Audio is not available');
  });

  it('suspends with a panic and resumes, starting first if it never started', async () => {
    const { Ctx, engine } = setup('ok');
    await expect(engine.resume()).resolves.toBe('worklet');
    const node = FakeWorkletNode.made[0];
    await engine.suspend();
    expect(node.port.sent.at(-1)).toEqual({ type: 'panic' });
    expect(Ctx.last!.state).toBe('suspended');
    expect(engine.running).toBe(false);
    await expect(engine.resume()).resolves.toBe('worklet');
    expect(engine.running).toBe(true);
    engine.setFx({ on: false });
    expect(engine.lastFx).toEqual({ on: false });
  });

  it('remembers params and drops other messages until it starts', async () => {
    const { engine } = setup('ok');
    await engine.suspend();
    engine.send({ type: 'noteOn', n: 60 });
    expect(engine.lastParams).toBeNull();
    expect(engine.pending).toEqual([]);
  });

  it('plays what was sent while the voice loaded, in order, once it is up', async () => {
    // The first key press is what starts the audio, so its note arrives before the worklet has loaded.
    const { engine } = setup('ok');
    const starting = engine.start();
    engine.send({ type: 'noteOn', n: 60, v: 0.85 });
    engine.send({ type: 'noteOff', n: 60 });
    engine.send({ type: 'phrase', phrase: null });
    await starting;

    const sent = FakeWorkletNode.made[0].port.sent;
    expect(sent.slice(-3)).toEqual([
      { type: 'noteOn', n: 60, v: 0.85 },
      { type: 'noteOff', n: 60 },
      { type: 'phrase', phrase: null },
    ]);
    expect(engine.pending).toEqual([]);
  });

  it('replays the last tempo when it starts, like the params', async () => {
    const { engine } = setup('ok');
    engine.send({ type: 'tempo', bpm: 120 }); // before any start: nothing to play it on
    engine.send({ type: 'tempo', bpm: 132 });
    await engine.start();
    const sent = FakeWorkletNode.made[0].port.sent;
    expect(sent.filter((m) => (m as { type: string }).type === 'tempo')).toEqual([
      { type: 'tempo', bpm: 132 },
    ]);
  });

  it('waits for a start under way when asked to resume, rather than reporting the sound on early', async () => {
    const { engine } = setup('hang');
    vi.useFakeTimers();
    const starting = engine.start();
    let resumed = false;
    const resume = engine.resume().then(() => {
      resumed = true;
    });
    await vi.advanceTimersByTimeAsync(WORKLET_TIMEOUT_MS - 1);
    expect(resumed).toBe(false); // the worklet is still loading: the context exists, the voice does not
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([starting, resume]);
    expect(resumed).toBe(true);
    expect(engine.running).toBe(true);
  });
});
