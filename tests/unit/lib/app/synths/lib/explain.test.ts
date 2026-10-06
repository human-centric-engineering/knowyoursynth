// Unit tests for the generic cable explainer (`explainCable`, `shortHear`, `jackName`). Every assertion checks a
// distinctive substring of the branch the inputs are built to reach — the destination group, source kind, sign,
// and warning condition are all real computation over the fixture's `EngineParams`/`cables`, so a substring specific
// to one branch is proof the code picked that branch, not just that it returned a non-empty string.
import { describe, expect, it } from 'vitest';
import { explainCable, jackName, shortHear } from '@/lib/app/synths/lib/explain';
import { makeMiniD, miniToEngine } from '@/tests/fixtures/synths/mini-d';
import { makeMoogD } from '@/tests/fixtures/synths/moog-d';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import type { ControlValues, EngineParams, Jack, SynthDef } from '@/lib/app/synths/contract';

/** `miniToEngine`, with its return patched by `patch` (a function so each call reads the live panel values). */
function withEngine(
  patch: (v: ControlValues, base: EngineParams) => Partial<EngineParams>
): SynthDef {
  return makeMiniD({
    toEngine: (v) => {
      const base = miniToEngine(v);
      return { ...base, ...patch(v, base) };
    },
  });
}

describe('jackName', () => {
  it('prefers name over label', () => {
    expect(jackName({ name: 'Foo', label: 'Bar' })).toBe('Foo');
  });

  it('falls back to label when there is no name', () => {
    expect(jackName({ label: 'Bar' })).toBe('Bar');
  });
});

describe('shortHear', () => {
  it('returns an empty string for null or undefined', () => {
    expect(shortHear(null)).toBe('');
    expect(shortHear(undefined)).toBe('');
  });

  it('takes the first sentence and turns a trailing colon into a full stop', () => {
    expect(shortHear({ hear: 'First bit: more detail that should be dropped.' })).toBe(
      'First bit.'
    );
    expect(shortHear({ hear: 'Only one sentence here' })).toBe('Only one sentence here');
  });
});

describe('explainCable: guard clauses and "Not modelled"', () => {
  const def = makeMiniD();

  it('returns null when from/to are reversed (in -> out)', () => {
    expect(explainCable(def, 'pitch.in', 'lfo.tri', def.init, [])).toBeNull();
  });

  it('returns null for two outputs', () => {
    expect(explainCable(def, 'lfo.tri', 'lfo.sq', def.init, [])).toBeNull();
  });

  it('reports an unmodelled output jack as kind "Not modelled", modelled: false', () => {
    const r = explainCable(def, 'dead.out', 'pitch.in', def.init, []);
    expect(r?.kind).toBe('Not modelled');
    expect(r?.modelled).toBe(false);
    expect(r?.carries).toBe('');
    expect(r?.does).toBe('');
    expect(r?.hear).toContain('the sound engine does not model it');
  });

  it('reports an unmodelled input jack as kind "Not modelled", modelled: false', () => {
    const r = explainCable(def, 'lfo.tri', 'dead.in', def.init, []);
    expect(r?.kind).toBe('Not modelled');
    expect(r?.modelled).toBe(false);
    expect(r?.hear).toContain('SYNC IN is on the panel');
  });
});

describe('explainCable: pitch group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('a triangle LFO into pitch is a vibrato, wide enough to warn of a siren', () => {
    const r = explainCable(def, 'lfo.tri', 'pitch.in', v, []);
    expect(r?.kind).toBe('Pitch modulation');
    expect(r?.hear).toContain('Vibrato: the pitch of all the oscillators rises and falls');
    expect(r?.hear).toContain('expect a siren');
  });

  it('a square LFO into pitch is described as a trill', () => {
    const r = explainCable(def, 'lfo.sq', 'pitch.in', v, []);
    expect(r?.hear).toContain('A trill: all the oscillators jump between two pitches');
  });

  it('a fast LFO (>=20Hz) reads as frequency modulation, not a wobble', () => {
    const fastDef = withEngine((_v, base) => ({ lfo: { ...base.lfo, rate: 25 } }));
    const r = explainCable(fastDef, 'lfo.tri', 'pitch.in', fastDef.init, []);
    expect(r?.carries).toContain('25 Hz');
    expect(r?.hear).toContain(
      'Frequency modulation. The LFO is running at 25 Hz, too fast to hear as a wobble'
    );
    expect(r?.hear).toContain('does not follow the keyboard');
  });

  it('noise into pitch jitters at random', () => {
    const r = explainCable(def, 'noise.out', 'pitch.in', v, []);
    expect(r?.hear).toContain('jitters at random');
  });

  it('the gate into pitch transposes every note by the same amount', () => {
    const r = explainCable(def, 'gate.out', 'pitch.in', v, []);
    expect(r?.hear).toContain('While a key is held the pitch of all the oscillators is shifted');
    expect(r?.hear).toContain('just sounds transposed');
  });

  it('the envelope into pitch, positive sign: each note rises then falls back', () => {
    const r = explainCable(def, 'env1.out', 'pitch1.in', v, []);
    expect(r?.hear).toContain('follows the envelope: each note rises by as much as 2 semitones');
  });

  it('the envelope into pitch, negative sign: each note dips', () => {
    const negDef = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'negpitch.in',
          x: 1280,
          y: 350,
          r: 12,
          label: 'NEG PITCH',
          help: 'x',
          dir: 'in',
          dest: 'pitch1',
          amt: -24,
          add: true,
        },
      ],
    });
    const r = explainCable(negDef, 'env1.out', 'negpitch.in', negDef.init, []);
    expect(r?.hear).toBe(
      'Each note dips by as much as 2 octaves as the envelope rises, then climbs back to pitch as it falls.'
    );
  });

  it('a synced oscillator cannot move, so the envelope sweeps its tone instead', () => {
    const syncedDef = withEngine((_v, base) => ({
      osc: base.osc.map((o, i) => (i === 0 ? { ...o, syncTo: 1 } : o)),
    }));
    const r = explainCable(syncedDef, 'env1.out', 'pitch1.in', syncedDef.init, []);
    expect(r?.hear).toContain('is hard-synced, so its pitch cannot move');
    expect(r?.hear).toContain('classic sync sweep');
  });

  it('kbd forward, a whole number of semitones: wide leaping patterns, not backwards', () => {
    const r = explainCable(def, 'kbd.out', 'pitch.in', v, []);
    expect(r?.hear).toContain('Each key is now exactly 2 semitones from the next');
    expect(r?.hear).not.toContain('backwards');
  });

  it('kbd with a negative, whole-octave depth runs the keyboard backwards', () => {
    const negDef = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'negpitch.in',
          x: 1280,
          y: 350,
          r: 12,
          label: 'NEG PITCH',
          help: 'x',
          dir: 'in',
          dest: 'pitch1',
          amt: -24,
          add: true,
        },
      ],
    });
    const r = explainCable(negDef, 'kbd.out', 'negpitch.in', negDef.init, []);
    expect(r?.hear).toContain('the keyboard runs backwards');
    expect(r?.hear).toContain('playing up the keys makes the pitch go down');
  });

  it('osc1 into its own pitch input is self-FM', () => {
    const r = explainCable(def, 'osc1.out', 'pitch1.in', v, []);
    expect(r?.hear).toContain('is bending its own pitch at audio rate');
  });

  it('osc3 into osc1 pitch is cross-FM (not self)', () => {
    const r = explainCable(def, 'osc3.out', 'pitch1.in', v, []);
    expect(r?.hear).toContain(
      'Frequency modulation: Oscillator 3 shakes the pitch of Oscillator 1 at audio rate'
    );
    expect(r?.hear).not.toContain('bending its own pitch');
  });

  it('the sample-and-hold into pitch moves to a new random level', () => {
    const r = explainCable(def, 'sh.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('giving a new random level');
    expect(r?.hear).toContain('moves to a new random level');
    expect(r?.hear).toContain('atonal burble');
  });

  it('a stepped source through the S&H traces its own shape in the carries/hear text', () => {
    const shInDef = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'sh.in',
          x: 1280,
          y: 350,
          r: 12,
          label: 'S&H IN',
          help: 'x',
          dir: 'in',
          dest: 'shIn',
        },
      ],
    });
    const r = explainCable(shInDef, 'sh.out', 'pitch.in', shInDef.init, [
      { from: 'env1.out', to: 'sh.in' },
    ]);
    expect(r?.carries).toContain('a new reading of the filter contour');
    expect(r?.hear).toContain('The readings come from the filter contour, not from noise');
  });

  it('warns that pitch is sensitive once the depth exceeds 2 semitones and an attenuator exists but is unused', () => {
    const r = explainCable(def, 'lfo.tri', 'pitch.in', v, []);
    expect(r?.warnings).toContain(
      'Pitch inputs are very sensitive. For a musical amount, send the signal through an attenuator first and set the depth with its knob.'
    );
  });

  it('does not warn about pitch sensitivity when the depth is at or below 2 semitones', () => {
    const r = explainCable(def, 'env1.out', 'pitch1.in', v, []);
    expect(r?.warnings).toHaveLength(0);
  });

  it('warns when every oscillator this pitch cable reaches is turned down in the mixer', () => {
    const silentDef = withEngine((_v, base) => ({
      osc: base.osc.map((o, i) => (i === 0 ? { ...o, level: 0 } : o)),
    }));
    const r = explainCable(silentDef, 'lfo.tri', 'pitch1.in', silentDef.init, []);
    expect(r?.warnings.some((w) => w.includes('turned down in the mixer'))).toBe(true);
  });
});

