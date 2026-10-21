#!/usr/bin/env python3
"""Assemble the Gamechanger Audio MOTOR Synth MKII device file (schema 0.13.0).

An electromechanical synthesizer: eight brushless DC motors in two MOTOR VOICES (four
motors each). A motor's speed is the note's pitch; each motor yields an electromagnetic
inductive 'M' wave from a pickup by its coils, and optical sine, saw and square waves
read by infrared sensors from patterned reflective discs on the shaft. Inertia means
pitch cannot jump instantly, which the ACCEL/BRAKE pitch envelope exploits. A third
digital voice (DCO, four oscillators) completes it. Per-motor amp envelopes (polyphonic)
feed one analogue multimode filter per voice (paraphonic); the DCO has a digital twin.
Cross mod, drift/detune, three modulators, arpeggiator, sequencer, motion recording.

Sources: Gamechanger Audio's online MOTOR Synth MKII manual (overview, motor controls,
acceleration/brake, filter, modulation chapters read in full; others via search
excerpts), the official CC map PDF (April 2023), product page and reviews.
"""
import json

D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
P100 = {"min": 0, "max": 100}
B100 = {"min": -100, "max": 100}
ENV_MODES = ["ADSR", "AD", "AR", "DADSR", "ADSHR", "AD_LOOP", "ADS"]
VOICES = (("v1", "MOTOR VOICE 1"), ("v2", "MOTOR VOICE 2"))
BASE = "https://gamechangeraudio.com/msmkii-manual/"


def mod(id, type, name, section, desc, inputs, outputs, scope="common", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("how")} if "how" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def screen(id, module, label, kind, fn, scr, cc=None, **kw):
    par(id, module, label, kind, fn, access=[{"type": "menu", "note": scr}], cc=cc, **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "audio", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "normalled" if "broken_by" in kw else ("switched" if when else "fixed")}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "gamechanger-audio-motor-synth-mkii", "manufacturer": "Gamechanger Audio", "model": "MOTOR Synth MKII",
    "category": "electromechanical desktop synthesizer: eight motor oscillators in two voices plus a digital voice, 4-note polyphony, analogue filters",
    "based_on": "Successor to the MOTOR Synth (MKI), the first electromechanical polysynth (Riga, Latvia); MKII adds the DCO voice, expanded portamento, detune and cross-mod controls.",
    "sources": [
        {"id": "manual", "title": "Gamechanger Audio, MOTOR Synth MKII online manual (chapters 1-24)", "kind": "user_manual", "file": BASE,
         "note": "Overview, Motor Controls, Acceleration/Brake, Filter and Modulation chapters read in full; DCO, cross mod, drift/detune, performance and I/O from the overview and search excerpts."},
        {"id": "cc_map", "title": "Gamechanger Audio, 'Motor Synth MKII CC MAP' (April 4, 2023)", "kind": "spec_sheet",
         "file": "https://gamechangeraudio.com/wp-content/uploads/2023/04/MS-MKII-CC-MAP-_-APRIL-4-2023.pdf", "note": "Official CC map; 14-bit pairs for CC 1-31; NRPN and SysEx maps exist as separate PDFs (not read)."},
        {"id": "product", "title": "Gamechanger Audio product page; retailer specifications; MusicRadar review", "kind": "other", "file": "https://gamechangeraudio.com/motor-synth-mkii/",
         "note": "Signal path all analogue except the DCO; 24 V DC 5 A; 3 CV and 3 trigger inputs; DCO with six waveforms incl. noise, PWM and wave folding."},
    ],
}
D["architecture"] = {
    "synthesis": "electromechanical", "signal_path": "hybrid", "voices": 3,
    "polyphony_mode": "4 notes: each MOTOR VOICE has four motors (poly, duo or unison per voice) and the DCO four digital oscillators; up to 3 voices per note. Polyphonic before the filters, paraphonic after.",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "Presets and projects (with sequencer patterns, arp patterns and motion recordings) on internal memory and microSD.",
    "semi_modular": False, "panel_counts": {"motors": 8, "keypad_keys": 8, "pitch_encoders": 4},
    "summary": ("Each MOTOR VOICE is four custom brushless DC motors. Spinning speed sets pitch; each motor's sound is read either electromagnetically (the 'M' wave from a pickup "
                "beside the rotating coils, akin to a tonewheel organ) or optically (infrared sensors reading sine, saw and square patterns printed on reflective discs, with "
                "deliberate imperfections). Physical inertia slews every pitch change; ACCEL and BRAKE extend that into a pitch envelope (or portamento). Each motor has its own "
                "amp envelope and VCA; the four are mixed, sent through a pre-filter send/return, drive and an analogue multimode filter (LP24, BP12, HP12, AP24, self-oscillating) "
                "per voice. A DCO voice (four digital oscillators with six waves, PWM, folding, sync) runs alongside with a digital twin filter. Cross mod (FM or ring), drift/detune, "
                "three assignable modulators with envelopes, arpeggiator, 8-pattern sequencer, motion recording, audio input processing."),
    "synthesis_note": "Electromechanical: pitch is motor rotation speed; waveforms are physical readouts (electromagnetic induction and optical disc reflection), not electronic oscillators.",
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Performance interface and voice allocation", "PERFORMANCE INTERFACE",
    "8-key non-velocity keypad with scales and microtuning, four PITCH ENCODERS (per-voice detune, momentary pitchwheel), MIDI, CV/trigger, arpeggiator and sequencer; per-voice poly/duo/unison and performance-tool assignment.",
    ["kbd.midi_in", "kbd.cv_in", "kbd.trig_in", "kbd.seq_in"], ["kbd.pitch", "kbd.gate", "kbd.modwheel", "kbd.pressure"])
