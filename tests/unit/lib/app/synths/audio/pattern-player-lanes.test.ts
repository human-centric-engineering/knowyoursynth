/**
 * Mod lanes in the pattern player (`f-step-sequencer` t-82): a loop's settings changes reach the synth on their
 * sample, before a note on the same sample; the panel's own settings are what it goes back to on an empty step, on
 * stop, at the end, and when an edit takes the lanes away; and a knob turned while a lane holds the synth waits.
 *
 * A stand-in synth logs the sample each message lands on. Each settings object is told apart by its `volume`.
 *
 * @see lib/app/synths/audio/pattern-player.ts
 */

import { describe, it, expect, vi } from 'vitest';

import { createSynth, type Synth, type SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import {
  withPatterns,
  type ParamChange,
  type PatternLoop,
} from '@/lib/app/synths/audio/pattern-player';
import type { PhraseNote } from '@/lib/app/synths/contract';
import {
  monoParams,
  sameSamples,
  seeded,
  type Timed,
} from '@/tests/unit/lib/app/synths/audio/render';

// 1,000 samples a second at 60 BPM: a beat is 1,000 samples.
const SR = 1000;
const BPM = 60;

const PANEL = monoParams({ volume: 0.5 });
const panel2 = monoParams({ volume: 0.55 });
const lane = (volume: number) => monoParams({ volume });

const loop = (notes: PhraseNote[], params?: ParamChange[], beats = 1): PatternLoop =>
  params ? { notes, beats, params } : { notes, beats };

/** A synth that logs, at its sample, each note (`on`/`off`) and the volume of each settings message. */
function standIn() {
  let at = 0;
  const log: [at: number, what: string][] = [];
  const synth: Synth = {
    handle: (m) => {
      if (m.type === 'params') log.push([at, `p${m.p.volume}`]);
      else if (m.type === 'noteOn') log.push([at, `on${m.n}`]);
      else if (m.type === 'noteOff') log.push([at, `off${m.n}`]);
    },
    process: (_out, n) => {
      at += n;
    },
  };
  return { synth, log };
}

/** `len` samples in 128-sample blocks; the panel's settings sent first, as the page does. */
function play(len: number, timed: Timed[]) {
  const s = standIn();
  const player = withPatterns(s.synth, SR, () => undefined);
  player.handle({ type: 'params', p: PANEL });
  const queue = [...timed].sort((a, b) => a[0] - b[0]);
  let e = 0;
  const out = new Float32Array(len);
  for (let at = 0; at < len; at += 128) {
    while (e < queue.length && queue[e][0] < at + 128) player.handle(queue[e++][1]);
    const n = Math.min(128, len - at);
    player.process(out.subarray(at, at + n), n);
  }
  return s.log;
}

const params = (log: [number, string][]) => log.filter(([, w]) => w.startsWith('p'));

describe('mod lanes in the pattern player', () => {
  it("makes a lane's change on its step's sample, before a note on the same sample", () => {
    const log = play(1000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [[0.25, 60, 0.25]],
            [
              [0, null],
              [0.25, lane(0.9)],
              [0.5, null],
            ]
          ),
          bpm: BPM,
        },
      ],
    ]);
    // The panel's settings at the start; the lane mid-block, at 250, ahead of the note there; the panel back at 500
    expect(log).toEqual([
      [0, 'p0.5'],
      [250, 'p0.9'],
      [250, 'on60'],
      [500, 'p0.5'],
      [500, 'off60'],
    ]);
  });

  it('puts the panel back when the pattern is stopped while a lane holds it', () => {
    const log = play(1000, [
      [0, { type: 'pattern', loop: loop([], [[0, lane(0.9)]]), bpm: BPM }],
      [400, { type: 'stopPattern' }],
    ]);
    expect(params(log)).toEqual([
      [0, 'p0.5'],
      [0, 'p0.9'],
      [384, 'p0.5'],
    ]);
  });

  it('puts the panel back when a pattern told to end has played out, or a panic stops it', () => {
    const ended = play(2000, [
      [0, { type: 'pattern', loop: loop([], [[0, lane(0.9)]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: null }],
    ]);
    expect(params(ended).at(-1)).toEqual([1000, 'p0.5']);
    const panicked = play(1000, [
      [0, { type: 'pattern', loop: loop([], [[0, lane(0.9)]]), bpm: BPM }],
      [300, { type: 'panic' }],
    ]);
    expect(params(panicked).at(-1)).toEqual([256, 'p0.5']);
  });

  it('holds a knob turned while a lane has the synth, and goes back to it, not the old panel', () => {
    const log = play(1000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [],
            [
              [0, lane(0.9)],
              [0.5, null],
            ]
          ),
          bpm: BPM,
        },
      ],
      [200, { type: 'params', p: panel2 }],
    ]);
    // The turn at 200 is not sent over the lane; at 500 the panel comes back as it now is
    expect(params(log)).toEqual([
      [0, 'p0.5'],
      [0, 'p0.9'],
      [500, 'p0.55'],
    ]);
  });

  it('sends a knob turned on a step no lane sets straight on', () => {
    const log = play(1000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [],
            [
              [0, null],
              [0.75, lane(0.9)],
            ]
          ),
          bpm: BPM,
        },
      ],
      [200, { type: 'params', p: panel2 }],
    ]);
    expect(params(log)).toEqual([
      [0, 'p0.5'],
      [128, 'p0.55'],
      [750, 'p0.9'],
    ]);
  });

  it('starts every loop with its own first setting, so the end of the last does not hang on', () => {
    const log = play(2000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [],
            [
              [0, null],
              [0.5, lane(0.9)],
            ]
          ),
          bpm: BPM,
        },
      ],
    ]);
    expect(params(log)).toEqual([
      [0, 'p0.5'],
      [500, 'p0.9'],
      [1000, 'p0.5'],
      [1500, 'p0.9'],
    ]);
  });

  it('takes a queued loop’s settings at the boundary', () => {
    const log = play(2000, [
      [0, { type: 'pattern', loop: loop([], [[0, null]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: loop([], [[0, lane(0.8)]]) }],
    ]);
    expect(params(log)).toEqual([
      [0, 'p0.5'],
      [1000, 'p0.8'],
    ]);
  });

  it('applies an edit’s settings at the playhead at once, and the panel when the edit has no lanes', () => {
    const changed = play(1000, [
      [0, { type: 'pattern', loop: loop([], [[0, lane(0.9)]]), bpm: BPM }],
      [
        300,
        {
          type: 'patternEdit',
          loop: loop(
            [],
            [
              [0, lane(0.7)],
              [0.75, null],
            ]
          ),
        },
      ],
    ]);
    expect(params(changed)).toEqual([
      [0, 'p0.5'],
      [0, 'p0.9'],
      [256, 'p0.7'],
      [750, 'p0.5'],
    ]);
    // A lane deleted: the edit carries no settings, and the panel is back from the playhead
    const gone = play(1000, [
      [0, { type: 'pattern', loop: loop([], [[0, lane(0.9)]]), bpm: BPM }],
      [300, { type: 'patternEdit', loop: loop([]) }],
    ]);
    expect(params(gone)).toEqual([
      [0, 'p0.5'],
      [0, 'p0.9'],
      [256, 'p0.5'],
    ]);
  });

  it('moves the changes still to come with the tempo', () => {
    const log = play(2000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [],
            [
              [0, null],
              [0.5, lane(0.9)],
            ]
          ),
          bpm: BPM,
        },
      ],
      [100, { type: 'tempo', bpm: 120 }],
    ]);
    // At 120 BPM a beat is 500 samples: half a beat is 250 in
    expect(params(log)[1]).toEqual([250, 'p0.9']);
  });

  it('refuses a loop whose settings changes are not changes', () => {
    const bad = { notes: [], beats: 1, params: [[-1, null]] } as unknown as PatternLoop;
    const log = play(500, [[0, { type: 'pattern', loop: bad, bpm: BPM }]]);
    expect(params(log)).toEqual([[0, 'p0.5']]);
  });
});

