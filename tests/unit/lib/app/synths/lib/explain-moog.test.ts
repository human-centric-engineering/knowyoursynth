// Unit tests for the Moog 900-series cable explainer (`explainMoog`). Every assertion checks a distinctive
// substring of the branch the inputs are built to reach, not the whole string and not the raw mock return value:
// `kindOf`, `destKind` and `resolve()` are real computation over the fixture's `MoogParams`, so a substring that is
// specific to one branch (a phrase, a sign, a kind label) is proof the code picked that branch, not just that it
// returned *something*.
import { describe, expect, it } from 'vitest';
import { explainMoog } from '@/lib/app/synths/lib/explain-moog';
import { DEFAULT_MOOG, makeMoogD } from '@/tests/fixtures/synths/moog-d';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import type { EngineParams, MoogParams, SynthDef } from '@/lib/app/synths/contract';

/** A Moog def whose `toEngine` ignores the panel and returns the base voice stub plus a patched `moog` block. */
function withMoog(moog: Partial<MoogParams>, jacks?: SynthDef['jacks']): SynthDef {
  return makeMoogD({
    ...(jacks ? { jacks } : {}),
    toEngine: () => ({
      osc: [],
      noise: { level: 0 },
      ext: { level: 0 },
      filter: {
        type: 'ladder',
        mode: 'lp',
        cutoff: 1000,
        res: 0,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 0,
      },
      env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
      env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
      vca: { envSrc: 'none', bias: 1 },
      lfo: { rate: 5, mix: { tri: 1 }, keySync: false },
      glide: { time: 0, legato: false },
      trig: { retrig: true, drone: false, repeat: false },
      volume: 1,
      moog: { ...DEFAULT_MOOG, ...moog },
    }),
  });
}

/** Resolve a def's engine params once (the panel is irrelevant to every fixture here) and explain one cable. */
function explain(def: SynthDef, from: string, to: string, cables: CableLike[] = []) {
  const ep = def.toEngine({}, { wheel: 0, patched: {} });
  return explainMoog(def, ep, from, to, {}, cables);
}

describe('explainMoog: guard clauses', () => {
  const def = makeMoogD();

  it('returns null for an id that names no jack', () => {
    expect(explain(def, 'out.nope', 'in.v1lf')).toBeNull();
  });

  it('returns null when from/to are reversed (in -> out)', () => {
    expect(explain(def, 'in.v1lf', 'out.v1saw')).toBeNull();
  });

  it('returns null when the output jack carries no signal', () => {
    const d = makeMoogD({
      jacks: [
        ...makeMoogD().jacks,
        { id: 'out.null', x: 0, y: 0, r: 10, label: 'NULL', help: 'n', dir: 'out', signal: null },
      ],
    });
    expect(explain(d, 'out.null', 'in.v1lf')).toBeNull();
  });

  it('returns null when EngineParams carries no moog block', () => {
    const ep = {
      ...def.toEngine({}, { wheel: 0, patched: {} }),
      moog: undefined,
    } as unknown as EngineParams;
    expect(explainMoog(def, ep, 'out.v1saw', 'in.v1lf', {}, [])).toBeNull();
  });

  it('reports plugged: true only when the pair is already in the cable list', () => {
    const notYet = explain(def, 'out.v1saw', 'in.v1lf');
    const already = explain(def, 'out.v1saw', 'in.v1lf', [{ from: 'out.v1saw', to: 'in.v1lf' }]);
    expect(notYet?.plugged).toBe(false);
    expect(already?.plugged).toBe(true);
  });
});