for v, nm in VOICES:
    mod(f"{v}_drive_ctl", "slew_limiter", f"{nm} motor drive and inertia (ACCEL / BRAKE)", f"{nm} ACCEL / BRAKE",
        "Converts note pitch to target motor speed. Inertia gives an inherent rev-up/rev-down slew; ACCEL (on note-on, from the FROM interval) and BRAKE (on note-off, to the TO interval) extend it as a pitch envelope, or act as rise/fall portamento in GLIDE mode. Per motor (polyphonic).",
        [f"{v}_drive_ctl.pitch", f"{v}_drive_ctl.gate", f"{v}_drive_ctl.mod"], [f"{v}_drive_ctl.rpm"], scope="per_voice")
    mod(f"{v}_motor", "electromechanical_oscillator", f"{nm} motors", f"{nm}",
        "Four brushless DC motors per voice (soft-mounted, acoustically treated). Outputs per motor: M (electromagnetic inductive pickup), OPT SINE, OPT SAW, OPT SQ (infrared reading of reflective disc patterns). Imperfect readout is part of the character.",
        [f"{v}_motor.rpm"], [f"{v}_motor.m", f"{v}_motor.opt_sine", f"{v}_motor.opt_saw", f"{v}_motor.opt_sq"], scope="per_voice",
        props={"motors": 4, "motor_type": "brushless DC", "pickups": ["electromagnetic inductive", "infrared optical"], "scale_feet": ["32'", "16'", "8'", "4'", "2'"]})
    mod(f"{v}_wave", "electronic_switch", f"{nm} WAVE selector", f"{nm}", "Chooses which motor readout feeds the voice.", [f"{v}_wave.m", f"{v}_wave.sine", f"{v}_wave.saw", f"{v}_wave.sq"],
        [f"{v}_wave.out"], scope="per_voice")
    mod(f"{v}_tone", "filter", f"{nm} analogue tone tilt", f"{nm} (ANALOG TONE screen)", "Tilt EQ before the mix: follows SCALE (low boost at low scales, high boost at high) or manual.", [f"{v}_tone.in"], [f"{v}_tone.out"],
        scope="per_voice")
    mod(f"{v}_env", "envelope", f"{nm} amp envelope", f"{nm} AMP ENV", "Per-motor envelope: ADSR, AD, AR, DADSR, ADSHR, AD loop or ADS with curve.", [f"{v}_env.gate"], [f"{v}_env.out"], scope="per_voice")
    mod(f"{v}_vca", "vca", f"{nm} motor VCAs", f"{nm}", "One analogue VCA per motor, under its amp envelope; VOLUME sets the peak.", [f"{v}_vca.in", f"{v}_vca.cv"], [f"{v}_vca.out"], scope="per_voice")
    mod(f"{v}_mix", "summer", f"{nm} motor mix", f"{nm}", "Mixes the voice's four motors (paraphonic from here on); DCO can be routed in.", [f"{v}_mix.motors", f"{v}_mix.dco"], [f"{v}_mix.out"])
    mod(f"{v}_drive", "overdrive", f"{nm} drive", "FILTER", "Analogue drive circuit before the filter (0 unity to 100 maximum distortion).", [f"{v}_drive.in"], [f"{v}_drive.out"])
    mod(f"{v}_vcf", "filter", f"{nm} analogue filter", "FILTER", "Analogue multimode filter: LP24, BP12, HP12, AP24; resonance self-oscillates (~87); calibrated key tracking with glide.", [f"{v}_vcf.in", f"{v}_vcf.cutoff_cv"],
        [f"{v}_vcf.out"], props={"modes": ["LP24", "BP12", "HP12", "AP24"], "cutoff_hz": [20, 21096]})
    mod(f"{v}_fenv", "envelope", f"{nm} filter envelope", "FILTER ENV", "Filter envelope (same modes as the amp envelopes) to cutoff by ENV AMOUNT.", [f"{v}_fenv.gate"], [f"{v}_fenv.out"])
