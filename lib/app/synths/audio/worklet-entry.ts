// The AudioWorklet side of the engine: one synth, fed by the port, rendering into the node's output.
//
// Transliterated from the prototype's `prototype/src/audio/worklet-entry.js` (D3). Bundled on its own by
// `scripts/build-audio-workers.ts` into `public/worklets/kys-voice.js` (WORKLET_URL); nothing imports it.
import { createSynth, type Synth, type SynthMessage } from '@/lib/app/synths/audio/dsp-core';

// The AudioWorkletGlobalScope names this file uses. The project's TypeScript lib is `dom`, which does not declare them.
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;
declare const sampleRate: number;
declare const currentFrame: number;

class KysProcessor extends AudioWorkletProcessor {
  synth: Synth;
  /** The context's frame when the synth played its first sample: its own frame count starts there. */
  base = -1;
  constructor() {
    super();
    this.synth = createSynth(sampleRate, (e) =>
      // A pattern's `loop` event counts frames from the synth's first sample; the page reads the context's clock.
      this.port.postMessage(e.type === 'loop' ? { ...e, frame: e.frame + this.base } : e)
    );
    this.port.onmessage = (m: MessageEvent<SynthMessage>) => this.synth.handle(m.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.base < 0) this.base = currentFrame;
    const out = outputs[0];
    this.synth.process(out[0], out[0].length, out[1]);
    for (let c = 2; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}
registerProcessor('kys-voice', KysProcessor);