describe('explainMoog: result shape', () => {
  it('titles and labels the cable from the jacks, and carries the fixed labels help text', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1lf');
    expect(r?.title).toBe('VCO 1 SAW → VCO 1 LIN FREQ');
    expect(r?.fromLabel).toBe('VCO 1 SAW');
    expect(r?.toLabel).toBe('VCO 1 LIN FREQ');
    expect(r?.fromHelp).toBe('VCO 1 SAW output.');
    expect(r?.toHelp).toBe('VCO 1 LIN FREQ input.');
    expect(r?.modelled).toBe(true);
  });

  it("surfaces a jack's own check() as a warning", () => {
    const d = makeMoogD({
      jacks: makeMoogD().jacks.map((j) =>
        j.id === 'in.v1lf' ? { ...j, check: () => 'Turn the VCO 1 RANGE switch off LO first.' } : j
      ),
    });
    const r = explain(d, 'out.v1saw', 'in.v1lf');
    expect(r?.warnings).toContain('Turn the VCO 1 RANGE switch off LO first.');
  });

  it('warns when the signal reaches the cable at zero strength (a near-zero output gain)', () => {
    const d = makeMoogD({
      jacks: [
        ...makeMoogD().jacks,
        {
          id: 'out.tiny',
          x: 0,
          y: 0,
          r: 10,
          label: 'TINY',
          help: 'tiny',
          dir: 'out',
          signal: 'v1saw',
          gain: 0.0001,
        },
      ],
    });
    const r = explain(d, 'out.tiny', 'in.v1lf');
    expect(r?.warnings).toContain(
      'The signal reaches this cable at zero strength: a level knob in its path is turned fully down.'
    );
    expect(r?.carries).toContain('0% strength');
  });

  it('lists another cable into the same destination and notes the signals add', () => {
    const r = explain(makeMoogD(), 'out.p6', 'in.v1lf', [{ from: 'out.v1saw', to: 'in.v1lf' }]);
    expect(r?.does).toContain('VCO 1 SAW is plugged in here too, and the signals add together.');
  });

  it('reports "several signals" when the source resolves to more than one real leaf', () => {
    // A 921A driver with a non-zero FREQUENCY knob is itself a source, so feeding its link input adds a second.
    const d = withMoog({ drv: [{ v: 2, w: 0 }] });
    const r = explain(d, 'out.d1f', 'in.v1lf', [{ from: 'out.v1saw', to: 'in.d1fi' }]);
    expect(r?.hear).toContain('Several signals arrive down this cable, added together.');
    expect(r?.hear).toContain('From d1f:');
    expect(r?.hear).toContain('From v1saw:');
  });
});

describe('explainMoog: 902 amplifier shut warning', () => {
  it('warns when the amp is fed but its FIXED CONTROL VOLTAGE is 0 and nothing drives its CV', () => {
    const r = explain(makeMoogD(), 'out.a1p', 'in.dryIn', [{ from: 'out.v1saw', to: 'in.a1ip' }]);
    expect(r?.warnings.some((w) => w.includes('902 amplifier 1 is shut'))).toBe(true);
  });

  it('does not warn once FIXED CONTROL VOLTAGE is turned up', () => {
    const d = withMoog({ vca: [{ v: 5, exp: false }] });
    const r = explain(d, 'out.a1p', 'in.dryIn', [{ from: 'out.v1saw', to: 'in.a1ip' }]);
    expect(r?.warnings).toHaveLength(0);
  });

  it('carries the "through 902 amplifier N" phrasing when the leaf passes through the amp', () => {
    const r = explain(makeMoogD(), 'out.a1p', 'in.dryIn', [{ from: 'out.v1saw', to: 'in.a1ip' }]);
    expect(r?.carries).toContain('through 902 amplifier 1');
    expect(r?.hear).toContain('You hear v1saw through 902 amplifier 1');
  });
});