mod("dco", "oscillator", "DCO (digital voice)", "DCO", "Four virtual-analogue oscillators (paraphonic or unison): six waveshapes including noise, PWM, wave folding, hard sync; own amp and pitch envelopes.", ["dco.pitch_cv"], ["dco.out"],
    scope="per_voice", props={"oscillators": 4, "waveshapes": 6})
mod("dco_env", "envelope", "DCO amp envelope", "DCO AMP ENV", "Amp envelope for the DCO oscillators.", ["dco_env.gate"], ["dco_env.out"], scope="per_voice")
mod("dco_vca", "vca", "DCO VCAs", "DCO", "One per digital oscillator.", ["dco_vca.in", "dco_vca.cv"], ["dco_vca.out"], scope="per_voice")
mod("dco_fenv", "envelope", "DCO filter envelope", "FILTER ENV", "Filter envelope for the DCO's digital filter.", ["dco_fenv.gate"], ["dco_fenv.out"])
mod("dco_vcf", "filter", "DCO digital filter", "FILTER", "Digital emulation of the analogue filter (same modes and parameters); the DCO can instead pass through either analogue filter.", ["dco_vcf.in", "dco_vcf.cutoff_cv"],
    ["dco_vcf.out"])
mod("xmod", "ring_modulator", "Cross mod", "CROSS MOD", "Amplitude (RING) or frequency (FM) cross modulation between the two motor voices; from frenzied ring-mod distortion to a pulsating 'broken' sound.", ["xmod.v1", "xmod.v2"],
    ["xmod.out"])
mod("drift", "modulation_bus", "Drift / detune", "DRIFT / DETUNE", "Gradual variation in motor rotation speeds: drift or static detune between motors, assignable per voice.", [], ["drift.out"])
for n in (1, 2, 3):
    mod(f"mod{n}", "lfo", f"Modulator {n}", "MODULATION", "Shapes STEP (up, down, noise, pattern, random), TRI, SQ, SAW UP, SAW DOWN with curve, PW, X/Y offset, slope; 0-32760 Hz; clock INT, another modulator, BPM or note; own mod envelope on depth; two destination slots.",
        [], [f"mod{n}.out"], props={"rate_hz": [0, 32760.1]})
mod("input", "preamp", "Audio input processing", "INPUT", "External audio for filtering, gating, side-chaining and vocoder-style processing through the voices.", ["input.in"], ["input.out"])
mod("seq", "sequencer", "Arpeggiator, sequencer and motion rec", "ARP / SEQ / MOTION REC", "Arpeggiator with rhythm editor; 8 patterns per project with ratchets, micro-timing, probability; 8 motion-recording lanes; master tempo.", [], ["seq.notes"])
mod("out", "output", "Output", "MASTER / rear panel", "Main out (TS mono, or TRS split V1/V2), headphones; MASTER VOLUME not stored.", ["out.v1", "out.v2", "out.dco"], ["out.main_l", "out.main_r", "out.phones"])

# ---------------------------------------------------------------- per-voice parameters
VCC = {"v1": dict(vol=9, wave=114, scale=111, a=20, d=21, s=80, r=81, acc=72, frm=73, brk=74, to=75, typ=117, fc=11, res=14, drv=69, eg=17, fa=26, fd=27, fs=86, fr=87, det=93),
       "v2": dict(vol=10, wave=115, scale=112, a=22, d=23, s=82, r=83, acc=76, frm=77, brk=78, to=79, typ=118, fc=12, res=15, drv=70, eg=18, fa=28, fd=29, fs=88, fr=89, det=94),
       "dco": dict(vol=8, wave=116, scale=113, a=24, d=25, s=84, r=85, typ=119, fc=13, res=16, drv=71, eg=19, fa=30, fd=31, fs=90, fr=91, det=95)}
