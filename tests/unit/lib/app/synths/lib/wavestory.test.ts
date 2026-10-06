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
  Control,
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

describe('waveStory — morphing oscillator (EngineParams osc.morph, the Kobol WAVEFORM knob)', () => {
  /** Oscillator 1 forced into morph mode at `m`; everything else stays at the default panel. */
  const shapeAt = (m: number): string => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[0] = { ...osc[0], morph: m };
      return { ...p, osc };
    });
    return waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'shape')?.text ?? '';
  };

  it('reads every position of the morph knob as its own waveform, instead of the mix', () => {
    expect(shapeAt(0.03)).toContain('oscillator 1 is a triangle wave');
    expect(shapeAt(0.25)).toContain(
      'oscillator 1 is a lopsided ramp, part way from triangle to sawtooth'
    );
    expect(shapeAt(0.5)).toContain('oscillator 1 is a sawtooth wave');
    expect(shapeAt(0.6)).toContain('oscillator 1 is part way from sawtooth to square');
    expect(shapeAt(0.67)).toContain('oscillator 1 is a square wave');
    expect(shapeAt(0.9)).toContain('oscillator 1 is a narrowing pulse wave');
  });
});

describe('waveStory — gated dead controls (module switched off)', () => {
  it('excludes controls whose only effect lands on noise tone, overdrive, delay or reverb while each is off', () => {
    const gateControls: Control[] = [
      {
        id: 'gate.noiseTone',
        type: 'knob',
        style: 'd-silver',
        r: 25,
        x: 0,
        y: 0,
        module: 'mixer',
        kind: 'cont',
        min: 0,
        max: 10,
        def: 5,
        label: 'Noise Tone',
        help: 'Test-only control: feeds noise.tone while the noise source is off.',
      },
      {
        id: 'gate.odDrive',
        type: 'knob',
        style: 'd-silver',
        r: 25,
        x: 0,
        y: 0,
        module: 'fx',
        kind: 'cont',
        min: 0,
        max: 10,
        def: 5,
        label: 'OD Drive',
        help: 'Test-only control: feeds od.drive while the overdrive is off.',
      },
      {
        id: 'gate.delayTime',
        type: 'knob',
        style: 'd-silver',
        r: 25,
        x: 0,
        y: 0,
        module: 'fx',
        kind: 'cont',
        min: 0,
        max: 10,
        def: 5,
        label: 'Delay Time',
        help: 'Test-only control: feeds delay.time while the echo is off.',
      },
      {
        id: 'gate.revMix',
        type: 'knob',
        style: 'd-silver',
        r: 25,
        x: 0,
        y: 0,
        module: 'fx',
        kind: 'cont',
        min: 0,
        max: 10,
        def: 5,
        label: 'Reverb Mix',
        help: 'Test-only control: feeds rev.mix while the reverb is off.',
      },
    ];
    const def = makeMiniD({
      controls: [...makeMiniD().controls, ...gateControls],
      toEngine: (v: ControlValues, _ctx: EngineContext) => ({
        ...miniToEngine(v),
        noise: { ...miniToEngine(v).noise, tone: Number(v['gate.noiseTone']) / 10 },
        od: { on: false, drive: Number(v['gate.odDrive']) / 10 },
        delay: { on: false, time: Number(v['gate.delayTime']) / 10, fb: 0, mix: 0 },
        rev: { on: false, mix: Number(v['gate.revMix']) / 10 },
      }),
    });

    const story = waveStory(def, def.init, [], 0);
    const everyKey = story.stages.flatMap((s) => [...s.on, ...s.zero].map((e) => e.key));

    expect(everyKey).not.toContain('gate.noiseTone');
    expect(everyKey).not.toContain('gate.odDrive');
    expect(everyKey).not.toContain('gate.delayTime');
    expect(everyKey).not.toContain('gate.revMix');
  });
});

