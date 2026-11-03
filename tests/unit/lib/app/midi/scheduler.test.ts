/**
 * MIDI out's scheduler (`f-midi-out` t-88): the pattern's notes timed from the pattern player's `loop` events, sent a
 * look-ahead at a time, with the player's held-note rules, and everything let go on Stop, at the end and on a change of
 * port.
 *
 * The clock is a fake that reads frames as milliseconds (a 1 kHz context, heard as soon as it is rendered), and the
 * port records what it is sent and when. `run` pumps the way the page's timer does, every 25 ms. MIDI clock (t-89) is
 * tested against the same fake: its pulses, Start and Stop.
 *
 * @see lib/app/midi/scheduler.ts
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ALL_NOTES_OFF,
  CLOCK,
  LOOKAHEAD_MS,
  PPQN,
  PROGRAM_LEAD_MS,
  START,
  STOP,
  createMidiScheduler,
  midiVelocity,
  type MidiPort,
} from '@/lib/app/midi/scheduler';
import type { LoopEvent, PatternLoop } from '@/lib/app/synths/audio/pattern-player';
import type { PhraseNote } from '@/lib/app/synths/contract';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { PatternSchema, newPattern, type Pattern } from '@/lib/app/sequencer/pattern';
import { logger } from '@/lib/logging';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Sent = [at: number, data: number[]];

function setup(channel = 0) {
  let now = 0;
  const sent: Sent[] = [];
  const port: MidiPort = { send: (data, at) => void sent.push([at ?? now, data]) };
  const s = createMidiScheduler({ now: () => now, at: (frame) => frame });
  s.setPort(port, channel);
  return {
    s,
    sent,
    port,
    set now(t: number) {
      now = t;
    },
    get now() {
      return now;
    },
    /** Pumps every 25 ms from now until `until`. */
    run(until: number) {
      for (; now <= until; now += 25) s.pump();
      now = until;
    },
  };
}

const loop = (notes: PhraseNote[], beats = 1): PatternLoop => ({ notes, beats });
const ev = (over: Partial<LoopEvent> = {}): LoopEvent => ({
  type: 'loop',
  index: 0,
  start: true,
  beat: 0,
  beats: 1,
  bpm: 60,
  frame: 0,
  ...over,
});

/** Note-ons as [time, note, velocity]; note-offs as [time, note]. */
const ons = (sent: Sent[]) =>
  sent.filter(([, d]) => (d[0] & 0xf0) === 0x90).map(([at, d]) => [at, d[1], d[2]]);
const offs = (sent: Sent[]) =>
  sent.filter(([, d]) => (d[0] & 0xf0) === 0x80).map(([at, d]) => [at, d[1]]);
const allOff = (sent: Sent[]) =>
  sent.filter(([, d]) => (d[0] & 0xf0) === 0xb0 && d[1] === ALL_NOTES_OFF).map(([at]) => at);

/** Starts a run of `l` at 60 BPM, its first loop heard at `frame`. */
function start(t: ReturnType<typeof setup>, l: PatternLoop, frame = 0) {
  t.s.message({ type: 'pattern', loop: l, bpm: 60, run: 1 });
  t.s.event(ev({ frame, beats: l.beats }));
}

describe('a run started part-way (f-midi-hardware-lead t-91)', () => {
  const l = loop(
    [
      [0, 60, 0.5],
      [1, 62, 1],
      [2.5, 64, 0.25],
    ],
    4
  );

  it('counts from the loop it starts at and sends nothing before the beat', () => {
    const t = setup();
    t.s.message({ type: 'pattern', loop: l, bpm: 60, run: 1, index: 2, beat: 1.5 });
    t.s.event(ev({ index: 2, beat: 1.5, beats: 4, frame: 0 }));
    t.run(2600);
    // 60 and 62 began before beat 1.5; 64 is a beat later, and the next loop's 60 at its start.
    expect(ons(t.sent)).toEqual([
      [1000, 64, 108],
      [2500, 60, 108],
    ]);
    expect(offs(t.sent)).toEqual([[1250, 64]]);
  });

  it('with clock on, sends Start at the next loop’s start, not part-way through', () => {
    const t = setup();
    t.s.setClock(true);
    t.s.message({ type: 'pattern', loop: l, bpm: 60, run: 1, index: 2, beat: 1.5 });
    t.s.event(ev({ index: 2, beat: 1.5, beats: 4, frame: 0 }));
    t.run(2600);
    const start = t.sent.filter(([, d]) => d[0] === START).map(([at]) => at);
    expect(start).toEqual([2500]);
  });
});

