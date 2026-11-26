/**
 * The panel carried between family members across a navigation (`f-synth-families` t-320).
 *
 * @see components/app/synth/family-carry.ts
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CARRY_TTL_MS, leaveCarry, takeCarry } from '@/components/app/synth/family-carry';

const carry = {
  from: 'td-3',
  to: 'tb-303',
  fromName: 'TD-3',
  values: { 'filter.res': 7 },
  cables: [],
  dropped: [],
  changed: [],
};

afterEach(() => {
  vi.useRealTimers();
  takeCarry('');
});

describe('family carry', () => {
  it('is taken once, by the member it was made for', () => {
    leaveCarry(carry);
    expect(takeCarry('tb-303')).toMatchObject({ from: 'td-3', values: { 'filter.res': 7 } });
    expect(takeCarry('tb-303')).toBeNull();
  });

  it('is discarded by another member arriving first', () => {
    leaveCarry(carry);
    expect(takeCarry('model-d')).toBeNull();
    expect(takeCarry('tb-303')).toBeNull();
  });

  it('is stale once it has waited past its time', () => {
    vi.useFakeTimers();
    leaveCarry(carry);
    vi.advanceTimersByTime(CARRY_TTL_MS + 1);
    expect(takeCarry('tb-303')).toBeNull();
  });
});
