/**
 * The panel carried between family members across a navigation (`f-synth-families` t-320).
 *
 * @see components/app/synth/family-carry.ts
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CARRY_TTL_MS,
  leaveCarry,
  releaseCarry,
  takeCarry,
} from '@/components/app/synth/family-carry';

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

  it('is still there for the member arriving in the commit that unmounts the page it was made on', () => {
    vi.useFakeTimers();
    leaveCarry(carry);
    releaseCarry();
    expect(takeCarry('tb-303')).toMatchObject({ from: 'td-3' });
  });

  it('is let go once the page it was made on has gone and nothing took it', () => {
    vi.useFakeTimers();
    leaveCarry(carry);
    releaseCarry();
    vi.runAllTimers();
    expect(takeCarry('tb-303')).toBeNull();
  });

  it('keeps a carry left after the last one was let go', () => {
    vi.useFakeTimers();
    leaveCarry(carry);
    releaseCarry();
    leaveCarry({ ...carry, values: { 'filter.res': 3 } });
    vi.runAllTimers();
    expect(takeCarry('tb-303')).toMatchObject({ values: { 'filter.res': 3 } });
  });
});
