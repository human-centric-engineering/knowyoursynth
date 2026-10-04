// What this app does not reproduce, per synth. Shown in the "What is not modelled" dialog.
// Every entry here must match what the SynthDef's own help text says: if a control or jack is
// declared unmodelled in `src/synths/<id>.js`, it belongs in that synth's list, and nothing that
// is not in the code belongs here at all.

/** True of every panel. */
export const SHARED = [
  ['A sound-alike, not a circuit model',
    'Every panel drives one shared digital voice. Ranges, curves and routings follow each synth’s published specification, so the controls behave as they do on the hardware — but component tolerances, tuning drift and the exact distortion of each individual circuit are approximated, not reproduced.'],
  ['Chords only where the hardware plays them',
    'The mono synths play one note at a time, like the hardware. Where one can play two notes — the 2600’s DUO keyboard, the Neutron’s PARA switch — that mode is modelled. The DeepMind 12D plays chords on twelve voices, the UB-Xa D on sixteen, the PRO-800 and the Jupiter-8 on eight, the Jupiter-6 on six and the Jupiter-4 on four, each a full copy of the voice. The 2-XM plays two notes on its two modules, each set up separately. The Poly D plays up to four, one per oscillator, through its one filter, as the hardware does.'],
  ['No sound from outside',
    'External audio inputs work, but the only thing you can feed them is the synth’s own output, patched round with a cable. There is no microphone or line input.'],
  ['Hardware fittings are printed, not wired',
    'MIDI sockets, power switches and the hardware’s own keyboard and wheels are drawn on the panel for reference. The keyboard strip under the panel plays the synth instead, and the mod wheel beside it is the one that works.'],
  ['MIDI needs its own page',
    'A MIDI keyboard works in Chrome or Edge when this page is open on its own. Claude’s artifact viewer does not pass MIDI permission through, so the Connect MIDI button cannot succeed inside it.'],
];

/** Per synth: `intro` plus the specific things the panel prints but the app does not model. */
export const LIMITS = {
  'model-d': {
    intro: 'Every control in the signal path is modelled: three oscillators, the mixer with its noise and external input, the ladder filter, both envelopes and the modulation bus.',
    items: [
      ['The lower VOLUME knob', 'The one beside the PHONES socket at the right-hand end sets the headphone level on the hardware, and does nothing here. The VOLUME knob above it, in the output section, is the one that works.'],
      ['MIDI IN and MIDI THRU', 'The sockets are printed on the panel. Playing comes from the on-screen keyboard or a MIDI keyboard connected through the button in the header.'],
    ],
  },
  neutron: {
    intro: 'The whole voice is modelled, including the overdrive and the analogue-style delay, plus the patch bay’s attenuators, summer, inverter, slew and sample-and-hold.',
    items: [
      ['SHAPE 1 and SHAPE 2 inputs', 'Voltage control of each oscillator’s waveshape is not modelled. A cable into either jack can be drawn but has no audible effect; the SHAPE knobs themselves work.'],
      ['LFO SHAPE input', 'Voltage control of the LFO’s shape morph is not modelled. The LFO SHAPE knob works.'],
      ['ASSIGN output', 'On the hardware this is assignable over MIDI. Here it always carries the keyboard pitch.'],
    ],
  },
  'pro-1': {
    intro: 'The two oscillators, the ladder filter, both envelopes and the whole of the direct and wheel modulation matrix are modelled, as is the patch bay.',
    items: [
      ['Sequencer', 'SEQUENCE A/B and the RECORD / PLAY switch are not modelled. Use the Play riff button under the keyboard to hear a sound in motion.'],
      ['Arpeggiator', 'The ARPEGGIATOR switch, which on the hardware steps through the keys you hold at the LFO rate, is not modelled.'],
      ['POLY / MONO', 'This switch is for chaining several Pro-1s together to play chords. It has no effect on a single unit, or here.'],
      ['MOD WH CV input', 'Voltage control of the wheel bus depth is not modelled. The mod wheel beside the keyboard does that job.'],
    ],
  },
  b2600: {
    intro: 'The three oscillators, both filter revisions, the ring modulator, the spring reverb, the envelopes, the sample-and-hold, the electronic switch, the lag processors, the preamp and the envelope follower are all modelled, as is the full patch bay.',
    items: [
      ['It plays in mono', 'PAN has no audible effect, the two REVERB sliders add together, and the left and right inputs both arrive at the single output at half level.'],
      ['The two filters are close, not exact', 'FILTER 1 (4012) and FILTER 2 (4072) are both 24 dB low-pass filters here; the 4072 is driven a little harder, so it sounds slightly thicker and grittier. The real difference between the two boards is subtler than that.'],
      ['Momentary controls latch', 'The MANUAL trigger button and the MOMEN portamento button stay on when clicked, and off when clicked again, rather than working only while held.'],
      ['Electronic switch runs one way', 'On the hardware A, B and C also work in reverse, with one input fed to two outputs. Here it is A and B in, C out.'],
    ],
  },
  k2: {
    intro: 'Both oscillators, the high-pass and low-pass filter pair, both envelopes with their delay and hold stages, the modulation generator, the sample-and-hold, the spare VCA and the patch panel’s re-routing jacks are all modelled.',
    items: [
      ['Most of the external signal processor', 'The preamp and the envelope follower work — patch SIGNAL OUT round to SIGNAL IN and you have a second envelope that tracks what you play. The band-pass filter (LOW CUT FREQ, HIGH CUT FREQ, and the second OUT jack, which carries the same signal as the first), the pitch extractor (CV ADJUST and F∝V CV OUT) and the trigger extractor (THRESHOLD LEVEL and the ESP’s TRIG OUT) are not modelled.'],
      ['The inverted envelope outputs', 'EG 1 REV OUT and EG 2 REV OUT carry each envelope upside down on the hardware. Neither is modelled, so a cable from either does nothing. EG 2 is only available inverted, which is why there is no jack for it the right way up.'],
      ['TRIG SW OUT', 'The manual trigger button’s output. Notes here are fired from the keyboard, so a cable from this jack does nothing.'],
      ['PINK and WHITE', 'Both jacks carry the same noise source, so they sound identical. On the hardware the pink output has the top end rolled off.'],
      ['Envelope 2’s decay taper', 'The full 0.5 ms to 15 s range is there and both ends match the specification, but the middle of the knob is spread out so the short times stay usable. The hardware’s taper is steeper.'],
    ],
  },
};

