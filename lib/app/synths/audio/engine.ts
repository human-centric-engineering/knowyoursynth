import {
  createSynth,
  type Synth,
  type SynthEvent,
  type SynthMessage,
} from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams } from '@/lib/app/synths/contract';
import { createRack, type Rack } from '@/lib/app/synths/audio/fx';
import { logger } from '@/lib/logging';

// Transliterated from the prototype's `prototype/src/audio/engine.js` (D3). The one change: the prototype embedded the
// worklet as a string and loaded it from a Blob URL; here it is a static file Next serves, built by
// `scripts/build-audio-workers.ts`.

/** Where the bundled AudioWorklet is served from (built by `scripts/build-audio-workers.ts`). */
export const WORKLET_URL = '/worklets/kys-voice.js';

/**
 * How long the worklet may take to load before the engine falls back to a ScriptProcessor. The prototype allowed
 * 3 s for a Blob URL, which loads at once; a static file is a network fetch of ~80 KB, so a slow link needs longer.
 */
export const WORKLET_TIMEOUT_MS = 10_000;

/** Some Safari versions only have the prefixed constructor. */
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/** Safari's audio session (iOS 16.4+): not yet in TypeScript's DOM types. */
interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: string };
}

/**
 * Tell the browser this page plays music, where it can be told: without it iOS treats Web Audio as ambient sound and
 * the ring/silent switch mutes the synth. Elsewhere there is nothing to set.
 */
