/**
 * Mapping helpers tests
 *
 * @see lib/app/synths/lib/maps.ts
 */
import { describe, expect, it } from 'vitest';
import {
  acidPhrase,
  annotate,
  clamp,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  linMap,
  pwl,
} from '@/lib/app/synths/lib/maps';

describe('clamp / expMap / linMap / level10', () => {
  it('clamps to the range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it('expMap gives equal ratios per step and clamps t', () => {
    expect(expMap(0, 20, 20000)).toBe(20);
    expect(expMap(1, 20, 20000)).toBeCloseTo(20000);
    expect(expMap(0.5, 20, 20000)).toBeCloseTo(Math.sqrt(20 * 20000));
    expect(expMap(2, 20, 20000)).toBeCloseTo(20000);
  });

  it('linMap is linear and clamps t', () => {
    expect(linMap(0.25, 0, 8)).toBe(2);
    expect(linMap(-1, 0, 8)).toBe(0);
  });

  it('level10 tapers a 0–10 knob and scales by max', () => {
    expect(level10(10)).toBe(1);
    expect(level10(0)).toBe(0);
    expect(level10(5)).toBeCloseTo(Math.pow(0.5, 1.7));
    expect(level10(20, 2)).toBe(2);
  });
});

describe('pwl', () => {
  const pts: [number, number][] = [
    [0, 1],
    [2, 4],
    [4, 16],
  ];

  it('holds the end values outside the points', () => {
    expect(pwl(-1, pts)).toBe(1);
    expect(pwl(9, pts)).toBe(16);
  });

  it('interpolates linearly between points', () => {
    expect(pwl(1, pts)).toBe(2.5);
    expect(pwl(3, pts)).toBe(10);
  });

  it('interpolates in the log domain with log = true', () => {
    expect(pwl(3, pts, true)).toBeCloseTo(8);
  });
});

describe('formatters', () => {
  it('fmtTime picks ms, rounded ms or seconds', () => {
    expect(fmtTime(0.0123)).toBe('12 ms');
    expect(fmtTime(0.456)).toBe('460 ms');
    expect(fmtTime(2.345)).toBe('2.3 s');
    expect(fmtTime(12.6)).toBe('13 s');
  });

  it('fmtHz picks Hz with decimals, whole Hz or kHz', () => {
    expect(fmtHz(5.123)).toBe('5.12 Hz');
    expect(fmtHz(440.4)).toBe('440 Hz');
    expect(fmtHz(2500)).toBe('2.5 kHz');
    expect(fmtHz(12500)).toBe('13 kHz');
  });

  it('fmtSemi signs and rounds to a tenth', () => {
    expect(fmtSemi(1.26)).toBe('+1.3 st');
    expect(fmtSemi(-2)).toBe('-2 st');
    expect(fmtSemi(0)).toBe('0 st');
  });
});

describe('annotate', () => {
  it('attaches each note to the item with that id, across lists', () => {
    const controls: { id: string; unusual?: string }[] = [{ id: 'a' }, { id: 'b' }];
    const jacks: { id: string; unusual?: string }[] = [{ id: 'j' }];

    annotate({ b: 'B note', j: 'J note' }, controls, jacks);

    expect(controls[0].unusual).toBeUndefined();
    expect(controls[1].unusual).toBe('B note');
    expect(jacks[0].unusual).toBe('J note');
  });

  it('throws on a note for an id that matches nothing', () => {
    expect(() => annotate({ typo: 'x' }, [{ id: 'a' }])).toThrow(
      'unusual note for unknown id "typo"'
    );
  });
});

describe('acidPhrase', () => {
  it('turns notes, rests and accents into riff steps', () => {
    const p = acidPhrase(120, 'C2 . D#3a .');

    expect(p.bpm).toBe(120);
    expect(p.loop).toBe(true);
    expect(p.steps).toHaveLength(2);
    // C2 = MIDI 36 at beat 0, velocity 0.8; held 0.25 × gate 0.55
    expect(p.steps[0][0]).toBe(0);
    expect(p.steps[0][1]).toBe(36);
    expect(p.steps[0][2]).toBeCloseTo(0.1375);
    expect(p.steps[0][3]).toBe(0.8);
    // D#3 = 51 at beat 0.5, accented
    expect(p.steps[1].slice(0, 2)).toEqual([0.5, 51]);
    expect(p.steps[1][3]).toBe(1);
  });

  it('extends a note through a tie and holds a slide over the next step', () => {
    const p = acidPhrase(100, 'C2s - C3 .');

    // slide: held 0.28; tied through step 1 → b(0.25) + 0.28 − 0
    expect(p.steps[0][2]).toBeCloseTo(0.53);
    expect(p.steps[1][1]).toBe(48);
  });

  it('does not let a note run past the end of the pattern', () => {
    const p = acidPhrase(100, 'C2s');

    expect(p.steps[0][2]).toBeCloseTo(0.24);
  });

  it('ignores a tie after a rest', () => {
    const p = acidPhrase(100, '. - C2');

    expect(p.steps).toHaveLength(1);
    expect(p.steps[0][0]).toBe(0.5);
  });

  it('throws on a token it cannot read', () => {
    expect(() => acidPhrase(100, 'C2 H9')).toThrow('acidPhrase: bad step "H9"');
  });
});