for v, nm in VOICES + (("dco", "DCO"),):
    c = VCC[v]
    lab = "V1" if v == "v1" else ("V2" if v == "v2" else "DCO")
    envm, vcfm, fenvm = (f"{v}_env", f"{v}_vcf", f"{v}_fenv") if v != "dco" else ("dco_env", "dco_vcf", "dco_fenv")
    srcm = f"{v}_motor" if v != "dco" else "dco"
    par(f"{v}.vol", f"{v}_vca" if v != "dco" else "dco_vca", f"{lab} VOLUME", "integer", "Voice level at the envelope peak (saved; MASTER VOLUME is not).", cc=c["vol"], range=P100)
    if v != "dco":
        par(f"{v}.wave", f"{v}_wave", f"{lab} WAVE", "enum", "Motor readout.", control="rotary_switch", cc=c["wave"], values=[{"value": x} for x in ["opt_sine", "opt_saw", "opt_sq", "m"]])
        par(f"{v}.scale", srcm, f"{lab} SCALE", "enum", "Octave range of the motors.", control="rotary_switch", cc=c["scale"], values=[{"value": x} for x in ["32'", "16'", "8'", "4'", "2'"]])
        screen(f"{v}.tone_mode", f"{v}_tone", f"{lab} Tone Mode", "enum", "Tilt follows SCALE or is manual.", "ANALOG TONE screen (turn VOLUME, then RIGHT ENCODER)", values=[{"value": "scale"}, {"value": "manual"}], default="scale")
        screen(f"{v}.tone", f"{v}_tone", f"{lab} Tone", "integer", "0 low boost/high cut to 100 low cut/high boost.", "ANALOG TONE screen", range=P100)
        par(f"{v}.from", f"{v}_drive_ctl", f"{lab} FROM", "integer", "ACCEL start interval relative to the target (centre detent 0; CCW = rising).", cc=c["frm"], range={"min": -12, "max": 12})
        par(f"{v}.to", f"{v}_drive_ctl", f"{lab} TO (ALT + FROM)", "integer", "BRAKE end interval relative to the target.", cc=c["to"], range={"min": -12, "max": 12}, how="ALT + FROM/TO")
        par(f"{v}.accel", f"{v}_drive_ctl", f"{lab} ACCEL", "integer", "Rate to the target pitch after note-on; fully CCW = off.", cc=c["acc"], range=P100)
        par(f"{v}.brake", f"{v}_drive_ctl", f"{lab} BRAKE (ALT + ACCEL)", "integer", "Rate to the TO interval after note-off; fully CCW = off.", cc=c["brk"], range=P100, how="ALT + ACCEL/BRAKE")
        screen(f"{v}.accel_curve", f"{v}_drive_ctl", f"{lab} Accel/Brake Curve", "continuous", "-2 exponential, 0 linear, +2 logarithmic.", "ACCEL / BRAKE screen", physical={"min": -2, "max": 2, "unit": "curve"})
        screen(f"{v}.accel_mode", f"{v}_drive_ctl", f"{lab} Accel/Brake Mode", "enum", "TARGET (pitch envelope) or GLIDE (portamento: ACCEL rising, BRAKE falling).", "ACCEL / BRAKE screen", values=[{"value": "target"}, {"value": "glide"}], default="target")
    for k, cc_k in (("attack", "a"), ("decay", "d"), ("sustain", "s"), ("release", "r")):
        par(f"{v}.amp_{k}", envm, f"{lab} AMP {k.upper()}", "integer", f"Amp envelope {k}.", control="encoder", cc=c[cc_k], range=P100)
    screen(f"{v}.amp_mode", envm, f"{lab} Amp Env Mode", "enum", "Envelope type.", "AMP ENV screen", values=[{"value": x} for x in ENV_MODES], default="ADSR")
    screen(f"{v}.amp_curve", envm, f"{lab} Amp Env Curve", "continuous", "Segment curvature.", "AMP ENV screen (AMP ENV / CURVE encoder)", physical={"min": -1, "max": 1, "unit": "curve"})
    par(f"{v}.vcf_type", vcfm, f"{lab} FILTER TYPE", "enum", "Filter mode.", control="rotary_switch", cc=c["typ"], values=[{"value": x} for x in ["LP24", "BP12", "HP12", "AP24"]])
    par(f"{v}.cutoff", vcfm, f"{lab} CUTOFF", "integer", "20 Hz-21.1 kHz (or 0-12000 cents above 20 Hz); fine tune on the LEFT ENCODER.", cc=c["fc"], physical={"min": 20, "max": 21096, "unit": "Hz"})
    par(f"{v}.resonance", vcfm, f"{lab} RESONANCE", "integer", "Self-oscillates from about 87.", cc=c["res"], range=P100)
    par(f"{v}.drive", f"{v}_drive" if v != "dco" else vcfm, f"{lab} DRIVE", "integer", "Pre-filter drive.", cc=c["drv"], range=P100)
    par(f"{v}.env_amt", vcfm, f"{lab} FILTER ENV AMOUNT", "integer", "Bipolar envelope amount (centre detent).", cc=c["eg"], range=B100)
    for k, cc_k in (("attack", "fa"), ("decay", "fd"), ("sustain", "fs"), ("release", "fr")):
        par(f"{v}.fenv_{k}", fenvm, f"{lab} FILTER ENV {k.upper()}", "integer", f"Filter envelope {k}.", control="encoder", cc=c[cc_k], range=P100)
    screen(f"{v}.keytrack", vcfm, f"{lab} Key Tracking", "boolean", "Key tracking on/off (last note of the voice).", "FILTER screen")
    screen(f"{v}.keytrack_amt", vcfm, f"{lab} Key Tracking Amount", "integer", "-100 inverted to 100 precise.", "FILTER screen", range=B100, default=0)
    screen(f"{v}.keytrack_glide", vcfm, f"{lab} Key Tracking Glide", "integer", "Slew on tracking (smooths paraphonic pads).", "FILTER screen", range={"min": 0, "max": 5})
    par(f"{v}.detune", "kbd", f"{lab} DETUNE (ALT + PITCH ENCODER)", "integer", "Voice detune in cents (within DETUNE MIN/MAX).", control="encoder", cc=c["det"], range={"min": -1200, "max": 1200}, how=f"ALT + turn PITCH ENCODER ({lab})")
