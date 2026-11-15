#!/usr/bin/env python3
"""Assemble the Oberheim TEO-5 device file (schema 0.12.0).

Five-voice analogue poly (44-key keyboard or desktop module): two VCOs per voice with
simultaneous triangle/saw/pulse, sub oscillator, noise, through-zero X-Mod (Osc 2 triangle
to Osc 1) and sync, a 12 dB SEM-lineage state-variable filter (LP-notch-HP, optional BP),
two DADSR envelopes with fixed routing schemes, a global LFO and a poly LFO each with a
direct destination, a 16-slot mod matrix (19 sources, 64 destinations), overdrive, vintage,
one digital effect plus reverb, unison/chord memory, arpeggiator, 64-step polyphonic
step sequencer and 512 programs.

Sources: TEO-5 User Guide (supplied), Oberheim's TEO-5 MIDI Implementation document
(CC, NRPN and SysEx), Oberheim product page and retailer specifications.
"""
import json

S10 = {"min": 0, "max": 10}
K127 = {"min": 0, "max": 127}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, nrpn=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("hold")} if "hold" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    if nrpn is not None:
        acc = acc + [{"type": "midi", "message": f"NRPN {nrpn}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, cc=None, nrpn=None, **kw):
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, cc=cc, nrpn=nrpn, **kw)


def btn(id, module, label, fn, cc=None, nrpn=None, **kw):
    par(id, module, label, "boolean", fn, control="push_button", cc=cc, nrpn=nrpn, **kw)


def enum(id, module, label, fn, vals, control="push_button", cc=None, nrpn=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, nrpn=nrpn, values=[{"value": v} for v in vals], **kw)


def prog(id, module, label, kind, fn, cc=None, nrpn=None, **kw):
    acc = [{"type": "menu", "note": "PROGRAM menu"}]
    if "hold" in kw:
        acc.insert(0, {"type": "panel", "control": "push_button", "note": kw.pop("hold")})
    par(id, module, label, kind, fn, access=acc, cc=cc, nrpn=nrpn, **kw)


def glob(id, label, kind, fn, n, nrpn=None, **kw):
    acc = [{"type": "menu", "note": f"GLOBAL menu, {n}"}] + ([{"type": "midi", "message": f"NRPN {nrpn}"}] if nrpn else [])
    par(id, "kbd", label, kind, fn, memory="global", access=acc, **kw)


def jack(id, label, direction, signal, node, fn, connector, **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "cv", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


D["device"] = {
    "id": "oberheim-teo-5", "manufacturer": "Oberheim", "model": "TEO-5",
    "category": "5-voice analogue polyphonic synthesizer, 44-key Fatar keyboard (also desktop module), with digital effects",
    "based_on": "Draws on the Oberheim OB-X, Four Voice and TVS: SEM-lineage state-variable filter, OB-8 envelope curves; released 2024 (Oberheim, with Sequential).",
    "sources": [
        {"id": "guide", "title": "Oberheim TEO-5 User Guide", "kind": "user_manual", "file": "TEO-5_User_Manual.pdf", "pages": 116,
         "note": "Rear panel, 34 globals, every section, mod matrix (Appendix A sources, B destinations), unison/chord memory, effects, arpeggiator, sequencer, clock, alternative tunings."},
        {"id": "midi_impl", "title": "Oberheim, 'TEO-5 MIDI Implementation'", "kind": "spec_sheet", "file": "https://oberheim.com/wp-content/uploads/2024/08/TEO-5-MIDI-Implementation-Document.pdf",
         "note": "Official CC table, program NRPNs 1-187, global NRPNs 4096-4122, control NRPN 4188, SysEx inquiry, dump requests and packed data format."},
        {"id": "product", "title": "Oberheim TEO-5 product page; Thomann and other retailer specifications", "kind": "other", "file": "https://oberheim.com/products/teo-5/",
         "note": "44-key semi-weighted Fatar keybed with channel aftertouch; 635 x 324 x 112 mm; 7.7 kg (17 lb); desktop 6.8 lb."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 5, "polyphony_mode": "5-voice polyphonic; unison 1-5 voices with key priority, or chord memory (up to 5 notes)",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "512 programs: 256 user and 256 factory (factory button toggles); sequences, chord memory, effects and per-program scale saved with the program; add-on banks via bank select 9-12.",
    "semi_modular": False, "panel_counts": {"keys": 44, "program_select_buttons": 16},
    "summary": ("Per voice: Osc 1 and Osc 2 (triangle, saw, pulse, any combination; 5-octave + minor-third range; Osc 2 detune), a sub from Osc 1, white/pink noise, through-zero X-Mod "
                "(Osc 2 triangle to Osc 1) and hard sync (Osc 2 resets Osc 1); a mixer of on/level per source; a 12 dB/oct SEM-lineage state-variable filter whose STATE morphs low-pass, "
                "notch (or band-pass) and high-pass, non-self-oscillating; Osc 2 can bypass the filter. Two DADSR envelopes (OB-8 curves) on fixed routings. LFO 1 global, LFO 2 per voice, "
                "five shapes each with a direct destination. 16-slot mod matrix. Analogue overdrive and vintage knob; one digital effect (12 types) plus plate reverb. Arpeggiator, 64-step "
                "polyphonic sequencer, low split (keyboard)."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "KEYBOARD / UNISON / TRANSPOSE", "44-key Fatar (velocity, channel aftertouch) or MIDI; 5 voices, unison 1-5 with key mode, chord memory, hold, portamento (per oscillator), transpose, low split.",
    ["kbd.midi_in", "kbd.sustain", "kbd.pedal", "kbd.seq_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend", "kbd.pedal_out"], scope="common", props={"keys": 44})
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATORS", "Analogue VCO: triangle, saw and pulse together; key tracking switchable; receives through-zero X-Mod and sync from Osc 2.", ["osc1.pitch_cv", "osc1.xmod", "osc1.sync_in"], ["osc1.out"])
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATORS", "Analogue VCO: triangle, saw and pulse together; detune ±49.2 cents; its triangle drives X-Mod; can bypass the filter.", ["osc2.pitch_cv"], ["osc2.out", "osc2.tri"])
mod("sub", "oscillator", "Sub oscillator", "FILTER (mixer)", "Sub oscillator generated from Osc 1.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "FILTER (mixer)", "White or pink noise.", [], ["noise.out"])
mod("mixer", "mixer", "Mixer", "FILTER (mixer)", "Osc 1, Sub, Osc 2 and Noise buttons, each with a level (hold the button and turn VALUE).", ["mixer.osc1", "mixer.sub", "mixer.osc2", "mixer.noise"], ["mixer.out"])
mod("vcf", "filter", "State-variable filter", "FILTER", "Discrete SEM-lineage 12 dB/oct (2-pole) state-variable filter; STATE morphs low-pass, notch (band-pass when enabled) and high-pass; resonance; does not self-oscillate.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"slope_db_per_oct": 12})
mod("vca", "vca", "VCA", "ENVELOPES", "Voice amplifier with pan; Osc 2 can join here when it bypasses the filter.", ["vca.in", "vca.bypass_in", "vca.cv"], ["vca.out"])
mod("env1", "envelope", "Envelope 1", "ENVELOPES", "DADSR (OB-8 curves): filter envelope, or auxiliary (via the matrix) depending on ENV ROUTING; bipolar amount, velocity, repeat.", ["env1.gate", "env1.velocity"], ["env1.out"])
mod("env2", "envelope", "Envelope 2", "ENVELOPES", "DADSR: amp; filter + amp; or filter + gated amp, per ENV ROUTING; bipolar amount, velocity, repeat.", ["env2.gate", "env2.velocity"], ["env2.out"])
mod("lfo1", "lfo", "LFO 1 (global)", "LFO", "Monophonic LFO, 0.022-500 Hz or synced: triangle, saw, reverse saw, square, S&H; amount to one direct destination; slew, note reset.", ["lfo1.reset"], ["lfo1.out"], scope="common",
    props={"rate_hz": [0.022, 500]})
mod("lfo2", "lfo", "LFO 2 (poly)", "LFO", "Per-voice LFO with the same controls as LFO 1.", ["lfo2.reset"], ["lfo2.out"], props={"rate_hz": [0.022, 500]})
mod("drive", "overdrive", "Overdrive", "OVERDRIVE", "Analogue overdrive on the voice sum, separate from the digital effects.", ["drive.in"], ["drive.out"], scope="common")
mod("fx", "effects", "Effect", "EFFECT", "One digital effect: stereo delay, BBD, tape delay 1/2, chorus, flanger, phaser, HP filter, distortion, ring mod (Maestro/Oberheim), rotating speaker, lo-fi; tempo sync for delays.",
    ["fx.in"], ["fx.out"], scope="common")
mod("reverb", "reverb", "Reverb", "REVERB", "Plate reverb: mix, decay, pre-delay, tone (HP and LP), size.", ["reverb.in"], ["reverb.out"], scope="common")
mod("arp", "sequencer", "Arpeggiator and sequencer", "ARPEGGIATOR / SEQUENCER / CLOCK", "Arpeggiator (up, down, up+down, random, assign; 1-3 octaves; repeats; relatch) and 64-step polyphonic step sequencer (up to 5-note chords, rests, ties); 30-250 BPM.",
    [], ["arp.notes"], scope="common", props={"tempo_bpm": [30, 250], "steps": 64})
mod("out", "output", "Output", "VOLUME / rear panel", "Stereo outputs (or mono via global), headphones; master and program volume.", ["out.in"], ["out.left", "out.right", "out.phones"], scope="common")

# ---------------------------------------------------------------- oscillators and mixer
knob("osc1.freq", "osc1", "OSC 1 FREQUENCY", "5 octaves plus a minor third, in semitones.", 8, 1, range={"min": 0, "max": 63})
knob("osc2.freq", "osc2", "OSC 2 FREQUENCY", "5 octaves plus a minor third, in semitones.", 13, 2, range={"min": 0, "max": 63})
knob("osc2.detune", "osc2", "OSC 2 DETUNE", "±49.2 cents; centre detent; LED lit when detuned.", 109, 4, range={"min": 0, "max": 63})
prog("osc1.detune", "osc1", "Osc 1 Detune", "integer", "±49.2 cents.", None, 3, range={"min": 0, "max": 63})
for o, cc_tri, cc_saw, cc_pulse, n_tri, n_saw, n_pulse, cc_pw, n_pw in (("osc1", 102, 104, 106, 7, 9, 11, 94, 5), ("osc2", 103, 105, 107, 8, 10, 12, 95, 6)):
    btn(f"{o}.tri", o, f"{o.upper().replace('OSC', 'OSC ')} TRIANGLE", "Triangle on.", cc_tri, n_tri)
    btn(f"{o}.saw", o, f"{o.upper().replace('OSC', 'OSC ')} SAW", "Sawtooth on.", cc_saw, n_saw)
    btn(f"{o}.pulse", o, f"{o.upper().replace('OSC', 'OSC ')} PULSE", "Pulse on.", cc_pulse, n_pulse)
    prog(f"{o}.pw", o, f"{o.capitalize().replace('osc', 'Osc ')} PW", "integer", "Pulse width 50% (minimum) to 100% (silent).", cc_pw, n_pw, hold=f"hold {o.upper()} PULSE and turn PULSE WIDTH or VALUE", range=K127)
par("osc.pw_knob", "osc1", "PULSE WIDTH", "continuous", "Moves both pulse widths together, keeping their offset (always relative).", memory="none", panel_scale=S10)
btn("osc1.sync", "osc1", "SYNC 2-1", "Osc 2 resets Osc 1 each cycle.", 39, 27)
knob("osc.xmod", "osc1", "X-MOD", "Through-zero FM from Osc 2's triangle to Osc 1.", 44, 26)
prog("osc1.key_on", "osc1", "Osc 1 Key On", "boolean", "Osc 1 tracks the keyboard.", 87, 24, default=True)
prog("osc2.key_on", "osc2", "Osc 2 Key On", "boolean", "Osc 2 tracks the keyboard.", 88, 25, default=True)
prog("osc2.bypass", "osc2", "Osc 2 Filter Bypass", "boolean", "Routes Osc 2 straight to the VCA.", 117, 28)
for src, lab, cc_on, n_on, cc_lv, n_lv in (("osc1", "OSC 1", 9, 13, 40, 15), ("sub", "SUB", 14, 17, 42, 18), ("osc2", "OSC 2", 10, 14, 41, 16), ("noise", "NOISE", 15, 19, 43, 21)):
    btn(f"mixer.{src}_on", "mixer", lab, f"{lab} into the filter (level 127 when first enabled).", cc_on, n_on)
    knob(f"mixer.{src}", "mixer", f"{lab} level", f"{lab} level (hold the button and turn VALUE).", cc_lv, n_lv, hold=f"hold {lab} and turn VALUE")
prog("noise.type", "noise", "Noise type", "enum", "White or pink.", 108, 20, values=[{"value": "white"}, {"value": "pink"}])
# filter
knob("vcf.cutoff", "vcf", "CUTOFF", "Cutoff (NRPN 0-1024).", 33, 34)
knob("vcf.resonance", "vcf", "RESONANCE", "Emphasis (NRPN 0-265); no self-oscillation.", 34, 36)
knob("vcf.state", "vcf", "STATE", "Low-pass to notch (or band-pass) to high-pass (NRPN 0-512).", 35, 38)
prog("vcf.bandpass", "vcf", "Filter Bandpass", "boolean", "Band-pass replaces notch at the centre of STATE (bp LED).", 110, 37)
prog("vcf.key_amt", "vcf", "Filter Key Amt", "integer", "Keyboard tracking of cutoff.", 36, 40, range=K127)
# envelopes
for e, ccs, ns in (("env1", (45, 46, 47, 48, 49, 50, 51), (79, 81, 83, 85, 87, 75, 77)), ("env2", (52, 53, 54, 55, 56, 57, 58), (80, 82, 84, 86, 88, 76, 78))):
    lab = e.upper().replace("ENV", "ENV ")
    prog(f"{e}.delay", e, f"{lab} Delay", "integer", "Delay before the attack.", ccs[0], ns[0], range=K127)
    for k, nm in enumerate(("attack", "decay", "sustain", "release"), start=1):
        knob(f"{e}.{nm}", e, f"{lab} {nm.upper()}", f"{nm.title()} (NRPN 0-256 for times).", ccs[k], ns[k])
    knob(f"{e}.amount", e, f"{lab} AMOUNT", "Bipolar envelope amount (negative inverts).", ccs[5], ns[5], panel_scale={"min": -5, "max": 5})
    btn(f"{e}.vel", e, f"{lab} VELOCITY", "Velocity to the envelope's effect.", ccs[6], ns[6])
enum("env.routing", "env1", "ENV ROUTING", "Env 1 filter + Env 2 amp; Env 1 aux + Env 2 filter+amp; Env 1 aux + Env 2 filter+gate.", ["env1_filter__env2_amp", "env1_aux__env2_filter_amp", "env1_aux__env2_filter_gate"], cc=69, nrpn=89)
prog("env1.dest", "env1", "Env 1 Dest", "enum", "Direct destination for Env 1 when routed as aux.", None, 90, values=[{"value": "mod destinations 0-61"}], note="Present in the NRPN table; the guide routes aux Env 1 through the matrix.")
prog("env.repeat", "env1", "Env Repeat", "enum", "Delay-attack-decay loop while held.", 116, 91, values=[{"value": v} for v in ["off", "env1", "env2", "env1_env2"]])
prog("env.retrig", "env1", "Unison Env Retrig", "boolean", "Retrigger envelopes on legato notes in unison.", 73, 154)
# LFOs
for n, ccs, ns in ((1, (75, 76, 77, 78, 79, 111, 92), (58, 60, 62, 64, 70, 68, 72)), (2, (80, 81, 82, 83, 84, 112, 93), (59, 61, 63, 65, 71, 69, 73))):
    l = f"lfo{n}"
    knob(f"{l}.freq", l, f"LFO {n} FREQUENCY", "0.022-500 Hz.", ccs[0], ns[0], physical={"min": 0.022, "max": 500, "unit": "Hz"})
    knob(f"{l}.amt", l, f"LFO {n} AMOUNT", "Amount to the LFO's direct destination (NRPN 0-256, bipolar).", ccs[1], ns[1])
    enum(f"{l}.shape", l, f"LFO {n} SHAPE", "Waveform.", ["triangle", "saw", "reverse_saw", "square", "sample_hold"], cc=ccs[2], nrpn=ns[2])
    btn(f"{l}.sync", l, f"LFO {n} SYNC", "Clock sync (hold to show the division).", ccs[3], ns[3])
    prog(f"{l}.note_reset", l, f"LFO {n} Note Reset", "boolean", "Restart on new notes (not on added legato notes).", ccs[4], ns[4])
    prog(f"{l}.freq_sync", l, f"LFO {n} Freq Sync", "integer", "Clock division index when synced.", ccs[5], ns[5], range={"min": 0, "max": 15})
    prog(f"{l}.slew", l, f"LFO {n} Slew", "integer", "Smooths the waveform.", ccs[6], ns[6], range=K127)
    par(f"{l}.dest", l, f"LFO {n} DESTINATION", "enum", "Direct destination (shown in the display).", control="push_button", nrpn=66 + n - 1, values=[{"value": "mod destinations 0-61"}])
# mod matrix slots
for s in range(1, 17):
    par(f"mm.{s}.source", "kbd", f"Mod {s} source", "enum", "Matrix source (0 off, 1-19).", access=[{"type": "menu", "note": "MOD: select slot, source"}, {"type": "midi", "message": f"NRPN {104 + s}"}],
        values=[{"value": "see mod_matrix sources"}])
    par(f"mm.{s}.amount", "kbd", f"Mod {s} amount", "integer", "Bipolar amount.", access=[{"type": "menu", "note": "MOD: amount"}, {"type": "midi", "message": f"NRPN {120 + s}"}], range={"min": -127, "max": 127})
    par(f"mm.{s}.dest", "kbd", f"Mod {s} destination", "enum", "Matrix destination (0 none, 1-64).", access=[{"type": "menu", "note": "MOD: destination"}, {"type": "midi", "message": f"NRPN {136 + s}"}],
        values=[{"value": "see mod_matrix destinations"}])
btn("ui.src_assign", "kbd", "SOURCE / SRC ASSIGN", "Shows the matrix; hold and move a control (or press keys) to pick the source.", memory="none")
btn("ui.dest_assign", "kbd", "DESTINATION / DEST ASSIGN", "Hold and move a control to pick the destination.", memory="none")
# other sound controls
knob("drive.amount", "drive", "OVERDRIVE", "Analogue overdrive.", 67, 95)
knob("vintage", "kbd", "VINTAGE", "Voice-to-voice filter, pitch and envelope variation.", 37, 96)
btn("fx.on", "fx", "EFFECT ON/OFF", "Effect on.", 16, 42)
enum("fx.type", "fx", "TYPE", "Effect type.", ["stereo_delay", "bbd", "tape_delay_1", "tape_delay_2", "chorus", "flanger", "phaser", "hp_filter", "distortion", "ring_mod", "rotating_speaker", "lo_fi"],
     control="encoder", cc=17, nrpn=43, note="CC/NRPN range 0-12 (13 values) for 12 listed types.")
knob("fx.time", "fx", "TIME", "Delay time, rate, frequency, gain, carrier or speed (per type).", 18, 45)
knob("fx.mix", "fx", "DEPTH/MIX", "Mix or depth (per type).", 19, 44)
knob("fx.misc", "fx", "FBACK/MISC", "Feedback, LPF, resonance, tone, pitch track, mic distance or drive (per type).", 20, 46)
prog("fx.sync", "fx", "FX Sync", "boolean", "Sync delays to the clock.", 21, 47)
prog("fx.sync_rate", "fx", "FX Sync Rate", "integer", "Division index.", 22, 48, range={"min": 0, "max": 10})
btn("reverb.on", "reverb", "REVERB ON/OFF", "Reverb on.", 23, 50)
for k, (nm, cc, n) in enumerate((("mix", 24, 52), ("size", 25, 53), ("predelay", 26, 54), ("decay", 27, 55), ("tone", 28, 56))):
    knob(f"reverb.{nm}", "reverb", f"REVERB {nm.upper()}", f"Reverb {nm}.", cc, n)
# voicing, glide, arp, seq
btn("kbd.unison", "kbd", "UNISON", "Unison or chord memory (hold a chord and press).", 31, 97)
prog("kbd.unison_voices", "kbd", "Unison voices", "integer", "Voices stacked (hold UNISON and turn VALUE).", 70, 98, hold="hold UNISON and turn VALUE", range={"min": 1, "max": 5})
prog("kbd.unison_detune", "kbd", "Unison Detune", "integer", "0-7.", 71, 99, range={"min": 0, "max": 7})
prog("kbd.key_mode", "kbd", "Unison Key Mode", "enum", "Note priority.", 72, 153, values=[{"value": v} for v in ["low", "high", "last"]])
btn("kbd.glide_on", "kbd", "PORTAMENTO", "Glide on.", 68, 31)
knob("kbd.glide_rate", "kbd", "PORTAMENTO RATE", "Glide amount for both oscillators.", None, None, confidence="inferred", note="The panel rate sets glide; per-oscillator values are Osc 1/2 Glide.")
prog("osc1.glide", "osc1", "Osc 1 Glide", "integer", "Osc 1 glide amount.", 65, 22, range=K127)
prog("osc2.glide", "osc2", "Osc 2 Glide", "integer", "Osc 2 glide amount.", 66, 23, range=K127)
prog("kbd.glide_mode", "kbd", "Portamento Mode", "enum", "Fixed rate (default), fixed rate A, fixed time, fixed time A (A modes need unison).", 5, 30,
     values=[{"value": v} for v in ["fixed_rate", "fixed_rate_a", "fixed_time", "fixed_time_a"]])
prog("kbd.bend_up", "kbd", "Pitch Bend Up", "integer", "0-12 semitones.", 85, 32, range={"min": 0, "max": 12})
prog("kbd.bend_down", "kbd", "Pitch Bend Down", "integer", "0-24 semitones.", 86, 33, range={"min": 0, "max": 24})
prog("out.voice_volume", "out", "Voice Volume (ProgVolume)", "integer", "Program volume.", 12, 93, range=K127)
prog("out.pan", "out", "Pan", "integer", "Voice pan.", 113, None, range=K127)
prog("kbd.scale", "kbd", "Scale", "enum", "Global or one of 65 tunings per program.", 114, 155, values=[{"value": "global"}, {"value": "tunings 1-65"}])
enum("kbd.transpose", "kbd", "TRANSPOSE", "Octave transpose (saved per program).", ["-2", "-1", "0", "+1", "+2"], cc=115, nrpn=156)
btn("kbd.split1", "kbd", "LOW SPLIT -1 OCT", "Notes below the split play an octave lower.", 29, 180)
btn("kbd.split2", "kbd", "LOW SPLIT -2 OCT", "Notes below the split play two octaves lower.", 30, 181)
prog("kbd.split_note", "kbd", "Key Split Note", "integer", "Split point (hold both split buttons and press a key).", 89, 182, hold="hold both LOW SPLIT buttons", range={"min": 0, "max": 43})
btn("kbd.hold", "kbd", "HOLD", "Sustains played notes; latches the arpeggio.", memory="none")
btn("arp.on", "arp", "ARP ON/OFF", "Arpeggiator on.", 59, 183)
enum("arp.mode", "arp", "ARP MODE", "Note order.", ["up", "down", "up_down", "random", "assign"], cc=60, nrpn=184)
enum("arp.octave", "arp", "ARP OCTAVE", "1-3 octaves.", ["1", "2", "3"], cc=61, nrpn=185)
enum("arp.repeat", "arp", "ARP REPEAT", "Repeats per note.", ["0", "1", "2", "3"], cc=62, nrpn=186)
prog("arp.relatch", "arp", "Arp Relatch", "boolean", "New notes restart the held arpeggio.", None, 187)
knob("arp.bpm", "arp", "BPM / TAP TEMPO", "30-250 BPM (tap four times).", 3, 157, range={"min": 30, "max": 250})
enum("arp.divide", "arp", "CLOCK DIVIDE", "Note value.", ["1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/64"], control="encoder", cc=63, nrpn=158)
btn("seq.play", "arp", "PLAY", "Sequencer play/stop.", 90, 4188, memory="none")
btn("seq.record", "arp", "RECORD", "Step recording (PROGRAM = rest, WRITE = tie); hold with a key to transpose.", 91, None, memory="none")
par("out.volume", "out", "VOLUME", "continuous", "Master and headphone volume.", memory="none", cc=7, panel_scale=S10)
par("kbd.pitch_wheel", "kbd", "PITCH wheel", "continuous", "Bend.", memory="none", access=[{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "pitch bend"}], panel_scale={"min": -1, "max": 1})
par("kbd.mod_wheel", "kbd", "MOD wheel", "continuous", "Matrix source.", memory="none", control="wheel", cc=1, panel_scale=K127)
for pid, label, fn in (("ui.factory", "FACTORY", "Factory set on/off."), ("ui.bank", "BANK", "Hold with 1-8 for the bank."), ("ui.prog", "PROGRAM 1-16", "Program select."),
                       ("ui.manual", "MANUAL", "Live panel mode."), ("ui.write", "WRITE", "Save; tie in sequencer recording."), ("ui.global", "GLOBAL", "Global menu."),
                       ("ui.program", "PROGRAM (settings)", "Program menu; rest in sequencer recording; cancels save."), ("ui.select", "SELECT", "Scroll menus."), ("ui.value", "VALUE", "Set values.")):
    par(pid, "kbd", label, "boolean", fn, memory="none", control="encoder" if pid in ("ui.select", "ui.value") else "push_button")
# globals
G = [("sys.coarse", "Master Coarse", "integer", "±12 semitones.", "1", 4096, {"range": {"min": -12, "max": 12}}), ("sys.fine", "Master Fine", "integer", "±50 cents.", "2", 4097, {"range": {"min": -50, "max": 50}}),
     ("sys.local", "Local Control", "enum", "All off, keys/wheels off, on.", "3", 4111, {"values": [{"value": v} for v in ["all_off", "keys_wheels_off", "on"]]}),
     ("sys.mono", "Mono/Stereo", "enum", "Mono defeats all pan.", "4", 4112, {"values": [{"value": "mono"}, {"value": "stereo"}], "default": "stereo"}),
     ("sys.pot_mode", "Pot Mode", "enum", "Relative, passthru, jump.", "5", 4113, {"values": [{"value": v} for v in ["relative", "passthru", "jump"]]}),
     ("sys.foot_function", "Foot Function", "enum", "Sustain, arp hold, arp hold momentary, seq start/stop.", "6", 4116, {"values": [{"value": v} for v in ["sustain", "arp_hold", "arp_hold_mom", "seq_start_stop"]]}),
     ("sys.pedal_polarity", "Pedal Polarity", "enum", "Normal or reversed (footswitch).", "7", 4115, {"values": [{"value": "normal"}, {"value": "reversed"}]}),
     ("sys.pedal_function", "Pedal Function", "enum", "Expression pedal as breath CC2, foot CC4, expression CC11, LPF full or LPF half.", "8", 4114,
      {"values": [{"value": v} for v in ["breath_cc2", "foot_cc4", "exp_cc11", "lpf_full", "lpf_half"]]}),
     ("sys.at_on", "Aftertouch On", "boolean", "Aftertouch on/off.", "9", 4118, {"default": True}), ("sys.at_curve", "Aftertouch Curve", "integer", "Curves 1-8.", "10", 4119, {"range": {"min": 1, "max": 8}}),
     ("sys.vel_curve", "Velocity Curve", "integer", "Curves 1-7 (NRPN 0-7).", "11", 4120, {"range": {"min": 1, "max": 7}}),
     ("sys.scale", "Scale (Alt Tuning)", "enum", "Equal temperament or tunings 2-65 (replaceable by SysEx).", "12", 4117, {"values": [{"value": "equal_temperament"}, {"value": "tunings 2-65"}]}),
     ("sys.screensaver", "Screen Saver", "boolean", "OLED screen saver.", "13", 4121, {"default": True}),
     ("sys.midi_channel", "MIDI Channel", "enum", "All (sends on 1) or 1-16.", "14", 4098, {"values": [{"value": "all"}, {"value": "1..16"}]}),
     ("sys.clock_mode", "Clock Mode", "enum", "Off, out, out no S/S, in, in thru, in no S/S.", "15", 4099, {"values": [{"value": v} for v in ["off", "out", "out_no_ss", "in", "in_thru", "in_no_ss"]]}),
     ("sys.clock_in", "Clock Cable In", "enum", "MIDI or USB.", "16", 4100, {"values": [{"value": "midi"}, {"value": "usb"}]}),
     ("sys.clock_out", "Clock Cable Out", "enum", "None, MIDI, USB, all.", "17", 4101, {"values": [{"value": v} for v in ["none", "midi", "usb", "all"]]}),
     ("sys.param_send", "MIDI Param Send", "enum", "Off, CC or NRPN.", "18", 4102, {"values": [{"value": v} for v in ["off", "cc", "nrpn"]]}),
     ("sys.param_rcv", "MIDI Param Receive", "enum", "Off, CC or NRPN.", "19", 4103, {"values": [{"value": v} for v in ["off", "cc", "nrpn"]]}),
     ("sys.midi_control", "MIDI Control On", "boolean", "Respond to wheels, pedal, breath, volume, expression.", "20", 4104, {"default": True}),
     ("sys.sysex", "MIDI Sysex On", "boolean", "Receive SysEx.", "21", 4105, {}), ("sys.sysex_cable", "MIDI Sysex Cable", "enum", "MIDI or USB.", "22", 4106, {"values": [{"value": "midi"}, {"value": "usb"}]}),
     ("sys.out_select", "MIDI Out Select", "enum", "Off, MIDI, USB, all.", "23", 4107, {"values": [{"value": v} for v in ["off", "midi", "usb", "all"]]}),
     ("sys.prog_send", "MIDI Program Send", "boolean", "Send program changes.", "24", 4108, {}), ("sys.prog_rcv", "MIDI Program Receive", "boolean", "Receive program changes.", "25", 4109, {}),
     ("sys.arp_notes", "MIDI Arp Notes", "boolean", "Arpeggiator/sequencer notes out.", "26", 4110, {}),
     ("sys.arp_beat_sync", "Arp Beat Sync", "enum", "Off or quantize.", "27", 4122, {"values": [{"value": "off"}, {"value": "quantize"}]})]
for pid, lab, kind, fn, n, nr, extra in G:
    glob(pid, lab, kind, fn, n, nr, **extra)
for n, (pid, lab, fn) in enumerate((("util.basic", "Basic Program", "Loads the Basic Program (also TRANSPOSE -2 + LOW SPLIT -2)."), ("util.cal_wheels", "Cal Wheels", "Calibrates the wheels."),
                                   ("util.cal_voices", "Cal Voices", "Calibrates VCOs and filters."), ("util.reset", "Reset Globals", "Factory globals."), ("util.dump_preset", "Dump Preset", "SysEx dump."),
                                   ("util.dump_bank", "Dump Bank", "SysEx dump."), ("util.dump_all", "Dump All Banks", "SysEx dump of all user banks.")), start=28):
    par(pid, "kbd", lab, "boolean", fn, memory="none", access=[{"type": "menu", "note": f"GLOBAL menu, {n}"}])

# ---------------------------------------------------------------- ports
jack("jack.out_l", "AUDIO OUT LEFT", "out", "audio", "out.left", "Unbalanced TS.", "6.35 mm TS")
jack("jack.out_r", "AUDIO OUT RIGHT", "out", "audio", "out.right", "Unbalanced TS.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones (VOLUME).", "6.35 mm TRS")
jack("jack.footswitch", "FOOTSWITCH", "in", "gate", "kbd.sustain", "Momentary NO/NC: sustain, arp hold or seq start/stop.", "6.35 mm TS")
jack("jack.pedal", "PEDAL", "in", "cv", "kbd.pedal", "Expression pedal (TRS); a matrix source or filter control.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI.", "USB type B")
jack("jack.power", "AC POWER", "in", "power", None, "IEC, 100-240 V, 20 W, rocker switch.", "IEC C14")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.seq_in")
con("kbd.pitch", "osc1.pitch_cv", eq("osc1.key_on", True))
con("kbd.pitch", "osc2.pitch_cv", eq("osc2.key_on", True))
con("kbd.pitch", "sub.pitch_cv", eq("osc1.key_on", True), note="Sub follows Osc 1.")
for o in ("osc1", "osc2"):
    con("kbd.bend", f"{o}.pitch_cv", amount="kbd.bend_up")
con("osc2.tri", "osc1.xmod", "audio", amount="osc.xmod", note="Through-zero FM.")
con("osc2.out", "osc1.sync_in", "sync", eq("osc1.sync", True))
con("osc1.out", "mixer.osc1", "audio", eq("mixer.osc1_on", True), amount="mixer.osc1")
con("sub.out", "mixer.sub", "audio", eq("mixer.sub_on", True), amount="mixer.sub")
con("osc2.out", "mixer.osc2", "audio", {"all": [eq("mixer.osc2_on", True), eq("osc2.bypass", False)]}, amount="mixer.osc2")
con("osc2.out", "vca.bypass_in", "audio", {"all": [eq("mixer.osc2_on", True), eq("osc2.bypass", True)]}, amount="mixer.osc2", note="Filter bypass.")
con("noise.out", "mixer.noise", "audio", eq("mixer.noise_on", True), amount="mixer.noise")
con("mixer.out", "vcf.in", "audio")
con("env1.out", "vcf.cutoff_cv", eq("env.routing", "env1_filter__env2_amp"), amount="env1.amount")
con("env2.out", "vcf.cutoff_cv", anyof("env.routing", "env1_aux__env2_filter_amp", "env1_aux__env2_filter_gate"), amount="env2.amount")
con("kbd.pitch", "vcf.cutoff_cv", amount="vcf.key_amt")
con("vcf.out", "vca.in", "audio")
con("env2.out", "vca.cv", anyof("env.routing", "env1_filter__env2_amp", "env1_aux__env2_filter_amp"), amount="env2.amount")
con("kbd.gate", "vca.cv", "gate", eq("env.routing", "env1_aux__env2_filter_gate"), note="Gated amp; Env 2 velocity then affects only the filter.")
con("kbd.gate", "env1.gate", "gate")
con("kbd.gate", "env2.gate", "gate")
con("kbd.velocity", "env1.velocity", eq("env1.vel", True))
con("kbd.velocity", "env2.velocity", eq("env2.vel", True))
con("kbd.gate", "lfo1.reset", "gate", eq("lfo1.note_reset", True))
con("kbd.gate", "lfo2.reset", "gate", eq("lfo2.note_reset", True))
con("vca.out", "drive.in", "audio", note="Five voices summed, panned in stereo.")
con("drive.out", "fx.in", "audio", amount="drive.amount")
con("fx.out", "reverb.in", "audio")
con("reverb.out", "out.in", "audio", amount="out.voice_volume")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
SRC = ["Off", "Osc 2", "Noise", "LFO 1", "LFO 2", "Env 1", "Env 2", "Voice Spread", "Pitch Bend", "Mod Wheel", "Pressure", "Breath", "Foot Pedal", "Expression Pedal", "Velocity", "Note Number", "Filter Out",
       "Random", "DC", "Audio Out"]
SRC_NODE = {"Osc 2": "osc2.out", "Noise": "noise.out", "LFO 1": "lfo1.out", "LFO 2": "lfo2.out", "Env 1": "env1.out", "Env 2": "env2.out", "Pitch Bend": "kbd.bend", "Mod Wheel": "kbd.modwheel",
            "Pressure": "kbd.aftertouch", "Expression Pedal": "kbd.pedal_out", "Velocity": "kbd.velocity", "Note Number": "kbd.pitch", "Filter Out": "vcf.out", "Audio Out": "out.left"}
MONO = {"LFO 1", "Pitch Bend", "Mod Wheel", "Pressure", "Breath", "Foot Pedal", "Expression Pedal", "DC", "Audio Out"}
DST = ["No Dest", "Osc 1 Frequency", "Osc 2 Frequency", "Osc All Frequency", "Osc 1 Detune", "Osc 2 Detune", "Osc All Detune", "Osc 1 Pulse Width", "Osc 2 Pulse Width", "Osc All Pulse Width",
       "Osc 1 Level", "Osc 2 Level", "Sub Level", "Noise", "X-Mod Level", "Cutoff", "Resonance", "Filter State", "FX Mix", "FX Time", "FX Misc", "Reverb Mix", "Reverb Size", "Reverb PreDelay",
       "Reverb Decay", "Reverb Tone", "LFO 1 Freq", "LFO 2 Freq", "LFO All Freq", "LFO 1 Amt", "LFO 2 Amt", "LFO All Amt", "Env 1 Amt", "Env 2 Amt", "Env 1 Delay", "Env 2 Delay", "Env 1 Attack",
       "Env 2 Attack", "Env 1 Decay", "Env 2 Decay", "Env 1 Sustain", "Env 2 Sustain", "Env 1 Release", "Env 2 Release", "Voice Volume", "Panning", "Overdrive", "Vintage Amount", "Unison Detune"] + \
      [f"Mod {i} Amount" for i in range(1, 17)]
DST_PARAM = {"Osc 1 Frequency": "osc1.freq", "Osc 2 Frequency": "osc2.freq", "Osc 1 Detune": "osc1.detune", "Osc 2 Detune": "osc2.detune", "Osc 1 Pulse Width": "osc1.pw", "Osc 2 Pulse Width": "osc2.pw",
             "Osc 1 Level": "mixer.osc1", "Osc 2 Level": "mixer.osc2", "Sub Level": "mixer.sub", "Noise": "mixer.noise", "X-Mod Level": "osc.xmod", "Cutoff": "vcf.cutoff", "Resonance": "vcf.resonance",
             "Filter State": "vcf.state", "FX Mix": "fx.mix", "FX Time": "fx.time", "FX Misc": "fx.misc", "Reverb Mix": "reverb.mix", "Reverb Size": "reverb.size", "Reverb PreDelay": "reverb.predelay",
             "Reverb Decay": "reverb.decay", "Reverb Tone": "reverb.tone", "LFO 1 Freq": "lfo1.freq", "LFO 2 Freq": "lfo2.freq", "LFO 1 Amt": "lfo1.amt", "LFO 2 Amt": "lfo2.amt", "Env 1 Amt": "env1.amount",
             "Env 2 Amt": "env2.amount", "Env 1 Delay": "env1.delay", "Env 2 Delay": "env2.delay", "Env 1 Attack": "env1.attack", "Env 2 Attack": "env2.attack", "Env 1 Decay": "env1.decay",
             "Env 2 Decay": "env2.decay", "Env 1 Sustain": "env1.sustain", "Env 2 Sustain": "env2.sustain", "Env 1 Release": "env1.release", "Env 2 Release": "env2.release",
             "Voice Volume": "out.voice_volume", "Panning": "out.pan", "Overdrive": "drive.amount", "Vintage Amount": "vintage", "Unison Detune": "kbd.unison_detune"}
DST_PARAM.update({f"Mod {i} Amount": f"mm.{i}.amount" for i in range(1, 17)})
D["mod_matrix"] = {
    "name": "Modulation matrix", "module": "kbd", "slots": 16, "combine": "single",
    "slot_parameters": [{"slot": s, "source": f"mm.{s}.source", "destination": f"mm.{s}.dest", "depth": f"mm.{s}.amount"} for s in range(1, 17)],
    "sources": [{"id": i, "name": n, **({"node": SRC_NODE[n]} if n in SRC_NODE else {}), "per_voice": n not in MONO} for i, n in enumerate(SRC)],
    "destinations": [{"id": i, "name": n, **({"parameter": DST_PARAM[n]} if n in DST_PARAM else {})} for i, n in enumerate(DST)],
    "depth_range": {"min": -127, "max": 127},
    "note": ("16 slots (19 sources plus Off, 64 destinations plus none); the display marks each as mono (M) or poly (P); a mono source on a poly destination acts monophonically. "
             "Shortcut: hold SOURCE and move a control or press keys, hold DESTINATION and move a control. LFO 1/2 and Env 1 also have direct destinations (0-61) outside the slots."),
}
D["indicators"] = [
    {"id": "oled", "module": "kbd", "label": "OLED display", "kind": "display", "function": "Program, mod slots (with M/P flags), menus, effect name, clock division, sequencer step."},
    {"id": "led_bp", "module": "vcf", "label": "bp LED", "kind": "led", "function": "Band-pass active."},
    {"id": "led_detune", "module": "osc2", "label": "detune LED", "kind": "led", "function": "Osc 2 detuned."},
    {"id": "led_tap", "module": "arp", "label": "TAP TEMPO LED", "kind": "led", "function": "Flashes at the BPM."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc1", "osc2", "mixer", "vcf", "vca", "drive", "fx", "reverb"],
     "rule": "Per voice: Osc 1, sub, Osc 2 and noise into the 12 dB state-variable filter (Osc 2 can bypass it), then the VCA and pan. Voices summed into overdrive, one digital effect and the plate reverb, then stereo out (or mono)."},
    {"id": "b02", "name": "Envelope routing", "applies_to": ["env1", "env2", "vcf", "vca"],
     "rule": "ENV ROUTING cycles: Env 1 to filter and Env 2 to amp (default); Env 1 aux and Env 2 to filter and amp; Env 1 aux and Env 2 to filter with the amp gated (velocity then affects only the filter). Env Repeat loops delay-attack-decay."},
    {"id": "b03", "name": "Oscillator interaction", "applies_to": ["osc1", "osc2"],
     "rule": "X-Mod: through-zero FM from Osc 2's triangle to Osc 1 (analogue, may drift). SYNC 2-1: Osc 2 resets Osc 1. The PULSE WIDTH knob moves both widths keeping their offset; hold a pulse button to set one."},
    {"id": "b04", "name": "Global and poly LFOs", "applies_to": ["lfo1", "lfo2"],
     "rule": "LFO 1 is one modulator for all voices; LFO 2 runs per voice, so chords played at different times modulate out of phase. Each has its own direct destination and amount; the matrix can add more."},
    {"id": "b05", "name": "Mod matrix", "applies_to": ["kbd"], "rule": "16 slots of source, bipolar amount and destination; mono and poly sources and destinations as flagged in the display."},
    {"id": "b06", "name": "Unison and chord memory", "applies_to": ["kbd"],
     "rule": "Unison stacks 1-5 voices with detune 0-7 and low/high/last priority. Hold a chord (up to five notes) and press UNISON to memorise it; clear by pressing UNISON with a single note held after turning unison off."},
    {"id": "b07", "name": "Sequencer", "applies_to": ["arp"],
     "rule": "64 steps of notes or chords (up to five notes) with velocity; PROGRAM enters a rest, WRITE a tie; no timing is recorded. PLAY starts; hold RECORD and press a key to transpose from middle C. Saved with the program."},
    {"id": "b08", "name": "Programs", "applies_to": ["kbd"], "rule": "512 programs (256 user, 256 factory). BANK + 1-8 then 1-16 selects; WRITE twice saves (factory edits go to user). MANUAL plays the panel. Basic Program: TRANSPOSE -2 + LOW SPLIT -2."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off", "note": "velocity ignored"}, {"message": "poly_pressure", "note": "accepted, though the keyboard sends channel pressure"},
                 {"message": "channel_pressure"}, {"message": "pitch_bend"}, {"message": "program_change", "range": [0, 127]},
                 {"message": "control_change", "note": "official CC table (see parameter access); 32 bank select: 1-4 user, 5-8 factory, 9-12 add-on banks; 64 damper; 74 brightness (cutoff offset)"},
                 {"message": "nrpn", "note": "program parameters 1-187 (full resolution), globals 4096-4122, seq play/stop 4188"}, {"message": "clock"},
                 {"message": "sysex", "note": "device inquiry; program, edit buffer and global dump requests; packed-MS-bit program dumps (4096 bytes in 4690)"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "channel_pressure"}, {"message": "pitch_bend"}, {"message": "program_change"}, {"message": "control_change"},
                  {"message": "nrpn"}, {"message": "clock"}, {"message": "sysex"}],
    "sysex_id": "Oberheim 02, TEO-5 5A (family 01)",
    "channel_note": "One channel 1-16 or all (sends on 1).", "note": "From Oberheim's official TEO-5 MIDI Implementation."}
D["specifications"] = {
    "voices": 5, "keyboard": "44-key semi-weighted Fatar, velocity and channel aftertouch", "oscillators": "2 VCOs + sub per voice", "filter": "12 dB/oct state-variable, SEM lineage, LP-notch-HP (+BP)",
    "envelopes": "2 DADSR (OB-8 curves)", "lfos": "LFO 1 global, LFO 2 poly; 0.022-500 Hz", "mod_matrix": "16 slots, 19 sources, 64 destinations", "effects": "1 of 12 types + plate reverb; analogue overdrive",
    "programs": "512 (256 user, 256 factory)", "sequencer_steps": 64, "tunings": 65,
    "connections": {"outputs": "L/R 1/4\" unbalanced", "phones": "1/4\" stereo", "pedals": "footswitch, expression pedal", "midi": "DIN in, out, thru; USB-B"},
    "power": "internal, 100-240 V, 20 W", "dimensions_mm": {"w": 635, "d": 324, "h": 112}, "weight_kg": 7.7,
    "desktop_module": {"weight_lb": 6.8, "dimensions_in": "21 x 7 x 3.5", "note": "LFO select button for the shared LFO controls"},
}
D["omitted_from_source"] = ["safety and warranty text", "Chapter 3 tutorials", "alternative tuning descriptions", "calibration and SysEx procedures beyond their existence", "program list"]
D["not_in_source"] = ["envelope times in seconds", "the LFO direct-destination list (0-61) beyond the matrix destination names", "how the PORTAMENTO rate knob maps to Osc 1/2 glide", "effect parameter ranges"]
D["source_inconsistencies"] = [
    "Many guide pages carry a 'Take 5 User's Guide' footer, and the MIDI document says CCs are 'mapped to Pro 3 controls' (copied from other Sequential documents).",
    "CC 5 is listed as 'Glide Mode (Portamento Time)' with range 0-3; it matches Glide Mode (NRPN 30).",
    "The guide's Transpose section says transpose settings are global and not saved, then that transpose can be saved per patch; the NRPN table includes Transpose as a program parameter.",
    "Pitch bend: the guide gives 12 semitones up and 24 down; Arp Repeat is '1, 2, 3' then described from 'off'.",
    "The guide states 512 programs selected as bank 1-8 plus program 1-16 (e.g. 'program 512' as bank 5, program 12), which does not multiply out to 256 per set.",
    "MIDI Sysex On is described in the MIDI document with the MIDI Control text.",
    "Weight is 7.7 kg (17 lb) on Oberheim's and Thomann's pages and 21 lb on another retailer's; the desktop is 6.8 lb (Oberheim) or 10 lb / 4.5 kg (Perfect Circuit).",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules modelled once (per_voice); LFO 1, overdrive, effects and sequencer are common."},
    {"topic": "Direct destinations", "detail": "LFO 1, LFO 2 and Env 1 (aux) each have a direct destination selected in the display; modelled as parameters, not drawn as connections."},
    {"topic": "Desktop module", "detail": "Shares the engine; its LFO section uses a select button for LFO 1/2. Not modelled separately."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/oberheim-teo-5_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
