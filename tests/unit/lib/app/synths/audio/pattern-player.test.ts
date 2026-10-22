/**
 * The pattern player (`f-step-sequencer` t-79): loops swapped in on the boundary sample, edits heard from the playhead
 * on without a restart, tempo, stop, and the same on mono, poly and dual synths.
 *
 * Most tests drive the player around a stand-in synth that logs the sample each note lands on, so timing is exact. The
 * last group runs the real synth.
 *
 * @see lib/app/synths/audio/pattern-player.ts
 */

import { describe, it, expect } from 'vitest';

import { type Synth, type SynthEvent, type SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import {
  beatAt,
  createPlayhead,
  withPatterns,
  type LoopEvent,
  type PatternLoop,
} from '@/lib/app/synths/audio/pattern-player';
import type { EngineParams, PhraseNote } from '@/lib/app/synths/contract';
import {
  monoParams,
  render,
  sameSamples,
  type Timed,
} from '@/tests/unit/lib/app/synths/audio/render';

// 1,000 samples a second at 60 BPM: a beat is 1,000 samples, so a note's sample reads off its beat.
const SR = 1000;
const BPM = 60;

const loop = (notes: PhraseNote[], beats = 1): PatternLoop => ({ notes, beats });

/** A synth that does nothing but log, at the sample it arrived, every note it is sent and every other message. */
function standIn() {
  let at = 0;
  const notes: [at: number, on: boolean, n: number][] = [];
  const other: SynthMessage[] = [];
  const buffers: Float32Array[] = [];
  const synth: Synth = {
    handle: (m) => {
      if (m.type === 'noteOn') notes.push([at, true, m.n]);
      else if (m.type === 'noteOff') notes.push([at, false, m.n]);
      else other.push(m);
    },
    process: (out, n) => {
      buffers.push(out);
      at += n;
    },
  };
  return { synth, notes, other, buffers };
}

/**
 * Play `len` samples in 128-sample blocks, as the worklet does. A message goes in before the block that holds its
 * sample, so it takes effect from that block's first sample.
 */
function play(len: number, timed: Timed[]) {
  const s = standIn();
  const events: SynthEvent[] = [];
  const player = withPatterns(s.synth, SR, (e) => events.push(e));
  const queue = [...timed].sort((a, b) => a[0] - b[0]);
  let e = 0;
  const out = new Float32Array(len);
  for (let at = 0; at < len; at += 128) {
    while (e < queue.length && queue[e][0] < at + 128) player.handle(queue[e++][1]);
    const n = Math.min(128, len - at);
    player.process(out.subarray(at, at + n), n);
  }
  const loops = events.filter((x): x is LoopEvent => x.type === 'loop');
  return { ...s, events, loops, player };
}

/** Which notes are still down at the end. */
function stillHeld(notes: [number, boolean, number][]): number[] {
  const held = new Set<number>();
  for (const [, on, n] of notes) {
    if (on) held.add(n);
    else held.delete(n);
  }
  return [...held];
}

describe('playing loops', () => {
  it('plays each note on its sample, mid-block, and a loop again when nothing is queued', () => {
    const { notes, loops } = play(2100, [
      [0, { type: 'pattern', loop: loop([[0.3, 60, 0.25]]), bpm: BPM }],
    ]);
    expect(notes).toEqual([
      [300, true, 60],
      [550, false, 60],
      [1300, true, 60],
      [1550, false, 60],
    ]);
    // Each loop announces itself on its first sample
    expect(loops.map((l) => [l.index, l.start, l.frame])).toEqual([
      [0, true, 0],
      [1, true, 1000],
      [2, true, 2000],
    ]);
  });

  it('starts a queued loop on the boundary sample, with no gap and no doubled note', () => {
    const { notes, loops } = play(2000, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
      [
        200,
        {
          type: 'patternNext',
          loop: loop([
            [0, 62, 0.25],
            [0.5, 64, 0.25],
          ]),
        },
      ],
    ]);
    expect(notes).toEqual([
      [0, true, 60],
      [500, false, 60],
      [1000, true, 62],
      [1250, false, 62],
      [1500, true, 64],
      [1750, false, 64],
    ]);
    expect(loops.filter((l) => l.start).map((l) => l.frame)).toEqual([0, 1000]);
  });

  it('plays a queued loop of another length, and then repeats it', () => {
    const { notes } = play(4000, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
      [200, { type: 'patternNext', loop: loop([[0, 62, 0.5]], 1.5) }],
    ]);
    expect(notes.filter(([, on]) => on).map(([at, , n]) => [at, n])).toEqual([
      [0, 60],
      [1000, 62],
      [2500, 62],
    ]);
  });

  it('lets go of a note held over the boundary at its time in the next loop', () => {
    // A slide or a tie into the next bar: it ends 250 samples into loop 1
    const { notes } = play(2000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([
            [0, 62, 0.25],
            [0.75, 60, 0.5],
          ]),
          bpm: BPM,
        },
      ],
    ]);
    expect(notes).toEqual([
      [0, true, 62],
      [250, false, 62],
      [750, true, 60],
      [1000, true, 62],
      [1250, false, 60],
      [1250, false, 62],
      [1750, true, 60],
    ]);
  });

  it('ties a note into the next of the same pitch, letting go only when the last one ends', () => {
    // A slide into the same note: the first reaches past the second's start
    const { notes } = play(2000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop(
            [
              [0, 60, 1.25],
              [1, 60, 0.5],
            ],
            2
          ),
          bpm: BPM,
        },
      ],
    ]);
    expect(notes).toEqual([
      [0, true, 60],
      [1000, true, 60],
      [1500, false, 60],
    ]);
  });

  it("ties a note held over the boundary into the next loop's first note of the same pitch", () => {
    const { notes } = play(2900, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([
            [0, 60, 0.5],
            [0.75, 60, 0.5],
          ]),
          bpm: BPM,
        },
      ],
    ]);
    // The note from 750 ends at 1250, inside the next loop's first note (1000 to 1500): let go at 1500
    expect(notes).toEqual([
      [0, true, 60],
      [500, false, 60],
      [750, true, 60],
      [1000, true, 60],
      [1500, false, 60],
      [1750, true, 60],
      [2000, true, 60],
      [2500, false, 60],
      [2750, true, 60],
    ]);
  });

  it('lets go of a note longer than a loop where it ends, however many loops on', () => {
    const { notes } = play(3500, [
      [0, { type: 'pattern', loop: loop([[0.5, 60, 2]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: loop([[0.5, 62, 1]]) }],
      [1100, { type: 'patternNext', loop: loop([]) }],
      [2100, { type: 'patternNext', loop: null }],
    ]);
    // 60 from 500 to 2500, 62 from 1500 to 2500: both still owed when loop 2 starts
    expect(notes).toEqual([
      [500, true, 60],
      [1500, true, 62],
      [2500, false, 60],
      [2500, false, 62],
    ]);
  });

  it('ends at the boundary when told to, letting go of everything, and says so', () => {
    const { notes, events } = play(3000, [
      [0, { type: 'pattern', loop: loop([[0.5, 60, 1]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: null }],
    ]);
    expect(notes).toEqual([
      [500, true, 60],
      [1000, false, 60],
    ]);
    expect(events.filter((e) => e.type === 'patternEnd')).toHaveLength(1);
  });

  it('starts again from beat 0 when sent a new pattern while one plays', () => {
    const { notes, loops } = play(1500, [
      [0, { type: 'pattern', loop: loop([[0.6, 60, 0.2]]), bpm: BPM }],
      [384, { type: 'pattern', loop: loop([[0, 64, 0.1]]), bpm: BPM }],
    ]);
    expect(notes).toEqual([
      [384, true, 64],
      [484, false, 64],
      [1384, true, 64],
      [1484, false, 64],
    ]);
    expect(loops.filter((l) => l.start).map((l) => [l.index, l.frame])).toEqual([
      [0, 0],
      [0, 384],
      [1, 1384],
    ]);
  });
});

describe('editing while it plays', () => {
  it('changes only what is after the playhead, and the next loop plays the edit whole', () => {
    const { notes, loops } = play(2000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([
            [0, 60, 0.25],
            [0.5, 62, 0.25],
          ]),
          bpm: BPM,
        },
      ],
      // in at sample 384: step 1 has played, step 2 has not
      [
        384,
        {
          type: 'patternEdit',
          loop: loop([
            [0, 65, 0.25],
            [0.5, 67, 0.25],
          ]),
        },
      ],
    ]);
    expect(notes.filter(([, on]) => on).map(([at, , n]) => [at, n])).toEqual([
      [0, 60],
      [500, 67],
      [1000, 65],
      [1500, 67],
    ]);
    // No restart: loop 0 goes on, and the page is told where the playhead stands
    const moved = loops.find((l) => !l.start)!;
    expect(moved).toMatchObject({ index: 0, frame: 384, beat: 0.384 });
    expect(loops.filter((l) => l.start).map((l) => l.frame)).toEqual([0, 1000]);
  });

  it('still lets go of a sounding note that the edit removed', () => {
    const { notes } = play(1200, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: BPM }],
      [128, { type: 'patternEdit', loop: loop([]) }],
    ]);
    expect(notes).toEqual([
      [0, true, 60],
      [500, false, 60],
    ]);
  });

  it('does not let a note the edit brings in let go of one sounding now', () => {
    const { notes } = play(1900, [
      [0, { type: 'pattern', loop: loop([[0, 60, 1.5]], 2), bpm: BPM }],
      // In at 384. The edit's first note started before the playhead, so neither it nor its let-go at 500 comes in
      [
        384,
        {
          type: 'patternEdit',
          loop: loop(
            [
              [0, 60, 0.5],
              [0.75, 60, 1],
            ],
            2
          ),
        },
      ],
    ]);
    // The sounding note's let-go (1500) falls inside the edit's note (750 to 1750): let go at 1750
    expect(notes).toEqual([
      [0, true, 60],
      [750, true, 60],
      [1750, false, 60],
    ]);
  });

  it('drops a loop queued before the edit, which would undo it, and plays the edit again', () => {
    const { notes } = play(2000, [
      [0, { type: 'pattern', loop: loop([[0.5, 60, 0.25]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: loop([[0.5, 60, 0.25]]) }],
      [256, { type: 'patternEdit', loop: loop([[0.5, 64, 0.25]]) }],
    ]);
    expect(notes.filter(([, on]) => on).map(([at, , n]) => [at, n])).toEqual([
      [500, 64],
      [1500, 64],
    ]);
  });

  it('still ends after an edit when told to end before it', () => {
    const { notes, events } = play(2000, [
      [0, { type: 'pattern', loop: loop([[0.5, 60, 0.25]]), bpm: BPM }],
      [100, { type: 'patternNext', loop: null }],
      [256, { type: 'patternEdit', loop: loop([[0.5, 64, 0.25]]) }],
    ]);
    expect(notes.filter(([, on]) => on).map(([at, , n]) => [at, n])).toEqual([[500, 64]]);
    expect(events.filter((e) => e.type === 'patternEnd')).toHaveLength(1);
  });

  it('shortened past the playhead, turns over at once', () => {
    const { loops } = play(1500, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.25]], 2), bpm: BPM }],
      [640, { type: 'patternEdit', loop: loop([[0, 60, 0.25]], 0.5) }],
    ]);
    expect(loops.filter((l) => l.start).map((l) => l.frame)).toEqual([0, 640, 1140]);
  });

  it('ignores a loop it cannot play', () => {
    const bad = [
      { notes: [[0, 60, 0.5]], beats: 0 },
      { notes: [[0, Number.NaN, 0.5]], beats: 1 },
      { notes: 'x', beats: 1 },
      // a note missing its key or length, or lasting no time, would play nonsense or never let go
      { notes: [[60]], beats: 1 },
      { notes: [[0, null, 1]], beats: 1 },
      { notes: [[0, 60, 0]], beats: 1 },
      { notes: [[0, 60, -0.5]], beats: 1 },
      { notes: [[-1, 60, 0.5]], beats: 1 },
      { notes: [[0, 60, 0.5, 'loud']], beats: 1 },
    ] as unknown as PatternLoop[];
    const { notes, other } = play(1000, [
      ...bad.map((l): Timed => [0, { type: 'pattern', loop: l, bpm: BPM }]),
      [0, { type: 'patternEdit', loop: loop([[0, 60, 0.5]]) }],
      [0, { type: 'patternNext', loop: loop([[0, 60, 0.5]]) }],
    ]);
    expect(notes).toEqual([]);
    expect(other).toEqual([]);
  });
});

