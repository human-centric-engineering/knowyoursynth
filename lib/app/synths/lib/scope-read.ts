// Reading an AnalyserNode: the pitch of what is playing, the stretch of it to draw, and its levels.
// Pure, and away from the drawing so it can be checked on its own against a known waveform.
//
// Transliterated from the prototype file `src/lib/scope-read.js` (decision D3).

/** A buffer of samples (an AnalyserNode's time-domain data, or a rendered note). */
type Samples = ArrayLike<number>;

/**
 * How long one cycle of the sound is, in samples (0 = too quiet, or nothing repeating to find).
 *
 * Normalised autocorrelation on a half-rate copy, then the same test at full rate around the answer. The lag is the
 * FIRST PEAK after the correlation has fallen away, not simply the best-scoring lag: a smooth wave matches itself
 * well at very short lags too, which reads as a pitch several octaves too high, and the best score alone lands on
 * two or three cycles as readily as one.
 */
export function detectPeriod(wave: Samples, dec: Float32Array, sr: number): number {
  const n = dec.length;
  let rms = 0;
  for (let i = 0; i < n; i++) {
    const v = (wave[2 * i] + wave[2 * i + 1]) * 0.5;
    dec[i] = v;
    rms += v * v;
  }
  if (Math.sqrt(rms / n) < 0.004) return 0;
  const sr2 = sr / 2;
  const minLag = Math.max(2, Math.floor(sr2 / 2200));
  const maxLag = Math.min(n - 1, Math.ceil(sr2 / 38));
  if (maxLag <= minLag + 2) return 0;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const m = Math.min(n - lag, 384); // a fixed window, so every lag is scored on the same amount of sound
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < m; i++) {
      const a = dec[i];
      const b = dec[i + lag];
      s += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    corr[lag] = s / Math.sqrt(e1 * e2 + 1e-12);
  }
  let from = minLag;
  while (from < maxLag && corr[from] > 0.3) from++;
  let bestC = 0;
  for (let lag = from; lag <= maxLag; lag++) if (corr[lag] > bestC) bestC = corr[lag];
  if (bestC < 0.3) return 0;
  let lag = 0;
  for (let i = from + 1; i < maxLag; i++) {
    if (corr[i] >= bestC * 0.9 && corr[i] >= corr[i - 1] && corr[i] >= corr[i + 1]) {
      lag = i;
      break;
    }
  }
  if (!lag) return 0;
  return refine(wave, lag * 2);
}

/** The half-rate answer, checked against the full-rate samples either side of it and interpolated between them. */
function refine(wave: Samples, raw: number): number {
  const m = Math.min(wave.length - raw - 4, 2048);
  if (m < 64) return raw;
  const span = 3;
  const cc = new Float32Array(span * 2 + 3);
  let best = raw;
  let bestC = -2;
  for (let L = raw - span; L <= raw + span; L++) {
    if (L < 2) continue;
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < m; i++) {
      const a = wave[i];
      const b = wave[i + L];
      s += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const c = s / Math.sqrt(e1 * e2 + 1e-12);
    cc[L - raw + span + 1] = c;
    if (c > bestC) {
      bestC = c;
      best = L;
    }
  }
  const k = best - raw + span + 1;
  const y0 = cc[k - 1];
  const y1 = cc[k];
  const y2 = cc[k + 1];
  if (k > 1 && k < cc.length - 1 && y0 && y2) {
    const d = y0 - 2 * y1 + y2;
    const off = d ? (y0 - y2) / (2 * d) : 0;
    if (Math.abs(off) < 1) return best + off;
  }
  return best;
}

/** The stretch of signal to draw: `cycles` cycles from a rising zero crossing, resampled into `into`. → ms on screen. */
export function grab(
  wave: Samples,
  sr: number,
  period: number,
  cycles: number,
  into: Float32Array
): number {
  const max = wave.length - 1;
  let span = period > 0 ? Math.round(period * cycles) : 0;
  if (span < 8) span = Math.min(1024, max);
  let start = 0;
  for (let i = 1; i < Math.max(2, max - span); i++)
    if (wave[i - 1] < 0 && wave[i] >= 0) {
      start = i;
      break;
    }
  if (span > max - start) span = max - start;
  const n = into.length;
  for (let k = 0; k < n; k++) {
    const pos = start + (k / (n - 1)) * span;
    const i = Math.floor(pos);
    const a = wave[i] || 0;
    const b = i + 1 > max ? a : wave[i + 1];
    into[k] = a + (b - a) * (pos - i);
  }
  return (span / sr) * 1000;
}

/** Peak, RMS and where the energy sits on average (the "brightness"), from the same two buffers the drawing uses. */
export function readLevels(
  wave: Samples,
  spec: Samples,
  sr: number
): { peak: number; rms: number; centroid: number } {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < wave.length; i++) {
    const a = wave[i] < 0 ? -wave[i] : wave[i];
    if (a > peak) peak = a;
    sum += wave[i] * wave[i];
  }
  let num = 0;
  let den = 0;
  for (let i = 1; i < spec.length; i++) {
    const a = spec[i] / 255;
    num += a * ((i * sr) / (spec.length * 2));
    den += a;
  }
  return { peak, rms: Math.sqrt(sum / wave.length), centroid: den > 0.002 ? num / den : 0 };
}

/** The buffers one AnalyserNode is read into. */
export interface ScopeBuffers {
  wave: Float32Array;
  spec: Uint8Array;
  dec: Float32Array;
}

export const buffers = (an: Pick<AnalyserNode, 'fftSize' | 'frequencyBinCount'>): ScopeBuffers => ({
  wave: new Float32Array(an.fftSize),
  spec: new Uint8Array(an.frequencyBinCount),
  dec: new Float32Array(Math.min(1024, an.fftSize >> 2)),
});
