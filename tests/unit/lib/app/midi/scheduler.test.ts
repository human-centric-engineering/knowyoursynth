/**
 * MIDI out's scheduler (`f-midi-out` t-88): the pattern's notes timed from the pattern player's `loop` events, sent a
 * look-ahead at a time, with the player's held-note rules, and everything let go on Stop, at the end and on a change of
 * port.
 *
 * The clock is a fake that reads frames as milliseconds (a 1 kHz context, heard as soon as it is rendered), and the
 * port records what it is sent and when. `run` pumps the way the page's timer does, every 25 ms.
 *
 * @see lib/app/midi/scheduler.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_NOTES_OFF,
  LOOKAHEAD_MS,
  createMidiScheduler,
  midiVelocity,
  type MidiPort,
} from '@/lib/app/midi/scheduler';
import type { LoopEvent, PatternLoop } from '@/lib/app/synths/audio/pattern-player';
import type { PhraseNote } from '@/lib/app/synths/contract';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { PatternSchema, newPattern, type Pattern } from '@/lib/app/sequencer/pattern';

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

  it('lets go on Stop of everything sent, after the last note-on already on its way, then All Notes Off', () => {
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
    // Now, and again at 80 so the let-go cannot arrive before the note-on it answers.
    expect(offs(t.sent)).toEqual([
      [10, 60],
      [10, 64],
      [80, 60],
      [80, 64],
    ]);
    expect(allOff(t.sent)).toEqual([10, 80]);
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

  it('sends no note outside MIDI’s range, and none of no length', () => {
    const t = setup();
    start(
      t,
      loop([
        [0, 128, 0.1],
        [0, -1, 0.1],
        [0.1, 60, 0],
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
