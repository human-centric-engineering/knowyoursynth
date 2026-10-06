/**
 * Predict tests: rendering one note offline through the (mocked) probe and reading its shape and pitch back off
 * the result, without needing sound to be on or a note held.
 *
 * `@/lib/app/synths/audio/probe` is mocked — the probe itself is ported separately — so `renderNote` and
 * `spectrumAt` are deterministic stand-ins here; the real DSP integration is `renderNote`'s own test.
 *
 * @see lib/app/synths/lib/predict.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { predict, PREDICT_NOTE } from '@/lib/app/synths/lib/predict';
import { renderNote, spectrumAt } from '@/lib/app/synths/audio/probe';
import type { EngineParams, SynthDef } from '@/lib/app/synths/contract';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

vi.mock('@/lib/app/synths/audio/probe', () => ({
  PROBE_SR: 24000,
  renderNote: vi.fn(),
  spectrumAt: vi.fn(),
}));

const SR = 24000;

/** A pure sine wave at `freq` Hz, long enough to cover every `seconds` value predict can ask for. */
function sineWave(freq: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

describe('PREDICT_NOTE', () => {
  it('names the fixed probe note (MIDI 48 = C3)', () => {
    expect(PREDICT_NOTE).toBe('C3');
  });
});

describe('predict', () => {
  it('reads frequency, peak and silence off a rendered sine wave', () => {
    const freq = 220;
    vi.mocked(renderNote).mockReturnValue(sineWave(freq, 30000));
    const fakeSpectrum = new Float32Array([1, 2, 3]);
    vi.mocked(spectrumAt).mockReturnValue(fakeSpectrum);

    const def = makeMiniD();
    const result = predict(def, def.init, [], 0);

    expect(result).not.toBeNull();
    // freq is read back from the detected period, not asserted against the mock's return value directly
    expect(Math.abs((result?.freq ?? 0) - freq) / freq).toBeLessThan(0.05);
    expect(result?.silent).toBe(false);
    expect(result?.peak).toBeGreaterThan(0.9);
    expect(result?.peak).toBeLessThanOrEqual(1.0001);
    expect(result?.binHz).toBeCloseTo(24000 / 2048, 6);
    expect(result?.wave.length).toBe(512);
    expect(result?.spec).toBe(fakeSpectrum);
  });

  it('reports silence and a zero frequency for a dead-quiet render', () => {
    vi.mocked(renderNote).mockReturnValue(new Float32Array(30000)); // all zero
    vi.mocked(spectrumAt).mockReturnValue(new Float32Array(1024));

    const def = makeMiniD();
    const result = predict(def, def.init, [], 0);

    expect(result).not.toBeNull();
    expect(result?.silent).toBe(true);
    expect(result?.peak).toBe(0);
    expect(result?.freq).toBe(0);
  });

  it('returns null when toEngine throws — the panel reports its own error', () => {
    const def = makeMiniD({
      toEngine: () => {
        throw new Error('bad panel');
      },
    });

    expect(predict(def, def.init, [], 0)).toBeNull();
    expect(renderNote).not.toHaveBeenCalled();
  });

  it('returns null when renderNote throws', () => {
    vi.mocked(renderNote).mockImplementation(() => {
      throw new Error('render failed');
    });

    const def = makeMiniD();
    expect(predict(def, def.init, [], 0)).toBeNull();
  });

  it('clamps the render length to MIN_S when the amp envelope attack is short', () => {
    vi.mocked(renderNote).mockReturnValue(sineWave(220, 30000));
    vi.mocked(spectrumAt).mockReturnValue(new Float32Array(1024));

    const def = makeMiniD();
    // env2.attack default is 0 (its minimum): vcaEnv().a is tiny, so seconds floors at MIN_S (0.34).
    predict(def, { ...def.init, 'env2.attack': 0 }, [], 0);

    const seconds = vi.mocked(renderNote).mock.calls.at(-1)?.[2];
    expect(seconds).toBeCloseTo(0.34, 5);
  });

  it('caps the render length to MAX_S when the amp envelope attack is long', () => {
    vi.mocked(renderNote).mockReturnValue(sineWave(220, 30000));
    vi.mocked(spectrumAt).mockReturnValue(new Float32Array(1024));

    const def = makeMiniD();
    // env2.attack at its maximum (10) maps to a 10s attack: 10 + 0.2 is clamped down to MAX_S (1.2).
    predict(def, { ...def.init, 'env2.attack': 10 }, [], 0);

    const seconds = vi.mocked(renderNote).mock.calls.at(-1)?.[2];
    expect(seconds).toBeCloseTo(1.2, 5);
  });

  it('reads no attack time when the VCA follows no envelope, and still renders at the floor length', () => {
    vi.mocked(renderNote).mockReturnValue(sineWave(220, 30000));
    vi.mocked(spectrumAt).mockReturnValue(new Float32Array(1024));

    const base = makeMiniD();
    const def: SynthDef = {
      ...base,
      toEngine: (v, ctx) => {
        const p: EngineParams = base.toEngine(v, ctx);
        return { ...p, vca: { envSrc: 'none', bias: 0 } };
      },
    };

    predict(def, def.init, [], 0);

    const seconds = vi.mocked(renderNote).mock.calls.at(-1)?.[2];
    expect(seconds).toBeCloseTo(0.34, 5);
  });

  it('passes the cables-aware, wheel-stamped engine params through to renderNote', () => {
    vi.mocked(renderNote).mockReturnValue(sineWave(220, 30000));
    vi.mocked(spectrumAt).mockReturnValue(new Float32Array(1024));

    const def = makeMiniD();
    predict(def, def.init, [{ from: 'lfo.tri', to: 'cutoff.in' }], 0.6);

    const p = vi.mocked(renderNote).mock.calls.at(-1)?.[0] as EngineParams;
    expect(p.wheel).toBe(0.6);
    expect(p.cables).toEqual([{ src: 'lfoTri', dst: 'cutoff', amt: 3, add: true }]);
    expect(vi.mocked(renderNote).mock.calls.at(-1)?.[1]).toBe(48); // the fixed probe note
  });
});