LIMITS['deepmind-12d'] = {
  intro: 'All twelve voices are modelled: both oscillators with PWM, tone modulation and sync, noise, the 2- and 4-pole filter, three envelopes with their curves, both LFOs with delay, the common high-pass filter and BOOST, unison and mono stacking, portamento and the arpeggiator. The FX button opens the four-slot effects engine, with all 35 algorithms, every parameter and all ten routings. The display shows the menu rows that matter most for sound design.',
  items: [
    ['The effects are approximations', 'The DeepMind’s effects are digital algorithms licensed from TC Electronic, Klark Teknik and Midas, and the manual only lists their parameters, each named after a classic unit (Lexicon 480L, EMT 250, Fairchild 670, Leslie…). Here each is this app’s own version, built to respond to the same parameters in the same way. They are close in character, not copies: a real HallRev or FairComp will sound different in detail.'],
    ['Effects details not in the manual', 'Slot LEVEL is off at 0 and unchanged at 8 here; the manual does not print its range. How two effects side by side are mixed is not described: here they are averaged in INSERT mode and added in SEND mode. The feedback routings M-9 and M-10 are read from their names and diagrams. The MultiBandDist cabinet tones are estimates. The table for DecimDelay lost its first row, taken here to be MIX.'],
    ['Effects not modelled', 'Tempo-synced delay and LFO times, the effects parameters as modulation-matrix destinations, and the per-slot MIX the FX menu also has (each algorithm’s own MIX does the same job here).'],
    ['The modulation matrix', 'The MOD button and the eight-slot matrix are not modelled. The fixed routings the panel and the OSC EDIT and VCF EDIT menus offer all work.'],
    ['Envelope and LFO times are estimates', 'The manual gives no envelope times at all and only the end points of the other faders. The times and curves here are chosen to behave sensibly, not measured from a unit.'],
    ['CHORD, POLY CHORD and the control sequencer', 'Printed on the panel but not modelled. The arpeggiator works, with five of its orders and up to four octaves.'],
    ['Menus not shown', 'Velocity and aftertouch depths, pan spread, VCA mode, envelope trigger modes, LFO phase and clock sync, note priority, parameter drift and every GLOBAL setting stay at their defaults. The sustain curve (a slope on the S stage) is not modelled.'],
    ['Display navigation', 'The −/NO, +/YES and BANK buttons, the encoder and the DATA ENTRY fader are printed but do nothing: click a value on the screen instead. Sounds are kept in this app’s library, not in programs, so PROG, COMPARE and WRITE only change the screen.'],
    ['Mono voices', 'The voices are mixed to one channel, so pan spread is not reproduced. The effects engine is stereo, so anything after it (chorus, ping-pong delay, reverb, the rotary speaker) is heard in stereo.'],
  ],
};

LIMITS['ub-xa-d'] = {
  intro: 'One patch is modelled on all sixteen voices: both oscillators with their waveform switches, sync and F-ENV, the HALF/FULL mixer and noise, the 2- and 4-pole filter with tracking, both envelopes, the modulation LFO with both depth rows and all six routing switches, the performance LFO, polyphonic portamento, unison and the arpeggiator.',
  items: [
    ['Two patches at once', 'The UB-Xa D holds a lower and an upper patch and plays them split or doubled. This app plays one patch, so SPLIT, DOUBLE, LOWER and UPPER in the KEYBOARD section and BALANCE do not change the sound. The performance LFO’s LOWER and UPPER switches both count for the one patch: it is heard while either is on.'],
    ['Ranges are estimates', 'The Quick Start Guide gives the LFO range (0.06 to 50 Hz) and the oscillator steps, and nothing else. Envelope times, the filter’s cutoff range and resonance, the depth of each modulation route, the pulse-width direction, the OSC 2 DETUNE range (here up to half a semitone sharp) and the MASTER TUNE range are this app’s choices.'],
    ['F-ENV depth', 'The guide does not say what sets how far F-ENV bends OSC 2. Here it follows the filter’s MODULATION knob, up to two octaves.'],
    ['Two LFO positions are approximate', 'The modulation LFO’s SMP position samples the performance LFO on the hardware; here it is a plain sample and hold at the modulation LFO’s rate. The performance LFO’s NOISE shape is a smoothly wandering random signal.'],
    ['Unison stacks eight voices', 'On the hardware UNISON stacks all sixteen voices on one note, with the spread set by the VOICE DETUNE shift function. Here it stacks eight, with a fixed small spread: sixteen full voices on one note is more than this page can run smoothly.'],
    ['Arpeggiator settings', 'ARP ON and HOLD work. The settings menu is not modelled: the arpeggio always plays upwards over one octave at 120 BPM.'],
    ['Everything behind SHIFT', 'The grey functions printed under the controls (PRESET VOLUME, TEMPO SYNC, VOICES, VOICE DETUNE, QUANTIZE, INVERT, the MOD 1 and MOD 2 DELAY and ATTACK, PEDAL RELEASE, VINTAGE and the rest) and the four menus are not modelled. Most are not described in the guide either.'],
    ['Printed but not modelled', 'TRANSPOSE, CHORD, the BEND switches (this app has no pitch bend), the sequencer, the programmer buttons, the display, the SELECT encoder and the four preset recall switches. Sounds are kept in this app’s library instead of in presets.'],
    ['Pedals', 'The vibrato and filter pedal inputs and the sustain, hold and program-advance footswitches on the back are not modelled.'],
  ],
};

