/**
 * Following an external MIDI clock (`f-midi-hardware-lead` t-91): the tempo read from jittered pulses, the player's beat
 * held on the clock's over many bars, the transport, a dropout.
 *
 * The player is simulated: it plays from the beat it is started at, moves at the tempo it is sent from when that is
 * heard (a fixed delay after it is sent, as the worklet renders ahead of the output), and reports a `loop` event at its
 * start, at each loop's start and at each tempo move, with when that is heard. The clock's pulses arrive on an exact grid
 * with their timestamps jittered, as USB MIDI's are.
 *
 * @see lib/app/midi/follow.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CONTINUE,
  DROPOUT_BEATS,
  SONG_POSITION,
  createClockFollower,
  isClockMessage,
  type ClockFollower,
} from '@/lib/app/midi/follow';
import { CLOCK, PPQN, START, STOP } from '@/lib/app/midi/scheduler';
import type { LoopEvent } from '@/lib/app/synths/audio/pattern-player';

/** The pattern's loop, in beats. */
const LOOP = 4;
/** How long after it is sent a start or a tempo is heard. */
const HEARD_MS = 40;

/** A seeded uniform draw in [-1, 1). */
function jitter(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

interface Segment {
  ms: number;
  g: number;
  bpm: number;
}

/** The simulated player and the follower wired to it. */
function rig(patternBpm = 120) {
  const log: string[] = [];
  /** The player's beat (from the pattern's start) heard over time: a line per tempo. */
  let segs: Segment[] = [];
  let nextBoundary = 0;

  const at = (ms: number): number | null => {
    let s: Segment | undefined;
    for (const x of segs) {
      if (x.ms > ms) break;
      s = x;
    }
    return s ? s.g + ((ms - s.ms) * s.bpm) / 60000 : null;
  };
  const report = (g: number, ms: number, bpm: number, start: boolean) => {
    const index = Math.floor(g / LOOP + 1e-9);
    const e: LoopEvent = {
      type: 'loop',
      index,
      start,
      beat: g - index * LOOP,
      beats: LOOP,
      bpm,
      frame: 0,
    };
    follower.loop(e, ms);
  };
  /** Reports each loop start the player has reached by `ms`. */
  const boundaries = (ms: number) => {
    const s = segs[segs.length - 1];
    if (!s) return;
    while (nextBoundary * LOOP <= (at(ms) ?? -Infinity)) {
      const g = nextBoundary * LOOP;
      report(g, s.ms + ((g - s.g) * 60000) / s.bpm, s.bpm, true);
      nextBoundary++;
    }
  };

  let now = 0;
  const follower: ClockFollower = createClockFollower({
    start(beat, bpm) {
      log.push(`start ${beat}`);
      const tempo = bpm ?? patternBpm;
      segs = [{ ms: now + HEARD_MS, g: beat, bpm: tempo }];
      nextBoundary = Math.floor(beat / LOOP) + 1;
      follower.started();
      report(beat, now + HEARD_MS, tempo, true);
    },
    stop() {
      log.push('stop');
      segs = [];
      follower.stopped();
    },
    tempo(bpm) {
      const s = segs[segs.length - 1];
      if (!s) return;
      const h = now + HEARD_MS;
      boundaries(h);
      const g = at(h) ?? s.g;
      segs.push({ ms: h, g, bpm });
      if (segs.length > 64) segs.shift();
      report(g, h, bpm, false);
    },
  });

  return {
    follower,
    log,
    /** The player's beat heard at `ms`, or null while stopped. */
    beatAt: at,
    send(data: number[], ms: number) {
      now = ms;
      boundaries(ms);
      follower.input(data, ms);
    },
    check(ms: number) {
      now = ms;
      follower.check(ms);
    },
  };
}

/**
 * Plays a clock into the rig: `beats` beats at `bpm` from `from` ms, pulses jittered by up to `j` ms. Calls `onBeat`
 * with the clock's beat and its true time on every beat. Returns when the next pulse would be.
 */
function clock(
  r: ReturnType<typeof rig>,
  o: {
    from: number;
    bpm: number;
    beats: number;
    j?: number;
    seed?: number;
    first?: number;
    onBeat?: (beat: number, ms: number) => void;
  }
): number {
  const rand = jitter(o.seed ?? 1);
  const gap = 60000 / (o.bpm * PPQN);
  const first = o.first ?? 0;
  for (let k = 0; k < o.beats * PPQN; k++) {
    const t = o.from + k * gap;
    r.send([CLOCK], t + (o.j ?? 1) * rand());
    if (k % PPQN === 0) o.onBeat?.((first + k) / PPQN, t);
  }
  return o.from + o.beats * PPQN * gap;
}

/** How far the player is from the clock on beat `beat` at `ms`, in ms at `bpm`. */
const offMs = (r: ReturnType<typeof rig>, beat: number, ms: number, bpm: number) =>
  ((r.beatAt(ms)! - beat) * 60000) / bpm;

describe('createClockFollower', () => {
  it('reads only the clock, Start, Continue, Stop and Song Position', () => {
    expect([CLOCK, START, CONTINUE, STOP, SONG_POSITION].every(isClockMessage)).toBe(true);
    expect([0x90, 0xb0, 0xfe, 0xff, 0xf0].some(isClockMessage)).toBe(false);
  });

  it('settles on the tempo from jittered pulses, within 0.5 BPM', () => {
    for (const bpm of [72, 120, 174]) {
      const r = rig();
      clock(r, { from: 1000, bpm, beats: 4, j: 1, seed: bpm });
      expect(Math.abs(r.follower.bpm()! - bpm)).toBeLessThan(0.5);
    }
  });

  it('starts nothing on clock alone', () => {
    const r = rig();
    clock(r, { from: 0, bpm: 120, beats: 8 });
    expect(r.log).toEqual([]);
    expect(r.follower.bpm()).not.toBeNull();
  });

  it('starts from beat 0 on the pulse after Start, and holds the beat within 3 ms over 64 bars', () => {
    const r = rig(100);
    // The clock is already running when Start comes, as a DAW's is.
    let t = clock(r, { from: 0, bpm: 128, beats: 2 });
    r.send([START], t - 1);
    const worst: number[] = [];
    t = clock(r, {
      from: t,
      bpm: 128,
      beats: 64 * 4,
      j: 1,
      seed: 7,
      onBeat: (beat, ms) => {
        if (beat >= 8) worst.push(Math.abs(offMs(r, beat, ms, 128)));
      },
    });
    expect(r.log).toEqual(['start 0']);
    expect(worst.length).toBe(64 * 4 - 8);
    expect(Math.max(...worst)).toBeLessThan(3);
    expect(Math.abs(r.follower.bpm()! - 128)).toBeLessThan(0.5);
  });

  it('starts at the pattern’s tempo when the clock comes with Start, and falls in with it', () => {
    const r = rig(90);
    r.send([START], 0);
    const off: number[] = [];
    clock(r, {
      from: 1,
      bpm: 140,
      beats: 32,
      j: 1,
      seed: 3,
      onBeat: (beat, ms) => {
        if (beat >= 8) off.push(Math.abs(offMs(r, beat, ms, 140)));
      },
    });
    expect(r.log).toEqual(['start 0']);
    expect(Math.max(...off)).toBeLessThan(3);
  });

  it('follows a change of tempo and pulls the beat back onto the clock', () => {
    const r = rig();
    r.send([START], 0);
    const t = clock(r, { from: 1, bpm: 120, beats: 16, seed: 5 });
    const off: number[] = [];
    clock(r, {
      from: t,
      bpm: 132,
      beats: 64,
      first: 16 * PPQN,
      seed: 6,
      onBeat: (beat, ms) => {
        if (beat >= 16 + 8) off.push(Math.abs(offMs(r, beat, ms, 132)));
      },
    });
    expect(Math.abs(r.follower.bpm()! - 132)).toBeLessThan(0.5);
    expect(Math.max(...off)).toBeLessThan(3);
  });

  it('a beat error is made up through the tempo, never by more than a tenth', () => {
    const tempos: number[] = [];
    const f = createClockFollower({
      start: () => f.started(),
      stop: () => {},
      tempo: (bpm) => tempos.push(bpm),
    });
    f.input([START], 0);
    const gap = 60000 / (120 * PPQN);
    f.input([CLOCK], 0);
    // The player says it is half a beat behind, and stays there.
    f.loop({ type: 'loop', index: 0, start: true, beat: 0, beats: 4, bpm: 120, frame: 0 }, 250);
    for (let k = 1; k <= PPQN; k++) f.input([CLOCK], k * gap);
    expect(Math.max(...tempos)).toBeCloseTo(132, 6);
  });

  it('stops on Stop, and Continue resumes from the clock’s count', () => {
    const r = rig();
    r.send([START], 0);
    let t = clock(r, { from: 1, bpm: 120, beats: 6, j: 0 });
    r.send([STOP], t);
    expect(r.log).toEqual(['start 0', 'stop']);
    // Clock while stopped (a DAW's keeps running) moves nothing.
    t = clock(r, { from: t + 100, bpm: 120, beats: 2, j: 0 });
    r.send([CONTINUE], t);
    clock(r, { from: t + 1, bpm: 120, beats: 1, j: 0 });
    expect(r.log).toEqual(['start 0', 'stop', 'start 6']);
  });

  it('Continue after a Song Position Pointer resumes from there', () => {
    const r = rig();
    // Sixteenth 34 is beat 8.5.
    r.send([SONG_POSITION, 34, 0], 0);
    r.send([CONTINUE], 1);
    clock(r, { from: 2, bpm: 120, beats: 1 });
    expect(r.log).toEqual(['start 8.5']);
    // Held there over the bars after, as from a Start.
    const off: number[] = [];
    clock(r, {
      from: 502,
      bpm: 120,
      beats: 32,
      first: 8.5 * PPQN + PPQN,
      onBeat: (beat, ms) => {
        if (beat > 16) off.push(Math.abs(offMs(r, beat, ms, 120)));
      },
    });
    expect(Math.max(...off)).toBeLessThan(3);
  });

  it('a Song Position Pointer while playing moves nothing', () => {
    const r = rig();
    r.send([START], 0);
    const t = clock(r, { from: 1, bpm: 120, beats: 2, j: 0 });
    r.send([SONG_POSITION, 64, 0], t);
    r.send([STOP], t + 1);
    r.send([CONTINUE], t + 2);
    clock(r, { from: t + 3, bpm: 120, beats: 1, j: 0 });
    expect(r.log).toEqual(['start 0', 'stop', 'start 2']);
  });

  it('Start while playing starts again from beat 0', () => {
    const r = rig();
    r.send([START], 0);
    const t = clock(r, { from: 1, bpm: 120, beats: 3, j: 0 });
    r.send([START], t);
    clock(r, { from: t + 1, bpm: 120, beats: 1, j: 0 });
    expect(r.log).toEqual(['start 0', 'start 0']);
  });

  it('a clock gone quiet for two beats while playing stops it; less does not', () => {
    const r = rig();
    r.send([START], 0);
    const t = clock(r, { from: 1, bpm: 120, beats: 4, j: 0 });
    const last = t - 60000 / (120 * PPQN);
    r.check(last + DROPOUT_BEATS * 500 - 10);
    expect(r.log).toEqual(['start 0']);
    r.check(last + DROPOUT_BEATS * 500 + 10);
    expect(r.log).toEqual(['start 0', 'stop']);
    // Once: it is stopped.
    r.check(last + 5000);
    expect(r.log).toEqual(['start 0', 'stop']);
  });

  it('a dropout while stopped stops nothing, and the clock coming back reads its tempo afresh', () => {
    const r = rig();
    let t = clock(r, { from: 0, bpm: 120, beats: 2, j: 0 });
    r.check(t + 5000);
    expect(r.log).toEqual([]);
    t = clock(r, { from: t + 5000, bpm: 90, beats: 1, j: 0 });
    expect(r.follower.bpm()).toBeCloseTo(90, 3);
  });

  it('a run it did not start follows the tempo, not the beat', () => {
    const tempos: number[] = [];
    const f = createClockFollower({
      start: () => {},
      stop: () => {},
      tempo: (b) => tempos.push(b),
    });
    f.started();
    f.loop({ type: 'loop', index: 0, start: true, beat: 0, beats: 4, bpm: 120, frame: 0 }, 5000);
    const gap = 60000 / (100 * PPQN);
    for (let k = 0; k <= PPQN * 2; k++) f.input([CLOCK], k * gap);
    expect(tempos.length).toBeGreaterThan(0);
    for (const b of tempos) expect(Math.abs(b - 100)).toBeLessThan(0.5);
  });

  it('sends nothing to a run that has stopped', () => {
    const tempos: number[] = [];
    const f = createClockFollower({
      start: () => {},
      stop: () => {},
      tempo: (b) => tempos.push(b),
    });
    f.started();
    f.stopped();
    const gap = 60000 / (100 * PPQN);
    for (let k = 0; k <= PPQN * 2; k++) f.input([CLOCK], k * gap);
    expect(tempos).toEqual([]);
  });
});