screen("dco.waveshape", "dco", "DCO waveshape", "enum", "Six waveshapes including noise.", "DCO screen", values=[{"value": "six shapes incl. noise"}], cc=116, note="CC 116 'DCO WAVE'; shape names not read.")
screen("dco.pw", "dco", "DCO pulse width", "integer", "Pulse width.", "DCO screen", range=P100, confidence="inferred")
screen("dco.fold", "dco", "DCO wave fold", "integer", "Wave folding amount.", "DCO screen", range=P100, confidence="inferred")
screen("dco.sync", "dco", "DCO hard sync", "boolean", "Hard sync.", "DCO screen")
screen("dco.route", "dco", "DCO routing", "enum", "Digital filter, or through the V1 or V2 analogue filter; output routing.", "DCO / ROUTING screen", values=[{"value": x} for x in ["dco_filter", "v1_filter", "v2_filter"]])
# global-ish performance params
par("osc.detune", "drift", "DRIFT / DETUNE", "integer", "Master drift/detune of motor speeds (assignable per voice).", cc=92, range=P100)
par("xmod.depth", "xmod", "CROSS MOD", "integer", "Cross-mod depth.", cc=68, range=P100)
par("xmod.mode", "xmod", "FM / RING", "enum", "Cross-mod type.", control="toggle_switch", values=[{"value": "fm"}, {"value": "ring"}])
for i, (nm, cc) in enumerate((("ACCEL LINK", 65), ("ENV LINK", 66), ("FILTER LINK", 67))):
    par(f"link.{nm.split()[0].lower()}", "kbd", nm, "boolean", "Shared controls edit all voices together (or one voice at a time).", control="push_button", cc=cc)
for n in (1, 2, 3):
    par(f"mod{n}.rate", f"mod{n}", f"MOD {n} RATE/SUBDIV", "continuous", "Rate (Hz or BPM) or subdivision 1/32-8/1 of the clock source.", control="encoder", cc=n + 1, physical={"min": 0, "max": 32760.1, "unit": "Hz"})
    par(f"mod{n}.shape", f"mod{n}", f"MOD {n} SHAPE", "enum", "Modulator shape.", control="rotary_switch", cc=101 + n, values=[{"value": x} for x in ["step", "tri", "sq", "saw_up", "saw_down"]])
    for s_, cc in (("a", 103 + 2 * n), ("b", 104 + 2 * n)):
        par(f"mod{n}.depth_{s_}", f"mod{n}", f"MOD {n} DEPTH {s_.upper()}", "integer", f"Depth to destination {s_.upper()} (A/B switch selects).", cc=cc, range=B100)
        screen(f"mod{n}.dest_{s_}", f"mod{n}", f"MOD {n} destination {s_.upper()}", "enum", "Nearly any parameter, including other modulators.", "ALT + MOD SETUP/ASSIGN, move a control, confirm",
               values=[{"value": "any parameter"}])
    screen(f"mod{n}.clk", f"mod{n}", f"MOD {n} clock source", "enum", "INT, another modulator's rate, BPM or the last note's frequency.", "MOD screen", values=[{"value": x} for x in ["int", "mod1", "mod2", "mod3", "bpm", "note"]])
    screen(f"mod{n}.phase_reset", f"mod{n}", f"MOD {n} phase reset", "boolean", "Restart on each note.", "MOD screen")