LIMITS['2-xm'] = {
  intro: 'Both modules are modelled as separate voices, each with its own settings: two VCOs with sync and the bipolar MODULATION knobs, the saw/pulse and input/noise crossfades, the 12 dB filter with its low-pass to notch to high-pass sweep and band-pass, both ADS envelopes, the LFO and the VCA with velocity and ON/EXT. The master section’s level, pan, external level, portamento and UNI / SPLIT / DUO assignment work, and so do both patchbays, including cables from one module to the other.',
  items: [
    ['Ranges are estimates', 'The Quick Start Guide gives the envelope times and the LFO range, and this app uses them. It gives no cutoff range, resonance law, knob tapers, fine-tune or modulation depths, or crossfade law: those are this app’s choices. The filter here does not self-oscillate.'],
    ['Things the guide does not say', 'The LFO’s shape (a triangle here), which waveform comes out of each VCO jack (the sawtooth here), and whether the two modules share one noise source (each has its own here) are not stated.'],
    ['Note priority and split point', 'In UNI the newest key goes to XM1 and the key held before it to XM2; the hardware lets SynthTRIBE choose highest, lowest or last. The split point is fixed at middle C (C4), the hardware’s default.'],
    ['Cables between the modules', 'A signal patched from one module to the other arrives one sample late. That is inaudible for control signals, but audio-rate cross-modulation between the modules is very slightly different from the hardware.'],
    ['Printed but not modelled', 'STEREO OUT, MIDI IN and the power LED are drawn for reference: the sound always comes out of this page in stereo. Poly chaining, the MIDI channel switches and the SynthTRIBE settings are not modelled. LFO TRIG works from any signal here; the guide says it does not respond when the module is played over MIDI.'],
  ],
};

LIMITS.kobol = {
  intro: 'The whole voice is modelled: both VCOs with their morphing WAVEFORM knobs, sync and BEAT, the VCA on each VCO, the 24 dB filter with keyboard tracking to 200 % and the bipolar ADS CONTROL, both ADS envelopes with DECAY OFF, the LFO with its normal to the VCOs’ pitch, the PWM source switch, noise and the voltage processor. The patch points work, including the VCO 2 OUT insert and the CV inputs to each VCO’s waveform and level.',
  items: [
    ['Ranges are estimates', 'The Quick Start Guide gives no envelope times, and the envelope times here are read from the time ring printed round the knobs (about 2 ms to 4.6 s). The panel prints the VCO, filter and LFO ranges, and this app uses them. The waveform morph law, the depths of the LFO and pulse-width modulation, the resonance law and the scaling of the CV inputs are this app’s choices.'],
    ['Envelope and envelope-depth CV inputs', 'The ATTACK, DECAY and SUSTAIN inputs of both envelopes and ADS CTRL are not modelled. A cable can be drawn to them but does nothing. The knobs themselves work.'],
    ['VCO 2 OUT return', 'On the hardware VCO 2 OUT is a stereo insert: a Y-cable sends VCO 2 out on the tip and returns it on the ring. Here a cable takes VCO 2 out of the filter’s input, as a mono plug does; patch it back in at VCF AUDIO IN to return it.'],
    ['Gate polarity, poly chain and MIDI', 'The SynthTRIBE settings (gate polarity, poly chaining), the MIDI channel switches, MIDI IN and the power LED are drawn for reference or not modelled. The specifications also list a sample-and-hold LFO shape that the panel does not have; it is not modelled.'],
  ],
};

LIMITS.cat = {
  intro: 'The whole voice is modelled: both VCOs with every waveform slider, the sub octaves, VCO 1’s pulse width and its three sources, duophonic POLY / MONO / OFF keyboard control, both sync modes, the six modulation switch-and-knob groups (including audio-rate cross-modulation between the VCOs and from VCO 1 to the filter), the 24 dB filter with keyboard control, the ADSR and AR, the VCA switch, noise, the delayed LFO, sample and hold from noise or VCO 1, and ADSR REPEAT. The patch points work.',
  items: [
    ['Ranges are estimates', 'The Quick Start Guide gives no times or ranges. The envelope times, filter range, glide and bend here come from the manual of the earlier Octave CAT SRM, which the data model assumes carries over; the slider laws in between, the modulation depths and the VCO 1 COARSE span are this app’s choices. The filter tops out at 20 kHz rather than the SRM’s 27 kHz.'],
    ['Sync modes', 'Behringer does not document the two sync modes. MODE B is modelled as plain hard sync and MODE A as hard sync with VCO 1 silenced for the second half of each VCO 2 cycle, from owner reports; the real gating may differ.'],
    ['Duophonic note memory', 'On POLY, VCO 2 plays the lowest key held and VCO 1 the highest. The Octave manual describes an analogue two-note memory that holds intervals after release and drifts slowly; that is not modelled, and neither is the note-priority setting in Behringer’s app.'],
    ['VCO1 CV', 'The guide says VCO1 CV controls both VCOs. Here it moves the VCOs that follow the keys, so VCO 1 ignores it while KEYBOARD CONTROL is OFF.'],
    ['MIDI, poly chain and the rear panel', 'MIDI IN, MIDI THRU, USB, the MIDI channel switches, the poly chain and the POWER lamp’s colours are drawn for reference or not modelled. The low-level rear output is left out.'],
  ],
};

LIMITS['wasp-deluxe'] = {
  intro: 'The whole voice is modelled: both oscillators with their footages, waveforms (including OFF and ENH) and the upper one’s WIDTH, the mixer with noise and the EXT feedback of the output when nothing is patched, the multimode filter (LO, BAND, NOTCH, HI) with both bipolar FILTER CONTROL knobs, the control oscillator’s six shapes and PITCH MOD, the VCA envelope with REPEAT and HOLD, and the control envelope with its DELAY and REPEAT. OSC1, OSC2, EXT AUDIO, MAIN AUDIO and PHONES can be patched.',
  items: [
    ['Ranges are estimates', 'The Quick Start Guide gives only the control oscillator range (0.5 to 100 Hz) and the control envelope’s delay (up to 1 s), and this app uses them. The envelope times, filter range, resonance law, the spans of BEND, TUNE and OSC 2 PITCH, the PITCH MOD and FILTER CONTROL depths, and the filter’s keyboard tracking (half here) are this app’s choices.'],
    ['ENH and the digital oscillators', 'The guide says only that ENH adds punch, bite and clarity. Here it is the sawtooth and the pulse played together. The aliased edge of the Wasp’s digital oscillators is not reproduced: the oscillators here are clean.'],
    ['The filter', 'The Wasp’s CMOS filter is modelled with this app’s state-variable filter. Q works as resonance in every mode; the guide’s description of it as the slope in LO and HI is not modelled separately.'],
    ['Where the REPEAT zones start', 'SUSTAIN LEVEL and the control envelope’s DELAY switch to REPEAT in the last twentieth of their travel, anticlockwise. Where the hardware changes over is not documented.'],
    ['PHONES and printed parts', 'The PHONES knob does nothing here: use VOLUME. MIDI IN, MIDI THRU, USB, the power lamp, the MIDI channel switches, poly chain and the SysEx settings (key priority, multi-trigger, bend range) are drawn for reference or not modelled. Notes retrigger the envelopes only when played detached.'],
  ],
};

