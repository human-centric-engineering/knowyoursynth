/**
 * How the sequencer names what it shows (`f-step-sequencer` t-80).
 *
 * @see components/app/sequencer/labels.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CHAINS,
  CONDITIONS,
  chainLabel,
  conditionKey,
  conditionMark,
  noteName,
} from '@/components/app/sequencer/labels';
import { StepConditionSchema } from '@/lib/app/sequencer/pattern';

describe('noteName', () => {
  it('names notes as a keyboard does, 60 as C4, below C-1 too', () => {
    expect([0, 48, 60, 61, 127].map(noteName)).toEqual(['C-1', 'C3', 'C4', 'C♯4', 'G9']);
    expect(noteName(-1)).toBe('B-2');
  });
});

describe('conditions', () => {
  it('offers only conditions a pattern can hold, each with its own key that reads back to it', () => {
    const keys = CONDITIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CONDITIONS) {
      if (c.condition) expect(StepConditionSchema.safeParse(c.condition).success).toBe(true);
      expect(conditionKey(c.condition)).toBe(c.key);
    }
  });

  it('marks a step key with a short form of its condition', () => {
    expect(conditionMark(undefined)).toBeNull();
    expect(conditionMark({ t: 'ab', a: 3, b: 4 })).toBe('3:4');
    expect(
      (['first', 'notFirst', 'fill', 'notFill'] as const).map((t) => conditionMark({ t }))
    ).toEqual(['1st', '!1st', 'Fill', '!Fill']);
  });
});

describe('chains', () => {
  it('names a chain by its parts, and each offered chain by its own name', () => {
    for (const c of CHAINS) expect(chainLabel(c.chain)).toBe(c.label);
    expect(chainLabel([0, 1, 1])).toBe('A B B');
    expect(chainLabel([5])).toBe('?');
  });
});
