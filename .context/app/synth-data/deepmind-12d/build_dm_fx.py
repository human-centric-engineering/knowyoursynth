#!/usr/bin/env python3
"""Assemble the DeepMind effects catalogue from the parsed chapter 9 tables."""
import json, re

algos = json.load(open("/home/claude/fx_algos.json"))

INSPIRATION = {  # from section 9.1; * = direct port of a Music Group device
    1: ("TC Hall of Fame", True), 2: ("Lexicon 480L", False), 3: ("Lexicon 480L", False), 4: ("EMT 250", False),
    5: ("Lexicon 480L", False), 6: ("Lexicon 480L", False), 7: ("Lexicon PCM-70", False), 8: ("Lexicon 480L", False),
    9: ("Lexicon 300/480L", False), 10: ("Lexicon 300/480L", False), 11: ("Lexicon PCM-70", False), 12: ("Lexicon PCM-70", False),
    13: ("Lexicon PCM-70", False), 14: ("Midas ProX", True), 15: ("SPL Vitalizer", False), 16: ("Fairchild 670", False),
    17: ("Midas ProX", True), 18: ("Tech 21 SansAmp", False), 19: ("Edison EX-1", False), 20: ("Behringer X32", True),
    21: ("Midas ProX", True), 22: ("Behringer X32", True), 23: ("Behringer X32", True), 24: ("Behringer X32", True),
    25: ("Tel-Ray Delay", False), 26: ("Decimator Delay", False), 27: ("Lexicon PCM-70", False), 28: ("Behringer X32", True),
    29: ("Roland Dimension D", False), 30: ("Behringer X32", True), 31: ("Behringer X32", True), 32: ("Moog type filter", False),
    33: ("Eventide", False), 34: ("Eventide", False), 35: ("Leslie", False),
}
TYPE = {**{i: "reverb" for i in range(1, 14)}, **{i: "processing" for i in range(14, 22)},
        **{i: "delay" for i in range(22, 28)}, **{i: "creative" for i in range(28, 36)}}


def num(s):
    if s is None:
        return None
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)", s.replace("inf", "∞"))
    if m:
        return float(m.group(1))
    if "∞" in s or "oo" in s:
        return "-inf" if "-" in s else "inf"
    return None


def units(s):
    return None if s in ("--", "", None) else s


ALG = []
for i, a in enumerate(algos, start=1):
    m = re.match(r"^(.*?) \((.*)\)(.*)$", a["name"])
    short, long_, tail = (m.group(1), m.group(2), m.group(3)) if m else (a["name"], a["name"], "")
    params = []
    for p in a["params"]:
        row = {"number": p["no"], "ref": p["ref"], "name": p["name"], "units": units(p["units"]),
               "min": num(p["min"]) if units(p["min"]) else None, "max": num(p["max"]) if units(p["max"]) else None,
               "mod_destination": p["mod_dest"], "description": p["description"]}
        opt = re.search(r"Options?:\s*(.+?)\.?$", p["description"])
        if opt and row["units"] is None:
            row["options"] = [o.strip() for o in re.split(r",\s*", opt.group(1)) if o.strip()]
        params.append(row)
    insp, direct = INSPIRATION[i]
    ALG.append({"id": re.sub(r"[^a-z0-9]+", "-", short.lower()).strip("-"), "number": i, "name": short.strip(),
                "long_name": (long_ + tail).strip(), "type": TYPE[i], "inspiration": insp, "direct_port": direct,
                "parameters": params})

