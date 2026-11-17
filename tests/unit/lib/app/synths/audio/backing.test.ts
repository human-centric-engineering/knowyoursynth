/**
 * What plays along with a pattern (`f-step-sequencer` t-266, t-267): the count-in, the metronome and the drum beat,
 * driven through the pattern player around a silent synth, so every sample in the output is the backing's.
 *
 * @see lib/app/synths/audio/backing.ts
 */

import { describe, it, expect } from 'vitest';

import type { Synth, SynthEvent, SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import {
  withPatterns,
  type LoopEvent,
  type PatternLoop,
} from '@/lib/app/synths/audio/pattern-player';
import {
  DRUM_VOICES,
  countInBeats,
  createBacking,
  playableBacking,
  type BackingSettings,
  type DrumHit,
} from '@/lib/app/synths/audio/backing';
import type { PhraseNote } from '@/lib/app/synths/contract';

// 8,000 samples a second at 60 BPM: a beat is 8,000 samples and a sixteenth 2,000, so a hit's sample reads off its beat.
const SR = 8000;
const BPM = 60;
const BEAT = SR;

const loop = (notes: PhraseNote[], beats = 1): PatternLoop => ({ notes, beats });
const RIM = DRUM_VOICES.indexOf('rim');

type Timed = [at: number, m: SynthMessage];

/** Plays `len` samples in 128-sample blocks around a synth that sounds nothing and logs the sample of each note. */
function play(len: number, timed: Timed[]) {
  let at = 0;
  const notes: number[] = [];
  const synth: Synth = {
    handle: (m) => {
      if (m.type === 'noteOn') notes.push(at);
    },
    process: (_out, n) => {
      at += n;
    },
  };
  const events: SynthEvent[] = [];
  const player = withPatterns(synth, SR, (e) => events.push(e));
  const queue = [...timed].sort((a, b) => a[0] - b[0]);
  let e = 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 128) {
    while (e < queue.length && queue[e][0] < i + 128) player.handle(queue[e++][1]);
    const n = Math.min(128, len - i);
    player.process(out.subarray(i, i + n), n);
  }
  const loops = events.filter((x): x is LoopEvent => x.type === 'loop');
  return { out, notes, loops };
}

/** The samples a sound starts on: the first non-zero after silence. A sine starts at zero, so this may be one late. */
function onsets(out: Float32Array): number[] {
  const found: number[] = [];
  let quiet = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 0) {
      if (quiet) found.push(i);
      quiet = false;
    } else if (!quiet) {
      // Silent for a run of samples: the sound has ended (a single zero is a sine crossing).
      let j = i;
      while (j < out.length && j < i + 8 && out[j] === 0) j++;
      if (j === i + 8) quiet = true;
    }
  }
  return found;
}

/** Each onset is within a sample of what was expected, and there are as many. */
function expectNear(got: number[], want: number[]) {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => expect(Math.abs(g - want[i])).toBeLessThanOrEqual(1));
}

const CLICK: BackingSettings = { click: true, drums: null };
const rims = (steps: number[], swing = 50): BackingSettings => ({
  click: false,
  drums: { hits: steps.map((s): DrumHit => [s, RIM, 1]), swing },
});