describe('timing', () => {
  it('sends nothing until the run’s first loop event says when it began', () => {
    const t = setup();
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]]), bpm: 60 });
    t.run(500);
    expect(t.sent).toEqual([]);
    t.s.event(ev({ frame: 520 }));
    t.s.pump();
    expect(ons(t.sent)).toEqual([[520, 60, midiVelocity(undefined)]]);
  });

  it('places every note of a loop with swing, nudge, ratchet and slide where the player plays it', () => {
    const p: Pattern = newPattern(4, '1/16', 60);
    p.swing = 75;
    p.parts[0].steps = [
      { on: true, notes: [{ note: 60, gate: 1 }], ratchet: 2 },
      { on: true, notes: [{ note: 62, gate: 1, nudge: 0.5 }] },
      { on: true, notes: [{ note: 64, gate: 1 }], slide: true },
      { on: true, notes: [{ note: 65, gate: 0.5, velocity: 0.5 }], accent: true },
    ];
    const c = compileLoop(PatternSchema.parse(p), { loop: 0, rng: seededRng(1) });
    const t = setup();
    start(t, { notes: c.notes, beats: c.beats }, 200);
    t.run(200 + c.beats * 1000 - 1);
    // A beat is 1,000 ms at 60 BPM, so each note-on is heard 200 ms plus its beat in thousands. (The look-ahead has
    // reached the next loop's first note too.)
    const loop0 = ons(t.sent).filter(([at]) => at < 200 + c.beats * 1000);
    expect(loop0).toEqual(c.notes.map(([b, n, , v]) => [200 + b * 1000, n, midiVelocity(v)]));
    // And by hand: the ratchet's second hit half a step in; steps 2 and 4 swung to 75% (half a step late), step 2
    // nudged half a step more; the slide held on past step 4's start.
    expect(loop0.map(([at, n]) => [at, n])).toEqual([
      [200, 60],
      [325, 60],
      [200 + 250 + 125 + 125, 62],
      [700, 64],
      [1075, 65],
    ]);
    const slideOff = offs(t.sent).find(([, n]) => n === 64);
    expect(slideOff?.[0]).toBeGreaterThan(1075);
  });

  it('never hands the output more than the look-ahead at once', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 60, 0.1],
        [0.5, 62, 0.1],
      ])
    );
    t.now = 0;
    t.s.pump();
    expect(ons(t.sent)).toEqual([[0, 60, midiVelocity(undefined)]]);
    t.now = 500 - LOOKAHEAD_MS - 1;
    t.s.pump();
    expect(ons(t.sent)).toHaveLength(1);
    t.now = 500 - LOOKAHEAD_MS + 1;
    t.s.pump();
    expect(ons(t.sent)).toHaveLength(2);
  });

  it('maps velocity 0..1 onto 1..127, with the engine’s default for a note without one', () => {
    expect(midiVelocity(undefined)).toBe(108);
    expect(midiVelocity(1)).toBe(127);
    expect(midiVelocity(0)).toBe(1);
    expect(midiVelocity(0.5)).toBe(64);
  });

  it('sends on the chosen channel', () => {
    const t = setup(9);
    start(t, loop([[0, 60, 0.5]]));
    t.run(600);
    t.s.message({ type: 'stopPattern' });
    expect(t.sent.map(([, d]) => d[0] & 0x0f)).toEqual(t.sent.map(() => 9));
    expect(t.sent.length).toBeGreaterThan(2);
  });

  it('follows a tempo move from the player’s loop event', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 0.1],
          [0.5, 62, 0.1],
        ],
        1
      )
    );
    t.run(200);
    // At 300 ms the tempo doubles: the player reports beat 0.3 from frame 300.
    t.s.event(ev({ start: false, beat: 0.3, bpm: 120, frame: 300 }));
    t.run(1000);
    // Beat 0.5 is 0.2 beats on, 100 ms at 120 BPM; the next loop starts 0.7 beats on, at 650, and its 62 at 900.
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [400, 62],
      [650, 60],
      [900, 62],
    ]);
  });

  it('skips a note whose time passed while the timer was held up, rather than sending it late', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 60, 0.1],
        [0.25, 62, 0.1],
        [0.75, 64, 0.1],
      ])
    );
    t.now = 0;
    t.s.pump();
    // Nothing pumps until 700 ms (a background tab): 62 at 250 is long gone, 64 at 750 is still to come.
    t.now = 700;
    t.s.pump();
    expect(ons(t.sent).map(([, n]) => n)).toEqual([60, 64]);
  });
});

describe('held notes', () => {
  it('lets go of two overlapping notes of one pitch once, when the last ends', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 1],
          [0.5, 60, 1],
        ],
        2
      )
    );
    t.run(1900);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [500, 60],
    ]);
    expect(offs(t.sent)).toEqual([[1500, 60]]);
  });

  it('lets go of a note held over the loop’s end in the next loop, before that loop’s own note on the same beat', () => {
    const t = setup();
    start(t, loop([[0.5, 60, 1]], 1));
    t.run(1700);
    // Played again (nothing queued): the first 60 ends at 1,500, where the second starts.
    expect(t.sent.map(([at, d]) => [at, d[0] & 0xf0, d[1]])).toEqual([
      [500, 0x90, 60],
      [1500, 0x80, 60],
      [1500, 0x90, 60],
    ]);
  });

  it('plays the loop queued for after this one, and plays this one again with none queued', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.1]]));
    t.s.message({ type: 'patternNext', loop: loop([[0, 62, 0.1]]) });
    t.run(2500);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [1000, 62],
      [2000, 62],
    ]);
  });
});

describe('edits and Stop inside the look-ahead', () => {
  it('hears an edit from the end of what was already sent, keeping the let-go of a note already down', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 60, 0.5],
        [0.05, 61, 0.05],
        [0.5, 62, 0.1],
      ])
    );
    t.now = 0;
    t.s.pump(); // 60 and 61 sent; 62 at 500 is not reached
    t.s.message({
      type: 'patternEdit',
      loop: loop([
        [0.05, 71, 0.1],
        [0.5, 72, 0.1],
      ]),
    });
    t.run(900);
    // 71 is inside what was sent and is not sent now; 72 replaces 62; 60 still lets go at 500.
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [50, 61],
      [500, 72],
    ]);
    expect(offs(t.sent)).toEqual([
      [100, 61],
      [500, 60],
      [600, 72],
    ]);
  });

  it('drops the loop queued before an edit, as the player does, so the edited loop plays again', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.1]]));
    t.s.message({ type: 'patternNext', loop: loop([[0, 62, 0.1]]) });
    t.run(200);
    t.s.message({ type: 'patternEdit', loop: loop([[0.5, 64, 0.1]]) });
    t.run(1600);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [500, 64],
      [1500, 64],
    ]);
  });

  it('lets go on Stop of everything sent, a note-on still on its way at its own time too, then All Notes Off', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 1],
          [0.08, 64, 1],
        ],
        2
      )
    );
    t.now = 10;
    t.s.pump(); // 64 is sent for 80 ms, still ahead
    t.s.message({ type: 'stopPattern' });
    // Now, and 64 again at 80 so its note-on, still on its way, does not sound on. All Notes Off goes now only.
    expect(offs(t.sent)).toEqual([
      [10, 60],
      [10, 64],
      [80, 64],
    ]);
    expect(allOff(t.sent)).toEqual([10]);
    const before = t.sent.length;
    t.run(3000);
    expect(t.sent).toHaveLength(before);
  });

  it('lets go at the pattern’s end, and sends no note after it', () => {
    const t = setup();
    start(t, loop([[0.5, 60, 1]], 1));
    t.s.message({ type: 'patternNext', loop: null });
    t.run(1400);
    expect(ons(t.sent).map(([, n]) => n)).toEqual([60]);
    // The note owed past the end is let go there, as the player lets go of everything when it stops.
    expect(offs(t.sent)).toEqual([[1000, 60]]);
    t.s.event({ type: 'patternEnd', run: 1 });
    expect(allOff(t.sent)).toEqual([1400]);
  });

  it('lets go of everything on patternEnd from a panic, mid-note', () => {
    const t = setup();
    start(t, loop([[0, 60, 1]], 2));
    t.run(300);
    t.s.event({ type: 'patternEnd' });
    expect(offs(t.sent)).toEqual([[300, 60]]);
    expect(allOff(t.sent)).toEqual([300]);
  });
});

