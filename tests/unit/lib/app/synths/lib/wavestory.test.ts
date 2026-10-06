/**
 * Wave story tests: the words the oscilloscope panel says about the trace it is drawing, stage by stage, and
 * which controls, cables and the mod wheel are attributed to each stage as `on` (shaping it now) or `zero`
 * (would, once raised from nothing). Every assertion checks a fact the engine params actually produced — a
 * specific Hz figure, a specific control key in the right on/zero list — not just that some text came back.
 *
 * @see lib/app/synths/lib/wavestory.ts
 */
import { describe, expect, it } from 'vitest';
import { noteAt, waveStory } from '@/lib/app/synths/lib/wavestory';
import { expMap } from '@/lib/app/synths/lib/maps';
import type {
  ControlValues,
  EngineContext,
  EngineParams,
  SynthDef,
} from '@/lib/app/synths/contract';
import { makeMiniD, miniToEngine } from '@/tests/fixtures/synths/mini-d';

/** A SynthDef whose toEngine runs the real mini-d mapping, then layers on extra engine fields no control
 * reaches (od, rev, hpf, noise.tone, forced osc semis/syncTo/kbd…) — the only way to drive wavestory's richer
 * text branches without a bigger fixture. */
function withExtra(mutate: (p: EngineParams, v: ControlValues) => EngineParams): SynthDef {
  return makeMiniD({
    toEngine: (v: ControlValues, _ctx: EngineContext) => mutate(miniToEngine(v), v),
  });
}

describe('waveStory — default panel', () => {
  const def = makeMiniD();
  const story = waveStory(def, def.init, [], 0);

  it('reports no error and the filter cutoff in Hz, computed the same way toEngine computes it', () => {
    const expectedCutoff = expMap((0 + 5) / 10, 20, 20000);

    expect(story.error).toBe('');
    expect(story.cutoff).toBeCloseTo(expectedCutoff, 5);
  });

  it('writes one source into the mixer, the external input, the loudness contour and the echo, in their own stages', () => {
    const byId = (id: string) => story.stages.find((s) => s.id === id);

    expect(byId('shape')?.text).toContain('One source is in the mixer');
    expect(byId('mix')?.text).toContain('the external input at 100%');
    // ext.level is a constant 1 in the fixture, so the mixer always lists more than one source and never
    // takes the "single level" branch of mixText — see the dedicated ext-zeroed test below for that branch.
    expect(byId('filter')?.text).toContain('632 Hz');
    expect(byId('filter')?.text).toContain('low-pass');
    expect(byId('amp')?.text).toContain('The loudness contour sets the height of the trace');
    expect(byId('amp')?.text).toContain('The attack is short');
    expect(byId('move')?.text).toBe(
      'Nothing is modulating the voice, so the trace stands still for as long as the note is held.'
    );
    expect(byId('dirt')?.text).toContain('The echo is on');
    expect(byId('level')?.text).toBe(
      'Output volume is at 70%. It scales the whole trace up and down without changing its shape — turn it up for a clearer picture, not a different sound.'
    );
  });

  it('omits stages with nothing to say: no pulse wave and no second oscillator yet', () => {
    expect(story.stages.find((s) => s.id === 'pitch')).toBeUndefined();
    expect(story.stages.find((s) => s.id === 'width')).toBeUndefined();
  });

  it('attributes a muted oscillator level as "zero" and a moving filter cutoff as "on"', () => {
    const mix = story.stages.find((s) => s.id === 'mix');
    const filter = story.stages.find((s) => s.id === 'filter');

    expect(mix?.zero.map((e) => e.key)).toContain('mix.osc2');
    expect(filter?.on.map((e) => e.key)).toContain('filter.cutoff');
  });

  it('leaves a gated dead control out of every stage: osc2.detune cannot be heard while osc 2 is muted', () => {
    const everyKey = story.stages.flatMap((s) => [...s.on, ...s.zero].map((e) => e.key));

    expect(everyKey).not.toContain('osc2.detune');
  });

  it('attributes the idle mod wheel as "zero" under movement, at its own percentage', () => {
    const move = story.stages.find((s) => s.id === 'move');
    const wheelEntry = move?.zero.find((e) => e.key === '@wheel');

    expect(wheelEntry).toBeDefined();
    expect(wheelEntry?.value).toBe('0%');
    expect(wheelEntry?.name).toBe('Mod wheel');
  });
});

