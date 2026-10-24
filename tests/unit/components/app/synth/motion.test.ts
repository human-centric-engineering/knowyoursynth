// @vitest-environment happy-dom

/**
 * Whether the panel glides a new patch on: not with reduced motion, and yes where the browser cannot say. The module is
 * mocked off for every test (`tests/setup.ts`); this file takes the real one.
 *
 * @see components/app/synth/motion.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.unmock('@/components/app/synth/motion');

const { glideMotion } = await import('@/components/app/synth/motion');

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

const prefers = (reduce: boolean) =>
  vi.fn((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia;

describe('glideMotion', () => {
  it('glides when motion is not reduced', () => {
    window.matchMedia = prefers(false);
    expect(glideMotion()).toBe(true);
  });

  it('does not glide with reduced motion', () => {
    window.matchMedia = prefers(true);
    expect(glideMotion()).toBe(false);
  });

  it('glides where the browser has no matchMedia', () => {
    // @ts-expect-error -- an older browser, or a test environment, without it
    window.matchMedia = undefined;
    expect(glideMotion()).toBe(true);
  });
});