describe('waveStory — nothing in the mixer', () => {
  it('reports a flat line and drops every per-source stage once no oscillator and no noise reaches the mixer', () => {
    const def = withExtra((p) => ({ ...p, ext: { level: 0 } }));
    const story = waveStory(def, { ...def.init, 'mix.osc1': 0 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toBe(
      'Nothing is reaching the mixer, so the trace is a flat line. Turn an oscillator or the noise up.'
    );
    expect(story.stages.find((s) => s.id === 'pitch')).toBeUndefined();
    expect(story.stages.find((s) => s.id === 'mix')).toBeUndefined();
  });

  it('describes pure noise once every oscillator is muted but the noise source is not', () => {
    const def = withExtra((p) => ({ ...p, ext: { level: 0 } }));
    const story = waveStory(def, { ...def.init, 'mix.osc1': 0, 'mix.noise': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toBe(
      'White noise is mixed in as well: it has no repeating shape, so it shows as fuzz on the line.'
    );
  });
});

describe('waveStory — noise tone (the rest of the range)', () => {
  it('describes pink noise once the tone control reads near the middle of its range', () => {
    const def = withExtra((p) => ({ ...p, noise: { ...p.noise, tone: 0.5 } }));
    const story = waveStory(def, { ...def.init, 'mix.noise': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain(
      'pink noise is mixed in as well'
    );
  });

  it('describes white noise when the tone control itself (not the default) reads high', () => {
    const def = withExtra((p) => ({ ...p, noise: { ...p.noise, tone: 0.9 } }));
    const story = waveStory(def, { ...def.init, 'mix.noise': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain(
      'white noise is mixed in as well'
    );
  });
});

describe('waveStory — filter (morph knob parked at either end)', () => {
  it('reads a morph filter parked low as low-pass', () => {
    const def = withExtra((p) => ({ ...p, filter: { ...p.filter, mode: 'morph', morph: 0.1 } }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter')?.text ?? '';

    expect(text).toContain('low-pass');
    expect(text).toContain('rounds the corners off');
  });

  it('reads a morph filter parked high as high-pass', () => {
    const def = withExtra((p) => ({ ...p, filter: { ...p.filter, mode: 'morph', morph: 0.9 } }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter')?.text ?? '';

    expect(text).toContain('high-pass');
    expect(text).toContain('throws away the slow part');
  });

  it('falls back to generic envelope names once the synth defines no signalNames', () => {
    const def = makeMiniD({ signalNames: undefined });
    const story = waveStory(def, { ...def.init, 'filter.contour': 5, 'env2.attack': 10 }, [], 0);

    expect(story.stages.find((s) => s.id === 'filter')?.text).toContain(
      'Envelope 1 moves the cutoff'
    );
    expect(story.stages.find((s) => s.id === 'amp')?.text).toContain('Envelope 2 sets the height');
  });
});

describe('waveStory — filter cutoff in kHz', () => {
  it('formats a cutoff at the very top of the range in kHz with one decimal', () => {
    const story = waveStory(makeMiniD(), { ...makeMiniD().init, 'filter.cutoff': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'filter')?.text).toContain('20.0 kHz');
  });

  it('formats a mid-high cutoff in kHz with two decimals', () => {
    const story = waveStory(makeMiniD(), { ...makeMiniD().init, 'filter.cutoff': 2 }, [], 0);

    expect(story.stages.find((s) => s.id === 'filter')?.text).toContain('2.52 kHz');
  });
});

describe('waveStory — pulse width edge cases', () => {
  it('describes an off-centre pulse as "a pulse", not a square, at its own percentage', () => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[0] = { ...osc[0], pw: 0.2 };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'osc1.wave': 'sq' }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain('oscillator 1 is a pulse');
    expect(story.stages.find((s) => s.id === 'width')?.text).toContain('Oscillator 1 at 20%');
  });

  it('treats a missing pulse width as 50%, reading as a square', () => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[0] = { ...osc[0], pw: undefined };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'osc1.wave': 'sq' }, [], 0);

    expect(story.stages.find((s) => s.id === 'shape')?.text).toContain('oscillator 1 is a square');
    expect(story.stages.find((s) => s.id === 'width')?.text).toContain('Oscillator 1 at 50%');
  });
});

describe('waveStory — pitch (further branches)', () => {
  it('uses plural phrasing once more than one oscillator ignores the keyboard', () => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[0] = { ...osc[0], kbd: false };
      osc[1] = { ...osc[1], kbd: false };
      osc[2] = { ...osc[2], level: 0.5, kbd: true };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5 }, [], 0);
    const text = story.stages.find((s) => s.id === 'pitch')?.text ?? '';

    expect(text).toContain('Oscillator 1 and oscillator 2 ignore the keyboard');
    expect(text).toContain('those parts stays put');
  });

  it('reports a single-octave spread as "an octave", not "two octaves"', () => {
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[1] = { ...osc[1], semi: 12 };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5 }, [], 0);

    expect(story.stages.find((s) => s.id === 'pitch')?.text).toContain(
      'an octave, so the higher one puts a ripple'
    );
  });

  it('reports the closest pair, skipping an update when a later pair is not actually closer', () => {
    // Three oscillators at 0, 0.3 and 0.5 semitones: pair (osc1, osc3) at 0.5 is checked after the
    // 0.3 beat is already found and is not closer, so the running minimum must not update to it —
    // only the final (osc2, osc3) pair at 0.2 should win.
    const def = withExtra((p) => {
      const osc = [...p.osc];
      osc[2] = { ...osc[2], level: 0.5, semi: 0.5 };
      return { ...p, osc };
    });
    const story = waveStory(def, { ...def.init, 'mix.osc2': 5, 'osc2.detune': 0.3 }, [], 0);

    expect(story.stages.find((s) => s.id === 'pitch')?.text).toContain('20 cents apart');
  });
});

describe('waveStory — amplitude source selection', () => {
  it('names the filter contour when the amplifier follows envelope 1 instead of 2', () => {
    const def = withExtra((p) => ({ ...p, vca: { envSrc: 'env1', bias: 0 } }));
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'amp')?.text).toContain(
      'The filter contour sets the height of the trace'
    );
  });

  it('skips the envelope sentence entirely when the amplifier follows no envelope ("none")', () => {
    const def = withExtra((p) => ({ ...p, vca: { envSrc: 'none', bias: 0.2 } }));
    const story = waveStory(def, def.init, [], 0);
    const text = story.stages.find((s) => s.id === 'amp')?.text ?? '';

    expect(text).toContain('The amplifier is held 20% open');
    expect(text).not.toContain('sets the height of the trace');
  });
});

