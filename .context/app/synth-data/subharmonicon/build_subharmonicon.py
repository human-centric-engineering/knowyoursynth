#!/usr/bin/env python3
"""Assemble the Moog Subharmonicon device file (schema 0.13.0).

Semi-modular analogue polyrhythmic synthesizer (2020), 60HP Eurorack format in a
wooden case. Two VCOs, each with two subharmonic oscillators tuned to the first 16
undertones (f/1 to f/16); a six-channel mixer; a 4-pole Moog ladder low-pass filter;
attack/decay envelopes for filter and VCA; two 4-step sequencers (one per VCO, each
assignable to the VCO pitch and to either sub's divisor); four rhythm generators that
divide the tempo by 1-16 and drive either or both sequencers (OR or XOR); quantise to
12-ET, 8-ET, 12-JI or 8-JI; 32-point patchbay (17 inputs, 15 outputs); MIDI in.

Source: Moog Subharmonicon User Manual Version 1 (2020), 58 pages: controls with
ranges, patchbay levels and normals, transport, rhythm generators, global fine tune,
MIDI CC table, ten preset patch sheets (cables read from the drawings), signal flow and
specifications.
"""
import json

S10 = {"min": 0, "max": 10, "note": "panel numbering not stated; 0 = full CCW, 10 = full CW"}
BI = {"min": -5, "max": 5, "note": "bipolar; centre = no effect"}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default", "memory"):
        if k in kw:
            p[k] = kw.pop(k)
    acc = kw.pop("access", None) or [{"type": "panel", "control": control}]
    if "cc" in kw:
        acc = acc + [{"type": "midi", "message": kw.pop("cc")}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, scale=S10, **kw):
    par(id, module, label, "continuous", fn, panel_scale=scale, **kw)


def btn(id, module, label, fn, **kw):
    par(id, module, label, "boolean", fn, control="push_button", **kw)