par("out.motor_vol", "out", "MOTOR VOL", "integer", "Combined motor voice level.", memory="patch", cc=5, access=[{"type": "midi", "message": "CC 5"}], range=P100)
par("out.volume", "out", "MASTER VOLUME", "continuous", "Output level (not stored).", memory="none", cc=7, panel_scale={"min": 0, "max": 10})
for pid, lab, fn in (("ui.keypad", "KEYPAD 1-8", "Notes, chords, sequences (scales, microtuning)."), ("ui.pitch_enc", "PITCH ENCODERS 1-4", "Edit notes and microtonal pitch; with ALT, voice detune."),
                     ("ui.clutch", "CLUTCH", "Temporary parameter editing buffer."), ("ui.alt", "ALT", "Second functions."), ("ui.arrows", "< > / RESET", "Navigate voices and screens; ALT + > resets.")):
    par(pid, "kbd", lab, "boolean", fn, memory="none", control="push_button")
par("sys.midi_channel", "kbd", "MIDI channel", "integer", "MIDI channel (settings menu).", memory="global", access=[{"type": "menu", "note": "SETTINGS menu"}], range={"min": 1, "max": 16})
par("sys.output_routing", "out", "Output routing", "enum", "Main out as mono mix or split (tip V1, ring V2); DCO to V1, V2 or both.", memory="global", access=[{"type": "menu", "note": "SETTINGS > ROUTING"}],
    values=[{"value": "mono"}, {"value": "split"}])

# ---------------------------------------------------------------- ports
jack("jack.out", "OUT", "out", "audio", "out.main_l", "Main output; TS for mono, TRS for split voices (tip V1, ring V2).", "6.35 mm TRS")
jack("jack.out_ring", "OUT (ring, split mode)", "out", "audio", "out.main_r", "Motor Voice 2 in split mode.", "6.35 mm TRS")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones, unbalanced TRS.", "3.5 mm TRS")
jack("jack.in", "IN", "in", "audio", "input.in", "Audio input, unbalanced.", "6.35 mm TS")
for v, nm in VOICES:
    jack(f"jack.{v}_send", f"{v.upper()} SEND", "out", "audio", f"{v}_mix.out", f"{nm} pre-filter send (tip of the SEND RET jack).", "3.5 mm TRS")
    jack(f"jack.{v}_ret", f"{v.upper()} RET", "in", "audio", f"{v}_drive.in", f"{nm} pre-filter return (ring); a plug breaks the internal path.", "3.5 mm TRS")
for i in (1, 2, 3):
    jack(f"jack.cv{i}", f"CV {i}", "in", "cv", "kbd.cv_in", "Assignable CV input.", "3.5 mm TS")
    jack(f"jack.trig{i}", f"TRIG {i}", "in", "gate", "kbd.trig_in", "Assignable trigger input.", "3.5 mm TS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB-B: MIDI, file transfer, firmware.", "USB type B")
jack("jack.dc", "DC INPUT", "in", "power", None, "24 V DC 5 A, centre positive, 3.0 x 6.5 mm barrel (supply included).", "DC barrel")

# ---------------------------------------------------------------- connections
con("seq.notes", "kbd.seq_in", "cv")
for v, nm in VOICES:
    con("kbd.pitch", f"{v}_drive_ctl.pitch", "cv", note="Note to target motor speed; voice DETUNE and SCALE applied.")
    con("kbd.gate", f"{v}_drive_ctl.gate", "gate", note="Note-on starts ACCEL, note-off starts BRAKE.")
    con("drift.out", f"{v}_drive_ctl.mod", "cv", amount="osc.detune")
    con(f"{v}_drive_ctl.rpm", f"{v}_motor.rpm", "cv", note="Motor speed = pitch; physical inertia limits how fast it can change.")
    for out_, in_, w in (("m", "m", "m"), ("opt_sine", "sine", "opt_sine"), ("opt_saw", "saw", "opt_saw"), ("opt_sq", "sq", "opt_sq")):
        con(f"{v}_motor.{out_}", f"{v}_wave.{in_}", eq(f"{v}.wave", w))
    con(f"{v}_wave.out", f"{v}_tone.in")
    con(f"{v}_tone.out", f"{v}_vca.in")
    con("kbd.gate", f"{v}_env.gate", "gate")
    con(f"{v}_env.out", f"{v}_vca.cv", "cv", amount=f"{v}.vol")
    con(f"{v}_vca.out", f"{v}_mix.motors", note="Four motors summed: paraphonic from here.")
    con(f"{v}_mix.out", f"{v}_drive.in", broken_by=f"jack.{v}_ret", note="Pre-filter send/return: unpatched, the mix passes straight to the drive stage.")
    con(f"{v}_drive.out", f"{v}_vcf.in", amount=f"{v}.drive")
    con("kbd.gate", f"{v}_fenv.gate", "gate")
    con(f"{v}_fenv.out", f"{v}_vcf.cutoff_cv", "cv", amount=f"{v}.env_amt")
    con("kbd.pitch", f"{v}_vcf.cutoff_cv", "cv", eq(f"{v}.keytrack", True), amount=f"{v}.keytrack_amt")
    con("dco_vca.out", f"{v}_mix.dco", eq("dco.route", f"{v}_filter"), note="DCO through this analogue filter.")