LIMITS['poly-d'] = {
  intro: 'The whole voice is modelled: four oscillators with their ranges and waveforms, the MONO, UNI and POLY modes with AUTO DAMP, the mixer with noise and the external input (fed from the synth’s own output), the ladder filter with its high-pass mode, both contours with the DECAY switch, the Minimoog modulation bus, the distortion, the stereo chorus and the arpeggiator.',
  items: [
    ['How notes are shared out', 'The guide describes POLY only briefly. Here each new key takes the next oscillator in turn, as on the Korg Mono/Poly the voice logic comes from; UNI deals the held keys round the oscillators (three keys get two, one and one). With OSC 4 CONTROL off, Oscillator 4 is left out of the sharing. Filter keyboard tracking follows the note on Oscillator 1.'],
    ['Ranges are estimates', 'The guide gives the LFO range (0.05 to 200 Hz) and the contour times, and this app uses them. The filter range, resonance law, glide times, the tempo range, the depth of the mod wheel and the distortion and chorus settings are this app’s choices; the chorus follows the Juno-60 it is modelled on.'],
    ['The sequencer', 'Only the arpeggiator is modelled: ARP, HOLD, TEMPO and the choice of order (STEP here; KYBD and STEP on the hardware). The eight orders are this app’s reading of the guide’s short list. The 32-step sequencer, its patterns and banks, and the RESET, PATTERN, SHIFT, PAGE, PLAY/STOP, REC, KYBD and step buttons are printed but do nothing. SWING and gate length are not modelled.'],
    ['Chorus with neither button lit', 'With the chorus switched on but neither I nor II lit, the sound passes through unchanged here. What the hardware does then is not documented.'],
    ['The rear panel and printed parts', 'The rear jacks (external input, CV inputs for the oscillators, filter and loudness, MOD SOURCE, the CV outputs and sync), velocity, aftertouch and the SysEx settings (key priority, multi-trigger, bend range) are not modelled; multi-trigger is always on. The PHONES knob does nothing: use VOLUME. The wheels on the left-hand panel are drawn for reference: the mod wheel beside the keyboard below is the one that works.'],
  ],
};

LIMITS['buchla-easel'] = {
  intro: 'The 208C and the strip above the 218e keyboard are modelled from the panel: the complex oscillator with waveshape mixing and TIMBRE, the modulation oscillator with FM, AM and balanced modulation, both lowpass gates in their three modes and in series, the pulser, the five-stage sequencer with its pulse switches, the four random voltages, the envelope in sustained, transient and self modes with its time inputs, the inverter, the preamp with its noise and envelope detector, spring reverberation, and the 218e’s pitch, pulse, pressure, portamento, arpeggiator and four preset plates.',
  items: [
    ['Built from a photo and the 1974 manual', 'The 208C and 218e are later versions of the Easel than its manual describes. Controls are modelled from what the panel prints, using the original manual where the two agree. The ranges printed on this panel (33 Hz to 3 kHz for PITCH, 0.4 to 33 Hz and 33 Hz to 3 kHz for the modulation oscillator, 2 ms to 10 s for times) are used. The depths of the processing sliders, the envelope time inputs and the portamento input, the timbre folding curve, the spike wave and the vactrol response times are this app’s choices.'],
    ['The keyboard is wired in', 'Inside the case the 218e’s pulse, pressure and pitch are taken to reach the 208C’s KEYBOARD INPUTS without cords, so the keys play the oscillators whose KEYBOARD switches are on. A cord into any of those three jacks replaces that connection. Pressure comes from how hard a key is struck, held while it is down; there is no pressure from a resting finger.'],
    ['Program cards and remote control', 'There is no program card or program interface: the CONTROL switch, from card, to card1, to card2 and the program socket do nothing. The Easel is always played from the front panel.'],
    ['Jacks that are not modelled', 'w.s., m.o.freq or seq s., phones, the arpeggiator’s two inputs, the preset pulse jack and the two unlabelled jacks beside vel. are drawn but carry nothing: the panel does not say clearly enough what they do. MONITOR LEVEL has no effect, because the app plays the master outputs.'],
    ['The 218e’s touch keyboard', 'The touch keys and the arpeggio plate are not drawn: the app’s keyboard plays the 218e. The arpeggiator steps through the keys you hold at its RATE; it does not sync to anything, and the reset button, trn, rem en and pm do nothing. With ADD TO PITCH at octaves the four preset plates choose registers 0 to 3 octaves up.'],
    ['Pulser modes', 'The 208C prints sustnd, trans and off-ext for the pulser. Here sustained repeats the pulser while a key is held, transient gives one ramp per trigger, and off-ext stops it. There is no external clock input.'],
  ],
};

export const limitsFor = (id) => LIMITS[id] || null;

