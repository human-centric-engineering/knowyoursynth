/**
 * Sound-map probe tests: the seeded gesture renders, the band features and their distance, and a probe session's
 * answers to nudges, far moves and jobs that bring their own baseline.
 *
 * @see lib/app/synths/audio/probe.ts
 */

import { describe, it, expect } from 'vitest';

import {
  createProbe,
  distance,
  features,
  loudness,
  PROBE_SR,
  PROBE_WORKER_URL,
  renderGesture,
  renderNote,
  spectrumAt,
} from '@/lib/app/synths/audio/probe';
import { monoParams, rms, sameSamples } from '@/tests/unit/lib/app/synths/audio/render';

const NOTES = [57, 64];

describe('renderGesture', () => {
  it('plays the two-note gesture identically every time and puts Math.random back', () => {
    const before = Math.random;
    const a = renderGesture(monoParams(), NOTES);
    const b = renderGesture(monoParams(), NOTES);
    expect(Math.random).toBe(before);
    expect(a.length).toBe(Math.round(0.84 * PROBE_SR));
    expect(sameSamples(a, b)).toBe(true);
    expect(rms(a)).toBeGreaterThan(0.05);
  });

  it('the short gesture is about half as long, and a stereo synth renders both sides end to end', () => {
    expect(renderGesture(monoParams(), NOTES, true).length).toBe(
      Math.round(0.84 * 0.53 * PROBE_SR)
    );
    const stereo = renderGesture(
      monoParams({ poly: { voices: 2, stack: 1, mono: false }, chorus: { on: true, mode: 1 } }),
      NOTES
    );
    expect(stereo.length).toBe(2 * Math.round(0.84 * PROBE_SR));
  });

  it('puts Math.random back even when the render throws', () => {
    const before = Math.random;
    const broken = monoParams();
    // @ts-expect-error -- a voice with no filter throws inside the render
    delete broken.filter;
    expect(() => renderGesture(broken, NOTES)).toThrow();
    expect(Math.random).toBe(before);
  });
});

describe('renderNote', () => {
  it('holds one note for the given time, repeatably', () => {
    const a = renderNote(monoParams(), 60, 0.1);
    expect(a.length).toBe(Math.round(0.1 * PROBE_SR));
    expect(sameSamples(a, renderNote(monoParams(), 60, 0.1))).toBe(true);
    expect(rms(a)).toBeGreaterThan(0.05);
  });

  it('puts Math.random back even when the render throws', () => {
    const before = Math.random;
    const broken = monoParams();
    // @ts-expect-error -- a voice with no filter throws inside the render
    delete broken.filter;
    expect(() => renderNote(broken, 60, 0.05)).toThrow();
    expect(Math.random).toBe(before);
  });
});

describe('features, spectrum, distance and loudness', () => {
  const base = renderGesture(monoParams(), NOTES);
  const darker = renderGesture(
    monoParams({
      filter: {
        type: 'ladder',
        mode: 'lp',
        cutoff: 300,
        res: 0.3,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 0,
      },
    }),
    NOTES
  );

  it('measures log band energy frame by frame', () => {
    const f = features(base);
    expect(f.length % 1).toBe(0);
    expect(f.every((x) => Number.isFinite(x))).toBe(true);
    // a short buffer still gives one frame
    expect(features(new Float32Array(100)).every((x) => x === 10 * Math.log10(1e-7))).toBe(true);
  });

  it('a spectrum peaks near the played note and is floored where there is nothing', () => {
    const sine = new Float32Array(4096).map((_, i) => Math.sin((2 * Math.PI * 750 * i) / PROBE_SR));
    const s = spectrumAt(sine, 0);
    expect(s.length).toBe(1024);
    let peak = 0;
    for (let i = 1; i < s.length; i++) if (s[i] > s[peak]) peak = i;
    expect(peak).toBe(Math.round((750 * 2048) / PROBE_SR));
    expect(spectrumAt(new Float32Array(10), 0).every((x) => x === 10 * Math.log10(1e-7))).toBe(
      true
    );
  });

  it('distance is zero for the same sound and grows for a different one', () => {
    const fa = features(base);
    const { peak, norm } = loudness(fa);
    expect(distance(fa, fa, peak, norm)).toBe(0);
    expect(distance(fa, features(darker), peak, norm)).toBeGreaterThan(0.1);
  });

  it('loudness finds the loudest band and never lets the audible weight fall below 2 % of the bands', () => {
    const { peak, norm } = loudness(Float32Array.from([-80, -10, -40, -200]));
    expect(peak).toBe(-10);
    expect(norm).toBeCloseTo((50 - 0) / 50 + (50 - 30) / 50, 6);
    // one loud band and 999 far below it: the weight would be 1, the floor makes it 2 % of 1,000 bands
    const sparse = new Float32Array(1000).fill(-200);
    sparse[0] = -10;
    expect(loudness(sparse).norm).toBe(20);
  });
});

