/**
 * The lane-sound kit (`f-lane-sounds` t-301): the step notation, the lane shapes, and the checks `buildPattern` makes
 * so a lane sound can be its default.
 *
 * @see scripts/app/sounds/lane-kit.ts
 */
import { describe, it, expect } from 'vitest';
import modelD from '@/lib/app/synths/defs/model-d';
import { phraseOf } from '@/lib/app/patterns/library';
import {
  buildPattern,
  buildSong,
  cells,
  checkHands,
  moves,
  cycle,
  holds,
  laneInWords,
  laneReadout,
  laneTweak,
  onNotes,
  tweakNamesLane,
  wheelWordsProblems,
  over,
  wave,
  writeLaneSounds,
  midi,
  ramp,
  up,
  type LanePatternSpec,
  type LaneSoundSpec,
} from '@/scripts/app/sounds/lane-kit';

const A = 'A2! . A2:2 . | C3^ D3 . E3*3';
const spec = (over: Partial<LanePatternSpec> = {}): LanePatternSpec => ({
  name: 'Test',
  role: 'bass_line',
  genre: 'Test',
  bpm: 120,
  root: 9,
  scale: 'chromatic',
  len: 8,
  chain: [0, 1],
  parts: [
    { notes: A, lanes: { 'filter.cutoff': ramp(-2, 2) } },
    { notes: 'D3 . . . | . . . G2', lanes: { 'filter.cutoff': cycle([0, 1]) } },
  ],
  notes: 'A test.',
  key: 'researched:test/test',
  ...over,
});

describe('the notation', () => {
  it('reads notes, holds, accents, slides and ratchets, a token a step', () => {
    expect(midi('C4')).toBe(60);
    expect(midi('F#3')).toBe(54);
    const c = cells(A, 8);
    expect(c.map((x) => x.note)).toEqual([45, null, 45, null, 48, 50, null, 52]);
    expect(c[0].accent).toBe(true);
    expect(c[2].gate).toBe(2);
    expect(c[3].sounding).toBe(45); // held over from the step before
    expect(c[3].since).toBe(1);
    expect(c[4].slide).toBe(true);
    expect(c[5].slidIn).toBe(true);
    expect(c[7].ratchet).toBe(3);
  });

  it('refuses a part of the wrong length, or a token it cannot read', () => {
    expect(() => cells(A, 16)).toThrow(/8 steps, not 16/);
    expect(() => cells('A2 . H2 .', 4)).toThrow(/not a step: H2/);
  });

  it('moves a part by octaves', () => {
    expect(up(1, 'A1 . C#2 Bb0')).toBe('A2 . C#3 Bb1');
  });

  it('holds a lane value from where it is set', () => {
    const lane = holds({ 0: 1, 4: 5 });
    expect(cells('. . . . . . . .', 8).map(lane)).toEqual([1, 1, 1, 1, 5, 5, 5, 5]);
  });
});