describe('mod lanes in the real synth', () => {
  /** The real synth, a note held from 0, a pattern whose lane opens the filter at `at` beats. */
  function renderReal(change: ParamChange[] | undefined): Float32Array {
    const sr = 8000;
    // The voice draws from Math.random (noise, drift): seeded, so two renders differ only where the lane does
    const spy = vi.spyOn(Math, 'random').mockImplementation(seeded(7));
    const syn = createSynth(sr, () => undefined);
    const base = monoParams({ filter: { ...monoParams().filter, cutoff: 300 } });
    syn.handle({ type: 'params', p: base });
    const msg: SynthMessage = {
      type: 'pattern',
      loop: { notes: [[0, 48, 1]], beats: 1, ...(change ? { params: change } : {}) },
      bpm: 60,
    };
    syn.handle(msg);
    const out = new Float32Array(4000);
    for (let at = 0; at < out.length; at += 128) {
      const n = Math.min(128, out.length - at);
      syn.process(out.subarray(at, at + n), n);
    }
    spy.mockRestore();
    return out;
  }

  it('sounds the same as no lane up to the step, and different from it on', () => {
    const open = monoParams({ filter: { ...monoParams().filter, cutoff: 6000 } });
    const plain = renderReal(undefined);
    const laned = renderReal([
      [0, null],
      [0.25, open],
    ]);
    // 0.25 beats at 60 BPM and 8 kHz is sample 2000
    expect(sameSamples(plain.subarray(0, 2000), laned.subarray(0, 2000))).toBe(true);
    expect(sameSamples(plain.subarray(2000), laned.subarray(2000))).toBe(false);
  });
});
