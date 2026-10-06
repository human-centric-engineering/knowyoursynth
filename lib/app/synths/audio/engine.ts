import {
  createSynth,
  type Synth,
  type SynthEvent,
  type SynthMessage,
} from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams } from '@/lib/app/synths/contract';
import { createRack, type Rack } from '@/lib/app/synths/audio/fx';

// Transliterated from the prototype's `prototype/src/audio/engine.js` (D3). The one change: the prototype embedded the
// worklet as a string and loaded it from a Blob URL; here it is a static file Next serves, built by
// `scripts/build-audio-workers.ts`.

/** Where the bundled AudioWorklet is served from (built by `scripts/build-audio-workers.ts`). */
export const WORKLET_URL = '/worklets/kys-voice.js';

/** Some Safari versions only have the prefixed constructor. */
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/** How the voice is running: not yet, in an AudioWorklet, or on the main thread in a ScriptProcessor. */
export type EngineMode = 'off' | 'worklet' | 'script';

/**
 * Owns the AudioContext and the voice. Tries an AudioWorklet first (loaded from {@link WORKLET_URL});
 * if the host blocks that, falls back to a ScriptProcessor running the same DSP on the main thread.
 */
export class Engine {
  onEvent: (e: SynthEvent) => void;
  ctx: AudioContext | null;
  node: AudioWorkletNode | ScriptProcessorNode | null;
  local: Synth | null;
  analyser: AnalyserNode | null;
  lastParams: EngineParams | null;
  lastFx: unknown;
  rack: Rack | null;
  mode: EngineMode;
  starting: Promise<EngineMode> | null;

  constructor(onEvent: (e: SynthEvent) => void) {
    this.onEvent = onEvent;
    this.ctx = null;
    this.node = null;
    this.local = null;
    this.analyser = null;
    this.lastParams = null;
    this.lastFx = null;
    this.rack = null;
    this.mode = 'off';
    this.starting = null;
  }

  start(): Promise<EngineMode> {
    if (this.starting) return this.starting;
    this.starting = this.boot();
    return this.starting;
  }

  async boot(): Promise<EngineMode> {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser.');
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    // 4096 samples ≈ 85 ms at 48 kHz: enough for eight cycles of a low bass note in the big scope view.
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.6;

    let node: AudioWorkletNode | ScriptProcessorNode | null = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        await Promise.race([
          ctx.audioWorklet.addModule(WORKLET_URL),
          new Promise((_, rej) => setTimeout(() => rej(new Error('worklet timeout')), 3000)),
        ]);
        const wn = new AudioWorkletNode(ctx, 'kys-voice', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        wn.port.onmessage = (m: MessageEvent<SynthEvent>) => this.onEvent(m.data);
        node = wn;
        this.mode = 'worklet';
      } catch {
        node = null;
      }
    }
    if (!node) {
      const local = createSynth(ctx.sampleRate, (e) => this.onEvent(e));
      this.local = local;
      const sp = ctx.createScriptProcessor(1024, 0, 2);
      sp.onaudioprocess = (e) => {
        const l = e.outputBuffer.getChannelData(0);
        local.process(l, l.length, e.outputBuffer.getChannelData(1));
      };
      node = sp;
      this.mode = 'script';
    }
    this.node = node;
    // The scope reads the synth itself; the effects rack sits after it, before the speakers.
    this.rack = createRack(ctx);
    if (this.lastFx) this.rack.set(this.lastFx);
    node.connect(this.analyser);
    this.analyser.connect(this.rack.input);
    this.rack.output.connect(ctx.destination);
    if (this.lastParams) this.send({ type: 'params', p: this.lastParams });
    if (ctx.state !== 'running') await ctx.resume();
    return this.mode;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.node;
  }

  async suspend(): Promise<void> {
    this.send({ type: 'panic' });
    if (this.ctx) await this.ctx.suspend();
  }

  async resume(): Promise<EngineMode> {
    if (!this.ctx) return this.start();
    await this.ctx.resume();
    return this.mode;
  }

  /** The outboard rack's setting: anything stored or partial (see `normalizeFx`). */
  setFx(fx: unknown): void {
    this.lastFx = fx;
    if (this.rack) this.rack.set(fx);
  }

  send(msg: SynthMessage): void {
    if (msg.type === 'params') this.lastParams = msg.p;
    if (!this.node) return;
    if (this.local) this.local.handle(msg);
    else if ('port' in this.node) this.node.port.postMessage(msg);
  }
}