describe('explainCable: pulse-width group', () => {
  const def = makeMiniD();

  it('a pw cable with osc1 on saw warns it is not set to a pulse shape', () => {
    const r = explainCable(def, 'lfo.tri', 'pw1.in', def.init, []);
    expect(r?.kind).toBe('Pulse-width modulation');
    expect(r?.warnings).toContain(
      'Oscillator 1 is not set to a pulse shape, and pulse width only changes pulse shapes. Switch it to a pulse wave to hear this cable.'
    );
    expect(r?.hear).toContain(
      'Pulse-width modulation: the pulse wave of Oscillator 1 gets thinner and fatter'
    );
  });

  it('does not warn once osc1 is switched to a pulse shape', () => {
    const v = { ...def.init, 'osc1.wave': 'sq' };
    const r = explainCable(def, 'lfo.tri', 'pw1.in', v, []);
    expect(r?.warnings).toHaveLength(0);
  });

  it('the envelope into pw changes tone between hollow and nasal through each note', () => {
    const v = { ...def.init, 'osc1.wave': 'sq' };
    const r = explainCable(def, 'env1.out', 'pw1.in', v, []);
    expect(r?.hear).toContain('The pulse width of Oscillator 1 follows the envelope');
  });
});

describe('explainCable: cutoff group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('a triangle LFO into cutoff is a filter wobble', () => {
    const r = explainCable(def, 'lfo.tri', 'cutoff.in', v, []);
    expect(r?.kind).toBe('Filter modulation');
    expect(r?.hear).toContain('Filter wobble: the cutoff rises and falls');
  });

  it('a square LFO into cutoff snaps between two settings', () => {
    const r = explainCable(def, 'lfo.sq', 'cutoff.in', v, []);
    expect(r?.hear).toContain('The filter snaps between two settings');
    expect(r?.hear).toContain('choppy bright-dark-bright-dark');
  });

  it('noise into cutoff adds a crackling roughness', () => {
    const r = explainCable(def, 'noise.out', 'cutoff.in', v, []);
    expect(r?.hear).toContain('crackling, breathy roughness');
  });

  it('the envelope pushes the cutoff up, then lets it fall back', () => {
    const r = explainCable(def, 'env1.out', 'cutoff.in', v, []);
    expect(r?.hear).toContain(
      'The envelope pushes the cutoff up by as much as 3 octaves on every note'
    );
  });

  it('the gate jumps the filter open while held, and shut on release', () => {
    const r = explainCable(def, 'gate.out', 'cutoff.in', v, []);
    expect(r?.hear).toContain('The filter jumps open by 3 octaves the moment a key goes down');
  });

  it('key tracking by cable keeps higher notes as bright as low ones', () => {
    const r = explainCable(def, 'kbd.out', 'cutoff.in', v, []);
    expect(r?.hear).toContain(
      'Key tracking by cable: the cutoff moves 3 octaves for each octave you play'
    );
  });

  it('vcf.out -> vcf.in is a feedback loop', () => {
    const r = explainCable(def, 'vcf.out', 'vcf.in', v, []);
    expect(r?.kind).toBe('Feedback loop');
    expect(r?.hear).toContain(
      'A feedback loop: the filter output is taken from after the filter and fed back into it'
    );
  });

  it('warns the filter is already almost fully open when a unipolar, positive source pushes it further', () => {
    const openV = { ...v, 'filter.cutoff': 5 };
    const r = explainCable(def, 'gate.out', 'cutoff.in', openV, []);
    expect(r?.warnings).toContain(
      'The filter is already almost fully open, so pushing it further up changes very little. Lower the cutoff first.'
    );
  });

  it('does not warn about an already-open filter for a bipolar LFO source', () => {
    const openV = { ...v, 'filter.cutoff': 5 };
    const r = explainCable(def, 'lfo.tri', 'cutoff.in', openV, []);
    expect(r?.warnings).toHaveLength(0);
  });
});

describe('explainCable: resonance group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('an LFO into resonance swells and fades the whistling edge', () => {
    const r = explainCable(def, 'lfo.tri', 'res.in', v, []);
    expect(r?.kind).toBe('Resonance modulation');
    expect(r?.hear).toContain('The resonance swells and fades');
  });

  it('warns that only the upward half of the swing does anything when resonance is at 0', () => {
    const r = explainCable(def, 'lfo.tri', 'res.in', v, []);
    expect(r?.hear).toContain('The resonance knob is at 0 and resonance cannot go below zero');
  });

  it('the loudness envelope makes resonance rise and fall, squelchy then dry', () => {
    const r = explainCable(def, 'env2.out', 'res.in', v, []);
    expect(r?.hear).toContain('Resonance rises and falls with the envelope');
  });
});