describe('waveStory — cable attribution', () => {
  it('attributes a patched cable as "on" under movement, named by its jacks', () => {
    const def = makeMiniD();
    const story = waveStory(def, def.init, [{ from: 'lfo.tri', to: 'cutoff.in' }], 0);

    const move = story.stages.find((s) => s.id === 'move');
    const cable = move?.on.find((e) => e.key === 'lfo.tri>cutoff.in');

    expect(cable).toBeDefined();
    expect(cable?.kind).toBe('cable');
    expect(cable?.name).toBe('LFO TRI → VCF CV');
  });
});

describe('waveStory — mix stage', () => {
  it('flags an overloaded mixer when the sources add past what the filter wants', () => {
    const def = makeMiniD();
    const story = waveStory(def, { ...def.init, 'mix.osc2': 10 }, [], 0);

    expect(story.stages.find((s) => s.id === 'mix')?.text).toContain(
      'Together that is more than the filter wants'
    );
  });

  it('takes the single-source phrasing once the external input is silenced', () => {
    const def = withExtra((p) => ({ ...p, ext: { level: 0 } }));
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'mix')?.text).toContain(
      'That is how much of it reaches the filter, and so how tall the trace is.'
    );
  });
});

describe('waveStory — pitch and width', () => {
  it('spans two octaves, flags a hard-synced oscillator and a fixed-pitch one', () => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[0] = { ...osc[0], semi: -12 };
      osc[1] = { ...osc[1], semi: 12, syncTo: 0 };
      osc[2] = { ...osc[2], level: 0.6, kbd: false };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5 }, [], 0);
    const text = story.stages.find((s) => s.id === 'pitch')?.text ?? '';

    expect(text).toContain('two octaves');
    expect(text).toContain('hard-synced');
    expect(text).toContain('ignores the keyboard');
  });

  it('reports the gap in semitones for a wide, non-octave spread', () => {
    const def = makeMiniD();
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5, 'osc2.detune': 7 }, [], 0);

    expect(story.stages.find((s) => s.id === 'pitch')?.text).toContain('7 semitones');
  });

  it('reports a slow beat in cents for two oscillators close together', () => {
    const def = makeMiniD();
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5, 'osc2.detune': 0.3 }, [], 0);

    expect(story.stages.find((s) => s.id === 'pitch')?.text).toContain('30 cents apart');
  });

  it('reports a glide time once it is set', () => {
    const def = withExtra((p) => ({ ...p, glide: { time: 0.05, legato: false } }));
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'pitch')?.text).toContain('Glide is set to 50 ms');
  });

  it('describes a square-wave pulse width in its own stage', () => {
    const def = makeMiniD();
    const story = waveStory(def, { ...def.init, 'osc1.wave': 'sq' }, [], 0);
    const text = story.stages.find((s) => s.id === 'width')?.text ?? '';

    expect(text).toContain('Oscillator 1 at 50%');
    expect(text).toContain('it is a square');
  });
});

describe('waveStory — amplitude', () => {
  it('reports a slow attack, a zeroed sustain, a drone bias and LFO retrigger together', () => {
    const def = withExtra((p) => ({
      ...p,
      vca: { ...p.vca, bias: 0.3 },
      trig: { ...p.trig, repeat: true },
    }));
    const story = waveStory(def, { ...def.init, 'env2.attack': 10, 'env2.sustain': 0 }, [], 0);
    const text = story.stages.find((s) => s.id === 'amp')?.text ?? '';

    expect(text).toContain('The attack is slow enough to watch');
    expect(text).toContain('Sustain is at zero');
    expect(text).toContain('held 30% open with no key down');
    expect(text).toContain('retriggered by the LFO');
  });
});