LIMITS['pro-800'] = {
  intro: 'The whole voice is modelled on eight voices: both oscillators with their three waveform switches, pulse width, levels, OSC B FINE and OSC A sync, noise, the 24 dB filter with its bipolar ENVELOPE AMOUNT and three-way KEYBOARD tracking, both ADSR envelopes, Poly-Mod from the filter envelope and OSC B to OSC A’s pitch and the filter, the LFO with its three destinations and the mod wheel, glide, UNISON TRACK (as unison) and the arpeggiator buttons. FILTER CV IN can be patched.',
  items: [
    ['Ranges are estimates', 'The guide gives the LFO range (0.08 to 20 Hz), and this app uses it. The envelope times come from the GliGli firmware the PRO-800’s is based on (half a millisecond to about 37 seconds); Behringer is reported to have made them snappier since. The cutoff range, resonance law, glide times, the Poly-Mod and LFO depths and the amount of drive above 5 on the LEVEL knobs are this app’s choices.'],
    ['The menus', 'Everything behind PERF and SETTINGS keeps its factory setting: the oscillators step in octaves, the LFO plays a plain triangle or square (not sine, sawtooth, random or noise) and reaches both oscillators, envelopes use the fast exponential curve, and there is no vibrato, modulation delay, velocity, aftertouch, pitch bend, voice spread or glide-mode setting. The mod wheel adds to the LFO depth.'],
    ['UNISON TRACK', 'Here it is always unison: all eight voices on the newest key, slightly detuned. The hardware’s chord memory (switched on with a chord held) and single-voice mode (with one key held) are not modelled, and neither is the note-priority setting.'],
    ['The programmer', 'The keypad, display, PRESET, PERF, SETTINGS, TUNE, SYNC SOURCE, SYNC CLOCK, REC, SEQ 1, SEQ 2 and VALUE are printed but do nothing: sounds are kept in this app’s library. The arpeggiator runs at 120 BPM and cannot be latched; ARP UP-DN plays up and down, and ARP ASSIGN in the order the keys were pressed. The sequencer is not modelled.'],
    ['Sockets', 'SYNC IN, MIDI IN and the rear-panel sockets are drawn for reference or not modelled. FILTER CV IN works, with a fixed depth of five octaves at full scale; on the hardware the depth is a global setting.'],
  ],
};

LIMITS['ems-vcs3'] = {
  intro: 'The Mk 1 matrix is modelled pin for pin: all three oscillators with their SHAPE controls, noise with COLOUR, the ring modulator, the filter/oscillator, the repeating envelope shaper with its trapezoid and its own amplifier, the spring reverb with voltage-controlled MIX, the joystick, and both output amplifiers with their voltage-controlled levels, tone controls and pan, in stereo.',
  items: [
    ['The keyboard is an assumption', 'A VCS3 has no keyboard. Here the keyboard strip plays the part of an EMS DK1 plugged into the KEYBOARD socket: its pitch voltage arrives on row 8 through INPUT LEVEL CHANNEL 1, scaled so that 5 gives one semitone per key on Oscillators 1 and 2, and each key also triggers the envelope shaper. Input channel 2 (row 9) has nothing plugged into it.'],
    ['Pins are ideal', 'Every pin is a standard white pin with exactly the same value, and adding pins does not load the others. On the hardware the matrix is unbuffered, so each extra pin changes the strength of the others slightly, and pin tolerances make two oscillators track differently. The coloured pins (red precision, green attenuating) are not offered.'],
    ['Voltage scaling and polarity', 'Control sensitivities come from the manual (0.32, 0.26 and 0.2 V per octave, 0.4 V per doubling of decay, ±2 V for reverb MIX). The manual does not say which way the filter moves; here it follows the oscillators, rising as its voltage falls. How far a voltage moves the output LEVEL is this app’s choice.'],
    ['Circuits are approximated', 'The filter is the app’s 24 dB ladder rather than the Mk 1’s 18 dB diode ladder, and its self-oscillation is lifted to match the VCS3’s level. The envelope stages are straight lines. The shape of the Oscillator 1 SHAPE distortion, the pulse widths at each SHAPE setting, the noise colour slopes and the output filter slopes are not documented and are this app’s choices. There is no drift, no noise warm-up, and no reverb boing from knocks or speaker feedback.'],
    ['Panel parts that do nothing here', 'The meter and its switch, column A and the SCOPE socket are drawn for reference: the needle does not move. The speaker switches have no effect, because the app plays the panned L and R signal outputs. The rear sockets (microphone and high-level inputs, CONTROL OUTPUTS, headphones) are not modelled.'],
    ['The ATTACK button latches', 'On the hardware it is a momentary button that holds the envelope while pressed. Here a click holds it down and a second click lets it go.'],
  ],
};

LIMITS['tb-303'] = {
  intro: 'The voice is modelled: the sawtooth or square oscillator, the resonant filter with CUT OFF FREQ, RESONANCE and ENV MOD, the decay envelope, the fixed volume envelope, accent (short decay, accent sweep and louder notes) and slide. The riffs carry accents and slides per step, and TEMPO sets their speed. MIX IN, CV, GATE, HEADPHONE and OUTPUT can be patched.',
  items: [
    ['No pattern memory', 'The sequencer is drawn and every button explains itself, but there are no patterns, tracks or modes to write: PITCH MODE, TIME MODE, the keys, FUNCTION, CLEAR, RUN/STOP, BACK, WRITE/NEXT, MODE and TRACK change nothing. Each sound plays its own riff instead, and the on-screen keyboard or a MIDI keyboard plays the voice directly.'],
    ['ACCENT and SLIDE play live', 'On the TB-303 these buttons write marks into steps. Here, lit, they accent or slide every note you play. Notes from a MIDI keyboard are also accented when played hard (velocity above about 115), and overlapping notes slide.'],
    ['The circuit is approximated', 'The filter is the app’s 24 dB ladder rather than the 303’s diode ladder, which is nearer 18 dB per octave. The envelope times (DECAY 0.2 to 2 s, a volume envelope of about 3.5 s, a 0.2 s accent decay), the slide time, the accent sweep’s timing and the cutoff range come from circuit analyses and are this app’s choices. The square wave is a plain square; the original’s shifts with pitch.'],
    ['Not modelled', 'SYNC IN (DIN sync), battery power and the battery lamp.'],
  ],
};

LIMITS['td-3'] = {
  intro: 'The voice is modelled: the sawtooth or square oscillator, the resonant filter with CUTOFF, RESONANCE and ENVELOPE, the decay envelope, the fixed volume envelope, accent (short decay, accent sweep and louder notes), slide, and the distortion after the VCA. The riffs carry accents and slides per step, and TEMPO sets their speed. FILTER IN, CV OUT, GATE OUT and PHONES can be patched.',
  items: [
    ['No pattern memory', 'The sequencer is drawn and every button explains itself, but there are no patterns, tracks or modes to write: PITCH MODE, TIME MODE, the keys, FUNCTION, CLEAR, START/STOP, BACK, WRITE/NEXT, MODE and TRACK change nothing, nor do the clock and MIDI settings behind them. Each sound plays its own riff instead, and the on-screen keyboard or a MIDI keyboard plays the voice directly.'],
    ['ACCENT and SLIDE play live', 'On the TD-3 these buttons write marks into steps. Here, lit, they accent or slide every note you play. Notes from a MIDI keyboard are also accented when played hard (velocity above about 115), and overlapping notes slide. How the TD-3 itself treats MIDI velocity and overlapping notes is not documented in its guide.'],
    ['The circuit is approximated', 'The filter is the app’s 24 dB ladder rather than the diode ladder of the 303 design. The envelope times, slide time, accent sweep and cutoff range come from analyses of the original TB-303 and are assumed to carry over. The distortion circuit is not documented: here it is the app’s generic overdrive with DISTORTION, TONE and LEVEL. The TEMPO range is taken from the TB-303.'],
    ['Not modelled', 'SYNC IN, MIDI and USB settings, poly chain, and the power lamp’s colours.'],
  ],
};