describe('the port', () => {
  it('lets go on the old port and carries on on the new one from what is heard now', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 0.6],
          [0.5, 62, 0.1],
        ],
        1
      )
    );
    t.run(300);
    const other: Sent[] = [];
    t.s.setPort({ send: (d, at) => void other.push([at ?? t.now, d]) }, 1);
    expect(offs(t.sent)).toEqual([[300, 60]]);
    expect(allOff(t.sent)).toEqual([300]);
    t.run(1100);
    // 60 was let go on the old port; its let-go is not owed on the new one. 62 and the next loop's 60 play there.
    expect(ons(other).map(([at, n]) => [at, n])).toEqual([
      [500, 62],
      [1000, 60],
    ]);
    expect(other.every(([, d]) => (d[0] & 0x0f) === 1)).toBe(true);
  });

  it('sends nothing without a port, and no All Notes Off when it had sent nothing', () => {
    const t = setup();
    t.s.setPort(null, 0);
    start(t, loop([[0, 60, 0.5]]));
    t.run(1000);
    t.s.release();
    expect(t.sent).toEqual([]);
  });
});

describe('messages beyond the transport', () => {
  it('moves the clock at once on a tempo message, before the player’s own event places it', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 60, 0.1],
        [0.5, 62, 0.1],
      ])
    );
    t.run(100);
    // At 100 ms (beat 0.1), the tempo doubles: beat 0.5 is 0.4 beats on, 200 ms.
    t.s.message({ type: 'tempo', bpm: 120 });
    t.run(400);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [300, 62],
    ]);
  });

  it('ignores a tempo it cannot use, and one before the run has begun', () => {
    const t = setup();
    t.s.message({ type: 'tempo', bpm: 120 });
    start(t, loop([[0.5, 62, 0.1]]));
    t.s.message({ type: 'tempo', bpm: 0 });
    t.run(450);
    expect(ons(t.sent)).toEqual([[500, 62, midiVelocity(undefined)]]);
  });

  it('lets go of everything on a panic, and takes no notice of messages that are not the pattern’s', () => {
    const t = setup();
    start(t, loop([[0, 60, 1]], 2));
    t.run(200);
    t.s.message({ type: 'params' });
    expect(offs(t.sent)).toEqual([]);
    t.s.message({ type: 'panic' });
    expect(offs(t.sent)).toEqual([[200, 60]]);
  });

  it('sends no note outside MIDI’s range', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 128, 0.1],
        [0, -1, 0.1],
        [0.1, 60.5, 0.1],
        [0.2, 62, 0.1],
      ])
    );
    t.run(300);
    expect(ons(t.sent).map(([, n]) => n)).toEqual([62]);
  });

  it('ignores queued loops and edits before a run, and an event from no run', () => {
    const t = setup();
    t.s.message({ type: 'patternNext', loop: loop([[0, 60, 0.1]]) });
    t.s.message({ type: 'patternEdit', loop: loop([[0, 60, 0.1]]) });
    t.s.event(ev());
    t.run(500);
    expect(t.sent).toEqual([]);
  });

  it('never re-sends to the same port and channel, and keeps a channel in range', () => {
    const t = setup();
    start(t, loop([[0, 60, 1]], 2));
    t.run(100);
    t.s.setPort(t.port, 0);
    expect(offs(t.sent)).toEqual([]);
    t.s.setPort(t.port, 99);
    t.run(2100);
    expect(t.sent.at(-1)?.[1][0]).toBe(0x9f);
  });
});

describe('a loop shorter than the look-ahead', () => {
  it('takes a loop queued for one it is already placing notes from, from there on', () => {
    const t = setup();
    // A loop of 50 ms: the look-ahead reaches into loop 1 before loop 0's start has queued it.
    start(t, loop([[0, 60, 0.01]], 0.05));
    t.s.pump();
    t.s.message({ type: 'patternNext', loop: loop([[0.02, 62, 0.01]], 0.05) });
    t.run(60);
    // Loop 1 had been sent up to 100 ms, past where the new loop's 62 falls in it (70 ms): it is heard from loop 2 on.
    expect(ons(t.sent).map(([at, n]) => [Math.round(at), n])).toEqual([
      [0, 60],
      [50, 60],
      [120, 62],
    ]);
  });

  it('stops placing notes when the end is queued for a loop already begun', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.01]], 0.05));
    t.s.pump();
    t.s.message({ type: 'patternNext', loop: null });
    const before = ons(t.sent).length;
    t.run(500);
    expect(ons(t.sent)).toHaveLength(before);
  });

  it('leaves the loop the player is in alone when an edit comes after the notes have moved past it', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.01]], 0.05));
    t.s.pump(); // into loop 1 already
    t.s.message({ type: 'patternEdit', loop: loop([[0.01, 70, 0.01]], 0.05) });
    t.run(30);
    expect(ons(t.sent).map(([, n]) => n)).not.toContain(70);
  });

  it('catches up with the player after the timer was held up, sending nothing it passed', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 0.1],
          [0.5, 62, 0.1],
        ],
        1
      )
    );
    t.s.pump();
    // The player reports loop 3 at beat 0.4, heard at 3,400 ms; nothing was pumped since 0.
    t.now = 3410;
    t.s.event(ev({ index: 3, start: false, beat: 0.4, frame: 3400 }));
    t.s.pump();
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [3500, 62],
    ]);
  });
});