con("v1_vcf.out", "xmod.v1")
con("v2_vcf.out", "xmod.v2")
con("xmod.out", "out.v1", amount="xmod.depth", note="Cross mod (FM or RING) applied to the motor voices' output.")
con("v2_vcf.out", "out.v2")
con("kbd.pitch", "dco.pitch_cv", "cv")
con("dco.out", "dco_vca.in")
con("kbd.gate", "dco_env.gate", "gate")
con("dco_env.out", "dco_vca.cv", "cv", amount="dco.vol")
con("dco_vca.out", "dco_vcf.in", eq("dco.route", "dco_filter"))
con("kbd.gate", "dco_fenv.gate", "gate")
con("dco_fenv.out", "dco_vcf.cutoff_cv", "cv", amount="dco.env_amt")
con("dco_vcf.out", "out.dco")
con("input.out", "v1_drive.in", note="Input processing can be routed through the voice filters (vocoder, gate, side-chain).", confidence="inferred")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["mod_matrix"] = {
    "name": "Modulators (3 x 2 assignable slots)", "module": "mod1", "slots": 6, "combine": "single",
    "slot_parameters": [{"slot": i, "source": f"mod{n}.shape", "destination": f"mod{n}.dest_{s_}", "depth": f"mod{n}.depth_{s_}"} for i, (n, s_) in enumerate([(1, "a"), (1, "b"), (2, "a"), (2, "b"), (3, "a"), (3, "b")], start=1)],
    "sources": [{"id": n - 1, "name": f"Modulator {n}", "node": f"mod{n}.out", "per_voice": False} for n in (1, 2, 3)]
               + [{"id": 3, "name": "Mod wheel (MIDI)", "node": "kbd.modwheel", "per_voice": False}, {"id": 4, "name": "Channel pressure (MIDI)", "node": "kbd.pressure", "per_voice": False}],
    "destinations": [{"id": 0, "name": "Any parameter (assigned by moving its control)", "description": "Including other modulators' depth and rate; defaults MOD 1A V1 AMP, MOD 2A ALL CUTOFF, MOD 3A V2 AMP."}],
    "depth_range": {"min": -100, "max": 100},
    "note": "Each modulator has two destination slots with independent depth and SCALE; a MOD ENVELOPE scales its depth. Mod wheel and channel pressure have their own assignable slots.",
}
D["indicators"] = [
    {"id": "oled", "module": "kbd", "label": "OLED display", "kind": "display", "function": "Oscilloscope play screen, per-motor accel/brake status, envelopes, filter, modulators, sequencer."},
    {"id": "mod_target", "module": "mod1", "label": "modulation target symbol", "kind": "display", "function": "Marks any parameter assigned as a destination."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Motor oscillators", "applies_to": ["v1_motor", "v2_motor"],
     "rule": "Each note sets a motor's rotation speed. The M wave comes from an electromagnetic pickup beside the coils (harmonically rich, responds well to drive); OPT SINE/SAW/SQ are infrared readings of printed patterns on a reflective disc, deliberately imperfect. Mechanical noise is damped by soft mounts and acoustic treatment."},
    {"id": "b02", "name": "Inertia and ACCEL / BRAKE", "applies_to": ["v1_drive_ctl", "v2_drive_ctl"],
     "rule": "Motors cannot change speed instantly, so every pitch change slews slightly. TARGET mode: each note starts FROM ±12 semitones away and reaches pitch at the ACCEL rate; on release it moves TO ±12 semitones at the BRAKE rate (curve -2 to +2). GLIDE mode: ACCEL sets rising, BRAKE falling portamento. Per motor; short gates may leave notes off-pitch (a usable detune)."},
    {"id": "b03", "name": "Polyphony and paraphony", "applies_to": ["kbd", "v1_mix", "v2_mix"],
     "rule": "Each voice's four motors can be poly (four notes), duo or unison; each motor has its own amp envelope and VCA. The four are then mixed into one analogue filter per voice (paraphonic), so filter key tracking follows the last note (with optional glide). The DCO mirrors this with four digital oscillators."},
    {"id": "b04", "name": "Filters", "applies_to": ["v1_vcf", "v2_vcf", "dco_vcf"],
     "rule": "Shared controls edit V1, V2 and DCO filters individually or linked: LP24, BP12, HP12, AP24, resonance to self-oscillation (~87), pre-filter drive, bipolar envelope amount, key tracking. Self-oscillating filters track pitch and can be played as oscillators."},
    {"id": "b05", "name": "Cross mod and drift", "applies_to": ["xmod", "drift"],
     "rule": "CROSS MOD multiplies (RING) or frequency-modulates (FM) between the motor voices. DRIFT/DETUNE varies motor speeds for analogue-style detune or drift, assignable per voice."},
    {"id": "b06", "name": "Modulators", "applies_to": ["mod1", "mod2", "mod3"],
     "rule": "Three modulators, each with two destinations (any parameter, including each other), independent depth and scale, a mod envelope on depth, five shapes with detailed shaping, and clocks from internal rate, another modulator, master tempo or note frequency (audio-rate possible)."},
    {"id": "b07", "name": "Performance", "applies_to": ["kbd", "seq"],
     "rule": "8-key keypad with scales and microtuning, four pitch encoders, CLUTCH buffer, arpeggiator with rhythm editor, sequencer (8 patterns per project, chaining, ratchets, micro-timing, probability), 8 motion-rec lanes, randomiser; MIDI (incl. poly aftertouch controllers) and 3 CV / 3 trigger inputs."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "channel_pressure", "note": "assignable slots"}, {"message": "program_change"},
                 {"message": "control_change", "note": "official CC map; CC 1-31 are 14-bit with LSB at CC 33-63; CC 64 sustain not supported"}, {"message": "nrpn", "note": "map in a separate PDF"},
                 {"message": "clock"}, {"message": "start"}, {"message": "stop"}, {"message": "sysex", "note": "parameter dump"}],
    "transmits": [{"message": "control_change"}, {"message": "nrpn"}, {"message": "note_on", "note": "sequencer/arp"}, {"message": "clock"}],
    "note": "From the official CC map (April 2023). Mono/poly mode messages set all voices to minimum/maximum polyphony."}