describe('explainCable: amp (loudness) group', () => {
  // The builtin normals carry no `amp` entry (the VCA reads `vca.envSrc` directly), so a definition that wants
  // readable loudness text declares its own normal, as these tests do.
  const def = withEngine(() => ({ normals: { amp: 'env2' } }));
  const v = def.init;

  it('an LFO replaces the loudness contour: the sound pulses with no key needed', () => {
    const r = explainCable(def, 'lfo.tri', 'amp.in', v, []);
    expect(r?.kind).toBe('Loudness control');
    expect(r?.hear).toContain('Loudness now follows the LFO instead of the loudness contour');
    expect(r?.hear).toContain('equal bursts of sound and silence');
  });

  it('a fast LFO into amp is amplitude modulation, not tremolo', () => {
    const fastDef = withEngine((_v, base) => ({
      lfo: { ...base.lfo, rate: 25 },
      normals: { amp: 'env2' },
    }));
    const r = explainCable(fastDef, 'lfo.tri', 'amp.in', fastDef.init, []);
    expect(r?.hear).toContain('Amplitude modulation at 25 Hz: too fast to hear as tremolo');
  });

  it('feeding the exact normal back in at the same depth changes nothing ("same")', () => {
    const r = explainCable(def, 'env2.out', 'amp.in', v, []);
    expect(r?.hear).toBe(
      'This is the connection the synth already makes inside, so nothing changes.'
    );
  });

  it('a different envelope replaces the normal, which keeps running and is free to be re-patched', () => {
    const r = explainCable(def, 'env1.out', 'amp.in', v, []);
    expect(r?.hear).toContain(
      'Loudness now follows the filter contour instead of the loudness contour'
    );
    expect(r?.hear).toContain('free to be patched to something else');
  });

  it('the gate makes it organ-like on/off, and names what no longer shapes the volume', () => {
    const r = explainCable(def, 'gate.out', 'amp.in', v, []);
    expect(r?.hear).toContain(
      'simply on while a key is down and off when it is released, like an organ'
    );
    expect(r?.hear).toContain('The loudness contour no longer shapes the volume');
  });

  it('kbd into amp: loudness follows the keyboard, amplifier never fully closes', () => {
    const r = explainCable(def, 'kbd.out', 'amp.in', v, []);
    expect(r?.hear).toBe(
      'Loudness follows the keyboard: notes above middle C get louder the higher you play, and the amplifier never fully closes between them.'
    );
  });

  it('noise into amp is gritty and torn', () => {
    const r = explainCable(def, 'noise.out', 'amp.in', v, []);
    expect(r?.hear).toContain('Noise shakes the volume, which makes the sound gritty and torn');
  });

  it('random into amp gives random note levels', () => {
    const r = explainCable(def, 'sh.out', 'amp.in', v, []);
    expect(r?.hear).toContain('notes come out at random levels');
  });

  it('a second add:true amp input that doubles the existing drive keeps the shape, louder', () => {
    const def2 = withEngine(() => ({ normals: { amp: 'env2' } }));
    const withExtraJack = makeMiniD({
      jacks: [
        ...def2.jacks,
        {
          id: 'amp2.in',
          x: 1280,
          y: 300,
          r: 12,
          label: 'VCA CV2',
          help: 'x',
          dir: 'in',
          dest: 'amp',
          amt: 1,
          add: true,
        },
      ],
      toEngine: def2.toEngine,
    });
    const r = explainCable(withExtraJack, 'env2.out', 'amp2.in', withExtraJack.init, []);
    expect(r?.hear).toContain('is already what drives the amplifier, so this doubles it');
  });

  it('a different envelope added (not replacing) lays its shape over the volume', () => {
    const def2 = withEngine(() => ({ normals: { amp: 'env2' } }));
    const withExtraJack = makeMiniD({
      jacks: [
        ...def2.jacks,
        {
          id: 'amp2.in',
          x: 1280,
          y: 300,
          r: 12,
          label: 'VCA CV2',
          help: 'x',
          dir: 'in',
          dest: 'amp',
          amt: 1,
          add: true,
        },
      ],
      toEngine: def2.toEngine,
    });
    const r = explainCable(withExtraJack, 'env1.out', 'amp2.in', withExtraJack.init, []);
    expect(r?.hear).toBe(
      'The filter contour adds to the loudness envelope, so its shape is laid over the volume of each note.'
    );
  });
});

describe('explainCable: LFO-rate group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('the LFO changing its own speed bends its own cycle into a lopsided shape', () => {
    const r = explainCable(def, 'lfo.tri', 'lforate.in', v, []);
    expect(r?.kind).toBe('LFO speed control');
    expect(r?.hear).toContain('bends its cycle into a lopsided shape');
  });

  it('a positive-sign envelope speeds the LFO up then relaxes it', () => {
    const r = explainCable(def, 'env2.out', 'lforate.in', v, []);
    expect(r?.hear).toContain('speeds up as the envelope rises and slows down again as it falls');
    expect(r?.hear).toContain('fast wobble that relaxes');
  });

  it('a negative-sign envelope slows the LFO down first', () => {
    const negDef = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'neglforate.in',
          x: 1280,
          y: 350,
          r: 12,
          label: 'NEG RATE',
          help: 'x',
          dir: 'in',
          dest: 'lfoRate',
          amt: -2,
          add: true,
        },
      ],
    });
    const r = explainCable(negDef, 'env2.out', 'neglforate.in', negDef.init, []);
    expect(r?.hear).toContain('slows down as the envelope rises and speeds up again as it falls');
    expect(r?.hear).toContain('slow wobble that quickens');
  });

  it('a slow-attack envelope phases the speed change in gradually, naming the attack time', () => {
    const slowDef = withEngine((_v, base) => ({ env2: { ...base.env2, a: 0.5 } }));
    const r = explainCable(slowDef, 'env2.out', 'lforate.in', slowDef.init, []);
    expect(r?.hear).toContain(
      'This envelope takes 500 ms to rise, so the change of speed comes on gradually'
    );
  });

  it('warns that the LFO is not reaching anything audible yet', () => {
    const r = explainCable(def, 'env2.out', 'lforate.in', v, []);
    expect(r?.warnings).toContain(
      'The LFO is not moving anything at the moment, so changing its speed makes no audible difference yet. Send the LFO to pitch, the filter or pulse width first.'
    );
  });

  it('does not warn once the LFO is already feeding a destination it modulates', () => {
    const routedDef = withEngine(() => ({ routes: [{ src: 'lfoTri', dst: 'pitchAll', amt: 1 }] }));
    const r = explainCable(routedDef, 'env2.out', 'lforate.in', routedDef.init, []);
    expect(r?.warnings).toHaveLength(0);
  });
});

describe('explainCable: waveform and level groups', () => {
  const def = makeMiniD();
  const v = def.init;

  it('an LFO into waveform sweeps the tone between smooth and buzzy', () => {
    const r = explainCable(def, 'lfo.tri', 'wave1.in', v, []);
    expect(r?.kind).toBe('Waveform modulation');
    expect(r?.hear).toContain('The waveform of Oscillator 1 sweeps back and forth');
  });

  it('an LFO into level pulses the mix between the two oscillators', () => {
    const r = explainCable(def, 'lfo.tri', 'lvl1.in', v, []);
    expect(r?.kind).toBe('Level control');
    expect(r?.hear).toContain('The level of Oscillator 1 rises and falls');
  });
});

describe('explainCable: delay-time group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('an LFO drifts delay time, bending echo pitch', () => {
    const r = explainCable(def, 'lfo.tri', 'delay.in', v, []);
    expect(r?.kind).toBe('Delay-time modulation');
    expect(r?.hear).toContain('The delay time drifts');
    expect(r?.hear).toContain('bends the pitch of the echoes');
  });

  it('warns when the delay is on but MIX is at zero', () => {
    const mutedDef = withEngine(() => ({ delay: { on: true, time: 0.3, fb: 0.3, mix: 0 } }));
    const r = explainCable(mutedDef, 'lfo.tri', 'delay.in', mutedDef.init, []);
    expect(r?.warnings).toContain(
      'The delay MIX is at zero, so the delay is not heard at all yet. Turn MIX up.'
    );
  });

  it('does not warn once MIX is turned up (the fixture default)', () => {
    const r = explainCable(def, 'lfo.tri', 'delay.in', v, []);
    expect(r?.warnings).toHaveLength(0);
  });
});