export function playbackSession(): void {
  if (typeof navigator === 'undefined') return;
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
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
  /** The riff tempo last sent: like the params, it is the engine's state, so it is replayed when the voice starts. */
  lastTempo: number | null;
  /** Notes and riff commands sent while the voice is starting, played in order once it is up. */
  pending: SynthMessage[];
  lastFx: unknown;
  rack: Rack | null;
  mode: EngineMode;
  starting: Promise<EngineMode> | null;
  /** Turned off with `suspend`: then a gesture is not to bring the sound back (see `unlock`). */
  muted: boolean;

  constructor(onEvent: (e: SynthEvent) => void) {
    this.onEvent = onEvent;
    this.ctx = null;
    this.node = null;
    this.local = null;
    this.analyser = null;
    this.lastParams = null;
    this.lastTempo = null;
    this.pending = [];
    this.lastFx = null;
    this.rack = null;
    this.mode = 'off';
    this.starting = null;
    this.muted = false;
  }

  start(): Promise<EngineMode> {
    this.muted = false;
    if (this.starting) return this.starting;
    // A failed start is forgotten, with what was queued for it: the next start (a retry) boots afresh, and nothing
    // queues behind a voice that will never come.
    this.starting = this.boot().catch((err: unknown) => {
      this.starting = null;
      this.pending = [];
      this.ctx = null;
      this.node = null;
      throw err;
    });
    return this.starting;
  }

  async boot(): Promise<EngineMode> {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser.');
    playbackSession();
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // Ask to run now, while the click that started us still counts as a user gesture: the worklet may take up to
    // WORKLET_TIMEOUT_MS to load, and a resume() first called after that can be refused. Awaited again at the end.
    // Promise.resolve: an old prefixed webkitAudioContext may return nothing from resume().
    if (ctx.state !== 'running') void Promise.resolve(ctx.resume()).catch(() => {});
    this.analyser = ctx.createAnalyser();
    // 4096 samples ≈ 85 ms at 48 kHz: enough for eight cycles of a low bass note in the big scope view.
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.6;

    let node: AudioWorkletNode | ScriptProcessorNode | null = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            ctx.audioWorklet.addModule(WORKLET_URL),
            new Promise((_, rej) => {
              timeout = setTimeout(() => rej(new Error('worklet timeout')), WORKLET_TIMEOUT_MS);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
        const wn = new AudioWorkletNode(ctx, 'kys-voice', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        wn.port.onmessage = (m: MessageEvent<SynthEvent>) => this.onEvent(m.data);
        node = wn;
        this.mode = 'worklet';
      } catch (err) {
        // A host that blocks worklets lands here, and so does a missing bundle (`public/worklets/` is built by the
        // predev/prebuild hooks): say which, since the fallback works either way and would otherwise hide it.
        logger.warn('Synth worklet unavailable; using the main-thread fallback', {
          url: WORKLET_URL,
          error: err instanceof Error ? err.message : String(err),
        });
        node = null;
      }
    }
    if (!node) {
      // A pattern's `loop` event counts frames from the synth's first sample; moved onto the context's clock here,
      // as the worklet does from `currentFrame`. Worked out again for every buffer from when it plays: a buffer the
      // browser skips (a long task on the main thread) moves the context's clock on but not the synth's count.
      let offset = 0;
      let played = 0;
      const local = createSynth(ctx.sampleRate, (e) =>
        this.onEvent(e.type === 'loop' ? { ...e, frame: e.frame + offset } : e)
      );
      this.local = local;
      const sp = ctx.createScriptProcessor(1024, 0, 2);
      sp.onaudioprocess = (e) => {
        if (e.playbackTime) offset = Math.round(e.playbackTime * ctx.sampleRate) - played;
        const l = e.outputBuffer.getChannelData(0);
        local.process(l, l.length, e.outputBuffer.getChannelData(1));
        played += l.length;
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
    if (this.lastTempo) this.send({ type: 'tempo', bpm: this.lastTempo });
    // What was played while the voice loaded (the first key press is what starts it): played now, in order.
    const pending = this.pending;
    this.pending = [];
    pending.forEach((m) => this.send(m));
    // Not if the sound was turned off while the voice loaded: that stays off.
    if (ctx.state !== 'running' && !this.muted) await ctx.resume();
    return this.mode;
  }

  /**
   * The frame the listener hears now, on the clock a pattern's `loop` events use: with `createPlayhead` it places the
   * sequencer's playhead. 0 before the voice exists. The delay is the context's own (`baseLatency`) and the output
   * device's after it (`outputLatency`); either may be missing.
   */
  get frame(): number {
    if (!this.ctx) return 0;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return Math.max(0, (this.ctx.currentTime - latency) * this.ctx.sampleRate);
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.node;
  }

  async suspend(): Promise<void> {
    this.muted = true;
    this.send({ type: 'panic' });
    if (this.ctx) await this.ctx.suspend();
  }

  /** Running again after `suspend`. Before the voice exists, this is `start` (and waits for a start under way). */
  async resume(): Promise<EngineMode> {
    this.muted = false;
    if (!this.ctx) return this.start();
    // Before any await, so it is still inside the gesture: also while a start is under way, whose own resume() iOS
    // may have refused (a touch's pointerdown is not a gesture there; its pointerup is).
    const resumed = this.ctx.state === 'running' ? null : Promise.resolve(this.ctx.resume());
    if (!this.node) {
      void resumed?.catch(() => {});
      return this.start();
    }
    await resumed;
    return this.mode;
  }

  /**
   * Called from any gesture on the page, synchronously in its handler. The context is running again if something
   * other than the user stopped it: iOS leaves it `interrupted` after a call or Siri, and `suspended` when a tab comes
   * back or when the first tap's resume() was refused. Nothing to do before a start, or when the sound was turned off.
   */
  unlock(): void {
    const ctx = this.ctx;
    // Nor is the audio session claimed for a page that never played, or whose sound is off: on iOS it stops other music.
    if (!ctx || this.muted) return;
    playbackSession();
    // `interrupted` is Safari's own state, outside the standard AudioContextState.
    const state: string = ctx.state;
    if (state === 'suspended' || state === 'interrupted')
      void Promise.resolve(ctx.resume()).catch(() => {});
  }

  /** The outboard rack's setting: anything stored or partial (see `normalizeFx`). */
  setFx(fx: unknown): void {
    this.lastFx = fx;
    if (this.rack) this.rack.set(fx);
  }

  send(msg: SynthMessage): void {
    if (msg.type === 'params') this.lastParams = msg.p;
    if (msg.type === 'tempo') this.lastTempo = msg.bpm;
    if (!this.node) {
      // While starting, keep what was played. Params and tempo are replayed from `last*` anyway; with no start under
      // way, a note has nothing to play on and is dropped, as before.
      if (this.starting && msg.type !== 'params' && msg.type !== 'tempo') this.pending.push(msg);
      return;
    }
    if (this.local) this.local.handle(msg);
    else if ('port' in this.node) this.node.port.postMessage(msg);
  }
}
