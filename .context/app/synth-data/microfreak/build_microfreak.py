#!/usr/bin/env python3
"""Assemble the Arturia MicroFreak device file (schema 0.13.0).

Hybrid synthesiser: digital oscillator with 12 models (5 Arturia, 7 from Mutable Instruments
Plaits), analog 12 dB multimode filter (LP/BP/HP), analog VCA, ADS envelope, cycling envelope,
LFO, 5 x 7 modulation matrix (4 fixed + 3 assignable destination columns), 4-voice paraphony,
25-key capacitive touch keyboard with pressure, touch strip (Bend / Spice / Dice), arpeggiator
and two paraphonic sequences with four modulation tracks.

Source: Arturia MicroFreak User Manual, product version 1.1.2, revision 20 May 2019 (104 pages).
manual_ref values are the manual's printed page numbers. The manual has no MIDI CC chart.

The matrix is modelled as connections with amount parameters (one per patch point): the four
fixed columns go straight to their destinations; the three Assign columns go through the 'mx'
module whose outputs reach each assignable destination, enabled by the column's target setting.
"""
import json

D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
K100 = {"min": 0, "max": 100, "note": "display value; scale inferred from the manual's examples (e.g. 'timbre 40')"}
BIP = {"min": -100, "max": 100, "note": "percent, bipolar"}


def mod(id, type, name, section, desc, inputs, outputs, props=None, scope=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section}
    if scope:
        m["scope"] = scope
    m["description"] = desc
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, access, ref, memory="patch", rng=None, values=None, default=None, confidence=None, note=None):
    p = {"id": id, "module": module, "label": label, "kind": kind, "manual_ref": ref}
    if rng:
        p["range"] = rng
    if values:
        p["values"] = values
    if default is not None:
        p["default"] = default
    p["memory"] = memory
    p["access"] = access
    p["function"] = fn
    if confidence:
        p["confidence"] = confidence
    if note:
        p["note"] = note
    P.append(p)


def knob(note=None):
    a = {"type": "panel", "control": "knob"}
    if note:
        a["note"] = note
    return a


def btn(note=None):
    a = {"type": "panel", "control": "push_button"}
    if note:
        a["note"] = note
    return a


def enc(note=None):
    a = {"type": "panel", "control": "encoder"}
    if note:
        a["note"] = note
    return a


def menu(path):
    return {"type": "menu", "note": path}


MCC = {"type": "app", "note": "MIDI Control Center"}


def gest(text):
    return {"type": "gesture", "gesture": text, "when": "any_time"}


def vals(items):
    out = []
    for it in items:
        if isinstance(it, str):
            out.append({"value": it})
            continue
        v = {"value": it[0], "label": it[1]}
        if len(it) > 2:
            v["meaning"] = it[2]
        out.append(v)
    return out