describe('buildPattern', () => {
  it('builds a chained, laned pattern whose riff is part A', () => {
    const p = buildPattern(modelD, spec());
    expect(p.chain).toEqual([0, 1]);
    expect(p.lanes).toEqual(['filter.cutoff']);
    expect(p.parts[0].steps[0].mod).toEqual({ 'filter.cutoff': -2 });
    expect(p.parts[0].steps[7]).toMatchObject({ ratchet: 3, mod: { 'filter.cutoff': 2 } });
    expect(phraseOf(p).steps[0]).toEqual([0, 45, 0.25, 1]);
  });

  it('ends a swung note where the step after it starts, late or not', () => {
    const swung = spec({ swing: 62 });
    swung.parts[0] = { notes: 'A2! . A2:2 . | C3^ D3 E3:2 .', lanes: swung.parts[0].lanes };
    const p = buildPattern(modelD, swung);
    // Starts late, ends on the grid: shorter by the push.
    expect(p.parts[0].steps[5].notes[0].gate).toBe(0.76);
    // Starts on the grid, ends where a late step starts: longer by it, so no gap opens before that step.
    expect(p.parts[0].steps[0].notes[0].gate).toBe(1.24);
    expect(p.parts[0].steps[2].notes[0].gate).toBe(2);
    const late = spec({ swing: 62 });
    late.parts[0] = { notes: '. A2:2 . A2 | . . . A2', lanes: late.parts[0].lanes };
    // Starts late and ends late: as written.
    expect(buildPattern(modelD, late).parts[0].steps[1].notes[0].gate).toBe(2);
    // A gate ending inside a step has no swung start to end on, so a swung part refuses one.
    const part = spec({ swing: 62 });
    part.parts[0] = { notes: 'A2:1.5 . . A2 | . . . A2', lanes: part.parts[0].lanes };
    expect(() => buildPattern(modelD, part)).toThrow(
      /a swung note holds whole steps, not 1.5 \(step 1\)/
    );
  });

  it('checks a lane value as it is stored, rounded', () => {
    // 5.004 rounds to CUTOFF's top, 5: kept, not refused as past it.
    const edge = spec();
    edge.parts[0] = { notes: A, lanes: { 'filter.cutoff': () => 5.004 } };
    expect(buildPattern(modelD, edge).parts[0].steps[0].mod).toEqual({ 'filter.cutoff': 5 });
  });

  it('refuses what could not be the sound’s default, or a value its control cannot take', () => {
    expect(() => buildPattern(modelD, spec({ chain: [0, 0] }))).toThrow(/one part/);
    expect(() => buildPattern(modelD, spec({ chain: [1, 0] }))).toThrow(/starts with part B/);
    const rests = spec();
    rests.parts[0] = { notes: 'A2 . . . | . . . .', lanes: rests.parts[0].lanes };
    expect(() => buildPattern(modelD, rests)).toThrow(/rests/);
    const out = spec();
    out.parts[0] = { notes: A, lanes: { 'filter.cutoff': () => 9 } };
    expect(() => buildPattern(modelD, out)).toThrow(/outside -5..5/);
    const wrong = spec();
    wrong.parts[0] = { notes: A, lanes: { 'osc1.wave': () => 'sine' } };
    expect(() => buildPattern(modelD, wrong)).toThrow(/cannot take sine/);
    const none = spec();
    none.parts = [
      { notes: A, lanes: {} },
      { notes: A, lanes: {} },
    ];
    expect(() => buildPattern(modelD, none)).toThrow(/one or two controls/);
  });
});

describe('buildSong (t-304)', () => {
  const plain = { notes: A, lanes: {} };
  const b = { notes: 'D3 . . . | . . . G2', lanes: {} };

  it('needs no lanes, carries the effects it brings, and still chains two parts', () => {
    const fx = { delay: { time: 0.3, feedback: 0.3, mix: 0.2 } };
    const p = buildSong(modelD, { ...spec(), parts: [plain, b], fx });
    expect(p.lanes).toBeUndefined();
    expect(p.fx).toEqual(fx);
    expect(p.chain).toEqual([0, 1]);
    expect(() => buildPattern(modelD, spec({ parts: [plain, b] }))).toThrow(/one or two controls/);
  });

  it('keeps a part A given as steps exactly, so the sound it is built on keeps its riff', () => {
    const from = buildSong(modelD, { ...spec(), parts: [plain, plain] });
    const p = buildSong(modelD, { ...spec(), parts: [{ steps: from.parts[0].steps }, b] });
    expect(p.parts[0]).toEqual(from.parts[0]);
    expect(phraseOf(p)).toEqual(phraseOf(from));
    expect(() =>
      buildSong(modelD, { ...spec(), parts: [{ steps: from.parts[0].steps.slice(1) }, b] })
    ).toThrow(/part A has 7 steps/);
  });
});