describe('explainMoog: destKind pitch (v*lf / v*dc / v*ac / d*fi)', () => {
  it('kbd: the keyboard CV reaching an oscillator pitch input plays in tune', () => {
    const r = explain(makeMoogD(), 'out.kcv1', 'in.v1lf');
    expect(r?.kind).toBe('Pitch control');
    expect(r?.hear).toContain('now follows the keyboard: one octave up for each octave you play');
  });

  it('const: a steady +6V / −6V simply transposes the oscillator', () => {
    const plus = explain(makeMoogD(), 'out.p6', 'in.v1dc');
    const minus = explain(makeMoogD(), 'out.n6', 'in.v1dc');
    expect(plus?.carries).toContain('a steady +6 V');
    expect(minus?.carries).toContain('a steady −6 V');
    expect(plus?.hear).toContain(
      'A steady voltage: it simply transposes v1saw, one octave per volt.'
    );
  });

  it('seq: the 960 sequencer steps the pitch one note per stage', () => {
    const r = explain(makeMoogD(), 'out.s960a', 'in.v1lf');
    expect(r?.carries).toContain(
      'a stepped voltage, one knob’s worth for each stage the 960 plays'
    );
    expect(r?.hear).toContain('plays one note per stage of the 960, an octave for every volt');
  });

  it('env: the envelope sweeps pitch up and back by the gain in octaves', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.v1lf');
    expect(r?.hear).toContain(
      'The pitch of v1saw follows the envelope: up by as much as 6 octaves at its peak'
    );
  });

  it('audio: a fixed-frequency oscillator FMs the target with clangy overtones (not a wobble)', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1lf');
    expect(r?.hear).toContain(
      'Frequency modulation: v1saw shakes the pitch of v1saw at audio rate'
    );
    expect(r?.hear).not.toContain('Vibrato');
  });

  it('audio into AC MOD notes that only the movement gets through', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1ac');
    expect(r?.hear).toContain('AC MOD blocks steady voltages, so only the movement gets through');
  });

  it('lfo: a sub-20Hz oscillator reads as vibrato, with a width-too-wide caveat past 3 semitones', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.v1lf');
    expect(r?.carries).toContain('slow enough to work as an LFO');
    expect(r?.hear).toContain('Vibrato: the pitch of v1saw rises and falls');
    expect(r?.hear).toContain('far wider than a musical vibrato');
  });

  it('d*fi: the driver input names "every 921B linked to this 921A", not the oscillator by number', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.d1fi');
    expect(r?.hear).toContain('every 921B linked to this 921A');
  });
});

describe('explainMoog: destKind width (v*lw)', () => {
  it('lfo: pulse-width modulation reads as a chorus-like movement', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.v1lw');
    expect(r?.kind).toBe('Pulse-width control');
    expect(r?.hear).toContain(
      'Pulse-width modulation: the rectangular wave gets thinner and wider'
    );
  });

  it('env: the pulse width follows the envelope', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.v1lw');
    expect(r?.hear).toBe(
      'The pulse width follows the envelope, so the tone of the rectangular wave changes through each note.'
    );
  });

  it('const: the driver WIDTH knob sets the rectangular width directly', () => {
    const r = explain(makeMoogD(), 'out.d1w', 'in.v1lw');
    expect(r?.carries).toContain('0 V from its WIDTH knob');
    expect(r?.hear).toContain('sets the width of the rectangular wave, about 16 % per volt');
  });

  it('audio (default): a plain source just "moves the width"', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1lw');
    expect(r?.hear).toBe('V1saw moves the width of the rectangular wave.');
  });
});

describe('explainMoog: destKind cutoff (lp904Cv / hp904Cv)', () => {
  it('kbd: key tracking keeps high notes as bright as low ones', () => {
    const r = explain(makeMoogD(), 'out.kcv1', 'in.lp904Cv');
    expect(r?.hear).toContain('Key tracking: the 904A low-pass filter follows the keyboard');
  });

  it('env: the envelope opens the filter by a number of octaves, naming the filter by its destination', () => {
    const lp = explain(makeMoogD(), 'out.e1', 'in.lp904Cv');
    const hp = explain(makeMoogD(), 'out.e1', 'in.hp904Cv');
    expect(lp?.hear).toContain('opens the 904A low-pass filter by up to 6 octaves');
    expect(hp?.hear).toContain('opens the 904B high-pass filter by up to 6 octaves');
  });

  it('seq: the 960 sets the cutoff step by step', () => {
    const r = explain(makeMoogD(), 'out.s960a', 'in.lp904Cv');
    expect(r?.hear).toContain('The 960 sets the cutoff of the 904A low-pass filter step by step');
  });

  it('lfo: filter wobble', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.lp904Cv');
    expect(r?.hear).toContain(
      'Filter wobble: the cutoff of the 904A low-pass filter rises and falls'
    );
  });

  it('audio: a growl or rasp on top of the sound', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.hp904Cv');
    expect(r?.hear).toContain(
      'shakes the cutoff of the 904B high-pass filter at audio rate: a growl or rasp'
    );
  });
});

