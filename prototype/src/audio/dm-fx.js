// DeepMind effects engine: four slots, 35 algorithms, ten routings, insert / send / bypass. Stereo, per sample.
// The manual names each algorithm after a piece of hardware and lists its parameters, but says nothing about how any
// of them works, so every algorithm here is this app's approximation, built from a small set of kernels (a feedback
// delay network reverb, a burst reverb for the gated and reverse programs, stereo delays, modulated delays, filters,
// dynamics, a pitch shifter and a rotary speaker). Parameters arrive in the units printed on the display.
// No allocations in tick(); buffers are made when an algorithm is loaded into a slot. No imports.

const TWO_PI = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const db = (d) => Math.pow(10, d / 20);
const onePole = (hz, sr) => 1 - Math.exp((-TWO_PI * clamp(hz, 1, sr * 0.45)) / sr);
const FACTOR = { '1/4': 0.25, '3/8': 0.375, '1/2': 0.5, '2/3': 2 / 3, '1': 1, '4/3': 4 / 3, '3/2': 1.5, '2': 2, '3': 3 };
const RT_GAIN = (len, rt, sr) => Math.pow(10, (-3 * len) / Math.max(rt * sr, 1));
const softClip = (x) => (x > 1.5 ? 1 : x < -1.5 ? -1 : x - (x * x * x) / 6.75);

// ── primitives ──────────────────────────────────────────────────────────────
/** Circular delay line. read(d) is the sample written d samples before the latest one, interpolated. */
function Line(n) {
  let size = 16;
  while (size < n + 4) size <<= 1;
  this.b = new Float32Array(size);
  this.m = size - 1;
  this.w = 0;
}
Line.prototype.push = function push(x) { this.b[this.w] = x; this.w = (this.w + 1) & this.m; };
Line.prototype.read = function read(d) {
  const p = this.w - 1 - d;
  const i = Math.floor(p);
  const f = p - i;
  const a = this.b[i & this.m];
  return a + (this.b[(i + 1) & this.m] - a) * f;
};

/** RBJ biquad. */
function Biquad() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
Biquad.prototype.set = function set(type, f, q, gainDb, sr) {
  const w = (TWO_PI * clamp(f, 5, sr * 0.47)) / sr;
  const cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * Math.max(q, 0.05));
  const A = Math.pow(10, (gainDb || 0) / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'low': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'high': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }
  this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  return this;
};
Biquad.prototype.run = function run(x) {
  const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
  this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
  return y;
};
const bq = (n) => Array.from({ length: n }, () => new Biquad());

/** Zero-delay-feedback state-variable filter (Simper). run() returns the low-pass; hp, bp, notch are kept. */
function Svf() { this.ic1 = 0; this.ic2 = 0; this.g = 0.1; this.k = 1.4; this.lp = 0; this.bp = 0; this.hp = 0; }
Svf.prototype.set = function set(f, res, sr) {
  this.g = Math.tan((Math.PI * clamp(f, 10, sr * 0.45)) / sr);
  this.k = 2 - 1.96 * clamp(res, 0, 1);
};
Svf.prototype.run = function run(x) {
  const g = this.g, k = this.k;
  const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const v3 = x - this.ic2;
  const v1 = a1 * this.ic1 + a2 * v3;
  const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
  this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
  this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
  return v2;
};

/** Level follower with attack, hold and release (seconds). */
function Follower() { this.e = 0; this.h = 0; this.ca = 1; this.cr = 1; this.hold = 0; }
Follower.prototype.set = function set(a, h, r, sr) { this.ca = 1 - Math.exp(-1 / (Math.max(a, 1e-4) * sr)); this.cr = 1 - Math.exp(-1 / (Math.max(r, 1e-4) * sr)); this.hold = h * sr; };
Follower.prototype.run = function run(x) {
  const v = Math.abs(x);
  if (v > this.e) { this.e += (v - this.e) * this.ca; this.h = this.hold; } else if (this.h > 0) this.h--; else this.e += (v - this.e) * this.cr;
  return this.e;
};

// Schroeder allpass on a delay line
function allpass(line, len, g, x) {
  const d = line.read(len);
  const v = x + g * d;
  line.push(v);
  return d - g * v;
}

// ── mix helper shared by kernels that have a dry/wet control ─────────────
// Equal-power: a chain of effects at moderate mixes loses little level, and a phaser or flanger at 50 % (equal dry and
// wet, where its notches are deepest) is not 6 dB louder than the dry sound.
function mixer() { return { m: 0, t: 0 }; }
const MIXC = 0.0015;

// ── reverb: 8-line feedback delay network ─────────────────────────────────
const FDN_MS = [29.7, 37.1, 41.1, 43.7, 53.9, 59.3, 67.1, 73.3];
const AP_MS = [4.77, 3.6, 12.73, 9.3];
const ER_MS = [[7, 0.84, -0.5], [11.3, 0.72, 0.6], [17.9, 0.61, -0.8], [23.3, 0.52, 0.4], [31.1, 0.43, 0.9], [37.7, 0.36, -0.3], [44.9, 0.3, -0.9], [52.1, 0.24, 0.7]];

function Verb(sr) {
  const lines = FDN_MS.map((ms) => new Line(Math.ceil((ms / 1000) * 2.4 * sr + 0.004 * sr)));
  const aps = AP_MS.map((ms) => new Line(Math.ceil((ms / 1000) * 2.4 * sr)));
  const pre = new Line(Math.ceil(0.6 * sr));
  const len = new Float64Array(8), lenT = new Float64Array(8), g = new Float64Array(8), gL = new Float64Array(8);
  const dmp = new Float64Array(8), lo = new Float64Array(8), s = new Float64Array(8), ph = new Float64Array(8);
  for (let i = 0; i < 8; i++) ph[i] = i / 8;
  const inLc = new Biquad(), inHc = new Biquad(), outLc = [new Biquad(), new Biquad()];
  const toneLo = [new Biquad(), new Biquad()], toneHi = [new Biquad(), new Biquad()];
  let lcHp = 0, cfg = null;
  let preS = 0, preT = 0, erS = 0, cD = 1, cX = 0.05, apG = 0.6, modD = 0, modInc = 0, width = 1, er = 0, tail = 1, early = 0.3;
  let freeze = false, crush = 0, crushQ = 0, lastL = 0, lastR = 0, holdN = 0, holdC = 0;
  const self = { l: 0, r: 0 };
  /**
   * c: { pre s, rt s, size 0..1, damp Hz, diff 0..1, lc Hz, hc Hz, bass ×, xover Hz, mod 0..1, modHz, width 0..1,
   *      er 0..1, erDelay s, tail 0..1, early 0..1, freeze, tone -1..1, lofi }
   */
  self.set = (c) => {
    cfg = c;
    const scale = 0.3 + 1.9 * clamp(c.size, 0, 1);
    for (let i = 0; i < 8; i++) {
      lenT[i] = (FDN_MS[i] / 1000) * scale * sr;
      g[i] = c.freeze ? 1 : Math.min(RT_GAIN(lenT[i], c.rt, sr), 0.9995);
      gL[i] = c.freeze ? 1 : Math.min(RT_GAIN(lenT[i], c.rt * (c.bass || 1), sr), 0.9995);
      if (!len[i]) len[i] = lenT[i];
    }
    freeze = !!c.freeze;
    preT = clamp(c.pre, 0, 0.25) * sr;
    erS = clamp(c.erDelay || 0, 0, 0.2) * sr;
    cD = c.freeze ? 1 : onePole(c.damp, sr);
    cX = onePole(c.xover || 250, sr);
    apG = 0.35 + 0.4 * clamp(c.diff, 0, 1);
    modD = clamp(c.mod || 0, 0, 1) * 0.0011 * sr;
    modInc = (c.modHz || 0.7) / sr;
    width = clamp(c.width == null ? 1 : c.width, 0, 1);
    er = clamp(c.er || 0, 0, 1);
    tail = c.tail == null ? 1 : c.tail;
    early = clamp(c.early == null ? 0.3 : c.early, 0, 1);
    inLc.set('hp', c.lc || 20, 0.707, 0, sr);
    inHc.set('lp', c.hc || 18000, 0.707, 0, sr);
    lcHp = c.lc || 20;
    outLc[0].set('hp', lcHp, 0.6, 0, sr); outLc[1].set('hp', lcHp, 0.6, 0, sr);
    const t = clamp(c.tone || 0, -1, 1);
    for (let k = 0; k < 2; k++) { toneLo[k].set('low', 350, 0.7, -t * 6, sr); toneHi[k].set('high', 2500, 0.7, t * 7, sr); }
    crush = c.lofi ? 1 : 0;
    crushQ = 64;
    holdN = c.lofi ? 4 : 0;
  };
  self.tick = (l, r) => {
    let x = freeze ? 0 : (l + r) * 0.5;
    x = inHc.run(inLc.run(x));
    pre.push(x);
    preS += (preT - preS) * 0.0005;
    const xp = pre.read(preS);
    // early reflections off the same line
    let eL = 0, eR = 0;
    if (er > 0 || early > 0) {
      const sc = 0.4 + 1.2 * clamp(cfg.size, 0, 1);
      for (let k = 0; k < ER_MS.length; k++) {
        const [ms, gn, pan] = ER_MS[k];
        const v = pre.read(preS + erS + (ms / 1000) * sc * sr) * gn;
        eL += v * (1 - pan) * 0.5; eR += v * (1 + pan) * 0.5;
      }
    }
    let u = xp;
    for (let k = 0; k < 4; k++) u = allpass(aps[k], (AP_MS[k] / 1000) * (0.5 + clamp(cfg.size, 0, 1)) * sr, apG * (k < 2 ? 1 : 0.85), u);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      len[i] += (lenT[i] - len[i]) * 0.0002;
      let d = len[i];
      if (modD > 0 && i < 4) { ph[i] += modInc * (1 + i * 0.137); if (ph[i] >= 1) ph[i] -= 1; d += modD * (1 + Math.sin(TWO_PI * ph[i])); }
      let v = lines[i].read(d);
      if (!freeze) {
        dmp[i] += (v - dmp[i]) * cD;
        v = dmp[i];
        lo[i] += (v - lo[i]) * cX;
        v = g[i] * v + (gL[i] - g[i]) * lo[i];
      }
      s[i] = v;
      sum += v;
    }
    const h = sum * 0.25;
    for (let i = 0; i < 8; i++) lines[i].push(s[i] - h + (i & 1 ? -u : u) * 0.6);
    let oL = (s[0] - s[2] + s[4] - s[6]) * 0.5 * tail;
    let oR = (s[1] - s[3] + s[5] - s[7]) * 0.5 * tail;
    oL += eL * (er + early * 0.5) + u * early * 0.25;
    oR += eR * (er + early * 0.5) + u * early * 0.25;
    const m = (oL + oR) * 0.5, sd = (oL - oR) * 0.5 * width;
    oL = m + sd; oR = m - sd;
    oL = toneHi[0].run(toneLo[0].run(outLc[0].run(oL)));
    oR = toneHi[1].run(toneLo[1].run(outLc[1].run(oR)));
    if (crush) {
      if (++holdC >= holdN) { holdC = 0; lastL = Math.round(oL * crushQ) / crushQ; lastR = Math.round(oR * crushQ) / crushQ; }
      oL = lastL; oR = lastR;
    }
    self.l = oL; self.r = oR;
  };
  return self;
}