describe('explainCable: trigger group', () => {
  const def = makeMiniD();
  const v = def.init;

  it('an LFO cycle fires the envelope repeatedly, with keys no longer gating it', () => {
    const r = explainCable(def, 'lfo.tri', 'gate1.in', v, []);
    expect(r?.kind).toBe('Trigger');
    expect(r?.hear).toContain('fires on every LFO cycle');
    expect(r?.hear).toContain('The keys no longer fire the filter contour');
  });

  it('feeding the gate into its own already-wired trigger changes nothing', () => {
    const r = explainCable(def, 'gate.out', 'gate1.in', v, []);
    expect(r?.hear).toContain(
      'already gets the key gate inside the synth, so this cable changes nothing'
    );
  });

  it('a trigger cable describes itself as firing on the signal crossing half level', () => {
    const r = explainCable(def, 'lfo.tri', 'gate1.in', v, []);
    expect(r?.does).toContain('it fires each time the incoming signal rises past half level');
  });
});

describe('explainCable: audio-reroute group and feedback detection', () => {
  const def = makeMiniD();
  const v = def.init;

  it('extIn mixes the source in alongside the oscillators, at that level knob', () => {
    const r = explainCable(def, 'noise.out', 'ext.in', v, []);
    expect(r?.kind).toBe('Audio re-route');
    expect(r?.hear).toContain('mixed in alongside the oscillators');
  });

  it('re-routing audio past its normal stage skips the stage and disconnects the normal', () => {
    const r = explainCable(def, 'noise.out', 'vcf.in', v, []);
    expect(r?.does).toContain(
      'Inside the synth this input is fed by the mixer output. A cable here disconnects that.'
    );
    expect(r?.hear).toContain('The filter now hears noise instead of the mixer output');
    expect(r?.hear).toContain('The signal skips the mixer, so its controls no longer affect it.');
  });
});

describe('explainCable: utility group (self-loop through an attenuator)', () => {
  it('a utility output fed back into its own input reads as a loop, with an empty "does"', () => {
    const def = makeMiniD();
    const r = explainCable(def, 'att.out', 'att.in', def.init, []);
    expect(r?.kind).toBe('Utility');
    expect(r?.carries).toBe(
      'Right now: nothing useful, because its input is fed from its own output.'
    );
    expect(r?.does).toBe('');
    expect(r?.hear).toBe('Nothing yet: no signal is on this cable.');
  });
});

describe('explainCable: jack-level overrides (check / does / hear / amt as functions)', () => {
  it("surfaces a jack's own check() alongside the generic pitch-sensitivity warning", () => {
    const d = makeMiniD({
      jacks: makeMiniD().jacks.map((j) =>
        j.id === 'pitch.in' ? { ...j, check: () => 'Turn the GLIDE knob down first.' } : j
      ),
    });
    const r = explainCable(d, 'lfo.tri', 'pitch.in', d.init, []);
    expect(r?.warnings).toContain('Turn the GLIDE knob down first.');
  });

  it("a jack's own does() string replaces the generic depth sentence", () => {
    const d = makeMiniD({
      jacks: makeMiniD().jacks.map((j) =>
        j.id === 'pitch.in' ? { ...j, does: () => 'Custom does text.' } : j
      ),
    });
    const r = explainCable(d, 'lfo.tri', 'pitch.in', d.init, []);
    expect(r?.does).toContain('Custom does text.');
  });

  it("a jack's own hear() replaces the generated sentence", () => {
    const d = makeMiniD({
      jacks: makeMiniD().jacks.map((j) =>
        j.id === 'pitch.in' ? { ...j, hear: () => 'Custom hear text.' } : j
      ),
    });
    const r = explainCable(d, 'lfo.tri', 'pitch.in', d.init, []);
    expect(r?.hear).toBe('Custom hear text.');
  });

  it('hear() returning null falls back to the generated sentence', () => {
    const d = makeMiniD({
      jacks: makeMiniD().jacks.map((j) => (j.id === 'pitch.in' ? { ...j, hear: () => null } : j)),
    });
    const r = explainCable(d, 'lfo.tri', 'pitch.in', d.init, []);
    expect(r?.hear).toContain('Vibrato');
  });

  it('amt as a function returning 0 produces the depth-zero warning and "by nothing at all" phrasing', () => {
    const d = makeMiniD({
      jacks: makeMiniD().jacks.map((j) => (j.id === 'pitch.in' ? { ...j, amt: () => 0 } : j)),
    });
    const r = explainCable(d, 'lfo.tri', 'pitch.in', d.init, []);
    expect(r?.warnings).toContain(
      'The depth knob for this input is at zero, so nothing gets through yet.'
    );
    expect(r?.hear).toContain('by nothing at all until the depth is turned up');
  });
});

describe('explainCable: multiple cables into the same destination', () => {
  it('names the other cable and notes the signals add together', () => {
    const def = makeMiniD();
    const cables: CableLike[] = [{ from: 'lfo.sq', to: 'pitch.in' }];
    const r = explainCable(def, 'lfo.tri', 'pitch.in', def.init, cables);
    expect(r?.does).toContain(
      'LFO SQ is plugged in here too. Signals into the same input add together.'
    );
  });
});

describe('explainCable: plugged flag', () => {
  it('is false when the pair being described is not yet in the cable list, true once it is', () => {
    const def = makeMiniD();
    const notYet = explainCable(def, 'lfo.tri', 'pitch.in', def.init, []);
    const already = explainCable(def, 'lfo.tri', 'pitch.in', def.init, [
      { from: 'lfo.tri', to: 'pitch.in' },
    ]);
    expect(notYet?.plugged).toBe(false);
    expect(already?.plugged).toBe(true);
  });
});