describe('count-in', () => {
  it('clicks four beats before the pattern, and the first loop and note wait for them', () => {
    const { out, notes, loops } = play(5 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 4 }],
    ]);
    expectNear(onsets(out), [0, BEAT, 2 * BEAT, 3 * BEAT]);
    expect(loops[0]).toMatchObject({ index: 0, start: true, frame: 4 * BEAT });
    expect(notes[0]).toBe(4 * BEAT);
  });

  it('accents the first click of the count: it rings higher', () => {
    const { out } = play(2 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 2 }],
    ]);
    const crossings = (from: number) => {
      let c = 0;
      for (let i = from + 1; i < from + 400; i++) if (out[i - 1] <= 0 !== out[i] <= 0) c++;
      return c;
    };
    expect(crossings(0)).toBeGreaterThan(crossings(BEAT));
  });

  it('plays straight away with no count-in, and is silent with nothing to play along', () => {
    const { out, notes, loops } = play(BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
    ]);
    expect(loops[0].frame).toBe(0);
    expect(notes[0]).toBe(0);
    expect(onsets(out)).toEqual([]);
  });

  it('keeps the count in beats when the tempo moves during it', () => {
    // Half a beat at 60, then 3.5 beats at 120 (4,000 samples a beat).
    const { loops } = play(4 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 4 }],
      [BEAT / 2, { type: 'tempo', bpm: 120 }],
    ]);
    const first = loops.find((l) => l.start)!;
    expect(first.frame).toBeGreaterThanOrEqual(BEAT / 2 + 3.5 * (BEAT / 2) - 128);
    expect(first.frame).toBeLessThanOrEqual(BEAT / 2 + 3.5 * (BEAT / 2) + 128);
  });

  it('does not count in a start part-way through (a MIDI Continue)', () => {
    const { loops } = play(BEAT, [
      [
        0,
        { type: 'pattern', loop: loop([[0, 60, 0.5]], 2), bpm: BPM, countIn: 4, index: 3, beat: 1 },
      ],
    ]);
    expect(loops[0]).toMatchObject({ index: 3, frame: 0 });
  });

  it('cuts the count short, and starts at once, when the run is muted during it (MIDI out only)', () => {
    const { out, loops } = play(5 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 4 }],
      [BEAT + 1000, { type: 'patternMute', muted: true }],
    ]);
    // The mute lands at the block holding sample 9,000, and loop 0 starts in that block, not a bar after the start.
    const block = Math.floor((BEAT + 1000) / 128) * 128;
    expect(loops[0]).toMatchObject({ index: 0 });
    expect(loops[0].frame).toBe(block);
    expect(onsets(out).length).toBe(2);
  });

  it('stops counting, and plays nothing, when the pattern is stopped during the count', () => {
    const { out, loops, notes } = play(5 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 4 }],
      [BEAT + 1000, { type: 'stopPattern' }],
    ]);
    expect(loops).toEqual([]);
    expect(notes).toEqual([]);
    expect(onsets(out).length).toBe(2);
  });

  it('keeps the bar from the pattern’s first step on a start part-way through', () => {
    // Joined at loop 3 of a 2-beat loop, beat 1: beat 7 from the top, so the next bar (a rim on step 0) is a beat away.
    const { out } = play(3 * BEAT, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([[0, 60, 0.5]], 2),
          bpm: BPM,
          index: 3,
          beat: 1,
          backing: rims([0]),
        },
      ],
    ]);
    expectNear(onsets(out), [BEAT]);
  });

  it('a new start during the count counts again from its top', () => {
    const { loops } = play(7 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 4 }],
      [2 * BEAT, { type: 'pattern', loop: loop([[0, 62, 0.5]]), bpm: BPM, countIn: 4 }],
    ]);
    // The second start lands at the block holding sample 16,000.
    const block = Math.floor((2 * BEAT) / 128) * 128;
    expect(loops[0].frame).toBe(block + 4 * BEAT);
  });
});

describe('metronome', () => {
  it('clicks every beat from the first step, across loops of another length', () => {
    const { out } = play(4 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]], 1.5), bpm: BPM, backing: CLICK }],
    ]);
    expectNear(onsets(out), [0, BEAT, 2 * BEAT, 3 * BEAT]);
  });

  it('follows the count-in on from beat 0', () => {
    const { out } = play(6 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, countIn: 2, backing: CLICK }],
    ]);
    expectNear(onsets(out), [0, BEAT, 2 * BEAT, 3 * BEAT, 4 * BEAT, 5 * BEAT]);
  });

  it('turns on and off while the pattern plays', () => {
    const { out } = play(5 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
      [BEAT + 100, { type: 'patternBacking', backing: CLICK }],
      [3 * BEAT + 100, { type: 'patternBacking', backing: { click: false, drums: null } }],
    ]);
    expectNear(onsets(out), [2 * BEAT, 3 * BEAT]);
  });

  it('is silent on a muted run', () => {
    const { out } = play(3 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, backing: CLICK, muted: true }],
    ]);
    expect(onsets(out)).toEqual([]);
  });

  it('ignores settings it cannot play', () => {
    const { out } = play(2 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
      [
        100,
        {
          type: 'patternBacking',
          backing: { click: 'yes', drums: null } as unknown as BackingSettings,
        },
      ],
    ]);
    expect(onsets(out)).toEqual([]);
  });
});