// ── burst reverb for the gated and reverse programs: diffused taps under an envelope ───────────
function Burst(sr) {
  const N = 28;
  const line = new Line(Math.ceil(1.45 * sr));
  const aps = AP_MS.map((ms) => new Line(Math.ceil((ms / 1000) * 2 * sr)));
  const tL = new Float64Array(N), tR = new Float64Array(N), wL = new Float64Array(N), wR = new Float64Array(N);
  const jit = Float64Array.from({ length: N * 2 }, () => Math.random());
  const lc = new Biquad(), shelf = new Biquad();
  let apG = 0.6, active = N;
  const self = { l: 0, r: 0 };
  /** c: { pre s, len s, attack 0..1 (gated) | rise 0..1 (reverse), reverse, density 0..1, spread 0..1, diff 0..1, lc, hsf, hsg } */
  self.set = (c) => {
    active = Math.max(6, Math.round(N * (0.25 + 0.75 * clamp(c.density, 0, 1))));
    let eL = 0, eR = 0;
    for (let k = 0; k < N; k++) {
      const fL = (k + 0.2 + 0.6 * jit[k] * (0.4 + c.spread)) / active;
      const fR = (k + 0.2 + 0.6 * jit[N + k] * (0.4 + c.spread)) / active;
      tL[k] = (c.pre + fL * c.len) * sr;
      tR[k] = (c.pre + fR * c.len) * sr;
      const env = (f) => {
        if (c.reverse) return Math.pow(clamp(f, 0.02, 1), 1 + 5 * c.rise);
        const a = Math.max(c.attack, 0.001);
        return (f < a ? f / a : 1) * (f > 0.9 ? Math.max(0, 1 - f) / 0.1 : 1);
      };
      wL[k] = k < active ? env(fL) * (k & 1 ? -1 : 1) : 0;
      wR[k] = k < active ? env(fR) * (k & 1 ? 1 : -1) : 0;
      eL += wL[k] * wL[k]; eR += wR[k] * wR[k];
    }
    const nL = 0.9 / Math.sqrt(Math.max(eL, 1e-6)), nR = 0.9 / Math.sqrt(Math.max(eR, 1e-6));
    for (let k = 0; k < N; k++) { wL[k] *= nL; wR[k] *= nR; }
    apG = 0.3 + 0.45 * clamp(c.diff, 0, 1);
    lc.set('hp', c.lc, 0.707, 0, sr);
    shelf.set('high', c.hsf, 0.707, c.hsg, sr);
  };
  self.tick = (l, r) => {
    let u = shelf.run(lc.run((l + r) * 0.5));
    for (let k = 0; k < 4; k++) u = allpass(aps[k], (AP_MS[k] / 1000) * 1.7 * sr, apG, u);
    line.push(u);
    let oL = 0, oR = 0;
    for (let k = 0; k < active; k++) { oL += line.read(tL[k]) * wL[k]; oR += line.read(tR[k]) * wR[k]; }
    self.l = oL; self.r = oR;
  };
  return self;
}

// ── spring (for the TC reverb's Spring preset): dispersive allpasses inside a feedback delay ────────
function Spring(sr) {
  const dl = [new Line(Math.ceil(0.06 * sr)), new Line(Math.ceil(0.06 * sr))];
  const apS = new Float64Array(24);
  const lp = [0, 0], hp = [0, 0];
  let fb = 0.7, cL = 0.2;
  const self = { l: 0, r: 0 };
  self.set = (c) => { fb = Math.min(RT_GAIN(0.037 * sr, c.rt, sr), 0.97); cL = onePole(c.damp, sr); };
  self.tick = (l, r) => {
    const x = (l + r) * 0.5;
    for (let ch = 0; ch < 2; ch++) {
      let v = dl[ch].read((ch ? 0.041 : 0.0335) * sr);
      // twelve first-order allpasses with a high coefficient: the chirp that makes a spring go "boing"
      for (let k = 0; k < 12; k++) {
        const j = ch * 12 + k;
        const y = -0.62 * v + apS[j];
        apS[j] = v + 0.62 * y;
        v = y;
      }
      lp[ch] += (v - lp[ch]) * cL;
      hp[ch] += (lp[ch] - hp[ch]) * 0.01;
      const o = lp[ch] - hp[ch];
      dl[ch].push(x * 0.6 + softClip(o * fb));
      if (ch) self.r = o; else self.l = o;
    }
  };
  return self;
}

// ── modulated delay pair: chorus, flanger ─────────────────────────────────
function ModDelay(sr, maxMs) {
  const d = [new Line(Math.ceil((maxMs / 1000) * sr) + 8), new Line(Math.ceil((maxMs / 1000) * sr) + 8)];
  const fbS = [0, 0];
  const self = { l: 0, r: 0, d, fbS };
  return self;
}

// ── pitch shifter voice: two crossfaded read heads sweeping through a delay line ───────────────
function Shifter(sr) {
  const line = new Line(Math.ceil(0.62 * sr));
  const W = Math.round(0.055 * sr);
  const self = { phase: 0, ratio: 1, delay: 0.02 * sr, line };
  self.run = (x) => {
    line.push(x);
    self.phase += (1 - self.ratio) / W;
    self.phase -= Math.floor(self.phase);
    const p2 = self.phase + 0.5 - Math.floor(self.phase + 0.5);
    const a = line.read(self.delay + self.phase * W) * Math.sin(Math.PI * self.phase);
    const b = line.read(self.delay + p2 * W) * Math.sin(Math.PI * p2);
    return a + b;
  };
  return self;
}