describe('explainMoog: destKind gain (a*cv)', () => {
  it('env: opens the amplifier on every note; a non-zero FIXED CONTROL VOLTAGE warns of a drone', () => {
    const quiet = explain(makeMoogD(), 'out.e1', 'in.a1cv');
    expect(quiet?.hear).toContain('this is what turns a constant tone into notes');
    expect(quiet?.hear).not.toContain('drone');
    const droning = explain(withMoog({ vca: [{ v: 5, exp: false }] }), 'out.e1', 'in.a1cv');
    expect(droning?.hear).toContain('FIXED CONTROL VOLTAGE is at 5');
    expect(droning?.hear).toContain('you will hear a drone');
  });

  it('lfo: tremolo, with the amplifier shut on the negative half of each cycle', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.a1cv');
    expect(r?.hear).toContain('Tremolo: the level rises and falls');
    expect(r?.hear).toContain('the amplifier is shut');
  });

  it('vtrig: an organ-like on/off', () => {
    const r = explain(makeMoogD(), 'out.i9a', 'in.a1cv');
    expect(r?.hear).toBe(
      'The amplifier jumps open while the trigger is on: an organ-like on/off, with a click at each end.'
    );
  });

  it('strig: upside down — open between notes, shut while a key is held', () => {
    const r = explain(makeMoogD(), 'out.i9sL', 'in.a1cv');
    expect(r?.hear).toContain('Upside down: an S-trigger is high when nothing is happening');
  });

  it('kbd: loudness follows the keyboard', () => {
    const r = explain(makeMoogD(), 'out.kcv1', 'in.a1cv');
    expect(r?.hear).toBe(
      'Loudness follows the keyboard: higher notes are louder, and notes below middle C are quieter or silent.'
    );
  });

  it('audio: amplitude modulation adds ring-modulator-like overtones', () => {
    const r = explain(makeMoogD(), 'out.white', 'in.a1cv');
    expect(r?.hear).toContain(
      'Amplitude modulation: white opens and shuts the amplifier at audio rate'
    );
  });
});

describe('explainMoog: destKind strig (e*st / i9siL / dtI*)', () => {
  it('strig into an envelope S-TRIG fires T1/T3', () => {
    const r = explain(makeMoogD(), 'out.ktrU', 'in.e1st');
    expect(r?.hear).toContain('now fires this envelope: it starts (T1) when the trigger goes on');
  });

  it('strig into a non-envelope strig dest drives it "the right way round"', () => {
    const r = explain(makeMoogD(), 'out.i9sL', 'in.i9siL');
    expect(r?.hear).toBe('I9sL now drives this input the right way round.');
  });

  it('vtrig into an S-trigger input reads upside down, with the CM1A fix named', () => {
    const r = explain(makeMoogD(), 'out.i9a', 'in.e1st');
    expect(r?.hear).toContain('Upside down.');
    expect(r?.hear).toContain('Set the CM1A’s TRIG MODE to S-TRIG');
  });

  it('lfo into a strig dest fires the envelope once per LFO cycle', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.e1st');
    expect(r?.hear).toContain('Each cycle fires the envelope');
  });

  it('audio into a strig dest is a buzz of retriggers, not a rhythm', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.dtI1');
    expect(r?.hear).toContain('a buzz of retriggers, not a rhythm');
  });

  it('a plain const source falls back to the half-level trigger rule', () => {
    const r = explain(makeMoogD(), 'out.p6', 'in.e1st');
    expect(r?.hear).toBe('P6 is read as on whenever it is below about +2.5 V.');
  });
});