describe('what the first review found', () => {
  it('refuses a loop the player would refuse, keeping the run it has', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.1]]));
    t.s.message({ type: 'pattern', loop: loop([[0, 62, 0.1]], 0), bpm: 60, run: 2 });
    t.s.message({ type: 'patternNext', loop: loop([[0, 64, 0.1]], Number.NaN) });
    t.s.message({ type: 'patternEdit', loop: loop([[0, 64, 0.1]], 0) });
    // A zero-length loop would turn forever inside one pump: this returns, playing the run it had.
    t.run(1100);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [1000, 60],
    ]);
  });

  it('lets go at the end of a loop already begun when its end is queued late', () => {
    const t = setup();
    // 50 ms loops; each 60 is held over its loop's end into the next.
    start(t, loop([[0.04, 60, 0.03]], 0.05));
    t.s.pump(); // the look-ahead is in loop 1 already when its end is queued
    t.s.message({ type: 'patternNext', loop: null });
    t.run(200);
    // Loop 0's 60 was let go inside the window already (70 ms). Loop 1's, sent for 90 ms and owed at 120, is let go
    // at the end instead: at 90, as no let-go may come before its own note-on.
    expect(offs(t.sent)).toEqual([
      [70, 60],
      [90, 60],
    ]);
  });

  it('keeps the run through being silenced, and plays on from what is heard when next pumped', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 0.5],
          [0.5, 62, 0.1],
        ],
        1
      )
    );
    t.run(100);
    t.s.silence();
    expect(offs(t.sent)).toEqual([[100, 60]]);
    expect(allOff(t.sent)).toEqual([100]);
    t.run(1100);
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [0, 60],
      [500, 62],
      [1000, 60],
    ]);
  });

  it('takes a tick as time passing, nothing more', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.1]]));
    t.s.event({ type: 'patternTick', run: 1 });
    t.s.pump();
    expect(ons(t.sent)).toHaveLength(1);
  });

  it('says once per port that sending failed, not once a note', () => {
    vi.mocked(logger.warn).mockClear();
    let now = 0;
    const s = createMidiScheduler({ now: () => now, at: (f) => f });
    s.setPort(
      {
        send: () => {
          throw new Error('InvalidAccessError');
        },
      },
      0
    );
    s.message({
      type: 'pattern',
      loop: loop([
        [0, 60, 0.1],
        [0.5, 62, 0.1],
      ]),
      bpm: 60,
    });
    s.event(ev());
    for (; now < 2000; now += 25) s.pump();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('what the second review found', () => {
  it('cuts none of the next run’s notes with what the last one’s release queued', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0, 60, 1],
          [0.09, 64, 1],
        ],
        2
      )
    );
    t.now = 10;
    t.s.pump(); // 64 is on its way for 90 ms
    // Stop and Play at once: the new run's first loop is heard from 30 ms.
    t.s.message({ type: 'stopPattern' });
    t.s.message({
      type: 'pattern',
      loop: loop(
        [
          [0, 62, 1],
          [0, 64, 1],
        ],
        2
      ),
      bpm: 60,
      run: 2,
    });
    t.s.event(ev({ frame: 30, beats: 2, run: 2 }));
    t.s.pump();
    // Nothing is all-noted-off after now, and the new 64 waits for the let-go of the old one on its way.
    expect(allOff(t.sent)).toEqual([10]);
    expect(
      ons(t.sent)
        .slice(2)
        .map(([at, n]) => [at, n])
    ).toEqual([
      [30, 62],
      [90, 64],
    ]);
    expect(offs(t.sent).filter(([at]) => at > 10)).toEqual([[90, 64]]);
  });

  it('lets go at the end when catching up with a player that has already ended the pattern', () => {
    const t = setup();
    start(t, loop([[0.5, 60, 1]], 1));
    t.s.message({ type: 'patternNext', loop: null });
    t.run(600);
    // The timer was held up; the player reports it is past its last loop. The 60 owed at 1,500 is let go at 1,000.
    t.s.event(ev({ index: 1, start: true, frame: 1000 }));
    t.now = 1100;
    t.s.pump();
    expect(offs(t.sent)).toEqual([[1100, 60]]);
  });
});

describe('what the third review found', () => {
  it('holds a note back for a let-go of its pitch already queued, from the run before', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.08]], 2));
    t.now = 10;
    t.s.pump(); // 60 down at 0, its let-go queued for 80 ms
    t.s.message({ type: 'stopPattern' });
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 2), bpm: 60, run: 2 });
    t.s.event(ev({ frame: 30, beats: 2, run: 2 }));
    t.s.pump();
    // The new 60 would sound at 30 and be cut at 80 by the old let-go: it goes at 80, after it.
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [10, 60],
      [80, 60],
    ]);
  });

  it('sends again, after a silence, the notes it let go before they began', () => {
    const t = setup();
    start(
      t,
      loop(
        [
          [0.15, 60, 0.05],
          [0.18, 62, 0.05],
        ],
        1
      )
    );
    t.now = 100;
    t.s.pump(); // 60 and 62 are on their way for 150 and 180 ms
    t.s.silence(); // a channel change, say
    t.now = 110;
    t.s.pump();
    expect(ons(t.sent).map(([at, n]) => [at, n])).toEqual([
      [150, 60],
      [180, 62],
      [150, 60],
      [180, 62],
    ]);
    // Let go of at its own time by the silence, then played again at that time, after it.
    expect(offs(t.sent).filter(([, n]) => n === 62)).toEqual([
      [100, 62],
      [180, 62],
    ]);
  });

  it('moves the clock on a tempo message from when the change is heard, not when it is sent', () => {
    let now = 0;
    const sent: Sent[] = [];
    const s = createMidiScheduler({ now: () => now, at: (f) => f, heardIn: () => 40 });
    s.setPort({ send: (d, at) => void sent.push([at ?? now, d]) }, 0);
    s.message({ type: 'pattern', loop: loop([[0.5, 62, 0.1]]), bpm: 60 });
    s.event(ev());
    now = 100;
    s.message({ type: 'tempo', bpm: 120 });
    for (; now < 400; now += 25) s.pump();
    // Heard at 140 (beat 0.14); beat 0.5 is 0.36 beats on at 120 BPM: 180 ms later, at 320.
    expect(ons(sent).map(([at]) => Math.round(at))).toEqual([320]);
  });

  it('sends nothing for a note the synth plays silent, at velocity 0', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 60, 0.1, 0],
        [0.2, 62, 0.1, 0.5],
      ])
    );
    t.run(400);
    expect(ons(t.sent).map(([, n]) => n)).toEqual([62]);
    expect(offs(t.sent).map(([, n]) => n)).toEqual([62]);
  });
});