// ── LFO shapes ────────────────────────────────────────────────────────────
const tri = (p) => (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
const skewTri = (p, k) => (p < k ? (2 * p) / k - 1 : 1 - (2 * (p - k)) / (1 - k));

// ═══ the algorithms ═══════════════════════════════════════════════════════
// Each factory returns { set(p, send), tick(l, r), l, r }. `send` = the slot is on a send: output effect only.

function withMix(core) {
  // wraps a kernel whose own output is wet only, adding the MIX control
  const mx = mixer();
  const self = { l: 0, r: 0, core };
  self.mixTarget = (v, send) => { mx.t = send ? 1 : clamp(v / 100, 0, 1); };
  self.out = (l, r, wl, wr) => {
    mx.m += (mx.t - mx.m) * MIXC;
    const dry = Math.cos(mx.m * Math.PI * 0.5), wet = Math.sin(mx.m * Math.PI * 0.5);
    self.l = l * dry + wl * wet;
    self.r = r * dry + wr * wet;
  };
  return self;
}

/** Reverbs built on the FDN, from a function turning the slot's parameters into a Verb config. */
function verbAlgo(toCfg, gain = 1) {
  return (sr) => {
    const v = Verb(sr);
    const w = withMix(v);
    w.set = (p, send) => { v.set(toCfg(p)); w.mixTarget(p.MIX, send); };
    w.tick = (l, r) => { v.tick(l, r); w.out(l, r, v.l * gain, v.r * gain); };
    return w;
  };
}
const size01 = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

const TC_PRESETS = {
  Ambience: { size: 0.12, rtK: 0.35, diff: 0.9, damp: 9000, er: 0.6, early: 0.6 },
  Church: { size: 1, rtK: 1.7, diff: 0.7, damp: 4500, bass: 1.3, preAdd: 0.03 },
  Hall: { size: 0.75, rtK: 1, diff: 0.75, damp: 7000, bass: 1.15 },
  'Lo Fi': { size: 0.55, rtK: 0.9, diff: 0.6, damp: 3500, lc: 300, hc: 3200, lofi: true },
  Modulated: { size: 0.6, rtK: 1, diff: 0.75, damp: 7000, mod: 1, modHz: 0.9 },
  Plate: { size: 0.35, rtK: 1, diff: 1, damp: 12000, early: 0.1 },
  Room: { size: 0.28, rtK: 0.6, diff: 0.8, damp: 8000, er: 0.5, early: 0.45 },
  Tile: { size: 0.25, rtK: 0.7, diff: 0.65, damp: 16000, er: 0.7, early: 0.5 },
  Default: { size: 0.6, rtK: 1, diff: 0.75, damp: 8000 },
};
function tcDeep(sr) {
  const verb = Verb(sr), gate = Burst(sr), spring = Spring(sr);
  const w = withMix(verb);
  let kind = 'verb';
  const tone = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
  w.set = (p, send) => {
    const t = clamp(p.TON / 50, -1, 1);
    const pre = p.PDY / 1000;
    if (p.PST === 'Gate') {
      kind = 'gate';
      gate.set({ pre, len: 0.12 + p.DCY * 0.1, attack: 0.05, density: 0.9, spread: 0.6, diff: 0.8, lc: 60, hsf: 3000, hsg: t * 8 });
    } else if (p.PST === 'Spring') {
      kind = 'spring';
      spring.set({ rt: p.DCY * 0.8, damp: 3500 * Math.pow(2, t) });
      tone[0].set('low', 300, 0.7, 0, sr);
    } else {
      kind = 'verb';
      const c = TC_PRESETS[p.PST] || TC_PRESETS.Default;
      verb.set({ pre: pre + (c.preAdd || 0), rt: p.DCY * c.rtK, size: c.size, damp: c.damp, diff: c.diff, lc: c.lc || 40, hc: c.hc || 18000,
        bass: c.bass || 1, xover: 250, mod: c.mod || 0.15, modHz: c.modHz || 0.6, width: 1, er: c.er || 0, erDelay: 0.004, early: c.early == null ? 0.25 : c.early,
        tone: t, lofi: c.lofi });
    }
    for (let k = 0; k < 2; k++) { tone[k].set('low', 350, 0.7, -t * 6, sr); tone[k + 2].set('high', 2500, 0.7, t * 7, sr); }
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => {
    let a = 0, b = 0;
    if (kind === 'gate') { gate.tick(l, r); a = gate.l; b = gate.r; } else if (kind === 'spring') {
      spring.tick(l, r);
      a = tone[2].run(tone[0].run(spring.l)) * 0.6; b = tone[3].run(tone[1].run(spring.r)) * 0.6;
    } else { verb.tick(l, r); a = verb.l; b = verb.r; }
    w.out(l, r, a, b);
  };
  return w;
}

function burstAlgo(reverse) {
  return (sr) => {
    const b = Burst(sr);
    const w = withMix(b);
    w.set = (p, send) => {
      b.set({ pre: p.PD / 1000, len: p.DCY / 1000, attack: clamp(p.ATK / 30, 0, 1) * 0.7, rise: clamp((p.RIS || 0) / 50, 0, 1), reverse,
        density: reverse ? 0.85 : size01(p.DEN, 1, 50), spread: clamp(p.SPR / 100, 0, 1), diff: reverse ? size01(p.DIF, 1, 30) : p.DIF / 100,
        lc: p.LC, hsf: p.HIF, hsg: p.HIG });
      w.mixTarget(p.MIX, send);
    };
    w.tick = (l, r) => { b.tick(l, r); w.out(l, r, b.l, b.r); };
    return w;
  };
}

// Chorus / flanger core used by the stereo chorus, the flanger and the combined reverbs.
function modCore(sr, maxMs) {
  const md = ModDelay(sr, maxMs);
  const lc = bq(2), hc = bq(2), flc = bq(2), fhc = bq(2);
  const st = { phase: Math.random(), inc: 0, base: [0.01 * sr, 0.01 * sr], baseT: [0.01 * sr, 0.01 * sr], dep: [0, 0], phs: 0.25, wave: 1, fb: 0, spread: 0, l: 0, r: 0, useFb: false };
  st.cfg = (c) => {
    st.inc = c.speed / sr;
    st.baseT[0] = (c.dl / 1000) * sr; st.baseT[1] = (c.dr / 1000) * sr;
    st.dep[0] = c.wl; st.dep[1] = c.wr; // fraction of the base delay swept either way
    st.phs = c.phase / 360;
    st.wave = c.sine; // 0 = triangle, 1 = sine
    st.fb = c.fb || 0;
    st.useFb = !!c.fb;
    st.spread = c.cross || 0;
    for (let k = 0; k < 2; k++) {
      lc[k].set('hp', c.lc || 10, 0.707, 0, sr); hc[k].set('lp', c.hc || 20000, 0.707, 0, sr);
      flc[k].set('hp', c.flc || 10, 0.707, 0, sr); fhc[k].set('lp', c.fhc || 20000, 0.707, 0, sr);
    }
  };
  st.tick = (l, r) => {
    st.phase += st.inc;
    if (st.phase >= 1) st.phase -= 1;
    for (let ch = 0; ch < 2; ch++) {
      let p = st.phase + (ch ? st.phs : 0);
      p -= Math.floor(p);
      const lfo = st.wave * Math.sin(TWO_PI * p) + (1 - st.wave) * tri(p);
      st.base[ch] += (st.baseT[ch] - st.base[ch]) * 0.0008;
      const d = Math.max(1, st.base[ch] * (1 + st.dep[ch] * lfo));
      const input = (ch ? r : l) + (st.useFb ? st.fb * md.fbS[ch] : 0);
      const v = md.d[ch].read(d);
      md.d[ch].push(input);
      if (st.useFb) md.fbS[ch] = softClip(fhc[ch].run(flc[ch].run(v)));
      const o = hc[ch].run(lc[ch].run(v));
      if (ch) st.r = o; else st.l = o;
    }
    if (st.spread) { const a = st.l, b = st.r; st.l = a + (b - a) * st.spread * 0.5; st.r = b + (a - b) * st.spread * 0.5; }
  };
  return st;
}

function chorusAlgo(sr) {
  const c = modCore(sr, 110);
  const w = withMix(c);
  w.set = (p, send) => {
    c.cfg({ speed: p.SPD, dl: p.DLL, dr: p.DLR, wl: 0.5 * p.WDL / 100, wr: 0.5 * p.WDR / 100, phase: p.PHS, sine: p.WAV / 100, lc: p.LC, hc: p.HC, cross: p.SPR / 100 });
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => { c.tick(l, r); w.out(l, r, c.l, c.r); };
  return w;
}

function flangerAlgo(sr) {
  const c = modCore(sr, 45);
  const w = withMix(c);
  w.set = (p, send) => {
    c.cfg({ speed: p.SPD, dl: p.DLL, dr: p.DLR, wl: 0.9 * p.WDL / 100, wr: 0.9 * p.WDR / 100, phase: p.PHS, sine: 1, lc: p.LC, hc: p.HC,
      flc: p.FLC, fhc: p.FHC, fb: (p.FD / 100) * 0.95 });
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => { c.tick(l, r); w.out(l, r, c.l, c.r); };
  return w;
}

// Dimension D: two delays swept in opposite directions by one triangle, each output taking one and subtracting the other.
const DIM = [[0.25, 0.0002], [0.25, 0.00035], [0.25, 0.0005], [0.5, 0.0007]];
function dimAlgo(sr) {
  const d = [new Line(Math.ceil(0.02 * sr)), new Line(Math.ceil(0.02 * sr))];
  const hc = bq(2);
  hc[0].set('lp', 9000, 0.707, 0, sr); hc[1].set('lp', 9000, 0.707, 0, sr);
  let phase = 0, inc = 0, depth = 0, on = true, stereo = true;
  const w = withMix(null);
  w.set = (p, send) => {
    on = p.ON === 'ON';
    stereo = p.MOD === 'STEREO';
    let rate = 0, dep = 0;
    ['SW1', 'SW2', 'SW3', 'SW4'].forEach((s, i) => { if (p[s] === 'ON') { rate = Math.max(rate, DIM[i][0]); dep += DIM[i][1]; } });
    inc = rate / sr; depth = dep * sr;
    w.mixTarget(on && depth > 0 ? p.MIX : 0, send && on && depth > 0);
  };
  w.tick = (l, r) => {
    const x = (l + r) * 0.5;
    phase += inc; if (phase >= 1) phase -= 1;
    const t = tri(phase);
    const base = 0.0065 * sr;
    d[0].push(x); d[1].push(x);
    const a = hc[0].run(d[0].read(base + depth * t)), b = hc[1].run(d[1].read(base - depth * t));
    let oL = a - 0.4 * b, oR = b - 0.4 * a;
    if (!stereo) { oL = (oL + oR) * 0.5; oR = oL; }
    w.out(l, r, oL * 1.2, oR * 1.2);
  };
  return w;
}

function phaserAlgo(sr) {
  const st = [new Float64Array(12), new Float64Array(12)];
  const fbS = [0, 0];
  const env = new Follower();
  let phase = Math.random(), inc = 0, stages = 6, base = 300, dep = 0, res = 0, skew = 0.5, phs = 0, envAmt = 0;
  const w = withMix(null);
  w.set = (p, send) => {
    inc = p.SPD / sr; stages = clamp(Math.round(p.STG), 2, 12); base = p.BAS; dep = p.DEP / 100; res = (p.RES / 100) * 0.85;
    skew = clamp(0.5 + p.WAV / 100, 0.05, 0.95); phs = p.PHS / 360; envAmt = p.ENV / 100;
    env.set(p.ATK / 1000, p.HLD / 1000, p.REL / 1000, sr);
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => {
    phase += inc; if (phase >= 1) phase -= 1;
    const e = Math.min(1, env.run((l + r) * 0.5) * 3);
    let oL = 0, oR = 0;
    for (let ch = 0; ch < 2; ch++) {
      let p = phase + (ch ? phs : 0);
      p -= Math.floor(p);
      const oct = dep * 4 * (0.5 + 0.5 * skewTri(p, skew)) + envAmt * 4 * e;
      const f = clamp(base * Math.pow(2, oct), 20, sr * 0.45);
      const t = Math.tan((Math.PI * f) / sr);
      const a = (t - 1) / (t + 1);
      let v = (ch ? r : l) + fbS[ch] * res;
      const s = st[ch];
      for (let k = 0; k < stages; k++) { const y = a * v + s[k]; s[k] = v - a * y; v = y; }
      fbS[ch] = softClip(v);
      if (ch) oR = v; else oL = v;
    }
    w.out(l, r, oL, oR);
  };
  return w;
}

function moodAlgo(sr) {
  const f1 = [new Svf(), new Svf()], f2 = [new Svf(), new Svf()];
  const env = new Follower();
  let phase = Math.random(), inc = 0, dep = 0, base = 500, res = 0.5, type = 'LP', wave = 'TRI', envAmt = 0, drive = 1, pole4 = 1, rnd = 0, rndPrev = 0;
  const w = withMix(null);
  w.set = (p, send) => {
    inc = p.SPD / sr; dep = p.DEP / 100; base = p.FRQ; res = (p.RES / 100) * 0.97; type = p.TYP; wave = p.WAV; envAmt = p.ENV / 100;
    drive = 1 + (p.DRV / 100) * 9; pole4 = p['4P'] / 100;
    env.set(p.ATK / 1000, 0.005, p.REL / 1000, sr);
    w.mixTarget(p.MIX, send);
  };
  const lfo = (ph) => {
    switch (wave) {
      case 'SIN': return Math.sin(TWO_PI * ph);
      case 'SAW+': return 2 * ph - 1;
      case 'SAW-': return 1 - 2 * ph;
      case 'RMP': return 2 * ph * ph - 1;
      case 'SQU': return ph < 0.5 ? 1 : -1;
      case 'RND': return rnd;
      default: return tri(ph);
    }
  };
  const pick = (f) => (type === 'HP' ? f.hp : type === 'BP' ? f.bp : type === 'NOT' ? f.lp + f.hp : f.lp);
  w.tick = (l, r) => {
    phase += inc;
    if (phase >= 1) { phase -= 1; rndPrev = rnd; rnd = Math.random() * 2 - 1; }
    const e = Math.min(1, env.run((l + r) * 0.5) * 3);
    const oct = dep * 3 * lfo(phase) + envAmt * 5 * e;
    const fc = clamp(base * Math.pow(2, oct), 20, sr * 0.45);
    const gnorm = 1 / Math.sqrt(drive);
    let oL = 0, oR = 0;
    for (let ch = 0; ch < 2; ch++) {
      f1[ch].set(fc, res, sr); f2[ch].set(fc, res * 0.6, sr);
      const x = Math.tanh((ch ? r : l) * drive) * gnorm * 1.2;
      f1[ch].run(x);
      const a = pick(f1[ch]);
      f2[ch].run(a);
      const y = a + (pick(f2[ch]) - a) * pole4;
      if (ch) oR = y; else oL = y;
    }
    w.out(l, r, oL, oR);
  };
  return w;
}

// Stereo delay, decimator delay and the Tel-Ray all share this two-line core.
function stereoDelayAlgo(sr) {
  const d = [new Line(Math.ceil(4.7 * sr)), new Line(Math.ceil(4.7 * sr))];
  const lc = bq(2), hc = bq(2), flc = bq(2), fhc = bq(2);
  const tT = [0, 0], t = [0.3 * sr, 0.3 * sr], y = [0, 0];
  let mode = 'ST', fbL = 0, fbR = 0;
  const w = withMix(null);
  w.set = (p, send) => {
    const base = p.TIM / 1000;
    tT[0] = Math.max(0.001, base * FACTOR[p.FCL]) * sr;
    tT[1] = Math.max(0.001, base * FACTOR[p.FCR] + p.OFS / 1000) * sr;
    mode = p.MOD;
    fbL = (p.FBL / 100) * 0.98; fbR = mode === 'P-P' ? 0 : (p.FBR / 100) * 0.98;
    for (let k = 0; k < 2; k++) {
      lc[k].set('hp', p.LC, 0.707, 0, sr); hc[k].set('lp', p.HC, 0.707, 0, sr);
      flc[k].set('hp', p.FLC, 0.707, 0, sr); fhc[k].set('lp', p.FHC, 0.707, 0, sr);
    }
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => {
    for (let k = 0; k < 2; k++) { t[k] += (tT[k] - t[k]) * 0.0004; y[k] = d[k].read(t[k]); }
    const fL = fhc[0].run(flc[0].run(y[0])), fR = fhc[1].run(flc[1].run(y[1]));
    let iL = hc[0].run(lc[0].run(l)), iR = hc[1].run(lc[1].run(r));
    if (mode === 'M' || mode === 'P-P') { const m = (iL + iR) * 0.5; iL = m; iR = m; }
    if (mode === 'X') { d[0].push(iL + softClip(fbL * fR)); d[1].push(iR + softClip(fbR * fL)); } else if (mode === 'P-P') { d[0].push(iL + softClip(fbL * fR)); d[1].push(softClip(fL)); } else { d[0].push(iL + softClip(fbL * fL)); d[1].push(iR + softClip(fbR * fR)); }
    w.out(l, r, y[0], y[1]);
  };
  return w;
}

function tapDelayAlgo(taps) {
  // taps: 3 or 4. The first tap is TIM itself and carries the feedback.
  return (sr) => {
    const d = [new Line(Math.ceil(4.7 * sr)), new Line(Math.ceil(4.7 * sr))];
    const tT = new Float64Array(taps), t = new Float64Array(taps), gain = new Float64Array(taps), pl = new Float64Array(taps), pr = new Float64Array(taps);
    const damp = [0, 0];
    let fb = 0, xfd = false;
    const w = withMix(null);
    w.set = (p, send) => {
      const base = p.TIM / 1000;
      const fac = taps === 3 ? [1, FACTOR[p.FCA], FACTOR[p.FCB]] : [1, FACTOR[p.FCA], FACTOR[p.FCB], FACTOR[p.FCC]];
      const gn = taps === 3 ? [p.GNT, p.GNA, p.GNB] : [p.GN, p.GNA, p.GNB, p.GNC];
      const s = taps === 4 ? p.SPR / 6 : 0;
      const pan = taps === 3 ? [p.PNT, p.PNA, p.PNB].map((x) => x / 100) : [-s, s, -s * 0.5, s * 0.5];
      for (let k = 0; k < taps; k++) {
        tT[k] = Math.max(0.001, base * fac[k]) * sr;
        if (!t[k]) t[k] = tT[k];
        gain[k] = gn[k] / 100;
        const a = ((pan[k] + 1) * Math.PI) / 4;
        pl[k] = Math.cos(a) * 1.41; pr[k] = Math.sin(a) * 1.41;
      }
      fb = (p.FBK / 100) * 0.95;
      xfd = p.XFD === 'ON';
      w.mixTarget(p.MIX, send);
    };
    w.tick = (l, r) => {
      const x = (l + r) * 0.5;
      let oL = 0, oR = 0;
      for (let k = 0; k < taps; k++) {
        t[k] += (tT[k] - t[k]) * 0.0004;
        const a = d[0].read(t[k]), b = d[1].read(t[k]);
        oL += a * gain[k] * pl[k]; oR += b * gain[k] * pr[k];
      }
      const f0 = d[0].read(t[0]), f1 = d[1].read(t[0]);
      damp[0] += ((xfd ? f1 : f0) - damp[0]) * 0.35; damp[1] += ((xfd ? f0 : f1) - damp[1]) * 0.35;
      d[0].push(x + softClip(fb * damp[0]));
      d[1].push(x + softClip(fb * damp[1]));
      w.out(l, r, oL, oR);
    };
    return w;
  };
}

function telRayAlgo(sr) {
  const line = new Line(Math.ceil(0.5 * sr));
  const aps = [new Line(Math.ceil(0.01 * sr)), new Line(Math.ceil(0.01 * sr))];
  let t = 0.2 * sr, tT = 0.2 * sr, fb = 0.4, wob = 0, cT = 0.2, lp = 0, hp = 0, ph = 0, ph2 = 0, drift = 0, driftT = 0;
  const w = withMix(null);
  w.set = (p, send) => {
    tT = (0.04 * Math.pow(10, p.DLY / 100)) * sr;
    fb = (p.SUS / 100) * 1.04;
    wob = (p.WOB / 100) * 0.0035 * sr;
    cT = onePole(900 * Math.pow(9, p.TON / 100), sr);
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => {
    const x = (l + r) * 0.5;
    ph += 4.8 / sr; if (ph >= 1) ph -= 1;
    ph2 += 0.37 / sr; if (ph2 >= 1) { ph2 -= 1; driftT = Math.random() * 2 - 1; }
    drift += (driftT - drift) * 0.00005;
    t += (tT - t) * 0.0003;
    let v = line.read(Math.max(2, t + wob * (0.6 * Math.sin(TWO_PI * ph) + 0.4 * drift)));
    lp += (v - lp) * cT;
    hp += (lp - hp) * 0.012;
    v = lp - hp;
    v = allpass(aps[0], 0.0031 * sr, 0.5, allpass(aps[1], 0.0047 * sr, 0.5, v));
    line.push(x + Math.tanh(v * fb * 1.1) / 1.1);
    w.out(l, r, v, v);
  };
  return w;
}

function decimAlgo(sr) {
  const d = [new Line(Math.ceil(4.7 * sr)), new Line(Math.ceil(4.7 * sr))];
  const flt = [new Svf(), new Svf()];
  const tT = [0, 0], t = [0.3 * sr, 0.3 * sr], hold = [0, 0], hq = [0, 0];
  let fbL = 0, fbR = 0, n = 1, cnt = 0, q = 0, pre = false, type = 'LP';
  const crush = (x) => (q ? Math.round(x * q) / q : x);
  const w = withMix(null);
  w.set = (p, send) => {
    const base = p.TIM / 1000;
    tT[0] = Math.max(0.001, base * FACTOR[p.FCL]) * sr; tT[1] = Math.max(0.001, base * FACTOR[p.FCR]) * sr;
    fbL = (p.FBL / 100) * 0.97; fbR = (p.FBR / 100) * 0.97;
    n = 1 + Math.round(Math.pow(p.DSM / 100, 1.5) * 40);
    q = p.BRC >= 23.5 ? 0 : Math.pow(2, Math.round(p.BRC) - 1);
    pre = p.DMT === 'PRE'; type = p.FLT;
    flt[0].set(p.FC, (p.RES / 100) * 0.95, sr); flt[1].set(p.FC, (p.RES / 100) * 0.95, sr);
    w.mixTarget(p.MIX, send);
  };
  const pick = (f) => (type === 'HP' ? f.hp : type === 'BP' ? f.bp : type === 'NOT' ? f.lp + f.hp : f.lp);
  w.tick = (l, r) => {
    if (++cnt >= n) { cnt = 0; hq[0] = 1; }
    let iL = l, iR = r;
    if (pre) { if (hq[0]) { hold[0] = crush(l); hold[1] = crush(r); } iL = hold[0]; iR = hold[1]; }
    for (let k = 0; k < 2; k++) t[k] += (tT[k] - t[k]) * 0.0004;
    let yL = d[0].read(t[0]), yR = d[1].read(t[1]);
    if (!pre) { if (hq[0]) { hold[0] = crush(yL); hold[1] = crush(yR); } yL = hold[0]; yR = hold[1]; }
    hq[0] = 0;
    flt[0].run(yL); flt[1].run(yR);
    const oL = pick(flt[0]), oR = pick(flt[1]);
    d[0].push(iL + softClip(fbL * oL)); d[1].push(iR + softClip(fbR * oR));
    // PRE crushes the dry path too, so it is heard whatever the mix
    w.out(pre ? iL : l, pre ? iR : r, oL, oR);
  };
  return w;
}

/** Reverb with a chorus, flanger or delay in front (the PCM-70 combinations and MOD/DLY/REV). */
function comboAlgo(front) {
  return (sr) => {
    const verb = Verb(sr);
    const mod = front === 'chorus' || front === 'flange' ? modCore(sr, front === 'chorus' ? 110 : 45) : null;
    const d = front === 'delay' || front === 'moddly' ? [new Line(Math.ceil(4.7 * sr)), new Line(Math.ceil(4.7 * sr))] : null;
    const fhc = [0, 0], tT = [0, 0], t = [0.3 * sr, 0.3 * sr];
    let bal = 0.5, xfd = 0, fb = 0, cF = 0.3, cross = false, par = false, lfoPh = 0, lfoInc = 0, lfoDep = 0;
    const w = withMix(verb);
    w.set = (p, send) => {
      if (front === 'chorus') mod.cfg({ speed: p.SPD, dl: p.DLY, dr: p.DLY * 1.3, wl: 0.5 * p.DEP / 100, wr: 0.5 * p.DEP / 100, phase: p.PHS, sine: 1 - p.WAV / 100 });
      if (front === 'flange') mod.cfg({ speed: p.SPD, dl: p.DLY, dr: p.DLY * 1.15, wl: 0.9 * p.DEP / 100, wr: 0.9 * p.DEP / 100, phase: p.PHS, sine: 1, fb: (p.FBK / 100) * 0.95, fhc: 12000 });
      if (front === 'delay') {
        const pat = String(p.PAT);
        cross = pat.endsWith('X');
        const r = { '1/4': 0.25, '1/3': 1 / 3, '3/8': 0.375, '1/2': 0.5, '2/3': 2 / 3, '3/4': 0.75, '1': 1 }[pat.replace('X', '')] || 1;
        tT[0] = (p.TIM / 1000) * sr; tT[1] = (p.TIM / 1000) * r * sr;
        fb = (p.FBK / 100) * 0.95; cF = onePole(p.FHC, sr); xfd = p.XFD / 100;
      }
      if (front === 'moddly') {
        const r = FACTOR[p.FAC] || 1;
        tT[0] = (p.TIM / 1000) * sr; tT[1] = (p.TIM / 1000) * r * sr;
        fb = (p.FBK / 100) * 0.95; cF = onePole(p.FHC, sr);
        lfoInc = p.SPD / sr; lfoDep = (p.DEP / 100) * 0.004 * sr; par = p.MOD === 'PAR';
      }
      bal = clamp((p.BAL + 100) / 200, 0, 1);
      if (front === 'moddly') {
        const rt = { AMB: 0.12, CLUB: 0.3, HALL: 0.55 }[p.RTY] * p.DCY;
        const size = { AMB: 0.15, CLUB: 0.35, HALL: 0.8 }[p.RTY];
        verb.set({ pre: 0.01, rt, size, damp: p.DMP, diff: 0.75, lc: 60, hc: 16000, bass: 1, mod: 0.2, modHz: 0.6, early: 0.2 });
      } else {
        verb.set({ pre: p.PRE / 1000, rt: p.DCY, size: size01(p.SIZ, 2, 200), damp: p.DMP, diff: 0.75, lc: p.LC, hc: 16000, bass: 1, mod: 0.2, modHz: 0.6, early: 0.2 });
      }
      w.mixTarget(p.MIX, send);
    };
    w.tick = (l, r) => {
      let aL = 0, aR = 0, vinL = l, vinR = r;
      if (mod) { mod.tick(l, r); aL = mod.l; aR = mod.r; vinL = aL; vinR = aR; } else {
        let dm = 0;
        if (front === 'moddly') { lfoPh += lfoInc; if (lfoPh >= 1) lfoPh -= 1; dm = lfoDep * (1 + Math.sin(TWO_PI * lfoPh)); }
        for (let k = 0; k < 2; k++) t[k] += (tT[k] - t[k]) * 0.0004;
        aL = d[0].read(t[0] + dm); aR = d[1].read(t[1] + dm * 0.8);
        fhc[0] += (aL - fhc[0]) * cF; fhc[1] += (aR - fhc[1]) * cF;
        const x = (l + r) * 0.5;
        if (cross) { d[0].push(x + softClip(fb * fhc[1])); d[1].push(softClip(fb * fhc[0]) + x * 0.5); } else { d[0].push(x + softClip(fb * fhc[0])); d[1].push(x + softClip(fb * fhc[1])); }
        if (front === 'delay') { vinL = l + aL * xfd; vinR = r + aR * xfd; }
        if (front === 'moddly') { vinL = par ? l : aL; vinR = par ? r : aR; }
      }
      verb.tick(vinL, vinR);
      w.out(l, r, aL * (1 - bal) + verb.l * bal, aR * (1 - bal) + verb.r * bal);
    };
    return w;
  };
}

function eqAlgo(sr) {
  const f = [bq(4), bq(4)];
  let on = true;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    on = p.EQ === 'ON';
    for (let k = 0; k < 2; k++) {
      f[k][0].set('low', p.LSF, 0.707, p.LSG, sr);
      f[k][1].set('peak', p.LMF, p.LMQ, p.LMG, sr);
      f[k][2].set('peak', p.HMF, p.HMQ, p.HMG, sr);
      f[k][3].set('high', p.HSF, 0.707, p.HSG, sr);
    }
  };
  self.tick = (l, r) => {
    if (!on) { self.l = l; self.r = r; return; }
    const a = f[0], b = f[1];
    self.l = a[3].run(a[2].run(a[1].run(a[0].run(l))));
    self.r = b[3].run(b[2].run(b[1].run(b[0].run(r))));
  };
  return self;
}

function enhancerAlgo(sr) {
  const bLp = bq(2), mBp = bq(2), hHp = bq(2);
  let bg = 0, mg = 0, hg = 0, spr = 0, solo = false, out = 1;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    const fb = 30 * Math.pow(2, (p.BFR / 50) * 3.3), fm = 700 * Math.pow(2, (p.MIQ / 50) * 3), fh = 1000 * Math.pow(2, (p.HIF / 50) * 4);
    for (let k = 0; k < 2; k++) { bLp[k].set('lp', fb, 0.9, 0, sr); mBp[k].set('bp', fm, 0.7, 0, sr); hHp[k].set('hp', fh, 0.707, 0, sr); }
    bg = p.BGN / 100; mg = p.MGN / 100; hg = p.HIG / 100; spr = p.SPR / 100; solo = p.SOL === 'ON'; out = db(p.OGN);
  };
  self.tick = (l, r) => {
    let oL = 0, oR = 0;
    for (let ch = 0; ch < 2; ch++) {
      const x = ch ? r : l;
      const b = bLp[ch].run(x), m = mBp[ch].run(x), h = hHp[ch].run(x);
      const add = bg * (1.2 * b + 0.5 * Math.tanh(3 * b)) + mg * 0.8 * Math.tanh(2.5 * m) + hg * (0.8 * h + 0.7 * Math.tanh(4 * h));
      const y = solo ? add : x + add;
      if (ch) oR = y; else oL = y;
    }
    const m = (oL + oR) * 0.5, s = (oL - oR) * 0.5 * (1 + spr);
    self.l = (m + s) * out; self.r = (m - s) * out;
  };
  return self;
}

// Fairchild 670 time constants: attack and release, the last two with a second, slower release for sustained sound.
const FAIR_TC = [[0.0002, 0.3, 0], [0.0002, 0.8, 0], [0.0004, 2, 0], [0.0004, 5, 0], [0.0004, 2, 10], [0.0002, 0.3, 25]];
function fairAlgo(sr) {
  const ch = [0, 1].map(() => ({ g: 1, env: 0, slow: 0, inG: 1, thr: 0, ratio: 2, knee: 6, out: 1, ca: 1, cr: 1, cs: 0 }));
  let mode = 'LINK', bias = 0, dcL = 0, dcR = 0;
  const cfg = (c, inDb, th, tc, dc, og) => {
    c.inG = db(inDb);
    c.thr = -3 * th; // THRESH 10 compresses from 30 dB below full level
    c.ratio = 1.5 + (dc / 100) * 14;
    c.knee = 12 - (dc / 100) * 10;
    c.out = db(og);
    const [a, rel, slow] = FAIR_TC[Number(tc) - 1] || FAIR_TC[1];
    c.ca = 1 - Math.exp(-1 / (a * sr)); c.cr = 1 - Math.exp(-1 / (rel * sr)); c.cs = slow ? 1 - Math.exp(-1 / (slow * sr)) : 0;
  };
  const gainFor = (c, level) => {
    const lv = 20 * Math.log10(level + 1e-9) - c.thr;
    let over;
    if (lv < -c.knee / 2) over = 0; else if (lv > c.knee / 2) over = lv; else { const t = lv + c.knee / 2; over = (t * t) / (2 * c.knee); }
    return db(-over * (1 - 1 / c.ratio));
  };
  const detect = (c, x) => {
    // feedback-style detection: it reads the level after the gain, as the 670 does
    const v = Math.abs(x);
    if (v > c.env) c.env += (v - c.env) * c.ca; else c.env += (v - c.env) * c.cr;
    if (c.cs) { c.slow += (c.env - c.slow) * c.cs; return Math.max(c.env, c.slow * 0.9); }
    return c.env;
  };
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    mode = p.MOD;
    cfg(ch[0], p.INL, p.THL, p.TML, p.DCL, p.OGL);
    cfg(ch[1], mode === 'LINK' ? p.INL : p.INR, mode === 'LINK' ? p.THL : p.THR, mode === 'LINK' ? p.TML : p.TMR, mode === 'LINK' ? p.DCL : p.DCR, mode === 'LINK' ? p.OGL : p.OGR);
    bias = p.BAL / 100;
  };
  const tube = (x, k) => {
    const y = Math.tanh(x * 1.1 + bias * 0.25 * x * x) / 1.1;
    return y - k;
  };
  self.tick = (l, r) => {
    let a = l, b = r;
    if (mode === 'M/S') { a = (l + r) * 0.5; b = (l - r) * 0.5; }
    a *= ch[0].inG; b *= ch[1].inG;
    if (mode === 'LINK') {
      const e = detect(ch[0], Math.max(Math.abs(a), Math.abs(b)) * ch[0].g);
      ch[0].g = gainFor(ch[0], e);
      ch[1].g = ch[0].g;
    } else {
      ch[0].g = gainFor(ch[0], detect(ch[0], a * ch[0].g));
      ch[1].g = gainFor(ch[1], detect(ch[1], b * ch[1].g));
    }
    let ya = a * ch[0].g, yb = b * ch[1].g;
    // valve colour, with a slow DC blocker for the even harmonics BIAS BAL adds
    ya = tube(ya, dcL); yb = tube(yb, dcR);
    dcL += ya * 0.0005; dcR += yb * 0.0005;
    ya *= ch[0].out * 1.25; yb *= ch[1].out * 1.25;
    if (mode === 'M/S') { self.l = ya + yb; self.r = ya - yb; } else { self.l = ya; self.r = yb; }
  };
  return self;
}

const CABS = {
  VTw: [80, 5000, 1200, 3], VBs: [50, 3500, 700, 3], A10: [100, 4500, 2500, 4], Mid: [150, 4000, 1000, 6], BFC: [90, 5500, 2000, 4],
  B60: [80, 5000, 1600, 3], V30: [90, 5500, 2800, 5], S78: [110, 4200, 1800, 3], Oax: [80, 7000, 3000, 4], A12: [90, 5000, 2200, 3], Rck: [40, 9000, 1000, 0],
};
function shapeFor(type, x) {
  switch (type) {
    case 'VAL': case 'PFV': return Math.tanh(x + 0.3) - 0.2913; // tanh(0.3): the offset leaves silence at zero
    case 'SAT': case 'PFS': return Math.tanh(x);
    default: return Math.tanh(x + 0.15 * x * x) - 0.15 * Math.tanh(0.15 * x * x); // TUB, PFT
  }
}
function multiDistAlgo(sr) {
  const lo = bq(2), mi = bq(2), post = [bq(2), bq(2)], cab = [bq(3), bq(3)];
  const dc = [0, 0];
  let inG = 1, outG = 1, lvl = [1, 1, 1], drv = [1, 1, 1], type = 'TUB', pf = false, useCab = false;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    inG = db(p.IPG); outG = db(p.OPG);
    lvl = [db(p.LBL), db(p.MBL), db(p.HBL)];
    drv = [p.LDR, p.MDR, p.HDR].map((d) => 1 + Math.pow(d / 100, 1.6) * 30);
    type = p.DST; pf = type.startsWith('PF');
    const x1 = Math.min(p.XV1, p.XV2), x2 = Math.max(p.XV1, p.XV2) * 1.001;
    const c = CABS[p.CAB];
    useCab = !!c;
    for (let k = 0; k < 2; k++) {
      lo[k].set('lp', x1, 0.707, 0, sr); mi[k].set('lp', x2, 0.707, 0, sr);
      post[k][0].set('lp', 6500, 0.707, 0, sr); post[k][1].set('lp', 9000, 0.6, 0, sr);
      if (c) { cab[k][0].set('hp', c[0], 0.7, 0, sr); cab[k][1].set('lp', c[1], 0.9, 0, sr); cab[k][2].set('peak', c[2], 1.2, c[3], sr); }
    }
  };
  self.tick = (l, r) => {
    let oL = 0, oR = 0;
    for (let ch = 0; ch < 2; ch++) {
      const x = (ch ? r : l) * inG;
      const low = lo[ch].run(x), rest = x - low, mid = mi[ch].run(rest), hi = rest - mid;
      let y = 0;
      const bands = [low, mid, hi];
      for (let b = 0; b < 3; b++) y += (shapeFor(type, bands[b] * drv[b]) / Math.sqrt(drv[b])) * lvl[b];
      dc[ch] += (y - dc[ch]) * 0.0005; y -= dc[ch];
      if (pf) y = post[ch][1].run(post[ch][0].run(y));
      if (useCab) y = cab[ch][2].run(cab[ch][1].run(cab[ch][0].run(y)));
      y *= outG * 1.4;
      if (ch) oR = y; else oL = y;
    }
    self.l = oL; self.r = oR;
  };
  return self;
}

function rackAmpAlgo(sr) {
  const pre = [bq(3), bq(3)], eq = [bq(2), bq(2)], cab = [bq(3), bq(3)];
  const dc = [0, 0];
  let g = 1, pwr = 1, lvl = 1, useCab = true;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    g = db((p.PRE / 10) * 42);
    pwr = 1 + (p.DRV / 10) * 6;
    lvl = Math.pow(p.LVL / 10, 2) * 2.2;
    useCab = p.CAB === 'ON';
    for (let k = 0; k < 2; k++) {
      pre[k][0].set('low', 150, 0.7, (p.BUZ - 5) * 2.4, sr);
      pre[k][1].set('peak', 800, 0.8, (p.PNC - 5) * 2.4, sr);
      pre[k][2].set('high', 3000, 0.7, (p.CRN - 5) * 2.4, sr);
      eq[k][0].set('low', 120, 0.7, ((p.LOW - 5) / 5) * 12, sr);
      eq[k][1].set('high', 3000, 0.7, ((p.HI - 5) / 5) * 12, sr);
      cab[k][0].set('hp', 70, 0.7, 0, sr); cab[k][1].set('lp', 4800, 0.9, 0, sr); cab[k][2].set('peak', 2000, 1, 3, sr);
    }
  };
  self.tick = (l, r) => {
    let oL = 0, oR = 0;
    for (let ch = 0; ch < 2; ch++) {
      const f = pre[ch];
      let y = f[2].run(f[1].run(f[0].run((ch ? r : l) * g)));
      y = Math.tanh(y + 0.02 * y * y);
      y = Math.tanh(y * pwr) / Math.tanh(pwr);
      dc[ch] += (y - dc[ch]) * 0.0005; y -= dc[ch];
      y = eq[ch][1].run(eq[ch][0].run(y));
      if (useCab) y = cab[ch][2].run(cab[ch][1].run(cab[ch][0].run(y)));
      y *= lvl * 0.5;
      if (ch) oR = y; else oL = y;
    }
    self.l = oL; self.r = oR;
  };
  return self;
}

function imagerAlgo(sr) {
  const lmf = new Biquad();
  let on = true, inMs = false, outMs = false, width = 1, lowW = 1, mG = 1, sG = 1, cnt = 0, out = 1;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    on = p.ON === 'ON'; inMs = p.IMD === 'MS'; outMs = p.OMD === 'MS';
    width = 1 + p.STS / 50; lowW = 1 + p.LMF / 50; mG = 1 - p.BAL / 100; sG = 1 + p.BAL / 100; cnt = p.CNT / 50; out = db(p.GN);
    lmf.set('lp', 1200, 0.707, 0, sr);
  };
  self.tick = (l, r) => {
    if (!on) { self.l = l; self.r = r; return; }
    const m = inMs ? l : (l + r) * 0.5;
    let s = inMs ? r : (l - r) * 0.5;
    const sl = lmf.run(s);
    s = (s - sl) * width + sl * width * lowW;
    const mm = m * mG, ss = s * sG;
    if (outMs) { self.l = mm * out; self.r = ss * out; return; }
    self.l = (mm * (1 - cnt) + ss) * out;
    self.r = (mm * (1 + cnt) - ss) * out;
  };
  return self;
}

function autoPanAlgo(sr) {
  const env = new Follower();
  let phase = 0, rate = 0, phs = 0.5, sq = 0.5, dep = 0, esp = 0, edp = 0;
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    rate = p.SPD; phs = p.PHS / 360; sq = (p.WAV + 50) / 100; dep = p.DEP / 100; esp = p.ESP / 100; edp = p.EDP / 100;
    env.set(p.ATK / 1000, p.HLD / 1000, p.REL / 1000, sr);
  };
  const shape = (p) => { const t = tri(p); return t * (1 - sq) + (t > 0 ? 1 : -1) * sq; };
  self.tick = (l, r) => {
    const e = Math.min(1, env.run((l + r) * 0.5) * 3);
    phase += (rate * (1 + esp * e * 3)) / sr;
    if (phase >= 1) phase -= 1;
    const d = clamp(dep + edp * e, 0, 1);
    let pr = phase + phs; pr -= Math.floor(pr);
    self.l = l * (1 - d * (0.5 + 0.5 * shape(phase)));
    self.r = r * (1 - d * (0.5 + 0.5 * shape(pr)));
  };
  return self;
}