describe('tempo', () => {
  it('moves the playhead and the notes to come, as it moves a riff', () => {
    const { notes, loops } = play(1000, [
      [
        0,
        {
          type: 'pattern',
          loop: loop([
            [0, 60, 0.1],
            [0.5, 62, 0.1],
          ]),
          bpm: BPM,
        },
      ],
      // at 384 samples (0.384 beats) the tempo doubles: a beat is now 500 samples
      [384, { type: 'tempo', bpm: 120 }],
    ]);
    // 0.384 beats in is sample 192 of the new 500; beat 0.5 is sample 250, 58 samples on
    expect(notes.filter(([, on]) => on).map(([at, , n]) => [at, n])).toEqual([
      [0, 60],
      [442, 62],
      [692, 60],
      [942, 62],
    ]);
    expect(loops.find((l) => !l.start)).toMatchObject({ bpm: 120, frame: 384, beat: 0.384 });
  });

  it('still reaches the synth, for a riff', () => {
    const { other } = play(256, [[0, { type: 'tempo', bpm: 90 }]]);
    expect(other).toEqual([{ type: 'tempo', bpm: 90 }]);
  });
});

describe('stopping, and sharing the synth with riffs', () => {
  it('lets go of every note it holds when stopped, and plays nothing after', () => {
    const chord: PhraseNote[] = [
      [0, 60, 0.9],
      [0, 64, 0.9],
      [0, 67, 0.9],
    ];
    const { notes, events } = play(3000, [
      [0, { type: 'pattern', loop: loop(chord), bpm: BPM }],
      [384, { type: 'stopPattern' }],
    ]);
    expect(notes.filter(([, on]) => on)).toHaveLength(3);
    expect(notes.filter(([, on]) => !on).map(([at]) => at)).toEqual([384, 384, 384]);
    expect(stillHeld(notes)).toEqual([]);
    // Stopping is the page's own act: no patternEnd
    expect(events.some((e) => e.type === 'patternEnd')).toBe(false);
  });

  it('stops on a riff or a panic, and stops a riff when it starts', () => {
    const riff = play(1200, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.9]]), bpm: BPM }],
      [300, { type: 'phrase', phrase: { bpm: 120, loop: true, steps: [[0, 48, 0.5]] } }],
    ]);
    expect(stillHeld(riff.notes)).toEqual([]);
    expect(riff.notes.filter(([, on]) => on)).toHaveLength(1);
    expect(riff.other.map((m) => m.type)).toEqual(['stopPhrase', 'phrase']);

    const panic = play(1200, [
      [0, { type: 'pattern', loop: loop([[0, 60, 0.9]]), bpm: BPM }],
      [300, { type: 'panic' }],
    ]);
    expect(stillHeld(panic.notes)).toEqual([]);
    expect(panic.other.map((m) => m.type)).toEqual(['stopPhrase', 'panic']);
    // The engine sends a panic on suspend, so the page may not know: it is told. A riff is the page's own act
    expect(panic.events.filter((e) => e.type === 'patternEnd')).toHaveLength(1);
    expect(riff.events.some((e) => e.type === 'patternEnd')).toBe(false);
  });

  it('lets go of its notes before the synth changes between mono, poly and dual', () => {
    const { notes, other } = play(1200, [
      [0, { type: 'params', p: monoParams() }],
      [0, { type: 'pattern', loop: loop([[0, 60, 0.9]]), bpm: BPM }],
      [128, { type: 'params', p: monoParams({ volume: 0.5 }) }],
      [384, { type: 'params', p: monoParams({ poly: { voices: 4, stack: 1, mono: false } }) }],
    ]);
    // A plain params change keeps the note; the switch to poly lets it go first, then the next loop plays on poly
    expect(notes).toEqual([
      [0, true, 60],
      [384, false, 60],
      [1000, true, 60],
    ]);
    expect(other.map((m) => m.type)).toEqual(['params', 'stopPhrase', 'params', 'params']);
  });

  it('passes straight through with no pattern playing', () => {
    const s = standIn();
    const player = withPatterns(s.synth, SR, null);
    const out = new Float32Array(128);
    player.process(out, 128);
    player.handle({ type: 'noteOn', n: 60 });
    expect(s.buffers).toEqual([out]);
    expect(s.buffers[0]).toBe(out);
    expect(s.notes).toEqual([[128, true, 60]]);
  });
});

