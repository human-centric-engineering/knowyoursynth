#!/usr/bin/env python3
"""Assemble the Roland Jupiter-4, Jupiter-6 and Jupiter-8 device files.

Each file models the original hardware, as the earlier VCS3, Easel and TB-303 files
do. The PLUG-OUT software manuals supplied for the Jupiter-4 and Jupiter-8 describe
emulations with extra features (velocity, effects, tempo sync, CONDITION and CIRCUIT
MOD, extra waveforms and modulation routings); those are listed in modelling_gaps,
not modelled.

Sources by model:
  Jupiter-4  original owner's manual (1982 edition, OCR from the Internet Archive scan),
             plus the 2022 PLUG-OUT manual for comparison
  Jupiter-6  original owner's manual (scanned; OCR)
  Jupiter-8  no original manual supplied: Roland's published technical specifications
             for the 1981 instrument, the 2017 PLUG-OUT manual for control functions,
             and secondary sources
"""
import json

S10 = {"min": 0, "max": 10}
TOG, KNOB, FADER, ROT, PB = "toggle_switch", "knob", "fader", "rotary_switch", "push_button"


class Model:
    def __init__(self):
        self.M, self.P, self.J, self.C, self.B, self.I = [], [], [], [], [], []
        self._c = 0

    def mod(self, id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
        m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
        if props:
            m["properties"] = props
        m.update({"inputs": inputs, "outputs": outputs})
        self.M.append(m)

    def par(self, id, module, label, kind, fn, control=FADER, **kw):
        p = {"id": id, "module": module, "label": label, "kind": kind}
        for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
            if k in kw:
                p[k] = kw.pop(k)
        p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
        p["function"] = fn
        for k in ("confidence", "note"):
            if k in kw:
                p[k] = kw.pop(k)
        assert not kw, kw
        self.P.append(p)

    def enum(self, id, module, label, fn, vals, control=TOG, **kw):
        self.par(id, module, label, "enum", fn, control=control,
                 values=[v if isinstance(v, dict) else {"value": v} for v in vals], **kw)

    def flag(self, id, module, label, fn, control=PB, **kw):
        self.par(id, module, label, "boolean", fn, control=control, **kw)

    def cont(self, id, module, label, fn, control=FADER, **kw):
        kw.setdefault("panel_scale", S10)
        self.par(id, module, label, "continuous", fn, control=control, **kw)

    def adsr(self, env, a, d, r, label="", s_note=None):
        self.cont(f"{env}.attack", env, f"{label}A", "Attack time.", physical={"min": a[0], "max": a[1], "unit": "s"})
        self.cont(f"{env}.decay", env, f"{label}D", "Decay time to the sustain level.", physical={"min": d[0], "max": d[1], "unit": "s"})
        self.cont(f"{env}.sustain", env, f"{label}S", "Sustain level while the key is held.", physical={"min": 0, "max": 100, "unit": "%"})
        self.cont(f"{env}.release", env, f"{label}R", "Release time after the key is let go.", physical={"min": r[0], "max": r[1], "unit": "s"})

    def jack(self, id, label, direction, signal, node, fn, connector, location=None, **kw):
        j = {"id": id, "label": label, "location": location or "rear", "direction": direction, "signal": signal,
             "connector": connector, "node": node, "function": fn}
        for k in ("combine", "electrical", "confidence", "note"):
            if k in kw:
                j[k] = kw.pop(k)
        assert not kw, kw
        self.J.append(j)

    def con(self, frm, to, signal="audio", when=None, **kw):
        self._c += 1
        c = {"id": f"c{self._c:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
        if when:
            c["enabled_when"] = when
        c.update(kw)
        self.C.append(c)

    def beh(self, name, applies, rule, **kw):
        b = {"id": f"b{len(self.B) + 1:02d}", "name": name, "applies_to": applies, "rule": rule}
        b.update(kw)
        self.B.append(b)

    def ind(self, id, module, label, fn, kind="led", **kw):
        i = {"id": id, "module": module, "label": label, "kind": kind, "function": fn}
        i.update(kw)
        self.I.append(i)


def eq(p, v):
    return {"param": p, "equals": v}


def finish(D, m, path):
    D["modules"], D["parameters"], D["ports"], D["connections"] = m.M, m.P, m.J, m.C
    D["indicators"], D["behaviours"] = m.I, m.B
    order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators",
             "behaviours", "midi", "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({k: D[k] for k in order if k in D}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("written", path)


def bend_routes(m, lever_mod, dests):
    """Lever routing: each destination selects BEND, OFF or LFO (Jupiter-4)."""
    for dest, node, sens_note in dests:
        m.con("bend.cv", node, "cv", eq(f"bend.{dest}_select", "bend"), amount="bend.sens", note=sens_note)
        m.con("lfo.out", node, "cv", eq(f"bend.{dest}_select", "lfo"), amount_expr=f"bend.lfo_mod * bend.lever")


# ==========================================================================
# JUPITER-4
# ==========================================================================
def jupiter4():
    m = Model()
    D = {"schema_version": "0.10.0"}
    D["device"] = {
        "id": "roland-jupiter-4", "manufacturer": "Roland", "model": "Jupiter-4 Compuphonic (JP-4)",
        "category": "4-voice polyphonic analogue synthesizer with microprocessor-controlled memory and arpeggiator",
        "based_on": "Original design, 1978-81. Roland's first self-contained polyphonic synthesizer.",
        "sources": [
            {"id": "manual", "title": "Roland Jupiter-4 Owner's Manual (JP-4 OWNER'S MANUAL '82 AUG.)", "kind": "user_manual",
             "file": "Roland_Jupiter_4_Manual.pdf", "pages": 42,
             "note": "Internet Archive scan with an imperfect OCR layer. Front panel, programmable, modifier and controller sections, "
                     "assign modes, arpeggio, memory, connections and specifications. Sample sound charts are drawings and not read."},
            {"id": "plugout", "title": "Roland JUPITER-4 PLUG-OUT Software Synthesizer Owner's Manual (2022)", "kind": "other",
             "file": "Jupiter-4_Manual.pdf", "pages": 15,
             "note": "A software recreation with extra features. Used to confirm assign mode and portamento behaviour; its additions are listed in modelling_gaps."},
            {"id": "wikipedia", "title": "Wikipedia, 'Roland Jupiter-4'", "kind": "other", "file": "https://en.wikipedia.org/wiki/Roland_Jupiter-4",
             "note": "Two ADSRs per voice, LFO reaching audio rate, voice card revisions (BA662 and IR3109 filters), MN3004-based ensemble, unmemorised master volume and portamento."},
        ],
    }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 4, "polyphony_mode": "polyphonic, 4 voices; unison modes",
        "poly_chain_max_units": None, "patch_memory": True,
        "patch_memory_note": "8 user memories (COMPU-MEMORY) plus 10 fixed presets, battery backed. The modifier and controller sections are not memorised.",
        "semi_modular": False,
        "panel_counts": {"keys": 49, "user_memories": 8, "presets": 10},
        "summary": ("Four voice cards, each with one VCO plus a sub-oscillator, noise, a high-pass filter, a resonant low-pass VCF with its own "
                    "ADSR, and a VCA with a second ADSR. One LFO, an arpeggiator and four voice assign modes run on two microcontrollers, "
                    "which also store 8 patches beside 10 presets. A modifier section adds a trigger generator for the arpeggio and a "
                    "noise sample-and-hold on the filter, LFO delay and a live LFO rate offset. A stereo ensemble chorus feeds two outputs."),
    }
    # modules
    m.mod("kbd", "voice_allocator", "Keyboard, assigner and arpeggio", "ARPEGGIO / KEY ASSIGNMENT / CONTROLLER",
          "49-key keyboard with four assign modes, an up/down/up+down/random arpeggio over up to four octaves, hold, polyphonic "
          "portamento, transpose and master tuning. Sends pitch CV and gates to the four voices.",
          ["kbd.clock_in", "kbd.hold_in"], ["kbd.cv", "kbd.gate"], scope="common",
          props={"keys": 49, "range_octaves_with_transpose": 7})
    m.mod("trig", "gate_logic", "Trigger generator", "MODIFIER: TRIGGER",
          "Internal clock for the arpeggio and the filter sample-and-hold, with an external clock input as the alternative source for either.",
          ["trig.ext_in"], ["trig.int", "trig.ext"], scope="common", props={"rate_hz": [None, 25]})
    m.mod("lfo", "lfo", "LFO", "PROGRAMMABLE: LFO",
          "One LFO shared by all voices, 0.1 to 80 Hz, so it reaches audio rate for crude FM and AM. Its rate is memorised; the modifier "
          "section's LFO BEND slider offsets it live, and DELAY TIME fades it in on each new key.",
          [], ["lfo.out"], scope="common", props={"rate_hz": [0.1, 80], "waveforms": ["sine (triangle)", "square", "sawtooth", "reverse sawtooth"]})
    m.mod("noise", "noise", "Noise generator", "PROGRAMMABLE: NOISE", "Noise source for the voices and for the filter sample-and-hold.",
          [], ["noise.out"], scope="common")
    m.mod("snh", "sample_hold", "VCF sample and hold", "MODIFIER: VCF",
          "Samples noise at the trigger rate (or an external clock) to step the filter cutoff randomly.",
          ["snh.in", "snh.clock"], ["snh.out"], scope="common")
    m.mod("vco", "oscillator", "VCO", "PROGRAMMABLE: VCO",
          "One VCO per voice: off, sawtooth, square or pulse, at 16', 8' or 4'. Pulse width is set to one of four widths or modulated by the "
          "LFO. A sub-oscillator adds a square one octave down.",
          ["vco.pitch_cv", "vco.pw_cv"], ["vco.wave", "vco.sub"],
          props={"ranges": ["16'", "8'", "4'"], "pulse_widths_pct": [50, 40, 20, 10]})
    m.mod("mix", "mixer", "Voice source mix", "PROGRAMMABLE", "Combines the VCO waveform, sub-oscillator and noise as switched on.",
          ["mix.wave", "mix.sub", "mix.noise"], ["mix.out"])
    m.mod("hpf", "filter", "HPF", "PROGRAMMABLE: VCF", "High-pass filter ahead of the low-pass VCF; at minimum it passes everything.",
          ["hpf.in"], ["hpf.out"], props={"cutoff_hz": [40, 5000]})
    m.mod("vcf", "filter", "VCF (low-pass)", "PROGRAMMABLE: VCF",
          "Resonant low-pass filter, self-oscillating at full resonance, with keyboard follow, LFO and envelope modulation.",
          ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"],
          props={"self_oscillates": True, "chip": "BA662 on early B/C/D voice cards, IR3109 on later E cards (Wikipedia)"})
    m.mod("env_f", "envelope", "VCF envelope (ADSR)", "PROGRAMMABLE: ENVELOPE", "ADSR for the filter, with a polarity switch.",
          ["env_f.gate"], ["env_f.out"])
    m.mod("env_a", "envelope", "VCA envelope (ADSR)", "PROGRAMMABLE: ENVELOPE", "ADSR for the VCA.", ["env_a.gate"], ["env_a.out"])
    m.mod("vca", "vca", "VCA", "PROGRAMMABLE: VCA", "Shapes each voice with its envelope; LEVEL sets the memorised output, with an overload lamp.",
          ["vca.in", "vca.cv"], ["vca.out"])
    m.mod("bend", "manual_controller", "Bend / modulation lever", "CONTROLLER: BEND / MODULATION",
          "Spring-loaded left-right lever. For each of VCO, VCF and VCA a switch picks BEND, OFF or LFO: BEND moves that destination by "
          "BEND SENS, LFO makes the lever set the depth of LFO modulation up to LFO MOD.",
          [], ["bend.cv"], scope="common")
    m.mod("ens", "chorus", "Ensemble", "ENSEMBLE", "Stereo chorus on the summed voices (two MN3004 bucket brigades, per Wikipedia).",
          ["ens.in"], ["ens.out_a", "ens.out_b"], scope="common")
    m.mod("out", "output", "Output", "VOLUME / connection jacks",
          "Master VOLUME (not memorised), expression pedal, mono and stereo outputs, headphones.",
          ["out.in_a", "out.in_b", "out.exp_cv"], ["out.mono", "out.stereo", "out.phones"], scope="common")
    m.mod("memory", "cv_source_selector", "COMPU-MEMORY and presets", "MEMORY",
          "Selects the programmable panel (MANUAL), one of 8 user memories or one of 10 presets.", [], [], scope="common")

    # parameters: programmable
    m.enum("vco.range", "vco", "RANGE", "Octave of the VCO.", ["16'", "8'", "4'"], control=ROT)
    m.enum("vco.waveform", "vco", "WAVE FORM", "VCO output waveform.", ["off", "sawtooth", "square", "pulse"], control=ROT)
    m.cont("vco.pw", "vco", "PW", "With PW at MANUAL, steps the pulse width through 50, 40, 20 and 10%; at MOD, sets the depth of LFO pulse width modulation.")
    m.enum("vco.pw_mode", "vco", "PW switch", "Manual pulse width or LFO modulation.", ["manual", "mod"])
    m.cont("vco.lfo_mod", "vco", "MOD", "Depth of LFO pitch modulation (vibrato).")
    m.flag("vco.sub", "vco", "SUB", "Adds a square wave one octave below.", control=TOG)
    m.flag("noise.on", "noise", "NOISE", "Adds noise to the voice.", control=TOG)
    m.cont("hpf.cutoff", "hpf", "HPF CUTOFF FREQ", "High-pass cutoff; minimum passes everything.", physical={"min": 40, "max": 5000, "unit": "Hz"},
           note="Upper limit read from a poor OCR scan.")
    m.cont("vcf.cutoff", "vcf", "LPF CUTOFF FREQ", "Low-pass cutoff.")
    m.cont("vcf.resonance", "vcf", "RES", "Emphasis at the cutoff, to self-oscillation. Raising it lowers the volume.")
    m.enum("vcf.kybd_follow", "vcf", "KYBD FOLLOW", "How much keyboard pitch moves the cutoff.", [10, 40, 70, 100], control=ROT,
           note="Values are percentages.")
    m.cont("vcf.lfo_mod", "vcf", "LFO MOD", "Depth of LFO cutoff modulation (growl).")
    m.cont("vcf.env_mod", "vcf", "ENV MOD", "Depth of the filter envelope on cutoff.")
    m.enum("env_f.polarity", "env_f", "POLARITY", "Normal or inverted filter envelope.", ["normal", "inverted"])
    m.adsr("env_f", (0.0006, 3), (0.014, 10), (0.014, 10), "VCF ")
    m.adsr("env_a", (0.0006, 3), (0.014, 10), (0.014, 10), "VCA ")
    m.cont("vca.level", "vca", "LEVEL", "Memorised output level of the programmable section; too high distorts and lights OVERLOAD.")
    m.cont("lfo.rate", "lfo", "RATE", "LFO rate, memorised.", physical={"min": 0.1, "max": 80, "unit": "Hz"})
    m.enum("lfo.waveform", "lfo", "WAVE FORM", "LFO waveform.", ["sine", "square", "sawtooth", "reverse_sawtooth"], control=ROT)
    # modifier (not memorised)
    m.cont("trig.rate", "trig", "TRIGGER RATE", "Rate of the internal trigger generator: arpeggio speed and sample-and-hold rate.",
           physical={"max": 25, "unit": "Hz"})
    m.enum("trig.arp_clock", "trig", "ARPEGGIO INT/EXT", "Arpeggio clock source.", ["int", "ext"])
    m.enum("trig.snh_clock", "trig", "VCF INT/EXT", "Clock for the filter sample-and-hold.", ["int", "ext"])
    m.cont("trig.vcf_mod", "snh", "VCF MOD", "Depth of the noise sample-and-hold on filter cutoff.")
    m.cont("lfo.bend_rate", "lfo", "LFO BEND", "Live offset to the memorised LFO rate; centre (0) leaves it unchanged.", panel_scale={"min": -5, "max": 5})
    m.enum("lfo.bend_width", "lfo", "NORMAL/WIDE", "Range of the LFO BEND slider.", ["normal", "wide"])
    m.cont("lfo.delay", "lfo", "DELAY TIME", "Time before LFO modulation starts after a key; only on the first note of a legato phrase.",
           physical={"min": 0, "max": 10, "unit": "s"})
    # controller
    m.cont("kbd.portamento", "kbd", "PORTAMENTO", "Glide time between notes, up to about 1 s per octave. Not memorised.", control=KNOB)
    m.flag("kbd.portamento_on", "kbd", "PORTAMENTO SWITCH", "Turns portamento on or off.", control=TOG)
    m.enum("kbd.transpose", "kbd", "TRANSPOSE", "Normal or one octave down.", ["normal", "1_oct_down"])
    m.cont("bend.lfo_mod", "bend", "LFO MOD", "Maximum LFO depth reached with the lever on destinations set to LFO.", control=KNOB)
    m.cont("bend.sens", "bend", "BEND SENS", "Maximum bend on destinations set to BEND: over +1 oct (VCO), +2 oct (VCF), +12 dB (VCA).", control=KNOB)
    for d in ("vco", "vcf", "vca"):
        m.enum(f"bend.{d}_select", "bend", f"BEND/LFO {d.upper()}", f"What the lever does to the {d.upper()}.", ["lfo", "off", "bend"])
    m.cont("bend.lever", "bend", "BEND / MOD lever", "Spring-loaded lever, centre at rest.", panel_scale={"min": -1, "max": 1},
           access=[{"type": "panel", "control": "joystick", "note": "left-right lever"}])
    # front panel
    m.cont("out.volume", "out", "VOLUME", "Master volume. Not memorised.", control=KNOB)
    m.cont("kbd.tuning", "kbd", "TUNING", "Master tuning, about ±50 cents; centred gives A = 442 Hz.", control=KNOB, panel_scale={"min": -5, "max": 5})
    m.flag("ens.on", "ens", "ENSEMBLE", "Ensemble chorus on or off.")
    m.enum("kbd.arp_mode", "kbd", "ARPEGGIO", "Arpeggio pattern.", ["off", "up", "down", "up_down", "random"], control=ROT,
           note="The manual lists four patterns; an off position is assumed, as the arpeggio can be stopped.", confidence="inferred")
    m.enum("kbd.assign", "kbd", "KEY ASSIGNMENT MODE", "How keys are given to the four voices.", ["unison_1", "unison_2", "poly_1", "poly_2"], control=ROT)
    m.flag("kbd.hold", "kbd", "HOLD", "Holds notes at the VCA sustain level after release.")
    m.flag("memory.manual", "memory", "MANUAL", "Plays the programmable panel; switched off by choosing a preset.")
    m.enum("memory.compu", "memory", "COMPU-MEMORY 1-8", "Recalls a user memory.", list(range(1, 9)), control=PB)
    m.enum("memory.preset", "memory", "PRE-SET", "Recalls a fixed preset.",
           ["bass", "strings", "clavichord", "piano", "voice", "trombone", "sax", "trumpet", "synth", "the_force"], control=PB)
    m.flag("memory.write", "memory", "MEMORY WRITE", "Stores the programmable panel in the selected memory, pressed with PROTECTION.")
    m.flag("memory.protect", "memory", "PROTECTION", "Must be held with WRITE, so a memory cannot be overwritten by accident.")
    m.enum("out.level_select", "out", "OUTPUT LEVEL", "Output level to suit the amplifier.", ["L", "M", "H"])
    m.cont("out.phones_level", "out", "HEADPHONE LEVEL", "Headphone level.", control=KNOB)

    # connections
    m.con("kbd.cv", "vco.pitch_cv", "cv", note="Includes portamento and transpose.")
    m.con("kbd.gate", "env_f.gate", "gate")
    m.con("kbd.gate", "env_a.gate", "gate")
    m.con("trig.int", "kbd.clock_in", "clock", eq("trig.arp_clock", "int"))
    m.con("trig.ext", "kbd.clock_in", "clock", eq("trig.arp_clock", "ext"))
    m.con("trig.int", "snh.clock", "clock", eq("trig.snh_clock", "int"))
    m.con("trig.ext", "snh.clock", "clock", eq("trig.snh_clock", "ext"))
    m.con("noise.out", "snh.in", "cv")
    m.con("snh.out", "vcf.cutoff_cv", "cv", amount="trig.vcf_mod")
    m.con("lfo.out", "vco.pitch_cv", "cv", amount="vco.lfo_mod", note="Faded in by DELAY TIME.")
    m.con("lfo.out", "vco.pw_cv", "cv", eq("vco.pw_mode", "mod"), amount="vco.pw")
    m.con("vco.wave", "mix.wave", "audio", {"param": "vco.waveform", "not_equals": "off"})
    m.con("vco.sub", "mix.sub", "audio", eq("vco.sub", True))
    m.con("noise.out", "mix.noise", "audio", eq("noise.on", True))
    m.con("mix.out", "hpf.in")
    m.con("hpf.out", "vcf.in", confidence="inferred", note="HPF before LPF, as the panel groups them.")
    m.con("lfo.out", "vcf.cutoff_cv", "cv", amount="vcf.lfo_mod")
    m.con("env_f.out", "vcf.cutoff_cv", "cv", amount="vcf.env_mod")
    m.con("vcf.out", "vca.in")
    m.con("env_a.out", "vca.cv", "cv")
    bend_routes(m, "bend.lfo_mod", [("vco", "vco.pitch_cv", "over +1 octave"), ("vcf", "vcf.cutoff_cv", "over +2 octaves"),
                                    ("vca", "vca.cv", "over +12 dB")])
    m.con("vca.out", "ens.in", amount="vca.level")
    m.con("ens.out_a", "out.in_a")
    m.con("ens.out_b", "out.in_b")

    # ports
    m.jack("jack.output_mono", "OUTPUT (MONO)", "out", "audio", "out.mono", "Main output.", "6.35 mm jack", electrical={"level_db": 0})
    m.jack("jack.output_stereo", "OUTPUT (STEREO)", "out", "audio", "out.stereo", "Second output; with MONO gives the ensemble's stereo image.", "6.35 mm jack")
    m.jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Headphones.", "6.35 mm stereo jack")
    m.jack("jack.ext_clock", "EXT CLOCK IN", "in", "clock", "trig.ext_in", "External clock (CR-68, sequencer, gate) for the arpeggio or filter sample-and-hold.",
           "6.35 mm jack", electrical={"off_v": 0, "on_v_min": 1}, combine="replace")
    m.jack("jack.damper", "DAMPER PEDAL", "in", "gate", "kbd.hold_in", "Pedal switch (DP-1, DP-2) for hold.", "6.35 mm jack")
    m.jack("jack.vcf_pedal", "VCF CONT PEDAL", "in", "cv", "vcf.cutoff_cv", "Foot pedal (FV-20) on cutoff; with resonance, a wah.", "6.35 mm jack", combine="sum")
    m.jack("jack.exp_pedal", "EXP PEDAL", "in", "cv", "out.exp_cv", "Foot volume (FV-20), 0 to -30 dB.", "6.35 mm jack", electrical={"range_db": [-30, 0]})
    m.jack("jack.power", "AC power", "in", "power", None, "Mains power, 30 W.", "mains cord")

    m.ind("out.overload", "vca", "OVERLOAD", "Lights when the programmable section's level distorts.", kind="lamp")
    m.ind("lfo.rate_led", "lfo", "LFO RATE indicator", "Flashes at the LFO rate.")
    m.ind("memory.write_led", "memory", "WRITE indicators", "Confirm a memory write.")
    m.ind("out.pilot", "out", "pilot lamp", "Power on.", kind="lamp")

    m.beh("Assign modes", ["kbd"], "UNISON 1: all four voices play the lowest held key. UNISON 2: one key gets four voices, two keys two each, "
          "three or four keys one each. POLY 1: voices rotate in the order keys are played; suits arpeggios. POLY 2: a key reuses the same "
          "voice, so after a chord a single note keeps only its own release; suits portamento.")
    m.beh("Arpeggio", ["kbd", "trig"], "Arpeggiates held keys up to four octaves above the first note, in UP, DOWN, UP + DOWN or RANDOM. "
          "The order follows the order keys were played, except RANDOM. Speed is the trigger RATE, or an external clock.")
    m.beh("Memory and presets", ["memory"], "MANUAL plays the programmable panel. COMPU-MEMORY 1-8 recall user patches; 10 presets are fixed. "
          "Writing needs MEMORY WRITE pressed together with PROTECTION. The modifier and controller sections, master volume and portamento "
          "always act live and are not stored. A rechargeable battery keeps memory; power the unit every six months.")
    m.beh("Modifier section", ["trig", "snh", "lfo"], "Always live, even over memories. The trigger generator clocks the arpeggio and a noise "
          "sample-and-hold on the filter. LFO BEND offsets the memorised LFO rate (WIDE extends its range). DELAY TIME fades LFO modulation in "
          "after each new key, but only the first note of a legato phrase. Reset these to their normal positions when not in use.")
    m.beh("Lever", ["bend"], "Each of VCO, VCF and VCA is set to BEND, OFF or LFO. BEND destinations move with the lever by up to BEND SENS; "
          "LFO destinations get LFO modulation whose depth follows the lever up to LFO MOD.")
    m.beh("Keyboard range", ["kbd", "vco"], "49 keys; VCO RANGE (16', 8', 4') and TRANSPOSE extend the playable range to seven octaves. At 8' with "
          "TRANSPOSE off, the second C from the left is middle C.")
    m.beh("Envelopes", ["env_f", "env_a"], "Separate ADSRs for filter and amplifier. With all four sliders at 0 the envelope is a click. "
          "With S high, D has little effect. The filter envelope can be inverted for special effects.")

    D["midi"] = {"receives": [], "transmits": [], "note": "None. External control is an arpeggio/sample-and-hold clock input and pedals."}
    D["specifications"] = {
        "voices": 4, "keyboard": "49 keys, C to C", "vco": {"ranges": ["16'", "8'", "4'"], "waveforms": ["sawtooth", "square", "pulse"],
        "pulse_width_pct": [50, 40, 20, 10], "sub_oscillator": "1 octave down"},
        "hpf_cutoff_hz": [40, 5000], "lpf_resonance": "0 to self-oscillation", "kybd_follow_pct": [10, 40, 70, 100],
        "envelopes": {"count_per_voice": 2, "attack_s": [0.0006, 3], "decay_s": [0.014, 10], "sustain_pct": [0, 100], "release_s": [0.014, 10]},
        "lfo": {"rate_hz": [0.1, 80], "delay_s": [0, 10]}, "trigger_rate_hz_max": 25, "portamento": "up to 1 s per octave",
        "bend": {"vco": "over +1 oct", "vcf": "over +2 oct", "vca": "over +12 dB"}, "tuning": "±50 cents (A = 442 Hz at centre)",
        "memory": {"user": 8, "presets": 10, "backup": "rechargeable battery"},
        "connections": ["OUTPUT mono", "OUTPUT stereo", "OUTPUT LEVEL L/M/H", "HEADPHONES", "DAMPER (DP-1, DP-2)", "VCF pedal (FV-20)",
                        "EXP pedal (FV-20, 0 to -30 dB)", "EXT CLOCK IN (off 0 V, on at least +1 V)"],
        "power_w": 30, "dimensions_mm": {"w": 946, "d": 410, "h": 179}, "weight_kg": 19,
    }
    D["omitted_from_source"] = ["the synthesizer basics chapter", "the hook-up diagrams", "the sample sound and setting example charts (drawings)",
                                "the block diagram, beyond its use in confirming the signal path"]
    D["not_in_source"] = [
        "filter slopes for the HPF and LPF",
        "the trigger generator's lowest rate (unreadable in the scan)",
        "whether noise is per voice or shared",
        "how the ARPEGGIO selector turns the arpeggio off",
        "the HPF's exact position in the signal path",
    ]
    D["source_inconsistencies"] = [
        "The manual calls the LFO's first waveform a sine; Wikipedia lists triangle, square, sawtooth and reverse sawtooth.",
        "The manual tunes A to 442 Hz at the centre of TUNING, where most later Roland instruments use 440 Hz.",
        "The PLUG-OUT manual describes separate VCF and VCA ADSRs, LFO random and sine waves, a CHORD arpeggio mode and PWM from either envelope; "
        "the original manual and specifications show neither the extra waveforms, the CHORD mode nor envelope PWM.",
    ]
    D["modelling_gaps"] = [
        {"topic": "PLUG-OUT additions", "detail": "Not modelled: velocity to VCF and VCA, effects (effect, delay, reverb), tempo sync, CONDITION and CIRCUIT MOD, "
         "arpeggio CHORD mode and step length, LFO key trigger and range switch, saw+square waveforms, envelope PWM, VCA LFO MOD and TONE, "
         "octave shift, key hold, bend gain and separate bend/mod sensitivities."},
        {"topic": "Voice card revisions", "detail": "Early cards use a BA662-based filter and later E cards an IR3109; the two sound different."},
        {"topic": "Filter response", "detail": "Slope and resonance behaviour are not documented."},
    ]
    return D, m


# ==========================================================================
# JUPITER-6 and JUPITER-8 share a two-VCO voice
# ==========================================================================
def two_vco_common(m, model):
    m.mod("kbd", "voice_allocator", "Keyboard and assigner", "MEMORY PANEL: KEY MODE / ASSIGN / ARPEGGIO / GLIDE",
          "61-key keyboard. KEY MODE splits or layers the voices into upper and lower patches; ASSIGN chooses how keys take voices; "
          "an arpeggiator and portamento act per section. Sends pitch CV and gates to the voices.",
          ["kbd.clock_in", "kbd.hold_in"] + (["kbd.ext_notes"] if model == 6 else []), ["kbd.cv", "kbd.gate"], scope="common", props={"keys": 61})
    m.mod("lfo", "lfo", "LFO", "LFO", "Main programmable LFO, shared by the voices, with delay.", [], ["lfo.out"], scope="common")
    m.mod("lfo2", "lfo", "Performance LFO", "PERFORMANCE: LFO MOD", "Second LFO for performance vibrato and growl, brought in by the LFO MOD button.",
          [], ["lfo2.out"], scope="common")
    m.mod("vco1", "oscillator", "VCO-1", "VCO-1", "First oscillator; receives cross modulation from VCO-2.",
          ["vco1.pitch_cv", "vco1.pw_cv", "vco1.xmod_in"] + (["vco1.sync_in"] if model == 6 else []), ["vco1.out"])
    m.mod("vco2", "oscillator", "VCO-2", "VCO-2", "Second oscillator; a LOW setting turns it into a low-frequency modulator for cross modulation.",
          ["vco2.pitch_cv", "vco2.pw_cv", "vco2.sync_in"], ["vco2.out"])
    m.mod("mix", "mixer", "Mixer", "MIXER" if model == 6 else "VCO-1/VCO-2 LEVEL", "Balances VCO-1 and VCO-2.", ["mix.vco1", "mix.vco2"], ["mix.out"])
    m.mod("env1", "envelope", "ENV-1", "ENV-1", "ADSR with key follow and polarity; drives VCO modulation, PWM, cross mod and optionally the VCF.",
          ["env1.gate"], ["env1.out"])
    m.mod("env2", "envelope", "ENV-2", "ENV-2", "ADSR with key follow; drives the VCA and optionally the VCF.", ["env2.gate"], ["env2.out"])
    m.mod("vca", "vca", "VCA", "VCA", "Shapes each voice with ENV-2, with LFO tremolo.", ["vca.in", "vca.cv"], ["vca.out"])
    m.mod("bend", "manual_controller", "Bender", "PERFORMANCE: BENDER", "Left-right bender lever with separate VCO and VCF amounts.",
          [], ["bend.cv"], scope="common")
    m.mod("memory", "cv_source_selector", "Patch memory and presets", "MEMORY PANEL",
          "Patch memories, patch presets (a patch or split pair plus performance modes), manual panel, write, protect, tape memory and auto-tune.",
          [], [], scope="common")
    # shared wiring
    m.con("kbd.cv", "vco1.pitch_cv", "cv", note="Includes portamento or glissando.")
    m.con("kbd.cv", "vco2.pitch_cv", "cv", {"param": "vco2.range", "not_equals": "low"} if model == 6 else {"param": "vco2.freq_mode", "not_equals": "low"},
          note="In LOW the VCO-2 pitch no longer follows the keyboard.")
    m.con("kbd.gate", "env1.gate", "gate")
    m.con("kbd.gate", "env2.gate", "gate")
    m.con("vco2.out", "vco1.xmod_in", "audio", amount="vco1.xmod")
    m.con("vco1.out", "mix.vco1")
    m.con("vco2.out", "mix.vco2")
    m.con("env2.out", "vca.cv", "cv", amount="vca.level")
    m.con("lfo.out", "vca.cv", "cv", amount="vca.lfo_mod")
    m.con("bend.cv", "vcf.cutoff_cv", "cv", amount="bend.vcf_sens")
    m.con("lfo2.out", "vcf.cutoff_cv", "cv", amount="lfo2.vcf")
    for n in (1, 2):
        m.con("lfo.out", f"vco{n}.pitch_cv", "cv", {"any": [eq("vcomod.target", f"vco{n}"), eq("vcomod.target", "both")]}, amount="vcomod.lfo")
        m.con("env1.out", f"vco{n}.pitch_cv", "cv", {"any": [eq("vcomod.target", f"vco{n}"), eq("vcomod.target", "both")]}, amount="vcomod.env")
        m.con("bend.cv", f"vco{n}.pitch_cv", "cv", eq(f"bend.vco{n}", True), amount="bend.vco_sens")
        m.con("lfo2.out", f"vco{n}.pitch_cv", "cv", amount="lfo2.vco", note="Only while the LFO MOD button is held or on.")
    # shared parameters
    m.cont("vcomod.lfo", "vco1", "VCO MOD LFO", "Depth of LFO pitch modulation.")
    m.cont("vcomod.env", "vco1", "VCO MOD ENV", "Depth of ENV-1 pitch modulation.")
    m.enum("vcomod.target", "vco1", "VCO MOD selector", "Which VCOs the LFO and ENV pitch modulation reach.", ["vco1", "both", "vco2"])
    for env in ("env1", "env2"):
        m.flag(f"{env}.key_follow", env, "KEY FOLLOW", "Shorter envelope times on higher notes.", control=TOG) if model == 8 else \
            m.cont(f"{env}.key_follow", env, "KEY FOLLOW", "Shortens the envelope on higher notes.", physical={"min": 0, "max": 120, "unit": "%"})
    m.enum("env1.polarity", "env1", "POLARITY", "Normal or inverted ENV-1.", ["normal", "inverted"])
    m.cont("vca.lfo_mod", "vca", "LFO MOD", "Tremolo depth.") if model == 6 else \
        m.enum("vca.lfo_mod", "vca", "LFO MOD", "Tremolo depth in four steps.", [0, 1, 2, 3], control=ROT)
    m.cont("bend.lever", "bend", "BENDER lever", "Left-right lever, centre at rest.", panel_scale={"min": -1, "max": 1},
           access=[{"type": "panel", "control": "joystick", "note": "left-right lever"}])
    m.cont("bend.vco_sens", "bend", "BEND VCO", "Maximum bend on pitch.", control=KNOB)
    m.cont("bend.vcf_sens", "bend", "BEND VCF", "Maximum bend on cutoff.", control=KNOB)
    m.flag("bend.vco1", "bend", "BEND VCO-1", "Bend reaches VCO-1.")
    m.flag("bend.vco2", "bend", "BEND VCO-2", "Bend reaches VCO-2.")
    m.flag("lfo2.on", "lfo2", "LFO MOD", "Brings in the performance LFO.")
    m.cont("lfo2.vco", "lfo2", "LFO MOD VCO", "Performance vibrato depth.", control=KNOB)
    m.cont("lfo2.vcf", "lfo2", "LFO MOD VCF", "Performance growl depth.", control=KNOB)
    m.cont("lfo2.rise", "lfo2", "RISE TIME", "Time for the performance LFO to reach depth.", control=KNOB)
    m.enum("kbd.assign", "kbd", "ASSIGN", "Voice assignment.", ["solo", "unison", "poly_1", "poly_2"] + (["solo_unison"] if model == 6 else []), control=PB)
    m.flag("kbd.hold", "kbd", "HOLD", "Holds notes at the sustain level; per section in split.")
    m.cont("kbd.glide_time", "kbd", "GLIDE TIME" if model == 6 else "PORTAMENTO", "Portamento or glissando time.", control=KNOB)
    m.cont("kbd.arp_rate", "kbd", "ARPEGGIO RATE", "Arpeggio speed.", control=KNOB)
    m.enum("kbd.arp_range", "kbd", "ARPEGGIO RANGE", "Arpeggio range in octaves.", [1, 2, 3, 4], control=PB)
    m.cont("out.volume", "out", "VOLUME", "Master volume. Not memorised.", control=KNOB)
    m.cont("out.balance", "out", "BALANCE", "Upper and lower balance in split (and dual) mode.", control=KNOB)
    m.flag("memory.manual", "memory", "MANUAL", "Plays the manual control section.")
    m.flag("memory.write", "memory", "WRITE", "Writes the current patch or preset.")
    m.flag("memory.patch_preset", "memory", "PATCH PRESET", "Switches the bank and number buttons to patch presets.")
    m.flag("kbd.auto_tune", "kbd", "AUTO TUNE" if model == 6 else "MASTER TUNE BUTTON (Compu Tune)", "Tunes all VCOs automatically; also done at power-on.")
    m.cont("kbd.master_tune", "kbd", "MASTER TUNE", "Overall tuning, ±50 cents.", control=KNOB, panel_scale={"min": -5, "max": 5})
    m.enum("memory.protect", "memory", "MEMORY PROTECT", "Rear switch that guards the patch memories.", ["on", "off"], control=TOG)
    for b in ("dump" if model == 8 else "save", "verify", "load"):
        m.flag(f"memory.tape_{b}", "memory", f"TAPE {b.upper()}", f"Tape memory: {b} patch data.")


# ==========================================================================
# JUPITER-6
# ==========================================================================
def jupiter6():
    m = Model()
    D = {"schema_version": "0.10.0"}
    D["device"] = {
        "id": "roland-jupiter-6", "manufacturer": "Roland", "model": "Jupiter-6 (JP-6) Programmable Polyphonic Synthesizer",
        "category": "6-voice polyphonic analogue synthesizer with split keyboard, arpeggiator and MIDI",
        "based_on": "Successor to the Jupiter-8 at a lower price, 1983-85; one of the first instruments with MIDI.",
        "sources": [
            {"id": "manual", "title": "Roland Jupiter-6 Owner's Manual", "kind": "user_manual", "file": "Jupiter-6_Owner_s_Manual.pdf", "pages": 39,
             "note": "Scanned; read by OCR. Performance controls, manual section, patch writing, tape memory, external control and specifications."},
            {"id": "sos", "title": "Sound On Sound, 'Roland Jupiter 6' (retro review)", "kind": "other", "file": "https://www.soundonsound.com/reviews/roland-jupiter-6",
             "note": "Original MIDI implementation: note on/off and patch preset changes only, permanently in omni."},
            {"id": "midi_forums", "title": "Kid Nepro and Vintage Synth Explorer notes on Jupiter-6 MIDI", "kind": "other",
             "file": "https://www.kidnepro.com/mobile/roland/roland-jupiter6-sounds-mobile.html",
             "note": "Omni at power-on, channel 1 (upper) and 2 (lower) after omni off, v6.0 ROM channel select, MIDI THRU from serial 353800."},
        ],
    }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 6, "polyphony_mode": "polyphonic, 6 voices; split 4+2 or 2+4; unison and solo modes",
        "poly_chain_max_units": None, "patch_memory": True,
        "patch_memory_note": "48 patch memories (6 banks x 8) and 32 patch presets (4 banks x 8) that store a patch or split pair with performance modes. Battery backed; tape save.",
        "semi_modular": False, "panel_counts": {"keys": 61, "patch_memories": 48, "patch_presets": 32},
        "summary": ("Two VCOs per voice with cross modulation, two-way sync and chromatic range controls, a multimode VCF (low-pass, high-pass "
                    "or band-pass), two ADSRs with key follow, a programmable LFO and a performance LFO. The keyboard can split into two "
                    "patches, and five assign modes include solo-unison with detune. Arpeggiator, portamento and glissando, auto-tune, "
                    "tape memory and an early MIDI interface."),
    }
    two_vco_common(m, 6)
    m.mod("vcf", "filter", "VCF (multimode)", "VCF", "Low-pass (24 dB/oct), high-pass (24 dB/oct) or band-pass (12 dB/oct, both switches down), with resonance.",
          ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"cutoff_hz": [5, 30000], "modes": {"lpf": -24, "hpf": -24, "bpf": -12}})
    m.mod("midi", "midi_to_cv", "MIDI interface", "(rear panel)", "Early MIDI: note on/off and patch preset changes in, keyboard notes out.",
          [], ["midi.notes"], scope="common")
    m.mod("out", "output", "Output", "VOLUME / rear panel", "Volume, unbalanced and balanced outputs, headphones; foot volume control.",
          ["out.in", "out.vca_pedal"], ["out.unbalanced", "out.balanced", "out.phones"], scope="common")
    m.con("vca.out", "out.in")
    m.con("midi.notes", "kbd.ext_notes", "midi")
    m.con("mix.out", "vcf.in")
    m.con("vcf.out", "vca.in")
    m.con("env1.out", "vco1.xmod_in", "cv", amount="vco1.xmod_env", note="Envelope control of the cross-mod depth.")
    m.con("vco1.out", "vco2.sync_in", "sync", eq("vco.sync", "vco1_to_vco2"))
    m.con("vco2.out", "vco1.sync_in", "sync", eq("vco.sync", "vco2_to_vco1"))
    for n in (1, 2):
        m.con("lfo.out", f"vco{n}.pw_cv", "cv", eq("pwm.source", "lfo"), amount="pwm.depth")
        m.con("env1.out", f"vco{n}.pw_cv", "cv", eq("pwm.source", "env1"), amount="pwm.depth")
    m.con("env1.out", "vcf.cutoff_cv", "cv", eq("vcf.env_select", "env1"), amount="vcf.env_mod")
    m.con("env2.out", "vcf.cutoff_cv", "cv", eq("vcf.env_select", "env2"), amount="vcf.env_mod")
    m.con("lfo.out", "vcf.cutoff_cv", "cv", amount="vcf.lfo_mod")
    m.con("kbd.cv", "vcf.cutoff_cv", "cv", amount="vcf.key_follow")

    m.enum("vco1.range", "vco1", "VCO-1 RANGE", "Pitch in half steps across 32' to 2'.", ["32'", "chromatic steps", "2'"], control=ROT,
           note="A rotary control stepping chromatically; shown here by its end points.")
    for w in ("triangle", "sawtooth", "pulse", "square"):
        m.flag(f"vco1.wave_{w}", "vco1", f"VCO-1 {w.upper()}", f"Adds the {w} wave; waves can be combined, except pulse with square.")
    m.cont("vco1.xmod", "vco1", "CROSS MOD MANUAL", "Depth of VCO-2 modulating VCO-1's frequency.", control=KNOB)
    m.cont("vco1.xmod_env", "vco1", "CROSS MOD ENV-1", "ENV-1 control of cross-mod depth.", control=KNOB)
    m.enum("vco2.range", "vco2", "VCO-2 RANGE", "LOW (about 1.5-50 Hz), chromatic 32' to 2', or HI (2' to 1/2').", ["low", "32'", "chromatic steps", "2'", "high"], control=ROT)
    for w in ("triangle", "sawtooth", "pulse", "noise"):
        m.flag(f"vco2.wave_{w}", "vco2", f"VCO-2 {w.upper()}", f"Adds the {w} output; waves can be combined.")
    m.cont("vco2.tune", "vco2", "TUNE", "Fine pitch between half steps, ±50 cents.", control=KNOB, panel_scale={"min": -5, "max": 5})
    m.enum("vco.sync", "vco2", "SYNC", "Oscillator sync in either direction.", ["off", "vco1_to_vco2", "vco2_to_vco1"])
    m.cont("pwm.pw", "vco1", "PW", "Pulse width: 0 is square (50%), 10 is 0% (silent).")
    m.cont("pwm.depth", "vco1", "PWM", "Depth of pulse width modulation.")
    m.enum("pwm.source", "vco1", "PWM selector", "Source of pulse width modulation.", ["lfo", "env1"])
    m.enum("lfo.waveform", "lfo", "LFO-1 WAVEFORM", "LFO waveform.", ["triangle", "sawtooth", "square", "random"], control=PB)
    m.cont("lfo.rate", "lfo", "RATE", "LFO rate.", physical={"min": 0.04, "max": 100, "unit": "Hz", "note": "random to 400 Hz"})
    m.cont("lfo.delay", "lfo", "DELAY TIME", "Delay before LFO modulation; first note only in legato; no effect on PWM or VCA.",
           physical={"min": 0, "max": 2.5, "unit": "s"})
    m.cont("mix.balance", "mix", "MIX", "Balance of VCO-1 (anticlockwise) and VCO-2 (clockwise).", control=KNOB)
    m.enum("vcf.mode", "vcf", "MODE", "LPF, HPF, or BPF with both pressed.", ["lpf", "hpf", "bpf"])
    m.cont("vcf.cutoff", "vcf", "FREQ", "Cutoff frequency.", physical={"min": 5, "max": 30000, "unit": "Hz"})
    m.cont("vcf.resonance", "vcf", "RES", "Emphasis at the cutoff.")
    m.cont("vcf.env_mod", "vcf", "ENV MOD", "Envelope depth on cutoff; no effect with FREQ at 10.")
    m.enum("vcf.env_select", "vcf", "ENV selector", "Envelope for the filter.", ["env1", "env2"])
    m.cont("vcf.lfo_mod", "vcf", "LFO MOD", "LFO depth on cutoff.")
    m.cont("vcf.key_follow", "vcf", "KEY FOLLOW", "Keyboard tracking of cutoff, up to 120%.", physical={"min": 0, "max": 120, "unit": "%"})
    m.cont("vca.level", "vca", "ENV-2 LEVEL", "Patch volume under ENV-2, up to 60 dB.")
    m.adsr("env1", (0, 18), (0, 20), (0, 20), "ENV-1 ")
    m.adsr("env2", (0, 18), (0, 20), (0, 20), "ENV-2 ")
    m.enum("kbd.key_mode", "kbd", "KEY MODE", "Whole keyboard, or split with 4 lower + 2 upper voices (SPLIT-1) or 2 lower + 4 upper (SPLIT-2).",
           ["whole", "split_1", "split_2"], control=PB)
    m.enum("kbd.panel_mode", "kbd", "PANEL MODE", "Which split section the panel edits.", ["lower", "upper"], control=PB)
    m.cont("kbd.detune", "kbd", "DETUNE", "Spread between unison voices, ±50 cents.", control=KNOB)
    m.enum("kbd.arp_mode", "kbd", "ARPEGGIO UP/DOWN", "Arpeggio direction; any ASSIGN button stops it.", ["off", "up", "down", "up_down", "down_up"], control=PB)
    m.enum("kbd.glide_mode", "kbd", "GLIDE", "Portamento or glissando, not both.", ["off", "portamento", "glissando"], control=PB)
    m.flag("bend.enable", "bend", "BENDER", "Enables the performance controls (always on in WHOLE).")
    m.flag("bend.wide", "bend", "WIDE", "Bender over more than 3 octaves on the selected VCOs; BEND VCO is then ignored.")
    m.cont("lfo2.rate", "lfo2", "LFO-2 RATE", "Performance LFO rate, sine.", control=KNOB, physical={"min": 1, "max": 10, "unit": "Hz"})
    m.enum("memory.bank", "memory", "BANK", "Bank A-F (patch presets use A-D).", list("ABCDEF"), control=PB)
    m.enum("memory.number", "memory", "NUMBER", "Patch number 1-8.", list(range(1, 9)), control=PB)
    m.enum("out.level", "out", "OUTPUT LEVEL", "Unbalanced output level.", ["0 dBm", "-15 dBm", "-30 dBm"])

    m.jack("jack.out_unbal", "OUTPUT", "out", "audio", "out.unbalanced", "Unbalanced output.", "6.35 mm jack", electrical={"levels_dbm": [0, -15, -30]})
    m.jack("jack.out_bal", "OUTPUT (BALANCED)", "out", "audio", "out.balanced", "Balanced output; not affected by the level switch.", "XLR",
           electrical={"impedance_ohm": 600})
    m.jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones, 8 ohm.", "6.35 mm stereo jack")
    m.jack("jack.arp_clock", "ARPEGGIO CLOCK IN", "in", "clock", "kbd.clock_in", "One arpeggio step per pulse; overrides ARPEGGIO RATE.", "6.35 mm jack",
           electrical={"threshold_v": 2.5}, combine="replace")
    m.jack("jack.patch_shift", "PATCH SHIFT", "in", "gate", None, "Pedal switch (DP-2) or pulse over 2.5 V, at least 20 ms: steps through patches 1-8 in the bank.", "6.35 mm jack")
    m.jack("jack.hold", "PEDAL HOLD", "in", "gate", "kbd.hold_in", "Pedal switch (DP-2) for hold.", "6.35 mm jack")
    m.jack("jack.vca_pedal", "VCA CONTROL", "in", "cv", "out.vca_pedal", "Foot volume (FV-200), -20 dB range.", "6.35 mm jack")
    m.jack("jack.vcf_pedal", "VCF CONTROL", "in", "cv", "vcf.cutoff_cv", "Foot volume (FV-200) on cutoff, +2 to -6 octaves; needs BENDER on in split.", "6.35 mm jack", combine="sum")
    m.jack("jack.tape_load", "TAPE MEMORY LOAD", "in", "audio", None, "From a tape recorder for loading.", "3.5 mm jack")
    m.jack("jack.tape_save", "TAPE MEMORY SAVE", "out", "audio", None, "To a tape recorder for saving.", "3.5 mm jack")
    m.jack("jack.midi_in", "MIDI IN", "in", "midi", None, "MIDI in.", "5-pin DIN")
    m.jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out. A THRU jack appears from serial 353800.", "5-pin DIN")
    m.jack("jack.power", "POWER", "in", "power", None, "Mains, 30 W.", "mains cord")
    m.ind("memory.protect_led", "memory", "Memory Protect indicator", "Shows when the memories are protected.")
    m.ind("kbd.arp_range_leds", "kbd", "Arpeggio RANGE indicators", "Show 1 to 4 octaves.")
    m.ind("bend.wide_led", "bend", "WIDE indicator", "Turns orange in WIDE.")

    m.beh("Key modes", ["kbd", "out"], "WHOLE plays one patch on all six voices. SPLIT-1 gives 4 voices to the lower section and 2 to the upper; "
          "SPLIT-2 the reverse. Each section has its own patch, assign mode, arpeggio, glide, hold and bender settings. Hold a SPLIT button "
          "and press a key to move the split point (not stored). BALANCE mixes the sections.")
    m.beh("Assign modes", ["kbd"], "SOLO: one voice, last-note priority. UNISON: voices shared across held keys (1 key 6 voices, 2 keys 3 each, "
          "3 keys 2 each, 4-6 keys 1 each), with DETUNE. SOLO UNISON (SOLO and UNISON together): all voices on one key. POLY-1: one voice "
          "per key, natural releases; suits piano-like sounds. POLY-2: only the last notes keep their releases; suits glide.")
    m.beh("Arpeggio", ["kbd"], "Plays held notes in key order over 1-4 octaves: UP, DOWN, U&D (press UP then DOWN) or D&U (DOWN then UP). "
          "Mode and range per section in split; rate is shared. Repeats only while keys are held unless HOLD is on. An ASSIGN button stops it. "
          "ARPEGGIO CLOCK IN takes one step per pulse.")
    m.beh("Patch presets", ["memory"], "32 presets store a patch (or split pair) with key mode, assign, arpeggio, glide, hold and bender settings. "
          "With PATCH PRESET on, the BANK and NUMBER buttons select presets instead of memories. PATCH SHIFT steps through 1-8 in the bank.")
    m.beh("Editing", ["memory"], "Moving any manual control edits the current patch live without overwriting it; WRITE with MEMORY PROTECT off stores it.")
    m.beh("Cross modulation and sync", ["vco1", "vco2"], "VCO-2 modulates VCO-1's frequency at a depth set by CROSS MOD MANUAL plus ENV-1. "
          "With VCO-2 in LOW it acts as an LFO; in audio range it gives metallic, ring-mod-like tones. SYNC locks either VCO to the other.")
    m.beh("Performance controls", ["bend", "lfo2"], "The bender moves pitch (selected VCOs) and cutoff by the BEND amounts; WIDE gives over 3 octaves on "
          "the VCOs. LFO MOD brings in a sine LFO-2 at RATE, rising over RISE TIME. Neither is sent or received over MIDI.")
    m.beh("Auto tune", ["kbd"], "All 12 VCOs are tuned at power-on and whenever AUTO TUNE is pressed.")

    D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "program_change", "note": "patch presets"}],
                 "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "all_notes_off", "note": "sent after each key"}],
                 "channel_note": "Omni on at power-up; after poly on / omni off, channel 1 (upper) and channel 2 (lower in split). v6.0 ROM adds channel selection.",
                 "note": "No SysEx, bender or modulation over MIDI. From secondary sources; the manual only mentions the DIN IN/OUT."}
    D["specifications"] = {
        "voices": 6, "vcos": 12, "keyboard": "61 keys", "vco1_range": "32' to 2', chromatic", "vco2_range": "LOW 1.5-50 Hz, 32'-2' chromatic, HIGH 2'-0.5'",
        "vco2_tune_cents": [-50, 50], "vco_mod_depth": {"lfo": "10 oct", "env1": "5 oct"}, "pw_pct": [50, 0],
        "vcf": {"modes_db_per_oct": {"lpf": -24, "hpf": -24, "bpf": -12}, "cutoff_hz": [5, 30000], "env_depth": "10 oct or more", "lfo_depth": "10 oct or more", "key_follow_pct": [0, 120]},
        "vca_env2_level_db": 60, "envelopes": {"attack_s_max": 18, "decay_s_max": 20, "release_s_max": 20, "key_follow_pct": [0, 120]},
        "lfo1": {"rate_hz": [0.04, 100], "random_rate_hz": [0.04, 400], "delay_s": [0, 2]},
        "detune_cents": [-50, 50], "arpeggio": {"rate_hz": [1, 25], "range_oct": [1, 4], "modes": ["up", "down", "U&D", "D&U"]},
        "glide_s_per_oct": [0, 1.6], "master_tune_cents": [-50, 50],
        "bender": {"wide": "±3 oct or more", "vco": "±1 oct", "vcf": "±5 oct"}, "lfo2": {"vco": "±100 cents or more", "vcf": "±4 oct", "rate_hz": [1, 10], "rise_s": [0.05, 1]},
        "memory": {"patch_memories": 48, "patch_presets": 32},
        "outputs": {"unbalanced": "1/4\" jack, 0/-15/-30 dBm", "balanced": "XLR, 600 ohm", "phones": "stereo, 8 ohm"},
        "power_w": 30, "dimensions_mm": {"w": 1063, "d": 434, "h": 120}, "weight_kg": 16,
    }
    D["omitted_from_source"] = ["tape memory step-by-step procedures", "the copy and data arrangement examples", "basic connection diagrams"]
    D["not_in_source"] = ["the MIDI implementation", "envelope minimum times", "whether PWM reaches both VCOs' pulse waves",
                          "the VCO-1 RANGE detent count", "LFO-1 waveform names (symbols only)"]
    D["source_inconsistencies"] = [
        "LFO-1 DELAY TIME is about 2.5 s at 10 in the text but 0 to 2 s in the specifications.",
        "The specifications list three VCO-1 waveform symbols, but the panel diagram shows four VCO-1 waveform switches (triangle, sawtooth, pulse, square).",
        "The OCR of the envelope attack maximum reads 18 s; the scan is unclear and it may be 15 s.",
    ]
    D["modelling_gaps"] = [
        {"topic": "MIDI", "detail": "Taken from reviews and forums, not the manual. Later ROMs and the Europa and Tauntek upgrades change it substantially."},
        {"topic": "Split voicing", "detail": "Voices are modelled once; split and unison voice counts are behaviours, not duplicated modules."},
    ]
    return D, m