function gateAlgo(sr) {
  let thr = 0.01, closed = 0.001, ca = 1, cr = 1, holdN = 0, holdC = 0, g = 1, punch = 0, pEnv = 0, mode = 'GAT', on = true;
  let fast = 0, slow = 0;
  const cPk = 1 - Math.exp(-1 / (0.0015 * sr)), cSlow = 1 - Math.exp(-1 / (0.05 * sr)), cPunch = 1 - Math.exp(-1 / (0.03 * sr));
  const self = { l: 0, r: 0 };
  self.set = (p) => {
    on = p.PWR === 'ON'; mode = p.MOD;
    thr = db(p.THR); closed = db(p.RNG);
    ca = 1 - Math.exp(-1 / (Math.max(p.ATT, 0.05) / 1000 * sr)); cr = 1 - Math.exp(-1 / ((p.REL / 1000) * sr));
    holdN = (p.HLD / 1000) * sr; punch = p.PUN / 6;
  };
  self.tick = (l, r) => {
    if (!on) { self.l = l; self.r = r; return; }
    const v = Math.max(Math.abs(l), Math.abs(r));
    fast += (v - fast) * (v > fast ? cPk : cPk * 0.05);
    slow += (fast - slow) * cSlow;
    let open;
    if (mode === 'TRN') open = fast > thr && fast > slow * 1.6;
    else open = fast > thr;
    if (mode === 'DUC') {
      const t = open ? closed : 1;
      g += (t - g) * (open ? ca : cr);
    } else {
      if (open) holdC = holdN; else if (holdC > 0) holdC--;
      const want = open || holdC > 0 ? 1 : closed;
      const wasLow = g < 0.5;
      g += (want - g) * (want > g ? ca : cr);
      if (wasLow && g >= 0.5) pEnv = 1;
    }
    pEnv += (0 - pEnv) * cPunch;
    const k = g * (1 + punch * pEnv);
    self.l = l * k; self.r = r * k;
  };
  return self;
}