LIMITS['jupiter-4'] = {
  intro: 'The whole voice is modelled on four voices: the VCO with its waveforms, range and stepped or modulated pulse width, the sub-oscillator and noise switches, the high-pass filter, the resonant low-pass filter with keyboard follow and envelope polarity, both ADSRs, the VCA level, the LFO with its delay and live rate bend, the trigger generator with the arpeggio and the filter sample-and-hold, the key-assignment modes, portamento, transpose and the ensemble. The panel is laid out after Roland’s 2022 JUPITER-4 PLUG-OUT software, with the original instrument’s controls on it; the PLUG-OUT’s additions (CONDITION, the effects, velocity, CIRCUIT MOD, tempo sync and the rest) are left off.',
  items: [
    ['Ranges are estimates', 'The manual gives the LFO range (0.1 to 80 Hz), the envelope times, the HPF range (40 Hz to 5 kHz), the LFO delay (up to 10 s), the trigger generator’s top rate (25 Hz) and the portamento time, and this app uses them. The low-pass cutoff range, the filter slopes, the depth of each modulation route and the trigger generator’s lowest rate are not documented and are this app’s estimates. The HPF is a gentle 6 dB filter here.'],
    ['UNISON 2 and the POLY modes', 'UNISON 1 stacks all four voices on one key, as on the hardware. UNISON 2 shares the voices out by how many keys are held (one key four voices, two keys two each, more keys one each); here it is always two voices per key. POLY 1 rotates the voices and POLY 2 gives a key its own voice back; both play as ordinary polyphony here.'],
    ['The lever is the mod wheel', 'The BEND/MODULATION lever is drawn for reference. The mod wheel beside the app’s keyboard stands in for it pushed to one side: destinations switched to BEND move by up to BEND SENS (an octave on the VCO, two on the filter, +12 dB on the VCA), and destinations switched to LFO get the LFO up to LFO MOD. The lever’s other direction is not modelled.'],
    ['External clock', 'Nothing can be plugged into EXT CLOCK IN here. With ARPEGGIO at EXT the arpeggio does not run and the keys play as chords; with VCF at EXT the filter sample-and-hold stands still.'],
    ['Arpeggio range and HOLD', 'The arpeggio plays the held notes over one octave; the hardware’s note order (the order keys were played in UP and DOWN) and its reach of up to four octaves above the first note are not modelled. HOLD latches the arpeggio; without the arpeggio it does nothing here, where on the hardware it holds notes at their sustain level.'],
    ['Memory and presets', 'COMPU-MEMORY 1 to 8, the ten PRE-SET buttons, MANUAL, MEMORY WRITE and PROTECTION are printed only. Sounds are kept in this app’s library instead.'],
    ['Rear panel', 'The mono and stereo outputs, OUTPUT LEVEL, the headphone level, the DAMPER, VCF and EXP pedal inputs and EXT CLOCK IN are not drawn or modelled.'],
    ['Voice card revisions', 'Early Jupiter-4s use a BA662-based filter and later ones an IR3109; they sound different. The filter here is the app’s 24 dB ladder.'],
  ],
};

LIMITS['jupiter-6'] = {
  intro: 'One patch is modelled on all six voices, as at KEY MODE WHOLE: both VCOs with their combinable waveforms, RANGE in half steps with LOW and HIGH, cross mod by hand and from ENV-1, sync either way round, PW and PWM, the mixer and noise, the low-, high- and band-pass filter, the VCA with tremolo, both envelopes with key follow and ENV-1 polarity, LFO-1 with its delay, LFO-2, the arpeggio, portamento, the assign modes and unison detune.',
  items: [
    ['Two patches at once', 'The Jupiter-6 can split the keyboard into a lower and an upper patch (SPLIT-1 four voices low and two high, SPLIT-2 the reverse). This app plays one patch on the whole keyboard, so KEY MODE, PANEL MODE, BALANCE and the BENDER switch beside it do not change the sound. WHOLE is shown lit.'],
    ['The bender is the mod wheel', 'The bender lever on the plate beside the keys is drawn for reference. The mod wheel beside the app’s keyboard stands in for the lever pushed to the right: it bends the VCOs lit under BEND by up to BEND VCO (or three octaves with WIDE) and the filter by up to BEND VCF. Bending down is not possible here.'],
    ['How voices are shared out', 'SOLO plays one voice, last key priority, and SOLO with UNISON stacks all six on one note, spread by UNISON DETUNE. UNISON alone shares the voices between the keys held on the hardware (one key gets all six, two keys three each, and so on); here it always gives each key two voices, so up to three notes. POLY-1 and POLY-2 play alike here: on the hardware POLY-2 keeps a key on the same voice and lets only the newest notes ring on, which suits glide.'],
    ['Glissando slides', 'GLISSANDO steps through the half steps between notes on the hardware. Here it slides smoothly, like PORTAMENTO.'],
    ['Arpeggio', 'UP, DOWN and both together (up and down) work, with RATE, RANGE and HOLD. D&U, down then up, which the hardware gives when DOWN is pressed before UP, plays as U&D here. The arpeggio always runs from the internal rate; ARPEGGIO CLOCK IN is not modelled. HOLD only latches the arpeggio: on the hardware it also sustains notes with the arpeggio off.'],
    ['LFO MOD latches', 'On the hardware LFO MOD brings in LFO-2 while it is held. Here it is a switch: click it on, click it off.'],
    ['Ranges are estimates in between', 'The manual gives the end points (envelope times up to 18 and 20 seconds, LFO-1 0.04 to 100 Hz and up to 2.5 s of delay, the filter from 5 Hz to 30 kHz, arpeggio 1 to 25 Hz, glide up to 1.6 s an octave, LFO-2 1 to 10 Hz with a 0.05 to 1 s rise, VCO-2 LOW 1.5 to 50 Hz), and this app uses them, except that the filter stops at 10 Hz and 20 kHz. The curve between the ends, the depth of the cross mod, the key-follow law and the resonance are this app’s estimates. LFO-1 RANDOM runs up to 100 Hz here, not the 400 Hz of the hardware.'],
    ['LFO-1 DELAY and the random wave', 'DELAY fades LFO-1 in on the pitch and filter routes but not on PWM or the VCA, as on the hardware. With the RANDOM wave the delay reaches PWM and the VCA as well.'],
    ['Printed but not modelled', 'The patch memory (PATCH PRESET, BANK, NUMBER, MANUAL, PROTECT, WRITE), TAPE MEMORY and the TUNE button (automatic tuning) are drawn for reference. Sounds are kept in this app’s library.'],
    ['The rear panel', 'MIDI IN and OUT, the arpeggio clock input, the PATCH SHIFT and hold pedal sockets, the VCA and VCF pedal inputs, the output level switch and the tape sockets are not modelled.'],
  ],
};