describe('waveStory — filter', () => {
  it('describes a band-pass filter at self-oscillation with a downward env sweep and a high-pass pre-stage', () => {
    const def = withExtra((p) => ({
      ...p,
      filter: { ...p.filter, mode: 'bp', res: 0.97, envAmt: -1 },
      hpf: { cutoff: 150, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter')?.text ?? '';

    expect(text).toContain('band-pass');
    expect(text).toContain('self-oscillation');
    expect(text).toContain('down on each note');
    expect(text).toContain('high-pass stage before it, at 150 Hz');
  });

  it('describes a high-pass filter ringing at resonance with an upward env sweep', () => {
    const def = withExtra((p) => ({
      ...p,
      filter: { ...p.filter, mode: 'hp', res: 0.5, envAmt: 1.2 },
    }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter')?.text ?? '';

    expect(text).toContain('throws away the slow part');
    expect(text).toContain('that is the ringing you see');
    expect(text).toContain('up on each note');
  });

  it('describes a notch filter (an SVF morph knob parked halfway between low- and high-pass)', () => {
    const def = withExtra((p) => ({ ...p, filter: { ...p.filter, mode: 'morph', morph: 0.5 } }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter')?.text ?? '';

    expect(text).toContain('notch takes out a band of harmonics');
  });
});

describe('waveStory — dirt', () => {
  it('describes overdrive and reverb alongside the always-on echo', () => {
    const def = withExtra((p) => ({
      ...p,
      od: { on: true, drive: 0.6 },
      rev: { on: true, mix: 0.4 },
    }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'dirt')?.text ?? '';

    expect(text).toContain('The overdrive is on with drive at 60%');
    expect(text).toContain('The spring reverb is on at 40%');
    expect(text).toContain('The echo is on');
  });
});

describe('waveStory — noise', () => {
  it('describes white noise mixed in by default once the noise level is raised', () => {
    const def = makeMiniD();
    const story = waveStory(def, { ...def.init, 'mix.noise': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain('white noise is mixed in');
  });

  it('describes low-frequency noise when the tone control reads low', () => {
    const def = withExtra((p) => ({ ...p, noise: { ...p.noise, tone: 0.1 } }));
    const story = waveStory(def, { ...def.init, 'mix.noise': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain(
      'low-frequency noise is mixed in'
    );
  });
});

describe('waveStory — movement', () => {
  it('describes the running LFO, the routing it drives and the raised mod wheel together', () => {
    const def = makeMiniD();
    const values = { ...def.init, 'mod.toOsc': true, 'mod.depth': 10 };
    const story = waveStory(def, values, [], 0.5);
    const move = story.stages.find((s) => s.id === 'move');

    expect(move?.text).toContain('The LFO is running at 3.16 Hz on triangle');
    expect(move?.text).toContain('Pitch is being moved as the note plays');
    expect(move?.text).toContain('The mod wheel is up at 50%');
    expect(move?.on.map((e) => e.key)).toEqual(
      expect.arrayContaining(['@wheel', 'mod.toOsc', 'mod.depth'])
    );
  });
});

describe('waveStory — error path', () => {
  it('reports the panel error instead of a story when toEngine throws', () => {
    const def = makeMiniD({
      toEngine: () => {
        throw new Error('bad patch');
      },
    });

    const story = waveStory(def, def.init, [], 0);

    expect(story.error).toBe('bad patch');
    expect(story.stages).toEqual([]);
    expect(story.cutoff).toBeNull();
  });
});

describe('noteAt', () => {
  it('names concert A as A4 with no cents error', () => {
    expect(noteAt(440)).toEqual({ name: 'A4', cents: 0 });
  });

  it('reports a positive cents offset for a frequency sharp of the nearest note', () => {
    const r = noteAt(450);

    expect(r?.name).toBe('A4');
    expect(r?.cents).toBeGreaterThan(0);
    expect(r?.cents).toBeLessThan(50);
  });

  it('returns null outside the recognised range, and for no frequency at all', () => {
    expect(noteAt(null)).toBeNull();
    expect(noteAt(undefined)).toBeNull();
    expect(noteAt(0)).toBeNull();
    expect(noteAt(10)).toBeNull();
    expect(noteAt(9000)).toBeNull();
  });
});
