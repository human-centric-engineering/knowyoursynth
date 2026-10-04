/**
 * Outboard effects rack: plain Web Audio nodes after the synth voice (drive → chorus → delay → reverb).
 * It is not part of any synth modelled here; it is the pedals you might put after one.
 * Every switch crossfades gains, so turning a unit on or off never clicks.
 */

export const FX_DEFAULT = {
  on: false,
  drive: { on: false, amount: 0.35, tone: 0.6 },
  chorus: { on: true, rate: 0.35, depth: 0.5 },
  delay: { on: true, time: 0.36, feedback: 0.35, mix: 0.25 },
  reverb: { on: true, size: 0.5, mix: 0.25 },
};

/** Merge a stored or partial setting over the defaults, dropping anything that is not a number or boolean. */
export function normalizeFx(v) {
  const out = { on: typeof v?.on === 'boolean' ? v.on : FX_DEFAULT.on };
  for (const unit of ['drive', 'chorus', 'delay', 'reverb']) {
    out[unit] = { ...FX_DEFAULT[unit] };
    const src = v && typeof v[unit] === 'object' ? v[unit] : {};
    for (const [k, d] of Object.entries(FX_DEFAULT[unit])) {
      if (typeof d === 'boolean' && typeof src[k] === 'boolean') out[unit][k] = src[k];
      if (typeof d === 'number' && Number.isFinite(src[k])) out[unit][k] = Math.max(0, Math.min(1, src[k]));
    }
  }
  return out;
}

const RAMP = 0.03;
const glide = (param, v, ctx) => param.setTargetAtTime(v, ctx.currentTime, RAMP);

function driveCurve(k) {
  const n = 2048, c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}

/** Unity gain below 0.7, then a soft knee that never passes 1. Covers inputs up to ±2 (the node before it halves the signal). */
function limitCurve() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return c;
}

function impulse(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

/** One insert with a dry path and a wet path; `on` crossfades between "dry only" and the unit's own balance. */
function unit(ctx) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet };
}

export function createRack(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const bypass = ctx.createGain();
  const chainOut = ctx.createGain();

  // Drive: waveshaper with a tone filter. Replaces the dry signal rather than blending with it.
  const drive = unit(ctx);
  const shaper = ctx.createWaveShaper(), tone = ctx.createBiquadFilter();
  shaper.oversample = '4x';
  tone.type = 'lowpass';
  drive.input.connect(shaper).connect(tone).connect(drive.wet);

  // Chorus: two short delays swept by one LFO in opposite directions, one per side.
  const chorus = unit(ctx);
  const lfo = ctx.createOscillator(), depthL = ctx.createGain(), depthR = ctx.createGain();
  const dL = ctx.createDelay(0.05), dR = ctx.createDelay(0.05), merge = ctx.createChannelMerger(2);
  dL.delayTime.value = 0.014; dR.delayTime.value = 0.019;
  lfo.connect(depthL).connect(dL.delayTime);
  lfo.connect(depthR).connect(dR.delayTime);
  chorus.input.connect(dL).connect(merge, 0, 0);
  chorus.input.connect(dR).connect(merge, 0, 1);
  merge.connect(chorus.wet);
  lfo.start();

  // Delay: echoes that darken as they repeat.
  const delay = unit(ctx);
  const dl = ctx.createDelay(2), fb = ctx.createGain(), damp = ctx.createBiquadFilter();
  damp.type = 'lowpass'; damp.frequency.value = 4200;
  delay.input.connect(dl);
  dl.connect(damp).connect(fb).connect(dl);
  damp.connect(delay.wet);

  // Reverb: convolution with a generated decaying-noise room.
  const reverb = unit(ctx);
  const conv = ctx.createConvolver(), revIn = ctx.createGain();
  reverb.input.connect(revIn).connect(conv).connect(reverb.wet);

  // A soft limiter at the end so feedback and long tails cannot clip the output. (A DynamicsCompressor
  // would add its own make-up gain and make "rack on, everything off" louder than the rack switched off.)
  const halve = ctx.createGain(), limit = ctx.createWaveShaper();
  halve.gain.value = 0.5;
  limit.curve = limitCurve();
  limit.oversample = '2x';

  input.connect(bypass).connect(output);
  input.connect(drive.input);
  drive.output.connect(chorus.input);
  chorus.output.connect(delay.input);
  delay.output.connect(reverb.input);
  reverb.output.connect(halve).connect(limit).connect(chainOut).connect(output);

  let revSize = -1, driveK = -1;
  const set = (raw) => {
    const f = normalizeFx(raw);
    glide(bypass.gain, f.on ? 0 : 1, ctx);
    glide(chainOut.gain, f.on ? 1 : 0, ctx);

    const k = 1 + f.drive.amount * f.drive.amount * 24;
    if (Math.abs(k - driveK) > 0.05) { shaper.curve = driveCurve(k); driveK = k; }
    glide(tone.frequency, 700 * Math.pow(20, f.drive.tone), ctx);
    glide(drive.dry.gain, f.drive.on ? 0 : 1, ctx);
    glide(drive.wet.gain, f.drive.on ? 0.5 : 0, ctx); // clipping raises the level; this brings it back near the dry signal

    glide(lfo.frequency, 0.1 * Math.pow(60, f.chorus.rate), ctx);
    glide(depthL.gain, 0.0005 + f.chorus.depth * 0.006, ctx);
    glide(depthR.gain, -(0.0005 + f.chorus.depth * 0.006), ctx);
    glide(chorus.dry.gain, f.chorus.on ? 0.75 : 1, ctx);
    glide(chorus.wet.gain, f.chorus.on ? 0.65 : 0, ctx);

    glide(dl.delayTime, 0.05 + f.delay.time * 0.95, ctx);
    glide(fb.gain, f.delay.feedback * 0.85, ctx);
    glide(delay.dry.gain, 1, ctx);
    glide(delay.wet.gain, f.delay.on ? f.delay.mix * 0.9 : 0, ctx);

    const secs = 0.6 + f.reverb.size * 4.4;
    if (Math.abs(secs - revSize) > 0.05) { conv.buffer = impulse(ctx, secs); revSize = secs; }
    glide(reverb.dry.gain, f.reverb.on ? 1 - f.reverb.mix * 0.35 : 1, ctx);
    glide(reverb.wet.gain, f.reverb.on ? f.reverb.mix * 0.9 : 0, ctx);
  };

  set(FX_DEFAULT);
  return { input, output, set };
}
