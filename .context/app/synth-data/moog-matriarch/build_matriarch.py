#!/usr/bin/env python3
"""Assemble the Moog Matriarch device file (schema 0.12.0).

A 4-note paraphonic semi-modular: four VCOs (921 lineage) with sync chain, noise and
instrument input into a CP3-style mixer with per-oscillator gates, two 904A-style
ladder filters (series HP/LP, stereo LP/LP, parallel HP/LP), two ADSRs (911), two VCAs
(902), stereo BBD delay, modulation oscillator with S/H, a patchable LFO, three
voltage-controlled attenuators, two mults, arpeggiator and 12-sequence step sequencer,
and 90 patch points (49 in, 33 out, 8 mult jacks).

Source: Moog Matriarch owner's manual. Normals are as documented.
"""
import json

S10 = {"min": 0, "max": 10}
BI = {"min": -5, "max": 5}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="none", control="knob", cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control}]
    if cc:
        acc = acc + [{"type": "midi", "message": cc}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, **kw)


def sw(id, module, label, fn, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control=control, values=[{"value": v} for v in vals], **kw)


def btn(id, module, label, fn, **kw):
    par(id, module, label, "boolean", fn, control="push_button", **kw)


def gset(id, module, label, fn, vals, key, default=None, sysex=None):
    acc = [{"type": "gesture", "gesture": f"Global Settings (hold SHIFT + SYNC ENABLE), then {key}; white keys set the value", "when": "any_time"}]
    if sysex is not None:
        acc.append({"type": "sysex", "message": f"F0 04 17 23, parameter {sysex}"})
    kw = {"default": default} if default is not None else {}
    par(id, module, label, "enum", fn, memory="global", values=[{"value": v} for v in vals], access=acc, **kw)