describe('the lesson', () => {
  it('writes each step with a readout per control, at that step’s panel, and the riff given', () => {
    const [sound] = writeLaneSounds(
      modelD,
      { names: { 'mix.osc1': 'Osc 1 VOLUME' }, options: { saw: 'sawtooth' } },
      [
        {
          spec: {
            id: 'lane-test',
            name: 'Lane Test',
            ref: 'A test',
            artist: 'Test',
            tags: ['bass'],
            level: 1,
            blurb: 'A test.',
            how: 'A test.',
            steps: [
              {
                title: 'Set it',
                module: 'osc',
                why: 'Because.',
                set: {
                  'osc1.wave': 'saw',
                  'mix.osc1': 7,
                  'filter.kbd1': true,
                  'filter.cutoff': -1,
                },
                listen: 'a tone.',
              },
            ],
            context: {},
            tweaks: [laneTweak('filter.cutoff', 'draw it.', 'It moves.')],
            pattern: spec(),
          },
          riff: [[0, 45, 0.25]],
          bpm: 120,
        },
      ]
    );
    expect(sound.phrase).toEqual({ bpm: 120, loop: true, steps: [[0, 45, 0.25]] });
    expect(sound.steps[0].why.split('\n')).toEqual([
      'Because.',
      '- Osc 1 waveform sawtooth',
      '- Osc 1 VOLUME 7',
      '- Keyboard control 1 on',
      '- CUTOFF FREQUENCY -1 (317 Hz)',
      '- Listen for: a tone.',
    ]);
    expect(sound.tweaks[0].try).toBe("In the sequencer's Mod lanes, draw it.");
  });

  it('shapes lanes: a wave from its low point, values on notes only, one lane over another', () => {
    const c = cells('A2 . . A2', 4);
    expect(c.map(wave(0, 2, 4))).toEqual([0, 1, 2, 1].map((v) => expect.closeTo(v, 9)));
    expect(c.map(onNotes(5, null))).toEqual([5, null, null, 5]);
    expect(c.map(over(cycle([1]), onNotes(5, null)))).toEqual([5, 1, 1, 5]);
  });

  it('moves a hand between positions in straight lines, resting before the first and after the last', () => {
    const c = cells('A2 . . A2 . . . A2', 8);
    expect(c.map(moves({ 1: 0, 3: 4, 5: 2 }))).toEqual([0, 0, 2, 4, 3, 2, 2, 2]);
    expect(c.map(moves({}))).toEqual(Array(8).fill(null));
  });
});

describe('checkHands', () => {
  const sound = (lanes: LanePatternSpec['parts'][number]['lanes']) => {
    const pattern = buildPattern(
      modelD,
      spec({
        parts: [
          { notes: A, lanes },
          { notes: A, lanes },
        ],
      })
    );
    const [preset] = writeLaneSounds(modelD, { names: {}, options: {} }, [
      {
        spec: {
          id: 'lane-hands',
          name: 'Lane Hands',
          ref: 'A test',
          artist: 'Test',
          tags: ['bass'],
          level: 1,
          blurb: 'A test.',
          how: 'A test.',
          steps: [
            {
              title: 'Close it',
              module: 'filter',
              why: 'Dark.',
              set: { 'filter.cutoff': -2 },
              listen: 'dark.',
            },
          ],
          context: {},
          tweaks: [],
          pattern: spec(),
        },
        riff: phraseOf(pattern).steps,
        bpm: pattern.bpm,
      },
    ]);
    return { pattern, preset };
  };

  it('passes a lane a hand can play, read against the panel the sound sets', () => {
    const { pattern, preset } = sound({ 'filter.cutoff': ramp(-2, -1) });
    expect(() => checkHands(modelD, preset, pattern)).not.toThrow();
  });

  it('refuses one no hand could, naming the sound and each problem', () => {
    // Set on the notes only: the rests fall back to the sound's -2, a 50% jump each way.
    const { pattern, preset } = sound({ 'filter.cutoff': (c) => (c.note === null ? null : 3) });
    expect(() => checkHands(modelD, preset, pattern)).toThrow(
      /^Lane Hands: no hand could play it:\n {2}filter\.cutoff: moves 50% of its travel/
    );
  });
});

