#!/usr/bin/env python3
"""Assemble the PWM Mantis device file (schema 0.13.0).

Hybrid-analogue synth by Chris Huggett and Paul Whittington: a 'Wasp'-style engine with
an 'OSCar'-style dual filter. Two analogue signal paths, each with two mathematically
generated oscillators (sine, triangle, saw, pulse, organ, wavetable incl. 9 OSCar tables),
a sub, a detune/density oscillator, noise and ring mod into a three-stage balance mixer,
an SSI2164 state-variable dual filter (LP/BP/HP 12/24, wide band, wide notch, width) with
drive, multi-stage analogue VCAs; two ADSR envelopes with sustain fall and repeat; two
LFOs; six CONTROL x SOURCE x SCALE mod routes; chorus and reverb; arpeggiator; Quad,
Duophonic and Mono voicing; 37 keys with channel aftertouch; 200 patches.

Sources: PWM Mantis Getting Started Guide v1.4 (incl. top panel image); factory patch
sheet v1.0 (100 preset names); PWM specifications page; midi.guide CC/NRPN chart
(April 2026); Mod Wiggler for the SSI2164 filter detail.
"""
import json

S10 = {"min": 0, "max": 10}
BI = {"min": -5, "max": 5}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
PRESETS = {"A00": ["Talky AT", "PW"], "A01": ["3 Oh 3", "KK"], "A02": ["Wasp King", "DF"], "A03": ["Crystal Organ", "DF"], "A04": ["Razor Pad", "DF"], "A05": ["Two Forty Two", "BR"], "A06": ["Gravitas Lead", "DF"], "A07": ["Stereo Sheen", "DF"], "A08": ["Space Roulette", "DF"], "A09": ["Beach Dazed", "KK"], "A10": ["HAL8999", "PW"], "A11": ["Instability", "DF"], "A12": ["A Calm Respite", "BR"], "A13": ["Talking Growler", "KK"], "A14": ["Highpass Ripper", "KK"], "A15": ["Anomaly", "VT"], "A16": ["Le Violon", "PW"], "A17": ["Poor Mouse", "PW"], "A18": ["Reflecting Pools", "PW"], "A19": ["Trippy Arpy", "PW"], "A20": ["Hollow Knocker Bass", "KK"], "A21": ["Bandpass OD", "KK"], "A22": ["Proggy Lead", "KK"], "A23": ["Moog Over", "KK"], "A24": ["Filter to X+-", "KK"], "A25": ["Noisy Stabber", "KK"], "A26": ["Aftertouch Filter", "KK"], "A27": ["All ur Saws", "KK"], "A28": ["Hooverish", "KK"], "A29": ["Repeater", "KK"], "A30": ["Kairos", "VT"], "A31": ["Ananke", "VT"], "A32": ["Iterations", "VT"], "A33": ["Flicker", "VT"], "A34": ["Kinetics", "VT"], "A35": ["Carbon", "VT"], "A36": ["Antimatter", "VT"], "A37": ["Mobius", "VT"], "A38": ["Reckoning", "VT"], "A39": ["Hawkins", "VT"], "A40": ["Just Foolin’", "DF"], "A41": ["Boomer Bass", "DF"], "A42": ["Crazy Touch", "DF"], "A43": ["Pressure Scream", "DF"], "A44": ["Sweeping Legend", "DF"], "A45": ["Funky Mantis", "DF"], "A46": ["Metallic Perc", "DF"], "A47": ["Dirty Polly", "DF"], "A48": ["Jedi Gnat", "DF"], "A49": ["Lacking Patience", "BR"], "A50": ["TrentSetTable", "TQ"], "A51": ["Adjusting Pieces", "TQ"], "A52": ["Gogh on a bike", "TQ"], "A53": ["Morph", "TQ"], "A54": ["Strangest Thing", "TQ"], "A55": ["Portisneck", "TQ"], "A56": ["CitrusNightMare", "TQ"], "A57": ["ONE", "PH"], "A58": ["TWO", "PH"], "A59": ["THREE", "PH"], "A60": ["Big Rez", "TW"], "A61": ["S&H Shredder", "TW"], "A62": ["Punchy Bass", "TW"], "A63": ["Bandpass Arpeg", "TW"], "A64": ["Stereo Bounce", "TW"], "A65": ["Ear Bleed Lead", "TW"], "A66": ["Notch lead", "TW"], "A67": ["Not For Use", "TW"], "A68": ["Wakeman", "MP"], "A69": ["WT", "MP"], "A70": ["BIG LEAD", "DM"], "A71": ["FLUTE", "DM"], "A72": ["6TH POLY", "DM"], "A73": ["POLYSYNTH", "DM"], "A74": ["FAT BASS", "DM"], "A75": ["SQUARE LEAD", "DM"], "A76": ["SYNTH BASS", "DM"], "A77": ["Vangelis", "MP"], "A78": ["Pulse", "MP"], "A79": ["VocalDingAT", "MP"], "A80": ["Arping Madness", "PW"], "A81": ["Big Sympth", "PW"], "A82": ["Saw Me In Half", "PW"], "A83": ["Bass In Time", "PW"], "A84": ["Big Slide", "PW"], "A85": ["Saw Ring", "PW"], "A86": ["Glassy Lead", "PW"], "A87": ["Large Organ", "PW"], "A88": ["Rave Fifths", "PW"], "A89": ["Metal", "MP"], "A90": ["Random", "MP"], "A91": ["Spaceship", "MP"], "A92": ["Underwater Love", "PW"], "A93": ["Yoi Yoi", "PW"], "A94": ["Twin Filter OSC", "PW"], "A95": ["COPTER", "DM"], "A96": ["BROKEN ROBOT", "DM"], "A97": ["Fractalized", "BR"], "A98": ["Further Fractals", "BR"], "A99": ["Empty Machinery", "BR"]}


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
    acc = kw.pop("access", None) or [{"type": "panel", "control": control}]
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
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, cc=cc, nrpn=nrpn, **kw)


