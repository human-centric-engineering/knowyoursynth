#!/usr/bin/env python3
"""Assemble the UDO Super Gemini device file (schema 0.13.0).

20-voice bi-timbral binaural hybrid synth (61 keys, polyphonic aftertouch, ribbon): two
layers (upper and lower), each a full Super 6-style engine with its own row of panel
controls: DDS 1 (seven-oscillator super core, alternative waves, wave morphing), DDS 2
(norm/ring/sync, LFO range with square or sine sub), mixer and pan, 6 dB HPF into an SSI
24 dB LPF with drive, VCA, ENV 1 (attack hold, decay hold, loop, invert), ENV 2, LFO 1
(to 20 kHz, LR phase), chorus and delay. Shared: performance controls (bender, LFO 2,
portamento, octave) assignable per layer, ribbon, tempo, detune, single/dual/split,
matrix per layer, arpeggiator/sequencer per layer, 128 performances, 256 patches.

Source: UDO Super Gemini Owner's Manual 1.0 (November 2023), including the CC, RPN and
NRPN tables (continuous parameters: NRPN = 1024 + CC). Each layer receives on its own
MIDI channel (upper = base channel, lower = base + 1) with the same CC numbers.
"""
import json

S10 = {"min": 0, "max": 10}
K127 = {"min": 0, "max": 127}
NRPN_CCS = {1, 3, 5, 7, 9, 10, 12, 13, 17, 18, 19, 21, 22, 25, 26, 28, 32, 33, 35, 37, 42, 45, 46, 47, 52, 53, 54, 55, 56, 57, 58, 62, 63, 70, 71, 72, 73, 74, 75, 76, 77,
            91, 92, 94, 95, 108, 109, 110, 111}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
