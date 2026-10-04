// What the panel WOULD sound like, without it sounding.
//
// The scope used to read the live AnalyserNode, so it showed nothing unless sound was on AND a note was being held.
// That made it useless for the thing it is for — turning a knob and seeing what that did. This renders one note
// through the real DSP voice offline instead (the same voice and the same renderer the sound map uses) and reads the
// waveform and the spectrum off the result. No audio output, no note to hold, and it works with sound switched off.
//
// It is deterministic: the renderer seeds Math.random, so the same panel gives the same samples every time. That is
// what makes the before/after comparison exact, rather than two samples of a jittering analyser.
import { PROBE_SR, renderNote, spectrumAt } from '@/audio/probe.js';
import { cablesToEngine } from '@/lib/patch.js';
import { detectPeriod, grab } from '@/lib/scope-read.js';

const TRACE_N = 512;
const FFT_N = 2048;   // the window spectrumAt expects
const NOTE = 48;      // C3 — low enough that a bass patch behaves, high enough not to be a rumble
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
export const PREDICT_NOTE = `${NAMES[NOTE % 12]}${Math.floor(NOTE / 12) - 1}`;
const MIN_S = 0.34;   // enough for a fast envelope to open and settle
const MAX_S = 1.2;    // ...and a ceiling, so a two-second pad attack does not cost two seconds of rendering

/** Panel state → EngineParams, exactly as App feeds the live voice. */
function engineOf(def, values, cables, wheel) {
  const patched = Object.fromEntries(cables.flatMap((c) => [[c.to, true], [c.from, true]]));
  const p = def.toEngine(values, { wheel, patched });
  p.cables = cablesToEngine(def, cables, values);
  p.wheel = wheel;
  return p;
}

/** The loudest FFT-sized window in the render — where the note is actually doing something. */
function loudestWindow(buf) {
  const step = 256;
  let bestOff = 0;
  let best = -1;
  for (let off = 0; off + FFT_N <= buf.length; off += step) {
    let e = 0;
    for (let i = off; i < off + FFT_N; i += 4) e += buf[i] * buf[i];
    if (e > best) { best = e; bestOff = off; }
  }
  return bestOff;
}

/**
 * Render the panel and read the shape of it.
 * → { wave: Float32Array(TRACE_N), spec, binHz, freq, peak, silent } or null if the panel cannot be turned into sound.
 */
export function predict(def, values, cables, wheel, cycles = 2) {
  let p;
  try { p = engineOf(def, values, cables, wheel); } catch { return null; } // the panel reports the error itself
  // A slow attack needs longer before there is anything to look at; a plain organ tone does not, and pays nothing.
  const env = p.vca && p.vca.envSrc ? p[p.vca.envSrc] : null;
  const seconds = Math.min(MAX_S, Math.max(MIN_S, (env ? env.a || 0 : 0) + 0.2));
  let buf;
  try { buf = renderNote(p, NOTE, seconds); } catch { return null; }

  const off = loudestWindow(buf);
  const win = buf.subarray(off, off + FFT_N);
  let peak = 0;
  for (let i = 0; i < win.length; i++) { const v = win[i] < 0 ? -win[i] : win[i]; if (v > peak) peak = v; }

  const wave = new Float32Array(TRACE_N);
  const dec = new Float32Array(FFT_N >> 1);
  const period = detectPeriod(win, dec, PROBE_SR);
  grab(win, PROBE_SR, period, cycles, wave);

  return {
    wave,
    spec: spectrumAt(buf, off),
    binHz: PROBE_SR / FFT_N,
    freq: period > 0 ? PROBE_SR / period : 0,
    peak,
    silent: peak < 1e-4, // a patch really can be silent — every level at zero — and that is worth saying
  };
}