def jack(id, label, direction, signal, node, fn, location=None, connector="3.5 mm TS", **kw):
    j = {"id": id, "label": label, "location": location or ("patch_in" if direction == "in" else "patch_out"), "direction": direction, "signal": signal,
         "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "cv", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "normalled" if "broken_by" in kw else ("switched" if when else "fixed")}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


D["device"] = {
    "id": "moog-matriarch", "manufacturer": "Moog Music", "model": "Matriarch",
    "category": "4-note paraphonic semi-modular analogue synthesizer, 49 keys, with stereo analogue delay, arpeggiator and sequencer",
    "based_on": "Moog modular circuits: oscillators from the Minimoog Voyager (921 lineage), mixer after the CP3, filters after the 904A, envelopes after the 911, VCAs after the 902, delay after the Moog 500 Series analog delay; released 2019.",
    "sources": [{"id": "manual", "title": "Moog Matriarch Owner's Manual", "kind": "user_manual", "file": "Moog_Matriarch_Manual.pdf", "pages": 92,
                 "note": "Every module with its patch points and normals, paraphony, rear panel, global settings, MIDI CC and SysEx documentation, specifications."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 4, "polyphony_mode": "1-note mono, 2-note paraphonic (Osc 1+2, Osc 3+4) or 4-note paraphonic (one oscillator per note), shared filter and VCA path",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No sound memory. Twelve sequences (three banks of four, up to 256 steps) and global settings are retained.",
    "semi_modular": True, "panel_counts": {"keys": 49, "patch_points": 90, "patch_inputs": 49, "patch_outputs": 33, "mult_jacks": 8},
    "summary": ("Four VCOs (triangle, saw, square, narrow pulse; 16'-2'; Osc 2-4 detune and hard-sync to the previous one) with pitch, linear FM and PWM inputs; white noise and a rear "
                "instrument input into a DC-coupled mixer with per-oscillator gates for paraphony. Two ladder filters share CUTOFF (SPACING offsets VCF 1) and run HP/LP in series, LP/LP "
                "in stereo or HP/LP in parallel. Two ADSRs, two VCAs (AMP ENV, SPLIT or DRONE), stereo BBD delay. Modulation oscillator (six waves, to 1.3 kHz) with noise and S/H outputs, "
                "plus a separate triangle/square LFO, three voltage-controlled inverting attenuators and two mults. Arpeggiator and sequencer. Plays without patching; 90 jacks extend it."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard, LHC and voice assigner", "KEYBOARD / LEFT-HAND CONTROLLER / PARAPHONY",
    "49-key Fatar with velocity and channel aftertouch (not hard-wired: use the rear jacks or MIDI). Assigns notes to oscillators by VOICE MODE and opens each oscillator's mixer gate. Glide, octave transpose, wheels.",
    ["kbd.midi_in", "kbd.seq_in", "kbd.sustain"],
    ["kbd.cv1", "kbd.cv2", "kbd.cv3", "kbd.cv4", "kbd.gate1", "kbd.gate2", "kbd.gate3", "kbd.gate4", "kbd.cv", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend"],
    {"keys": 49})
mod("pitchbus", "cv_source_selector", "Oscillator pitch inputs", "OSCILLATORS",
    "The four PITCH IN jacks chain: a signal at Osc 1 PITCH IN reaches Osc 1-4, until a later PITCH IN jack is patched, which takes over from there on.",
    ["pitchbus.in1", "pitchbus.in2", "pitchbus.in3", "pitchbus.in4"], ["pitchbus.out1", "pitchbus.out2", "pitchbus.out3", "pitchbus.out4"])
for n in range(1, 5):
    mod(f"osc{n}", "oscillator", f"Oscillator {n}", "OSCILLATORS",
        f"VCO: triangle, sawtooth, square or narrow pulse; 16'-2'." + (f" FREQUENCY detunes ±7 semitones from Osc 1; hard sync to Osc {n - 1}." if n > 1 else " Sets the reference pitch for Osc 2-4."),
        [f"osc{n}.pitch_cv", f"osc{n}.lin_fm", f"osc{n}.pwm"] + ([f"osc{n}.sync_in"] if n > 1 else []), [f"osc{n}.out"])
mod("noise", "noise", "White noise", "MIXER / MODULATION", "White noise with a 1-pole high-pass colour filter (global setting); into the mixer and to NOISE OUT.", [], ["noise.out"])
mod("instr", "preamp", "Instrument input", "rear panel", "Instrument-level input with +20 dB gain, straight into the mixer.", ["instr.in"], ["instr.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Five levels (noise, Osc 1-4) plus the instrument input; DC coupled; overdrives above 11 o'clock. Oscillator channels have gates that mute unplayed oscillators in paraphonic modes.",
    ["mixer.noise", "mixer.in1", "mixer.in2", "mixer.in3", "mixer.in4", "mixer.ext", "mixer.gate1", "mixer.gate2", "mixer.gate3", "mixer.gate4"], ["mixer.out"])
mod("cutbus", "cv_source_selector", "Cutoff inputs", "FILTERS", "CUTOFF 1 IN is normalled to CUTOFF 2 IN, so one patch moves both filters until CUTOFF 2 IN is used.",
    ["cutbus.in1", "cutbus.in2"], ["cutbus.out1", "cutbus.out2"])
mod("vcf1", "filter", "VCF 1", "FILTERS", "Moog 24 dB/oct ladder, high-pass (series, parallel) or low-pass (stereo); cutoff = CUTOFF + SPACING; resonance 1 self-oscillates above about 3 o'clock.",
    ["vcf1.in", "vcf1.cutoff_cv"], ["vcf1.out"], {"slope_db_per_oct": 24, "cutoff_hz": [20, 20000]})
mod("vcf2", "filter", "VCF 2", "FILTERS", "Moog 24 dB/oct ladder, always low-pass; fed from the mixer or from VCF 1 (series).", ["vcf2.in", "vcf2.cutoff_cv"], ["vcf2.out"],
    {"slope_db_per_oct": 24, "cutoff_hz": [20, 20000]})
mod("filtsum", "summer", "Filter routing", "FILTERS", "Sums VCF 1 and VCF 2 in parallel mode; passes the routed filter outputs to the VCAs.", ["filtsum.a", "filtsum.b"], ["filtsum.out"])
mod("env_f", "envelope", "Filter envelope", "ENVELOPE GENERATORS", "ADSR, 2 ms-10 s stages, 0 to +8 V; also controls VCA 1 in SPLIT. ENV END OUT goes high when the envelope finishes.",
    ["env_f.trig"], ["env_f.out", "env_f.end"], {"time_s": [0.002, 10]})
mod("env_a", "envelope", "Amplitude envelope", "ENVELOPE GENERATORS", "ADSR, 2 ms-10 s; controls both VCAs in AMP ENV, VCA 2 in SPLIT.", ["env_a.trig"], ["env_a.out", "env_a.end"], {"time_s": [0.002, 10]})
for n in (1, 2):
    mod(f"vca{n}", "vca", f"VCA {n}", "OUTPUT", f"{'Left' if n == 1 else 'Right'} channel VCA; level from an envelope (per VCA MODE) times VCA {n} CV IN, or the CV alone in DRONE.",
        [f"vca{n}.in", f"vca{n}.cv", f"vca{n}.env"], [f"vca{n}.out"])
mod("ref", "cv_source_selector", "Internal references", "(internal)", "Default drone voltage normalled to VCA 1/2 CV IN in DRONE, and +8 V normalled to each attenuator input.", [], ["ref.drone", "ref.v8"])
mod("dly", "delay", "Stereo delay", "STEREO DELAY", "Two BBD delays: 35-780 ms (longer by tap or patching), SPACING offsets Delay 1, feedback to self-oscillation, ping pong, sync or tap tempo; dark or bright tone.",
    ["dly.in1", "dly.in2", "dly.fb_cv", "dly.fb2_cv", "dly.mix_cv", "dly.time1_cv", "dly.time2_cv", "dly.sync"], ["dly.out1", "dly.out2"], {"time_ms": [35, 780]})
mod("out", "output", "Output", "OUTPUT / rear panel", "MIX crossfades dry VCA and wet delay per side; MAIN VOLUME to MAIN OUT L/R (L mono when R is unplugged); EURO OUT and headphones bypass MAIN VOLUME.",
    ["out.dry1", "out.dry2", "out.wet1", "out.wet2"], ["out.main_l", "out.main_r", "out.euro_l", "out.euro_r", "out.phones"])
mod("modosc", "lfo", "Modulation oscillator", "MODULATION", "0.07 Hz-1.3 kHz; sine, sawtooth, ramp, square (uni or bipolar), staircase (stepped triangle at the arp clock) or smooth random. Routed by the mod wheel to pitch, cutoff and pulse width.",
    ["modosc.rate_cv", "modosc.sync", "modosc.clock"], ["modosc.out"], {"rate_hz": [0.07, 1300]})
mod("snh", "sample_hold", "Sample and hold", "MODULATION", "Samples the noise at the start of each modulation cycle; no internal routing.", ["snh.in", "snh.clock"], ["snh.out"])
for n in (1, 2, 3):
    mod(f"att{n}", "attenuator", f"Attenuator {n}", "UTILITIES (1)" if n < 3 else "UTILITIES (2)",
        "Inverting, voltage-controlled: centre fully attenuated, clockwise towards unity, anticlockwise inverted; +8 V normalled to the input (a DC source unpatched). Usable as a ring modulator.",
        [f"att{n}.in", f"att{n}.cv"], [f"att{n}.out"])
for n in (1, 2):
    mod(f"mult{n}", "mult", f"Mult {n}", f"UTILITIES ({n})", "Four unbuffered parallel jacks; also passively mixes outputs.", [f"mult{n}.in"], [f"mult{n}.out"])
mod("lfo2", "lfo", "Patchable LFO", "UTILITIES (2)", "Triangle and square at once, 0.07-520 Hz (about 620 Hz with CV).", ["lfo2.rate_cv"], ["lfo2.tri", "lfo2.square"], {"rate_hz": [0.07, 520]})
mod("arp", "sequencer", "Arpeggiator / sequencer", "ARP / SEQ", "Arpeggiator (order, forward/backward, random; 1-3 octaves) and 12 sequences of up to 256 steps (up to four notes, rest, tie, up to 8 ratchets per step); 20-280 BPM, tap, MIDI or clock.",
    ["arp.rate_cv", "arp.clock_in", "arp.on_off", "arp.reset"], ["arp.notes", "arp.cv", "arp.gate", "arp.velocity", "arp.clock_out"], {"tempo_bpm": [20, 280], "sequences": 12, "steps": 256})
mod("exp", "manual_controller", "Expression pedal", "rear panel", "Expression pedal (e.g. EP-3) scaled to 0-8 V at EXP CV OUT.", ["exp.in"], ["exp.out"])

# ---------------------------------------------------------------- parameters
for n in range(1, 5):
    sw(f"osc{n}.octave", f"osc{n}", f"OCTAVE (Osc {n})", "Footage.", ["16'", "8'", "4'", "2'"], "rotary_switch")
    sw(f"osc{n}.wave", f"osc{n}", f"WAVEFORM (Osc {n})", "Waveform.", ["triangle", "sawtooth", "square", "narrow_pulse"], "rotary_switch")
    if n > 1:
        knob(f"osc{n}.frequency", f"osc{n}", f"FREQUENCY (Osc {n})", "Detune from Osc 1, ±7 semitones by default (global range 0-24); much wider when synced.", panel_scale={"min": -7, "max": 7},
             cc=f"CC {14 + n}:{46 + n}")
        btn(f"osc{n}.sync", f"osc{n}", f"{n - 1} > {n} SYNC", f"Hard-syncs Osc {n} to Osc {n - 1} (needs SYNC ENABLE).", cc=f"CC {79 + n}")
btn("osc.sync_enable", "osc1", "SYNC ENABLE", "Master enable for the individual sync buttons; also enters Global Settings with SHIFT.", cc="CC 80")
par("osc.fine_tune", "osc1", "FINE TUNE", "continuous", "Global tuning ±1 semitone (rear panel).", access=[{"type": "rear_panel", "control": "knob"}], panel_scale=BI)
for k, lab in (("noise", "NOISE"), ("osc1", "OSCILLATOR 1"), ("osc2", "OSCILLATOR 2"), ("osc3", "OSCILLATOR 3"), ("osc4", "OSCILLATOR 4")):
    knob(f"mixer.{k}", "mixer", lab, f"{lab.title()} level into the filters; overdrives above 11 o'clock.")
knob("vcf.cutoff", "vcf2", "CUTOFF", "Cutoff of both filters, 20 Hz-20 kHz.", physical={"min": 20, "max": 20000, "unit": "Hz"})
sw("vcf.mode", "vcf2", "FILTER MODE", "Filter configuration.", ["hp_lp_series", "lp_lp_stereo", "hp_lp_parallel"])
knob("vcf.spacing", "vcf1", "SPACING", "Offsets VCF 1 cutoff above or below VCF 2.", panel_scale=BI)
knob("vcf1.resonance", "vcf1", "RESONANCE 1", "VCF 1 resonance; self-oscillates above about 3 o'clock.")
knob("vcf2.resonance", "vcf2", "RESONANCE 2", "VCF 2 resonance.")
knob("vcf.env_amt", "vcf2", "ENVELOPE AMT", "Bipolar filter envelope depth on both cutoffs.", panel_scale=BI)
knob("vcf.kb_tracking", "vcf2", "KB TRACKING", "Keyboard tracking; maximum is 1 V/oct.")
for e, lab in (("env_f", "FILTER"), ("env_a", "AMPLITUDE")):
    knob(f"{e}.attack", e, f"{lab} ATTACK", "2 ms-10 s.", physical={"min": 0.002, "max": 10, "unit": "s"})
    knob(f"{e}.decay", e, f"{lab} DECAY", "2 ms-10 s.", physical={"min": 0.002, "max": 10, "unit": "s"})
    par(f"{e}.sustain", e, f"{lab} SUSTAIN", "continuous", "Sustain level (slider).", control="fader", panel_scale=S10)
    knob(f"{e}.release", e, f"{lab} RELEASE", "2 ms-10 s.", physical={"min": 0.002, "max": 10, "unit": "s"})
knob("out.main_volume", "out", "MAIN VOLUME", "Level at MAIN OUT L/R only.")
sw("vca.mode", "vca1", "VCA MODE", "AMP ENV: amp envelope on both VCAs. SPLIT: filter envelope on VCA 1, amp envelope on VCA 2. DRONE: a fixed voltage (or VCA CV IN) sets the level.",
   ["amp_env", "split", "drone"])
knob("dly.time", "dly", "TIME", "35-780 ms, or divisions when synced.", physical={"min": 0.035, "max": 0.78, "unit": "s"}, cc="CC 12:44")
knob("dly.spacing", "dly", "SPACING (delay)", "Offsets Delay 1's time from Delay 2.", panel_scale=BI, cc="CC 13:45")
knob("dly.feedback", "dly", "FEEDBACK", "Single to infinite repeats; self-oscillates above about 2 o'clock.")
knob("dly.mix", "dly", "MIX", "Dry VCA to wet delay crossfade.")
btn("dly.sync_tap", "dly", "SYNC / TAP", "Press: sync to the arp/seq or external clock. Hold: tap tempo mode.", cc="CC 89 (sync)")
btn("dly.ping_pong", "dly", "PING PONG", "Delay 1 feeds Delay 2 and back, alternating left and right.", cc="CC 88")
knob("modosc.rate", "modosc", "RATE (modulation)", "0.07 Hz-1.3 kHz (SHIFT for fine).", physical={"min": 0.07, "max": 1300, "unit": "Hz"}, cc="CC 3:35")
sw("modosc.wave", "modosc", "WAVEFORM (modulation)", "Modulation waveform.", ["sine", "sawtooth", "ramp", "square", "staircase", "smooth_random"], "rotary_switch")
knob("modosc.pitch_amt", "modosc", "PITCH AMT", "Maximum pitch modulation at full mod wheel.")
sw("modosc.pitch_assign", "modosc", "PITCH MOD ASSIGN", "Oscillators that receive pitch modulation.", ["1_and_3", "all", "2_and_4"])
knob("modosc.cutoff_amt", "modosc", "CUTOFF AMT", "Maximum cutoff modulation at full mod wheel.")
knob("modosc.pw_amt", "modosc", "PULSE WIDTH AMT", "Maximum pulse width modulation at full mod wheel (square and narrow pulse only).")
for n in (1, 2, 3):
    knob(f"att{n}.amount", f"att{n}", f"ATTENUATOR {n}", "Centre fully attenuated; clockwise towards unity; anticlockwise inverted.", panel_scale=BI)
knob("lfo2.rate", "lfo2", "RATE (LFO)", "0.07-520 Hz.", physical={"min": 0.07, "max": 520, "unit": "Hz"})
knob("arp.rate", "arp", "RATE (arp/seq)", "20-280 BPM, or divisions when synced (SHIFT for triplets).", physical={"min": 20, "max": 280, "unit": "BPM"}, cc="CC 8:40")
sw("arp.mode", "arp", "MODE (arp/seq)", "Arpeggiator, sequencer, or sequencer record.", ["arp", "seq", "rec"], cc="CC 91")
sw("arp.direction", "arp", "DIRECTION", "Order, forward/backward, random.", ["ord", "fw_bw", "rnd"], cc="CC 92")
sw("arp.oct_bank", "arp", "OCT / BANK", "Arpeggio octaves, or sequence bank.", ["1", "2", "3"], cc="CC 93")
sw("arp.sequence", "arp", "SEQUENCE", "Sequence 1-4 in the bank.", ["1", "2", "3", "4"], "rotary_switch")
btn("arp.rest", "arp", "REST", "Enters a rest while recording.")
btn("arp.tie", "arp", "TIE", "Enters a tie (SHIFT + TIE duplicates the step tied).")
btn("arp.ratchet", "arp", "RATCHET", "Adds ratchets (up to 8) to the step.")
sw("kbd.voice_mode", "kbd", "VOICE MODE", "Mono, 2-note or 4-note paraphonic.", ["1", "2", "4"], cc="CC 94")
btn("kbd.multi_trig", "kbd", "MULTI TRIG", "Envelopes retrigger on every new note (off: only after all keys are released).", cc="CC 95")
knob("kbd.glide", "kbd", "GLIDE", "Glide time up to about 10 s; SHIFT + turn right/left toggles legato glide.", cc="CC 5:37")
btn("kbd.play", "kbd", "PLAY", "Arms the arpeggiator or sequencer.")
btn("kbd.hold", "kbd", "HOLD [SHIFT]", "Latches the arp/seq; sustain when it is not running; SHIFT for second functions.")
btn("kbd.tap", "kbd", "TAP", "Tap tempo; hold to exit.")
par("kbd.octave", "kbd", "Octave transpose", "integer", "Keyboard ±2 octaves (SHIFT + <KB / KB>).", control="push_button", range={"min": -2, "max": 2}, default=0, cc="CC 105")
par("kbd.pitch_wheel", "kbd", "PITCH wheel", "continuous", "Spring-loaded bend; range 0-12 semitones (default 2).", control="wheel", panel_scale={"min": -1, "max": 1}, cc="pitch bend")
par("kbd.mod_wheel", "kbd", "MOD wheel", "continuous", "Applies the Modulation module's amounts.", control="wheel", panel_scale=S10, cc="CC 1:33")
par("out.phones", "out", "HEADPHONE VOLUME", "continuous", "Headphone level only.", access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)
par("sys.power", "out", "POWER", "boolean", "Power switch.", access=[{"type": "rear_panel", "control": "toggle_switch"}])
gset("sys.note_priority", "kbd", "0.1 Note Priority", "Mono note priority.", ["low", "high", "last"], "C#0", "last", 3)
gset("sys.glide_type", "kbd", "0.2 Glide Type", "Linear constant rate, linear constant time, exponential.", ["lcr", "lct", "exp"], "D#0", "lcr")
gset("sys.gated_glide", "kbd", "0.3 Gated Glide", "Glide only while a key is held.", ["off", "on"], "F#0", "on")
gset("sys.bend_range", "kbd", "0.4 Pitch Bend Range", "Semitones.", [str(i) for i in range(13)], "G#0", "2")
gset("sys.pitch_variance", "kbd", "0.5 Pitch Variance", "Random detune per note, up to ±40 cents.", ["0..40 cents"], "A#0", "0..40 cents")
gset("sys.osc_freq_range", "osc2", "0.6 Oscillator Frequency Knob Range", "Range of the Osc 2-4 FREQUENCY knobs, 0-24 semitones.", [str(i) for i in range(25)], "C#1", "7")
gset("sys.square_polarity", "modosc", "0.7 Square LFO Polarity", "Modulation square unipolar or bipolar.", ["unipolar", "bipolar"], "D#1", "bipolar")
gset("sys.noise_hpf", "noise", "0.8 Noise Filter Cutoff", "1-pole high-pass on the noise.", ["lowest..highest"], "F#1", "lowest..highest")
gset("sys.delay_tone", "dly", "0.9 Delay Filter Brightness", "Dark or bright delay tone.", ["dark", "bright"], "G#1", "bright")
gset("sys.delay_cv_bend", "dly", "0.10 Delay Sync CV Bend", "TIME CV bends a synced delay ±33% (on) or steps divisions (off).", ["off", "on"], "A#1", "off")
gset("sys.midi_in_ch", "kbd", "1.1 MIDI Input Channel", "Receive channel.", [str(i) for i in range(1, 17)], "C#2 + C#0", "1", 10)
gset("sys.midi_out_ch", "kbd", "1.2 MIDI Output Channel", "Transmit channel.", [str(i) for i in range(1, 17)], "C#2 + D#0", "1", 11)
gset("sys.local_keys", "kbd", "1.7 Local Control (Keyboard)", "Keyboard plays the engine.", ["off", "on"], "C#2 + C#1", "on", 16)
gset("sys.voice_round_robin", "kbd", "4.2 Round-Robin Mode", "Paraphonic voice allocation order.", ["off", "on"], "group 4 + D#0")
gset("sys.para_unison", "kbd", "4.3 Paraphonic Unison", "Stacks spare oscillators on held notes in paraphonic modes.", ["off", "on"], "group 4 + F#0")
gset("sys.cv_range", "kbd", "3.3-3.10 CV OUT ranges", "KB and arp/seq CV, velocity, aftertouch, mod wheel and gate output ranges (-5..+5 / 0..10 V, 5 / 10 V gates).", ["default", "extended"], "group 3")

# ---------------------------------------------------------------- patch points (90: 49 in, 33 out, 8 mult)
for n in range(1, 5):
    jack(f"jack.osc{n}_pitch", f"OSC {n} PITCH IN", "in", "cv", f"pitchbus.in{n}", "Exponential pitch CV, 1 V/oct, added to the keyboard; chains to later oscillators.")
    jack(f"jack.osc{n}_linfm", f"OSC {n} LIN FM IN", "in", "cv_or_audio", f"osc{n}.lin_fm", "Linear FM, AC coupled.")
    jack(f"jack.osc{n}_pwm", f"OSC {n} PWM IN", "in", "cv", f"osc{n}.pwm", "Pulse width of square or narrow pulse.")
    jack(f"jack.osc{n}_out", f"OSC {n} WAVE OUT", "out", "audio", f"osc{n}.out", "Oscillator output, 10 Vpp.")
jack("jack.mix_noise_in", "NOISE IN", "in", "cv_or_audio", "mixer.noise", "Replaces the noise in the mixer.")
for n in range(1, 5):
    jack(f"jack.mix_osc{n}_in", f"OSC {n} IN", "in", "cv_or_audio", f"mixer.in{n}", f"Replaces Oscillator {n} in the mixer (still gated in paraphonic modes).")
jack("jack.mix_out", "MIXER OUTPUT", "out", "cv_or_audio", "mixer.out", "Mixer output, 10 Vpp.")
jack("jack.vcf1_in", "VCF 1 IN", "in", "audio", "vcf1.in", "Replaces the mixer feed to VCF 1.")
jack("jack.vcf2_in", "VCF 2 IN", "in", "audio", "vcf2.in", "Replaces VCF 2's feed (mixer or VCF 1).")
jack("jack.vcf1_out", "VCF 1 OUT", "out", "audio", "vcf1.out", "VCF 1 output.")
jack("jack.vcf2_out", "VCF 2 OUT", "out", "audio", "vcf2.out", "VCF 2 output.")
jack("jack.cutoff1_in", "CUTOFF 1 IN", "in", "cv", "cutbus.in1", "VCF 1 cutoff CV; normalled to CUTOFF 2 IN.", combine="sum")
jack("jack.cutoff2_in", "CUTOFF 2 IN", "in", "cv", "cutbus.in2", "VCF 2 cutoff CV; breaks the normal from CUTOFF 1 IN.", combine="sum")
jack("jack.env_amt_in", "ENV AMT IN", "in", "cv", "vcfctl.env_amt_cv", "CV control of ENVELOPE AMT.")
for e, lab in (("env_f", "FILTER EG"), ("env_a", "AMP EG")):
    jack(f"jack.{e}_trig", f"TRIGGER IN ({lab})", "in", "gate", f"{e}.trig", "Gate above 2.3 V; overrides the keyboard gate.")
    jack(f"jack.{e}_out", f"ENV OUT ({lab})", "out", "cv", f"{e}.out", "Envelope, 0 to +8 V.")
    jack(f"jack.{e}_end", f"ENV END OUT ({lab})", "out", "gate", f"{e}.end", "Gate once the envelope has finished; patch to TRIGGER IN to loop.")
for n in (1, 2):
    jack(f"jack.vca{n}_in", f"VCA {n} IN", "in", "audio", f"vca{n}.in", "Replaces the filter feed to this VCA.")
    jack(f"jack.vca{n}_cv", f"VCA {n} CV IN", "in", "cv", f"vca{n}.cv", "Level CV: -8 to +8 V with ENV/SPLIT (tremolo), 0 to +8 V sets the level in DRONE.")
jack("jack.dly_in1", "INPUT 1 (delay)", "in", "audio", "dly.in1", "Replaces VCA 1 into Delay 1.")
jack("jack.dly_in2", "INPUT 2 (delay)", "in", "audio", "dly.in2", "Replaces VCA 2 into Delay 2.")
jack("jack.dly_fb", "FB CV IN", "in", "cv", "dly.fb_cv", "Feedback CV for both delays (Delay 1 only if FB 2 CV IN is used).")
jack("jack.dly_mix", "MIX IN", "in", "cv", "dly.mix_cv", "Dry/wet CV.")
jack("jack.dly_time1", "TIME 1 IN", "in", "cv", "dly.time1_cv", "Delay 1 time CV.")
jack("jack.dly_time2", "TIME 2 IN", "in", "cv", "dly.time2_cv", "Delay 2 time CV.")
jack("jack.mod_rate", "RATE IN (modulation)", "in", "cv", "modosc.rate_cv", "1 V/oct rate CV (patch KB OUT here to play it).")
jack("jack.mod_sync", "SYNC IN (modulation)", "in", "gate", "modosc.sync", "Rising edge above 2.5 V resets the wave (and steps the S/H).")
jack("jack.noise_out", "NOISE OUT", "out", "cv_or_audio", "noise.out", "White noise, -8 to +8 V.")
jack("jack.snh_out", "S/H OUT", "out", "cv", "snh.out", "Sample and hold, -8 to +8 V.")
jack("jack.mod_wave_out", "WAVE OUT (modulation)", "out", "cv", "modosc.out", "Modulation oscillator, 10 Vpp.")
for n in (1, 2, 3):
    jack(f"jack.att{n}_in", f"ATTENUATOR {n} INPUT", "in", "cv_or_audio", f"att{n}.in", "Signal in; +8 V normalled when empty.", location="patch_in")
    jack(f"jack.att{n}_cv", f"ATTENUATOR {n} CV IN", "in", "cv", f"att{n}.cv", "Adds to the knob (-8 to +8 V).")
    jack(f"jack.att{n}_out", f"ATTENUATOR {n} OUTPUT", "out", "cv_or_audio", f"att{n}.out", "Attenuated / inverted output, -8 to +8 V.")
for n in (1, 2):
    jack(f"jack.mult{n}_1", f"MULT {n} (1)", "in", "cv_or_audio", f"mult{n}.in", "Unbuffered parallel jack (modelled as the input).")
    for k in (2, 3, 4):
        jack(f"jack.mult{n}_{k}", f"MULT {n} ({k})", "out", "cv_or_audio", f"mult{n}.out", "Unbuffered parallel jack.")
jack("jack.lfo2_rate", "RATE IN (LFO)", "in", "cv", "lfo2.rate_cv", "Adds to the LFO rate (to about 620 Hz).")
jack("jack.lfo2_tri", "TRI OUT", "out", "cv", "lfo2.tri", "Triangle, 10 Vpp.")
jack("jack.lfo2_sq", "SQUARE OUT", "out", "cv", "lfo2.square", "Square, 10 Vpp.")
jack("jack.arp_rate", "ARP RATE / DIV IN", "in", "cv", "arp.rate_cv", "Arp/seq rate CV.")
jack("jack.arp_vel", "VELOCITY OUT (arp/seq)", "out", "cv", "arp.velocity", "Velocity of arp/seq notes, 0-5 V (or 0-10 V).")
jack("jack.arp_cv", "CV OUT (arp/seq)", "out", "cv", "arp.cv", "Arp/seq pitch, -5 to +5 V (or 0-10 V).")
jack("jack.arp_gate", "GATE OUT (arp/seq)", "out", "gate", "arp.gate", "Arp/seq gate, +5 V (or +10 V).")
jack("jack.euro_l", "EURO OUT (L)", "out", "audio", "out.euro_l", "Main left at Eurorack level, unaffected by MAIN VOLUME.", location="rear")
jack("jack.euro_r", "EURO OUT (R)", "out", "audio", "out.euro_r", "Main right at Eurorack level.", location="rear")
jack("jack.dly_out_l", "DELAY OUT (L)", "out", "audio", "dly.out1", "100% wet Delay 1.", location="rear")
jack("jack.dly_out_r", "DELAY OUT (R)", "out", "audio", "dly.out2", "100% wet Delay 2.", location="rear")
jack("jack.dly_sync", "SYNC IN (delay)", "in", "clock", "dly.sync", "Delay clock (rising edge above 3.6 V) when SYNC is on.", location="rear")
jack("jack.dly_fb2", "DELAY FB 2 CV IN", "in", "cv", "dly.fb2_cv", "Feedback CV for Delay 2 only (0 to +8 V).", location="rear")
jack("jack.exp_cv", "EXP CV OUT", "out", "cv", "exp.out", "Expression pedal, buffered, 0 to +8 V.", location="rear")
for nm, node, fn in (("KB VEL OUT", "kbd.velocity", "Velocity, 0-5 V (or 0-10 V)."), ("KB AT OUT", "kbd.aftertouch", "Aftertouch, 0-5 V (or 0-10 V)."),
                     ("MOD WHL OUT", "kbd.modwheel", "Mod wheel position, 0-5 V (or 0-10 V)."), ("KB CV OUT", "kbd.cv", "Keyboard pitch, -5 to +5 V (or 0-10 V)."),
                     ("KB GATE OUT", "kbd.gate", "Keyboard gate, +5 V (or +10 V).")):
    jack(f"jack.{nm.lower().replace(' ', '_')}", nm, "out", "gate" if "GATE" in nm else "cv", node, fn, location="rear")
jack("jack.clock_in", "CLOCK IN", "in", "clock", "arp.clock_in", "Clock (rising edge above 3.6 V) advances the arp/seq.", location="rear", combine="replace")
jack("jack.on_off", "ON / OFF IN", "in", "gate", "arp.on_off", "Below 1 V stop, above 3.6 V start.", location="rear")
jack("jack.reset", "RESET IN", "in", "gate", "arp.reset", "Rising edge above 2.5 V returns to the first step.", location="rear")
jack("jack.clock_out", "CLOCK OUT", "out", "clock", "arp.clock_out", "Arp/seq clock, 0-10 V.", location="rear")
jack("jack.main_l", "MAIN OUT LEFT (MONO)", "out", "audio", "out.main_l", "+4 dBu, impedance balanced; mono mix if RIGHT is unplugged.", location="rear", connector="6.35 mm TRS")
jack("jack.main_r", "MAIN OUT RIGHT", "out", "audio", "out.main_r", "+4 dBu, impedance balanced.", location="rear", connector="6.35 mm TRS")
jack("jack.phones", "HEADPHONE OUT", "out", "audio", "out.phones", "Stereo, 1.1 V into 16 ohm.", location="rear", connector="6.35 mm TRS")
jack("jack.instr", "INSTRUMENT IN", "in", "audio", "instr.in", "Instrument level, +20 dB gain, into the mixer.", location="rear", connector="6.35 mm TS")
jack("jack.sus", "SUS PEDAL IN", "in", "gate", "kbd.sustain", "Normally open sustain pedal.", location="rear", connector="6.35 mm TS")
jack("jack.exp", "EXP PEDAL IN", "in", "cv", "exp.in", "Expression pedal (+5 V on the ring).", location="rear", connector="6.35 mm TRS")
for nm, d in (("midi_in", "in"), ("midi_out", "out"), ("midi_thru", "out")):
    jack(f"jack.{nm}", nm.replace("_", " ").upper(), d, "midi", "kbd.midi_in" if nm == "midi_in" else None, f"MIDI {nm.split('_')[1]}.", location="rear", connector="5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB MIDI and firmware updates.", location="rear", connector="USB type B")
jack("jack.power", "12V DC", "in", "power", None, "12 V DC 2 A, tip positive.", location="rear", connector="DC barrel")

# The ENV AMT IN jack needs a node: add a small control module
mod("vcfctl", "cv_source_selector", "Filter envelope amount", "FILTERS", "ENVELOPE AMT knob plus ENV AMT IN; scales the filter envelope to both cutoffs.", ["vcfctl.env", "vcfctl.env_amt_cv"], ["vcfctl.out"])

# ---------------------------------------------------------------- normals and internal wiring
for n in range(1, 5):
    con(f"kbd.cv{n}", f"osc{n}.pitch_cv", note="Per VOICE MODE: mono all four on one note; 2-note pairs; 4-note one each.")
    con(f"kbd.gate{n}", f"mixer.gate{n}", "gate", note="Mutes unplayed oscillators in paraphonic modes.")
    con(f"pitchbus.out{n}", f"osc{n}.pitch_cv", note="Chained PITCH IN normals.")
    con("kbd.bend", f"osc{n}.pitch_cv", amount="sys.bend_range")
    con(f"osc{n}.out", f"mixer.in{n}", "audio", broken_by=f"jack.mix_osc{n}_in", amount=f"mixer.osc{n}")
    con("modosc.out", f"osc{n}.pitch_cv", anyof("modosc.pitch_assign", "all", "1_and_3" if n in (1, 3) else "2_and_4"), amount_expr="modosc.pitch_amt * kbd.mod_wheel")
    con("modosc.out", f"osc{n}.pwm", amount_expr="modosc.pw_amt * kbd.mod_wheel")
    if n > 1:
        con(f"osc{n - 1}.out", f"osc{n}.sync_in", "sync", {"all": [eq("osc.sync_enable", True), eq(f"osc{n}.sync", True)]})
con("noise.out", "mixer.noise", "audio", broken_by="jack.mix_noise_in", amount="mixer.noise")
con("instr.out", "mixer.ext", "audio")
con("arp.notes", "kbd.seq_in", note="Arp/seq notes (can be disconnected from the oscillators in Global Settings).")
con("mixer.out", "vcf1.in", "audio", broken_by="jack.vcf1_in")
con("mixer.out", "vcf2.in", "audio", anyof("vcf.mode", "lp_lp_stereo", "hp_lp_parallel"), broken_by="jack.vcf2_in")
con("vcf1.out", "vcf2.in", "audio", eq("vcf.mode", "hp_lp_series"), broken_by="jack.vcf2_in")
con("cutbus.out1", "vcf1.cutoff_cv")
con("cutbus.out2", "vcf2.cutoff_cv", note="Carries CUTOFF 1 IN unless CUTOFF 2 IN is patched.")
con("env_f.out", "vcfctl.env")
for f in ("vcf1", "vcf2"):
    con("vcfctl.out", f"{f}.cutoff_cv", amount="vcf.env_amt")
    con("kbd.cv", f"{f}.cutoff_cv", amount="vcf.kb_tracking")
    con("modosc.out", f"{f}.cutoff_cv", amount_expr="modosc.cutoff_amt * kbd.mod_wheel")
con("vcf1.out", "filtsum.a", "audio")
con("vcf2.out", "filtsum.b", "audio")
con("vcf2.out", "vca1.in", "audio", eq("vcf.mode", "hp_lp_series"), broken_by="jack.vca1_in")
con("vcf2.out", "vca2.in", "audio", eq("vcf.mode", "hp_lp_series"), broken_by="jack.vca2_in")
con("vcf1.out", "vca1.in", "audio", eq("vcf.mode", "lp_lp_stereo"), broken_by="jack.vca1_in")
con("vcf2.out", "vca2.in", "audio", eq("vcf.mode", "lp_lp_stereo"), broken_by="jack.vca2_in")
con("filtsum.out", "vca1.in", "audio", eq("vcf.mode", "hp_lp_parallel"), broken_by="jack.vca1_in")
con("filtsum.out", "vca2.in", "audio", eq("vcf.mode", "hp_lp_parallel"), broken_by="jack.vca2_in")
con("kbd.gate", "env_f.trig", "gate", broken_by="jack.env_f_trig")
con("kbd.gate", "env_a.trig", "gate", broken_by="jack.env_a_trig")
con("env_a.out", "vca1.env", eq("vca.mode", "amp_env"))
con("env_f.out", "vca1.env", eq("vca.mode", "split"))
con("env_a.out", "vca2.env", anyof("vca.mode", "amp_env", "split"))
con("ref.drone", "vca1.cv", eq("vca.mode", "drone"), broken_by="jack.vca1_cv")
con("ref.drone", "vca2.cv", eq("vca.mode", "drone"), broken_by="jack.vca2_cv")
con("vca1.out", "dly.in1", "audio", broken_by="jack.dly_in1")
con("vca2.out", "dly.in2", "audio", broken_by="jack.dly_in2")
con("vca1.out", "out.dry1", "audio")
con("vca2.out", "out.dry2", "audio")
con("dly.out1", "out.wet1", "audio", amount="dly.mix")
con("dly.out2", "out.wet2", "audio", amount="dly.mix")
con("noise.out", "snh.in")
con("modosc.out", "snh.clock", "clock", note="Samples at the start of each modulation cycle.")
con("arp.clock_out", "modosc.clock", "clock", note="Steps the staircase waveform.")
for n in (1, 2, 3):
    con("ref.v8", f"att{n}.in", broken_by=f"jack.att{n}_in")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "rate_leds", "module": "modosc", "label": "rate LEDs", "kind": "led", "function": "Flash at the modulation, LFO, arp/seq and delay rates; the delay LED is red, green (internal sync) or yellow (external sync)."},
    {"id": "button_leds", "module": "kbd", "label": "button LEDs", "kind": "led", "function": "Sync, multi trig, ping pong, sync/tap, play, hold, tap, rest, tie, ratchet; SYNC ENABLE blinks the selected global setting."},
    {"id": "midi_led", "module": "kbd", "label": "MIDI LED", "kind": "led", "function": "Blinks on MIDI input."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Default signal path", "applies_to": ["mixer", "vcf1", "vcf2", "vca1", "vca2", "dly", "out"],
     "rule": "Oscillators, noise and instrument input into the mixer, the filters (per FILTER MODE), the two VCAs (per VCA MODE), the stereo delay (MIX crossfades dry and wet), then the outputs. Patching a mixer, filter, VCA or delay input replaces its normal."},
    {"id": "b02", "name": "Filter modes", "applies_to": ["vcf1", "vcf2"],
     "rule": "Series: VCF 1 high-pass into VCF 2 low-pass (band-pass), mono to both VCAs. Stereo: both low-pass from the mixer, VCF 1 to VCA 1 (left), VCF 2 to VCA 2 (right). Parallel: VCF 1 high-pass and VCF 2 low-pass summed (notch), mono to both. CUTOFF moves both; SPACING offsets VCF 1."},
    {"id": "b03", "name": "Paraphony", "applies_to": ["kbd", "mixer"],
     "rule": "VOICE MODE 1: all four oscillators on one note. 2: first key Osc 1+2, second key Osc 3+4. 4: one oscillator per key, Osc 1 first after all keys are released. Mixer gates mute unused oscillators (and their external replacements). MULTI TRIG retriggers envelopes on every note; otherwise only after all keys are up."},
    {"id": "b04", "name": "Chained normals", "applies_to": ["pitchbus", "cutbus", "osc1", "osc2", "osc3", "osc4"],
     "rule": "PITCH IN at Osc 1 reaches Osc 1-4 until a later PITCH IN is patched (a dead patch isolates). CUTOFF 1 IN reaches both filters until CUTOFF 2 IN is patched. FB CV IN reaches both delays until FB 2 CV IN is patched."},
    {"id": "b05", "name": "Modulation", "applies_to": ["modosc", "kbd"],
     "rule": "PITCH AMT (to all, 1&3 or 2&4), CUTOFF AMT and PULSE WIDTH AMT set maxima; the MOD wheel applies them. The S/H samples noise each cycle and has no internal routing. Velocity and aftertouch are not hard-wired: patch the rear jacks."},
    {"id": "b06", "name": "VCA modes", "applies_to": ["vca1", "vca2"],
     "rule": "AMP ENV: amp envelope on both. SPLIT: filter envelope on VCA 1 (left), amp envelope on VCA 2 (right). DRONE: a default voltage (or VCA CV IN, 0-8 V) holds the level without keys."},
    {"id": "b07", "name": "Utilities", "applies_to": ["att1", "att2", "att3", "mult1", "mult2", "lfo2"],
     "rule": "Each attenuator inverts anticlockwise, has a CV input, and outputs a DC level from its +8 V normal when nothing is patched; audio into INPUT and CV IN gives ring modulation. Mults are unbuffered and also mix outputs passively."},
    {"id": "b08", "name": "Arpeggiator and sequencer", "applies_to": ["arp"],
     "rule": "PLAY arms, a key starts (and transposes the sequence); HOLD latches (sustain when idle); TAP sets tempo. REC records steps of up to four notes with rests, ties and up to 8 ratchets; recording while stopped overwrites the sequence. 12 sequences, up to 256 steps, kept at power-off."},
    {"id": "b09", "name": "Envelope looping", "applies_to": ["env_f", "env_a"], "rule": "ENV END OUT goes high when an envelope finishes; patch it to TRIGGER IN for a looping envelope."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change", "note": "when enabled"},
                 {"message": "control_change", "note": "14-bit pairs: mod wheel 1:33, mod rate 3:35, glide 5:37, arp rate 8:40, noise filter 9:41, delay time 12:44, delay spacing 13:45, arp swing 14:46, arp gate length 15:47, Osc 2-4 frequency 16:48-18:50"},
                 {"message": "control_change", "note": "switches: 64 sustain, 65 glide on, 80-83 sync, 84 portamento control, 85 glide type, 86 gated glide, 87 legato glide, 88 ping pong, 89 delay sync, 90 square LFO polarity, 91 arp mode, 92 arp pattern, 93 range/bank, 94 voice mode, 95 multi trig, 105 octave"},
                 {"message": "clock"}, {"message": "start"}, {"message": "stop"},
                 {"message": "sysex", "header": "F0 04 17 23", "note": "set global and some panel parameters by ID; F0 04 17 3E requests a value"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "control_change", "note": "filtered by the MIDI OUT filter settings"},
                  {"message": "clock", "note": "off, when playing or always"}, {"message": "start"}, {"message": "stop"}],
    "channel_note": "Separate in and out channels; DIN and USB ports selectable, with echo options.", "note": "Most analogue knobs (cutoff, resonance, envelopes, mixer) are not on MIDI."}
D["specifications"] = {
    "type": "semi-modular analogue", "keys": "49 full-size, velocity and aftertouch", "polyphony": "mono, 2-note or 4-note paraphonic", "oscillators": 4,
    "filters": "2 Moog ladder, -24 dB/oct, series/stereo/parallel", "envelopes": "2 ADSR, 2 ms-10 s", "modulation": "mod oscillator 0.07 Hz-1.3 kHz (6 waves + S/H); LFO 0.07-520 Hz",
    "utilities": "3 voltage-controlled attenuators, 2 x 4 mults", "effects": "stereo BBD delay 35-780 ms, ping pong, sync", "sequencer": "12 sequences, 256 steps",
    "patch_points": {"total": 90, "inputs": 49, "outputs": 33, "mult_jacks": 8},
    "audio": {"main": "2 x 1/4\" TRS, +4 dBu", "phones": "1/4\" TRS, 1.1 V into 16 ohm", "instrument_in": "1/4\" TS, +20 dB", "euro_out": "2 x 3.5 mm, 10 Vpp", "delay_out": "2 x 3.5 mm"},
    "midi": "DIN in, out, thru; USB", "dimensions_mm": {"w": 812.8, "d": 361.9, "h": 139.7}, "weight_kg": 13.61, "power": "12 V DC 2 A, tip positive; 100-240 V AC adaptor",
}
D["omitted_from_source"] = ["setup and safety", "synthesis primer text", "signal flow diagram images", "blank preset sheets", "the full global settings list beyond those modelled", "the full SysEx parameter ID table"]
D["not_in_source"] = ["envelope curve shapes", "the drone reference voltage", "noise filter cutoff values", "delay feedback range in repeats"]
D["source_inconsistencies"] = [
    "The specifications describe the attenuators as 'Three Bipolar Voltage Controlled Amplifiers (VCA)'; the module text calls them inverting attenuators.",
    "The Mod Sources line in the specifications lists S/H as a waveform; on the panel S/H is a separate output.",
    "CLOCK OUT is labelled 'CV INPUT: 0V to 10V' in its own description, though it is an output.",
    "Amp EG ENV END OUT is a 'GATE OUTPUT: 0V to +8V'; the filter EG's is 'CV OUTPUT: 0V to +5V'.",
]
D["modelling_gaps"] = [
    {"topic": "Global settings", "detail": "About 50 global settings exist; the main performance and routing ones are modelled, the rest are listed by name in the manual's tables."},
    {"topic": "Mults", "detail": "Four bidirectional parallel jacks per mult are modelled as one input and three outputs."},
    {"topic": "Chained normals", "detail": "Pitch and cutoff input chains are small selector modules; the selection rule is a behaviour."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/moog-matriarch_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