describe('waveStory — dirt (degenerate effect params and switched off)', () => {
  it('shows NaN figures when an active effect is missing its own detail fields', () => {
    const def = withExtra((p) => ({
      ...p,
      od: { on: true, drive: undefined },
      delay: { on: true, time: undefined, fb: 0, mix: undefined },
    }));
    const text = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'dirt')?.text ?? '';

    expect(text).toContain('drive at NaN%');
    expect(text).toContain('NaN s, NaN% mix');
  });

  it('omits the echo sentence, and the whole dirt stage, once delay is switched off', () => {
    const def = withExtra((p) => ({ ...p, delay: { on: false, time: 0.3, fb: 0.3, mix: 0.4 } }));
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'dirt')).toBeUndefined();
  });
});

describe('waveStory — movement (further branches)', () => {
  it('falls back to the raw key for an LFO shape the explainer has no word for', () => {
    const def = withExtra((p) => ({ ...p, lfo: { ...p.lfo, mix: { weird: 1 } } }));
    const story = waveStory(def, { ...def.init, 'mod.toOsc': true, 'mod.depth': 10 }, [], 0);

    expect(story.stages.find((s) => s.id === 'move')?.text).toContain('on weird');
  });

  it('describes a running LFO with no shape mixed in at all', () => {
    const def = withExtra((p) => ({ ...p, lfo: { ...p.lfo, mix: {} } }));
    const story = waveStory(def, { ...def.init, 'mod.toOsc': true, 'mod.depth': 10 }, [], 0);

    expect(story.stages.find((s) => s.id === 'move')?.text).toContain(
      'running at 3.16 Hz. At that rate'
    );
  });

  it('names more than one moved destination with plural phrasing', () => {
    const def = makeMiniD();
    const values = { ...def.init, 'mod.toOsc': true, 'mod.depth': 10 };
    const story = waveStory(def, values, [{ from: 'lfo.tri', to: 'cutoff.in' }], 0);

    expect(story.stages.find((s) => s.id === 'move')?.text).toContain(
      'Pitch and the filter cutoff are being moved'
    );
  });

  it('probes the mod wheel from the high side once it reads past the midpoint', () => {
    const story = waveStory(makeMiniD(), makeMiniD().init, [], 0.8);

    expect(story.stages.find((s) => s.id === 'move')?.text).toContain('The mod wheel is up at 80%');
  });
});

describe('waveStory — cable attribution (further branches)', () => {
  it('excludes a cable patched into a decoy jack with no real destination', () => {
    const def = makeMiniD();
    const story = waveStory(def, def.init, [{ from: 'lfo.tri', to: 'dead.in' }], 0);
    const everyKey = story.stages.flatMap((s) => [...s.on, ...s.zero].map((e) => e.key));

    expect(everyKey).not.toContain('lfo.tri>dead.in');
  });
});

describe('waveStory — tolerates a synth def missing optional EngineParams fields', () => {
  it('treats a synth that omits routes entirely the same as one with no routings', () => {
    const def = withExtra((p) => {
      const { routes, ...rest } = p;
      void routes;
      return rest;
    });
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'move')?.text).toBe(
      'Nothing is modulating the voice, so the trace stands still for as long as the note is held.'
    );
  });

  it('treats a missing filter as "no filter to describe" and a null cutoff', () => {
    // filter is a required EngineParams field; a synth def that still omits it is malformed, but
    // wavestory must degrade rather than throw — this cast simulates that malformed input.
    const def = withExtra((p) => {
      const { filter, ...rest } = p;
      void filter;
      return rest as unknown as EngineParams;
    });
    const story = waveStory(def, def.init, [], 0);

    expect(story.cutoff).toBeNull();
    expect(story.stages.find((s) => s.id === 'filter')).toBeUndefined();
  });

  it('treats a missing volume as "nothing to report" rather than 0%', () => {
    const def = withExtra((p) => {
      const { volume, ...rest } = p;
      void volume;
      return rest as unknown as EngineParams;
    });
    const story = waveStory(def, def.init, [], 0);

    expect(story.stages.find((s) => s.id === 'level')).toBeUndefined();
  });
});

describe('waveStory — error path (non-Error throw)', () => {
  it('stringifies a thrown non-Error value when toEngine fails', () => {
    const def = makeMiniD({
      toEngine: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately non-Error, to test the fallback
        throw 'bad patch string';
      },
    });

    const story = waveStory(def, def.init, [], 0);

    expect(story.error).toBe('bad patch string');
    expect(story.stages).toEqual([]);
    expect(story.cutoff).toBeNull();
  });
});
