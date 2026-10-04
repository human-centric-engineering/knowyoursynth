// The Orientation tour: a guided walk round one faceplate, built from the SynthDef alone.
//
// Nothing is written per synth. The stops come from the areas, their `help`, and the "unusual on this synth"
// notes that are already attached to controls, jacks and areas — so a synth added later gets a tour for free,
// and the tour can never drift away from what the panel search and the inspector say about the same control.
//
// Two decisions shape it:
//  * The order is signal flow, not panel layout: oscillators, mixer, filter, envelopes, amplifier, then the
//    modulation sources, then the parts round the edge. That is why the Model D tour opens on the oscillator
//    bank even though the panel starts with MIDI sockets and the controllers.
//  * Stops are grouped by `module`, not one per area, so the 2600's three oscillators are read together
//    instead of as three near-identical stops. It keeps even the biggest panel to about a dozen stops.
import { areaMembers, areaOf } from '@/lib/areas.js';
import { moduleOf } from '@/lib/modules.js';
import { displayName } from '@/lib/patch.js';
import { jackName } from '@/lib/explain.js';

/** Signal flow first, then the sources that modulate it, then the things round the edge. */
const ORDER = ['osc', 'mixer', 'filter', 'env', 'amp', 'mod', 'lfo', 'glide', 'mode', 'fx', 'util', 'out', 'patch'];

/**
 * An unusual note is "about a name" when it says what this maker calls the thing, rather than what the
 * circuit does. Those are what a player coming from another synth trips over first, so they get their own
 * stop before the walk round the panel. The rest stay with the section they belong to.
 */
const NAMING_HINTS = [
  'word for', 'name for', 'names for', 'short for', 'named after', 'not named', 'two names',
  'known as', 'usually called', 'is called', 'this is called', 'call it', 'calls it', 'they call',
  'other synths call', 'other makers call', 'other gear', 'would be marked', 'is marked', 'marked ',
  'marks this', 'no knob marked', 'the panel prints', '’s word', '’s name', '’s own word',
];
const isNamingNote = (text) => {
  const t = text.toLowerCase();
  return NAMING_HINTS.some((h) => t.includes(h));
};

/**
 * Up to `max` distinct notes. One note is normally written once and attached to a row of controls (both WIDTH
 * knobs, all four stages of an envelope), so identical wording collapses to a single entry that names the whole
 * row: `names` for the card, `ids` for the panel highlight, `id` for the one the card links to.
 */
function groupNotes(entries, max) {
  const byText = new Map();
  entries.forEach((e) => {
    const g = byText.get(e.text);
    if (g) { g.names.push(e.name); g.ids.push(e.id); }
    else byText.set(e.text, { key: `${e.kind}:${e.id}`, kind: e.kind, id: e.id, ids: [e.id], module: e.module, names: [e.name], text: e.text });
  });
  return [...byText.values()].slice(0, max);
}

/**
 * Every unusual note on a control or a jack, in signal-flow order. Area notes are left out: an area always
 * shows its own note on its own stop, and on several synths it repeats what the control note beside it says.
 */
function allNotes(def) {
  const rank = (m) => { const i = ORDER.indexOf(m); return i < 0 ? ORDER.length : i; };
  const rows = [];
  def.controls.forEach((c) => {
    if (!c.unusual) return;
    // A one- or two-character label (the Neutron's attenuator "2") means nothing on its own, so it borrows
    // the name of the section it sits in.
    const name = displayName(def, c);
    const area = name.length > 2 ? null : areaOf(def, c);
    rows.push({ kind: 'control', id: c.id, name: area ? `${area.label} · ${name}` : name, module: c.module, text: c.unusual });
  });
  def.jacks.forEach((j) => { if (j.unusual) rows.push({ kind: 'jack', id: j.id, name: `${jackName(j)} socket`, module: 'patch', text: j.unusual }); });
  return rows.sort((a, b) => rank(a.module) - rank(b.module));
}

/**
 * The stops, in order. Every stop has `kind`, a `title` and `lead`; a 'module' stop also carries the area ids
 * to light up on the panel.
 */
export function buildTour(def) {
  const areas = def.areas || [];
  const notes = allNotes(def);
  const naming = groupNotes(notes.filter((n) => isNamingNote(n.text)), 8);
  // Matched on the wording, not the id: one note is usually written once and attached to a row of controls
  // (both WIDTH knobs, all four of an envelope's stages), and the naming stop shows the whole row at once.
  const namingTexts = new Set(naming.map((n) => n.text));
  const stops = [];

  const counts = {
    controls: def.controls.length,
    jacks: def.jacks.length,
    sections: areas.length,
  };
  stops.push({
    kind: 'intro', module: 'osc', title: `${def.maker} ${def.name}`, lead: def.heritage,
    body: def.summary, counts,
    chain: ORDER.filter((m) => areas.some((a) => a.module === m)),
  });

  if (naming.length) {
    stops.push({
      kind: 'naming', module: 'mode', title: 'What this panel calls things',
      lead: `Every maker names things its own way, and the ${def.name} is no exception. These are the words on this faceplate that mean something you already know under another name.`,
      notes: naming,
    });
  }

  ORDER.forEach((module) => {
    const mine = areas.filter((a) => a.module === module);
    if (!mine.length) return;
    const m = moduleOf(module);
    const members = mine.map((a) => areaMembers(def, a));
    const controls = members.flatMap((x) => x.controls);
    const jacks = members.flatMap((x) => x.jacks);
    // Notes on the controls and jacks of this module that the naming stop did not already use. Three is
    // as many as the card can show without turning a stop into a wall of text; the rest are one click
    // away on the chips below it, which open the same text in the inspector.
    const ids = new Set([...controls.map((c) => c.id), ...jacks.map((j) => j.id)]);
    const extra = groupNotes(notes.filter((n) => ids.has(n.id) && !namingTexts.has(n.text)), 3);
    stops.push({
      kind: 'module', module, title: m.label, color: m.color,
      areaIds: mine.map((a) => a.id), areas: mine, controls, jacks, extra,
    });
  });

  stops.push({
    kind: 'outro', module: 'out', title: 'That is the whole panel',
    lead: `You have been round every section of the ${def.name}. Nothing here changed the sound — the panel is exactly where you left it.`,
  });

  return stops;
}