describe('beatAt', () => {
  const at: LoopEvent = {
    type: 'loop',
    index: 3,
    start: false,
    beat: 1,
    beats: 4,
    bpm: 120,
    frame: 48000,
  };
  it('reads the beat from the audio clock, held inside the loop', () => {
    expect(beatAt(at, 48000, 48000)).toBe(1);
    expect(beatAt(at, 72000, 48000)).toBe(2);
    expect(beatAt(at, 0, 48000)).toBe(0);
    expect(beatAt(at, 480000, 48000)).toBe(4);
  });
});

describe('createPlayhead', () => {
  const ev = (index: number, frame: number, beat = 0): LoopEvent => ({
    type: 'loop',
    index,
    start: beat === 0,
    beat,
    beats: 1,
    bpm: 60,
    frame,
  });

  it('reads each event only from its frame on, since events arrive before they are heard', () => {
    const playhead = createPlayhead();
    expect(playhead.at(0, SR)).toBeNull();
    playhead.push(ev(0, 0));
    playhead.push(ev(1, 1000));
    // Loop 1's start has arrived but is not heard yet: still the end of loop 0
    expect(playhead.at(900, SR)).toEqual({ index: 0, beat: 0.9, beats: 1 });
    expect(playhead.at(1100, SR)).toEqual({ index: 1, beat: 0.1, beats: 1 });
    // A tempo or edit event that moved the playhead, still to be heard
    playhead.push(ev(1, 1500, 0.25));
    expect(playhead.at(1400, SR)).toEqual({ index: 1, beat: 0.4, beats: 1 });
    expect(playhead.at(1600, SR)).toEqual({ index: 1, beat: 0.35, beats: 1 });
    playhead.clear();
    expect(playhead.at(1700, SR)).toBeNull();
  });
});