describe('explainCable: HEAR table completeness across destination groups and source kinds', () => {
  // Each row reaches one (group, kind) cell of the HEAR table that the targeted tests above do not already hit.
  // `fast` rows need an LFO running at or above 20Hz; every other kind uses the fixture's default panel.
  const def = makeMiniD();
  const fastDef = withEngine((_v, base) => ({ lfo: { ...base.lfo, rate: 25 } }));

  const rows: Array<{
    group: string;
    dest: string;
    kind: string;
    from: string;
    fast?: boolean;
    contains: string | string[];
  }> = [
    // pulse-width
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains:
        'The pulse width of Oscillator 1 is shaken at 25 Hz, which adds a buzzing, ring-modulator-like edge',
    },
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'audio',
      from: 'osc3.out',
      contains:
        'shakes the pulse width of Oscillator 1 at audio rate, adding a harsh, buzzing edge',
    },
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise jitters the pulse width of Oscillator 1, which adds a gritty hiss',
    },
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'gate',
      from: 'gate.out',
      contains: [
        'the pulse width of Oscillator 1 is shifted',
        'the same as turning the width knob',
      ],
    },
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains: 'The pulse width of Oscillator 1 changes across the keyboard',
    },
    {
      group: 'pw',
      dest: 'pw1.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['The pulse width of Oscillator 1 moves to', 'flickers between hollow and nasal'],
    },
    // cutoff
    {
      group: 'cutoff',
      dest: 'cutoff.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains:
        'Audio-rate filter modulation: the LFO is at 25 Hz, so the wobble blurs into a rasping growl',
    },
    {
      group: 'cutoff',
      dest: 'cutoff.in',
      kind: 'audio',
      from: 'osc3.out',
      contains: ['shakes the cutoff at audio rate', 'you hear a rasp or growl on top of the note'],
    },
    {
      group: 'cutoff',
      dest: 'cutoff.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['The cutoff moves to', 'burbling "computer" effect'],
    },
    // resonance
    {
      group: 'res',
      dest: 'res.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains: 'The resonance is shaken at audio rate, which adds a thin, gritty edge',
    },
    {
      group: 'res',
      dest: 'res.in',
      kind: 'audio',
      from: 'osc3.out',
      contains: 'shakes the resonance at audio rate, which adds a thin, gritty edge',
    },
    {
      group: 'res',
      dest: 'res.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise jitters the resonance, which makes the resonant peak sputter',
    },
    {
      group: 'res',
      dest: 'res.in',
      kind: 'gate',
      from: 'gate.out',
      contains: 'Resonance jumps up while a key is held and drops back on release',
    },
    {
      group: 'res',
      dest: 'res.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains: ['Resonance changes across the keyboard', 'higher notes ring more'],
    },
    {
      group: 'res',
      dest: 'res.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['Resonance moves to', 'some steps whistle and others do not'],
    },
    // LFO speed
    {
      group: 'lfoRate',
      dest: 'lforate.in',
      kind: 'audio',
      from: 'osc3.out',
      contains:
        'jitters the LFO speed at audio rate, which blurs the LFO into something closer to noise',
    },
    {
      group: 'lfoRate',
      dest: 'lforate.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise jitters the LFO speed, so the wobble becomes unsteady',
    },
    {
      group: 'lfoRate',
      dest: 'lforate.in',
      kind: 'gate',
      from: 'gate.out',
      contains: ['The LFO runs', 'while a key is held', 'goes back to the knob setting on release'],
    },
    {
      group: 'lfoRate',
      dest: 'lforate.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains: 'LFO speed follows the keyboard',
    },
    {
      group: 'lfoRate',
      dest: 'lforate.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['The LFO speed moves to', 'the wobble keeps changing pace'],
    },
    // waveform
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains: 'The waveform of Oscillator 1 is shaken at 25 Hz, which roughens the tone',
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'audio',
      from: 'osc3.out',
      contains:
        'moves the waveform of Oscillator 1 at audio rate, which adds harsh, metallic overtones',
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise jitters the waveform of Oscillator 1, which makes the tone gritty',
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'env',
      from: 'env1.out',
      contains: [
        'The waveform of Oscillator 1 follows the envelope',
        'starting brighter and settling back as the envelope falls',
      ],
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'gate',
      from: 'gate.out',
      contains: [
        'the waveform of Oscillator 1 is shifted',
        'the same as turning the WAVEFORM knob',
      ],
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains: 'The waveform of Oscillator 1 changes across the keyboard',
    },
    {
      group: 'wave',
      dest: 'wave1.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['The waveform of Oscillator 1 moves to', 'each step has its own tone'],
    },
    // level
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains: 'The level of Oscillator 1 is shaken at 25 Hz: amplitude modulation',
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'audio',
      from: 'osc3.out',
      contains: 'opens and shuts Oscillator 1 at audio rate: amplitude modulation',
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise shakes the level of Oscillator 1, which makes it gritty and torn',
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'env',
      from: 'env1.out',
      contains: [
        'The level of Oscillator 1 follows the envelope',
        'crossfades from one to the other',
      ],
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'gate',
      from: 'gate.out',
      contains: ['Oscillator 1 is pushed up', 'while a key is held'],
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains: 'The level of Oscillator 1 follows the keyboard',
    },
    {
      group: 'level',
      dest: 'lvl1.in',
      kind: 'random',
      from: 'sh.out',
      contains: [
        'The level of Oscillator 1 moves to',
        'balance of the two oscillators keeps changing',
      ],
    },
    // delay time
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'fast',
      from: 'lfo.tri',
      fast: true,
      contains:
        'The delay time is shaken at audio rate, which smears the echoes into a metallic, flanger-like blur',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'audio',
      from: 'osc3.out',
      contains:
        'shakes the delay time at audio rate, which smears the echoes into a grainy, metallic blur',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'noise',
      from: 'noise.out',
      contains: 'Noise jitters the delay time, which makes the echoes grainy and unstable',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'env',
      from: 'env1.out',
      contains:
        'The delay time moves with the envelope, so the echoes bend in pitch at the start of every note',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'gate',
      from: 'gate.out',
      contains: 'The delay time jumps while a key is held and jumps back on release',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'kbd',
      from: 'kbd.out',
      contains:
        'The delay time follows the keyboard, so every new note bends the pitch of the echoes already sounding',
    },
    {
      group: 'delayTime',
      dest: 'delay.in',
      kind: 'random',
      from: 'sh.out',
      contains: ['The delay time moves to', 'every change bends the pitch of the echoes'],
    },
  ];

  for (const row of rows) {
    it(`${row.group} / ${row.kind}: ${row.from} -> ${row.dest}`, () => {
      const d = row.fast ? fastDef : def;
      const r = explainCable(d, row.from, row.dest, d.init, []);
      for (const needle of Array.isArray(row.contains) ? row.contains : [row.contains]) {
        expect(r?.hear).toContain(needle);
      }
    });
  }

  it('the "fast" LFO-rate text differs from the plain "lfo" one (no lopsided-cycle clause)', () => {
    const r = explainCable(fastDef, 'lfo.tri', 'lforate.in', fastDef.init, []);
    expect(r?.hear).toBe(
      'The LFO changes its own speed as it goes, which bends its cycle into a lopsided shape.'
    );
  });
});