function pitchAlgo(vintage) {
  return (sr) => {
    const s = [Shifter(sr), Shifter(sr)];
    const hc = [new Biquad(), new Biquad()];
    const y = [0, 0], gain = [1, 1], fb = [0, 0], pl = [0, 0], pr = [0, 0];
    const w = withMix(null);
    w.set = (p, send) => {
      [['SM1', 'CN1', 'DL1', 'GN1', 'FB1', 'PN1'], ['SM2', 'CN2', 'DL2', 'GN2', 'FB2', 'PN2']].forEach(([sm, cn, dl, gn, fbk, pn], k) => {
        s[k].ratio = Math.pow(2, (p[sm] + p[cn] / 100) / 12);
        s[k].delay = (p[dl] / 1000) * sr;
        gain[k] = vintage ? 0.8 : p[gn] / 100;
        fb[k] = vintage ? (p[fbk] / 100) * 0.9 : 0;
        const a = ((p[pn] / 100 + 1) * Math.PI) / 4;
        pl[k] = Math.cos(a) * 1.41; pr[k] = Math.sin(a) * 1.41;
        hc[k].set('lp', p.HIC, 0.707, 0, sr);
      });
      w.mixTarget(p.MIX, send);
    };
    w.tick = (l, r) => {
      const x = (l + r) * 0.5;
      let oL = 0, oR = 0;
      for (let k = 0; k < 2; k++) {
        let v = s[k].run(x + softClip(fb[k] * y[k]));
        v = hc[k].run(v);
        if (vintage) v = Math.tanh(v * 1.3) / 1.3;
        y[k] = v;
        oL += v * gain[k] * pl[k] * 0.7; oR += v * gain[k] * pr[k] * 0.7;
      }
      w.out(l, r, oL, oR);
    };
    return w;
  };
}

