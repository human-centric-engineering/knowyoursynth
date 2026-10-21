#!/usr/bin/env python3
"""Validate a synth blueprint device file.

Two passes:
  1. JSON Schema (draft 2020-12) if jsonschema is installed. Shapes and vocabularies.
  2. Referential checks the schema cannot express: every id resolves, node direction
     matches port direction, normalling is symmetric, no orphan nodes.

Errors are things that make the file wrong. Warnings are things that are usually a
mistake but sometimes intended, so read them rather than chasing them to zero:

  - A connection whose from is an input node, or whose to is an output node, is an
    error. In practice this is what catches internal routing written as wiring:
    summing inside an inverter, crosspoints inside a switch, a pan law. Those belong
    in behaviours, not connections.
  - A connection between two nodes of the same module is only a warning. Most are the
    same mistake, but a module can legitimately have an internal normal that a panel
    jack breaks, and that is a real connection.
  - A node declared on a module but never wired or exposed by a port is a warning: it
    is either a missing connection or a leftover.
  - A mod_matrix (and each additional_mod_matrices entry) must name real modules, nodes and
    parameters, including source_b where slots take two sources; a node that
    appears only as a matrix source counts as used.
  - A patch_matrix row's level_param and column's offset_param must be real parameters;
    an offset_param on a column that is not a control column is a warning.
  - A program_card must name real nodes, parameters and fields. Example patches may use
    matrix pins, patch cords between ports (output to input), card points and fields, or
    settings alone; a cord between different connector types is a warning.
  - An algorithms section must name real operator modules and parameters. Each entry
    must use every operator exactly once as a carrier or a modulator source, link only
    real operators, never modulate a carrier from another carrier without saying so,
    and give a feedback loop whose operators really are linked in that order. Numbers
    must run 1..N without gaps.
  - A parameter marked memory "patch" on an instrument with no patch memory is a warning.
  - A quick_start_guide or spec_sheet source with an empty not_in_source is a warning,
    because a thin source always leaves gaps and silence about them is misleading.

The run also prints counts per file, including a breakdown of panel controls by type,
as a quick check against the panel itself.

Usage:
    python3 validate_synth.py behringer-pro-1.synth.json [more.json ...]
    python3 validate_synth.py --schema synth-blueprint.schema.json *.synth.json
"""

import json
import sys
from collections import Counter
from pathlib import Path

SCHEMA_DEFAULT = "synth-blueprint.schema.json"  # 0.13.0


def conds(c):
    """Flatten a condition tree into the leaf conditions."""
    if not c:
        return []
    if "all" in c:
        return [x for sub in c["all"] for x in conds(sub)]
    if "any" in c:
        return [x for sub in c["any"] for x in conds(sub)]
    return [c]