describe('explainCable: liveSource / kindOf coverage for less common source signals', () => {
  // Synthetic output jacks reaching signals the mini-d patch bay does not otherwise expose, so each of
  // `kindOf`'s and `liveSource`'s less-common branches runs on a real (if invented) source.
  const extraOutputs: Jack[] = [
    {
      id: 'wheel.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'MOD WHEEL',
      help: 'x',
      dir: 'out',
      signal: 'wheel',
    },
    { id: 'one.out', x: 0, y: 0, r: 12, label: 'FIXED V', help: 'x', dir: 'out', signal: 'one' },
    { id: 'kbd2.out', x: 0, y: 0, r: 12, label: 'KB2 CV', help: 'x', dir: 'out', signal: 'kbd2' },
    {
      id: 'shclk.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'S&H CLOCK',
      help: 'x',
      dir: 'out',
      signal: 'shClk',
    },
    {
      id: 'lfosine.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'LFO SINE',
      help: 'x',
      dir: 'out',
      signal: 'lfoSine',
    },
    {
      id: 'lfosaw.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'LFO SAW',
      help: 'x',
      dir: 'out',
      signal: 'lfoSaw',
    },
    {
      id: 'lfouni.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'LFO UNI',
      help: 'x',
      dir: 'out',
      signal: 'lfoUni',
    },
    { id: 'vib.out', x: 0, y: 0, r: 12, label: 'VIB', help: 'x', dir: 'out', signal: 'vib' },
    { id: 'joyx.out', x: 0, y: 0, r: 12, label: 'JOY X', help: 'x', dir: 'out', signal: 'joyX' },
  ];
  const def = makeMiniD({ jacks: [...makeMiniD().jacks, ...extraOutputs] });
  const v = def.init;

  it('"wheel" is an unmatched root: kindOf falls to "other" and liveSource to the final sigName fallback', () => {
    const r = explainCable(def, 'wheel.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('the mod wheel');
    // kind "other" has no HEAR.pitch entry, so the generic catch-all sentence is used.
    expect(r?.hear).toBe('The mod wheel moves the pitch up to 1 octave either way.');
  });

  it('"one" is a steady voltage', () => {
    const r = explainCable(def, 'one.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('a steady voltage');
  });

  it('"kbd2" (the duophonic upper voice) kinds as kbd and reads its own octave-per-key text', () => {
    const r = explainCable(def, 'kbd2.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('zero at middle C, one step up per octave');
    expect(r?.hear).toContain('The keyboard now reaches all the oscillators twice');
  });

  it('"shClk" reads as a square wave at the S&H rate', () => {
    const r = explainCable(def, 'shclk.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('a square wave');
  });

  it('a sine LFO and a delayed vibrato each carry their own live-source phrasing', () => {
    const sine = explainCable(def, 'lfosine.out', 'pitch.in', v, []);
    const vib = explainCable(def, 'vib.out', 'pitch.in', v, []);
    expect(sine?.carries).toContain('the sine LFO');
    expect(vib?.carries).toContain('the delayed vibrato');
  });

  it('a one-way (unipolar) LFO is labelled "upwards only"', () => {
    const r = explainCable(def, 'lfouni.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('upwards only');
  });

  it('a sawtooth LFO is named explicitly, exercising lfoShape\'s "saw" branch along the way', () => {
    // liveSource names lfoSaw directly ("the sawtooth LFO"); lfoShape('lfoSaw') === 'saw' is computed for the
    // JackHearContext regardless, even though only the sq/else split is printed for the pitch group.
    const r = explainCable(def, 'lfosaw.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('the sawtooth LFO');
    expect(r?.hear).toContain('Vibrato');
  });

  it('the joystick X axis is a steady voltage that only moves when the stick does', () => {
    const r = explainCable(def, 'joyx.out', 'pitch.in', v, []);
    expect(r?.carries).toContain('a steady voltage that changes only when you move the stick');
  });

  it('a free-running (non-keyboard-tracking) oscillator under 20Hz reads and kinds as a slow LFO', () => {
    const slowOscDef = withEngine((_v, base) => ({
      osc: base.osc.map((o, i) => (i === 2 ? { ...o, kbd: false, semi: -24, fixedNote: 0 } : o)),
    }));
    const r = explainCable(slowOscDef, 'osc3.out', 'pitch1.in', slowOscDef.init, []);
    expect(r?.carries).toContain('running as a slow modulation source at');
    expect(r?.hear).toContain('Vibrato: the pitch of Oscillator 1 rises and falls');
  });
});

describe('explainCable: the trapezoid signal (VCS3-style env, sign always negative)', () => {
  const trapJack: Jack = {
    id: 'trap.out',
    x: 0,
    y: 0,
    r: 12,
    label: 'TRAP',
    help: 'x',
    dir: 'out',
    signal: 'trap',
  };

  it('with no trap settings at all, falls back to the "waits for the next key" phrasing', () => {
    const def = makeMiniD({ jacks: [...makeMiniD().jacks, trapJack] });
    const r = explainCable(def, 'trap.out', 'cutoff.in', def.init, []);
    expect(r?.carries).toContain('it swings negative over');
    expect(r?.carries).toContain('waits for the next key or the ATTACK button');
    // trap's sign is always -1, so a positive-amt cutoff cable reads as the "sign < 0" branch.
    expect(r?.hear).toContain('pulls the cutoff down');
  });

  it('with auto set, reads as free-running instead of waiting for a key', () => {
    const def = withEngine((_v, base) => ({
      ...base,
      trap: { a: 0.1, on: 0.2, d: 0.3, off: 0.4, auto: true, hold: false },
    }));
    const withJack = makeMiniD({ jacks: [...def.jacks, trapJack], toEngine: def.toEngine });
    const r = explainCable(withJack, 'trap.out', 'cutoff.in', withJack.init, []);
    expect(r?.carries).toContain('starts again on its own');
  });
});

describe('explainCable: the envelope-follower utility ("envf", a source only when fed)', () => {
  const jacks: Jack[] = [
    {
      id: 'envf.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'ENV FOLLOW',
      help: 'x',
      dir: 'out',
      signal: 'envf',
    },
    {
      id: 'envf.in',
      x: 0,
      y: 0,
      r: 12,
      label: 'ENV FOLLOW IN',
      help: 'x',
      dir: 'in',
      dest: 'envfIn',
    },
  ];
  const def = makeMiniD({ jacks: [...makeMiniD().jacks, ...jacks] });

  it('with nothing feeding its input, carries nothing', () => {
    const r = explainCable(def, 'envf.out', 'cutoff.in', def.init, []);
    expect(r?.carries).toContain('has no signal patched into it');
  });

  it('once fed, becomes a real source that rises and falls with the loudness of what feeds it', () => {
    const r = explainCable(def, 'envf.out', 'cutoff.in', def.init, [
      { from: 'noise.out', to: 'envf.in' },
    ]);
    expect(r?.carries).toContain('a voltage that rises and falls with the loudness of noise');
  });
});

describe('explainCable: Attenuator 1 gated by a CV on its ATTEN CV input', () => {
  const jacks: Jack[] = [
    { id: 'att.cv.in', x: 0, y: 0, r: 12, label: 'ATTEN CV', help: 'x', dir: 'in', dest: 'att1CV' },
  ];
  const def = makeMiniD({ jacks: [...makeMiniD().jacks, ...jacks] });

  it('describes the attenuated source as "let through only as far as [gate] opens Attenuator 1"', () => {
    const cables: CableLike[] = [
      { from: 'gate.out', to: 'att.cv.in' },
      { from: 'env1.out', to: 'att.in' },
    ];
    const r = explainCable(def, 'att.out', 'cutoff.in', def.init, cables);
    expect(r?.carries).toContain('let through only as far as the key gate opens Attenuator 1');
  });
});

describe('explainCable: combine() merging overlapping copies of the same root', () => {
  // `resolve()` only follows the EXPLAINED jack's own signal through ITS OWN utility fan-in — a second, unrelated
  // cable into the same destination never joins it. So to get two copies of the same root to meet (and combine()
  // to merge them into a net leaf plus the quick-movement "lagOnly" difference), both copies must arrive through
  // the two inputs of a single multi-input utility (sum1: ins ['sum1A', 'sum1B']), one of them via the slew limiter.
  const jacks: Jack[] = [
    { id: 'slew.out', x: 0, y: 0, r: 12, label: 'SLEW OUT', help: 'x', dir: 'out', signal: 'slew' },
    { id: 'slew.in', x: 0, y: 0, r: 12, label: 'SLEW IN', help: 'x', dir: 'in', dest: 'slewIn' },
    {
      id: 'sum1.out',
      x: 0,
      y: 0,
      r: 12,
      label: 'SUM 1 OUT',
      help: 'x',
      dir: 'out',
      signal: 'sum1',
    },
    { id: 'sum1.a.in', x: 0, y: 0, r: 12, label: 'SUM 1 A', help: 'x', dir: 'in', dest: 'sum1A' },
    { id: 'sum1.b.in', x: 0, y: 0, r: 12, label: 'SUM 1 B', help: 'x', dir: 'in', dest: 'sum1B' },
  ];
  const def = makeMiniD({ jacks: [...makeMiniD().jacks, ...jacks] });

  it('a slewed copy and a plain copy of the keyboard pitch combine into a net leaf plus a lag-only leaf', () => {
    const cables: CableLike[] = [
      { from: 'kbd.out', to: 'sum1.a.in' }, // the plain copy
      { from: 'kbd.out', to: 'slew.in' },
      { from: 'slew.out', to: 'sum1.b.in' }, // the slewed copy
    ];
    const r = explainCable(def, 'sum1.out', 'pitch.in', def.init, cables);
    expect(r?.hear).toContain(
      'While a note is held the slewed and plain copies of the keyboard pitch cancel'
    );
  });

  it('a slewed gate alongside its plain copy into a non-pitch group reads as a generic step/settle lag', () => {
    const r = explainCable(def, 'sum1.out', 'cutoff.in', def.init, [
      { from: 'gate.out', to: 'sum1.a.in' },
      { from: 'gate.out', to: 'slew.in' },
      { from: 'slew.out', to: 'sum1.b.in' },
    ]);
    expect(r?.hear).toContain('settles back over about');
  });

  it('a gate fed only through the slew limiter (no un-slewed copy) reads as a home-made envelope', () => {
    const r = explainCable(def, 'slew.out', 'cutoff.in', def.init, [
      { from: 'gate.out', to: 'slew.in' },
    ]);
    expect(r?.hear).toContain('The slew limiter turns the key gate into a slow rise and fall');
  });
});

describe('explainCable: two-module ("dual") synths read the module they belong to', () => {
  it("a part-1 jack reads its module's own panel settings, not the top-level ones", () => {
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'lfo.b.out',
          x: 0,
          y: 0,
          r: 12,
          part: 1,
          label: 'LFO B',
          help: 'x',
          dir: 'out',
          signal: 'lfoTri',
        },
        {
          id: 'pitch.b.in',
          x: 0,
          y: 0,
          r: 12,
          part: 1,
          label: 'PITCH B',
          help: 'x',
          dir: 'in',
          dest: 'pitchAll',
          amt: 12,
          add: true,
        },
      ],
      toEngine: (v) => {
        const base = miniToEngine(v);
        return {
          ...base,
          dual: {
            b: { ...base, lfo: { ...base.lfo, rate: 1 } },
            assign: 'unison',
            split: 60,
            level: [1, 1],
            pan: [0, 0],
          },
        };
      },
    });
    const r = explainCable(def, 'lfo.b.out', 'pitch.b.in', def.init, []);
    // the module's own LFO runs at 1Hz, not the top-level module's default (~3.16Hz)
    expect(r?.carries).toContain('1.00 Hz');
  });
});

describe('explainCable: hearTrig branches not reached via gate1.in alone', () => {
  const jacks: Jack[] = [
    {
      id: 'envclk.in',
      x: 0,
      y: 0,
      r: 12,
      label: 'ENV CLOCK',
      help: 'x',
      dir: 'in',
      dest: 'envClk',
    },
    {
      id: 'lfotrig.in',
      x: 0,
      y: 0,
      r: 12,
      label: 'LFO TRIG',
      help: 'x',
      dir: 'in',
      dest: 'lfoTrig',
    },
    {
      id: 'shclock.in',
      x: 0,
      y: 0,
      r: 12,
      label: 'S&H CLOCK IN',
      help: 'x',
      dir: 'in',
      dest: 'shClock',
    },
  ];
  const def = makeMiniD({ jacks: [...makeMiniD().jacks, ...jacks] });
  const v = def.init;

  it('an "both" dest (envClk) names "the envelopes set to this input" and still counts as gateIn', () => {
    const r = explainCable(def, 'lfo.tri', 'envclk.in', v, []);
    expect(r?.hear).toContain('The envelopes set to this input fire on every LFO cycle');
  });

  it("the LFO's own trigger input restarts its cycle on every key press", () => {
    const r = explainCable(def, 'gate.out', 'lfotrig.in', v, []);
    expect(r?.hear).toContain('The LFO restarts its cycle each time you press a key');
    expect(r?.hear).toContain('Every note starts at the same point in the wobble');
  });

  it('the S&H clock input notes that the RATE knob no longer has any effect', () => {
    const r = explainCable(def, 'gate.out', 'shclock.in', v, []);
    expect(r?.hear).toContain('Its RATE knob no longer has any effect');
  });

  it('an audio-kind source into a trigger input is a buzz, not a rhythm', () => {
    const r = explainCable(def, 'osc3.out', 'gate1.in', v, []);
    expect(r?.hear).toContain('hundreds of times a second');
    expect(r?.hear).toContain('Expect a buzz or a stutter rather than a rhythm');
  });

  it('a noise-kind source into a trigger input fires at random, many times a second', () => {
    const r = explainCable(def, 'noise.out', 'gate1.in', v, []);
    expect(r?.hear).toContain('at random, many times a second');
  });

  it('a random-kind (S&H) source into a trigger input fires at irregular moments', () => {
    const r = explainCable(def, 'sh.out', 'gate1.in', v, []);
    expect(r?.hear).toContain('fires at irregular moments');
  });

  it('a plain envelope into a trigger input falls back to the generic half-level rule', () => {
    const r = explainCable(def, 'env1.out', 'gate1.in', v, []);
    expect(r?.hear).toContain('rises past half level');
  });
});

describe('explainCable: hearAudioIn branches not reached via vcf.in / ext.in alone', () => {
  it('a slow control signal into extIn is at most a click/thump, scaled by the level knob', () => {
    const def = makeMiniD();
    const r = explainCable(def, 'env1.out', 'ext.in', def.init, []);
    expect(r?.hear).toContain(
      'is a slow control signal, not a sound, and this input only adds to the mixer'
    );
    expect(r?.hear).toContain('The level knob for this input sets how hard');
  });

  it('a slow control signal into the filter rings it when resonance is very high', () => {
    const def = makeMiniD();
    const v = { ...def.init, 'filter.emphasis': 10 }; // res = 1.0 >= 0.98
    const r = explainCable(def, 'env1.out', 'vcf.in', v, []);
    expect(r?.hear).toContain('With resonance this high the filter rings on its own');
  });

  it('a slow control signal pings the filter at a slightly lower resonance', () => {
    const def = makeMiniD();
    const v = { ...def.init, 'filter.emphasis': 9 }; // res = 0.9, in [0.8, 0.98)
    const r = explainCable(def, 'env1.out', 'vcf.in', v, []);
    expect(r?.hear).toContain('"pings" the filter');
  });

  it('with low resonance and the normal replaced, that usually means silence', () => {
    const def = makeMiniD();
    const r = explainCable(def, 'env1.out', 'vcf.in', def.init, []);
    expect(r?.hear).toContain('That usually means silence');
  });

  it('no signal on the cable yet reads as "Nothing"', () => {
    // att1 is a utility signal; with nothing feeding its input it resolves to "none".
    const def = makeMiniD();
    const r = explainCable(def, 'att.out', 'vcf.in', def.init, []);
    expect(r?.hear).toContain('Nothing: no signal is on this cable yet');
  });

  it('feeding the exact normal signal back in reads as already connected ("same")', () => {
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'mixer.out',
          x: 0,
          y: 0,
          r: 12,
          label: 'MIXER OUT',
          help: 'x',
          dir: 'out',
          signal: 'mixer',
        },
      ],
    });
    const r = explainCable(def, 'mixer.out', 'vcf.in', def.init, []);
    expect(r?.hear).toBe(
      'This is the connection the synth already makes inside, so the sound does not change. On the hardware a cable here does the same job as the internal wiring.'
    );
  });

  it('with a different real source arriving alongside it (via a summer), the matching one reads "still reaches X" (same + shared)', () => {
    // Two different roots meeting at a summer's two inputs are NOT merged by combine() (different keys), so both
    // stay in `live` and `shared` (live.length > 1) is true for each. The one whose root equals the destination's
    // builtin normal ("mixer") also satisfies `same`.
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'mixer.out',
          x: 0,
          y: 0,
          r: 12,
          label: 'MIXER OUT',
          help: 'x',
          dir: 'out',
          signal: 'mixer',
        },
        {
          id: 'sum1.out',
          x: 0,
          y: 0,
          r: 12,
          label: 'SUM 1 OUT',
          help: 'x',
          dir: 'out',
          signal: 'sum1',
        },
        {
          id: 'sum1.a.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'SUM 1 A',
          help: 'x',
          dir: 'in',
          dest: 'sum1A',
        },
        {
          id: 'sum1.b.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'SUM 1 B',
          help: 'x',
          dir: 'in',
          dest: 'sum1B',
        },
      ],
    });
    const r = explainCable(def, 'sum1.out', 'vcf.in', def.init, [
      { from: 'mixer.out', to: 'sum1.a.in' },
      { from: 'noise.out', to: 'sum1.b.in' },
    ]);
    expect(r?.hear).toContain(
      'From the mixer output: The mixer output still reaches the filter, just as it does with no cable in.'
    );
  });
});

