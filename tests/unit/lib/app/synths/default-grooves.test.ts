/**
 * The Default patch grooves' bar notation (`f-livelier-patterns` t-303): what each token plays, and what it refuses.
 * What the Model D's groove plays as a Default patch is tested with the patch (`default-patch.test.ts`).
 *
 * @see lib/app/synths/default-grooves.ts
 */
import { describe, expect, it } from 'vitest';
import { bar, defaultGrooveOf } from '@/lib/app/synths/default-grooves';

describe('a groove bar', () => {
  it('plays a note a step, held for as many as it says, each stopping a little short; a dot is a rest', () => {
    const steps = bar('A3 . C#4:2 . Bb3 . . . . . . . . . . E5:4');
    expect(steps).toHaveLength(16);
    expect(steps[0]).toEqual({ on: true, notes: [{ note: 57, gate: 0.7 }] });
    expect(steps[1]).toEqual({ on: true, notes: [] });
    expect(steps[2].notes).toEqual([{ note: 61, gate: 1.7 }]);
    expect(steps[4].notes[0].note).toBe(58);
    expect(steps[15].notes).toEqual([{ note: 76, gate: 3.7 }]);
  });

  it('refuses a bar that is not sixteen steps, and a token that is not a note', () => {
    expect(() => bar('A3 . .')).toThrow(/16 steps, not 3/);
    expect(() => bar(`H3 ${'. '.repeat(15)}`)).toThrow(/not a note: H3/);
  });
});

describe('defaultGrooveOf', () => {
  it('has the Model D’s, and none for a synth that plays the scale', () => {
    expect(defaultGrooveOf('model-d')?.pattern.parts).toHaveLength(2);
    expect(defaultGrooveOf('pro-1')).toBeNull();
  });
});
