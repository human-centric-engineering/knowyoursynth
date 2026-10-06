/**
 * Scope-read tests: pitch detection (autocorrelation), the stretch-to-draw grab, peak/rms/centroid levels, and
 * AnalyserNode buffer sizing. Pure DSP, no mocks — every assertion is checked against a synthetic waveform of
 * known period or a hand-computed level, not against whatever the function happens to return.
 *
 * @see lib/app/synths/lib/scope-read.ts
 */
import { describe, expect, it } from 'vitest';
import { buffers, detectPeriod, grab, readLevels } from '@/lib/app/synths/lib/scope-read';

const SR = 24000;

/** A pure sine wave at `freq` Hz, `length` samples at `sr`. */
function sineWave(freq: number, length: number, sr = SR): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

describe('detectPeriod', () => {
  it('finds the period (in samples) of a synthetic sine wave, within the half-rate decimation error', () => {
    const freq = 440;
    const wave = sineWave(freq, 4096);
    const dec = new Float32Array(1024);

    const period = detectPeriod(wave, dec, SR);
    const expected = SR / freq; // ≈ 54.5 samples

    expect(period).toBeGreaterThan(0);
    expect(Math.abs(period - expected) / expected).toBeLessThan(0.05);
  });

  it('tracks frequency: a note an octave down measures about twice the period', () => {
    const dec = new Float32Array(1024);
    const low = detectPeriod(sineWave(110, 4096), dec, SR);
    const high = detectPeriod(sineWave(220, 4096), new Float32Array(1024), SR);

    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
    expect(low / high).toBeCloseTo(2, 0.5);
  });

  it('returns 0 for silence — the decimated RMS never clears the floor', () => {
    const wave = new Float32Array(4096); // all zero
    const dec = new Float32Array(1024);

    expect(detectPeriod(wave, dec, SR)).toBe(0);
  });

  it('returns 0 when a near-silent hiss leaves the correlation below the acceptance threshold', () => {
    // Tiny-amplitude noise: loud enough to clear the RMS floor (0.004) but with no repeating structure, so no
    // lag's correlation reaches the 0.3 acceptance bar.
    const wave = new Float32Array(4096);
    let seed = 7;
    for (let i = 0; i < wave.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      wave[i] = ((seed / 0x7fffffff) * 2 - 1) * 0.02;
    }
    const dec = new Float32Array(1024);

    expect(detectPeriod(wave, dec, SR)).toBe(0);
  });

  it('returns 0 when the lag range collapses (too few decimated samples to search)', () => {
    const wave = sineWave(440, 64);
    const dec = new Float32Array(5); // maxLag = min(4, ~316) = 4, which is <= minLag(5) + 2

    expect(detectPeriod(wave, dec, SR)).toBe(0);
  });
});

describe('grab', () => {
  it('starts at a rising zero crossing and reports the span as milliseconds of audio', () => {
    const freq = 440;
    const period = SR / freq;
    const wave = sineWave(freq, 4096);
    const into = new Float32Array(64);

    const ms = grab(wave, SR, period, 2, into);

    const expectedSpan = Math.round(period * 2);
    expect(ms).toBeCloseTo((expectedSpan / SR) * 1000, 3);
    // the first drawn sample sits right at (or just after) a rising zero crossing: small and non-negative
    expect(into[0]).toBeGreaterThanOrEqual(0);
    expect(into[0]).toBeLessThan(0.15);
    // and the trace is rising away from it
    expect(into[1]).toBeGreaterThan(into[0]);
  });

  it('falls back to a capped span when no period is given (silence)', () => {
    const wave = sineWave(440, 4096);
    const into = new Float32Array(64);

    const ms = grab(wave, SR, 0, 2, into);

    const expectedSpan = Math.min(1024, wave.length - 1);
    expect(ms).toBeCloseTo((expectedSpan / SR) * 1000, 3);
  });

  it('resamples into every slot of `into`, interpolating between source samples', () => {
    // A ramp, so linear interpolation between integer sample positions is easy to check by hand.
    const ramp = new Float32Array(100);
    for (let i = 0; i < ramp.length; i++) ramp[i] = i;
    const into = new Float32Array(5);

    // No zero crossing exists in a pure ramp, so `start` stays 0; span is capped at `min(1024, max)`.
    grab(ramp, SR, 0, 1, into);

    // into[k] = start + (k / (n-1)) * span, i.e. a linear resample of the identity ramp — so into should itself
    // be a non-decreasing ramp.
    for (let k = 1; k < into.length; k++) expect(into[k]).toBeGreaterThanOrEqual(into[k - 1]);
    expect(into[0]).toBeCloseTo(0, 5);
  });
});

describe('readLevels', () => {
  it('computes peak, rms and spectral centroid from known wave and spectrum buffers', () => {
    const wave = new Float32Array([0, 1, -1, 0.5]);
    // All spectral energy in bin 1 (of 4), so the centroid lands exactly on that bin's frequency.
    const spec = new Uint8Array([0, 255, 0, 0]);
    const sr = 1000;

    const { peak, rms, centroid } = readLevels(wave, spec, sr);

    expect(peak).toBe(1);
    expect(rms).toBeCloseTo(Math.sqrt((0 + 1 + 1 + 0.25) / 4), 6);
    // bin 1 of 4 at sr=1000 → (1 * 1000) / (4 * 2) = 125 Hz
    expect(centroid).toBeCloseTo(125, 6);
  });

  it('reports centroid 0 when the spectrum carries no energy worth weighting', () => {
    const wave = new Float32Array([0.1, -0.1, 0.1]);
    const spec = new Uint8Array([0, 0, 0, 0]);

    const { centroid } = readLevels(wave, spec, 1000);

    expect(centroid).toBe(0);
  });

  it('weights higher bins towards a higher centroid', () => {
    const wave = new Float32Array([0, 0]);
    const sr = 1000;
    const low = readLevels(wave, new Uint8Array([0, 255, 0, 0]), sr).centroid;
    const high = readLevels(wave, new Uint8Array([0, 0, 0, 255]), sr).centroid;

    expect(high).toBeGreaterThan(low);
  });
});

describe('buffers', () => {
  it('sizes wave and spec to the analyser, and dec to a quarter of fftSize', () => {
    const b = buffers({ fftSize: 2048, frequencyBinCount: 1024 });

    expect(b.wave).toBeInstanceOf(Float32Array);
    expect(b.wave.length).toBe(2048);
    expect(b.spec).toBeInstanceOf(Uint8Array);
    expect(b.spec.length).toBe(1024);
    expect(b.dec.length).toBe(512); // min(1024, 2048 >> 2)
  });

  it('caps dec at 1024 for a large fftSize', () => {
    const b = buffers({ fftSize: 8192, frequencyBinCount: 4096 });

    expect(b.dec.length).toBe(1024); // 8192 >> 2 = 2048, capped at 1024
  });
});