function rotaryAlgo(sr) {
  const split = [new Biquad(), new Biquad()];
  const horn = [new Line(Math.ceil(0.01 * sr)), new Line(Math.ceil(0.01 * sr))];
  const drum = new Line(Math.ceil(0.01 * sr));
  let hs = 0.7, ds = 0.6, hT = 0.7, dT = 0.6, hA = 0, dA = 0, cH = 0.0001, cD = 0.00003, depth = 1, hG = 1, dG = 1;
  const w = withMix(null);
  w.set = (p, send) => {
    const target = p.MOT === 'STOP' ? 0 : p.SPD === 'FAST' ? p.HIS : p.LOS;
    hT = target; dT = target * 0.86;
    const acc = p.ACC / 100;
    cH = 1 - Math.exp(-1 / ((0.15 + (1 - acc) * 2.5) * sr));
    cD = 1 - Math.exp(-1 / ((0.5 + (1 - acc) * 6) * sr));
    depth = 1 - 0.7 * (p.DIS / 100);
    hG = Math.min(1, 1 + p.BAL / 100); dG = Math.min(1, 1 - p.BAL / 100);
    split[0].set('lp', 800, 0.707, 0, sr); split[1].set('hp', 800, 0.707, 0, sr);
    w.mixTarget(p.MIX, send);
  };
  w.tick = (l, r) => {
    const x = (l + r) * 0.5;
    hs += (hT - hs) * cH; ds += (dT - ds) * cD;
    hA += hs / sr; if (hA >= 1) hA -= 1;
    dA += ds / sr; if (dA >= 1) dA -= 1;
    const lo = split[0].run(x), hi = split[1].run(x);
    horn[0].push(hi); horn[1].push(hi); drum.push(lo);
    const th = TWO_PI * hA, td = TWO_PI * dA;
    const dh = 0.00028 * sr * depth, base = 0.0035 * sr;
    // two microphones either side of the cabinet: each hears the horn coming towards it as the other hears it going away
    const hL = horn[0].read(base + dh * Math.sin(th)) * (1 - 0.45 * depth * (0.5 + 0.5 * Math.cos(th)));
    const hR = horn[1].read(base - dh * Math.sin(th)) * (1 - 0.45 * depth * (0.5 - 0.5 * Math.cos(th)));
    const dd = drum.read(base + 0.0001 * sr * depth * Math.sin(td));
    const dL = dd * (1 - 0.25 * depth * (0.5 + 0.5 * Math.cos(td))), dR = dd * (1 - 0.25 * depth * (0.5 - 0.5 * Math.cos(td)));
    w.out(l, r, (hL * hG + dL * dG) * 1.1, (hR * hG + dR * dG) * 1.1);
  };
  return w;
}

