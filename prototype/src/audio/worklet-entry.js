/* global AudioWorkletProcessor, registerProcessor, sampleRate */
import { createSynth } from './dsp-core.js';

class KysProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = createSynth(sampleRate, (e) => this.port.postMessage(e));
    this.port.onmessage = (m) => this.synth.handle(m.data);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    this.synth.process(out[0], out[0].length, out[1]);
    for (let c = 2; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}
registerProcessor('kys-voice', KysProcessor);