describe("explainCable: hearUtil / consumers() — where a utility's output is heard", () => {
  it('with no consumer at all, says so and names the output jack to patch next', () => {
    const def = makeMiniD();
    const r = explainCable(def, 'gate.out', 'att.in', def.init, []);
    expect(r?.hear).toContain(
      'On its own this changes nothing you can hear, because nothing is connected to its output yet'
    );
    expect(r?.hear).toContain('Patch ATTEN OUT to a destination next.');
  });

  it('once a cable carries the utility\'s output onward, names that destination "by cable"', () => {
    const def = makeMiniD();
    const r = explainCable(def, 'gate.out', 'att.in', def.init, [
      { from: 'att.out', to: 'pitch.in' },
    ]);
    expect(r?.hear).toContain(
      'Its output currently goes to OSC CV (by cable), so that is where you will hear the change.'
    );
  });

  it('a route and a normal that both read the utility\'s output are named "wired inside"', () => {
    const def = withEngine(() => ({
      normals: { customDest: 'att1' },
      routes: [{ src: 'att1', dst: 'cutoff', amt: 1 }],
    }));
    const r = explainCable(def, 'gate.out', 'att.in', def.init, []);
    expect(r?.hear).toContain('customDest (wired inside)');
    expect(r?.hear).toContain('the filter cutoff (wired inside)');
  });

  it('an input whose dest names no utility just says the signal "now feeds" that jack', () => {
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'plain.util.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'PLAIN UTIL',
          help: 'x',
          dir: 'in',
          dest: 'somethingElse',
        },
      ],
    });
    const r = explainCable(def, 'gate.out', 'plain.util.in', def.init, []);
    expect(r?.hear).toBe('The key gate now feeds PLAIN UTIL.');
  });
});

