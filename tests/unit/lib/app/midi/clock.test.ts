/**
 * The clock MIDI out is timed by (`f-midi-out` t-88): when an audio frame is heard, in `performance.now()` time.
 *
 * @see lib/app/midi/clock.ts
 */

import { describe, it, expect } from 'vitest';
import { audioClock, type AudioClockSource } from '@/lib/app/midi/clock';

const ctx = (over: Partial<AudioClockSource> = {}): AudioClockSource => ({
  sampleRate: 48000,
  currentTime: 2,
  ...over,
});

describe('audioClock', () => {
  it('places a frame from the output timestamp: the context time heard at a performance time', () => {
    const clock = audioClock(
      () => ctx({ getOutputTimestamp: () => ({ contextTime: 1.9, performanceTime: 5000 }) }),
      () => 4990
    );
    // Frame 96,000 is 2 s of context time, 0.1 s after the 1.9 s heard at 5,000 ms.
    expect(clock.at(96000)).toBeCloseTo(5100, 6);
    expect(clock.now()).toBe(4990);
  });

  it('falls back on the context’s latency before the output has started', () => {
    const clock = audioClock(
      () =>
        ctx({
          baseLatency: 0.01,
          outputLatency: 0.02,
          getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
        }),
      () => 1000
    );
    // Frame 96,000 is now (2 s), heard 30 ms later.
    expect(clock.at(96000)).toBeCloseTo(1030, 6);
  });

  it('takes a frame as heard now with no context yet', () => {
    expect(
      audioClock(
        () => null,
        () => 42
      ).at(123456)
    ).toBe(42);
  });
});