LIMITS['jupiter-8'] = {
  intro: 'One patch is modelled on all eight voices: both VCOs with cross mod, sync and LOW FREQ, the source mix, the 6 dB high-pass filter, the 12/24 dB low-pass filter, both envelopes with key follow and ENV-1 polarity, the LFO with delay, the VCA with its tremolo steps, the performance LFO, portamento, the four assign modes and the arpeggiator.',
  items: [
    ['Two patches at once', 'The Jupiter-8 holds an upper and a lower patch and plays them whole, split or layered (DUAL, four voices each). This app plays one patch, so KEY MODE, PANEL MODE and BALANCE do not change the sound. The two HOLD buttons both latch the arpeggio, and portamento’s UPPER ONLY glides the one patch.'],
    ['Ranges are estimates', 'The specification list gives the envelope times (1 ms to 5 s attack, 1 ms to 10 s decay and release), the LFO range (0.05 to 40 Hz) and delay (up to 4 s), the filter’s 120 % key follow and the arpeggio’s 1 to 20 Hz, and this app uses them. The slider curves between those ends, the filter range, the depths of the pitch, cross mod and filter modulation, the high-pass range, the key follow strength, VCO-2’s LOW FREQ range and the performance LFO’s rate (about 6 Hz) are this app’s estimates.'],
    ['Assign modes', 'SOLO plays one voice. UNISON stacks all eight voices on the newest key with a fixed small spread. POLY 1 and POLY 2 both play chords here; on the hardware they differ in how voices are reused (POLY 2 keeps only the latest notes’ releases, which suits portamento).'],
    ['Bender', 'The bender lever is drawn for reference. The mod wheel beside the keyboard stands in for it pushed to the right: it bends VCO-1 and VCO-2 (by their BEND switches) up to an octave, and opens the filter when VCF BEND is on. Bending down is not possible here.'],
    ['Hold and the arpeggio clock', 'HOLD latches the arpeggio; holding notes without the arpeggio is not modelled. Arpeggio EXT waits for a clock at a rear socket, which this app does not have, so the arpeggio stops.'],
    ['Patch memory and printed parts', 'The patch number and patch preset buttons, MANUAL, WRITE and MEMORY PROTECT, the display, the tape memory, TUNE (auto-tune) and the rear-panel sockets (outputs, pedals, arpeggio clock, highest-note CV and gate, DCB) are printed or not modelled. Sounds are kept in this app’s library.'],
  ],
};

// The Moog 900-series systems share their modules, so they share most of what is not modelled.
const MOOG900 = [
  ['The OUTPUT jacks are the app’s', 'The real system has no master output: you patch whatever you want to hear to a mixer or audio interface. The OUTPUT plate printed on a blank panel is that cable’s other end in this app, and is marked as not on the hardware. Both jacks go to one mono output.'],
  ['Tuned to the keyboard', 'Every oscillator is calibrated so that 0 V plays middle C at 8’, and the CM1A gives 0 V at middle C, 1 V per octave. The hardware’s own reference (2’ = 640 Hz) is set by trimmers, and its oscillators drift as they warm up; here they are always in tune and never drift.'],
  ['The CM1A’s rear button and MIDI settings', 'The CV range (System 55 or System 100) and the duophonic mode are set with a button on the back of the CM1A, and the MIDI channel, bend range and note range in SynthTribe. Here the CM1A is always in the System 55 range and mono: CV 2 carries the same note as CV 1. MIDI IN, MIDI THRU and USB are printed.'],
  ['Levels and curves are estimates', 'The published ranges are used: 911 times from 2 ms to 10 s, the 904A’s three frequency ranges and the 904B’s two, the 923’s 10 Hz to 10 kHz, the 961’s 40 ms to 4 s, 902 gain with 6 V for full level. The knob curves between the ends, the 902’s exponential law (about 12 dB per volt), the Q of the 914’s bands and the corner frequencies of its low-pass and high-pass (about 100 Hz and 7 kHz), the AUX level taper and the mixer’s clipping are this app’s choices.'],
  ['Sync and the 921’s clamping point', 'SYNC IN resets the 921B on each sharp fall of its input: STRONG every time, WEAK only when the 921B is already near the end of its own cycle. The hardware’s sync circuit is softer and depends on the input’s shape. The clamping point jumps the 921 to that point of its cycle on each trigger.'],
];
LIMITS['system-15'] = {
  intro: 'All sixteen modules are modelled and every jack carries its signal: the 921A driver, both 921B oscillators, the 921, the 904A ladder and 904B high-pass, the 914 filter bank, the 923 filters and noise, both 902 amplifiers, both 911 envelopes, the CP3A-M mixer and its multiples, the CP35 attenuators, voltages and multiples, the 961 interface and the CM1A.',
  items: MOOG900,
};
LIMITS['system-35'] = {
  intro: 'All twenty-five modules are modelled and every jack carries its signal: both 921A drivers and their four 921B oscillators, the 921, the 904A, 904B, 914 and 923 filters, the 992 and both CP3A-O control switchers, both CP3A-M mixers, the CP35, the 961, three 911 envelopes, three 902 amplifiers and the CM1A.',
  items: MOOG900,
};
LIMITS['system-55'] = {
  intro: 'All thirty-eight modules are modelled and every jack carries its signal: both 921A drivers and six 921B oscillators, the 921, the 960 sequencer and the 962 switch, the 904A, 904B, 914 and 923 filters, five 902 amplifiers, four 911 envelopes and the 911A, three CP3A-M mixers, three CP3A-O and the 992, the 995s, the CP35, the 903A, the 961 and the CM1A.',
  items: [...MOOG900,
    ['The 960’s buttons', 'OSC ON, OSC OFF, SHIFT and the SET buttons act on each click here: each click is one press. The clock starts running as soon as the 960 is patched, and the stage lamps light as it plays.'],
    ['Built from the panel where the guides are thin', 'The 995’s guide was not available, so it is modelled as three plain attenuators, like Moog’s 995. The 962 steps through its patched inputs (two or three). The 960’s third row adds its voltage to the clock’s control input, so a higher knob makes that stage shorter.'],
    ['The layout', 'The modules are in the order of Behringer’s photo, with each row at its full width. The 960 is drawn a little wider than the hardware so its knobs can be read, and the app’s OUTPUT sits on a blank panel at the end of the bottom row.'],
  ],
};