describe('explainCable: lfoInUse() recognises a normal or trig.repeat, not just a route or cable', () => {
  it('does not warn when a built-in normal (no cable, no route) already carries the LFO somewhere audible', () => {
    const def = withEngine(() => ({ normals: { cutoff: 'lfoTri' } }));
    const r = explainCable(def, 'env2.out', 'lforate.in', def.init, []);
    expect(r?.warnings).toHaveLength(0);
  });

  it('does not warn when TrigParams.repeat gates the envelopes from the LFO square', () => {
    const def = withEngine((_v, base) => ({ trig: { ...base.trig, repeat: true } }));
    const r = explainCable(def, 'env2.out', 'lforate.in', def.init, []);
    expect(r?.warnings).toHaveLength(0);
  });
});

describe('explainCable: targetName for pw2 / pw3', () => {
  it('names Oscillator 2 and Oscillator 3 for their own pulse-width destinations', () => {
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'pw2.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'PWM 2',
          help: 'x',
          dir: 'in',
          dest: 'pw2',
          amt: 0.4,
          add: true,
        },
        {
          id: 'pw3.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'PWM 3',
          help: 'x',
          dir: 'in',
          dest: 'pw3',
          amt: 0.4,
          add: true,
        },
      ],
    });
    const pw2 = explainCable(def, 'lfo.tri', 'pw2.in', def.init, []);
    const pw3 = explainCable(def, 'lfo.tri', 'pw3.in', def.init, []);
    expect(pw2?.hear).toContain('the pulse wave of Oscillator 2');
    expect(pw3?.hear).toContain('the pulse wave of Oscillator 3');
  });
});

describe('explainCable: a Moog 900-series def dispatches straight to explainMoog', () => {
  it('returns a Moog-flavoured result (volts, not the generic Pitch modulation group)', () => {
    const r = explainCable(makeMoogD(), 'out.v1saw', 'in.v1lf', {}, []);
    expect(r?.kind).toBe('Pitch control');
    expect(r?.does).toContain('1 V per octave');
  });
});

describe('explainCable: zero-strength warning (an internal attenuator turned fully down)', () => {
  // The warning reads leaf.gain — what a UTILITY's own knob did to the signal on its way here — not the output
  // jack's `gain` field (that one folds into `jackAmt`, the destination-side depth, instead).
  it("warns when Attenuator 1's own knob is turned to (near) zero", () => {
    const def = withEngine(() => ({ att: [0.0001, 1] }));
    const r = explainCable(def, 'att.out', 'pitch.in', def.init, [
      { from: 'env1.out', to: 'att.in' },
    ]);
    expect(r?.warnings).toContain(
      'The signal reaches this cable at zero strength: an attenuator in its path is turned fully down.'
    );
  });
});

describe('explainCable: three or more real signals summed into one destination', () => {
  it('uses "Several" (not "Two") once more than two distinct sources fan into the same utility', () => {
    // Inverter 1 takes three inputs (inv1In, inv1A, inv1B), so feeding three different real roots into them gives
    // `combine()` three distinct (unmerged) leaves.
    const def = makeMiniD({
      jacks: [
        ...makeMiniD().jacks,
        {
          id: 'inv1.out',
          x: 0,
          y: 0,
          r: 12,
          label: 'INV 1 OUT',
          help: 'x',
          dir: 'out',
          signal: 'inv1',
        },
        {
          id: 'inv1.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'INV 1 IN',
          help: 'x',
          dir: 'in',
          dest: 'inv1In',
        },
        {
          id: 'inv1.a.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'INV 1 A',
          help: 'x',
          dir: 'in',
          dest: 'inv1A',
        },
        {
          id: 'inv1.b.in',
          x: 0,
          y: 0,
          r: 12,
          label: 'INV 1 B',
          help: 'x',
          dir: 'in',
          dest: 'inv1B',
        },
      ],
    });
    const r = explainCable(def, 'inv1.out', 'pitch.in', def.init, [
      { from: 'lfo.tri', to: 'inv1.in' },
      { from: 'lfo.sq', to: 'inv1.a.in' },
      { from: 'noise.out', to: 'inv1.b.in' },
    ]);
    expect(r?.hear).toContain('Several signals arrive down this cable, added together.');
  });
});
