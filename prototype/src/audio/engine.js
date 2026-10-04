/* global __WORKLET_SRC__ */
import { createSynth } from '@/audio/dsp-core.js';
import { createRack } from '@/audio/fx.js';

/**
 * Owns the AudioContext and the voice. Tries an AudioWorklet first (loaded from a Blob URL);
 * if the host blocks that, falls back to a ScriptProcessor running the same DSP on the main thread.
 */
export class Engine {
  constructor(onEvent) {
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

  start() {
    if (this.starting) return this.starting;
    this.starting = this.boot();
    return this.starting;
  }

  async boot() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser.');
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    // 4096 samples ≈ 85 ms at 48 kHz: enough for eight cycles of a low bass note in the big scope view.
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.6;

    let node = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([__WORKLET_SRC__], { type: 'application/javascript' }));
        await Promise.race([
          ctx.audioWorklet.addModule(url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('worklet timeout')), 3000)),
        ]);
        node = new AudioWorkletNode(ctx, 'kys-voice', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.port.onmessage = (m) => this.onEvent(m.data);
        this.mode = 'worklet';
      } catch {
        node = null;
      }
    }
    if (!node) {
      this.local = createSynth(ctx.sampleRate, (e) => this.onEvent(e));
      node = ctx.createScriptProcessor(1024, 0, 2);
      node.onaudioprocess = (e) => {
        const l = e.outputBuffer.getChannelData(0);
        this.local.process(l, l.length, e.outputBuffer.getChannelData(1));
      };
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

  get running() {
    return !!this.ctx && this.ctx.state === 'running' && !!this.node;
  }

  async suspend() {
    this.send({ type: 'panic' });
    if (this.ctx) await this.ctx.suspend();
  }

  async resume() {
    if (!this.ctx) return this.start();
    await this.ctx.resume();
    return this.mode;
  }

  setFx(fx) {
    this.lastFx = fx;
    if (this.rack) this.rack.set(fx);
  }

  send(msg) {
    if (msg.type === 'params') this.lastParams = msg.p;
    if (!this.node) return;
    if (this.local) this.local.handle(msg);
    else this.node.port.postMessage(msg);
  }
}