LAYERS = (("up", "UPPER"), ("lo", "LOWER"))


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="fader", cc=None, layer=None, shift=False, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": "SHIFT (secondary label)"} if shift else {})}]
    if cc is not None:
        ch = "" if layer is None else (" on the base channel" if layer == "up" else " on base channel + 1")
        acc = acc + [{"type": "midi", "message": f"CC {cc}{ch}"}]
        if cc in NRPN_CCS:
            acc = acc + [{"type": "midi", "message": f"NRPN {1024 + cc} (14-bit){ch}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def fader(id, module, label, fn, cc=None, layer=None, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, cc=cc, layer=layer, **kw)


def sw(id, module, label, fn, vals, control="toggle_switch", cc=None, layer=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, layer=layer, values=[{"value": v} for v in vals], **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
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


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


D["device"] = {
    "id": "udo-audio-super-gemini", "manufacturer": "UDO Audio", "model": "Super Gemini",
    "category": "20-voice dual-layer polyphonic binaural analogue-hybrid synthesizer, 61 keys with polyphonic aftertouch, ribbon controller",
    "based_on": "Two-layer expansion of the UDO Super 6 engine (UK, 2023); panel design with Axel Hartmann.",
    "sources": [{"id": "manual", "title": "UDO Super Gemini Owner's Manual, version 1.0 (November 2023)", "kind": "user_manual", "file": "Udo_Supoer_Gemini.pdf", "pages": 136,
                 "note": "Complete: performances and patches, connections, both layers' sound design, effects, performance controls, ribbon, keyboard modes, matrix, voice assign, arp/seq, globals, CC/RPN/NRPN tables."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 20,
    "polyphony_mode": "20 voices; binaural pairs them into 10 stereo super voices (single) or 5 per layer (dual/split); non-binaural gives 20 (single) or 10 per layer; per layer POLY 1, POLY 2, SOLO, LEGATO, unison",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "128 performances (2 groups x 8 banks x 8) each holding both layers' patches and performance settings; 256 patches (2 groups x 16 banks A1-H2 x 8); 32 alternative waves; 16 sequences; USB drive 'GEMINI'.",
    "semi_modular": False, "panel_counts": {"keys": 61, "layers": 2, "select_buttons": 16},
    "summary": ("Two layers, upper and lower, each a complete binaural Super 6-style engine with its own row of controls: DDS 1 (seven-oscillator super core, classic or alternative "
                "waves, morphing), DDS 2 (norm, ring or sync; LFO range with square or sine sub), MIX and pan, a 6 dB analogue high-pass into an SSI 4-pole 24 dB low-pass with drive, "
                "a VCA with fixed-envelope options, ENV 1 (hold stages, invert, loop) and ENV 2, LFO 1 (to 20 kHz, L/R phase), chorus and delay. Performances combine the layers in "
                "single, dual or split mode. Shared performance controls (bender, LFO 2 with six waves, portamento, octave) apply to upper, lower or both; a ribbon controller and "
                "polyphonic aftertouch add expression. Separate mix, upper and lower stereo outputs."),
}

mod("kbd", "voice_allocator", "Keyboard, layers and voice allocation", "KEYBOARD / LAYER", "61 keys with velocity and polyphonic aftertouch; SINGLE, DUAL or SPLIT (split point default C4); per-layer voice assign; hold per layer; two MIDI channels.",
    ["kbd.midi_in", "kbd.sustain"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch"], scope="common", props={"keys": 61})
mod("bender", "manual_controller", "Bender", "PERFORMANCE CONTROL SECTION", "Left/right bends pitch (to an octave) and LPF cutoff per layer; pushing up (pressure pad) triggers LFO 2.", [], ["bender.bend", "bender.push"], scope="common")
mod("ribbon", "manual_controller", "Ribbon controller", "above the keyboard", "Pitch bend of held notes by default (direction set by the starting position); becomes a matrix source when assigned (then no pitch control). CC 2/34.", [], ["ribbon.out"], scope="common")
mod("lfo2", "lfo", "LFO 2", "PERFORMANCE CONTROL SECTION", "Sine, reverse saw, S&H, square, saw, sample & glide; RATE, DELAY; triggered by bender push, aftertouch, or always on; to DDS pitch, VCF and VCA per layer; polyphonic as a matrix destination.",
    ["lfo2.trigger", "lfo2.rate_cv"], ["lfo2.out"])
mod("pedals", "manual_controller", "Pedals", "rear panel", "Volume pedal, expression pedal (matrix source), dual sustain and dual delay-freeze footswitches.", ["pedals.volume_in", "pedals.exp_in", "pedals.freeze_in"], ["pedals.volume", "pedals.exp", "pedals.freeze"], scope="common")
for L, LN in LAYERS:
    sec = f"{LN} LAYER"
    mod(f"{L}_dds1", "oscillator", f"{LN} DDS 1", f"{sec} OSCILLATORS", "Super-wave core: centroid plus six sister oscillators; sine, saw, square, triangle, noise or alternative waves A/B; PW/WAVE morphs to the next wave; 64'-2'.",
        [f"{L}_dds1.pitch_cv", f"{L}_dds1.fm", f"{L}_dds1.wave_cv", f"{L}_dds1.hf_sum"], [f"{L}_dds1.out"], props={"sub_oscillators": 7, "alternative_waves": 32})
    mod(f"{L}_dds2", "oscillator", f"{LN} DDS 2", f"{sec} OSCILLATORS", "Algorithmic oscillator: sine, saw, square, triangle, noise, pulse; 32'-2' or LFO (0.1-100 Hz); NORM, RING (with DDS 1) or SYNC; tune ±7 st.",
        [f"{L}_dds2.pitch_cv", f"{L}_dds2.pw_cv", f"{L}_dds2.sync_in", f"{L}_dds2.fm", f"{L}_dds2.hf_sum"], [f"{L}_dds2.out", f"{L}_dds2.mod_out"])
    mod(f"{L}_sub", "oscillator", f"{LN} sub oscillator", f"{sec} OSCILLATORS", "Square or sine one octave below DDS 1, replacing DDS 2's audio when DDS 2 is at LFO range.", [f"{L}_sub.pitch_cv"], [f"{L}_sub.out"])
    mod(f"{L}_mix", "mixer", f"{LN} mixer", f"{sec} MIXER", "MIX balances DDS 1 against DDS 2 (or ring mod, or the sub); SHIFT: layer pan.", [f"{L}_mix.a", f"{L}_mix.b"], [f"{L}_mix.out"])
    mod(f"{L}_hpf", "filter", f"{LN} high-pass filter", f"{sec} VCF", "1-pole 6 dB/oct analogue high-pass before the low-pass.", [f"{L}_hpf.in"], [f"{L}_hpf.out"], props={"slope_db_per_oct": 6})
    mod(f"{L}_lpf", "filter", f"{LN} low-pass filter", f"{sec} VCF", "SSI 4-pole 24 dB/oct resonant low-pass, self-oscillating; drive off/1/2; key tracking off, half or full.", [f"{L}_lpf.in", f"{L}_lpf.cutoff_cv"], [f"{L}_lpf.out"],
        props={"slope_db_per_oct": 24, "chip": "SSI"})
    mod(f"{L}_vca", "vca", f"{LN} VCA", f"{sec} VCA", "ENV 2 or one of two fixed envelopes; LFO 1 and DDS 2 amplitude modulation; velocity dynamics.", [f"{L}_vca.in", f"{L}_vca.cv"], [f"{L}_vca.out"])
    mod(f"{L}_env1", "envelope", f"{LN} ENV 1", f"{sec} ENVELOPES", "Attack hold, attack, decay hold, decay, sustain, release (1 ms-10 s); normal, inverted or loop; decay/release key tracking.", [f"{L}_env1.gate"], [f"{L}_env1.out"])
    mod(f"{L}_env2", "envelope", f"{LN} ENV 2", f"{sec} ENVELOPES", "Attack, decay hold, decay, sustain, release (1 ms-10 s).", [f"{L}_env2.gate"], [f"{L}_env2.out"])
    mod(f"{L}_lfo1", "lfo", f"{LN} LFO 1", f"{sec} LFO 1", "One per super voice: triangle, reverse saw, S&H, square, HF (20 Hz-20 kHz) or HF TRK; free/once/reset, or HF summed into either DDS; delay; LR phase or pan spread.",
        [f"{L}_lfo1.reset"], [f"{L}_lfo1.out"])
    mod(f"{L}_chorus", "chorus", f"{LN} chorus", "CHORUS (layer select)", "Chorus I, II or I + II.", [f"{L}_chorus.in"], [f"{L}_chorus.out"], scope="common")
    mod(f"{L}_delay", "delay", f"{LN} delay", "DELAY (layer select)", "1 ms-1 s (or synced), feedback to infinite, send level; freeze by footswitch.", [f"{L}_delay.in", f"{L}_delay.freeze"], [f"{L}_delay.out"], scope="common")
    mod(f"{L}_arp", "sequencer", f"{LN} arpeggiator / sequencer", "ARPEGGIATOR & SEQUENCER (layer select)", "Up, down, up & down, random over 1-4 octaves, or 64-step sequencer (step, slide, accent, rest, length); 16 sequences.", [], [f"{L}_arp.notes"],
        scope="common")
mod("out", "output", "Outputs", "rear panel", "Mix L/R (both layers), upper L/R and lower L/R outputs, two headphone jacks; MASTER VOLUME (to +4 dB, not stored).", ["out.up", "out.lo", "out.volume_cv"],
    ["out.mix_l", "out.mix_r", "out.up_l", "out.up_r", "out.lo_l", "out.lo_r", "out.phones"], scope="common")

# ---------------------------------------------------------------- per-layer parameters
for L, LN in LAYERS:
    p = lambda s: f"{L}.{s}"
    m = lambda s: f"{L}_{s}"
    sw(p("dds1_wave"), m("dds1"), f"{LN} DDS 1 WAVEFORM", "Classic wave or the alternative waves (rightmost).", ["sine", "sawtooth", "square", "triangle", "white_noise", "alternative"], "rotary_switch", 29, L)
    sw(p("dds1_range"), m("dds1"), f"{LN} DDS 1 RANGE", "Footage.", ["64'", "32'", "16'", "8'", "4'", "2'"], "rotary_switch", 30, L)
    par(p("alt_wave_a"), m("dds1"), f"{LN} Alternative wave A / B", "enum", "Waves 1-32 assigned to channels A and B (WAVE button, W1-W16).", control="push_button", values=[{"value": "waves 1-32 on A and B"}])
    sw(p("dds2_wave"), m("dds2"), f"{LN} DDS 2 WAVEFORM", "DDS 2 waveform.", ["sine", "sawtooth", "square", "triangle", "white_noise", "pulse"], "rotary_switch", 31, L)
    sw(p("dds2_range"), m("dds2"), f"{LN} DDS 2 RANGE", "Footage, or LFO (leaves the audio path; enables the sub).", ["lfo", "32'", "16'", "8'", "4'", "2'"], "rotary_switch", 106, L)
    fader(p("dds2_tune"), m("dds2"), f"{LN} DDS 2 TUNE", "±7 semitones; LFO rate 0.1-100 Hz in LFO range.", 35, L, control="knob", panel_scale={"min": -7, "max": 7})
    sw(p("dds2_mode"), m("dds2"), f"{LN} DDS 2 MODE", "NORM / RING / SYNC; at LFO range: sub off / square sub / sine sub.", ["norm", "ring", "sync"], cc=36, layer=L)
    fader(p("mix"), m("mix"), f"{LN} MIX", "DDS 1 to DDS 2 (or ring, or sub).", 37, L, control="knob")
    fader(p("pan"), m("mix"), f"{LN} PAN (SHIFT + MIX)", "Layer position in the stereo field.", 10, L, control="knob", shift=True, panel_scale={"min": -5, "max": 5})
    fader(p("dds_lfo1"), m("dds1"), f"{LN} DDS MOD LFO 1", "LFO 1 pitch modulation.", 21, L)
    fader(p("dds_env1"), m("dds1"), f"{LN} DDS MOD ENV 1", "ENV 1 pitch modulation.", 22, L)
    sw(p("dds_dest"), m("dds1"), f"{LN} DDS modulator destination", "DDS 1, both or DDS 2.", ["dds1", "both", "dds2"], cc=23, layer=L)
    sw(p("super"), m("dds1"), f"{LN} SUPER", "Super mode off, half (phase reset) or on.", ["off", "half", "on"], cc=24, layer=L)
    fader(p("pw_detune"), m("dds2"), f"{LN} PW/DETUNE", "DDS 2 pulse width; DDS 1 detune spread in super mode.", 25, L)
    fader(p("drift"), m("dds1"), f"{LN} DRIFT (SHIFT + PW/DETUNE)", "Randomises oscillator pitch, filters and envelopes.", 94, L, shift=True)
    fader(p("pw_wave"), m("dds2"), f"{LN} PW/WAVE", "DDS 2 PWM depth and DDS 1 wave morph (manual position or modulation depth).", 26, L)
    sw(p("pw_wave_src"), m("dds2"), f"{LN} PW/WAVE source", "Manual, LFO 1 or ENV 1.", ["manual", "lfo1", "env1"], cc=27, layer=L)
    fader(p("cross_mod"), m("dds1"), f"{LN} CROSS MOD", "DDS 2 FMs DDS 1 (reversed with SYNC; extra carrier modulation in RING).", 28, L)
    sw(p("drive"), m("lpf"), f"{LN} DRIVE", "Low-pass drive.", ["off", "1", "2"], cc=41, layer=L)
    fader(p("hpf"), m("hpf"), f"{LN} HPF", "High-pass cutoff.", 95, L)
    fader(p("lpf"), m("lpf"), f"{LN} LPF", "Low-pass cutoff.", 74, L)
    fader(p("res"), m("lpf"), f"{LN} RES", "Resonance; self-oscillates at maximum.", 71, L)
    fader(p("vcf_env"), m("lpf"), f"{LN} VCF ENV", "Envelope depth on cutoff.", 45, L)
    sw(p("vcf_env_src"), m("lpf"), f"{LN} VCF envelope source", "ENV 1, both or ENV 2.", ["env1", "1_plus_2", "env2"], cc=44, layer=L)
    fader(p("vcf_lfo1"), m("lpf"), f"{LN} VCF LFO 1", "LFO 1 depth on cutoff.", 46, L)
    fader(p("vcf_dds2"), m("lpf"), f"{LN} VCF DDS 2", "DDS 2 depth on cutoff.", 47, L)
    sw(p("keytrack"), m("lpf"), f"{LN} KEYTRACK", "Off, quarter-tone or semitone tracking.", ["off", "half", "on"], cc=43, layer=L)
    fader(p("vca_env"), m("vca"), f"{LN} VCA ENV LEVEL", "Envelope level into the VCA.", 7, L)
    fader(p("vca_lfo1"), m("vca"), f"{LN} VCA LFO 1", "Tremolo.", 92, L)
    fader(p("vca_dds2"), m("vca"), f"{LN} VCA DDS 2", "Amplitude modulation from DDS 2.", 109, L)
    sw(p("vca_mode"), m("vca"), f"{LN} VCA envelope", "ENV 2, fixed envelope 1 (gate) or fixed envelope 2 (gate with release).", ["env2", "fixed1", "fixed2"], cc=49, layer=L)
    sw(p("dynamics"), m("vca"), f"{LN} DYNAMICS", "Velocity to level and cutoff.", ["off", "half", "on"], cc=48, layer=L)
    for e, ccs in (("env1", (53, 54, 55, 56, 32)), ("env2", (73, 57, 58, 72, 33))):
        lab = e.upper().replace("ENV", "ENV ")
        for k, nm in enumerate(("attack", "decay", "sustain", "release")):
            fader(p(f"{e}_{nm}"), m(e), f"{LN} {lab} {nm[0].upper()}", f"{nm.title()} ({'level' if nm == 'sustain' else '1 ms-10 s'}).", ccs[k], L)
        fader(p(f"{e}_decay_hold"), m(e), f"{LN} {lab} DECAY HOLD (SHIFT + D)", "Up to 10 s before the decay.", ccs[4], L, shift=True)
    fader(p("env1_attack_hold"), m("env1"), f"{LN} ENV 1 ATTACK HOLD (SHIFT + A)", "Up to 10 s before the attack.", 52, L, shift=True)
    sw(p("env1_mode"), m("env1"), f"{LN} ENV 1 MODE", "Normal, inverted or loop.", ["normal", "inverted", "loop"], cc=50, layer=L)
    sw(p("env1_keytrack"), m("env1"), f"{LN} ENV 1 KEYTRACK", "Decay/release shorten up the keyboard.", ["off", "half", "on"], cc=51, layer=L)
    fader(p("lfo1_rate"), m("lfo1"), f"{LN} LFO 1 RATE", "Rate, 20 Hz-20 kHz in HF, or a division with SYNC.", 17, L)
    fader(p("lfo1_delay"), m("lfo1"), f"{LN} LFO 1 DELAY", "Delay before modulation.", 18, L)
    fader(p("lfo1_lr_phase"), m("lfo1"), f"{LN} LFO 1 LR PHASE / SPREAD", "Binaural L/R phase 0-2π, or pan spread when non-binaural.", 19, L)
    sw(p("lfo1_wave"), m("lfo1"), f"{LN} LFO 1 WAVEFORM", "Waveform or HF mode.", ["triangle", "rev_sawtooth", "sample_hold", "square", "hf", "hf_trk"], "rotary_switch", 16, L)
    sw(p("lfo1_mode"), m("lfo1"), f"{LN} LFO 1 MODE", "Free/once/reset, or HF NORM/into DDS 1/into DDS 2.", ["free_norm", "once_dds1", "reset_dds2"], cc=20, layer=L)
    sw(p("chorus"), m("chorus"), f"{LN} CHORUS", "Off, I, II or I + II.", ["off", "I", "II", "I_II"], "push_button", 93, L)
    fader(p("delay_time"), m("delay"), f"{LN} DELAY TIME", "1 ms-1 s or synced division.", 12, L, control="knob", physical={"min": 0.001, "max": 1, "unit": "s"})
    fader(p("delay_feedback"), m("delay"), f"{LN} DELAY FEEDBACK", "Repeats; maximum infinite.", 13, L, control="knob")
    fader(p("delay_send"), m("delay"), f"{LN} DELAY SEND", "Layer level into the delay.", 91, L)
    sw(p("voice_mode"), "kbd", f"{LN} VOICE ASSIGN MODE", "Solo, legato, poly 1 (overlapping releases) or poly 2 (curtailed).", ["solo", "legato", "poly1", "poly2"], "push_button", 78, L)
    sw(p("unison_size"), "kbd", f"{LN} U. SIZE (SHIFT + MODE)", "Half, all, octave, or fifth + octave.", ["half", "all", "octave", "fifth_octave"], "push_button", 79, L)
    par(p("unison"), "kbd", f"{LN} UNISON", "boolean", "Stacks voices per note.", control="push_button")
    par(p("binaural"), "kbd", f"{LN} BINAURAL", "boolean", "Stereo super voices (halves the voice count).", control="push_button", cc=80, layer=L, default=True)
    par(p("arp_on"), m("arp"), f"{LN} ARP/SEQ ON", "boolean", "Arpeggiator or sequencer on.", control="push_button", cc=86, layer=L)
    sw(p("arp_mode"), m("arp"), f"{LN} ARP/SEQ MODE", "Order or sequencer.", ["up", "down", "up_down", "random", "seq"], "push_button", 85, L)
    sw(p("arp_range"), m("arp"), f"{LN} RANGE", "1-4 octaves, or sequencer page.", ["1", "2", "3", "4"], "push_button", 82, L)
    sw(p("swing"), m("arp"), f"{LN} SWING (SHIFT + RANGE)", "Swing 0-4.", ["0", "1", "2", "3", "4"], "push_button", 83, L)
    sw(p("clk_div"), m("arp"), f"{LN} CLK DIV", "Note value.", ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T"], "encoder", 107, L)
    par(p("sync"), m("arp"), f"{LN} SYNC", "boolean", "Syncs LFO 1 and delay to the tempo.", control="push_button", cc=81, layer=L)
    par(p("hold"), "kbd", f"{LN} HOLD", "boolean", "Sustains the layer's notes; latches arp; transposes the sequence from C4.", control="push_button", cc=87, layer=L)
# shared / performance parameters (stored with the performance)
sw("perf.mode", "kbd", "KEYBOARD MODE", "SINGLE (one layer, 20 voices), DUAL (stacked, 10 each) or SPLIT (10 each; hold SPLIT and play to set the split, default C4).", ["single", "dual", "split"], "push_button")
par("perf.split_point", "kbd", "Split point", "integer", "First note of the upper layer.", access=[{"type": "gesture", "gesture": "hold SPLIT and play a note", "when": "any_time"}], range={"min": 0, "max": 127}, default=60)
sw("perf.layer_select", "kbd", "LAYER UPPER / LOWER", "Which layer the shared controls (patch load, voice assign, arp/seq, matrix, waves, chorus, delay) address.", ["upper", "lower"], "push_button")
sw("perf.mod_layer", "bender", "Performance layer selector (bender/LFO 2)", "Bender and LFO 2 settings apply to both layers, lower or upper.", ["both", "lower", "upper"], cc=104)
sw("perf.porta_layer", "kbd", "Portamento/octave layer selector", "Portamento and octave settings apply to both, lower or upper.", ["both", "lower", "upper"], cc=65)
sw("perf.osc_dest", "bender", "Performance oscillator destination", "Bender and LFO 2 pitch to DDS 1, both or DDS 2.", ["dds1", "both", "dds2"], cc=61)
fader("perf.bend_dds", "bender", "BENDER DDS", "Pitch-bend depth, to an octave.", 76)
fader("perf.bend_vcf", "bender", "BENDER VCF", "Bend depth on cutoff.", 77)
sw("lfo2.wave", "lfo2", "LFO 2 WAVEFORM", "LFO 2 waveform.", ["sine", "rev_sawtooth", "sample_hold", "square", "sawtooth", "sample_glide"], "rotary_switch", 105)
fader("lfo2.rate", "lfo2", "LFO 2 RATE", "Rate (LED shows it).", 62, control="knob")
fader("lfo2.delay", "lfo2", "LFO 2 DELAY", "Delay before modulation.", 63, control="knob")
sw("lfo2.trigger", "lfo2", "LFO 2 trigger", "Bender push; aftertouch + push; or always on (aftertouch then bends).", ["trig", "at_trig", "on_at_bend"], cc=60)
fader("lfo2.rate_mod", "lfo2", "LFO 2 RATE (mod)", "Push/aftertouch raise the LFO 2 rate.", 110)
fader("lfo2.dds", "lfo2", "LFO 2 DDS", "Pitch modulation depth.", 70)
fader("lfo2.vcf", "lfo2", "LFO 2 VCF", "Cutoff modulation depth.", 75)
fader("lfo2.vca", "lfo2", "LFO 2 VCA", "Amplitude modulation depth.", 42)
fader("perf.portamento", "kbd", "PORTAMENTO", "Up to 10 s per octave; interval-dependent.", 5)
sw("perf.octave", "kbd", "OCTAVE", "Spring-loaded ±2 octaves; SHIFT: global transpose ±12.", ["-2", "-1", "0", "+1", "+2"], cc=67)
fader("perf.tempo", "lfo2", "TEMPO", "30-300 BPM.", 3, control="knob", physical={"min": 30, "max": 300, "unit": "BPM"})
fader("perf.lower_detune", "kbd", "DETUNE (lower layer)", "Lower layer ±7 semitones against the upper.", 108, control="knob", panel_scale={"min": -7, "max": 7})
fader("perf.detune", "kbd", "PERF DETUNE (SHIFT + DETUNE)", "Whole performance ±7 semitones.", 111, control="knob", shift=True, panel_scale={"min": -7, "max": 7})
par("perf.manual", "kbd", "MANUAL UPPER / LOWER", "boolean", "Play the panel as set for a layer; SHIFT loads the init patch.", memory="none", control="push_button", cc=59)
par("out.volume", "out", "MASTER VOLUME", "continuous", "Master and headphone level to +4 dB (not stored).", memory="none", control="knob", panel_scale={"min": 0, "max": 10})
par("kbd.fine_tune", "kbd", "FINE ADJ (SHIFT + MOD AMOUNT)", "integer", "Global ±100 cents.", memory="global", control="encoder", range={"min": -100, "max": 100})
for pid, label, fn in (("ui.perf", "PERF", "Performance mode (SHIFT: group B)."), ("ui.patch", "PATCH", "Patch mode (SHIFT: group B)."), ("ui.wave", "WAVE", "Alternative waves A/B."),
                       ("ui.mod_assign", "MOD ASSIGN", "Matrix (per selected layer)."), ("ui.mod_amount", "MOD AMOUNT", "Matrix depth -100% to +100%."), ("ui.shift", "SHIFT", "Second functions and global settings."),
                       ("ui.select", "Buttons 1-8, A-H", "Banks and numbers, matrix sources/destinations, steps, wave slots, global options."), ("ui.seq_rec", "SEQ REC / TRACK", "Sequencer recording and track select.")):
    par(pid, "kbd", label, "boolean", fn, memory="none", control="push_button" if "AMOUNT" not in label else "encoder")
for pid, label, kind, fn, extra in (("sys.midi_ch", "MIDI CH", "integer", "Base channel: upper layer on it, lower on the next.", {"range": {"min": 1, "max": 16}}),
                                    ("sys.txrx_e", "TX/RX E", "enum", "CC transmit, CC receive, NRPN mode.", {"values": [{"value": v} for v in ["cc_tx", "cc_rx", "nrpn"]]}),
                                    ("sys.txrx_p", "TX/RX P", "enum", "Program change transmit/receive.", {"values": [{"value": "tx"}, {"value": "rx"}]}),
                                    ("sys.local", "LOCAL", "boolean", "Local control (CC 122).", {}), ("sys.tune", "TUNE", "boolean", "Filter auto-tune.", {}),
                                    ("sys.ext_clk", "EXT CLK (SHIFT + SYNC)", "enum", "Clock transmit or receive (exclusive), stop receive.", {"values": [{"value": v} for v in ["clock_tx", "clock_rx", "stop_rx"]]})):
    par(pid, "kbd", label, kind, fn, memory="global", access=[{"type": "menu", "note": f"SHIFT (global settings), {label}"}], **extra)

# ---------------------------------------------------------------- ports
for pid, label, node, fn in (("mix_l", "MIX OUTPUT L", "out.mix_l", "Both layers, left."), ("mix_r", "MIX OUTPUT R", "out.mix_r", "Both layers, right."),
                             ("up_l", "UPPER LAYER OUTPUT L", "out.up_l", "Upper layer only."), ("up_r", "UPPER LAYER OUTPUT R", "out.up_r", "Upper layer only."),
                             ("lo_l", "LOWER LAYER OUTPUT L", "out.lo_l", "Lower layer only."), ("lo_r", "LOWER LAYER OUTPUT R", "out.lo_r", "Lower layer only.")):
    jack(f"jack.{pid}", label, "out", "audio", node, fn + " Unbalanced.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES (6.35 mm and 3.5 mm)", "out", "audio", "out.phones", "Two stereo headphone jacks, front left.", "6.35 mm TRS", location="front")
jack("jack.volume", "VOLUME PEDAL", "in", "cv", "pedals.volume_in", "TRS expression pedal as volume (0-5 V).", "6.35 mm TRS")
jack("jack.exp", "EXPRESSION PEDAL", "in", "cv", "pedals.exp_in", "TRS expression pedal; matrix source.", "6.35 mm TRS")
jack("jack.sustain", "SUSTAIN PEDAL", "in", "gate", "kbd.sustain", "Single (upper) or dual (left upper, right lower); polarity detected at power-up.", "6.35 mm TRS")
jack("jack.freeze", "DELAY FREEZE", "in", "gate", "pedals.freeze_in", "Single (upper) or dual (left upper, right lower) footswitch.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB MIDI (not with DIN at the same time); file management; firmware.", "USB")
jack("jack.power", "POWER", "in", "power", None, "IEC, 90-240 V, 50 W, 2 A T fuse.", "IEC C14")

# ---------------------------------------------------------------- connections
con("pedals.volume", "out.volume_cv", "cv")
for L, LN in LAYERS:
    m = lambda s: f"{L}_{s}"
    p = lambda s: f"{L}.{s}"
    con(m("arp") + ".notes", "kbd.midi_in", "cv", note=f"{LN} arpeggiator/sequencer notes.")
    con("pedals.freeze", m("delay") + ".freeze", "gate")
    for o in ("dds1", "dds2"):
        con("kbd.pitch", f"{m(o)}.pitch_cv", "cv")
        con(f"{m('lfo1')}.out", f"{m(o)}.pitch_cv", "cv", anyof(p("dds_dest"), o, "both"), amount=p("dds_lfo1"))
        con(f"{m('env1')}.out", f"{m(o)}.pitch_cv", "cv", anyof(p("dds_dest"), o, "both"), amount=p("dds_env1"))
        con("bender.bend", f"{m(o)}.pitch_cv", "cv", anyof("perf.osc_dest", o, "both"), amount="perf.bend_dds")
        con("lfo2.out", f"{m(o)}.pitch_cv", "cv", anyof("perf.osc_dest", o, "both"), amount="lfo2.dds")
        con("ribbon.out", f"{m(o)}.pitch_cv", "cv", note="Default ribbon pitch bend (held notes only; off once assigned in the matrix).")
    con("kbd.pitch", f"{m('sub')}.pitch_cv", "cv")
    con(f"{m('lfo1')}.out", f"{m('dds2')}.pw_cv", "cv", eq(p("pw_wave_src"), "lfo1"), amount=p("pw_wave"))
    con(f"{m('env1')}.out", f"{m('dds2')}.pw_cv", "cv", eq(p("pw_wave_src"), "env1"), amount=p("pw_wave"))
    con(f"{m('lfo1')}.out", f"{m('dds1')}.wave_cv", "cv", eq(p("pw_wave_src"), "lfo1"), amount=p("pw_wave"), note="Wave morph.")
    con(f"{m('env1')}.out", f"{m('dds1')}.wave_cv", "cv", eq(p("pw_wave_src"), "env1"), amount=p("pw_wave"))
    con(f"{m('dds2')}.out", f"{m('dds1')}.fm", {"param": p("dds2_mode"), "not_equals": "sync"}, amount=p("cross_mod"))
    con(f"{m('dds1')}.out", f"{m('dds2')}.fm", eq(p("dds2_mode"), "sync"), amount=p("cross_mod"), note="Cross mod reverses with SYNC.")
    con(f"{m('dds1')}.out", f"{m('dds2')}.sync_in", "sync", eq(p("dds2_mode"), "sync"))
    con(f"{m('lfo1')}.out", f"{m('dds1')}.hf_sum", {"all": [anyof(p("lfo1_wave"), "hf", "hf_trk"), eq(p("lfo1_mode"), "once_dds1")]})
    con(f"{m('lfo1')}.out", f"{m('dds2')}.hf_sum", {"all": [anyof(p("lfo1_wave"), "hf", "hf_trk"), eq(p("lfo1_mode"), "reset_dds2")]})
    con(f"{m('dds1')}.out", f"{m('mix')}.a")
    con(f"{m('dds2')}.out", f"{m('mix')}.b", {"param": p("dds2_range"), "not_equals": "lfo"}, note="RING mode passes the ring-modulated signal through this channel.")
    con(f"{m('sub')}.out", f"{m('mix')}.b", {"all": [eq(p("dds2_range"), "lfo"), {"param": p("dds2_mode"), "not_equals": "norm"}]})
    con(f"{m('mix')}.out", f"{m('hpf')}.in", amount=p("mix"))
    con(f"{m('hpf')}.out", f"{m('lpf')}.in", amount=p("drive"))
    for e in ("env1", "env2"):
        con("kbd.gate", f"{m(e)}.gate", "gate")
        con(f"{m(e)}.out", f"{m('lpf')}.cutoff_cv", "cv", anyof(p("vcf_env_src"), e, "1_plus_2"), amount=p("vcf_env"))
    con(f"{m('lfo1')}.out", f"{m('lpf')}.cutoff_cv", "cv", amount=p("vcf_lfo1"))
    con(f"{m('dds2')}.mod_out", f"{m('lpf')}.cutoff_cv", "cv", amount=p("vcf_dds2"))
    con("kbd.pitch", f"{m('lpf')}.cutoff_cv", "cv", {"param": p("keytrack"), "not_equals": "off"})
    con("bender.bend", f"{m('lpf')}.cutoff_cv", "cv", amount="perf.bend_vcf")
    con("lfo2.out", f"{m('lpf')}.cutoff_cv", "cv", amount="lfo2.vcf")
    con("kbd.velocity", f"{m('lpf')}.cutoff_cv", "cv", {"param": p("dynamics"), "not_equals": "off"})
    con(f"{m('lpf')}.out", f"{m('vca')}.in")
    con(f"{m('env2')}.out", f"{m('vca')}.cv", "cv", eq(p("vca_mode"), "env2"), amount=p("vca_env"))
    con("kbd.gate", f"{m('vca')}.cv", "gate", {"param": p("vca_mode"), "not_equals": "env2"}, amount=p("vca_env"))
    con(f"{m('lfo1')}.out", f"{m('vca')}.cv", "cv", amount=p("vca_lfo1"))
    con(f"{m('dds2')}.mod_out", f"{m('vca')}.cv", "cv", amount=p("vca_dds2"))
    con("lfo2.out", f"{m('vca')}.cv", "cv", amount="lfo2.vca")
    con("kbd.velocity", f"{m('vca')}.cv", "cv", {"param": p("dynamics"), "not_equals": "off"})
    con("kbd.gate", f"{m('lfo1')}.reset", "gate", eq(p("lfo1_mode"), "reset_dds2"))
    con(f"{m('vca')}.out", f"{m('chorus')}.in", note="Layer voices summed (binaural pairs to L/R), panned.")
    con(f"{m('chorus')}.out", f"{m('delay')}.in", amount=p("delay_send"))
    con(f"{m('delay')}.out", f"out.{L}")
con("bender.push", "lfo2.trigger", "cv", {"param": "lfo2.trigger", "not_equals": "on_at_bend"})
con("kbd.aftertouch", "lfo2.trigger", "cv", eq("lfo2.trigger", "at_trig"))
con("bender.push", "lfo2.rate_cv", "cv", amount="lfo2.rate_mod")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
SRC = [(1, "DDS 2", "up_dds2.mod_out", True), (2, "LFO 2", "lfo2.out", True), (3, "Envelope 1", "up_env1.out", True), (4, "Velocity", "kbd.velocity", True), (5, "Aftertouch (polyphonic)", "kbd.aftertouch", True),
       (6, "Expression pedal/CV", "pedals.exp", False), (7, "Ribbon controller", "ribbon.out", False), (8, "Note number", "kbd.pitch", True)]
DST = [("A", "LFO 1 rate", "up.lfo1_rate"), ("B", "Cross modulation", "up.cross_mod"), ("C", "Wave modulation", "up.pw_wave"), ("D", "Oscillator mix", "up.mix"), ("E", "High-pass filter cutoff", "up.hpf"),
       ("F", "Low-pass filter resonance", "up.res"), ("G", "Envelope 1 decay", "up.env1_decay"), ("H", "Delay time", "up.delay_time")]
DIRECT = [("DDS 2 tune", "up.dds2_tune"), ("Low-pass cutoff", "up.lpf"), ("VCF envelope amount", "up.vcf_env"), ("VCF LFO 1 amount", "up.vcf_lfo1"), ("VCF DDS 2 amount", "up.vcf_dds2"),
          ("VCA envelope level", "up.vca_env"), ("VCA LFO 1 amount", "up.vca_lfo1"), ("VCA DDS 2 amount", "up.vca_dds2"), ("Envelope 1 attack", "up.env1_attack"), ("Envelope 1 sustain", "up.env1_sustain"),
          ("Envelope 1 release", "up.env1_release"), ("Envelope 2 attack", "up.env2_attack"), ("Envelope 2 decay", "up.env2_decay"), ("Envelope 2 sustain", "up.env2_sustain"),
          ("Envelope 2 release", "up.env2_release"), ("LFO 1 delay", "up.lfo1_delay"), ("LFO 1 LR phase", "up.lfo1_lr_phase"), ("LFO 2 rate", "lfo2.rate"), ("LFO 2 delay", "lfo2.delay"),
          ("DDS modulator LFO 1 amount", "up.dds_lfo1"), ("DDS 2 PW / DDS 1 detune", "up.pw_detune"), ("Portamento time", "perf.portamento"), ("Delay send", "up.delay_send"), ("Delay feedback", "up.delay_feedback")]
D["mod_matrix"] = {
    "name": "Modulation matrix (one per layer; upper layer shown)", "module": "kbd", "slots": len(SRC) * (len(DST) + len(DIRECT)), "combine": "single",
    "sources": [{"id": i, "name": n, "node": nd, "per_voice": pv, "description": f"Select button {i}"} for i, n, nd, pv in SRC],
    "destinations": [{"id": i, "name": n, "parameter": pr, "description": f"Matrix destination, button {i}"} for i, n, pr in DST]
                    + [{"id": f"direct_{k}", "name": n, "parameter": pr, "description": "Direct parameter mapping (hold a source button, or LFO 1, and move the control)"} for k, (n, pr) in enumerate(DIRECT, start=1)],
    "depth_range": {"min": -100, "max": 100},
    "note": ("Each layer has its own matrix (LAYER UPPER/LOWER selects); parameters shown point at the upper layer, the lower layer mirrors them. LFO 1 can also be a direct-mapping source. "
             "Assigning the ribbon in the matrix removes its default pitch control. Clear all, by source or by destination with MOD AMOUNT push or SHIFT + MOD ASSIGN."),
}
D["indicators"] = [
    {"id": "select_leds", "module": "kbd", "label": "button LEDs 1-8, A-H, PERF, PATCH, WAVE", "kind": "led", "function": "Group, bank, number (flashing = edited or second bank), matrix, steps, waves, fine-tune legend."},
    {"id": "rate_leds", "module": "lfo2", "label": "rate LEDs", "kind": "led", "function": "LFO 1, LFO 2, ENV 1 loop, delay time and tempo."},
    {"id": "octave_leds", "module": "kbd", "label": "octave LEDs", "kind": "led", "function": "Octave; flashing for transpose or non-440 tuning."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Layers and performances", "applies_to": ["kbd"],
     "rule": "A performance holds an upper and a lower layer, each with its own patch, in SINGLE (one layer, 20 voices), DUAL (stacked, 10 each) or SPLIT (10 each around a split point, default C4). Binaural halves each layer's voice count. Storing a performance snapshots both layers; save a layer as a patch to reuse it."},
    {"id": "b02", "name": "Per-layer engine", "applies_to": ["up_dds1", "lo_dds1", "up_lpf", "lo_lpf"],
     "rule": "Each layer: DDS 1 and DDS 2 (or sub, or ring mod) into MIX, 6 dB HPF, SSI 24 dB LPF with drive, VCA; ENV 1, ENV 2, LFO 1; then chorus and delay (send). Panel rows: upper layer on top, lower layer second."},
    {"id": "b03", "name": "Performance controls per layer", "applies_to": ["bender", "lfo2"],
     "rule": "The bender, LFO 2, portamento and octave settings can differ per layer: set the layer selector to UPPER or LOWER and adjust, or BOTH to copy the upper settings to both. For example, bend the upper layer an octave and the lower a fifth."},
    {"id": "b04", "name": "Ribbon controller", "applies_to": ["ribbon"], "rule": "Pitch bend of held notes (start low and slide up for maximum upward bend, or vice versa); no effect in release. Assigning it in the matrix makes it a modulation source instead."},
    {"id": "b05", "name": "DDS 2 modes and sub", "applies_to": ["up_dds2", "lo_dds2"],
     "rule": "NORM; RING (DDS 1 x DDS 2 through the DDS 2 channel; cross mod adds carrier modulation); SYNC (DDS 2 slaved, cross mod reversed). At LFO range DDS 2 is a 0.1-100 Hz modulator and the switch selects no sub, a square sub or a sine sub an octave below DDS 1."},
    {"id": "b06", "name": "Arpeggiator and sequencer per layer", "applies_to": ["up_arp", "lo_arp"],
     "rule": "Each layer has its own arpeggiator (up, down, up & down, random; 1-4 octaves; swing) or 64-step sequencer (step, slide, accent, rest, length) and HOLD; tempo 30-300 BPM is shared. 16 sequences stored separately from patches."},
    {"id": "b07", "name": "MIDI", "applies_to": ["kbd"], "rule": "Upper layer on the base channel, lower on the next; same CC numbers per layer; NRPN = 1024 + CC for 14-bit control. DIN and USB MIDI cannot be used together. MPE reserved."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "poly_pressure"}, {"message": "channel_pressure"}, {"message": "program_change"},
                 {"message": "control_change", "note": "full table (see parameter access): 0 bank, 1 mod lever, 2/34 ribbon, 3 tempo, 4 foot, 11 expression, 14 sequence load, 59 manual, 64 sustain, 69 freeze, 104 modulation layer, 122 local"},
                 {"message": "nrpn", "note": "1024 + CC for continuous parameters (14-bit); globals as in the table"}, {"message": "rpn", "number": 0, "parameter": "pitch bend ±12"},
                 {"message": "rpn", "number": 1, "parameter": "fine tuning ±100 cents"}, {"message": "rpn", "number": 2, "parameter": "coarse tuning"}, {"message": "clock"}, {"message": "start"}, {"message": "stop"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "control_change"}, {"message": "nrpn"}, {"message": "program_change"}, {"message": "clock"}],
    "channel_note": "Base channel = upper layer; base + 1 = lower layer.", "note": "From the manual's tables (pages 117-123)."}
D["specifications"] = {
    "voices": "20 (10 binaural super voices; 5 per layer in dual/split binaural)", "layers": 2, "keyboard": "61 keys, velocity, polyphonic aftertouch", "controllers": ["bender", "ribbon", "mod lever"],
    "oscillators": "2 FPGA DDS per voice (DDS 1 super core, 32 alternative waves)", "filters": "6 dB HPF + SSI 24 dB LPF", "envelopes": "2 per voice, 1 ms-10 s", "lfos": "LFO 1 per layer (to 20 kHz), LFO 2 shared",
    "effects": "24-bit chorus and delay per layer", "memory": "128 performances, 256 patches, 16 sequences",
    "connections": {"outputs": "mix, upper and lower L/R (1/4\" unbalanced)", "phones": "1/4\" and 3.5 mm", "pedals": "volume, expression, sustain (dual), delay freeze (dual)", "midi": "DIN in, out, thru; USB"},
    "power": "90-240 V AC, 47-63 Hz, 50 W, 2 A T fuse",
}
D["omitted_from_source"] = ["safety text", "how-to guide and cheat sheet", "file management steps", "glossary"]
D["not_in_source"] = ["dimensions and weight", "output levels", "exact RPN 2 range"]
D["source_inconsistencies"] = [
    "The oscillator overview says DDS 1 offers 'up to 64' alternative waveforms; the wave chapter describes two groups of 16 (32 in all).",
    "DDS 2's RANGE text says it adjusts 'the coarse frequency of DDS 1'.",
    "Patch group B access is described as accessing 'the performances of group B'.",
    "The patch drive lists 'performances_a' and 'performances_b' as 'groups of 128 performances', but there are 64 per group (2 x 8 x 8 = 128 total).",
    "The ring modulation example says DDS 1 is a square 'at 8 times the frequency of DDS 1'.",
    "The CC table's printed layout drops CC numbers on multi-line rows; numbers were reconstructed from the consecutive order and confirmed at every legible row.",
]
D["modelling_gaps"] = [
    {"topic": "Two layers", "detail": "Each layer's engine and controls are modelled explicitly (up_ and lo_ prefixes); the matrix lists upper-layer parameters and is mirrored for the lower layer."},
    {"topic": "Per-voice modules", "detail": "Voice modules per_voice; effects, arp/seq, LFO 2 and controllers common or per layer."},
    {"topic": "Super 6 lineage", "detail": "Engine detail matches the Super 6 model, with the Super Gemini's additions (wave morph, ring mode, sine sub, VCA DDS 2, delay send, LFO 2 waves, ribbon)."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/udo-audio-super-gemini_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