describe('MIDI clock', () => {
  const pulses = (sent: Sent[]) => sent.filter(([, d]) => d[0] === CLOCK).map(([at]) => at);
  /** The real-time messages, and the notes among them, in the order they were handed to the port. */
  const order = (sent: Sent[]) =>
    sent.map(([at, d]) =>
      d[0] === START
        ? ['start', at]
        : d[0] === STOP
          ? ['stop', at]
          : d[0] === CLOCK
            ? ['clock', at]
            : [d[0] & 0xf0, at]
    );
  const close = (got: number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 6));
  };

  /** A run at `bpm` of a 4-beat loop, its first loop heard at `frame` (200 ms), with the clock on. */
  function clocked(bpm: number, l = loop([[0, 60, 0.5]], 4), frame = 200) {
    const t = setup();
    t.s.setClock(true);
    t.s.message({ type: 'pattern', loop: l, bpm, run: 1 });
    t.s.event(ev({ frame, beats: l.beats, bpm }));
    return t;
  }

  it('sends nothing of it with the clock off, as it is to begin with', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.5]], 1));
    t.run(3000);
    t.s.message({ type: 'stopPattern' });
    expect(ons(t.sent).length).toBeGreaterThan(0);
    expect(t.sent.filter(([, d]) => d[0] >= 0xf8)).toEqual([]);
  });

  it.each([60, 150])('sends %i BPM as 24 pulses a beat from Start, on the straight grid', (bpm) => {
    const t = clocked(bpm);
    t.run(2200);
    const every = 60000 / bpm / PPQN;
    const got = pulses(t.sent);
    // Everything up to the look-ahead: 2.3 s heard from 200 ms.
    const want = Array.from(
      { length: Math.ceil(((2100 * bpm) / 60000) * PPQN - 1e-9) },
      (_, k) => 200 + k * every
    );
    close(got, want);
    expect(t.sent.filter(([, d]) => d[0] === START).map(([at]) => at)).toEqual([200]);
  });

  it('follows a tempo move inside the look-ahead, keeping the count, from where it is heard on', () => {
    const t = clocked(60);
    t.run(500);
    // Sent so far: every pulse before beat 0.4 (600 ms, the look-ahead) at 60 BPM, 41.67 ms apart.
    const before = pulses(t.sent);
    close(
      before,
      Array.from({ length: 10 }, (_, k) => 200 + (k * 1000) / 24)
    );
    // The tempo doubles at 500 (beat 0.3): what was sent past it stays sent, and the clock goes on from beat 0.3 at
    // 120 BPM, 20.83 ms a pulse. A pulse that would now fall before one already sent waits for it, so none is lost.
    t.s.message({ type: 'tempo', bpm: 120 });
    t.run(1000);
    const all = pulses(t.sent);
    const after = all.slice(before.length);
    const onGrid = (k: number) => 500 + (k / 24 - 0.3) * 500;
    after.forEach((at, i) =>
      expect(at).toBeCloseTo(Math.max(onGrid(before.length + i), before.at(-1)!), 6)
    );
    // On the new grid from where it caught up, out to the look-ahead (beat 0.3 + 0.6 × 2 = 1.5).
    expect(all).toHaveLength(Math.ceil(1.5 * 24));
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1]);
    expect(after.at(-1)! - after.at(-2)!).toBeCloseTo(500 / 24, 6);
  });

  it('sends Start before the first note, and Stop after the last let-go at the end', () => {
    const t = clocked(
      60,
      loop(
        [
          [0, 60, 0.5],
          [0.5, 62, 0.5],
        ],
        1
      )
    );
    t.s.message({ type: 'patternNext', loop: null });
    t.run(1500);
    const seq = order(t.sent);
    expect(seq.slice(0, 3)).toEqual([
      ['start', 200],
      ['clock', 200],
      [0x90, 200],
    ]);
    // 62 is let go at the end, 1,200 ms, and Stop goes there after it; nothing after.
    const last = seq.findIndex(([k, at]) => k === 0x80 && at === 1200);
    expect(seq.slice(last)).toEqual([
      [0x80, 1200],
      ['stop', 1200],
    ]);
    expect(pulses(t.sent)).toHaveLength(24);
    // The player's own end then sends no second Stop.
    t.s.event({ type: 'patternEnd', run: 1 });
    expect(t.sent.filter(([, d]) => d[0] === STOP)).toHaveLength(1);
  });

  it('sends Stop on Stop, after letting go, and Start again with the next run', () => {
    const t = clocked(60);
    t.run(300);
    t.s.message({ type: 'stopPattern' });
    // Now: the pulses already handed over for later (to 366.67) may land after it, which only sets the tempo.
    expect(order(t.sent).slice(-3)).toEqual([
      [0x80, 300],
      [0xb0, 300],
      ['stop', 300],
    ]);
    // Play again at once, heard at 320: the old pulses still to land (to 366.67) would be counted as the new run's
    // after a Start at 320, so the clock starts at the next loop, 4,320, before that loop's first note.
    const n = t.sent.length;
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 4), bpm: 60, run: 2 });
    t.s.event(ev({ frame: 320, beats: 4 }));
    t.run(4300);
    const seq = order(t.sent.slice(n));
    expect(seq[0]).toEqual([0x90, 320]);
    const s0 = seq.findIndex(([k]) => k === 'start');
    expect(seq.slice(s0, s0 + 3)).toEqual([
      ['start', 4320],
      ['clock', 4320],
      [0x90, 4320],
    ]);
  });

  it('starts at the next loop when turned on mid-run, and stops at once when turned off', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.5]], 1));
    t.run(400);
    t.s.setClock(true);
    t.run(1400);
    const seq = order(t.sent).filter(([k]) => typeof k === 'string');
    expect(seq[0]).toEqual(['start', 1000]);
    expect(seq[1]).toEqual(['clock', 1000]);
    t.s.setClock(false);
    expect(order(t.sent).at(-1)).toEqual(['stop', 1400]);
    const n = t.sent.length;
    t.run(3000);
    expect(t.sent.slice(n).filter(([, d]) => d[0] >= 0xf8)).toEqual([]);
  });

  it('stops on the old port and starts on the new one at the next loop', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1));
    t.run(500);
    const other: Sent[] = [];
    t.s.setPort({ send: (d, at) => void other.push([at ?? t.now, d]) }, 0);
    // Then nothing more to it.
    expect(order(t.sent).at(-1)).toEqual(['stop', 500]);
    const n = t.sent.length;
    t.run(1400);
    expect(t.sent).toHaveLength(n);
    expect(order(other).filter(([k]) => typeof k === 'string')[0]).toEqual(['start', 1200]);
  });

  it('runs on through a change of channel alone, as clock has no channel', () => {
    const t = clocked(60);
    t.run(500);
    t.s.setPort(t.port, 3);
    t.run(1000);
    expect(t.sent.filter(([, d]) => d[0] === STOP || d[0] === START)).toHaveLength(1);
    // Every pulse from Start out to the look-ahead, none missed: beat 0.9 heard at 1,100.
    close(
      pulses(t.sent),
      Array.from({ length: Math.ceil(0.9 * 24) }, (_, k) => 200 + (k * 1000) / 24)
    );
  });

  it('turned on, starts at the next loop none of whose notes is sent, so Start goes before the first', () => {
    const t = setup();
    start(t, loop([[0, 60, 0.5]], 1));
    // At 920 the look-ahead has crossed into loop 1 (heard at 1,000) but sent none of it; at 950, its note.
    t.run(920);
    expect(ons(t.sent).map(([at]) => at)).toEqual([0]);
    t.s.setClock(true);
    t.run(1000);
    const seq = order(t.sent);
    const s0 = seq.findIndex(([k]) => k === 'start');
    expect(seq.slice(s0, s0 + 3)).toEqual([
      ['start', 1000],
      ['clock', 1000],
      [0x90, 1000],
    ]);
    // Turned on again once the note has gone, it waits for loop 2.
    t.s.setClock(false);
    t.s.setClock(true);
    t.run(2000);
    expect(t.sent.filter(([, d]) => d[0] === START).map(([at]) => at)).toEqual([1000, 2000]);
  });

  it('starts on a new port at the loop notes are placed from, if it is still to come', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1));
    // At 1,150 the look-ahead is in loop 1 (heard at 1,200) and has sent its note; then another output is chosen.
    t.run(1150);
    expect(ons(t.sent).map(([at]) => at)).toEqual([200, 1200]);
    const other: Sent[] = [];
    t.s.setPort({ send: (d, at) => void other.push([at ?? t.now, d]) }, 0);
    t.run(1300);
    // On it, Start at 1,200, then that loop's note sent again after it; not a whole loop later.
    expect(order(other).slice(0, 3)).toEqual([
      ['start', 1200],
      ['clock', 1200],
      [0x90, 1200],
    ]);
  });

  it('keeps Start behind a Stop still on its way on a port it comes back to', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1), 260);
    t.run(200);
    // Start is on its way for 260; the port goes (Synth only) and comes back at 210: Stop goes at 260, after it, and
    // the run's beat 0 is still to come, so the clock starts there again, after that Stop rather than ahead of it.
    t.now = 210;
    t.s.setPort(null, 0);
    t.s.setPort(t.port, 0);
    t.run(1300);
    const rt = order(t.sent).filter(([k]) => typeof k === 'string');
    expect(rt.filter(([k]) => k !== 'clock')).toEqual([
      ['start', 260],
      ['stop', 260],
      ['start', 260],
    ]);
  });

  it('starts at the run’s start when turned on before anything of it is sent', () => {
    const t = setup();
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 1), bpm: 60, run: 1 });
    t.s.setClock(true);
    t.s.event(ev({ frame: 200 }));
    t.run(200);
    expect(order(t.sent).slice(0, 2)).toEqual([
      ['start', 200],
      ['clock', 200],
    ]);
  });

  it('stops when the timer was held up past a pulse, and starts again in step at the next loop', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1));
    t.run(200);
    // Nothing pumps from 200 to 700 (a background tab): the pulses from 300 on are long gone.
    t.now = 700;
    t.s.pump();
    const seq = order(t.sent).filter(([k]) => typeof k === 'string');
    // Neither a burst of late pulses nor a count left behind: Stop after what was sent, then Start at 1,200.
    expect(seq.filter(([, at]) => (at as number) > 300 && (at as number) < 1200)).toEqual([
      ['stop', 700],
    ]);
    t.run(1300);
    expect(
      order(t.sent)
        .filter(([k]) => typeof k === 'string')
        .slice(seq.length)
    ).toEqual(
      expect.arrayContaining([
        ['start', 1200],
        ['clock', 1200],
      ])
    );
  });

  it('stops after a Start already handed over for later, when turned off before it', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1), 260);
    t.run(200);
    // Start was handed over at 200 for 260; turned off at 210, Stop goes at 260 too, after it.
    t.now = 210;
    t.s.setClock(false);
    expect(
      order(t.sent)
        .filter(([k]) => typeof k === 'string')
        .at(-1)
    ).toEqual(['stop', 260]);
  });

  it('starts the next run after the last one’s Stop at its end, though Play comes before it', () => {
    const t = clocked(60, loop([[0, 60, 0.5]], 1));
    t.s.message({ type: 'patternNext', loop: null });
    t.run(1150);
    // The end's Stop is handed over for 1,200; Play again at 1,150, its loop heard at 1,160.
    const stopAt = t.sent.filter(([, d]) => d[0] === STOP).map(([at]) => at);
    expect(stopAt).toEqual([1200]);
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 1), bpm: 60, run: 2 });
    t.s.event(ev({ frame: 1160 }));
    t.s.pump();
    // A Start at 1,160 would land before that Stop, so the clock starts at the next loop, 2,160.
    t.run(2200);
    const starts = t.sent.filter(([, d]) => d[0] === START).map(([at]) => at);
    expect(starts).toEqual([200, 2160]);
  });

  it('waits for the next loop for a Start whose beat passed while the timer was held up', () => {
    const t = setup();
    t.s.setClock(true);
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 1), bpm: 60, run: 1 });
    t.s.event(ev({ frame: 0 }));
    t.now = 300;
    t.s.pump();
    expect(t.sent.filter(([, d]) => d[0] === START)).toEqual([]);
    t.run(1000);
    expect(order(t.sent).filter(([k]) => typeof k === 'string')[0]).toEqual(['start', 1000]);
  });

  it('keeps the run’s Start at its start through a silence before it is sent', () => {
    const t = setup();
    t.s.setClock(true);
    t.s.message({ type: 'pattern', loop: loop([[0, 60, 0.5]], 4), bpm: 60, run: 1 });
    t.s.event(ev({ frame: 200 }));
    t.s.setPort(t.port, 1);
    t.run(200);
    expect(order(t.sent).filter(([k]) => typeof k === 'string')[0]).toEqual(['start', 200]);
  });
});

