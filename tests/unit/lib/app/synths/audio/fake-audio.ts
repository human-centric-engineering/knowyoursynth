/**
 * A small stand-in for the Web Audio graph, enough for the outboard rack and the engine shell: every node records
 * what it was connected to, and every AudioParam records the targets it was glided to. The test environment is
 * node, which has no Web Audio.
 */

export class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(v: number, _t: number, _c: number): this {
    this.targets.push(v);
    this.value = v;
    return this;
  }
  get last(): number | undefined {
    return this.targets.at(-1);
  }
}

export class FakeNode {
  outputs: FakeNode[] = [];
  connect<T extends FakeNode>(dest: T, ..._rest: number[]): T {
    this.outputs.push(dest);
    return dest;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam();
}
export class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}
export class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
}
export class FakeOsc extends FakeNode {
  frequency = new FakeParam();
  started = false;
  start(): void {
    this.started = true;
  }
}
export class FakeDelay extends FakeNode {
  delayTime = new FakeParam();
}
export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
}
export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
}
export class FakeBuffer {
  channels: Float32Array[];
  constructor(n: number, len: number) {
    this.channels = Array.from({ length: n }, () => new Float32Array(len));
  }
  getChannelData(c: number): Float32Array {
    return this.channels[c];
  }
}

/** The AudioContext methods the rack and the engine call. */
export class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  createGain(): FakeGain {
    return new FakeGain();
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createOscillator(): FakeOsc {
    return new FakeOsc();
  }
  createDelay(_max: number): FakeDelay {
    return new FakeDelay();
  }
  createChannelMerger(_n: number): FakeNode {
    return new FakeNode();
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver();
  }
  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser();
  }
  createBuffer(n: number, len: number, _sr: number): FakeBuffer {
    return new FakeBuffer(n, len);
  }
}