# ==========================================================================
# JUPITER-8
# ==========================================================================
def jupiter8():
    m = Model()
    D = {"schema_version": "0.10.0"}
    D["device"] = {
        "id": "roland-jupiter-8", "manufacturer": "Roland", "model": "Jupiter-8 (JP-8) 8 Voice Polyphonic Synthesizer",
        "category": "8-voice polyphonic analogue synthesizer with split and dual keyboard modes, arpeggiator and patch memory",
        "based_on": "Roland's flagship, 1981-85.",
        "sources": [
            {"id": "roland_specs", "title": "Roland, 'JUPITER-8: Technical Specifications' (support article)", "kind": "spec_sheet",
             "file": "https://support.roland.com/hc/en-us/articles/201945109-JUPITER-8-Technical-Specifications",
             "note": "Full control list and ranges of the original instrument, rear panel and dimensions."},
            {"id": "plugout", "title": "Roland JUPITER-8 PLUG-OUT Software Synthesizer Owner's Manual (2017)", "kind": "other", "file": "Roland_Jupiter-8_Manual.pdf",
             "pages": 15, "note": "Control descriptions following the original panel; its additions are listed in modelling_gaps."},
            {"id": "roland_au", "title": "Roland Australia, 'Roland Icon Series: The Jupiter-8'", "kind": "other",
             "file": "https://rolandcorp.com.au/blog/roland-icon-series-the-jupiter-8-synthesizer",
             "note": "Waveforms, second LFO, non-resonant HPF, dual mode at 4 voices, arpeggio on the lower section in split, outputs."},
            {"id": "wikipedia", "title": "Wikipedia, 'Roland Jupiter-8'", "kind": "other", "file": "https://en.wikipedia.org/wiki/Roland_Jupiter-8",
             "note": "DCB as standard from serial 282880."},
            {"id": "vintagesynth", "title": "Vintage Synth Explorer, 'Roland Jupiter-8'", "kind": "other", "file": "https://www.vintagesynth.com/roland/jupiter-8",
             "note": "HPF slope 6 dB/oct; the filter shared with the Juno-6/60."},
        ],
    }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 8, "polyphony_mode": "polyphonic, 8 voices; split; dual (4 voices, two patches per key); unison and solo",
        "poly_chain_max_units": None, "patch_memory": True,
        "patch_memory_note": "64 patch memories and 8 patch presets (which also store split, arpeggio, hold, portamento, modulation and assign settings); tape dump.",
        "semi_modular": False, "panel_counts": {"keys": 61, "patch_memories": 64, "patch_presets": 8, "display_digits": 4},
        "summary": ("Two VCOs per voice: VCO-1 (triangle, saw, pulse, square, 16'-2') with cross modulation from VCO-2 (sine, saw, pulse, noise, "
                    "chromatic range, low-frequency mode, fine tune, sync). A non-resonant HPF feeds a resonant low-pass VCF switchable between "
                    "12 and 24 dB/oct. Two ADSRs with key follow, one LFO with delay, and a performance LFO. Whole, split and dual key modes, "
                    "four assign modes, arpeggiator, portamento, auto-tune, separate upper and lower outputs, and a highest-note CV and gate out."),
    }
    two_vco_common(m, 8)
    m.mod("hpf", "filter", "HPF", "HPF", "Non-resonant high-pass filter ahead of the VCF.", ["hpf.in"], ["hpf.out"], props={"slope_db_per_oct": 6})
    m.mod("vcf", "filter", "VCF (low-pass)", "VCF", "Resonant low-pass, 12 or 24 dB/oct, with envelope, LFO and key follow.",
          ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"slopes_db_per_oct": [12, 24], "chip": "IR3109 (shared with the Juno-6/60, per secondary sources)"})
    m.mod("cvout", "output", "Highest note CV/gate", "(rear panel)", "Pitch CV and gate for the highest note played, for an external synthesizer.",
          ["cvout.cv_in", "cvout.gate_in"], ["cvout.cv", "cvout.gate"], scope="common")
    m.mod("out", "output", "Output", "VOLUME / rear panel", "Upper, lower and mix outputs, balanced and unbalanced, and headphones.",
          ["out.in", "out.vca_pedal"], ["out.upper", "out.lower", "out.mix", "out.phones"], scope="common")
    m.con("mix.out", "hpf.in")
    m.con("hpf.out", "vcf.in")
    m.con("vcf.out", "vca.in")
    m.con("vca.out", "out.in", note="Upper and lower sections leave on separate outputs as well as the mix.")
    m.con("vco1.out", "vco2.sync_in", "sync", eq("vco2.sync", True), note="VCO-2 is reset by VCO-1.")
    for n in (1, 2):
        m.con("lfo.out", f"vco{n}.pw_cv", "cv", eq("pwm.mode", "lfo"), amount="pwm.amount")
        m.con("env1.out", f"vco{n}.pw_cv", "cv", eq("pwm.mode", "env1"), amount="pwm.amount")
    m.con("env1.out", "vcf.cutoff_cv", "cv", eq("vcf.env_select", "env1"), amount="vcf.env_mod")
    m.con("env2.out", "vcf.cutoff_cv", "cv", eq("vcf.env_select", "env2"), amount="vcf.env_mod")
    m.con("lfo.out", "vcf.cutoff_cv", "cv", amount="vcf.lfo_mod")
    m.con("kbd.cv", "vcf.cutoff_cv", "cv", amount="vcf.key_follow")
    m.con("kbd.cv", "cvout.cv_in", "cv", note="Highest note only.")
    m.con("kbd.gate", "cvout.gate_in", "gate")

    m.enum("vco1.range", "vco1", "VCO-1 RANGE", "Octave of VCO-1.", ["16'", "8'", "4'", "2'"], control=ROT)
    m.enum("vco1.waveform", "vco1", "VCO-1 WAVEFORM", "VCO-1 waveform.", ["triangle", "sawtooth", "pulse", "square"], control=ROT)
    m.cont("vco1.xmod", "vco1", "CROSS MOD", "Depth of VCO-2 modulating VCO-1's frequency, for metallic and complex tones.")
    m.enum("vco2.range", "vco2", "VCO-2 RANGE", "VCO-2 pitch across 16' to 2' in semitones (SUB RANGE in the PLUG-OUT).", ["16'", "chromatic steps", "2'"], control=ROT)
    m.enum("vco2.freq_mode", "vco2", "NORMAL / LOW FREQ", "LOW FREQ turns VCO-2 into a fixed-pitch low-frequency modulator.", ["normal", "low"])
    m.cont("vco2.tune", "vco2", "FINE TUNE", "Fine pitch, ±50 cents.", control=KNOB, panel_scale={"min": -5, "max": 5})
    m.enum("vco2.waveform", "vco2", "VCO-2 WAVEFORM", "VCO-2 waveform.", ["sine", "sawtooth", "pulse", "noise"], control=ROT)
    m.flag("vco2.sync", "vco2", "SYNC", "Resets VCO-2 with VCO-1.", control=TOG)
    m.cont("pwm.amount", "vco1", "PULSE WIDTH", "Pulse width in MANUAL; modulation depth with LFO or ENV-1.")
    m.enum("pwm.mode", "vco1", "PWM mode", "Source for pulse width.", ["lfo", "manual", "env1"])
    m.cont("mix.balance", "mix", "SOURCE MIX", "Balance of VCO-1 and VCO-2.", control=KNOB)
    m.cont("hpf.cutoff", "hpf", "HPF CUTOFF FREQ", "High-pass cutoff.")
    m.cont("vcf.cutoff", "vcf", "CUTOFF FREQ", "Low-pass cutoff.")
    m.cont("vcf.resonance", "vcf", "RES", "Emphasis at the cutoff.")
    m.enum("vcf.slope", "vcf", "SLOPE", "Filter slope.", [-12, -24], note="dB per octave.")
    m.cont("vcf.env_mod", "vcf", "ENV MOD", "Envelope depth on cutoff.")
    m.enum("vcf.env_select", "vcf", "ENV MOD selector", "Envelope for the filter.", ["env1", "env2"])
    m.cont("vcf.lfo_mod", "vcf", "LFO MOD", "LFO depth on cutoff.")
    m.cont("vcf.key_follow", "vcf", "KEY FLW", "Keyboard tracking of cutoff, up to 120%.", physical={"min": 0, "max": 120, "unit": "%"})
    m.cont("vca.level", "vca", "LEVEL", "Patch volume.")
    m.adsr("env1", (0.001, 5), (0.001, 10), (0.001, 10), "ENV-1 ")
    m.adsr("env2", (0.001, 5), (0.001, 10), (0.001, 10), "ENV-2 ")
    m.enum("lfo.waveform", "lfo", "LFO WAVEFORM", "LFO waveform.", ["sine", "sawtooth", "square", "random"], control=ROT)
    m.cont("lfo.rate", "lfo", "RATE", "LFO rate.", physical={"min": 0.05, "max": 40, "unit": "Hz"})
    m.cont("lfo.delay", "lfo", "DELAY TIME", "Time for the LFO to reach full depth after a key.", physical={"min": 0, "max": 4, "unit": "s"})
    m.enum("kbd.key_mode", "kbd", "KEY MODE", "Whole (8 voices, one patch), split (upper and lower patches), or dual (two patches per key, 4 voices).",
           ["whole", "split", "dual"], control=PB)
    m.enum("kbd.panel_mode", "kbd", "PANEL MODE", "Which section the panel edits.", ["lower", "upper"], control=PB)
    m.enum("kbd.arp_mode", "kbd", "ARPEGGIO MODE", "Arpeggio pattern.", ["off", "up", "down", "up_down", "random"], control=PB)
    m.enum("kbd.arp_clock", "kbd", "ARPEGGIO CLOCK", "Internal rate or external clock.", ["int", "ext"])
    m.enum("kbd.portamento_mode", "kbd", "PORTAMENTO MODE", "Portamento off, on, or upper section only.", ["off", "on", "upper_only"])
    m.flag("kbd.hold_lower", "kbd", "LOWER HOLD", "Hold for the lower section.")
    m.flag("kbd.hold_upper", "kbd", "UPPER HOLD", "Hold for the upper section.")
    m.flag("bend.vcf", "bend", "BEND VCF switch", "Bend reaches the VCF.")
    m.flag("lfo2.vco_sw", "lfo2", "LFO MOD VCO switch", "Performance LFO reaches pitch.")
    m.flag("lfo2.vcf_sw", "lfo2", "LFO MOD VCF switch", "Performance LFO reaches cutoff.")
    m.enum("memory.number", "memory", "PATCH NUMBER", "Patch 11-88 (bank and number).", [f"{b}{n}" for b in range(1, 9) for n in range(1, 9)], control=PB)
    m.enum("out.level", "out", "LEVEL", "Unbalanced output level.", ["0 dB", "-20 dB"])
    m.enum("out.phones_level", "out", "PHONES LEVEL", "Headphone level.", ["L", "M", "H"])

    for nm, node, lbl in (("upper", "out.upper", "UPPER"), ("lower", "out.lower", "LOWER")):
        m.jack(f"jack.{nm}_bal", f"{lbl} (BALANCED)", "out", "audio", node, f"{lbl} section, balanced.", "XLR", electrical={"impedance_ohm": 600, "level_dbm": 0})
        m.jack(f"jack.{nm}_unbal", f"{lbl}", "out", "audio", node, f"{lbl} section, unbalanced.", "6.35 mm jack", electrical={"impedance_ohm": 1000, "levels_dbm": [0, -20]})
    m.jack("jack.mix", "MIX", "out", "audio", "out.mix", "Both sections mixed, unbalanced.", "6.35 mm jack", electrical={"impedance_ohm": 1000, "levels_dbm": [0, -20]})
    m.jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Stereo headphones, 8 ohm.", "6.35 mm stereo jack")
    m.jack("jack.ext_hold", "EXT CONTROL HOLD", "in", "gate", "kbd.hold_in", "Hold pedal.", "6.35 mm jack")
    m.jack("jack.ext_portamento", "EXT CONTROL PORTAMENTO", "in", "gate", None, "Portamento on/off pedal.", "6.35 mm jack")
    m.jack("jack.ext_vcf", "EXT CONTROL VCF", "in", "cv", "vcf.cutoff_cv", "Pedal on cutoff.", "6.35 mm jack", combine="sum")
    m.jack("jack.ext_vca", "EXT CONTROL VCA", "in", "cv", "out.vca_pedal", "Pedal on volume.", "6.35 mm jack")
    m.jack("jack.arp_clock", "ARPEGGIO CLOCK INPUT", "in", "clock", "kbd.clock_in", "One arpeggio step per pulse.", "6.35 mm jack", combine="replace")
    m.jack("jack.arp_din", "ARPEGGIO CLOCK DIN", "in", "clock", None, "DIN sync clock for the arpeggio, divided by the BEAT selector.", "5-pin DIN")
    m.jack("jack.cv_out", "HIGHEST NOTE CV OUT", "out", "cv", "cvout.cv", "CV of the highest note, 0 to 5 V.", "6.35 mm jack", electrical={"range_v": [0, 5]})
    m.jack("jack.gate_out", "HIGHEST NOTE GATE OUT", "out", "gate", "cvout.gate", "Gate: 0 V off, +15 V on.", "6.35 mm jack", electrical={"off_v": 0, "on_v": 15})
    m.jack("jack.tape_load", "TAPE MEMORY LOAD", "in", "audio", None, "From tape.", "6.35 mm jack")
    m.jack("jack.tape_dump", "TAPE MEMORY DUMP", "out", "audio", None, "To tape.", "6.35 mm jack")
    m.jack("jack.dcb", "DCB", "bidirectional", "midi", None, "Roland Digital Control Bus, standard from serial 282880; not on earlier units.", "14-pin Amphenol",
           confidence="inferred", note="Connector type from general DCB documentation, not a Jupiter-8 source.")
    m.jack("jack.power", "POWER", "in", "power", None, "Mains, 90 W.", "mains cord")
    m.ind("memory.display", "memory", "PATCH NUMBER display", "Four 7-segment LEDs.", kind="display")
    m.ind("memory.protect_led", "memory", "Memory Protect indicator", "Shows when memory is protected.")
    m.ind("memory.data_check", "memory", "Data Check indicator", "Tape memory status.")
    m.ind("lfo.rate_led", "lfo", "LFO rate indicator", "Flashes at the LFO rate.")

    m.beh("Key modes", ["kbd", "out"], "WHOLE: one patch over 8 voices. SPLIT: upper and lower patches each side of a split point. DUAL: two "
          "patches layered on each key, 4-voice polyphony. BALANCE mixes the sections; each has its own output as well as MIX. In split the "
          "arpeggio plays the lower section only.")
    m.beh("Assign modes", ["kbd"], "SOLO (mono), UNISON (all voices on the played notes), POLY-1 and POLY-2 (one voice per key; POLY-2 suits portamento, as on the Jupiter-6).",
          confidence="inferred", note="POLY-1/POLY-2 difference carried over from the Jupiter-4 and Jupiter-6 manuals.")
    m.beh("Arpeggio", ["kbd"], "UP, DOWN, U&D (last note of UP is first of DOWN) or RANDOM over 1-4 octaves, 1-20 Hz or from an external or DIN clock.")
    m.beh("Patch presets", ["memory"], "8 patch presets store a patch or split/dual pair together with key split, arpeggio, hold, portamento, modulation and assign settings.")
    m.beh("Cross modulation and sync", ["vco1", "vco2"], "VCO-2 modulates VCO-1's frequency. SYNC resets VCO-2 from VCO-1. LOW FREQ makes VCO-2 a modulator "
          "whose pitch no longer follows the keys, set by its range control.")
    m.beh("Envelope key follow", ["env1", "env2"], "With KEY FOLLOW on, attack, decay and release lengthen on lower notes and shorten on higher ones.")
    m.beh("Performance controls", ["bend", "lfo2"], "The bender moves VCO-1 and/or VCO-2 and the VCF by their sensitivities. The LFO MOD button brings in a "
          "second LFO, rising over RISE TIME, to VCO and/or VCF.")
    m.beh("Highest-note CV", ["cvout"], "The rear CV and gate follow the highest note held, to play a monophonic synth alongside.")

    D["midi"] = {"receives": [], "transmits": [], "note": "No MIDI on the original. Later units have DCB (serial 282880 on); MIDI came only by retrofit."}
    D["specifications"] = {
        "voices": 8, "vcos": 16, "keyboard": "61 keys", "vco1": {"range": ["16'", "8'", "4'", "2'"], "waveforms": ["triangle", "sawtooth", "pulse", "square"]},
        "vco2": {"range": "16'-2' chromatic, NORMAL/LOW FREQ", "fine_tune_cents": [-50, 50], "waveforms": ["sine", "sawtooth", "pulse", "noise"]},
        "vcf": {"slopes_db_per_oct": [12, 24], "key_follow_pct": [0, 120]}, "hpf_db_per_oct": 6,
        "envelopes": {"attack_s": [0.001, 5], "decay_s": [0.001, 10], "sustain_pct": [0, 100], "release_s": [0.001, 10]},
        "lfo": {"rate_hz": [0.05, 40], "delay_s": [0, 4]}, "vca_lfo_mod_steps": [0, 1, 2, 3],
        "arpeggio": {"rate_hz": [1, 20], "range_oct": [1, 4], "modes": ["up", "down", "U&D", "random"]}, "master_tune_cents": [-50, 50],
        "memory": {"patches": 64, "patch_presets": 8},
        "outputs": {"balanced": "upper and lower, 600 ohm, 0 dBm", "unbalanced": "upper, mix, lower, 1 kohm, 0/-20 dBm", "phones": "8 ohm stereo, L/M/H"},
        "cv_gate_out": {"cv_v": [0, 5], "gate_v": [0, 15]}, "power_w": 90, "dimensions_mm": {"w": 1063, "d": 485, "h": 120}, "weight_kg": 22,
    }
    D["omitted_from_source"] = ["PLUG-OUT software screens, patch manager, SYSTEM-8 plug-out procedure and MIDI learn"]
    D["not_in_source"] = [
        "an original owner's manual: control behaviour comes from Roland's specification list, the PLUG-OUT manual and secondary sources",
        "performance LFO rate", "the BEAT selector's values", "the split point setting procedure", "LFO waveform order on the panel",
    ]
    D["source_inconsistencies"] = [
        "The PLUG-OUT lists LFO waveforms sine, triangle, saw, square and two randoms; Roland Australia and Polynominal give sine, saw, square and random; Vintage Synth Explorer gives sine, triangle, ramp and random.",
        "Vintage Synth Explorer gives VCO-1 and VCO-2 the same four waveforms plus noise on VCO-2; Roland Australia, Arturia and the PLUG-OUT put sine (not square or triangle) on VCO-2.",
        "Arpeggio range is 1-4 octaves in Roland's specifications; Roland Australia says it is switchable over 5 octaves.",
    ]
    D["modelling_gaps"] = [
        {"topic": "PLUG-OUT additions", "detail": "Not modelled: velocity sensitivity, effects, tempo sync, CONDITION and CIRCUIT MOD, LFO key trigger and TRIG ENV, "
         "octave buttons, key hold, bend gain, separate VCO-1/VCO-2 bend and mod switching on the lever panel, MONO assign."},
        {"topic": "No original manual", "detail": "An original owner's manual would settle the LFO and VCO-2 waveforms, envelope behaviour and memory procedures."},
        {"topic": "Voice revisions", "detail": "Early and later units, and the MKS-80 Rev 5, use different VCO, VCA and filter circuits."},
    ]
    return D, m


for fn, path in ((jupiter4, "roland-jupiter-4_synth.json"), (jupiter6, "roland-jupiter-6_synth.json"), (jupiter8, "roland-jupiter-8_synth.json")):
    D, m = fn()
    finish(D, m, "/mnt/user-data/outputs/" + path)