describe('mod lanes as CCs (t-90)', () => {
  /** A lane on `x` sent as CC 74, its value as it is. */
  const lookup = (set: Record<string, unknown>): [number, number][] =>
    typeof set.x === 'number' ? [[74, set.x]] : [];
  const modded = (
    notes: PhraseNote[],
    mods: [number, Record<string, number> | null][],
    beats = 1
  ): PatternLoop => ({ notes, beats, mods });
  /** Every message in order, as [time, kind]: a CC as `cc74=v`, a note-on as `on60`. */
  const kinds = (sent: Sent[]) =>
    sent.map(([at, d]) => {
      const k = d[0] & 0xf0;
      if (k === 0xb0) return [at, `cc${d[1]}=${d[2]}`, d[0] & 0x0f];
      if (k === 0x90) return [at, `on${d[1]}`, d[0] & 0x0f];
      if (k === 0x80) return [at, `off${d[1]}`, d[0] & 0x0f];
      return [at, d[0]];
    });
  const ccs = (sent: Sent[]) => kinds(sent).filter(([, k]) => String(k).startsWith('cc74'));

  it('sends each change as its CC on the output’s channel, ahead of a note on the same timestamp', () => {
    const t = setup(2);
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [
          [0, 60, 0.25],
          [0.5, 62, 0.25],
        ],
        [
          [0, { x: 10 }],
          [0.25, { x: 50 }],
          [0.5, { x: 90 }],
        ]
      )
    );
    t.run(900);
    expect(kinds(t.sent).filter(([at]) => (at as number) < 1000)).toEqual([
      [0, 'cc74=10', 2],
      [0, 'on60', 2],
      [250, 'off60', 2],
      [250, 'cc74=50', 2],
      [500, 'cc74=90', 2],
      [500, 'on62', 2],
      [750, 'off62', 2],
    ]);
  });

  it('sends a CC only when its value changes, and nothing for a step with no lane value', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [],
        [
          [0, { x: 10 }],
          [0.25, { x: 10, y: 3 }],
          [0.5, null],
          [0.75, { x: 20 }],
        ]
      )
    );
    t.run(1900);
    // The second loop starts at 10 again after 20.
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [750, 'cc74=20', 0],
      [1000, 'cc74=10', 0],
      [1750, 'cc74=20', 0],
    ]);
  });

  it('sends nothing for a lane without a CC, and nothing at all with none given', () => {
    const t = setup();
    start(t, modded([[0, 60, 0.25]], [[0, { x: 10 }]]));
    t.run(900);
    expect(ons(t.sent)).toHaveLength(1);
    expect(t.sent.filter(([, d]) => (d[0] & 0xf0) === 0xb0)).toEqual([]);

    const u = setup();
    u.s.setCcs(lookup);
    start(u, modded([[0, 60, 0.25]], [[0, { y: 10 }]]));
    u.run(900);
    expect(u.sent.filter(([, d]) => (d[0] & 0xf0) === 0xb0)).toEqual([]);
  });

  it('sends nothing back on Stop: the hardware keeps the last value', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [[0, 60, 0.25]],
        [
          [0, { x: 10 }],
          [0.5, { x: 90 }],
        ]
      )
    );
    t.run(600);
    t.s.message({ type: 'stopPattern' });
    t.run(2000);
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [500, 'cc74=90', 0],
    ]);
  });

  it('sends only the value in effect, now, for an edit the notes have passed: not each change before it', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(t, modded([], [[0, { x: 10 }]], 4));
    t.run(1500);
    // The look-ahead has reached 1,600: the edit is heard from there, where 30 is in effect.
    t.s.message({
      type: 'patternEdit',
      loop: modded(
        [],
        [
          [0, { x: 20 }],
          [1, { x: 30 }],
          [2, { x: 40 }],
        ],
        4
      ),
    });
    t.s.pump();
    t.run(2100);
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [1500, 'cc74=30', 0],
      [2000, 'cc74=40', 0],
    ]);
  });

  it('sends the value in effect once a CC is given mid-run, then each change', () => {
    const t = setup();
    start(
      t,
      modded(
        [],
        [
          [0, { x: 10 }],
          [0.25, { x: 20 }],
          [0.5, { x: 30 }],
        ]
      )
    );
    t.run(300);
    t.s.setCcs(lookup);
    t.s.pump();
    t.run(600);
    expect(ccs(t.sent)).toEqual([
      [300, 'cc74=20', 0],
      [500, 'cc74=30', 0],
    ]);
  });

  it('sends the value in effect to a new port, which has had none', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(t, modded([], [[0, { x: 10 }]], 4));
    t.run(1000);
    const other: Sent[] = [];
    t.s.setPort({ send: (data, at) => void other.push([at ?? t.now, data]) }, 0);
    t.s.pump();
    expect(ccs(other)).toEqual([[1000, 'cc74=10', 0]]);
  });

  /** Lanes on `x` and `y` sent as CC 74 and CC 71. */
  const both = (set: Record<string, unknown>): [number, number][] => [
    ...(typeof set.x === 'number' ? [[74, set.x] as [number, number]] : []),
    ...(typeof set.y === 'number' ? [[71, set.y] as [number, number]] : []),
  ];
  const cc71 = (sent: Sent[]) => kinds(sent).filter(([, k]) => String(k).startsWith('cc71'));

  it('sends a lane given a CC mid-run its value in effect, beside a lane that already had one', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [],
        [
          [0, { x: 10, y: 5 }],
          [0.5, { x: 20 }],
        ]
      )
    );
    t.run(300);
    t.s.setCcs(both);
    t.s.pump();
    t.run(600);
    expect(cc71(t.sent)).toEqual([[300, 'cc71=5', 0]]);
    expect(ccs(t.sent).map(([at]) => at)).toEqual([0, 300, 500]);
  });

  it('catches up each CC on its own: a lane set only on an earlier passed change keeps its value', () => {
    const t = setup();
    t.s.setCcs(both);
    start(t, modded([], [[0, { x: 1 }]], 4));
    t.run(1500);
    t.s.message({
      type: 'patternEdit',
      loop: modded(
        [],
        [
          [0, { x: 2, y: 2 }],
          [1, { y: 3 }],
        ],
        4
      ),
    });
    t.s.pump();
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=1', 0],
      [1500, 'cc74=2', 0],
    ]);
    expect(cc71(t.sent)).toEqual([[1500, 'cc71=3', 0]]);
  });

  it('sends an edit’s change still to come at its time, not now', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(t, modded([], [[0, { x: 10 }]], 4));
    t.run(1500);
    t.s.message({
      type: 'patternEdit',
      loop: modded(
        [],
        [
          [0, { x: 10 }],
          [1.56, { x: 50 }],
        ],
        4
      ),
    });
    t.s.pump();
    // 10, in effect, again now (an edit sends what is in effect, whatever was sent); 50 at its own time.
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [1500, 'cc74=10', 0],
      [1560, 'cc74=50', 0],
    ]);
  });

  it('after a held-up timer across loops, sends only the value in effect, not each loop’s last', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [],
        [
          [0, { x: 10 }],
          [0.5, { x: 20 }],
        ]
      )
    );
    t.s.pump();
    t.now = 3200;
    t.s.pump();
    t.run(3600);
    // At 3,200 the fourth loop is in its first half, at 10, which the hardware already has.
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [3500, 'cc74=20', 0],
    ]);
  });

  it('sends an edit’s value again after a value already handed over for later on that CC', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(
      t,
      modded(
        [],
        [
          [0, { x: 10 }],
          [0.55, { x: 100 }],
        ]
      )
    );
    t.run(475);
    // 100 is on its way for 550. The edit has no change there: 20 from the start.
    t.s.message({ type: 'patternEdit', loop: modded([], [[0, { x: 20 }]]) });
    t.s.pump();
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [550, 'cc74=100', 0],
      [475, 'cc74=20', 0],
      [550, 'cc74=20', 0],
    ]);
  });

  it('sends a value already sent again after an edit, as the hardware may have had another since', () => {
    const t = setup();
    t.s.setCcs(lookup);
    start(t, modded([], [[0, { x: 10 }]], 4));
    t.run(500);
    t.s.message({ type: 'patternEdit', loop: modded([], [[0, { x: 10 }]], 4) });
    t.s.pump();
    expect(ccs(t.sent)).toEqual([
      [0, 'cc74=10', 0],
      [500, 'cc74=10', 0],
    ]);
  });
});