LIMITS['model-15'] = {
  intro: 'The whole voice is modelled: both oscillators with their octaves and waveforms, sync and Oscillator 2’s FREQUENCY, the sub-oscillator, the mixer with white noise, the ladder filter with KEY TRACKING and the bipolar ENV AMT, the ADSR, all three VCA modes, the LFO with its three depths and MODULATION, the spring reverb, and the arpeggiator. In the patch bay, the separate HI PASS filter, the attenuator with its internal voltage, the sample and hold, both multiples, and every audio, pitch, cutoff, VCA, LFO and envelope jack work.',
  items: [
    ['Where the guide is unclear', 'The Quick Start Guide states only that the filter feeds the VCA; the other normals (the oscillators into the mixer, the gate into the envelope, the VCA into the reverb, the sample and hold reading noise on each LFO cycle) follow the Moog Grandmother the Model 15 copies. The guide also does not say how OSC 2’s waveform switch chooses the sub-oscillator, what VCA MODE RELEASE does, or where AUDIO input enters. Here the positions under the SUB bracket put the sub-oscillator on mixer channel 3 in place of the noise, RELEASE gives full level while a key is held with the envelope’s release on the end, and AUDIO input takes mixer channel 3’s place.'],
    ['Ranges are estimates', 'The guide gives the LFO range (0.07 Hz to 1.3 kHz), the cutoff range, the envelope times, OSC 2’s ±7 semitones and FINE TUNE’s ±4, and this app uses them. The depths of PITCH MOD, PULSE WIDTH, FILTER MOD and ENV AMT, the resonance law, the glide time, the HI PASS range, the arpeggiator’s tempo range and the reverb’s sound are this app’s choices.'],
    ['The sequencer', 'Only the arpeggiator is modelled: PLAY, HOLD, RATE, DIRECTION and OCT. The three 256-step sequences, recording with REST, TIE and ACCENT, and tap tempo are not; in SEQ and REC the keys play as they are pressed. TAP does nothing here.'],
    ['Jacks that do nothing here', 'ENV AMT (voltage control of the envelope amount), ARP/SEQ SYN, ARP/SEQ RES, ARP/SEQ ON and the SYNC clock output can be patched but have no effect. White and pink noise come from one generator, so they move together. In the app the first jack of each MULTI group is its input and the other two are copies.'],
    ['Printed parts', 'MIDI IN, the rear-panel sockets, the PHONES level and the MIDI channel switches are not modelled. Play from the on-screen keyboard or a MIDI keyboard connected through the header.'],
  ],
};

LIMITS.grandmother = {
  intro: 'The whole voice is modelled: both oscillators with their octaves and waveforms, sync and Oscillator 2’s FREQUENCY, the mixer with white noise and its overdrive past 1 o’clock, the ladder filter with KBD TRACK and the bipolar ENVELOPE AMT, the ADSR, all three VCA modes, the LFO with its three depths brought in by the mod wheel, the spring reverb, and the arpeggiator. On the panel, the separate HIGH PASS filter, the attenuator with its internal voltage, the sample and hold, the mult, and every audio, pitch, cutoff, VCA, LFO and envelope jack work.',
  items: [
    ['Ranges are estimates', 'The manual gives the LFO range (0.07 Hz to 1.3 kHz), the cutoff range, OSC 2’s ±7 semitones and the arpeggiator’s 20 to 280 BPM, and this app uses them. The envelope times, the depths of PITCH AMT, CUTOFF AMT, PULSE WIDTH AMT and ENVELOPE AMT, FREQUENCY’s wider range with SYNC on, the resonance law, the amount of overdrive, the glide time, the HIGH PASS range and the spring’s sound are this app’s choices.'],
    ['The sequencer', 'Only the arpeggiator is modelled: PLAY, HOLD, RATE, DIRECTION and OCT. The three 256-step sequences, recording with REST, TIE and ACCENT, tap tempo and the accent envelope on KB VEL OUT are not; in SEQ and REC the keys play as they are pressed. TAP does nothing here, and SHIFT’s octave and fine-rate functions are left out (use the octave buttons by the keyboard strip).'],
    ['Jacks that do nothing here', 'ENV AMT IN (voltage control of the envelope amount) can be patched but has no effect. VCA AMT IN adds to the envelope in ENV and KB RLS, where the hardware scales the envelope by it. In the app the top-left MULT jack is the input and the other three are copies.'],
    ['The keyboard and the rear panel', 'The keys, the left-hand controller’s wheels and the octave transpose are drawn for reference; the keyboard strip under the panel and its mod wheel play the synth. Pitch bend, glide type, note priority and the other global settings are not modelled. The rear panel (FINE TUNE, INSTRUMENT IN, CLOCK IN and OUT, ON / OFF, RESET, EURORACK OUT, REVERB OUT, MIDI and USB) is not drawn.'],
  ],
};