def jack(id, label, direction, signal, node, fn, **kw):
    j = {"id": id, "label": label, "location": "patch_in" if direction == "in" else "patch_out", "direction": direction, "signal": signal,
         "connector": "3.5 mm jack", "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def norm(frm, to, jack_id, signal="cv", **kw):
    con(frm, to, signal, kind="normalled", broken_by=jack_id, **kw)


def eq(p, v):
    return {"param": p, "equals": v}


DIV = {"min": 1, "max": 16, "note": "integer divisor; full CW = 1, full CCW = 16"}

# ======================================================================== device
D["device"] = {
    "id": "moog-subharmonicon", "manufacturer": "Moog Music", "model": "Subharmonicon",
    "category": "semi-modular analogue polyrhythmic synthesizer, desktop or 60HP Eurorack, two VCOs with four subharmonic oscillators, two 4-step sequencers, four rhythm generators",
    "based_on": "Original Moog design (2020), drawing on Oskar Sala's Mixtur-Trautonium (subharmonic oscillators) and the Theremin/Cowell/Schillinger Rhythmicon (integer-ratio polyrhythms). Companion to the Mother-32 and DFAM.",
    "sources": [
        {"id": "manual", "title": "Moog Subharmonicon User Manual, Version 1 (2020)", "kind": "user_manual", "file": "MOOG-Subharmonicon.pdf", "pages": 58,
         "note": "History, guided exploration, every control with ranges, patchbay levels and normals, transport, rhythm generators, DFAM/Mother-32 sync, Eurorack install, fine tune, "
                 "MIDI CC table, ten preset patch sheets (cables legible, knob positions drawn), signal flow and specifications."},
        {"id": "fw110", "title": "Moog Subharmonicon firmware v1.1.0 announcement (8 March 2022), via Sonicstate, Recording Magazine, Rekkerd and MusicTech", "kind": "other",
         "url": "https://sonicstate.com/news/2022/03/09/moog-releases-subharmonicon-firmware-update/",
         "note": "MIDI note transpose of running sequences; note priority by CC 91; TRIGGER ignored while EG is held; SEQ CLK outputs brought into phase with the clock."},
        {"id": "rubadub", "title": "Rubadub, 'Subharmonicon firmware v1.1.0 now available'", "kind": "other", "url": "https://rubadub.co.uk/blogs/rad/subharmonicon-firmware-v1-1-0-now-available",
         "note": "Lists MIDI pitch bend among the v1.1.0 features."},
        {"id": "modwiggler_quant", "title": "ModWiggler, 'Moogfest Sub-Harmonicon - What Is It?' thread", "kind": "other", "url": "https://www.modwiggler.com/forum/viewtopic.php?t=198086&start=300",
         "note": "From Loopop's video: 8-ET and 8-JI are fixed to a root of C and step C, D, E...; Andrew Huang showed a standard JI diatonic scale."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "synthesis_note": "Subharmonic: each VCO's two subs divide its frequency by integers 1-16 (the undertone series); rhythm generators divide the tempo by integers 1-16.",
    "signal_path": "analogue", "voices": 1, "polyphony_mode": "paraphonic sources (two VCOs and four subs, independently tuned) through one filter and VCA",
    "poly_chain_max_units": None, "patch_memory": False,
    "patch_memory_note": "No sound memory; fine tune, quantise and sequencer-output modes persist. Patch sheets are supplied for recall.",
    "semi_modular": True,
    "panel_counts": {"knobs": 33, "waveform_switches": 2, "buttons": 21, "patch_points": 32, "patch_inputs": 17, "patch_outputs": 15},
    "summary": ("Two VCOs (4 octaves each, C4 to C8) give square, pulse or saw; each has two subs set to f/1 to f/16 that share its waveform. Six mixer levels feed the ladder "
                "filter (20 Hz to 20 kHz, resonant to self-oscillation) and the VCA, each with its own attack/decay envelope. Sequencer 1 belongs to VCO 1, Sequencer 2 to "
                "VCO 2; each step can move the VCO pitch and/or either sub's divisor. The tempo (20 to 3,000 BPM) feeds four rhythm generators, each dividing it by 1-16 "
                "and assigned to either or both sequencers, combined by OR or XOR. Quantise and sequencer octave range are shared."),
}

# ======================================================================== modules
mod("clock", "gate_logic", "Tempo / clock", "TEMPO", "Master clock, 0.333 to 50 Hz (20 to 3,000 BPM at 1 PPQ). A CLOCK input overrides it; MIDI clock overrides both (then 4 PPQ). Runs only while PLAY is lit.",
    ["clock.ext_in", "clock.midi_in", "clock.run"], ["clock.out"], {"rate_hz": [0.333, 50], "bpm": [20, 3000], "ppq_internal": 1, "ppq_midi": 4, "priority": "MIDI > CLOCK input > TEMPO"})
for n in (1, 2, 3, 4):
    mod(f"rhythm{n}", "gate_logic", f"Rhythm generator {n}", "POLYRHYTHM", f"Divides the clock by an integer 1-16 (knob or CV) and sends the result to Sequencer 1, 2 or both. Reset to its starting phase by RESET.",
        [f"rhythm{n}.clock", f"rhythm{n}.cv"], [f"rhythm{n}.out"], {"divisor": [1, 16]})
for s in (1, 2):
    mod(f"seq{s}", "sequencer", f"Sequencer {s}", f"SEQUENCER {s}",
        f"Four steps, each a bipolar offset (±1, ±2 or ±5 octaves, quantised or not) applied to VCO {s} pitch and/or its subs' divisors per SEQ {s} ASSIGN. Advances on clocks from assigned rhythm generators (OR or XOR).",
        [f"seq{s}.clock", f"seq{s}.reset"], [f"seq{s}.cv", f"seq{s}.clk"], {"steps": 4, "octave_ranges": ["±1", "±2", "±5"]})
mod("transport", "gate_logic", "Transport and EG triggering", "TRANSPORT", "PLAY, RESET, NEXT, TRIGGER and EG mode. Combines sequencer steps (EG on), the TRIGGER button and the TRIGGER input into envelope triggers, also sent to TRIGGER OUT (1 ms, 5 V).",
    ["transport.play_in", "transport.reset_in", "transport.trig_in", "transport.step1", "transport.step2", "transport.midi_gate"], ["transport.run", "transport.reset", "transport.eg_trig"])
mod("pitchbus", "mult", "VCO CV normal", "patchbay VCO 1 / VCO 2 inputs", "The VCO 1 input also feeds VCO 2 until a cable is in the VCO 2 input.", ["pitchbus.in"], ["pitchbus.to_vco1", "pitchbus.to_vco2"])
mod("midi", "midi_to_cv", "MIDI input", "patchbay MIDI IN", "Type A TRS minijack MIDI: clock, notes (offset from C4 on the VCOs), CCs for VCO and sub tuning and EG times, rhythm logic.", ["midi.in"], ["midi.note", "midi.gate", "midi.clock"])
for v in (1, 2):
    mod(f"vco{v}", "oscillator", f"VCO {v}", f"OSCILLATOR {v}",
        f"Analogue VCO, 4 octaves (262 Hz to 4,186 Hz from the knob), optionally quantised. WAVE: square (up), pulse with PWM from SUB 1's saw (middle), saw (down); its two subs follow the switch.",
        [f"vco{v}.pitch_cv", f"vco{v}.pwm"], [f"vco{v}.out", f"vco{v}.sub_src"], {"range_hz": [262, 4186], "waveforms": ["square", "pulse (PWM)", "saw"], "max_seq_hz": 10000})
    for u in (1, 2):
        mod(f"sub{v}{u}", "oscillator", f"VCO {v} SUB {u}", f"OSCILLATOR {v}", f"Subharmonic oscillator: VCO {v}'s frequency divided by 1-16. Square, or saw in the middle and down switch positions.",
            [f"sub{v}{u}.src", f"sub{v}{u}.div_cv"], [f"sub{v}{u}.out"], {"divisor": [1, 16], "accuracy_note": "not accurate above about 10 kHz"})
mod("mixer", "mixer", "Mixer", "MIXER", "Six levels into the filter; near maximum the mixer overdrives warmly.", ["mixer.vco1", "mixer.sub11", "mixer.sub12", "mixer.vco2", "mixer.sub21", "mixer.sub22"], ["mixer.out"])
mod("vcf", "filter", "VCF (Moog ladder)", "FILTER", "4-pole (-24 dB/octave) low-pass ladder filter, 20 Hz to 20 kHz, resonant to self-oscillation.", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"],
    {"mode": "low-pass", "slope_db_per_octave": 24, "cutoff_hz": [20, 20000], "self_oscillates": True, "cv_range_octaves": 5})
mod("vcf_eg", "envelope", "VCF EG", "ENVELOPES", "Attack 1 ms to 10 s, decay 5 ms to 10 s; holds at peak while a gate is high. Cannot restart during its attack.", ["vcf_eg.gate"], ["vcf_eg.out"],
    {"stages": ["attack", "decay"], "attack_s": [0.001, 10], "decay_s": [0.005, 10], "output_v": [0, 8]})
mod("vca_eg", "envelope", "VCA EG", "ENVELOPES", "Attack 1 ms to 10 s, decay 5 ms to 10 s; holds at peak while a gate is high. Cannot restart during its attack.", ["vca_eg.gate"], ["vca_eg.out"],
    {"stages": ["attack", "decay"], "attack_s": [0.001, 10], "decay_s": [0.005, 10], "output_v": [0, 8]})
mod("vca", "vca", "VCA", "AMPLIFIER", "Output amplifier: VCA EG scaled to the VOLUME setting, summed with the VCA CV input.", ["vca.in", "vca.cv"], ["vca.out"])
mod("out", "output", "Audio output", "rear panel", "1/4 inch output for an instrument cable or headphones (same signal both ears); VCA OUT patch point at Eurorack level (10 Vpp).", ["out.in"], ["out.main", "out.modular"])
D["modules"] = M

# ======================================================================== parameters
for v, cc_f, cc_s in ((1, "CC 4 (MSB) / 36 (LSB)", ("CC 103", "CC 104")), (2, "CC 12 (MSB) / 44 (LSB)", ("CC 105", "CC 106"))):
    knob(f"vco{v}.freq", f"vco{v}", f"VCO {v} FREQ", "Initial pitch over 4 octaves, C4 (CCW) to C8 (CW); stepped when quantised. MIDI CC adds ±2.5 octaves.", physical={"min": 262, "max": 4186, "unit": "Hz"}, cc=cc_f)
    par(f"vco{v}.wave", f"vco{v}", f"VCO {v} WAVE", "enum", "Waveform for the VCO and its subs.", control="toggle_switch",
        values=[{"value": "square", "label": "UP", "meaning": "square on VCO and subs"}, {"value": "pwm", "label": "MIDDLE", "meaning": "VCO pulse with PWM from SUB 1 saw; subs saw"},
                {"value": "saw", "label": "DOWN", "meaning": "saw on VCO and subs"}])
    for u in (1, 2):
        par(f"sub{v}{u}.div", f"sub{v}{u}", f"VCO {v} SUB {u} FREQ", "integer", f"Divisor of VCO {v}'s pitch: 1 (unison, CW) to 16 (CCW). A MIDI CC replaces it until the knob moves.",
            range=DIV, cc=f"{cc_s[u - 1]} (0-7 = 16 ... 120-127 = 1)")
        knob(f"mix.sub{v}{u}", "mixer", f"VCO {v} SUB {u} LEVEL", f"Level of VCO {v} SUB {u}.")
    knob(f"mix.vco{v}", "mixer", f"VCO {v} LEVEL", f"Level of VCO {v}.")
par("vco.quantize", "vco1", "QUANTIZE", "enum", "Shared by both VCOs: off, 12-ET, 8-ET, 12-JI or 8-JI. Also quantises the SEQ outputs unless held to decouple.", control="push_button",
    values=[{"value": "off"}, {"value": "12-ET", "meaning": "chromatic, equal temperament"}, {"value": "8-ET", "meaning": "C major (C D E F G A B C), equal temperament"},
            {"value": "12-JI", "meaning": "chromatic, just intonation"}, {"value": "8-JI", "meaning": "C major in just intonation, presumably C 1/1, D 9/8, E 5/4, F 4/3, G 3/2, A 5/3, B 15/8"}],
    note="The 8-step scales are fixed to a root of C (ModWiggler, from Loopop's demonstration). The 8-JI ratios are the manual's own just C major example (p.17) and are inferred, not confirmed.")
par("vco.quantize_seq_out", "vco1", "QUANTIZE hold: SEQ outputs unquantised", "boolean", "Hold QUANTIZE until its LED flashes: VCOs stay quantised, SEQ 1/2 outputs do not.", control="push_button", memory="global",
    note="Persistence across power cycles not stated.")
knob("vcf.cutoff", "vcf", "CUTOFF", "Cutoff frequency, 20 Hz to 20 kHz.", physical={"min": 20, "max": 20000, "unit": "Hz"})
knob("vcf.resonance", "vcf", "RESONANCE", "Resonant peak; self-oscillates at maximum with low cutoff.")
knob("vcf_eg.amount", "vcf", "VCF EG AMT", "Bipolar envelope depth on cutoff; centre none.", scale=BI)
knob("vcf_eg.attack", "vcf_eg", "VCF ATTACK", "Attack time.", physical={"min": 0.001, "max": 10, "unit": "s"}, cc="CC 23 (MSB) / 55 (LSB)")
knob("vcf_eg.decay", "vcf_eg", "VCF DECAY", "Decay time.", physical={"min": 0.005, "max": 10, "unit": "s"}, cc="CC 24 (MSB) / 56 (LSB)")
knob("vca_eg.attack", "vca_eg", "VCA ATTACK", "Attack time.", physical={"min": 0.001, "max": 10, "unit": "s"}, cc="CC 28 (MSB) / 60 (LSB)")
knob("vca_eg.decay", "vca_eg", "VCA DECAY", "Decay time.", physical={"min": 0.005, "max": 10, "unit": "s"}, cc="CC 29 (MSB) / 61 (LSB)")
knob("vca.volume", "vca", "VOLUME", "Output level; the VCA EG peaks at this level.")
knob("clock.tempo", "clock", "TEMPO", "Master tempo, 0.333-50 Hz (20-3,000 BPM). In Fine Tune mode it sets fine tune instead.", physical={"min": 0.333, "max": 50, "unit": "Hz"})
for s in (1, 2):
    for st in (1, 2, 3, 4):
        knob(f"seq{s}.step{st}", f"seq{s}", f"SEQ {s} STEP {st}", "Bipolar offset for this step within the SEQ OCT range; centre none; quantised per QUANTIZE.", scale=BI)
    for tgt, lab in (("osc", f"OSC {s}"), ("sub1", "SUB 1"), ("sub2", "SUB 2")):
        btn(f"seq{s}.assign_{tgt}", f"seq{s}", f"SEQ {s} ASSIGN {lab}", f"Sequencer {s} moves {'VCO ' + str(s) + ' pitch (subs follow)' if tgt == 'osc' else 'the ' + lab + ' divisor'}.")
par("seq.oct", "seq1", "SEQ OCT", "enum", "Step range shared by both sequencers.", control="push_button", values=[{"value": "±5"}, {"value": "±2"}, {"value": "±1"}])
par("seq.oct_out_fixed", "seq1", "SEQ OCT hold: SEQ outputs at ±5", "boolean", "Hold SEQ OCT until it flashes: SEQ outputs always span ±5 while the VCOs follow SEQ OCT.", control="push_button", memory="global",
    note="Persistence across power cycles not stated.")
for n in (1, 2, 3, 4):
    par(f"rhythm{n}.div", f"rhythm{n}", f"RHYTHM {n}", "integer", "Tempo divisor: 1 (CW) to 16 (CCW).", range=DIV)
    btn(f"rhythm{n}.seq1", f"rhythm{n}", f"RHYTHM {n} SEQ 1", "Rhythm drives Sequencer 1.")
    btn(f"rhythm{n}.seq2", f"rhythm{n}", f"RHYTHM {n} SEQ 2", "Rhythm drives Sequencer 2.")
btn("transport.play", "transport", "PLAY", "Starts/stops sequencers, rhythm generators and CLOCK OUT.")
btn("transport.trigger", "transport", "TRIGGER", "EG on: restarts both EGs (not during attack). EG off: acts as a gate, holding the EGs at peak. EG held: no effect.")
btn("transport.reset", "transport", "RESET", "Resets sequencers to step 1 and rhythm generators to their start; held, it holds step 1 while EGs keep triggering.")
btn("transport.next", "transport", "NEXT", "Advances the sequencers one step without triggering the EGs (except while RESET is held).")
par("transport.eg", "transport", "EG", "enum", "Off: steps do not trigger EGs. On: steps trigger EGs. Held (long press, blinking): EGs held open at maximum.", control="push_button",
    values=[{"value": "off"}, {"value": "on"}, {"value": "held"}])
par("sys.fine_tune", "vco1", "Fine Tune", "continuous", "Overall tuning ±50 cents, stored; hold OSC 1 and OSC 2 until the QUANTIZE LEDs flash, set with TEMPO, exit with QUANTIZE.",
    physical={"min": -50, "max": 50, "unit": "cent"}, memory="global", access=[{"type": "gesture", "gesture": "hold SEQ 1 ASSIGN OSC 1 and SEQ 2 ASSIGN OSC 2, then turn TEMPO", "when": "any_time"}])
par("sys.rhythm_logic", "seq1", "Rhythm Generator Logic", "enum", "OR: a sequencer advances on any assigned rhythm. XOR: only when exactly one fires.", memory="global",
    values=[{"value": "or"}, {"value": "xor"}], default="or", access=[{"type": "midi", "message": "CC 113 (0-63 OR, 64-127 XOR)"}])
par("sys.note_priority", "midi", "Keyboard Note Priority", "enum", "Which held MIDI note the Subharmonicon follows (firmware 1.1.0).", memory="global",
    values=[{"value": "low"}, {"value": "high"}, {"value": "last"}], access=[{"type": "midi", "message": "CC 91"}], note="Default and CC value ranges not published in the sources found.")
par("sys.midi_channel", "midi", "MIDI Channel", "enum", "Receive channel 1-16 or all; set by SysEx.", memory="global", values=[{"value": "1..16"}, {"value": "all"}], default="1..16",
    access=[{"type": "sysex", "note": "SysEx files from moogmusic.com"}], note="Default channel 1.")
par("sys.midi_transport", "transport", "Play (MIDI Transport)", "boolean", "Respond to MIDI start/stop; set by SysEx.", memory="global", default=True, access=[{"type": "sysex", "note": "SysEx files from moogmusic.com"}])
D["parameters"] = P

# ======================================================================== ports (manual rows 1-8)
R = [("jack.vco1_in", "VCO 1", "in", "cv", "pitchbus.in", "1 V/oct for VCO 1, -5 to +5 V; normalled to VCO 2.", 1),
     ("jack.vco1_sub_in", "VCO 1 SUB", "in", "cv", "sub11.div_cv", "Divisor CV for both VCO 1 subs, -5 to +5 V (centre the SUB knobs).", 1),
     ("jack.vco1_pwm", "VCO 1 PWM", "in", "cv", "vco1.pwm", "PWM for VCO 1 and its subs (square selected), -5 to +5 V = 1-99 % duty; replaces the SUB 1 saw normal.", 1),
     ("jack.vca_out", "VCA OUT", "out", "audio", "out.modular", "Synth output at Eurorack level, 10 Vpp.", 1),
     ("jack.vco1_out", "VCO 1 OUT", "out", "audio", "vco1.out", "VCO 1, 10 Vpp.", 2),
     ("jack.sub11_out", "VCO 1 SUB 1 OUT", "out", "audio", "sub11.out", "VCO 1 SUB 1, 10 Vpp.", 2),
     ("jack.sub12_out", "VCO 1 SUB 2 OUT", "out", "audio", "sub12.out", "VCO 1 SUB 2, 10 Vpp.", 2),
     ("jack.vca_in", "VCA", "in", "cv", "vca.cv", "Volume CV, 0 to +8 V, summed with the VCA EG.", 2),
     ("jack.vco2_in", "VCO 2", "in", "cv", "vco2.pitch_cv", "1 V/oct for VCO 2, -5 to +5 V; breaks the normal from VCO 1.", 3),
     ("jack.vco2_sub_in", "VCO 2 SUB", "in", "cv", "sub21.div_cv", "Divisor CV for both VCO 2 subs, -5 to +5 V.", 3),
     ("jack.vco2_pwm", "VCO 2 PWM", "in", "cv", "vco2.pwm", "PWM for VCO 2 and its subs (square selected), -5 to +5 V; replaces the SUB 1 saw normal.", 3),
     ("jack.vca_eg_out", "VCA EG OUT", "out", "cv", "vca_eg.out", "VCA envelope, 0 to +8 V.", 3),
     ("jack.vco2_out", "VCO 2 OUT", "out", "audio", "vco2.out", "VCO 2, 10 Vpp.", 4),
     ("jack.sub21_out", "VCO 2 SUB 1 OUT", "out", "audio", "sub21.out", "VCO 2 SUB 1, 10 Vpp.", 4),
     ("jack.sub22_out", "VCO 2 SUB 2 OUT", "out", "audio", "sub22.out", "VCO 2 SUB 2, 10 Vpp.", 4),
     ("jack.cutoff_in", "CUTOFF", "in", "cv", "vcf.cutoff_cv", "Cutoff CV, -5 to +5 V, up to ±5 octaves.", 4),
     ("jack.play_in", "PLAY", "in", "gate", "transport.play_in", "Gate 0-10 V: rising edge plays, falling edge stops; the button overrides.", 5),
     ("jack.reset_in", "RESET", "in", "gate", "transport.reset_in", "Trigger resets; a held gate holds step 1 (EGs keep triggering).", 5),
     ("jack.trigger_in", "TRIGGER", "in", "gate", "transport.trig_in", "Rising edge triggers both EGs (not during attack).", 5),
     ("jack.vcf_eg_out", "VCF EG OUT", "out", "cv", "vcf_eg.out", "Filter envelope, 0 to +8 V.", 5)]
R += [(f"jack.rhythm{n}_in", f"RHYTHM {n}", "in", "cv", f"rhythm{n}.cv", f"Divisor CV for Rhythm {n}, -5 to +5 V (centre the knob).", 6) for n in (1, 2, 3, 4)]
R += [("jack.seq1_out", "SEQ 1", "out", "cv", "seq1.cv", "Sequencer 1 step CV, -5 to +5 V, following QUANTIZE and SEQ OCT unless decoupled.", 7),
      ("jack.seq1_clk", "SEQ 1 CLK", "out", "clock", "seq1.clk", "Sequencer 1's clock, 0 to +5 V.", 7),
      ("jack.seq2_out", "SEQ 2", "out", "cv", "seq2.cv", "Sequencer 2 step CV, -5 to +5 V.", 7),
      ("jack.seq2_clk", "SEQ 2 CLK", "out", "clock", "seq2.clk", "Sequencer 2's clock, 0 to +5 V.", 7),
      ("midi.in", "MIDI IN", "in", "midi", "midi.in", "MIDI via the Type A DIN-to-3.5 mm adapter; LED shows activity.", 8),
      ("jack.clock_in", "CLOCK", "in", "clock", "clock.ext_in", "External clock, rising edge 0-10 V; overrides TEMPO.", 8),
      ("jack.clock_out", "CLOCK OUT", "out", "clock", "clock.out", "Current clock (internal, external or MIDI), 0-10 V, only while playing.", 8),
      ("jack.trigger_out", "TRIGGER OUT", "out", "gate", "transport.eg_trig", "1 ms, 5 V pulse each time the EGs are triggered.", 8)]
for jid, lab, d, sig, node, fn, row in R:
    jack(jid, lab, d, sig, node, fn, manual_ref=f"patchbay row {row}")
jack("jack.audio_out", "AUDIO OUT / headphones", "out", "audio", "out.main", "1/4 inch: TS instrument cable or TRS headphones (mono to both ears). Not for balanced TRS line use.", location="rear", connector="1/4 inch jack")
jack("power.dc", "12 VDC", "in", "power", None, "12 V DC 1,200 mA centre-positive adapter; no power switch. Eurorack: 360 mA max from +12 V only.", location="rear", connector="DC barrel")
D["ports"] = J

# ======================================================================== connections
con("clock.out", "rhythm1.clock", "clock")
for n in (2, 3, 4):
    con("clock.out", f"rhythm{n}.clock", "clock")
for n in (1, 2, 3, 4):
    con(f"rhythm{n}.out", "seq1.clock", "clock", eq(f"rhythm{n}.seq1", True), note="Combined OR or XOR per Rhythm Generator Logic.")
    con(f"rhythm{n}.out", "seq2.clock", "clock", eq(f"rhythm{n}.seq2", True))
con("midi.clock", "clock.midi_in", "clock", note="MIDI clock overrides CLOCK input and TEMPO.")
con("transport.run", "clock.run", "gate")
con("transport.reset", "seq1.reset", "gate", note="RESET also returns the rhythm generators to their starting phase.")
con("transport.reset", "seq2.reset", "gate")
con("seq1.clk", "transport.step1", "gate", eq("transport.eg", "on"))
con("seq2.clk", "transport.step2", "gate", eq("transport.eg", "on"))
con("midi.gate", "transport.midi_gate", "gate", confidence="inferred", note="The EG text says triggers or gates may come from an external keyboard via MIDI; the note-to-gate path is not described.")
con("transport.eg_trig", "vcf_eg.gate", "gate")
con("transport.eg_trig", "vca_eg.gate", "gate")
con("pitchbus.to_vco1", "vco1.pitch_cv", "cv")
norm("pitchbus.to_vco2", "vco2.pitch_cv", "jack.vco2_in")
con("midi.note", "vco1.pitch_cv", "cv", note="Notes as offsets from C4; with VCO FREQ fully CCW they play unchanged.")
con("midi.note", "vco2.pitch_cv", "cv", confidence="inferred", note="The manual implies both VCOs respond (both FREQ knobs at C4).")
for s in (1, 2):
    con(f"seq{s}.cv", f"vco{s}.pitch_cv", "cv", eq(f"seq{s}.assign_osc", True))
    con(f"seq{s}.cv", f"sub{s}1.div_cv", "cv", eq(f"seq{s}.assign_sub1", True))
    con(f"seq{s}.cv", f"sub{s}2.div_cv", "cv", eq(f"seq{s}.assign_sub2", True))
for v in (1, 2):
    for u in (1, 2):
        con(f"vco{v}.sub_src", f"sub{v}{u}.src", "sync", note="The sub divides the VCO's frequency.")
    norm(f"sub{v}1.out", f"vco{v}.pwm", f"jack.vco{v}_pwm", "cv_or_audio", note="Audible only with WAVE in the middle position.")
    con(f"vco{v}.out", f"mixer.vco{v}", amount=f"mix.vco{v}")
    con(f"sub{v}1.out", f"mixer.sub{v}1", amount=f"mix.sub{v}1")
    con(f"sub{v}2.out", f"mixer.sub{v}2", amount=f"mix.sub{v}2")
con("mixer.out", "vcf.in")
con("vcf_eg.out", "vcf.cutoff_cv", "cv", amount="vcf_eg.amount")
con("vcf.out", "vca.in")
con("vca_eg.out", "vca.cv", "cv", amount="vca.volume")
con("vca.out", "out.in")
D["connections"] = C

# ======================================================================== indicators, behaviours
D["indicators"] = [
    {"id": "step_leds", "module": "seq1", "label": "STEP LEDs (2 x 4)", "kind": "led", "function": "Current step of each sequencer."},
    {"id": "quantize_leds", "module": "vco1", "label": "QUANTIZE LEDs (12-ET, 8-ET, 12-JI, 8-JI)", "kind": "led", "function": "Current scale; all flashing in Fine Tune mode; flashing for unquantised SEQ outputs."},
    {"id": "seq_oct_leds", "module": "seq1", "label": "SEQ OCT LEDs (±5, ±2, ±1)", "kind": "led", "function": "Current range; flashing when SEQ outputs are fixed at ±5."},
    {"id": "midi_led", "module": "midi", "label": "MIDI IN", "kind": "led", "function": "MIDI data received."},
    {"id": "button_leds", "module": "transport", "label": "button LEDs", "kind": "led", "function": "Lit for active ASSIGN, rhythm SEQ, PLAY and EG buttons; EG blinks when held."},
]
B = [
    ("Signal path", ["vco1", "vco2", "mixer", "vcf", "vca", "out"], "VCO 1, its two subs, VCO 2 and its two subs are mixed into the ladder filter, then the VCA (VCA EG at VOLUME), then the audio output."),
    ("Subharmonics", ["sub11", "sub12", "sub21", "sub22"], "Each sub plays its VCO's frequency divided by 1-16 (unison fully CW). Subs follow their VCO's pitch and waveform; they are not accurate above about 10 kHz."),
    ("Waveform switch", ["vco1", "vco2"], "UP: square on VCO and subs. MIDDLE: VCO pulse width-modulated by SUB 1's saw (an extra pitched component even with SUB 1 silent), subs saw. DOWN: saw on all. A cable in VCO PWM replaces the SUB 1 normal."),
    ("Quantise", ["vco1", "vco2", "seq1", "seq2"], "Shared: off, 12-ET, 8-ET, 12-JI, 8-JI. Steps the FREQ knobs and sequencer steps; JI chords lose the beating of ET minor chords."),
    ("Sequencers", ["seq1", "seq2"], "Sequencer 1 belongs to VCO 1, Sequencer 2 to VCO 2. Each step adds a bipolar offset (±1, ±2 or ±5 octaves) to the VCO pitch (subs follow) and/or to each sub's divisor, per the ASSIGN buttons. A sequencer only moves when at least one rhythm generator drives it."),
    ("Rhythm generators", ["rhythm1", "rhythm2", "rhythm3", "rhythm4", "clock"], "Each divides the tempo by 1-16 and drives Sequencer 1, 2 or both. Several on one sequencer make a polyrhythm that repeats when they meet on a downbeat. OR advances on any; XOR only when exactly one fires (CC 113)."),
    ("Clock sources", ["clock", "midi"], "TEMPO 20-3,000 BPM at 1 PPQ; a CLOCK input overrides it; MIDI clock overrides both and runs at 4 PPQ. CLOCK OUT sends the current clock only while playing."),
    ("Envelopes", ["vcf_eg", "vca_eg", "transport"], "Attack/decay, attack 1 ms-10 s, decay 5 ms-10 s. A trigger runs attack then decay; a gate holds the peak. Neither restarts during its attack. EG mode: off (steps do not trigger), on, or held open."),
    ("Transport", ["transport"], "PLAY runs sequencers, rhythms and CLOCK OUT. RESET returns everything to the start (held: holds step 1 while EGs keep firing; NEXT then steps). NEXT advances without triggering. TRIGGER restarts EGs (EG on) or gates them (EG off)."),
    ("Normals", ["pitchbus", "vco2", "vco1"], "The VCO 1 input also drives VCO 2 until VCO 2 is patched. SUB 1's saw modulates the VCO's pulse width until VCO PWM is patched."),
    ("Pitch limits", ["vco1", "vco2"], "Sequencers cannot push the VCOs above about 10 kHz; for the full ±5 octave range set FREQ fully CCW. CV inputs can still drive the VCOs higher."),
    ("MIDI", ["midi", "vco1"], "Notes are offsets from C4 (FREQ fully CCW plays them as sent). 14-bit CCs move VCO pitch ±2.5 octaves and EG times; 7-bit CCs set the four sub divisors (inverted: low values = 16). Channel and transport by SysEx."),
    ("Sync with other Moogs", ["clock"], "CLOCK OUT (or TRIGGER, SEQ CLK outputs) clocks a DFAM; a Mother-32 ASSIGN output set to clock drives CLOCK IN."),
    ("Eurorack", ["out"], "Removes from its case as a 60HP module (26 mm deep); 360 mA maximum from +12 V, no -12 V."),
    ("Firmware 1.1.0", ["midi", "transport", "seq1", "seq2"], "March 2022: MIDI notes transpose running sequences (for following key changes from a keyboard); note priority low/high/last by CC 91; MIDI pitch bend; TRIGGER button and input ignored while EG is held (previously they dropped the EGs to zero); SEQ 1/2 CLK outputs now in phase with the clock (previously one pulse late)."),
    ("Fine tune", ["vco1", "vco2"], "Hold OSC 1 and OSC 2 until the QUANTIZE LEDs flash; TEMPO sets ±50 cents; QUANTIZE exits; the value is kept at power-up."),
]
D["behaviours"] = [{"id": f"b{i + 1:02d}", "name": n, "applies_to": a, "rule": r} for i, (n, a, r) in enumerate(B)]

# ======================================================================== example patches (cables read from patch sheets, pp.45-49)
EX = [
    ("aquatic_chords", "Aquatic Chords", 45, [["jack.seq2_out", "jack.vco1_in"], ["jack.seq1_out", "jack.vco2_in"], ["jack.vca_eg_out", "jack.rhythm2_in"], ["jack.vcf_eg_out", "jack.rhythm1_in"],
                                             ["jack.seq1_clk", "jack.trigger_in"]], "Sequencers cross-patched to the other VCO; envelopes modulate rhythm divisors."),
    ("mellow_harmonies", "Mellow Harmonies", 45, [["jack.seq1_out", "jack.vco1_pwm"], ["jack.seq2_out", "jack.cutoff_in"]], "Sequencer 1 sets pulse width; Sequencer 2 moves the filter."),
    ("slip_fall", "Slip & Fall", 46, [["jack.seq1_out", "jack.vco2_in"], ["jack.seq2_out", "jack.cutoff_in"]], "Sequencer pitches are suggestions."),
    ("point_zero", "Point Zero", 46, [["jack.seq1_out", "jack.rhythm1_in"], ["jack.seq2_out", "jack.rhythm2_in"], ["jack.seq1_clk", "jack.cutoff_in"], ["jack.seq2_clk", "jack.vca_in"]],
     "Tune SEQ 1 and 2; tune all subs to taste; VCF ATTACK sets the sweep length."),
    ("three_hands", "Three Hands on the Wheel", 47, [["jack.vcf_eg_out", "jack.rhythm1_in"]], "Sequencer pitches are suggestions."),
    ("bateria", "Bateria", 47, [["jack.seq2_out", "jack.vco1_pwm"], ["jack.seq1_out", "jack.cutoff_in"]], "Kick tuning on CUTOFF; VCF DECAY and EG AMT change its flavour."),
    ("spiral_ways", "Spiral Ways", 48, [["jack.vca_eg_out", "jack.cutoff_in"]], "VCO 1 SUB 1 to a fifth, VCO 2 SUB 2 to a major third; VCF ATTACK for crescendo depth."),
    ("star_gate", "Star-Gate", 48, [["jack.vca_eg_out", "jack.cutoff_in"], ["jack.vcf_eg_out", "jack.rhythm3_in"]], "High sequences; vary rhythms 2-4 on SEQ 2 and VCA DECAY; ride the mixer."),
    ("poly_rock", "Poly Rock", 49, [["jack.clock_out", "jack.vca_in"]], "CLOCK OUT to VCA IN for 'drums' (from the notes; the drawing shows no cable). Tune subs to chord shapes."),
]
D["example_patches"] = [{"id": i, "name": n, "source": f"manual p.{p}", "cords": c, "description": d + " Knob and button settings are drawn, not transcribed.", "confidence": "stated"} for i, n, p, c, d in EX]
D["example_patches"].append({"id": "cloud_path", "name": "Cloud Path", "source": "manual p.49", "settings": {"rhythm3.seq1": True},
                             "description": "No cables. Tune SEQ 1 and 2 and the subs with levels open, then fade levels in during playback; RHYTHM 3 SEQ 1 for double time.", "confidence": "stated"})
D["example_patches"].append({"id": "exploration", "name": "Exploring your Subharmonicon", "source": "manual pp.12-15",
                             "settings": {"transport.eg": "held", "mix.vco1": 5, "vco.quantize": "12-ET", "seq1.assign_osc": True, "rhythm1.seq1": True, "seq.oct": "±2"},
                             "description": "Guided start: hold EG, half VCO 1 level, 12-ET, sequence VCO 1 with Rhythm 1, then release EG, PLAY, and add RHYTHM 2 SEQ 1 for a polyrhythm.", "confidence": "stated"})

D["midi"] = {
    "receives": [{"message": "note_on", "note": "offset from C4 on the VCOs; transposes running sequences (firmware 1.1.0)"}, {"message": "pitch_bend", "note": "firmware 1.1.0 (Rubadub)"}, {"message": "clock", "note": "overrides internal and analogue clock; 4 PPQ"},
                 {"message": "start"}, {"message": "stop"}, {"message": "control_change", "note": "see cc_map"}, {"message": "sysex", "note": "MIDI channel and transport settings (files from moogmusic.com)"}],
    "transmits": [],
    "cc_map": {"4": "vco1.freq (MSB)", "36": "vco1.freq (LSB)", "103": "sub11.div", "104": "sub12.div", "12": "vco2.freq (MSB)", "44": "vco2.freq (LSB)", "105": "sub21.div", "106": "sub22.div",
               "23": "vcf_eg.attack (MSB)", "55": "vcf_eg.attack (LSB)", "24": "vcf_eg.decay (MSB)", "56": "vcf_eg.decay (LSB)", "28": "vca_eg.attack (MSB)", "60": "vca_eg.attack (LSB)",
               "29": "vca_eg.decay (MSB)", "61": "vca_eg.decay (LSB)", "91": "sys.note_priority", "113": "sys.rhythm_logic"},
    "cc_map_note": "VCO frequency CCs add ±2.5 octaves to the knob; sub and EG CCs replace the knob until it is moved. Sub CCs are inverted in eighths (0-7 = 16 ... 120-127 = 1).",
    "channel_note": "Channel 1 by default, 1-16 or all by SysEx.",
}
D["specifications"] = {
    "sources": "VCO 1, SUB 1, SUB 2 / VCO 2, SUB 1, SUB 2", "vco_range_hz": [262, 4186], "sub_divisors": [1, 16],
    "filter": "self-oscillating ladder, low-pass, 4-pole (-24 dB/octave), 20 Hz to 20 kHz", "envelopes": {"attack_s": [0.001, 10], "decay_s": [0.005, 10]},
    "sequencers": {"count": 2, "steps": 4, "quantize": ["12-ET", "8-ET", "12-JI", "8-JI"], "octave_ranges": ["±1", "±2", "±5"]},
    "rhythm_generators": {"count": 4, "divisors": [1, 16]}, "clock_bpm": [20, 3000],
    "patchbay": {"jacks": 32, "inputs": 17, "outputs": 15, "connector": "3.5 mm"},
    "levels": {"audio_vpp": 10, "eg_out_v": [0, 8], "seq_out_v": [-5, 5], "seq_clk_v": [0, 5], "clock_v": [0, 10], "trigger_out": "5 V, 1 ms", "cv_in_v": [-5, 5], "vca_in_v": [0, 8]},
    "rear": {"audio": "1/4 inch TRS headphone or TS instrument", "security": "Kensington slot"},
    "dimensions_in": {"width": 12.57, "depth": 4.21, "height": 5.24}, "weight_lb": 3.5,
    "power": {"adapter": "100-240 V AC in, +12 V DC 1,200 mA out, centre positive", "typical_w": 4.8},
    "eurorack": {"width_hp": 60, "depth_mm": 26, "current_ma_plus12": 360, "minus12": "not used"},
}
D["omitted_from_source"] = [
    "knob and button settings drawn on the ten preset patch sheets (cables are transcribed)", "history and introductory theory beyond what behaviours need", "safety, warranty and accessory lists",
]
D["not_in_source"] = [
    "how MIDI notes gate the envelopes (not found in research either)", "whether MIDI notes reach both VCOs (implied by the manual and the transpose feature)", "the knob panel numbering",
    "the exact 8-JI ratios (C major root confirmed; ratios inferred from the manual's example)", "pitch bend range", "CC 91 value ranges for each priority",
    "whether the SEQ output decoupling settings persist at power-up (a forum comment says 1.1.0 fixed settings not always being stored at power-off)", "XOR behaviour with three or more rhythms on one sequencer",
    "Research filled: 8-step scales as C major with a fixed C root, firmware 1.1.0 changes (note transpose, note priority CC 91, pitch bend, TRIGGER while held, SEQ CLK phase).",
]
D["source_inconsistencies"] = [
    "VCA DECAY is introduced as 'The VCF DECAY knob determines...' (p.25).",
    "VCF EG AMT inverse values are said to open the filter on 'the Release stage'; the envelope has attack and decay only (p.24).",
    "8-ET and 8-JI are called 'Diatonic (8-step)' scales; a diatonic scale has seven notes (eight with the octave) (p.21).",
    "Poly Rock's notes say 'Patch CLOCK OUT to VCA IN', but its drawing shows no cable (p.49).",
    "Poly Rock's notes refer to 'SUB OSC 1, 2, 3, and 4'; the panel names them VCO 1 SUB 1/2 and VCO 2 SUB 1/2 (p.49).",
    "Spiral Ways' notes say 'SUB VCO 1 FREQ 1' and 'SUB VCO 2 SUB 2' for VCO 1 SUB 1 and VCO 2 SUB 2 (p.48).",
    "The XOR description covers two rhythm generators ('if both are true'); behaviour with more is not stated (p.44).",
]
D["modelling_gaps"] = [
    {"topic": "Rhythm combination", "detail": "OR/XOR combining of rhythm clocks into each sequencer is a global setting, recorded on the connections' note rather than as a combine property."},
    {"topic": "Shared controls", "detail": "QUANTIZE and SEQ OCT are shared by both oscillators and sequencers; they are attached to vco1 and seq1 with that noted."},
    {"topic": "Sub divisor CV", "detail": "Each VCO SUB input moves both of that VCO's subs; it is attached to SUB 1's node with the dual role in the port description."},
]

order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "example_patches", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/moog-subharmonicon_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written", len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")