D = {
    "schema_version": "0.1.0",
    "device": {
        "id": "behringer-deepmind-fx",
        "manufacturer": "Behringer",
        "model": "DeepMind effects engine (TC Electronic, Klark Teknik and Midas algorithms)",
        "for_device": ["behringer-deepmind-12d", "behringer-deepmind-12", "behringer-deepmind-6"],
        "sources": [
            {"id": "manual", "title": "DeepMind 12D User Manual, chapters 7 (FX menu), 9 (Effects Reference Guide) and 16 (MIDI CC)",
             "file": "DeepMind_12D.pdf", "kind": "user_manual",
             "note": "Chapter 9 gives one table per algorithm: parameter number, short reference, name, units, min, max, "
                     "description, and a mark for parameters that are matrix destinations. The 35 tables are parsed "
                     "mechanically; the prose descriptions in 9.2 are not transcribed."},
        ],
    },
    "engine": {
        "slots": 4,
        "algorithm_count": 35,
        "sample_rate_hz": 48000,
        "bit_depth": "24-bit converters, 32/40-bit floating point processing",
        "dsp": "one true-stereo SHARC",
        "bypass": "true hard bypass; the analogue path from the voices to the outputs is preserved when bypassed",
        "modes": ["insert", "send", "bypass"],
        "dynamic_range_db": 114,
    },
    "slot_controls": [
        {"slot": s, "type_cc": 104 + s, "gain_cc": 108 + s, "mix": "per slot, on the FX menu",
         "parameter_cc": {1: "62, 63, 65 to 74", 2: "75 to 86", 3: "87 to 95, 102 to 104", 4: "none listed"}[s],
         "note": "Each slot has a TYPE (which algorithm), a MIX (dry to wet) and a LEVEL (output gain). Parameters 1 to 12 of the "
                 "loaded algorithm map to CCs for slots 1 to 3; slot 4 has type and gain CCs only."}
        for s in (1, 2, 3, 4)
    ],
    "routing_modes": [
        {"id": "M-1", "name": "SERIAL 1-2-3-4", "topology": "1 -> 2 -> 3 -> 4"},
        {"id": "M-2", "name": "PARALLEL 1/2 SERIAL 3-4", "topology": "(1 || 2) -> 3 -> 4"},
        {"id": "M-3", "name": "PARALLEL 1/2 PARALLEL 3/4", "topology": "(1 || 2) -> (3 || 4)"},
        {"id": "M-4", "name": "PARALLEL 1/2/3/4", "topology": "1 || 2 || 3 || 4"},
        {"id": "M-5", "name": "PARALLEL 1/2/3 SERIAL 4", "topology": "(1 || 2 || 3) -> 4"},
        {"id": "M-6", "name": "SERIAL 1-2 PARALLEL 3/4", "topology": "1 -> 2 -> (3 || 4)"},
        {"id": "M-7", "name": "SERIAL 1 PARALLEL 2/3/4", "topology": "1 -> (2 || 3 || 4)"},
        {"id": "M-8", "name": "PARALLEL (SERIAL 1-2-3)/4", "topology": "(1 -> 2 -> 3) || 4"},
        {"id": "M-9", "name": "SERIAL 3-4 FEEDBACK4(1-2)", "topology": "3 -> 4, with 4's output fed back through 1 -> 2",
         "note": "The manual names the mode; the feedback path is read from the name and the routing diagram, not described in words."},
        {"id": "M-10", "name": "SERIAL 4 FEEDBACK4(1-2-3)", "topology": "4, with its output fed back through 1 -> 2 -> 3",
         "note": "As M-9."},
    ],
    "algorithms": ALG,
    "midi": {
        "cc": "slot types 105 to 108, slot gains 109 to 112, slot parameters as listed per slot, Effects Mode 114, Analog Thru 113",
        "nrpn": "effects parameters have NRPN numbers above the voice range; not transcribed",
        "mod_matrix": "parameters marked mod_destination are reachable from the 8-slot modulation matrix as 'Fx N Params' destinations; each slot's level is also a destination",
    },
    "omitted_from_source": [
        "the prose description of each algorithm in section 9.2, which restates the parameter tables with usage advice",
        "the FX menu operating procedures in chapter 7: loading, moving between slots, editing on the display",
        "the parameter-page screenshots and routing diagrams",
    ],
    "not_in_source": [
        "any statement of what the algorithms do: no impulse responses, no filter topologies, no modulation waveforms, only the hardware each is 'inspired by'",
        "NRPN numbers for effects parameters (the table stops within the voice range in the pages transcribed)",
        "CC numbers for slot 4's parameters",
        "a description in words of the two feedback routing modes",
        "latency through the effects engine, or through the converters when it is engaged",
        "which parameters each TC-DeepVRB preset changes, beyond 'the decay range is preset dependent'",
    ],
    "source_inconsistencies": [
        "The FairComp table labels its fourth parameter 'TImeL/M' with a capital I.",
        "The 9.1 table calls algorithm 34 'Vintage Pitch Dual Pitch Shifter' and the 9.3 table 'Vintage Pitch (DUAL PITCH SHIFTER)'; algorithm 33 is also a dual pitch shifter.",
        "The DecimDelay table has a stray row headed PARAMETERS before its first real parameter; dropped here.",
        "The specifications say 35 algorithms; a product listing quoted by retailers says 'over 33'. The manual tables number 35.",
        "Slots 1 to 3 have parameter CCs and slot 4 does not, though all four slots have type and gain CCs.",
        "The count of matrix destinations includes effects parameters (marked with an asterisk) but the manual's destination list groups them as 'Fx N Params' without saying which parameter of a slot is addressed.",
    ],
    "modelling_gaps": [
        {"topic": "Sound", "detail": "This is a catalogue of controls, not a model of the effects. Every algorithm is named after "
         "a hardware device and none is described technically. Reproducing any of them means either a licensed algorithm "
         "or measurement of the real unit; the file records the parameter surface that such a model would need to expose."},
        {"topic": "Units", "detail": "Ranges are recorded as printed. Some are unitless numbers (Size 2.0 to 100.0, Diffusion 1.0 to "
         "30.0) whose physical meaning is not given. Where the manual prints a choice list the options are captured; where it "
         "prints '--' the parameter is stored as unitless."},
        {"topic": "Preset-dependent ranges", "detail": "TC-DeepVRB's decay range changes with its preset; the file records the widest stated range."},
        {"topic": "Routing", "detail": "The ten topologies are recorded as expressions read from the mode names and diagrams. Mix and "
         "level behaviour inside a parallel pair (how two wet signals sum) is not described."},
    ],
}

with open("/mnt/user-data/outputs/behringer-deepmind.fx.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(ALG), "algorithms", sum(len(a["parameters"]) for a in ALG), "parameters",
      sum(1 for a in ALG for p in a["parameters"] if p["mod_destination"]), "matrix destinations")
