// "Unusual on the System …" notes for the 900-series modules (CONTRACT.md → Unusual notes). Shared by the three systems:
// each system's own unusual file passes these through `forRack()`, which keeps the notes whose ids that system has.

/** Notes per module type, written for slot 1; `expand()` repeats them for every numbered copy of the module. */
const NOTES = {
  'm904a.regeneration': 'REGENERATION is Moog’s word for resonance (the Minimoog calls it EMPHASIS).',
  'm904a.fixed_cv': 'There is no cutoff knob as such: FIXED CONTROL VOLTAGE is a voltage added to the control inputs, an octave per volt, so the knob and an envelope work the same way.',
  'm914': 'A fixed filter bank is rare on a synthesizer. It is closer to a graphic equaliser: the bands never move with the note, which is what makes it good at body and formant sounds.',
  'm921': 'There is no module called LFO on a Moog system. The 921 with COARSE RNG on SUB is the LFO, and it can still run at audio rate when switched back.',
  'cp35': 'The attenuator inputs are half-normalled: one signal into IN 1 reaches all four attenuators until the inputs below it are used, so one source can be sent at four different levels without a multiple.',
  'cm1a.trig_mode': 'Moog modules expect S-triggers, the reverse of most synths’ gates. This switch lets the CM1A send either kind, or one of each.',
};
const PER = {
  m921b: { area: 'A 921B has no keyboard input of its own. Its playing pitch arrives from a 921A Oscillator Driver over the 921AB LINK cable, so one 921A tunes and plays a whole chain of 921Bs at once.' },
  m921a: { area: 'The 921A makes no sound. It is the shared pitch and pulse-width control for a bank of 921B oscillators, which is how Moog split one oscillator into a driver and a row of slaves.' },
  m911: {
    area: 'T1, T2, E SUS and T3 are attack, decay, sustain and release under other names: T2 is the initial decay to the sustain level, T3 the final decay after the key is let go.',
    'strig': 'An S-trigger input: it fires while the line is pulled down to 0 V. Most synths use V-triggers (+5 V while on); patch one in here and the envelope runs upside down.',
  },
  m902: {
    'fixed_cv': 'There is no level knob: FIXED CONTROL VOLTAGE is a voltage added to the control inputs. At 0 the amplifier stays shut until an envelope opens it; turn it up and the sound drones.',
    'mode': 'The 902 can respond in a straight line (LIN) or exponentially (EXP). Most synths’ amplifiers have one fixed response.',
  },
  cp3am: { area: 'The mixer has an inverted output beside the normal one, as well as two passive multiples. Inverted outputs are rare on synth mixers; on a modular they turn any control voltage upside down.' },
};

/** All notes, for every slot of every module type the largest system has. */
function expand() {
  const out = { ...NOTES };
  for (const [kind, notes] of Object.entries(PER)) {
    for (let n = 1; n <= 9; n++) {
      const id = `${kind}_${n}`;
      for (const [k, text] of Object.entries(notes)) {
        if (k === 'area') out[id] = text;
        else if (k === 'strig') out[`j.${id}.strig`] = text;
        else out[`${id}.${k}`] = text;
      }
    }
  }
  return out;
}
const ALL = expand();

/** The notes whose ids exist on this rack (controls, jacks and areas), plus any extra notes for this system. */
export function forRack(rack, extra = {}) {
  const ids = new Set([...rack.controls, ...rack.jacks, ...rack.areas].map((x) => x.id));
  return Object.fromEntries(Object.entries({ ...ALL, ...extra }).filter(([id]) => ids.has(id)));
}