describe('the patch Play calls up (f-midi-hardware-lead t-92)', () => {
  const l = loop([
    [0, 60, 0.5],
    [0.5, 62, 0.5],
  ]);
  /** Program changes and bank selects, as [time, data]. */
  const patch = (sent: Sent[]) =>
    sent.filter(
      ([, d]) => (d[0] & 0xf0) === 0xc0 || ((d[0] & 0xf0) === 0xb0 && (d[1] === 0 || d[1] === 32))
    );

  it('sends nothing but the notes with none set, as to begin with', () => {
    const t = setup();
    start(t, l);
    t.run(900);
    expect(patch(t.sent)).toEqual([]);
    expect(t.sent[0]).toEqual([0, [0x90, 60, 108]]);
    expect(ons(t.sent)[0]).toEqual([0, 60, 108]);
  });

  it('sends a program alone on the channel, as the run starts', () => {
    const t = setup(4);
    t.s.setProgram({ program: 7 });
    start(t, l);
    t.run(900);
    expect(patch(t.sent)).toEqual([[0, [0xc4, 7]]]);
    expect(t.sent[0]).toEqual([0, [0xc4, 7]]);
  });

  it('sends bank MSB, then LSB, then the program, each bank byte only if given', () => {
    const t = setup(1);
    t.s.setProgram({ program: 127, msb: 2, lsb: 5 });
    start(t, l);
    t.run(900);
    expect(patch(t.sent)).toEqual([
      [0, [0xb1, 0, 2]],
      [0, [0xb1, 32, 5]],
      [0, [0xc1, 127]],
    ]);
    const u = setup(1);
    u.s.setProgram({ program: 3, lsb: 9 });
    start(u, l);
    expect(patch(u.sent)).toEqual([
      [0, [0xb1, 32, 9]],
      [0, [0xc1, 3]],
    ]);
  });

  it('leads the first note by the settle time, and leaves a note due after it where it is', () => {
    const t = setup();
    t.s.setProgram({ program: 0 });
    start(t, l);
    t.run(900);
    // The patch at 0, before any note; 60 due at 0 waits for the patch to load, 62 at 500 is past it.
    const pc = t.sent.findIndex(([, d]) => (d[0] & 0xf0) === 0xc0);
    const firstOn = t.sent.findIndex(([, d]) => (d[0] & 0xf0) === 0x90);
    expect(pc).toBeLessThan(firstOn);
    expect(ons(t.sent)).toEqual([
      [PROGRAM_LEAD_MS, 60, 108],
      [500, 62, 108],
    ]);
    expect(offs(t.sent)[0]).toEqual([500, 60]);
  });

  it('holds a lane’s CC on the first beat behind the patch too, which would otherwise set it back', () => {
    const t = setup();
    t.s.setCcs(() => [[74, 100]]);
    t.s.setProgram({ program: 0 });
    start(t, { notes: [[0, 60, 0.5]], beats: 1, mods: [[0, { cutoff: 1 }]] });
    t.run(200);
    const cc = t.sent.filter(([, d]) => (d[0] & 0xf0) === 0xb0 && d[1] === 74);
    expect(cc).toEqual([[PROGRAM_LEAD_MS, [0xb0, 74, 100]]]);
  });

  it('calls it up again on the next Play, after letting go of the run before', () => {
    const t = setup();
    t.s.setProgram({ program: 5 });
    start(t, l);
    t.run(200);
    t.s.message({ type: 'stopPattern' });
    t.now = 300;
    start(t, l, 300);
    const pcs = t.sent.filter(([, d]) => (d[0] & 0xf0) === 0xc0).map(([at]) => at);
    expect(pcs).toEqual([0, 300]);
    const second = t.sent.findIndex(([at, d]) => at === 300 && (d[0] & 0xf0) === 0xc0);
    const letGo = t.sent.findIndex(([, d]) => d[1] === ALL_NOTES_OFF);
    expect(letGo).toBeGreaterThan(-1);
    expect(letGo).toBeLessThan(second);
  });

  it('sends none for a run started part-way, as a MIDI Continue: the patch went at its Start', () => {
    const t = setup();
    t.s.setProgram({ program: 5 });
    t.s.message({ type: 'pattern', loop: l, bpm: 60, run: 1, index: 2, beat: 0.25 });
    t.s.event(ev({ index: 2, beat: 0.25, frame: 0 }));
    t.run(900);
    expect(patch(t.sent)).toEqual([]);
    expect(ons(t.sent)[0]).toEqual([250, 62, 108]);
  });

  it('sends none for a program or bank that isn’t a MIDI byte', () => {
    for (const p of [
      { program: 128 },
      { program: -1 },
      { program: 1.5 },
      { program: 1, msb: 200 },
    ]) {
      const t = setup();
      t.s.setProgram(p);
      start(t, l);
      expect(patch(t.sent)).toEqual([]);
    }
  });

  it('sends none with no output, and nothing after it is set to none', () => {
    const t = setup();
    t.s.setProgram({ program: 5 });
    t.s.setPort(null, 0);
    start(t, l);
    t.s.setProgram(null);
    t.s.setPort(t.port, 0);
    start(t, l);
    expect(patch(t.sent)).toEqual([]);
  });
});