D["specifications"] = {
    "sound_engine": "electromechanical (8 brushless DC motors) + digital voice", "voices": "2 motor voices x 4 motors + DCO x 4", "polyphony": "4 notes, up to 3 voices per note",
    "waveforms": {"motor": ["M (electromagnetic)", "optical sine", "optical saw", "optical square"], "dco": "6 incl. noise, PWM, fold, sync"},
    "filters": "2 analogue multimode (LP24, BP12, HP12, AP24) + 1 digital", "modulators": 3, "sequencer": "8 patterns per project", "motion_rec_lanes": 8, "display": "OLED 128 x 64",
    "connections": {"out": "1/4\" TRS (mono or split)", "in": "1/4\" TS", "phones": "3.5 mm TRS", "send_return": "2 x 3.5 mm TRS", "cv": 3, "trig": 3, "midi": "DIN in, out; USB-B", "storage": "microSD"},
    "power": "24 V DC 5 A, centre positive", "fan": "variable-speed cooling fan",
}
D["omitted_from_source"] = ["chapters not read in full (DCO, link, mod effects, performance, tempo, arp, sequencer, motion rec, random, clear/reset, input, CV, MIDI assign, presets, settings, firmware, history)",
                            "NRPN and SysEx maps (separate PDFs)", "video material"]
D["not_in_source"] = ["DCO waveshape names and the exact DCO parameter ranges", "motor frequency range in Hz", "CV and trigger voltage ranges", "dimensions and weight", "the exact cross-mod signal routing"]
D["source_inconsistencies"] = [
    "The CC map labels CC 77 'V1 ACCEL FROM' and CC 79 'V1 BRAKE TO' in the V2 block (they duplicate CC 73 and 75); they are taken as V2 FROM and V2 TO.",
    "The Motor Controls chapter calls the optical saw both 'Optical Saw' and 'Optical Triangle \"OPT SAW\"'.",
    "Retailer specifications list the all-pass filter as 12 dB; the manual says 24 dB all-pass.",
    "Overview says amp envelope modes include ADSHR and AD Loop for amp and filter envelopes, while mod envelopes list five modes (no AD Loop, ADS).",
    "Retailer copy describes cross mod as 'amplitude cross-modulation with either Voice 1 or Voice 2'; the MKI manual describes RING and FM modes with Voice 2 modulating.",
]
D["modelling_gaps"] = [
    {"topic": "Electromechanical source", "detail": "Uses the electromechanical_oscillator module type (schema 0.13.0); motor inertia is modelled as a slew limiter ahead of each motor, as the manual describes."},
    {"topic": "Partial manual read", "detail": "Several chapters came from search excerpts; DCO details, input processing routing and the matrix destination list are summarised."},
    {"topic": "Per-motor scope", "detail": "Motor, envelope and VCA modules are per_voice (one per motor/note); mixers, filters and effects are per motor voice."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/gamechanger-audio-motor-synth-mkii_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