// Kernels without a MIX control are wrapped so every algorithm has the same set/tick shape.
const plain = (make) => (sr) => { const k = make(sr); return { set: (p) => k.set(p), tick: (l, r) => k.tick(l, r), get l() { return k.l; }, get r() { return k.r; } }; };

export const FX_FACTORY = {
  'tc-deepvrb': tcDeep,
  ambverb: verbAlgo((p) => ({ pre: p.PD / 1000, rt: p.DCY, size: size01(p.SIZ, 2, 100) * 0.7, damp: p.DMP, diff: size01(p.DIF, 1, 30), lc: p.LC, hc: p.HC, bass: 1,
    mod: p.MOD / 100, modHz: 0.5, width: 1, er: 0.35, erDelay: 0.002, tail: 0.2 + 0.8 * (p.TGN / 100), early: 0.5 })),
  roomrev: verbAlgo((p) => ({ pre: p.PRE / 1000, rt: p.DCY, size: size01(p.SIZ, 4, 76) * 0.8, damp: p.DMP, diff: p.DIF / 100, lc: p.LC, hc: p.HC, bass: p.LFX,
    xover: 250, mod: (p.SPI / 100) * 0.6, modHz: 0.8, width: 0.4 + (p.SPR / 50) * 0.6, er: 0.4, erDelay: 0.003, early: 0.6 * (1 - p.SHP / 250) })),
  vintagerev: verbAlgo((p) => ({ pre: p.PRE / 1000, rt: p.DCY * (0.4 + 0.6 * (p.SIZ / 100)), size: p.SIZ / 100, damp: clamp(9000 * p.HFX, 1000, 20000), diff: 0.3 + 0.7 * (p.DEN / 100),
    lc: p.LC, hc: p.HC, bass: p.LFX, xover: 300, mod: 0.1, modHz: 0.5, width: 0.9, er: p.ERL / 100, erDelay: p.ERD / 1000, early: 0.1, freeze: p.FRZ === 'ON' })),
  hallrev: verbAlgo((p) => ({ pre: p.PD / 1000, rt: p.DCY, size: 0.35 + 0.65 * size01(p.SIZ, 2, 200), damp: p.DMP, diff: size01(p.DIF, 1, 30), lc: p.LC, hc: p.HC, bass: p.LFX,
    xover: 250, mod: 0.35, modHz: 0.2 + (p.MOD / 100) * 1.8, width: 0.4 + (p.SPR / 50) * 0.6, er: 0.15, erDelay: 0.01, early: 0.45 * (1 - p.SHP / 250) })),
  chamberrev: verbAlgo((p) => ({ pre: p.PRE / 1000, rt: p.DCY, size: size01(p.SIZ, 4, 76) * 0.85, damp: p.DMP, diff: p.DIF / 100, lc: p.LC, hc: p.HC, bass: p.LFX,
    xover: 250, mod: (p.SPI / 100) * 0.6, modHz: 0.7, width: 0.4 + (p.SPR / 50) * 0.6, er: 0.3, erDelay: 0.005, early: 0.5 * (1 - p.SHP / 250) })),
  platerev: verbAlgo((p) => ({ pre: p.PD / 1000, rt: p.DCY, size: 0.15 + 0.45 * size01(p.SIZ, 2, 200), damp: p.DMP, diff: 0.6 + 0.4 * size01(p.DIF, 1, 30), lc: p.LC, hc: p.HC,
    bass: p.LFX, xover: p.XOV, mod: size01(p.MOD, 1, 50), modHz: 0.1 + (p.MDS / 100) * 2, width: 1, early: 0.05 })),
  richpltrev: verbAlgo((p) => ({ pre: p.PD / 1000, rt: p.DCY, size: 0.15 + 0.6 * size01(p.SIZ, 4, 39), damp: p.DMP, diff: 0.4 + 0.6 * (p.DIF / 100), lc: p.LC, hc: p.HC,
    bass: p.LFX, xover: 250, mod: (p.SPN / 100) * 0.8, modHz: 0.9, width: 0.4 + (p.SPR / 50) * 0.6, early: 0.3 * (1 - p.ATK / 100) })),
  gatedrev: burstAlgo(false),
  reverse: burstAlgo(true),
  chorusverb: comboAlgo('chorus'),
  delayverb: comboAlgo('delay'),
  flangeverb: comboAlgo('flange'),
  midaseq: plain(eqAlgo),
  enhancer: plain(enhancerAlgo),
  faircomp: plain(fairAlgo),
  mulbnddist: plain(multiDistAlgo),
  rackamp: plain(rackAmpAlgo),
  edisonex1: plain(imagerAlgo),
  'auto-pan': plain(autoPanAlgo),
  noisegate: plain(gateAlgo),
  delay: stereoDelayAlgo,
  '3tapdelay': tapDelayAlgo(3),
  '4tapdelay': tapDelayAlgo(4),
  't-raydelay': telRayAlgo,
  decimdelay: decimAlgo,
  moddlyrev: comboAlgo('moddly'),
  chorus: chorusAlgo,
  'chorus-d': dimAlgo,
  flanger: flangerAlgo,
  phaser: phaserAlgo,
  moodfilter: moodAlgo,
  'dual-pitch': pitchAlgo(false),
  'vintage-pitch': pitchAlgo(true),
  rotaryspkr: rotaryAlgo,
};