def sel(id, module, label, fn, vals, control="rotary_switch", cc=None, nrpn=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, nrpn=nrpn, values=[{"value": v} for v in vals], **kw)


def btn(id, module, label, fn, cc=None, nrpn=None, **kw):
    par(id, module, label, "boolean", fn, control="push_button", cc=cc, nrpn=nrpn, **kw)


def jack(id, label, direction, signal, node, fn, connector, **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "audio", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


WAVES = ["sine", "triangle", "saw", "pulse", "organ", "wavetable"]
D["device"] = {
    "id": "pwm-mantis", "manufacturer": "PWM (Paul Whittington Group)", "model": "Mantis Hybrid-Analogue Synthesiser",
    "category": "hybrid-analogue duophonic/quad synthesizer, 37 semi-weighted keys with channel aftertouch, dual OSCar-style filter",
    "based_on": "Last design concept of Chris Huggett (EDP Wasp, OSCar), completed by Paul Whittington and team (UK, 2023); 'Wasp' engine with an 'OSCar' dual filter.",
    "sources": [
        {"id": "guide", "title": "PWM Mantis Getting Started Guide v1.4", "kind": "quick_start_guide", "file": "PWM_Mantis_GSG_v1_4.pdf", "pages": 12,
         "note": "Overview, power, outputs, patches, init/random, mod routes, USB-MIDI, channel select, local off, resets, top panel image (all control labels read from it)."},
        {"id": "patch_sheet", "title": "PWM Mantis patch sheet v1.0", "kind": "other", "file": "PWM_Mantis_Patch_Sheet_v1_0.pdf", "pages": 2, "note": "Factory patches A00-A99 with designer credits."},
        {"id": "specs", "title": "PWM, 'Mantis Specifications'", "kind": "spec_sheet", "file": "https://www.1pwm.com/mantisspecifications",
         "note": "Full feature list: oscillators (incl. 9 OSCar wavetables), filters, LFOs, envelopes, mixer, mod routes, voicing modes, effects, connections, dimensions, price."},
        {"id": "midiguide", "title": "midi.guide, 'PWM Mantis MIDI CCs and NRPNs' (April 2026)", "kind": "other", "file": "https://midi.guide/d/pwm/mantis/",
         "note": "92 parameters: CCs (14-bit pairs for shape and cutoff) and NRPNs, including the six mod routes' source and scale."},
        {"id": "modwiggler", "title": "Mod Wiggler 'PWM Mantis' thread", "kind": "other", "file": "https://www.modwiggler.com/forum/viewtopic.php?t=273834",
         "note": "Filters built on SSI2164 VCA chips, run simultaneously in series or parallel with an OSCar-like width control."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 4,
    "polyphony_mode": "two analogue signal paths: Mono, Duophonic (one voice per path, each with its own filter in the 12 dB modes) or Quad (four voices; can combine with dual filters); voice spread across the stereo filters",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "200 patches in RAM: Bank A 100 factory (A00-A99, protectable), Bank B 100 user (initial patch); compare, init, randomise.",
    "semi_modular": False, "panel_counts": {"keys": 37, "patch_buttons": 20},
    "summary": ("Per path: Oscillator 1 and 2, mathematically generated (sine, triangle, saw, pulse, organ or a wavetable: the 7-segment Mantis special or nine 256-byte OSCar tables) with shape, "
                "shape mod and pitch mod depths and octave; an Osc 1 sub an octave down; Osc 2 with semitone, cent and a density (detune) oscillator; drift; noise with decimation; ring mod. "
                "A three-stage balance mixer (Osc 1/2, oscillators/noise, then against ring mod). A dual state-variable filter on SSI2164 VCAs: LP/BP/HP at 12 dB (one filter per voice, duophonic) "
                "or 24 dB, plus wide band (series) and wide notch (parallel) with WIDTH, drive, key track and cutoff/width modulation. Analogue VCAs under Env 1. Two envelopes (sustain fall, "
                "repeat, bipolar velocity), two LFOs (fade in/out, sync, one-shot). Six mod routes multiply a SOURCE by a SCALE into a CONTROL. Chorus and reverb, arpeggiator, joystick."),
}

mod("kbd", "voice_allocator", "Keyboard, joystick and voicing", "KEYBOARD / VOICING / TRIGGERING", "37 semi-weighted velocity keys with channel aftertouch; octave shift; Mono, Duophonic or Quad; glide (auto); joystick bend, vibrato, hold.",
    ["kbd.midi_in", "kbd.sustain", "kbd.pedal_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.joy_x", "kbd.joy_y", "kbd.pedal"], scope="common", props={"keys": 37})
for n in (1, 2):
    mod(f"osc{n}", "oscillator", f"Oscillator {n}", f"OSCILLATOR {n}", "Mathematically generated oscillator (Huggett): sine, triangle, saw, pulse, organ or wavetable; SHAPE (harmonics, slope or pulse width); shape and pitch modulation depths; octave -3 to +2."
        + (" With semitone, cent and a density oscillator." if n == 2 else ""), [f"osc{n}.pitch_cv", f"osc{n}.shape_cv"], [f"osc{n}.out"], props={"wavetables": "Mantis special (7-segment) + 9 OSCar 256-byte 8-bit tables"})
mod("sub", "oscillator", "Osc 1 sub", "OSC 1 SUB", "Follows Oscillator 1's settings one octave below.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "MIX", "Noise with a decimation (density) control for complexity.", [], ["noise.out"])
mod("ring", "ring_modulator", "Ring modulator", "MIX", "Ring modulation of the oscillators.", ["ring.a", "ring.b"], ["ring.out"])
mod("mix", "mixer", "Mixer (three balance stages)", "MIX", "Osc balance (1 against 2, sub added), noise balance (oscillators against noise), ring mod balance (oscillators + noise against ring mod).",
    ["mix.osc1", "mix.osc2", "mix.sub", "mix.noise", "mix.ring"], ["mix.out"])
mod("vcf", "filter", "Dual filter", "FILTER", "Two multimode state-variable filters on SSI2164 VCAs per path: LP12, BP12, HP12 (duophonic: one per voice path), LP24, BP24, HP24, wide band (series), wide notch (parallel); WIDTH sets their spread; drive; key track.",
    ["vcf.in", "vcf.cutoff_cv", "vcf.width_cv"], ["vcf.out"], props={"modes": ["LP12", "BP12", "HP12", "LP24", "BP24", "HP24", "wide_band", "wide_notch"], "vca_chip": "SSI2164"})
mod("vca", "vca", "VCA", "AMPLITUDE", "Multi-stage analogue VCAs; Env 1 normalised to amplitude.", ["vca.in", "vca.cv"], ["vca.out"])
for n in (1, 2):
    mod(f"env{n}", "envelope", f"Envelope {n}", f"ENVELOPE {n}", "ADSR with SUST FALL (sustain slopes during key-down), REPEAT (looping), bipolar VELOCITY, legato option." + (" Normalised to amplitude." if n == 1 else ""),
        [f"env{n}.gate", f"env{n}.velocity"], [f"env{n}.out"])
    mod(f"lfo{n}", "lfo", f"LFO {n}", f"LFO {n}", "LFO with FADE (in or out), wave, SYNC (free, sync, one shot) and RATE; key trigger option.", [f"lfo{n}.reset"], [f"lfo{n}.out"], scope="common")
mod("fx", "effects", "Chorus and reverb", "CHORUS / REVERB", "Digital chorus (level, four types) and reverb (level, time, LPF and HPF switches).", ["fx.in_l", "fx.in_r"], ["fx.out_l", "fx.out_r"], scope="common")
mod("arp", "sequencer", "Arpeggiator", "ARP / TEMPO", "Up, down, up/down 1 and 2, played, random over 1-6 octaves; swing (±); sync 2nds to 32nds; tap tempo; auto MIDI/USB clock sync; latch via joystick hold.",
    [], ["arp.notes"], scope="common")
mod("out", "output", "Output", "VOLUME / rear panel", "Stereo line outs (L/mono, R) and headphones; VOLUME; MASTER TUNE.", ["out.l", "out.r"], ["out.line_l", "out.line_r", "out.phones"], scope="common")

# ---------------------------------------------------------------- parameters
for n, ccs in ((1, dict(shape=(12, 44), wave=14, smod=21, pmod=22, oct=24)), (2, dict(shape=(19, 51), wave=23, smod=30, pmod=31, oct=32))):
    o = f"osc{n}"
    sel(f"{o}.wave", o, f"OSC {n} WAVE", "Waveform.", WAVES, nrpn=ccs["wave"])
    knob(f"{o}.shape", o, f"OSC {n} SHAPE", "Sine/organ: adds harmonics (and lifts the fundamental); pulse: width (square at centre); other waves: shape.", cc=f"{ccs['shape'][0]}/{ccs['shape'][1]} (14-bit)")
    knob(f"{o}.shape_mod", o, f"OSC {n} SHAPE MOD", "Bipolar depth of the Osc shape mod route.", nrpn=ccs["smod"], panel_scale=BI)
    knob(f"{o}.pitch_mod", o, f"OSC {n} PITCH MOD", "Bipolar depth of the Osc pitch mod route.", nrpn=ccs["pmod"], panel_scale=BI)
    sel(f"{o}.octave", o, f"OSC {n} OCTAVE", "Octave.", ["-3", "-2", "-1", "0", "+1", "+2"], nrpn=ccs["oct"])
knob("sub.level", "sub", "OSC 1 SUB LEVEL", "Sub oscillator level.", cc=24)
knob("osc2.density", "osc2", "DENSITY", "Level of the density (detune) oscillator thickening Osc 2.", nrpn=26)
knob("osc2.density_rate", "osc2", "DENSITY RATE", "Detune / beating rate of the density oscillator.", nrpn=27)
knob("osc2.semitone", "osc2", "SEMITONE", "Osc 2 ±12 semitones.", nrpn=28, panel_scale={"min": -12, "max": 12})
knob("osc2.cent", "osc2", "CENT", "Osc 2 fine tune.", nrpn=29, panel_scale=BI)
knob("drift.amount", "osc1", "OSC DRIFT AMOUNT", "Random pitch variations between oscillators.", nrpn=10)
knob("mix.osc_balance", "mix", "OSC BALANCE (1 - 2)", "Osc 1 against Osc 2.", cc=23, panel_scale=BI)
knob("mix.noise_balance", "mix", "NOISE BALANCE (O - N)", "Oscillators against noise.", cc=27)
knob("mix.ring_balance", "mix", "RM BALANCE (O+N - RM)", "Oscillators + noise against ring mod.", cc=26)
knob("noise.density", "noise", "Noise density (decimation)", "Noise complexity.", nrpn=123, access=[{"type": "midi", "message": "NRPN 123"}], confidence="inferred", note="Panel access not shown on the top panel image.")
knob("mix.trim", "mix", "Oscillator level trim", "Patch level trim.", cc=7, access=[{"type": "midi", "message": "CC 7"}])
knob("vcf.cutoff", "vcf", "CUT OFF", "Cutoff (CC 74, or 14-bit 29/61).", cc="74 or 29/61")
knob("vcf.resonance", "vcf", "RESONANCE", "Resonance.", cc=71)
knob("vcf.width", "vcf", "WIDTH", "Spread between the two filters (wide band / wide notch, stereo duophonic).", cc=75)
knob("vcf.drive", "vcf", "DRIVE", "Filter overdrive.", cc=80)
knob("vcf.keytrack", "vcf", "KEY TRACK", "Cutoff key tracking.", nrpn=48)
knob("vcf.cutoff_mod", "vcf", "CUT OFF MOD", "Bipolar depth of the cutoff mod route.", nrpn=49, panel_scale=BI)
knob("vcf.width_mod", "vcf", "WIDTH MOD", "Bipolar depth of the width mod route.", nrpn=50, panel_scale=BI)
sel("vcf.mode", "vcf", "MODE", "Filter type (LEDs).", ["LP12", "BP12", "HP12", "LP24", "BP24", "HP24", "wide_band", "wide_notch"], control="push_button", nrpn=46)
for n, cc0, nr in ((1, 82, (57, 55, 25, 56)), (2, 86, (62, 60, 33, 61))):
    e = f"env{n}"
    for k, nm in enumerate(("attack", "decay", "sustain", "release")):
        knob(f"{e}.{nm}", e, f"ENV {n} {nm.upper()}", f"{nm.title()}.", cc=cc0 + k)
    knob(f"{e}.sust_fall", e, f"ENV {n} SUST FALL", "Sustain falls during key-down.", nrpn=nr[0])
    knob(f"{e}.velocity", e, f"ENV {n} VELOCITY (AMPLITUDE)", "Bipolar velocity amount.", nrpn=nr[1], panel_scale=BI)
    btn(f"{e}.repeat", e, f"ENV {n} REPEAT", "Looping envelope.", nrpn=nr[2])
    btn(f"{e}.legato", e, f"ENV {n} LEGATO", "No retrigger on legato notes (TRIGGERING).", nrpn=nr[3])
for n, nr in ((1, (69, 68, 70, 71, 67, 74)), (2, (78, 77, 79, 80, 76, 83))):
    l = f"lfo{n}"
    sel(f"{l}.wave", l, f"LFO {n} WAVE", "LFO waveform (six positions).", ["sine", "triangle", "saw_down", "saw_up", "square", "sample_hold"], nrpn=nr[0], confidence="inferred",
        note="Six positions per MIDI (0-5) and panel icons; the specifications say four waveshapes. Order from the icons.")
    sel(f"{l}.sync", l, f"LFO {n} SYNC", "Free, synced or one shot.", ["free", "sync", "one_shot"], control="push_button", nrpn=nr[1])
    knob(f"{l}.rate", l, f"LFO {n} RATE", "Rate (or division when synced).", nrpn=f"{nr[2]} (free) / {nr[3]} (sync)")
    knob(f"{l}.fade", l, f"LFO {n} FADE", "Fade in (one way) or out (the other).", nrpn=nr[4], panel_scale=BI)
    btn(f"{l}.keytrig", l, f"LFO {n} KEYTRIG", "Restart on each note (TRIGGERING).", nrpn=nr[5])
SRC = ["env1", "lfo1", "note", "env2", "lfo2", "full_on"]
SCL = ["joystick_x", "joystick_y", "aftertouch", "velocity", "pedal", "full_on"]
CTL = [("osc1_shape", "Osc1 Shape", "osc1.shape_mod", 1), ("osc2_shape", "Osc2 Shape", "osc2.shape_mod", 2), ("osc1_pitch", "Osc1 Pitch", "osc1.pitch_mod", 3),
       ("osc2_pitch", "Osc2 Pitch", "osc2.pitch_mod", 4), ("cutoff", "Filter Cut Off", "vcf.cutoff_mod", 5), ("width", "Filter Width", "vcf.width_mod", 6)]
for cid, lab, _, msb in CTL:
    par(f"route.{cid}.source", "kbd", f"{lab} SOURCE", "enum", "Modulation source for this control.", values=[{"value": v} for v in SRC],
        access=[{"type": "panel", "control": "push_button", "note": f"press CONTROL '{lab}', then a SOURCE button"}, {"type": "midi", "message": f"NRPN MSB {msb} LSB 0"}])
    par(f"route.{cid}.scale", "kbd", f"{lab} SCALE", "enum", "Scaling controller multiplied with the source ('Full On' for none).", values=[{"value": v} for v in SCL],
        access=[{"type": "panel", "control": "push_button", "note": f"press CONTROL '{lab}', then a SCALE button"}, {"type": "midi", "message": f"NRPN MSB {msb} LSB 1"}])
knob("kbd.glide", "kbd", "GLIDE", "Glide amount.", cc=5)
btn("kbd.glide_auto", "kbd", "GLIDE AUTO", "Glide only on legato notes.", cc=35)
par("kbd.voicing", "kbd", "VOICING (DUOPHONIC / QUAD)", "enum", "Mono (both off), Duophonic or Quad.", control="push_button", values=[{"value": v} for v in ["mono", "duophonic", "quad"]], nrpn=66)
knob("kbd.voice_spread", "kbd", "VOICE SPREAD", "Stereo width across the dual filters.", nrpn=51)
par("kbd.octave", "kbd", "Keyboard octave", "integer", "Octave shift.", control="push_button", nrpn=5, range={"min": -4, "max": 3}, confidence="inferred", note="NRPN range 60-67 centred.")
par("kbd.joystick", "kbd", "JOYSTICK", "continuous", "X bend; Y vibrato and modulation scale; hold/latch.", memory="none", control="joystick", panel_scale={"min": -1, "max": 1})
btn("arp.on", "arp", "ARP", "Arpeggiator on.", nrpn=121)
sel("arp.mode", "arp", "ARP MODE", "Order.", ["up", "down", "updown1", "updown2", "play", "random"], nrpn=117)
sel("arp.octaves", "arp", "OCTAVES", "Range.", ["1", "2", "3", "4", "5", "6"], nrpn=119)
knob("arp.swing", "arp", "SWING", "Negative or positive swing.", nrpn=120, panel_scale=BI)
knob("arp.sync", "arp", "SYNC", "2nds to 32nds.", nrpn=116)
knob("arp.bpm", "arp", "BPM (TEMPO)", "Tempo (LED).")
btn("arp.tap", "arp", "TAP TEMPO", "Tap tempo.", memory="none")
knob("fx.reverb_level", "fx", "REVERB LEVEL", "Reverb amount.", cc=91)
knob("fx.reverb_time", "fx", "REVERB TIME", "Decay.", nrpn=103)
par("fx.reverb_type", "fx", "REVERB LPF / HPF", "enum", "Reverb filter switches (with type, 0-7 over MIDI).", control="push_button", nrpn=102, values=[{"value": v} for v in ["none", "lpf", "hpf", "lpf_hpf"]],
    confidence="inferred", note="MIDI 'Reverb type' runs 0-7 for the two filter buttons; mapping not documented.")
knob("fx.chorus_level", "fx", "CHORUS LEVEL", "Chorus amount.", cc=93)
sel("fx.chorus_type", "fx", "CHORUS MODE", "Four types (LEDs 1-4).", ["1", "2", "3", "4"], control="push_button", nrpn=111)
knob("out.volume", "out", "VOLUME", "Master volume.", memory="none")
knob("out.tune", "out", "MASTER TUNE", "Master tuning.", memory="global", panel_scale=BI)
for pid, lab, fn in (("ui.patch", "PATCH 0-9 / 0-9", "Tens and ones."), ("ui.bank", "BANK A / B", "Bank; SHIFT toggles protection."), ("ui.save", "SAVE", "Save to bank, tens, ones, then SAVE."),
                     ("ui.init", "INIT [SET PARAMS]", "Initial patch (single saw)."), ("ui.compare", "COMPARE [RANDOM]", "Compare; SHIFT randomises every parameter."), ("ui.shift", "CANCEL / SHIFT", "Second functions.")):
    par(pid, "kbd", lab, "boolean", fn, memory="none", control="push_button")
for pid, lab, fn, g in (("sys.midi_ch", "MIDI channel", "Hold a key at power-up (lowest C = 1, highest D = 16); remembered.", "hold a key while powering on"),
                        ("sys.local_off", "Local Off", "Hold ARP at power-up (not saved).", "hold ARP while powering on"),
                        ("sys.reset", "Reset", "Hold top C at power-up: MIDI channel, bend range, hold mode.", "hold top C while powering on")):
    par(pid, "kbd", lab, "integer" if pid == "sys.midi_ch" else "boolean", fn, memory="global" if pid == "sys.midi_ch" else "none",
        access=[{"type": "gesture", "gesture": g, "when": "power_on"}], **({"range": {"min": 1, "max": 16}} if pid == "sys.midi_ch" else {}))

# ---------------------------------------------------------------- ports
jack("jack.out_l", "LINE OUT L/MONO", "out", "audio", "out.line_l", "Left / mono.", "6.35 mm TS")
jack("jack.out_r", "LINE OUT R", "out", "audio", "out.line_r", "Right.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS")
jack("jack.sustain", "SUSTAIN", "in", "gate", "kbd.sustain", "Sustain switch.", "6.35 mm TS")
jack("jack.pedal", "PEDAL", "in", "cv", "kbd.pedal_in", "Continuous pedal (SCALE source).", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB-C", "bidirectional", "midi", None, "Class-compliant USB MIDI; bus power.", "USB-C")
jack("jack.power", "DC 9V", "in", "power", None, "9 V DC 600 mA.", "DC barrel")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.midi_in", "cv")
con("kbd.pitch", "osc1.pitch_cv", "cv")
con("kbd.pitch", "osc2.pitch_cv", "cv")
con("kbd.pitch", "sub.pitch_cv", "cv")
con("kbd.joy_x", "osc1.pitch_cv", "cv", note="Pitch bend.")
con("kbd.joy_x", "osc2.pitch_cv", "cv")
con("osc1.out", "mix.osc1")
con("osc2.out", "mix.osc2")
con("sub.out", "mix.sub", amount="sub.level")
con("noise.out", "mix.noise", amount="mix.noise_balance")
con("osc1.out", "ring.a")
con("osc2.out", "ring.b")
con("ring.out", "mix.ring", amount="mix.ring_balance")
con("mix.out", "vcf.in", amount="vcf.drive")
con("kbd.pitch", "vcf.cutoff_cv", "cv", amount="vcf.keytrack")
con("vcf.out", "vca.in")
con("env1.out", "vca.cv", "cv", note="Env 1 normalised to amplitude.")
for n in (1, 2):
    con("kbd.gate", f"env{n}.gate", "gate")
    con("kbd.velocity", f"env{n}.velocity", "cv", amount=f"env{n}.velocity")
    con("kbd.gate", f"lfo{n}.reset", "gate", eq(f"lfo{n}.keytrig", True))
SRC_NODE = {"env1": "env1.out", "lfo1": "lfo1.out", "note": "kbd.pitch", "env2": "env2.out", "lfo2": "lfo2.out"}
DST_NODE = {"osc1_shape": "osc1.shape_cv", "osc2_shape": "osc2.shape_cv", "osc1_pitch": "osc1.pitch_cv", "osc2_pitch": "osc2.pitch_cv", "cutoff": "vcf.cutoff_cv", "width": "vcf.width_cv"}
for cid, lab, depth, _ in CTL:
    for s, node in SRC_NODE.items():
        con(node, DST_NODE[cid], "cv", eq(f"route.{cid}.source", s), amount_expr=f"{depth} * scale(route.{cid}.scale)", note=f"{lab} route.")
con("vca.out", "fx.in_l", note="Paths/voices spread across L/R by VOICE SPREAD.")
con("vca.out", "fx.in_r")
con("fx.out_l", "out.l")
con("fx.out_r", "out.r")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["mod_matrix"] = {
    "name": "Mod routes (CONTROL x SOURCE x SCALE)", "module": "kbd", "slots": 6, "combine": "multiply",
    "slot_parameters": [{"slot": i, "source": f"route.{cid}.source", "source_b": f"route.{cid}.scale", "destination": depth, "depth": depth} for i, (cid, _, depth, _) in enumerate(CTL, start=1)],
    "sources": [{"id": 0, "name": "Env 1", "node": "env1.out", "per_voice": True}, {"id": 1, "name": "LFO 1", "node": "lfo1.out", "per_voice": False}, {"id": 2, "name": "Note", "node": "kbd.pitch", "per_voice": True},
                {"id": 3, "name": "Env 2", "node": "env2.out", "per_voice": True}, {"id": 4, "name": "LFO 2", "node": "lfo2.out", "per_voice": False}, {"id": 5, "name": "Full On", "per_voice": False},
                {"id": 6, "name": "SCALE: Joystick X", "node": "kbd.joy_x", "per_voice": False}, {"id": 7, "name": "SCALE: Joystick Y", "node": "kbd.joy_y", "per_voice": False},
                {"id": 8, "name": "SCALE: Aftertouch", "node": "kbd.aftertouch", "per_voice": False}, {"id": 9, "name": "SCALE: Velocity", "node": "kbd.velocity", "per_voice": True},
                {"id": 10, "name": "SCALE: Pedal", "node": "kbd.pedal", "per_voice": False}, {"id": 11, "name": "SCALE: Full On", "per_voice": False}],
    "destinations": [{"id": i, "name": lab, "parameter": depth, "description": f"CONTROL button; depth from the panel's {depth} knob"} for i, (cid, lab, depth, _) in enumerate(CTL)],
    "depth_range": {"min": -64, "max": 63},
    "note": "Each CONTROL has one route: SOURCE (Env 1, LFO 1, Note, Env 2, LFO 2, Full On) multiplied by SCALE (Joystick X, Joystick Y, Aftertouch, Velocity, Pedal, Full On), at the depth of that control's bipolar MOD knob. Route source and scale are NRPN MSB 1-6, LSB 0/1. Source ids 0-5 are SOURCE choices; 6-11 are the SCALE choices (Joystick X ... Full On, scale values 0-5).",
}
D["indicators"] = [
    {"id": "voice_leds", "module": "kbd", "label": "VOICE 1 / 2 LEDs", "kind": "led", "function": "Voice path activity."},
    {"id": "kb_led", "module": "kbd", "label": "KEYBOARD LED", "kind": "led", "function": "Keyboard activity."},
    {"id": "filter_leds", "module": "vcf", "label": "filter mode LEDs", "kind": "led", "function": "LP12 ... Wide Notch."},
    {"id": "rate_leds", "module": "lfo1", "label": "LFO 1/2 and BPM LEDs", "kind": "led", "function": "Rates."},
    {"id": "chorus_leds", "module": "fx", "label": "chorus LEDs 1-4", "kind": "led", "function": "Chorus type."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc1", "osc2", "mix", "vcf", "vca", "fx"],
     "rule": "Per path: Osc 1 (+ sub) and Osc 2 (+ density) balanced, then against noise, then against ring mod, into the dual filter with drive, then multi-stage analogue VCAs under Env 1; paths spread in stereo, then chorus and reverb."},
    {"id": "b02", "name": "Dual filter", "applies_to": ["vcf"],
     "rule": "OSCar-style: two state-variable filters per path on SSI2164 VCAs. 12 dB modes give one simple filter per voice path (duophonic split); 24 dB modes cascade; Wide Band runs LP and HP in series and Wide Notch in parallel, with WIDTH setting the gap."},
    {"id": "b03", "name": "Mod routes", "applies_to": ["kbd"],
     "rule": "Press a CONTROL (Osc 1/2 shape or pitch, cutoff, width), then a SOURCE, then a SCALE (Full On for none): the source times the scale modulates the control at its MOD knob's depth."},
    {"id": "b04", "name": "Envelopes and LFOs", "applies_to": ["env1", "env2", "lfo1", "lfo2"],
     "rule": "ADSR with SUST FALL and REPEAT (looping), bipolar velocity, legato triggering; LFOs with fade in/out, sync or one-shot, and key trigger."},
    {"id": "b05", "name": "Voicing", "applies_to": ["kbd"], "rule": "Mono, Duophonic (two notes, one per signal path, each with its own 12 dB filter) or Quad (four voices across the paths); VOICE SPREAD widens the stereo image; GLIDE with auto (legato) mode."},
    {"id": "b06", "name": "Patches", "applies_to": ["kbd"], "rule": "200 locations: bank, tens, ones. INIT gives a single saw; SHIFT + COMPARE randomises; SAVE, location, SAVE stores; SHIFT + bank toggles protection."},
]
D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change"},
                          {"message": "control_change", "note": "community chart: 1 (joystick Y), 5 glide, 7 trim, 11 expression (pedal), 64, 71, 74 or 29/61, 75, 80, 82-89, 91, 93, 12/44 and 19/51 (14-bit shapes), 23, 24, 26, 27, 35, 122"},
                          {"message": "nrpn", "note": "remaining parameters and mod routes (see parameter access)"}, {"message": "clock", "note": "arpeggiator auto-sync"}],
             "transmits": [{"message": "note_on", "note": "polyphonic as a controller"}, {"message": "note_off"}, {"message": "control_change", "note": "all knobs and joystick"}, {"message": "nrpn"}],
             "channel_note": "Channel 1-16 chosen at power-up (default 1).", "note": "Numbers from midi.guide; PWM's guide confirms knobs and joystick send and receive MIDI."}
D["specifications"] = {
    "voices": "4 (Quad), 2 (Duophonic) or 1", "signal_paths": 2, "oscillators": "2 + sub + density per voice; 6 wave types incl. Mantis and 9 OSCar wavetables", "filters": "dual SVF per path, 8 modes",
    "envelopes": 2, "lfos": 2, "mod_routes": 6, "effects": "chorus (4 types), reverb", "keyboard": "37 semi-weighted keys, velocity, channel aftertouch",
    "patches": "200 (100 factory, 100 user)", "connections": {"outputs": "L/mono, R 1/4\"", "phones": "1/4\" TRS", "pedals": "sustain, continuous pedal", "midi": "in, out, thru; USB-C"},
    "power": "9 V DC 600 mA or USB bus power", "dimensions_mm": {"w": 618, "d": 320, "h": 112}, "weight_kg": 5.34, "price": "USD 1,499 / EUR 1,599 / GBP 1,349",
    "factory_patches": {k: {"name": v[0], "designer": v[1]} for k, v in PRESETS.items()},
}
D["omitted_from_source"] = ["box contents and safety", "late-breaking information sheet"]
D["not_in_source"] = ["full user guide (promised, not yet published)", "how the WT position chooses among the Mantis and OSCar wavetables", "envelope and LFO time ranges", "reverb type 0-7 mapping"]
D["source_inconsistencies"] = [
    "The getting started guide calls Mantis 'a sophisticated Duophonic' synth; the specifications say 'Four Voice Polyphonic' with Quad, Duophonic and Mono modes (Quad probably added in firmware).",
    "The specifications list 4 LFO waveshapes; the panel shows more icons and the MIDI chart gives six values.",
    "The specifications list 'LFO Keytrig' twice and leave the Tri and Saw shape descriptions blank.",
    "The patch sheet credits 'DM' for A70-A76 but DM is not in its list of designers.",
    "The specifications describe a 'detune oscillator per voice'; the panel and MIDI chart place Density, Density Rate, Semitone and Cent with Oscillator 2.",
]
D["modelling_gaps"] = [
    {"topic": "Documentation", "detail": "Only a getting started guide exists; controls come from its top panel image, behaviour from the specifications, numbers from the community MIDI chart."},
    {"topic": "Signal paths", "detail": "The two analogue paths are modelled once (per_voice); voicing modes are behaviours."},
    {"topic": "Mod routes", "detail": "Six routes with a source and a scale each (schema source_b with multiply); route connections are drawn per source with a scale expression."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/pwm-mantis_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