describe('createProbe', () => {
  const baseline = monoParams();
  const darker = monoParams({
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 300,
      res: 0.3,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
  });

  it('reports the loudness of the baseline gesture', () => {
    expect(createProbe(baseline, NOTES).rms).toBeGreaterThan(0.05);
  });

  it('a nudge that changes the sound is live, with a distance; one that does not is skipped', () => {
    const probe = createProbe(baseline, NOTES);
    const r = probe.measure({ key: 'filter.cutoff', nudges: [monoParams(), darker] });
    expect(r).toMatchObject({ key: 'filter.cutoff', live: true, far: 0 });
    expect(r.d).toBeGreaterThan(0.1);
  });

  it('with no audible nudge it tries the far moves, and stops at the first audible one', () => {
    const probe = createProbe(baseline, NOTES);
    const r = probe.measure({
      key: 'x',
      nudges: [monoParams()],
      far: [monoParams(), darker, darker],
    });
    expect(r.live).toBe(true);
    expect(r.d).toBe(0);
    expect(r.far).toBeGreaterThan(0.1);
    const dead = probe.measure({ key: 'y', nudges: [monoParams()], far: [monoParams()] });
    expect(dead).toEqual({ key: 'y', d: 0, far: 0, live: false });
    expect(probe.measure({ key: 'z' })).toEqual({ key: 'z', d: 0, far: 0, live: false });
  });

  it('a job with its own baseline only answers yes or no, and reuses that baseline by key', () => {
    const probe = createProbe(baseline, NOTES);
    const job = { key: 'a|b', base: darker, baseKey: 'b', far: [baseline] };
    expect(probe.measure(job)).toEqual({ key: 'a|b', live: true });
    expect(probe.measure({ ...job, far: [darker] })).toEqual({ key: 'a|b', live: false });
  });

  // A cached base is answered from the cache whatever `base` the job carries, so asking for key b0 with a loud
  // base tells cached (the quiet render: differs from loud, live) from re-rendered (loud vs loud, not live).
  // 66 short renders: slow under a loaded machine, hence the explicit timeout.
  it('forgets cached baselines once it holds more than 64', { timeout: 120_000 }, () => {
    const probe = createProbe(baseline, NOTES);
    const quiet = monoParams({ volume: 0 });
    const asLoud = { key: 'again', base: baseline, baseKey: 'b0', far: [baseline] };
    probe.measure({ key: 'k0', base: quiet, baseKey: 'b0', far: [quiet] });
    expect(probe.measure(asLoud).live).toBe(true); // still cached: the quiet render answered
    for (let i = 1; i < 66; i++)
      probe.measure({ key: `k${i}`, base: quiet, baseKey: `b${i}`, far: [quiet] });
    expect(probe.measure(asLoud).live).toBe(false); // evicted: b0 re-rendered from the loud base
  });
});

it('the probe worker is served from the bundled static file', () => {
  expect(PROBE_WORKER_URL).toBe('/worklets/kys-probe.js');
});