// ── routing ─────────────────────────────────────────────────────────────────
// A routing is a tree: a number is a slot (0-based), ['S', …] runs its parts in a row, ['P', …] side by side.
// The two feedback modes run `main` and feed its output back to its input through `loop`.
const ROUTES = {
  1: ['S', 0, 1, 2, 3], 2: ['S', ['P', 0, 1], 2, 3], 3: ['S', ['P', 0, 1], ['P', 2, 3]], 4: ['P', 0, 1, 2, 3],
  5: ['S', ['P', 0, 1, 2], 3], 6: ['S', 0, 1, ['P', 2, 3]], 7: ['S', 0, ['P', 1, 2, 3]], 8: ['P', ['S', 0, 1, 2], 3],
  9: { main: ['S', 2, 3], loop: ['S', 0, 1] }, 10: { main: 3, loop: ['S', 0, 1, 2] },
};

/**
 * The effects engine. set(fx) with EngineParams `fx`:
 *   { mode: 'insert'|'send'|'bypass', routing: 1..10, slots: [{ alg, level, p: { REF: value } } | { alg: null }] × 4 }
 * process(inBuf, outL, outR, n) reads the mono sum of the voices and writes stereo.
 */
export function createFx(sr) {
  const slots = [0, 1, 2, 3].map(() => ({ alg: null, k: null, level: 1, lv: 1 }));
  // The feedback modes return the loop's output through a short buffer (the hardware's own block latency does the same),
  // high-passed so it cannot build up at DC.
  const fbLine = [new Line(Math.ceil(0.01 * sr)), new Line(Math.ceil(0.01 * sr))];
  const fbDc = [0, 0];
  const FB_DELAY = 0.005 * sr;
  let mode = 'bypass', route = ROUTES[1], send = false;
  let oL = 0, oR = 0, hit = false, fbL = 0, fbR = 0, wet = 0, wetT = 0, last = null, broken = false;
  const LVC = 0.002;

  function set(fx) {
    const f = fx || {};
    last = f;
    mode = f.mode || 'bypass';
    send = mode === 'send';
    route = ROUTES[f.routing] || ROUTES[1];
    wetT = mode === 'bypass' ? 0 : 1;
    const list = f.slots || [];
    // slots inside a feedback loop return their effect only, as on a send: their dry sound would be fed straight back
    const inLoop = (i) => route.loop !== undefined && (route.loop === i || (Array.isArray(route.loop) && route.loop.includes(i)));
    for (let i = 0; i < 4; i++) {
      const want = list[i] && list[i].alg && FX_FACTORY[list[i].alg] ? list[i] : null;
      const s = slots[i];
      if (!want) { s.alg = null; s.k = null; continue; }
      if (s.alg !== want.alg) { s.alg = want.alg; s.k = FX_FACTORY[want.alg](sr); s.lv = want.level; }
      s.level = want.level;
      s.k.set(want.p, send || inLoop(i));
    }
  }

  function run(node, l, r) {
    if (typeof node === 'number') {
      const s = slots[node];
      if (!s.k) { oL = l; oR = r; hit = false; return; }
      s.lv += (s.level - s.lv) * LVC;
      s.k.tick(l, r);
      oL = s.k.l * s.lv; oR = s.k.r * s.lv; hit = true;
      return;
    }
    if (node[0] === 'S') {
      let a = l, b = r, any = false;
      for (let i = 1; i < node.length; i++) { run(node[i], a, b); a = oL; b = oR; any = any || hit; }
      oL = a; oR = b; hit = any;
      return;
    }
    let sa = 0, sb = 0, count = 0;
    for (let i = 1; i < node.length; i++) { run(node[i], l, r); if (hit) { sa += oL; sb += oR; count++; } }
    if (!count) { oL = l; oR = r; hit = false; return; }
    // Side by side on an insert, each branch carries its own dry sound, so they are averaged; on a send they are wet only and add.
    oL = send ? sa : sa / count; oR = send ? sb : sb / count; hit = true;
  }

  function process(inp, outL, outR, n) {
    for (let s = 0; s < n; s++) {
      const x = inp[s];
      wet += (wetT - wet) * LVC;
      if (wet < 1e-4 && wetT === 0) { outL[s] = x; outR[s] = x; continue; }
      let yl, yr, any;
      if (route.main !== undefined) {
        fbL = fbLine[0].read(FB_DELAY); fbR = fbLine[1].read(FB_DELAY);
        run(route.main, x + fbL, x + fbR);
        yl = oL; yr = oR; any = hit;
        run(route.loop, yl, yr);
        let a = 0, b = 0;
        if (hit) { fbDc[0] += (oL - fbDc[0]) * 0.002; fbDc[1] += (oR - fbDc[1]) * 0.002; a = softClip((oL - fbDc[0]) * 0.8); b = softClip((oR - fbDc[1]) * 0.8); }
        fbLine[0].push(a); fbLine[1].push(b);
      } else {
        run(route, x, x);
        yl = oL; yr = oR; any = hit;
      }
      let l = x, r = x;
      if (any) { if (send) { l = x + yl; r = x + yr; } else { l = yl; r = yr; } }
      // A kernel that has blown up (it should not) is rebuilt rather than left to silence the synth.
      if (!(Math.abs(l) < 1e4 && Math.abs(r) < 1e4)) { l = x; r = x; broken = true; fbL = 0; fbR = 0; }
      outL[s] = x + (l - x) * wet;
      outR[s] = x + (r - x) * wet;
    }
    if (broken) { broken = false; slots.forEach((sl) => { sl.alg = null; sl.k = null; }); set(last); }
  }

  return { set, process };
}