describe('drum beat', () => {
  it('plays its steps on the sixteenth grid, bar after bar', () => {
    const { out } = play(5 * BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, backing: rims([0, 6]) }],
    ]);
    // Steps 0 and 6 of each bar of four beats: samples 0 and 12,000, then 32,000 and 44,000.
    expectNear(onsets(out), [0, 12000, 32000]);
  });

  it('plays every second sixteenth late by the swing', () => {
    const { out } = play(BEAT, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, backing: rims([0, 1], 75) }],
    ]);
    // 75% swing: a sixteenth of 2,000 samples, the second of the pair 1,000 late.
    expectNear(onsets(out), [0, 3000]);
  });

  it('starts after the count-in, from its first step', () => {
    const { out } = play(5 * BEAT, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([[0, 60, 0.5]]),
          bpm: BPM,
          countIn: 4,
          backing: rims([2]),
        },
      ],
    ]);
    expectNear(onsets(out), [0, BEAT, 2 * BEAT, 3 * BEAT, 4 * BEAT + 4000]);
  });

  it('is changed mid-run from the next hit', () => {
    const { out } = play(BEAT * 4, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM, backing: rims([0]) }],
      [BEAT, { type: 'patternBacking', backing: rims([10]) }],
    ]);
    expectNear(onsets(out), [0, 20000]);
  });

  it('sounds every voice, at a level under a synth’s', () => {
    // At a real rate: at 8 kHz the hats' noise is mostly above what is left of the band.
    const sr = 48000;
    DRUM_VOICES.forEach((_, v) => {
      const b = createBacking(sr);
      b.set({ click: false, drums: { hits: [[0, v, 1]], swing: 50 } });
      b.start(0, 0);
      const out = new Float32Array(sr / 2);
      b.process(out, undefined, 0, out.length, 0, sr, false);
      const peak = out.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThan(1);
    });
  });

  it('chokes an open hat with a closed one', () => {
    const sr = 48000;
    const open = DRUM_VOICES.indexOf('openHat');
    const closed = DRUM_VOICES.indexOf('closedHat');
    const ring = (hits: DrumHit[]) => {
      const b = createBacking(sr);
      b.set({ click: false, drums: { hits, swing: 50 } });
      b.start(0, 0);
      const out = new Float32Array(sr / 2);
      // A sixteenth is a quarter of a beat: at 60 BPM, 12,000 samples. The closed hat is step 1, gone 0.12 s later.
      b.process(out, undefined, 0, out.length, 0, sr, false);
      return out.subarray(sr / 4 + sr / 5).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    };
    expect(ring([[0, open, 1]])).toBeGreaterThan(0);
    expect(
      ring([
        [0, open, 1],
        [1, closed, 1],
      ])
    ).toBe(0);
  });
});

describe('what the page may send', () => {
  it('takes a count-in in whole beats, up to eight', () => {
    expect(countInBeats(4)).toBe(4);
    expect(countInBeats(20)).toBe(8);
    expect(countInBeats(0)).toBe(0);
    expect(countInBeats(-2)).toBe(0);
    expect(countInBeats(1.5)).toBe(0);
    expect(countInBeats('4')).toBe(0);
  });

  it('plays settings only when every hit is on the grid, a voice it has, at a velocity 0–1', () => {
    expect(playableBacking({ click: true, drums: null })).toBe(true);
    expect(playableBacking(rims([0, 15]))).toBe(true);
    expect(playableBacking({ click: false, drums: { hits: [[16, 0, 1]], swing: 50 } })).toBe(false);
    expect(playableBacking({ click: false, drums: { hits: [[0, 9, 1]], swing: 50 } })).toBe(false);
    expect(playableBacking({ click: false, drums: { hits: [[0, 0, 2]], swing: 50 } })).toBe(false);
    expect(playableBacking({ click: false, drums: { hits: [], swing: 80 } })).toBe(false);
    expect(playableBacking({ drums: null })).toBe(false);
    expect(playableBacking(null)).toBe(false);
  });
});