def check(d):
    errors, warnings = [], []

    modules = {m["id"] for m in d["modules"]}
    inputs, outputs = set(), set()
    for m in d["modules"]:
        inputs |= set(m["inputs"])
        outputs |= set(m["outputs"])
        for n in m["inputs"] + m["outputs"]:
            if not n.startswith(m["id"] + "."):
                errors.append(f"node {n} is not namespaced to its module {m['id']}")
    nodes = inputs | outputs

    params = {p["id"] for p in d["parameters"]}
    ports = {j["id"] for j in d["ports"]}

    for p in d["parameters"]:
        if p["module"] not in modules:
            errors.append(f"parameter {p['id']}: unknown module {p['module']}")
        if p.get("blend_param") and p["blend_param"] not in params:
            errors.append(f"parameter {p['id']}: unknown blend_param {p['blend_param']}")

    for i in d.get("indicators", []):
        if i["module"] not in modules:
            errors.append(f"indicator {i['id']}: unknown module {i['module']}")

    for j in d["ports"]:
        n = j.get("node")
        if n:
            if n not in nodes:
                errors.append(f"port {j['id']}: unknown node {n}")
            elif j["direction"] == "in" and n not in inputs:
                errors.append(f"port {j['id']}: direction in but {n} is an output node")
            elif j["direction"] == "out" and n not in outputs:
                errors.append(f"port {j['id']}: direction out but {n} is an input node")
        if j.get("normalled_from") and j["normalled_from"] not in nodes:
            errors.append(f"port {j['id']}: unknown normalled_from {j['normalled_from']}")
        for k in ("amount_param", "offset_param"):
            if j.get(k):
                if j[k] not in params:
                    errors.append(f"port {j['id']}: unknown {k} {j[k]}")
                elif j["direction"] != "in":
                    warnings.append(f"port {j['id']}: {k} on a port that is not an input")

    broken_by = set()
    for c in d["connections"]:
        if c["from"] not in outputs:
            errors.append(f"connection {c['id']}: from {c['from']} is not an output node")
        if c["to"] not in inputs:
            errors.append(f"connection {c['id']}: to {c['to']} is not an input node")
        for x in conds(c.get("enabled_when")):
            if x.get("param") and x["param"] not in params:
                errors.append(f"connection {c['id']}: unknown param {x['param']} in enabled_when")
        if c.get("amount") and c["amount"] not in params:
            errors.append(f"connection {c['id']}: unknown amount {c['amount']}")
        if c["from"].split(".")[0] == c["to"].split(".")[0]:
            warnings.append(
                f"connection {c['id']}: both ends are on module {c['from'].split('.')[0]} "
                "— internal routing usually belongs in behaviours, not connections")
        if c.get("broken_by"):
            if c["broken_by"] not in ports:
                errors.append(f"connection {c['id']}: unknown broken_by {c['broken_by']}")
            broken_by.add(c["broken_by"])

    for b in d.get("behaviours", []):
        for a in b["applies_to"]:
            if a not in modules:
                errors.append(f"behaviour {b['id']}: unknown module {a}")

    # Normalling should be symmetric: a jack named in broken_by is an input jack,
    # and a jack declaring normalled_from should appear in some broken_by.
    by_id = {j["id"]: j for j in d["ports"]}
    for jid in broken_by:
        if jid in by_id and by_id[jid]["direction"] != "in":
            errors.append(f"port {jid}: named in broken_by but is not an input")
    for j in d["ports"]:
        if j.get("normalled_from") and j["id"] not in broken_by:
            warnings.append(f"port {j['id']}: declares normalled_from but no connection is broken_by it")

    used = {c["from"] for c in d["connections"]} | {c["to"] for c in d["connections"]}
    used |= {j["node"] for j in d["ports"] if j.get("node")}
    for mm in ([d["mod_matrix"]] if d.get("mod_matrix") else []) + d.get("additional_mod_matrices", []):
        if mm.get("module") and mm["module"] not in modules:
            errors.append(f"mod_matrix: unknown module {mm['module']}")
        if mm.get("combine") in ("multiply", "add") and not any(sp.get("source_b") for sp in mm.get("slot_parameters", [])):
            warnings.append(f"mod_matrix {mm.get('name', '')}: combine is {mm['combine']} but no slot names a source_b")
        for src in mm.get("sources", []):
            if src.get("node"):
                if src["node"] not in nodes:
                    errors.append(f"mod_matrix source {src['name']}: unknown node {src['node']}")
                used.add(src["node"])
        for dst in mm.get("destinations", []):
            if dst.get("parameter") and dst["parameter"] not in params:
                errors.append(f"mod_matrix destination {dst['name']}: unknown parameter {dst['parameter']}")
        for sp in mm.get("slot_parameters", []):
            for k in ("source", "destination", "depth", "source_b"):
                if k in sp and sp[k] not in params:
                    errors.append(f"mod_matrix slot {sp['slot']}: unknown {k} parameter {sp[k]}")

    pmx = d.get("patch_matrix")
    if pmx:
        rows = {r["id"]: r for r in pmx["rows"]}
        cols = {c["id"]: c for c in pmx["columns"]}
        for r in pmx["rows"]:
            if r["node"] not in outputs:
                errors.append(f"patch_matrix row {r['id']}: {r['node']} is not an output node")
            if r.get("level_param") and r["level_param"] not in params:
                errors.append(f"patch_matrix row {r['id']}: unknown level_param {r['level_param']}")
            used.add(r["node"])
        for c in pmx["columns"]:
            if c["node"] not in inputs:
                errors.append(f"patch_matrix column {c['id']}: {c['node']} is not an input node")
            if c.get("offset_param"):
                if c["offset_param"] not in params:
                    errors.append(f"patch_matrix column {c['id']}: unknown offset_param {c['offset_param']}")
                elif c.get("class") != "control":
                    warnings.append(f"patch_matrix column {c['id']}: offset_param on a {c.get('class')} column")
            used.add(c["node"])
    elif any(ex.get("pins") for ex in d.get("example_patches", [])):
        errors.append("example_patches use pins without a patch_matrix")

    pc = d.get("program_card")
    card_rows, card_cols, card_fields = {}, {}, {}
    if pc:
        if pc.get("selector_param") and pc["selector_param"] not in params:
            errors.append(f"program_card: unknown selector_param {pc['selector_param']}")
        for r in pc["rows"]:
            card_rows[r["id"]] = r
            if r["node"] not in outputs:
                errors.append(f"program_card row {r['id']}: {r['node']} is not an output node")
            used.add(r["node"])
        for c in pc["columns"]:
            card_cols[c["id"]] = c
            if c["node"] not in inputs:
                errors.append(f"program_card column {c['id']}: {c['node']} is not an input node")
            for k in ("offset_param", "amount_param"):
                if c.get(k) and c[k] not in params:
                    errors.append(f"program_card column {c['id']}: unknown {k} {c[k]}")
            used.add(c["node"])
        for f in pc["fields"]:
            card_fields[f["id"]] = f
            if f.get("parameter") and f["parameter"] not in params:
                errors.append(f"program_card field {f['id']}: unknown parameter {f['parameter']}")
        for p in pc.get("not_programmable", []):
            if p not in params:
                errors.append(f"program_card not_programmable: unknown parameter {p}")

    pmx_rows = {r["id"] for r in pmx["rows"]} if pmx else set()
    pmx_cols = {c["id"] for c in pmx["columns"]} if pmx else set()
    for ex in d.get("example_patches", []):
        for pin in ex.get("pins", []):
            col, row = pin[0], pin[1:]
            if col not in pmx_cols or row not in pmx_rows:
                errors.append(f"example patch {ex['id']}: pin {pin} is not on the matrix")
        for a, b in ex.get("cords", []):
            ja, jb = by_id.get(a), by_id.get(b)
            if not ja or not jb:
                errors.append(f"example patch {ex['id']}: cord {a} -> {b} names an unknown port")
                continue
            if ja["direction"] != "out" or jb["direction"] != "in":
                errors.append(f"example patch {ex['id']}: cord {a} -> {b} must run from an output to an input")
            elif ja.get("connector") != jb.get("connector"):
                warnings.append(f"example patch {ex['id']}: cord {a} -> {b} joins different connector types")
        card = ex.get("card")
        if card:
            if not pc:
                errors.append(f"example patch {ex['id']}: card given without a program_card")
            else:
                for pt in card.get("points", []):
                    if pt["row"] not in card_rows or pt["column"] not in card_cols:
                        errors.append(f"example patch {ex['id']}: card point {pt['row']}x{pt['column']} is not on the card")
                for fid in card.get("fields", {}):
                    if fid not in card_fields:
                        errors.append(f"example patch {ex['id']}: unknown card field {fid}")
        for k in ex.get("settings", {}):
            if k not in params:
                errors.append(f"example patch {ex['id']}: unknown parameter {k} in settings")
    for n in sorted(nodes - used):
        warnings.append(f"node {n} is declared but never wired or exposed")

    alg = d.get("algorithms")
    if alg:
        mods = {m["id"]: m for m in d["modules"]}
        ops = alg["operators"]
        for k in ("selector_param", "feedback_param"):
            if alg.get(k) and alg[k] not in params:
                errors.append(f"algorithms: unknown {k} {alg[k]}")
        for o in ops:
            if o not in mods:
                errors.append(f"algorithms: unknown operator module {o}")
            elif mods[o]["type"] != "operator":
                warnings.append(f"algorithms: module {o} is not of type operator")
        nums = sorted(e["number"] for e in alg["entries"])
        if nums != list(range(1, len(nums) + 1)):
            errors.append(f"algorithms: numbers must run 1..{len(nums)} without gaps or repeats")
        sel = next((p_ for p_ in d["parameters"] if p_["id"] == alg.get("selector_param")), None)
        if sel and sel.get("range") and sel["range"].get("max") != len(nums):
            warnings.append(f"algorithms: selector range max {sel['range'].get('max')} but {len(nums)} entries")
        for e in alg["entries"]:
            tag = f"algorithm {e['number']}"
            links = [(m["from"], m["to"]) for m in e["modulation"]]
            for a, b in links:
                if a not in ops or b not in ops:
                    errors.append(f"{tag}: link {a} -> {b} names an unknown operator")
                elif a == b:
                    errors.append(f"{tag}: self-modulation {a} belongs in feedback, not modulation")
                elif a in e["carriers"]:
                    warnings.append(f"{tag}: carrier {a} also modulates {b}")
            for c in e["carriers"]:
                if c not in ops:
                    errors.append(f"{tag}: unknown carrier {c}")
            sources = {a for a, _ in links}
            for o in ops:
                n = (o in e["carriers"]) + (o in sources)
                if n == 0:
                    errors.append(f"{tag}: operator {o} is neither a carrier nor a modulator")
            if len(set(links)) != len(links):
                errors.append(f"{tag}: duplicate modulation link")
            fb = e.get("feedback")
            if fb:
                loop = fb["loop"]
                if any(o not in ops for o in loop):
                    errors.append(f"{tag}: feedback loop names an unknown operator")
                elif len(loop) > 1:
                    for a, b in zip(loop, loop[1:]):
                        if (a, b) not in links:
                            errors.append(f"{tag}: feedback loop step {a} -> {b} is not a modulation link")
    if not d["architecture"].get("patch_memory"):
        for p_ in d["parameters"]:
            if p_.get("memory") == "patch":
                warnings.append(f"parameter {p_['id']}: memory 'patch' but the instrument has no patch memory")

    # Provenance sections should not be quietly empty on a thin source.
    kinds = {s.get("kind") for s in d["device"]["sources"]}
    if kinds <= {"quick_start_guide", "spec_sheet"} and not d.get("not_in_source"):
        warnings.append("source is a quick start guide or spec sheet but not_in_source is empty")

    return errors, warnings