describe('explainMoog: destKind vtrig (v*tv)', () => {
  it('vtrig into vtrig fires normally', () => {
    const r = explain(makeMoogD(), 'out.i9a', 'in.v1tv');
    expect(r?.hear).toBe('I9a now fires this input each time it goes on.');
  });

  it('strig into vtrig is upside down (fires at the end, not the start)', () => {
    const r = explain(makeMoogD(), 'out.i9sL', 'in.v1tv');
    expect(r?.hear).toContain('Upside down.');
    expect(r?.hear).toContain('fires when the trigger ends, not when it starts');
  });

  it('lfo into vtrig fires on each rise past +2.5V', () => {
    const lfoDef = withMoog({ vco: [{ kind: '921', semi: -48, sync: 'off' }] });
    const r = explain(lfoDef, 'out.v1saw', 'in.v1tv');
    expect(r?.hear).toContain('It fires each time v1saw rises past +2.5 V');
  });

  it('audio (default) fires whenever it rises past the threshold', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1tv');
    expect(r?.hear).toBe('It fires whenever v1saw rises past about +2.5 V.');
  });
});

describe('explainMoog: destKind clock (s960cv)', () => {
  it('has no "does" sentence (DOES.clock is empty) and doubles tempo per volt', () => {
    const r = explain(makeMoogD(), 'out.s960clk', 'in.s960cv');
    expect(r?.does).toBe('');
    expect(r?.hear).toBe(
      'S960clk changes the 960’s clock speed at 1 V per octave: each volt doubles the tempo.'
    );
    expect(r?.kind).toBe('Clock speed');
  });
});

describe('explainMoog: destKind sync (v*sy)', () => {
  it('audio: hard sync, named explicitly', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.v1sy');
    expect(r?.hear).toContain('Hard sync: this oscillator restarts with every cycle of v1saw');
  });

  it('non-audio source falls back to "restarts this oscillator each time it falls sharply"', () => {
    const r = explain(makeMoogD(), 'out.p6', 'in.v1sy');
    expect(r?.hear).toBe('P6 restarts this oscillator each time it falls sharply.');
  });
});

describe('explainMoog: destKind util (mu*In / t*In / x*i* / c*i* / c*x / sw962i* / q*In)', () => {
  it('multiple: copies the source to its other jacks', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.mu1In');
    expect(r?.hear).toBe(
      'The multiple now copies e1 to its other jacks, so one signal can go to several places.'
    );
  });

  it('992 attenuator: passes the source at the knob level', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.t1In');
    expect(r?.hear).toContain('The attenuator now passes e1 at the level set by its knob');
    expect(r?.hear).toContain('to the attenuators below too');
  });

  it('994 mixer channel: adds the source to its other inputs at this channel level', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.x1i1');
    expect(r?.hear).toBe('The mixer now adds e1 to its other inputs, at this channel’s level.');
  });

  it('992 controller: adds the source to the voltage it sends, naming its switch when off', () => {
    const onDef = withMoog({ ctl: [{ on: [true, true, true], x: 1 }] });
    const offDef = withMoog({ ctl: [{ on: [false, true, true], x: 1 }] });
    const on = explain(onDef, 'out.e1', 'in.c1i1');
    const off = explain(offDef, 'out.e1', 'in.c1i1');
    expect(on?.hear).toBe('C1 adds e1 to the voltage it sends to its outputs.');
    expect(off?.hear).toContain(
      'Its switch for this input is off, so nothing gets through until you turn it on.'
    );
  });

  it('992 controller external input: scaled by the attenuator knob', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.c1x');
    expect(r?.hear).toBe(
      'C1 adds e1 to the voltage it sends to its outputs, scaled by its attenuator knob.'
    );
  });

  it('962 switch: passes the source while this input is selected', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.sw962i1');
    expect(r?.hear).toBe(
      'The 962 passes v1saw to its output while this input is the selected one.'
    );
  });

  it('995 attenuator: passes the source at the knob level', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.q1In');
    expect(r?.hear).toBe('The 995 attenuator passes e1 at the level set by its knob.');
  });

  it('a self-referencing util cable (its own output feeding its own input) reads as a loop', () => {
    const r = explain(makeMoogD(), 'out.mu1', 'in.mu1In');
    expect(r?.carries).toBe(
      'Right now: nothing useful, because its input is fed from its own output.'
    );
    expect(r?.hear).toBe('Nothing yet: no signal is on this cable.');
  });
});

