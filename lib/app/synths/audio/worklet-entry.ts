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

class KysProcessor extends AudioWorkletProcessor {
  synth: Synth;
  constructor() {
    super();
    this.synth = createSynth(sampleRate, (e) => this.port.postMessage(e));
    this.port.onmessage = (m: MessageEvent<SynthMessage>) => this.synth.handle(m.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    this.synth.process(out[0], out[0].length, out[1]);
    for (let c = 2; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}
registerProcessor('kys-voice', KysProcessor);