def counts(d):
    panel = [p for p in d["parameters"] if any(a["type"] == "panel" for a in p["access"])]
    by_control = Counter(p["access"][0].get("control", "unknown") for p in panel)
    return {
        "modules": len(d["modules"]),
        "parameters": len(d["parameters"]),
        "panel": len(panel),
        "controls": dict(by_control),
        "ports": len(d["ports"]),
        "connections": len(d["connections"]),
        **({"algorithms": len(d["algorithms"]["entries"])} if d.get("algorithms") else {}),
        "behaviours": len(d.get("behaviours", [])),
        "not_in_source": len(d.get("not_in_source", [])),
        "modelling_gaps": len(d.get("modelling_gaps", [])),
    }


def main(argv):
    args = list(argv[1:])
    schema_path = Path(SCHEMA_DEFAULT)
    if "--schema" in args:
        i = args.index("--schema")
        schema_path = Path(args[i + 1])
        del args[i:i + 2]
    if not args:
        print(__doc__)
        return 2

    schema = None
    try:
        import jsonschema  # noqa: F401
        if schema_path.exists():
            schema = json.loads(schema_path.read_text())
    except ImportError:
        print("note: jsonschema not installed, running referential checks only\n")

    failed = False
    for path in args:
        d = json.loads(Path(path).read_text())
        print(f"== {path}")

        if schema is not None:
            import jsonschema
            v = jsonschema.Draft202012Validator(schema)
            schema_errors = sorted(v.iter_errors(d), key=lambda e: list(e.path))
            for e in schema_errors:
                loc = "/".join(str(x) for x in e.path) or "(root)"
                print(f"  schema: {loc}: {e.message}")
            failed |= bool(schema_errors)

        errors, warnings = check(d)
        for e in errors:
            print(f"  error: {e}")
        for w in warnings:
            print(f"  warn:  {w}")
        failed |= bool(errors)

        print("  " + "  ".join(f"{k}={v}" for k, v in counts(d).items()))
        print()

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