describe('explainMoog: destKind out (dryIn) and destKind audio (a*ip / a*in / default)', () => {
  it('a plain unshaped audio source drones with no amplifier under it', () => {
    const r = explain(makeMoogD(), 'out.v1saw', 'in.dryIn');
    expect(r?.hear).toContain('drones whether or not a key is held');
    expect(r?.hear).toContain('Put a 902 under an envelope');
  });

  it('a control voltage fed straight to the output is at most a click', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.dryIn');
    expect(r?.hear).toBe(
      'E1 is a control voltage, not a sound. Fed to the output you hear at most a click when it jumps.'
    );
  });

  it('a*ip / a*in: control-voltage sources are scaled through the amp, not just passed on', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.a1ip');
    expect(r?.hear).toContain(
      'is a control voltage, and 902 AMP 1 IN + passes it on scaled by its own control voltage'
    );
    expect(r?.hear).toContain('fades in');
  });

  it('a*in inverts the control voltage it scales', () => {
    const r = explain(makeMoogD(), 'out.e1', 'in.a1in');
    expect(r?.hear).toContain('This input turns it upside down.');
  });

  it('an audio source into a*ip is just processed, with no CV-scaling sentence', () => {
    const r = explain(makeMoogD(), 'out.white', 'in.a1ip');
    expect(r?.hear).toBe('902 AMP 1 IN + now processes white.');
  });

  it('a generic unmodelled dest (destKind default "audio") passes a CV on as a CV', () => {
    const d = makeMoogD({
      jacks: [
        ...makeMoogD().jacks,
        {
          id: 'in.custom',
          x: 0,
          y: 60,
          r: 10,
          label: 'CUSTOM',
          help: 'c',
          dir: 'in',
          dest: 'customAudio',
        },
      ],
    });
    const r = explain(d, 'out.e1', 'in.custom');
    expect(r?.kind).toBe('Audio input');
    expect(r?.hear).toContain('is a slow control voltage');
    expect(r?.hear).toContain('CUSTOM passes it on as a control voltage');
  });
});

describe('explainMoog: resolve() loop detection vs. real resolution', () => {
  it('the attenuator (half-normalled chain) resolves through a fed input, not just its own loop', () => {
    const r = explain(makeMoogD(), 'out.t1', 'in.v1lf', [{ from: 'out.e1', to: 'in.t1In' }]);
    expect(r?.hear).toContain('The pitch of v1saw follows the envelope');
  });

  it('a mixer channel resolves the signal fed into one of its four inputs', () => {
    const r = explain(makeMoogD(), 'out.x1p', 'in.v1lf', [{ from: 'out.e1', to: 'in.x1i1' }]);
    expect(r?.hear).toContain('The pitch of v1saw follows the envelope');
  });

  it('a 992 controller resolves the signal fed into one of its channel inputs', () => {
    const r = explain(makeMoogD(), 'out.c1', 'in.v1lf', [{ from: 'out.e1', to: 'in.c1i1' }]);
    expect(r?.hear).toContain('The pitch of v1saw follows the envelope');
  });

  it('with nothing fed in, the mixer/controller/attenuator all read as "nothing patched"', () => {
    const r = explain(makeMoogD(), 'out.x1p', 'in.v1lf');
    expect(r?.carries).toBe('Right now: nothing. X1p has nothing patched into it.');
    expect(r?.hear).toBe('Nothing yet: no signal is on this cable.');
  });
});