describe('a mod wheel lane (t-312)', () => {
  const wheelSpec = (over: Partial<LaneSoundSpec> = {}): LaneSoundSpec => ({
    id: 'wheel-test',
    name: 'Wheel Test',
    ref: 'A test',
    artist: 'Test',
    tags: ['lead'],
    level: 1,
    blurb: 'A test.',
    how: 'The mod wheel brings the vibrato in.',
    steps: [
      {
        title: 'Vibrato on the wheel',
        module: 'mod',
        why: 'MOD DEPTH stays at 0: the wheel brings it in.',
        set: { 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'a still note.',
      },
    ],
    context: { 'mod.depth': 'Stays at 0: the mod wheel lane brings it in.' },
    tweaks: [laneTweak('mod.depth', 'redraw the mod wheel lane higher.', 'Wider.')],
    pattern: spec({
      parts: [
        { notes: A, lanes: { '@wheel': ramp(0, 0.0123) } },
        { notes: A, lanes: { '@wheel': ramp(0.0123, 0) } },
      ],
    }),
    ...over,
  });
  const write = (s: LaneSoundSpec) =>
    writeLaneSounds(modelD, { names: {}, options: {} }, [
      { spec: s, riff: [[0, 45, 0.25]], bpm: 120 },
    ]);

  it('is played as the wheel, kept to a thousandth of its travel', () => {
    const p = buildPattern(modelD, wheelSpec().pattern);
    expect(p.lanes).toEqual(['@wheel']);
    // A knob keeps a hundredth of its 0..10; the wheel runs 0..1, so it keeps the same share of its travel.
    expect(p.parts[0].steps[7].mod).toEqual({ '@wheel': 0.012 });
  });

  it('is named in readouts and words, and a tweak is about it when it says to move the mod wheel', () => {
    expect(laneReadout(modelD, { names: {}, options: {} }, '@wheel', 0.25, {})).toBe(
      'Mod wheel 0.25 (25%)'
    );
    expect(laneInWords('@wheel')).toBe('the mod wheel');
    expect(laneInWords('filter.cutoff')).toBe('filter.cutoff');
    const t = laneTweak('mod.depth', 'redraw the mod wheel lane.', 'Wider.');
    expect(tweakNamesLane(t, '@wheel')).toBe(true);
    expect(tweakNamesLane(t, 'mod.depth')).toBe(true);
    expect(tweakNamesLane(laneTweak('mod.depth', 'redraw it.', 'Wider.'), '@wheel')).toBe(false);
  });

  it('writes a lesson that says the wheel plays it', () => {
    expect(wheelWordsProblems(wheelSpec())).toEqual([]);
    expect(() => write(wheelSpec())).not.toThrow();
  });

  it('refuses a lesson that still teaches the knob the wheel now plays', () => {
    const knob = wheelSpec({
      how: 'MOD DEPTH brings the vibrato in.',
      steps: [{ ...wheelSpec().steps[0], why: 'MOD DEPTH stays at 0 for the lane.' }],
      context: { 'mod.depth': 'The other lane: the depth lane brings vibrato in.' },
      tweaks: [laneTweak('mod.depth', 'redraw the depth lane higher.', 'Wider.')],
    });
    expect(wheelWordsProblems(knob)).toEqual([
      'Wheel Test: its how never names the mod wheel',
      'Wheel Test: no step says the wheel brings the modulation in',
      'Wheel Test: no tweak redraws the mod wheel lane',
      'Wheel Test: its words still call the wheel the depth lane',
    ]);
    expect(() => write(knob)).toThrow(/its how never names the mod wheel/);
    // A sound with no wheel lane has nothing to say about one.
    expect(wheelWordsProblems({ ...knob, pattern: spec() })).toEqual([]);
  });

  it('refuses a lesson step that sets the wheel, which is no panel control', () => {
    const sets = wheelSpec({
      steps: [{ ...wheelSpec().steps[0], set: { 'mod.depth': 0, '@wheel': 0.5 } }],
    });
    expect(() => write(sets)).toThrow(
      /"Vibrato on the wheel" sets @wheel, which is no panel control/
    );
  });

  it('reads the hand check from the wheel at rest', () => {
    const jump = wheelSpec({
      pattern: spec({
        parts: [
          { notes: A, lanes: { '@wheel': () => 1 } },
          { notes: A, lanes: { '@wheel': () => 1 } },
        ],
      }),
    });
    const [preset] = write(jump);
    // Held at the top all song: no move, so nothing for a hand to refuse.
    expect(() => checkHands(modelD, preset, buildPattern(modelD, jump.pattern))).not.toThrow();
    const flick = wheelSpec({
      pattern: spec({
        parts: [
          { notes: A, lanes: { '@wheel': (c) => (c.i === 0 ? 1 : null) } },
          { notes: A, lanes: { '@wheel': (c) => (c.i === 0 ? 1 : null) } },
        ],
      }),
    });
    // A step the lane leaves alone is the wheel at rest, down: up the whole way and back in a step is no hand's.
    expect(() => checkHands(modelD, write(flick)[0], buildPattern(modelD, flick.pattern))).toThrow(
      /@wheel: moves 100% of its travel/
    );
  });
});