def jack(id, label, d, sig, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": d, "signal": sig, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, sig, when=None, **kw):
    c = {"id": f"c{len(C) + 1:03d}", "from": frm, "to": to, "signal": sig, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


def ne(p, v):
    return {"param": p, "not_equals": v}


# ======================================================================== device
D["device"] = {
    "id": "arturia-microfreak", "manufacturer": "Arturia", "model": "MicroFreak",
    "category": "hybrid synthesiser: digital oscillator, analog filter, 4-voice paraphonic, 25-key capacitive touch keyboard, mod matrix, arpeggiator, sequencer",
    "based_on": "Arturia design (2019). Seven of the twelve oscillator models use Mutable Instruments Plaits code (MIT licence). Matrix concept from Arturia's MatrixBrute.",
    "sources": [{"id": "manual", "title": "Arturia MicroFreak User Manual, product version 1.1.2", "kind": "user_manual", "file": "MicroFreak_User_Manual_1.1.2.pdf", "pages": 104,
                 "note": "Revision date 20 May 2019. Covers panel, rear panel, signal flow, presets, matrix, the 12 oscillator models, filter, LFO, envelopes, keyboard, icon strip, "
                         "arpeggiator, sequencer, Utility and MIDI Control Center settings, CV/gate, cheat sheet. No MIDI CC chart, no specification table."},
        {"id": "manual_v5", "title": "Arturia MicroFreak User Manual, product version 5.0.0 (6 July 2023), retailer copy", "kind": "other", "url": "https://www.adorama.com/col/productManuals/AR570101.pdf",
         "note": "Appendix D default CC table; Utility tables for firmware 5; parameters of the oscillator types added since 1.1.2. Used for the CC map and for firmware notes only."},
        {"id": "arturia_faq", "title": "Arturia support, 'MicroFreak Allgemeine Fragen' (German FAQ)", "kind": "other", "url": "https://support.arturia.com/hc/de/articles/4405748052626-MicroFreak-Allgemeine-Fragen",
         "note": "Same CC map with ranges (Type 10-127, free Arp/Seq rate 0-123); program change banks of 128; paraphonic per-voice envelopes; grounding."},
        {"id": "arturia_fw", "title": "Arturia press releases and support notes for firmware 2.0 (Jan 2020), 2.1 (Aug 2020), 3.0 (Jan 2021), 4.0 (Oct 2021), 5.0 (2023)", "kind": "other",
         "url": "https://support.arturia.com/hc/en-us/articles/9002305582108-MicroFreak-Firmware-V5", "note": "Also: arturia.com/company/press/press-releases/microfreak-receives-firmware-update-2; MusicRadar, Engadget and Synthtopia reports."},
        {"id": "forum_cc9", "title": "Arturia forum, 'Transmitted vs received MIDI CC values for Digital Oscillator Type parameter don't match'", "kind": "other",
         "url": "https://forum.arturia.com/t/transmitted-vs-received-midi-cc-values-for-digital-oscillator-type-parameter-dont-match/6268", "note": "User-measured CC 9 values per type on firmware 5 (22 types)."},
        {"id": "thomann", "title": "Thomann UK, Arturia MicroFreak product page", "kind": "other", "url": "https://www.thomann.co.uk/arturia_microfreak.htm",
         "note": "311 x 233 x 55 mm, 1.02 kg; CV/gate/pressure and clock on 3.5 mm jacks; filter described as an analog state-variable design inspired by the SEM."}],
}
D["architecture"] = {
    "synthesis": "subtractive",
    "synthesis_note": "One digital oscillator running one of 12 models (wavetable, virtual analogue, FM, granular formant, chords, speech, physical models) with three macro parameters Wave, Timbre and Shape, into an analog filter and VCA.",
    "signal_path": "digital",
    "signal_path_note": "Hybrid: digital oscillator; analog multimode filter and analog VCA; extra digital VCAs per voice in paraphonic mode. All controls are digitally scanned and saved.",
    "voices": 4,
    "polyphony_mode": "Mono, or paraphonic up to 4 voices sharing one filter (Paraphonic button). Per-voice amplitude via internal digital VCA envelopes ('extended paraphony'). The Chords model disables paraphony.",
    "poly_chain_max_units": None,
    "patch_memory": True,
    "patch_memory_note": "256 presets: 1-128 factory, 129-160 templates, the rest empty (Init/Bass). A preset stores knob values, matrix, both sequences with modulation tracks and Utility>Preset settings. Hold, Spice/Dice and arp patterns are not saved.",
    "semi_modular": False,
    "panel_counts": {"knobs": 18, "encoders": 2, "buttons": 16, "touch_icons": 8, "touch_strips": 1, "keys": 25, "matrix_leds": 35, "display": "OLED"},
    "panel_counts_note": ("Counted from the panel images. Knobs: Master, Glide, Type, Wave, Timbre, Shape, Cutoff, Resonance, Rise, Fall, Hold, Amount, Arp/Seq Rate, LFO Rate, Attack, "
                          "Decay/Rel, Sustain, Filter Amt; encoders: Matrix, Preset. Buttons: Assign1-3, Paraphonic, Panel, Save, Utility, Filter Type, Cycling Env Mode, Octave left/right, "
                          "Shift, Arp|Seq, Oct|Mod, LFO Shape, Amp Mod. Touch icons: Hold, Up|A, Order|B, Rand|O (record), Pattern|> (play), Spice, Dice, Bend."),
    "summary": ("Keyboard, arpeggiator, sequencer or MIDI notes go through glide to the digital oscillator; its Type, Wave, Timbre and Shape set the model and sound. The analog "
                "filter (LP/BP/HP, cutoff, resonance) is swept by the main envelope via Filter Amt; the VCA follows the key gate or, with Amp Mod on, the envelope. Five sources "
                "(cycling envelope, envelope, LFO, pressure, key/arp) reach Pitch, Wave, Timbre and Cutoff plus three assignable destinations through a 35-point bipolar matrix."),
}

# ======================================================================== modules
mod("kbd", "manual_controller", "Capacitive keyboard", "keyboard / OCTAVE", "25-key touch capacitive keyboard (2 octaves) generating gate, pitch and pressure (aftertouch or velocity per preset). Octave buttons shift +/-3 octaves; Key Hold latches notes.",
    [], ["kbd.notes", "kbd.pressure"], {"keys": 25, "pressure": "aftertouch or velocity (per preset)", "octave_shift": [-3, 3]}, "common")
mod("strip", "manual_controller", "Touch strip", "icon strip [Spice, Dice, Bend]", "Touch strip in three modes: Bend (pitch, absolute or relative), Spice (amount of gate/trigger variation), Dice (re-roll the variation).",
    [], ["strip.bend"], scope="common")
mod("midi", "midi_to_cv", "MIDI and USB interface", "rear panel", "MIDI on 3.5 mm TRS jacks (DIN adapters supplied) and class-compliant USB. Receives notes, CCs, program change, clock, start/stop and sustain; transmits keyboard notes (fully polyphonic), aftertouch, velocity, knob CCs, arp/seq notes and clock.",
    ["midi.din_in", "midi.usb", "midi.tx"], ["midi.notes", "midi.clock", "midi.din_out"], scope="common")
mod("clock", "gate_logic", "Tempo clock and sync", "ARP / SEQ [Rate] / rear CLOCK", "Internal tempo (default 120 BPM) or USB, MIDI or analog clock (One step, 2, 24 or 48 PPQ). Clock out sends clock while playing; a TRS lead also carries start.",
    ["clock.ext_in", "clock.midi"], ["clock.out", "clock.ext_out"], scope="common")
mod("arp", "arpeggiator", "Arpeggiator", "ARP / SEQ + icon strip", "Up, Order, Random or Pattern (generated semi-random patterns), range 1-4 octaves, free BPM or synced divisions, swing 50-75%. Patterns can be copied to sequence A or B.",
    ["arp.in", "arp.clock", "arp.mod"], ["arp.out"], scope="common")
mod("seq", "sequencer", "Sequencer", "ARP / SEQ + icon strip", "Two paraphonic sequences (A, B) per preset, 4-64 steps (shared length), up to 4 notes, velocity and tie/rest per step, step or real-time recording, four modulation tracks recording knob values.",
    ["seq.in", "seq.clock"], ["seq.notes"], {"sequences": 2, "steps": [4, 64], "notes_per_step": 4, "mod_tracks": 4}, "common")
mod("voice", "voice_allocator", "Voice assignment", "Paraphonic", "Assigns keyboard, MIDI, arpeggiator and sequencer notes to 1 or 4 paraphonic voices. Keyboard and MIDI notes have priority over the sequencer; in mono a held key pauses the sequence.",
    ["voice.kbd", "voice.midi", "voice.arp", "voice.seq"], ["voice.pitch", "voice.gate", "voice.key", "voice.cv"], {"voices": 4}, "common")
mod("glide", "slew_limiter", "Glide", "Glide", "Portamento: time (0 to about 10 s), synced divisions, or rate per octave (Utility Glide mode).", ["glide.in", "glide.mod"], ["glide.out"], scope="per_voice")
mod("osc", "oscillator", "Digital oscillator", "DIGITAL OSCILLATOR", "One oscillator running one of 12 models; Wave, Timbre and Shape are the model's three parameters. Range C-2 to G8. Wave, Timbre and Shape modulation are per voice; Type changes for all voices.",
    ["osc.pitch", "osc.type_mod", "osc.wave_mod", "osc.timbre_mod", "osc.shape_mod"], ["osc.out"], {"models": 12, "pitch_range": "C-2 to G8"}, "per_voice")
mod("vcf", "filter", "Analog filter", "ANALOG FILTER", "Analog 12 dB/octave multimode filter: low pass, band pass, high pass. Cutoff about 30 Hz to above 15 kHz; self-oscillates at full resonance. One filter shared by all voices.",
    ["vcf.in", "vcf.env", "vcf.cutoff_mod", "vcf.res_mod"], ["vcf.out"], {"slope_db_per_oct": 12, "modes": ["LPF", "BPF", "HPF"], "cutoff_hz": [30, 15000], "design": "state variable, described by retailers as Oberheim SEM-inspired (not stated in the manual)"}, "common")
mod("vca", "vca", "VCA", "ENVELOPE [Amp Mod]", "Analog VCA controlled by the key gate (Amp Mod off) or the envelope (Amp Mod on); in paraphonic mode, internal digital VCAs give each voice its own envelope copy.",
    ["vca.in", "vca.cv"], ["vca.out"], scope="common")
mod("env", "envelope", "Envelope", "ENVELOPE", "ADS envelope (Decay/Release on one knob): attack 0-10 s, decay/release 0-13 s, sustain level. Hardwired to cutoff through bipolar Filter Amt and, with Amp Mod, to the VCA. Polyphonic as a matrix source.",
    ["env.gate", "env.mod"], ["env.out"], {"stages": "ADS (decay = release)", "attack_s": [0, 10], "decay_release_s": [0, 13]}, "per_voice")
mod("cyc", "envelope", "Cycling envelope", "CYCLING ENVELOPE", "Rise, Fall and Hold/Sustain with shapeable Rise and Fall curves (Shift; log-linear-exp) and output Amount. Modes: Env (one-shot, sustains while held), Run (free-running, reset by MIDI start), Loop (cycling, reset by each trigger).",
    ["cyc.trig", "cyc.mod"], ["cyc.out"], {"modes": ["env", "run", "loop"]}, "common")
mod("lfo", "lfo", "LFO", "LFO", "Six shapes (sine, triangle, saw up, square, random stepped, random gliding). Free 0.06-100 Hz or synced 8/1 to 1/32. Optional retrigger per preset.",
    ["lfo.clock", "lfo.retrig", "lfo.mod"], ["lfo.out"], {"shapes": 6, "rate_hz": [0.06, 100]}, "common")
mod("mx", "modulation_bus", "Matrix assignable columns", "Matrix [Assign1-3]", "The three assignable matrix columns: each sums its five source points and drives the parameter chosen for that column (almost any knob, or another matrix point's amount).",
    ["mx.cycenv", "mx.env", "mx.lfo", "mx.press", "mx.key", "mx.amount_mod"], ["mx.assign1", "mx.assign2", "mx.assign3"], {"points": 15, "columns": 3}, "common")
mod("out", "output", "Output", "Master / rear OUTPUT", "Mono line output (balanced TRS) and headphone output, both after Master volume; per-preset relative volume.", ["out.in"], ["out.line", "out.phones"], scope="common")
mod("cvout", "midi_to_cv", "CV/Gate/Pressure outputs", "rear CV / GATE OUT", "Pitch (1 V/oct, Hz/V or 1.2 V/oct), gate (S-trig, V-trig 5 V or 12 V) and pressure or velocity (1-10 V range). Sequencer: a step's lowest note; keyboard: the last note played.",
    ["cvout.notes", "cvout.pressure"], ["cvout.pitch", "cvout.gate", "cvout.press"], scope="common")
mod("ui", "manual_controller", "Display, presets and global controls", "display / Preset / Save / Utility / Panel / Shift", "OLED display, Preset encoder, Save, Utility menus, Panel (apply current knob positions), Shift.", [], [], scope="common")
D["modules"] = M

# ======================================================================== parameters
# ---- oscillator
OT = [
    ("basicwaves", "BasicWaves", "Arturia. Wave = Morph: square to saw to two saws; Timbre = Sym: pulse width or phase between the two saws (no effect at saw, Wave 50); Shape = Sub: sine sub-oscillator."),
    ("superwave", "SuperWave", "Arturia. Wave: waveform to multiply (saw, square, triangle, sine); Timbre = Detune; Shape = Volume of the detuned copies."),
    ("wavetable", "Wavetable", "Arturia. Wave = Table (16 tables); Timbre = Position (32 cycles of 256 samples); Shape = Chorus."),
    ("harmo", "Harmo", "Arturia harmonic oscillator. Wave = Content (harmonic amplitude tables); Timbre = Sculpting (sine to triangle partials); Shape = Chorus."),
    ("karplusstr", "KarplusStr", "Arturia Karplus-Strong. Wave = Bow (continuous excitation); Timbre = Position (strike position/strength); Shape = Decay."),
    ("v_analog", "V.Analog", "Plaits. Wave = Detune between two waves; Timbre = Shape (narrow pulse to square to hard-sync formants); Shape = Wave (triangle to saw with widening notch)."),
    ("waveshaper", "Waveshaper", "Plaits. Wave = waveshaper waveform; Timbre = wavefolder Amount; Shape = Asym (asymmetry)."),
    ("two_op_fm", "Two Op.FM", "Plaits. Wave = Ratio; Timbre = Amount (modulation index); Shape = feedback (operator 2 self-modulation)."),
    ("formant", "Formant", "Plaits granular formant. Wave = Interval (formant 1:2 ratio); Timbre = Formant frequency; Shape = formant width and shape."),
    ("chords", "Chords", "Plaits, four-voice chord oscillator (disables paraphony; last key is the root). Wave = Type (octave, 5th, sus4, m, m7, m9, m11, 6/9, M9, M7, M); Timbre = Inv/Transp; Shape = Waveform (string-machine waves, then a 16-wave table)."),
    ("speech", "Speech", "Plaits vowel and speech. Wave = Type (formants up to about 100, then libraries of colours, numbers, letters, words); Timbre = formant shift; Shape = Word within the library."),
    ("modal", "Modal", "Plaits modal resonator. Wave = Inharm (inharmonicity / material); Timbre = excitation brightness and dust density; Shape = Decay (damping)."),
]
par("osc.type", "osc", "Type", "enum", "Oscillator model; each value lists what Wave, Timbre and Shape do. Can be modulated (all voices change together).", [knob()], 36,
    values=vals(OT), note="Order follows the manual's list; whether it matches the knob order is not stated.")
for k, lbl, fn in (("wave", "Wave", "First model parameter (Plaits 'Harmonics')."), ("timbre", "Timbre", "Second model parameter (Plaits 'Timbre')."),
                   ("shape", "Shape", "Third model parameter (Plaits 'Morph').")):
    par(f"osc.{k}", "osc", lbl, "continuous", fn + " Meaning depends on Type (see osc.type values).", [knob()], 36, rng=K100)
par("glide.amount", "glide", "Glide", "continuous", "Glide amount: time (off to about 10 s), synced division (1/32T to 1/1) or rate per octave, per Utility Glide mode.", [knob()], 60, rng=K100)
# ---- filter
par("vcf.type", "vcf", "Type", "enum", "Filter mode (LED shows LPF, BPF or HPF).", [btn("Type button, press to cycle")], 45,
    values=vals([("lpf", "LPF", "removes frequencies above cutoff"), ("bpf", "BPF", "removes frequencies above and below cutoff"), ("hpf", "HPF", "removes frequencies below cutoff")]))
par("vcf.cutoff", "vcf", "Cutoff", "continuous", "Cutoff frequency, about 30 Hz (fully anticlockwise) to above 15 kHz.", [knob()], 47, rng=K100)
par("vcf.resonance", "vcf", "Resonance", "continuous", "Resonance; self-oscillation (sine) at maximum.", [knob()], 47, rng=K100)
# ---- cycling envelope
par("cyc.mode", "cyc", "Mode", "enum", "Cycling envelope mode (LEDs Env, Run, Loop).", [btn("Mode button, press to cycle")], 54,
    values=vals([("env", "Env", "one-shot: rise, sustain at the Hold/Sustain level while the gate is held, then fall"),
                 ("run", "Run", "free-running cycle; resets on MIDI start"), ("loop", "Loop", "cycles, resetting on each keyboard, arp or sequencer trigger")]))
par("cyc.rise", "cyc", "Rise", "continuous", "Time to reach maximum.", [knob()], 54, rng=K100)
par("cyc.rise_shape", "cyc", "Rise Shape", "continuous", "Rise curve: left more logarithmic, centre linear (dead zone, 'LINEAR'), right more exponential.", [knob("Shift + Rise")], 55, rng={"min": -50, "max": 50, "note": "display range not stated"},
    confidence="inferred")
par("cyc.fall", "cyc", "Fall", "continuous", "Time to fall to zero.", [knob()], 54, rng=K100)
par("cyc.fall_shape", "cyc", "Fall Shape", "continuous", "Fall curve, as Rise Shape.", [knob("Shift + Fall")], 55, rng={"min": -50, "max": 50, "note": "display range not stated"}, confidence="inferred")
par("cyc.hold", "cyc", "Hold / Sustain", "continuous", "Env mode: sustain level. Run and Loop: time held at the top before Fall.", [knob()], 54, rng=K100)
par("cyc.amount", "cyc", "Amount", "continuous", "Output level of the cycling envelope into the matrix.", [knob()], 54, rng=K100)
# ---- LFO
par("lfo.shape", "lfo", "Shape", "enum", "LFO waveform.", [btn("Shape button, press to cycle; six LEDs")], 49,
    values=vals([("sine", "Sine"), ("triangle", "Triangle"), ("saw", "Sawtooth (rising)"), ("square", "Square (50% duty)"), ("random", "Random (stepped, S&H)"), ("random_glide", "Random gliding (smoothed)")]))
par("lfo.rate", "lfo", "Rate", "continuous", "LFO speed: 0.06-100 Hz free, or synced division 8/1, 4/1, 2/1, 1/1, 1/2, 1/2t, 1/4, 1/4t, 1/8, 1/8t, 1/16, 1/16t, 1/32.", [knob()], 50, rng=K100)
par("lfo.sync", "lfo", "Sync", "boolean", "Locks the LFO rate to the arp/seq clock (Sync LED).", [btn("press the Rate knob")], 50)
par("lfo.retrig", "lfo", "LFO retrig", "enum", "LFO restart on note triggers.", [menu("Utility > Preset > LFO retrig")], 50,
    values=vals([("off", "OFF"), ("on", "ON", "restart on each keyboard, arp or sequencer trigger"), ("legato", "Legato", "no restart when playing legato")]))
# ---- envelope
par("env.attack", "env", "Attack", "continuous", "Attack time, 0 ms to 10 s.", [knob()], 53, rng=K100)
par("env.decay", "env", "Decay / Rel", "continuous", "Decay to sustain and release after key-up, 0 ms to 13 s.", [knob()], 53, rng=K100)
par("env.sustain", "env", "Sustain", "continuous", "Sustain level.", [knob()], 53, rng=K100)
par("env.filter_amt", "env", "Filter Amt", "continuous", "Bipolar envelope amount on cutoff; this is the Env > Cutoff matrix point (it lights when the knob moves).", [knob(), menu("Matrix point Env > Cutoff")], 53, rng=BIP)
par("env.amp_mod", "env", "Amp Mod", "boolean", "On: the envelope controls the VCA (and per-voice VCAs in paraphonic mode). Off: the key gate opens the VCA.", [btn()], 54)
par("env.reset", "env", "Envelope legato / reset", "boolean", "Whether the envelopes restart on each new note when playing legato (applies to both envelopes, mono and paraphonic).", [menu("Utility > Preset > Envelope reset (or 'Envelope legato')")], 55,
    note="Named 'Envelope legato' in the p.24 table and the p.55 text, 'Envelope reset' in the p.83 table and p.54 note.")
# ---- matrix
SRC = [("cycenv", "CycEnv", "cyc.out"), ("env", "Env", "env.out"), ("lfo", "LFO", "lfo.out"), ("press", "Press", "kbd.pressure"), ("key", "Key/Arp", "voice.key")]
FIXED = [("pitch", "Pitch", "osc.pitch"), ("wave", "Wave", "osc.wave_mod"), ("timbre", "Timbre", "osc.timbre_mod"), ("cutoff", "Cutoff", "vcf.cutoff_mod")]
MXNOTE = "Select with the Matrix encoder, press to edit (-100 to +100); hold the encoder 0.5 s to clear."
for s, sl, _ in SRC:
    for d, dl, _ in FIXED:
        if s == "env" and d == "cutoff":
            continue
        par(f"mx.{s}.{d}", "mx", f"{sl} > {dl}", "continuous", f"Matrix point: {sl} to {dl}.", [enc(MXNOTE)], 30, rng=BIP, default=0)
    for n in (1, 2, 3):
        par(f"mx.{s}.assign{n}", "mx", f"{sl} > Assign{n}", "continuous", f"Matrix point: {sl} to the Assign{n} destination.", [enc(MXNOTE)], 31, rng=BIP, default=0)
ASSIGN = [("none", "None"), ("glide", "Glide"), ("osc_type", "Oscillator Type"), ("osc_wave", "Oscillator Wave"), ("osc_timbre", "Oscillator Timbre"), ("osc_shape", "Oscillator Shape"),
          ("cutoff", "Filter Cutoff"), ("resonance", "Filter Resonance"), ("env_attack", "Envelope Attack"), ("env_decay", "Envelope Decay"), ("env_sustain", "Envelope Sustain"),
          ("env_filter_amt", "Envelope Filter Amount"), ("lfo_rate", "LFO Rate"), ("arp_rate", "Arp&Seq Rate"), ("cyc_rise", "Cycling Env Rise"), ("cyc_fall", "Cycling Env Fall"),
          ("cyc_hold", "Cycling Env Hold"), ("cyc_amount", "Cycling Env Amount"), ("matrix_point", "Matrix Modulation Amount (another point's amount)")]
for n in (1, 2, 3):
    par(f"mx.assign{n}.target", "mx", f"Assign{n}", "enum", f"Destination of matrix column {n}: hold Assign{n} and move a knob (or select a matrix point to modulate its amount).",
        [btn(f"hold Assign{n} + move a knob or the Matrix encoder")], 31, values=vals(ASSIGN), default="none",
        note="Not assignable: Master Volume, Preset encoder, Shift-layer parameters (e.g. cycling envelope shapes), buttons and icons.")
# ---- keyboard, voices, strip
par("voice.paraphonic", "voice", "Paraphonic", "boolean", "Four-voice paraphony (button lit) or mono.", [btn()], 9)
par("kbd.octave", "kbd", "Octave", "integer", "Keyboard octave shift; LEDs blink faster further from 0. Saved with the preset.", [btn("Octave left/right buttons")], 61, rng={"min": -3, "max": 3}, default=0)
par("kbd.hold", "kbd", "Hold", "boolean", "Key Hold: latches held notes (adds notes in paraphonic mode; keeps the arp running). Not saved. In sequencer mode the icon is Tie/Rest and clear.", [btn("Hold touch icon")], 63, memory="none")
par("kbd.press_mode", "kbd", "Press mode", "enum", "Keyboard pressure output: aftertouch or velocity.", [menu("Utility > Preset > Press mode")], 58, values=vals(["aftertouch", "velocity"]))
par("kbd.velo_amp_mod", "kbd", "Velo Amp Mod", "integer", "How much velocity affects volume.", [menu("Utility > Preset > Velo Amp Mod")], 58, rng={"min": 0, "max": 10})
par("strip.mode", "strip", "Spice / Dice / Bend", "enum", "Touch strip function, chosen by its icons.", [btn("Spice, Dice and Bend touch icons")], 65, memory="none", values=vals(["spice", "dice", "bend"]))
par("strip.bend", "strip", "Bend", "continuous", "Pitch bend: centre is neutral; touch elsewhere to jump, slide to bend; returns to centre on release. Relative mode adds movement to the current pitch.",
    [gest("touch or slide on the strip in Bend mode")], 66, memory="none", rng={"min": -1, "max": 1, "note": "scaled by Bend Range"})
par("strip.bend_range", "strip", "Bend Range", "integer", "Bend range in semitones each side.", [menu("Utility > Preset > Bend Range")], 66, rng={"min": 0, "max": 24}, default=12,
    note="Table: 0-24, 'zero to two octaves'. Text: default 24 steps (12 each side), maximum 48 steps (four octaves). Modelled as semitones per side.")
par("strip.relative", "strip", "Relative bend", "boolean", "Relative bend mode.", [menu("Utility > Misc > Relative bend")], 66, memory="global", default=False)
par("strip.spice", "strip", "Spice", "continuous", "Amount of deviation of arp/seq gates (and subtly octave, velocity and amp release) from the default gate length towards the current random status.", [gest("Spice icon, then touch the strip")], 65,
    memory="none", rng={"min": 0, "max": 100, "note": "strip position"})
par("strip.dice", "strip", "Dice", "continuous", "Rolls a new bipolar random change to each step's gate length; touch further right for a bigger reshuffle.", [gest("Dice icon, then tap the strip")], 65, memory="none",
    rng={"min": 0, "max": 100, "note": "strip position"})
# ---- arp / seq
par("arp.mode", "arp", "Arp | Seq", "enum", "Arpeggiator on, sequencer on, or off.", [btn("Arp|Seq toggles the arpeggiator; Shift + Arp|Seq the sequencer")], 15, memory="none",
    values=vals([("off", "Off"), ("arp", "Arp"), ("seq", "Seq")]), confidence="inferred", note="Whether the Arp/Seq state is saved with the preset is not stated.")
par("arp.pattern", "arp", "Up / Order / Random / Pattern", "enum", "Arpeggiator note order.", [btn("Up|A, Order|B, Rand|O, Pattern|> touch icons in Arp mode")], 67, memory="none",
    values=vals([("up", "Up", "low to high"), ("order", "Order", "order played"), ("random", "Random"), ("pattern", "Pattern", "generated semi-random pattern; lowest note twice as often; new pattern per key change")]),
    confidence="inferred", note="Memory not stated.")
par("arp.octave", "arp", "Oct | Mod", "integer", "Arpeggiator range 1-4 octaves (LEDs 1-4). In sequencer mode the button selects modulation track 1-4.", [btn("Oct|Mod button")], 70, rng={"min": 1, "max": 4}, default=1, confidence="inferred",
    note="Memory not stated.")
par("arp.rate", "arp", "Rate", "continuous", "Arp/seq speed: BPM (default 120) when free, or division (1/1, 1/2, 1/2T, 1/4, 1/4T, 1/8, 1/8T, 1/16, 1/16T, 1/32, 1/32T) when synced. In step record it scrubs steps.", [knob()], 69, rng=K100)
par("arp.sync", "arp", "Sync", "boolean", "Locks the arp/seq rate to the clock (Sync LED).", [btn("press the Rate knob")], 69)
par("arp.swing", "arp", "Swing", "continuous", "Swing 50% (straight) to 75%.", [knob("Shift + Rate")], 70, rng={"min": 50, "max": 75, "note": "percent"}, default=50)
par("seq.select", "seq", "A / B", "enum", "Selects sequence A or B; switching during play is allowed. Shift + A/B reloads the saved pattern; A/B + Hold clears it.", [btn("Up|A and Order|B icons in Seq mode")], 74,
    values=vals(["a", "b"]), confidence="inferred", note="Memory of the selected sequence not stated.")
par("seq.record", "seq", "Record (O)", "boolean", "Step record when stopped; real-time record when playing.", [btn("Rand|O icon in Seq mode")], 73, memory="none")
par("seq.play", "seq", "Play (>)", "boolean", "Play/stop; sends MIDI start/stop and clock.", [btn("Pattern|> icon in Seq mode")], 73, memory="none")
par("seq.length", "seq", "Seq Length", "integer", "Steps for both sequences, their mod tracks and Pattern/Spice & Dice length.", [menu("Utility > Preset > Seq Length"), knob("Shift + Rate in step record")], 72, rng={"min": 4, "max": 64}, default=16)
par("seq.gate_length", "seq", "Default gate length", "integer", "Default arp/seq gate length (Spice at 0).", [menu("Utility > Preset > Default gate length")], 65, rng={"min": 5, "max": 85, "note": "percent"}, default=45)
for n in (1, 2, 3, 4):
    par(f"seq.smooth{n}", "seq", f"Seq {n} smooth", "boolean", f"Smoothing (slew) for modulation track {n}. New step-recorded tracks start Off, real-time tracks On.", [menu(f"Utility > Preset > Seq {n} smooth")], 79)
# ---- glide mode, presets, utility
par("glide.mode", "glide", "Glide mode", "enum", "What the Glide knob sets.", [menu("Utility > Preset > Glide mode")], 60,
    values=vals([("time", "Time", "fixed time, 0 to 10 s"), ("sync", "Sync", "1/32T to 1/1 of the clock"), ("rate", "Rate", "rate per octave")]), default="time")
par("out.preset_volume", "out", "Preset Volume", "integer", "Relative preset volume.", [menu("Utility > Preset > Preset Volume")], 24, rng={"min": -12, "max": 12})
par("out.master", "out", "Master", "continuous", "Global volume for line and headphone outputs.", [knob()], 11, memory="none", rng=K100)
par("ui.preset", "ui", "Preset", "integer", "Preset slot: 1-128 factory, 129-160 templates, rest user. Turn to load (or click with Click to Load); triple-click resets to Init.", [enc("Preset encoder"), {"type": "midi", "message": "program change"}], 22,
    memory="none", rng={"min": 1, "max": 256})
par("ui.save", "ui", "Save", "boolean", "Save: choose slot, one of 11 categories (bass, brass, keys, lead, organ, pad, percussion, sequence, sfx, strings, template) and name; long press saves in place.", [btn()], 22, memory="none")
par("ui.panel", "ui", "Panel", "boolean", "Applies all current knob positions to the loaded preset.", [btn()], 26, memory="none")
par("ui.shift", "ui", "Shift", "boolean", "Second functions (blue legends) and hidden combinations.", [btn()], 14, memory="none")
G = "global"
SET = [
    ("midi.in_chan", "Input chan", "enum", "MIDI receive channel.", "Utility > MIDI > Input chan", vals(["all"] + [str(i) for i in range(1, 17)] + ["none"]), None),
    ("midi.out_chan", "Output chan", "integer", "MIDI transmit channel.", "Utility > MIDI > Output chan", None, {"min": 1, "max": 16}),
    ("midi.out_dest", "Output dest", "enum", "Where MIDI is sent.", "Utility > MIDI > Output dest", vals(["none", "usb", "midi", "both"]), None),
    ("midi.local", "Local", "boolean", "Local control of keyboard and knobs (default on).", "Utility > MIDI > Local", None, None),
    ("midi.arpseq_out", "Arp/Seq MIDI out", "boolean", "Send arp/seq notes over MIDI.", "Utility > MIDI > Arp/Seq MIDI out", None, None),
    ("midi.thru", "Thru", "boolean", "Echo MIDI In to MIDI Out.", "Utility > MIDI > Thru", None, None),
    ("midi.knob_cc", "Knob send CCs", "boolean", "Knobs send CCs.", "Utility > MIDI > Knob send CCs", None, None),
    ("midi.merge", "Merge", "enum", "How keyboard data merges into the MIDI output.", "Utility > MIDI > Merge", vals(["usb_kbd", "midi_kbd", "both_kbd"]), None),
    ("midi.pc_receive", "Program Change Receive", "boolean", "Respond to program change.", "MIDI Control Center only", None, None),
    ("clock.source", "Sync Source", "enum", "Tempo source.", "Utility > Sync > Source", vals(["int", "usb", "midi", "clock", "auto"]), None),
    ("clock.type", "Clock", "enum", "Analog clock in/out resolution.", "Utility > Sync > Clock", vals(["one_step", "2ppq", "24ppq", "48ppq"]), None),
    ("clock.global_tempo", "Global Tempo", "boolean", "Ignore preset tempos; keep the last tempo.", "Utility > Sync > Global Tempo", None, None),
    ("cvout.pitch_format", "Pitch format", "enum", "CV pitch standard.", "Utility > CV/Gate > Pitch format", vals(["1v_oct", "hz_v", "1.2v_oct"]), None),
    ("cvout.gate_format", "Gate format", "enum", "Gate voltage type.", "Utility > CV/Gate > Gate format", vals(["s_trig", "v_trig_5v", "v_trig_12v"]), None),
    ("cvout.pressure_range", "Pressure range", "integer", "Pressure output maximum voltage.", "Utility > CV/Gate > Pressure range", None, {"min": 1, "max": 10, "note": "volts"}),
    ("cvout.zero_ref", "0V reference", "enum", "Note giving 0 V (1 V/oct and 1.2 V/oct).", "Utility > CV/Gate > 0V reference", vals(["C-1 ... G8"]), None),
    ("cvout.one_ref", "1V reference", "enum", "Note giving 1 V (Hz/V).", "Utility > CV/Gate > 1V reference", vals(["C-1 ... G8"]), None),
    ("ui.knob_catch", "Knob catch", "enum", "How knobs pick up stored values.", "Utility > Browsing > Knob catch", vals([("jump", "Jump"), ("hook", "Hook"), ("scaled", "Scaled", "default per the MCC section")]), None),
    ("ui.click_to_load", "Click to load", "boolean", "Browsing needs a click to load.", "Utility > Browsing > Click to load", None, None),
    ("ui.cent_offset", "Cent offset", "integer", "Master tuning offset.", "Utility > Master tuning > Cent offset", None, {"min": -50, "max": 50, "note": "cents"}),
    ("ui.a_reference", "A Reference", "continuous", "Tuning reference for A.", "Utility > Master tuning > A Reference", None, {"min": 427.4, "max": 452.89, "note": "Hz"}),
    ("ui.mem_protect", "Mem protect", "enum", "Preset overwrite protection (default protects factory presets).", "Utility > Misc > Mem Protect", vals(["off", "factory_only", "on"]), None),
    ("kbd.sensitivity", "KBD sensitivity", "integer", "Keyboard response for pressure and velocity.", "Utility > Misc > KBD sensitivity", None, {"min": 10, "max": 100, "note": "percent"}),
    ("kbd.at_curve", "Aftertouch curve", "enum", "Aftertouch response.", "Utility > Misc > Aftertouch curve", vals(["lin", "log", "exp"]), None),
    ("kbd.vel_curve", "Velocity curve", "enum", "Velocity response (Lin default).", "Utility > Misc > Velocity curve", vals(["lin", "log", "exp"]), None),
]
for pid, lbl, kind, fn, path, v, r in SET:
    mdl = pid.split(".")[0]
    acc = [menu(path)] if "only" in path else [menu(path), MCC]
    par(pid, mdl, lbl, kind, fn, acc, 83, memory=G, values=v, rng=r)
par("ui.factory_reset", "ui", "Factory reset", "boolean", "Restores factory settings and erases presets.", [menu("Utility > Misc > Factory reset"), MCC], 85, memory="none")
par("ui.user_erase", "ui", "User preset erase", "boolean", "Erases user presets only.", [menu("Utility > Misc > User preset erase"), MCC], 85, memory="none")
par("power", "ui", "Power", "boolean", "Recessed power switch: off or USB/DC power (DC preferred when both connected).", [{"type": "rear_panel", "control": "slide_switch"}], 20, memory="none")
D["parameters"] = P

# ======================================================================== ports
jack("jack.out", "OUTPUT", "out", "audio", "out.line", "Mono line output, balanced (symmetrised) TRS.", "6.35 mm TRS", manual_ref=18)
jack("jack.phones", "Headphones", "out", "audio", "out.phones", "Headphone output, mono signal on both sides. From firmware 2.1 the socket also takes a TRRS headset mic for the vocoder.", "3.5 mm TRS", manual_ref=18)
jack("jack.cv", "CV", "out", "cv", "cvout.pitch", "Pitch CV (format per Utility).", "3.5 mm", manual_ref=18, note="Size from the Thomann specification; not stated in the manual.")
jack("jack.gate", "Gate", "out", "gate", "cvout.gate", "Gate (S-trig or V-trig 5/12 V).", "3.5 mm", manual_ref=18, note="Size from Thomann.")
jack("jack.pressure", "Pressure", "out", "cv", "cvout.press", "Pressure or velocity voltage, 0 to the set range (up to 10 V).", "3.5 mm", manual_ref=18, note="Size from Thomann.")
jack("jack.clock_in", "CLOCK In", "in", "clock", "clock.ext_in", "Analog clock in; TRS carries clock and start, TS clock only.", "3.5 mm TRS", manual_ref=19, note="3.5 mm from Thomann; TRS/TS behaviour from the manual.")
jack("jack.clock_out", "CLOCK Out", "out", "clock", "clock.ext_out", "Analog clock out (and start on TRS).", "3.5 mm TRS", manual_ref=19, note="3.5 mm from Thomann.")
jack("midi.in", "MIDI In", "in", "midi", "midi.din_in", "MIDI in via the supplied TRS-to-DIN adapter.", "3.5 mm TRS", manual_ref=19)
jack("midi.out", "MIDI Out", "out", "midi", "midi.din_out", "MIDI out via the supplied TRS-to-DIN adapter.", "3.5 mm TRS", manual_ref=19)
jack("usb", "USB", "in", "midi", "midi.usb", "Class-compliant USB MIDI and 5 V power (500 mA phone charger or power bank works); MIDI Control Center and firmware.", "USB-B", manual_ref=19)
jack("power.dc", "12V DC 1A", "in", "power", None, "External supply, centre positive; the supplied adapter provides the ground the capacitive keyboard needs.", "DC barrel (2.1 mm pin, 5.5 mm)", manual_ref=20)
D["ports"] = J

# ======================================================================== connections
NT = "notes"
con("kbd.notes", "voice.kbd", NT, {"all": [eq("arp.mode", "off"), eq("midi.local", True)]})
con("kbd.notes", "arp.in", NT, {"all": [eq("arp.mode", "arp"), eq("midi.local", True)]})
con("kbd.notes", "voice.kbd", NT, {"all": [eq("arp.mode", "seq"), eq("midi.local", True)]}, note="keyboard plays over (and in mono pauses) the sequence; Shift + key transposes it")
con("kbd.notes", "seq.in", NT, note="step and real-time recording")
con("midi.notes", "voice.midi", NT, ne("arp.mode", "arp"))
con("midi.notes", "arp.in", NT, eq("arp.mode", "arp"))
con("midi.notes", "seq.in", NT, note="step and real-time recording from MIDI")
con("arp.out", "voice.arp", NT)
con("seq.notes", "voice.seq", NT, eq("arp.mode", "seq"))
con("kbd.notes", "midi.tx", NT)
con("arp.out", "midi.tx", NT, eq("midi.arpseq_out", True))
con("seq.notes", "midi.tx", NT, eq("midi.arpseq_out", True))
con("midi.clock", "clock.midi", "clock")
con("clock.out", "arp.clock", "clock")
con("clock.out", "seq.clock", "clock")
con("clock.out", "lfo.clock", "clock", eq("lfo.sync", True))
con("voice.pitch", "glide.in", "cv")
con("glide.out", "osc.pitch", "cv", note="1 V/oct-equivalent key tracking is hardwired")
con("strip.bend", "osc.pitch", "cv", eq("strip.mode", "bend"), amount="strip.bend_range")
con("osc.out", "vcf.in", "audio")
con("vcf.out", "vca.in", "audio")
con("vca.out", "out.in", "audio", amount="out.preset_volume")
con("voice.gate", "env.gate", "gate")
con("voice.gate", "cyc.trig", "gate")
con("voice.gate", "lfo.retrig", "gate", ne("lfo.retrig", "off"))
con("voice.gate", "vca.cv", "gate", eq("env.amp_mod", False))
con("env.out", "vca.cv", "cv", eq("env.amp_mod", True))
con("env.out", "vcf.env", "cv", amount="env.filter_amt", note="the Env > Cutoff matrix point")
con("voice.cv", "cvout.notes", NT)
con("kbd.pressure", "cvout.pressure", "cv")
# matrix: fixed columns
for s, sl, node in SRC:
    for d, dl, dnode in FIXED:
        if s == "env" and d == "cutoff":
            continue
        con(node, dnode, "cv", amount=f"mx.{s}.{d}", note=f"matrix {sl} > {dl}")
    con(node, f"mx.{s}", "cv", note="to the Assign columns (amounts per point)")
# matrix: assignable columns
TARGETS = [("glide.mod", ["glide"]), ("osc.type_mod", ["osc_type"]), ("osc.wave_mod", ["osc_wave"]), ("osc.timbre_mod", ["osc_timbre"]), ("osc.shape_mod", ["osc_shape"]),
           ("vcf.cutoff_mod", ["cutoff"]), ("vcf.res_mod", ["resonance"]), ("env.mod", ["env_attack", "env_decay", "env_sustain", "env_filter_amt"]), ("lfo.mod", ["lfo_rate"]),
           ("arp.mod", ["arp_rate"]), ("cyc.mod", ["cyc_rise", "cyc_fall", "cyc_hold", "cyc_amount"]), ("mx.amount_mod", ["matrix_point"])]
for n in (1, 2, 3):
    for node, vs in TARGETS:
        w = eq(f"mx.assign{n}.target", vs[0]) if len(vs) == 1 else {"any": [eq(f"mx.assign{n}.target", v) for v in vs]}
        con(f"mx.assign{n}", node, "cv", w)
D["connections"] = C

# ======================================================================== indicators
D["indicators"] = [
    {"id": "oled", "module": "ui", "label": "OLED display", "kind": "display", "function": "Preset name and category, parameter values and graphics, matrix point and amount (inverted while editing), Utility menus, sequencer steps."},
    {"id": "matrix_leds", "module": "mx", "label": "matrix LEDs (35)", "kind": "led", "function": "Lit = routed with a non-zero amount; blinking = selected for editing; while editing only the edited point is lit."},
    {"id": "filter_leds", "module": "vcf", "label": "LPF / BPF / HPF LEDs", "kind": "led", "function": "Show the filter type."},
    {"id": "cyc_leds", "module": "cyc", "label": "Env / Run / Loop LEDs", "kind": "led", "function": "Show the cycling envelope mode."},
    {"id": "lfo_leds", "module": "lfo", "label": "LFO shape LEDs (6)", "kind": "led", "function": "Show the LFO shape."},
    {"id": "sync_leds", "module": "clock", "label": "Sync LEDs (Arp/Seq and LFO)", "kind": "led", "function": "Lit when the rate is synced."},
    {"id": "octmod_leds", "module": "arp", "label": "Oct | Mod LEDs 1-4", "kind": "led", "function": "Arp octave range, or the selected sequencer modulation track."},
    {"id": "octave_leds", "module": "kbd", "label": "Octave buttons", "kind": "led", "function": "Blink faster the further from 0 (fastest at -3 and +3)."},
    {"id": "button_leds", "module": "ui", "label": "button and icon lights", "kind": "led", "function": "Paraphonic, Amp Mod, Arp|Seq (white = arp), Shift, Save (blinks in final save stage), record and play icons, Spice/Dice/Bend icons."},
]

# ======================================================================== behaviours
B = [
    ("Preset vs knob position", ["ui"], "After loading, knob positions don't match the sound; a moved knob joins the preset per Knob catch (Jump, Hook, Scaled). Panel applies all current positions at once."),
    ("Matrix sums", ["mx"], "Several sources on one destination add; all points are bipolar (-100 to +100); negative cutoff modulation can silence the sound."),
    ("Hardwired routes", ["osc", "vcf", "vca"], "Key pitch to oscillator, envelope to cutoff (Filter Amt = the Env > Cutoff point) and envelope or gate to the VCA are built in; Key/Arp > Pitch scales the existing tracking (larger or microtonal steps)."),
    ("Assign columns", ["mx"], "Hold Assign1-3 and move a knob to set the column's destination for all five sources; hold Assign and pick a matrix point to modulate that point's amount."),
    ("Paraphony", ["voice", "vca", "osc"], "Up to 4 voices share the analog filter; each has its own internal VCA envelope copy. Polyphonic sources (envelope, pressure, key/arp, arpeggiator) modulate Wave, Timbre and Shape per voice; Type changes for all voices."),
    ("Chords model", ["osc", "voice"], "Selecting Chords disables paraphony: the last key is the root and one chord plays."),
    ("Note priority", ["voice", "seq"], "Keyboard and MIDI notes take voices before the sequencer; with paraphony off only a step's lowest note plays; in mono a held key pauses the sequence."),
    ("Amp Mod", ["env", "vca"], "Amp Mod off: the VCA follows the gate (arp/seq gate length is audible). On: the envelope shapes the volume."),
    ("Cycling envelope modes", ["cyc"], "Env runs once; Run free-runs (reset by MIDI start); Loop cycles and resets on each trigger. In Run and Loop, Hold is a hold time; in Env it is a sustain level."),
    ("Spice and Dice", ["strip", "arp", "seq"], "Spice morphs each step's gate from the default length to a random 'status'; Dice rolls a new status. They also nudge octave, velocity and amp release. Not saved."),
    ("Arp octave buttons", ["arp", "kbd"], "Octave buttons during an arpeggio add new notes in the new range rather than transposing the running arpeggio."),
    ("Arp to sequence", ["arp", "seq"], "Shift + Up|A or Order|B copies the current arpeggio to sequence A or B, extended to the sequence length."),
    ("Mod tracks", ["seq"], "Up to four knobs per preset; touching a knob in step record assigns it to the next free track; a fifth shows 'Memory full'. Tracks are shared by sequences A and B."),
    ("Sequence auto-play", ["seq"], "With a recorded sequence, pressing a key starts it without pressing play."),
    ("CV output note", ["cvout"], "Only one pitch CV: a sequence step sends its lowest note, the keyboard the last note played. MIDI carries all notes, including chords beyond four."),
    ("Clock out", ["clock", "seq"], "While playing, MIDI clock and analog clock are sent; play/stop sends MIDI start/stop."),
    ("Hold and MIDI", ["kbd"], "Key Hold does not latch external MIDI notes; send sustain instead."),
    ("Power", ["ui"], "USB (5 V 500 mA) or 12 V DC; plugging in DC resets the unit; the keyboard needs the grounded supplied adapter to work properly."),
]
D["behaviours"] = [{"id": f"b{i + 1:02d}", "name": n, "applies_to": a, "rule": r} for i, (n, a, r) in enumerate(B)]

# ======================================================================== examples
EX = [
    ("filter_sweep", "Classic filter sweep", "manual p.52", {"vcf.cutoff": 0, "vcf.resonance": 100, "env.amp_mod": True, "env.attack": "1.7 s", "env.decay": "7.7 s", "env.sustain": 90, "env.filter_amt": 70},
     "Cutoff minimum, resonance maximum, Amp Mod on, attack 1.7 s, decay 7.7 s, sustain 90%, Filter Amt 70.", "stated"),
    ("speech_filter", "Speech: the word 'Filter'", "manual p.43", {"osc.type": "speech", "osc.wave": 100, "osc.timbre": 40, "osc.shape": 30},
     "Wave at maximum, Timbre 40, Shape 30, play middle C; press Paraphonic for four voices.", "stated"),
    ("speech_one", "Speech: the word 'One'", "manual p.43", {"osc.type": "speech", "osc.wave": 60, "osc.timbre": 46, "osc.shape": 17}, "Wave 60, Timbre 46, Shape 17, play middle C.", "stated"),
    ("computer", "Sci-fi computer bleeps", "manual p.49", {"lfo.shape": "random", "lfo.rate": "4 Hz", "mx.lfo.pitch": 30}, "Random LFO at about 4 Hz to Pitch at about 30.", "stated"),
    ("cyc_pitch", "Cycling envelope pitch blip", "manual p.54", {"mx.cycenv.pitch": 20, "cyc.rise": "200 ms", "cyc.hold": 0, "cyc.fall": 0, "cyc.amount": 50},
     "CycEnv > Pitch about 20; rise about 200 ms, hold 0, fall 0, amount 50%.", "stated"),
    ("random_chords", "Random chord changes", "manual p.42", {"osc.type": "chords", "lfo.shape": "random", "mx.lfo.wave": 75},
     "LFO random stepped wave to Wave (chord type) at 50-100.", "stated"),
    ("waveshaper_arp", "Arpeggiated waveshaper with modulated glide and attack", "manual p.71",
     {"osc.type": "waveshaper", "env.amp_mod": True, "env.attack": 0, "env.decay": "100 ms", "env.sustain": 30, "env.filter_amt": 100, "mx.assign1.target": "glide", "mx.key.assign1": 0.2,
      "mx.assign2.target": "env_attack", "mx.key.assign2": 10, "arp.mode": "arp", "arp.pattern": "pattern"},
     "Key/Arp to Glide (about 0.2) and to envelope attack (10), Pattern mode; add Spice and Dice.", "stated"),
]
D["example_patches"] = [{"id": i, "name": n, "source": s, "settings": st, "description": d, "confidence": c} for i, n, s, st, d, c in EX]

D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "control_change"}, {"message": "program_change", "note": "if Program Change Receive is on"},
                 {"message": "channel_pressure"}, {"message": "clock"}, {"message": "start"}, {"message": "stop"}, {"message": "sustain", "note": "CC 64; use instead of Hold for external notes"}],
    "transmits": [{"message": "note_on", "note": "keyboard fully polyphonic; arp/seq if enabled"}, {"message": "note_off"}, {"message": "control_change", "note": "knobs, if Knob send CCs"},
                  {"message": "channel_pressure"}, {"message": "clock", "note": "while playing"}, {"message": "start"}, {"message": "stop"}],
    "cc_map": {},  # filled below
    "channel_note": "Separate input (All, 1-16, None) and output (1-16) channels.",
    "note": ("The 1.1.2 manual has no CC chart. CC numbers come from the default CC table in the v5.0 manual (Appendix D) and Arturia's support FAQ, which agree; they are assumed to apply to "
             "earlier firmware. All CCs 0-127 except Type (10-127) and free Arp/Seq rate (0-123). Free and synced rates have separate CCs: 91/92 Arp/Seq, 93/94 LFO. "
             "On firmware 5, Type values per model are spread across 0-127 for 22 models (forum measurements); the 12-model ranges for 1.1.2 are not published. "
             "Matrix amounts, buttons and Utility settings have no CCs. Program change: bank of 128 presets per bank select (1-128, 129-256)."),
}
CCS = {2: "strip.spice", 5: "glide.amount", 9: "osc.type", 10: "osc.wave", 12: "osc.timbre", 13: "osc.shape", 23: "vcf.cutoff", 24: "cyc.amount", 26: "env.filter_amt",
       28: "cyc.hold", 29: "env.sustain", 64: "kbd.hold", 83: "vcf.resonance", 91: "arp.rate", 92: "arp.rate", 93: "lfo.rate", 94: "lfo.rate", 102: "cyc.rise", 103: "cyc.fall",
       105: "env.attack", 106: "env.decay"}