describe('on the real synth', () => {
  const poly = (): EngineParams => monoParams({ poly: { voices: 4, stack: 1, mono: false } });
  const dual = (): EngineParams => {
    const { volume: _v, ...b } = monoParams();
    return {
      ...monoParams(),
      dual: { b, assign: 'duo', split: 60, level: [0.8, 0.6], pan: [-0.5, 0.5] },
    };
  };
  const chord: PhraseNote[] = [
    [0, 60, 1.5],
    [0, 64, 1.5],
    [0.5, 67, 0.25, 1],
  ];

  for (const [name, params] of [
    ['mono', monoParams],
    ['poly', poly],
    ['dual', dual],
  ] as const) {
    it(`plays a pattern on a ${name} synth and leaves no note held when stopped`, () => {
      const r = render(params(), {
        len: 48000,
        events: [
          [0, { type: 'pattern', loop: { notes: chord, beats: 2 }, bpm: 240 }],
          [30000, { type: 'stopPattern' }],
        ],
      });
      const on = r.events.filter((e) => e.type === 'note' && e.on);
      expect(on.length).toBeGreaterThan(0);
      expect(r.events.some((e) => e.type === 'loop' && e.index === 1 && e.start)).toBe(true);
      const held = new Set<number>();
      for (const e of r.events) {
        if (e.type === 'note') {
          if (e.on) held.add(e.n);
          else held.delete(e.n);
        }
        if (e.type === 'allOff') held.clear();
      }
      expect([...held]).toEqual([]);
      // Released: well after the stop and the envelopes' release, it is silent
      expect(r.out.subarray(46000).every((x) => Math.abs(x) < 1e-3)).toBe(true);
      expect(r.out.subarray(0, 30000).some((x) => Math.abs(x) > 0.01)).toBe(true);
    });
  }

  it('sounds as the same notes played as a riff, sample for sample, loop after loop, on a mono voice', () => {
    const steps: PhraseNote[] = [
      [0, 48, 0.25],
      [0.25, 55, 0.2, 0.6],
      [0.75, 60, 0.5, 1],
      // Not to the loop's end: a riff never lets go of a note that ends exactly there, and a pattern does
      [1.5, 51, 0.45],
    ];
    const riff = render(monoParams(), {
      len: 96000,
      events: [[0, { type: 'phrase', phrase: { bpm: 150, loop: true, steps } }]],
    });
    const pattern = render(monoParams(), {
      len: 96000,
      events: [[0, { type: 'pattern', loop: { notes: steps, beats: 2 }, bpm: 150 }]],
    });
    expect(sameSamples(riff.out, pattern.out)).toBe(true);
  });
});