PB = {p["id"]: p for p in P}
for cc, pid in CCS.items():
    label = {91: " (free)", 92: " (synced)", 93: " (free)", 94: " (synced)", 64: " (toggle)"}.get(cc, "")
    PB[pid]["access"].append({"type": "midi", "message": f"CC {cc}{label}"})
    D["midi"]["cc_map"][str(cc)] = pid
D["specifications"] = {
    "voices": "mono or 4-voice paraphonic", "oscillator_models": 12, "oscillator_range": "C-2 to G8", "filter": "analog 12 dB/oct LP/BP/HP, about 30 Hz to above 15 kHz, self-oscillating",
    "envelope_times_s": {"attack": [0, 10], "decay_release": [0, 13]}, "lfo_rate_hz": [0.06, 100], "lfo_shapes": 6, "glide_s": [0, 10], "matrix": "5 sources x 7 destinations (4 fixed, 3 assignable), 35 points",
    "keyboard": "25 capacitive touch keys, pressure or velocity, octave shift +/-3", "presets": {"total": 256, "factory": 128, "templates": "129-160", "categories": 11},
    "sequencer": "2 sequences per preset, 4-64 steps, 4 notes per step, 4 modulation tracks", "arpeggiator": "Up, Order, Random, Pattern; 1-4 octaves; swing 50-75%",
    "outputs": "6.35 mm balanced TRS line (mono), 3.5 mm headphones (mono)", "cv_gate": "Pitch (1 V/oct, Hz/V, 1.2 V/oct), Gate (S-trig, V-trig 5 V, 12 V), Pressure (1-10 V)",
    "clock": "in/out, One step, 2, 24, 48 PPQ", "midi": "3.5 mm TRS in/out with DIN adapters, USB-B class compliant", "power": "12 V DC 1 A centre positive, or USB 5 V 500 mA",
    "tuning": "A 427.4-452.89 Hz, +/-50 cents", "firmware": "manual for product version 1.1.2 (May 2019)",
    "dimensions_mm": [311, 233, 55], "weight_kg": 1.02, "dimensions_note": "From Thomann; Arturia's manual gives none.",
    "firmware_history": {
        "2.0": "January 2020: Noise oscillator (particle, white, metallic); Chord Mode (hold Paraphonic and play a chord); scale quantise; copy sequence A to B; Shift + long press Matrix clears all routings; 64 presets",
        "2.1": "August 2020: Vocoder oscillator (16-band; mic via TRRS headset in the headphone socket); Vocoder Edition hardware",
        "3.0": "January 2021: Noise Engineering Bass, Harm and SawX oscillators; 4-voice unison (spread up to 12 semitones, modulatable); 384 presets; last preset recalled at power-on",
        "4.0": "October 2021: WaveUser oscillator (user wavetables via MIDI Control Center); 64 presets",
        "5.0": "May-July 2023: Sample, Scan Grains, Cloud Grains and Hit Grains oscillators; 512 presets; Key/Arp Random mode; Envelope Snap; reorganised Utility (Unison Count 2-4, Unison Spread, Scale and Root, Osc Knob Speed, mic settings)",
        "note": "This file models the 12 oscillator types and settings of 1.1.2. Firmware 5 has 22 types: those here plus Noise, Bass, SawX, Harm, WaveUser, Sample, Scan Grains, Cloud Grains, Hit Grains and Vocoder.",
    },
}
D["omitted_from_source"] = ["safety precautions", "registration", "tutorial and 'freaky idea' prose beyond the examples kept", "software licence and declaration of conformity", "general synthesis background"]
D["not_in_source"] = [
    "Research filled: MIDI CC map, program change banks, dimensions and weight, rear jack sizes, filter design description, firmware history to 5.0. Searched without result: cycling envelope times, arp/seq BPM range, display ranges, DAC details.",
    "knob display ranges (0-100 inferred from examples; CCs are 0-127)", "cycling envelope stage times", "arp/seq BPM range", "number of paraphonic voices setting (mentioned, not listed; the v5 Utility has Unison Count 2-4 but still no paraphonic voice count)",
    "DAC/sample rate", "whether Arp/Seq state, arp pattern mode, Oct|Mod and selected sequence are saved",
]
D["source_inconsistencies"] = [
    "LFO range: '0.05Hz up to 100Hz' (p.15) versus 0.06 Hz to 100 Hz (p.50, twice).",
    "Bend range: Utility table 0-24, 'zero to two octaves' (p.24, p.83) versus default 24 steps (12 each side) with a maximum of 48 steps, four octaves (p.66).",
    "The envelope reset setting is 'Envelope legato' (p.24 table, p.82 text) and 'Envelope reset' (p.54 note, p.83 table).",
    "Envelope Filter Amount is described in the destination and mod-track tables as 'the amount of signal sent from Envelope to AMP'; everywhere else it sets envelope to cutoff.",
    "Gate format: 'V-Trig 12V' in the Utility and MCC tables (p.84, p.87) versus 'V-Trig 10V' in the CV chapter (p.92).",
    "Headphones: '3.5 mm TRS jack' (p.7) versus 'standard 3.5 mm TS or TRS jack' (p.18).",
    "Mem protect options: 'Off / Factory only / On' (Utility table) versus 'Off, Factory only, All' (MCC section).",
    "Knob catch: the MCC section says the knobs are '360-degree encoders', while Hook and Jump modes and the rest of the manual treat them as absolute knobs.",
    "Paraphonic: 'depending on the number of voices you have specified in Utility' (p.21), but no voice-count setting appears in the Utility tables.",
    "Swing: 'Hold SHIFT and turn the Rate encoder' versus 'hold the blue SHIFT button and press Rate' (both p.70).",
    "LFO sync: '8/1 ... completes in 8 pulses, which is 1/4 of a quarter note' (p.50) contradicts 8/1 being its slowest (eight-bar) rate.",
    "Pitch range: 'the whole pitch range is eight octaves' (p.61) versus the oscillator range C-2 to G8 (p.35).",
    "Cross references: the Shift section points to the arpeggiator as chapter 12 [p.72] and the sequencer as chapter 13 [p.67]; the page numbers are swapped.",
    "Sequencer mode is said to change 'the first five icons'; the strip has Hold plus four arp/seq icons, and the Arp list names 'Hold' where Up is meant (p.73).",
    "The CV 0 V reference text says 'when pitch format is set to 0V/Oct' (p.87); the table says 1 V/Oct or 1.2 V/Oct.",
    "Assignable destinations list Arp&Seq Rate; the modulation-track table omits it (otherwise the lists match).",
    "Between sources: A reference range 427.4-452.89 Hz (1.1.2) versus 427.47-453.89 Hz (v5 manual).",
    "Between sources: the v5 manual repeats the LFO inconsistency with three values (0.05 Hz, 0.1 Hz, 0.06 Hz); 0.06 Hz is used.",
    "Between sources: the cheat sheet in circulation gives default gate length 10-90% (default 50%); both manuals say 5-85% (default 45%).",
    "Between sources: on firmware 5 the CC 9 value the MicroFreak transmits for several oscillator types falls outside the range it accepts for that type (forum report).",
]
D["modelling_gaps"] = [
    {"topic": "Matrix representation", "detail": "The fixed 5 x 7 grid is modelled as one amount parameter per point and connections, not the slot-based mod_matrix section (which assumes selectable sources). Assign columns route through module 'mx' with switched connections by target."},
    {"topic": "Modulating a matrix point", "detail": "An Assign column can target another point's amount; the chosen point is not representable, only the 'matrix_point' target value."},
    {"topic": "Paraphonic scope", "detail": "Per-voice modulation of Wave/Timbre/Shape by polyphonic sources versus common Type and filter is described in module scope and behaviours only."},
    {"topic": "Knob values", "detail": "The manual gives display scales only through examples; ranges marked 0-100 are inferred."},
    {"topic": "Sequencer content and mod tracks", "detail": "Notes, ties, velocities and the four recorded knob tracks are sequence content, not parameters; only settings are modelled."},
    {"topic": "Hybrid signal path", "detail": "The schema has only analogue or digital; recorded as digital with a hybrid note (digital oscillator, analog filter and VCA). A hybrid value is worth adding in 0.14.0."},
]

order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "example_patches", "midi",
         "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/arturia-microfreak_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written", len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")
