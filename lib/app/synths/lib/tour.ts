// The Orientation tour: a guided walk round one faceplate, built from the SynthDef alone.
//
// Nothing is written per synth. The stops come from the areas, their `help`, and the "unusual on this synth"
// notes — so a synth added later gets a tour for free, and the tour can never drift away from what the panel search
// and the inspector say about the same control.
//
// Two decisions shape it:
//  * The order is signal flow, not panel layout: oscillators, mixer, filter, envelopes, amplifier, then the
//    modulation sources, then the parts round the edge. That is why the Model D tour opens on the oscillator
//    bank even though the panel starts with MIDI sockets and the controllers.
//  * Stops are grouped by `module`, not one per area, so the 2600's three oscillators are read together
//    instead of as three near-identical stops. It keeps even the biggest panel to about a dozen stops.
//
// Transliterated from the prototype file `src/lib/tour.js` (decision D3). One change: the prototype read the unusual notes
// already attached to the controls, jacks and areas (by `annotate()` at load); in the app they come from the
// catalogue, so `buildTour()` takes them as an argument. Without it, it reads the attached notes as before.
import { areaMembers, areaOf } from '@/lib/app/synths/lib/areas';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { displayName } from '@/lib/app/synths/lib/patch';
import { jackName } from '@/lib/app/synths/lib/explain';
import type {
  Area,
  Control,
  Jack,
  SynthDef,
  SynthModule,
  UnusualNotes,
} from '@/lib/app/synths/contract';

/** Signal flow first, then the sources that modulate it, then the things round the edge. */
const ORDER: SynthModule[] = [
  'osc',
  'mixer',
  'filter',
  'env',
  'amp',
  'mod',
  'lfo',
  'glide',
  'mode',
  'fx',
  'util',
  'out',
  'patch',
];

/**
 * An unusual note is "about a name" when it says what this maker calls the thing, rather than what the
 * circuit does. Those are what a player coming from another synth trips over first, so they get their own
 * stop before the walk round the panel. The rest stay with the section they belong to.
 */
const NAMING_HINTS = [
  'word for',
  'name for',
  'names for',
  'short for',
  'named after',
  'not named',
  'two names',
  'known as',
  'usually called',
  'is called',
  'this is called',
  'call it',
  'calls it',
  'they call',
  'other synths call',
  'other makers call',
  'other gear',
  'would be marked',
  'is marked',
  'marked ',
  'marks this',
  'no knob marked',
  'the panel prints',
  '’s word',
  '’s name',
  '’s own word',
];
const isNamingNote = (text: string) => {
  const t = text.toLowerCase();
  return NAMING_HINTS.some((h) => t.includes(h));
};

/** One unusual note on a control or jack, before grouping. */
interface NoteRow {
  kind: 'control' | 'jack';
  id: string;
  name: string;
  module: SynthModule;
  text: string;
}

/** A note as the tour shows it: one wording, and every control or jack it is attached to. */
export interface TourNote {
  key: string;
  kind: 'control' | 'jack';
  /** The one the card links to. */
  id: string;
  /** Every control or jack with this wording, for the panel highlight. */
  ids: string[];
  module: SynthModule;
  /** Their names, for the card. */
  names: string[];
  text: string;
}

/**
 * Up to `max` distinct notes. One note is normally written once and attached to a row of controls (both WIDTH
 * knobs, all four stages of an envelope), so identical wording collapses to a single entry that names the whole
 * row: `names` for the card, `ids` for the panel highlight, `id` for the one the card links to.
 */
function groupNotes(entries: NoteRow[], max: number): TourNote[] {
  const byText = new Map<string, TourNote>();
  entries.forEach((e) => {
    const g = byText.get(e.text);
    if (g) {
      g.names.push(e.name);
      g.ids.push(e.id);
    } else
      byText.set(e.text, {
        key: `${e.kind}:${e.id}`,
        kind: e.kind,
        id: e.id,
        ids: [e.id],
        module: e.module,
        names: [e.name],
        text: e.text,
      });
  });
  return [...byText.values()].slice(0, max);
}

/** The unusual note of a control, jack or area: from `notes` when the caller passes them, else the attached one. */
const noteFor = (notes: UnusualNotes | undefined, item: { id: string; unusual?: string }) =>
  notes ? notes[item.id] : item.unusual;

/**
 * Every unusual note on a control or a jack, in signal-flow order. Area notes are left out: an area always
 * shows its own note on its own stop, and on several synths it repeats what the control note beside it says.
 */
function allNotes(def: SynthDef, notes: UnusualNotes | undefined): NoteRow[] {
  const rank = (m: SynthModule) => {
    const i = ORDER.indexOf(m);
    return i < 0 ? ORDER.length : i;
  };
  const rows: NoteRow[] = [];
  def.controls.forEach((c) => {
    const text = noteFor(notes, c);
    if (!text) return;
    // A one- or two-character label (the Neutron's attenuator "2") means nothing on its own, so it borrows
    // the name of the section it sits in.
    const name = displayName(def, c);
    const area = name.length > 2 ? null : areaOf(def, c);
    rows.push({
      kind: 'control',
      id: c.id,
      name: area ? `${area.label} · ${name}` : name,
      module: c.module,
      text,
    });
  });
  def.jacks.forEach((j) => {
    const text = noteFor(notes, j);
    if (text)
      rows.push({ kind: 'jack', id: j.id, name: `${jackName(j)} socket`, module: 'patch', text });
  });
  return rows.sort((a, b) => rank(a.module) - rank(b.module));
}

/** One stop of the tour. */
export type TourStop =
  | {
      kind: 'intro';
      module: SynthModule;
      title: string;
      lead: string;
      body: string;
      counts: { controls: number; jacks: number; sections: number };
      /** The modules this panel has, in signal-flow order. */
      chain: SynthModule[];
    }
  | { kind: 'naming'; module: SynthModule; title: string; lead: string; notes: TourNote[] }
  | {
      kind: 'module';
      module: SynthModule;
      title: string;
      color: string;
      /** The areas to light up on the panel. */
      areaIds: string[];
      /** The areas, with their unusual notes. */
      areas: Area[];
      controls: Control[];
      jacks: Jack[];
      extra: TourNote[];
    }
  | { kind: 'outro'; module: SynthModule; title: string; lead: string };

/**
 * The stops, in order. Every stop has `kind`, a `title` and `lead`; a 'module' stop also carries the area ids
 * to light up on the panel. `notes` are the synth's unusual notes (id → text); leave them out to read the ones
 * already attached to the definition.
 */
export function buildTour(def: SynthDef, notes?: UnusualNotes): TourStop[] {
  const areas = def.areas || [];
  const all = allNotes(def, notes);
  const naming = groupNotes(
    all.filter((n) => isNamingNote(n.text)),
    8
  );
  // Matched on the wording, not the id: one note is usually written once and attached to a row of controls
  // (both WIDTH knobs, all four of an envelope's stages), and the naming stop shows the whole row at once.
  const namingTexts = new Set(naming.map((n) => n.text));
  const stops: TourStop[] = [];

  const counts = {
    controls: def.controls.length,
    jacks: def.jacks.length,
    sections: areas.length,
  };
  stops.push({
    kind: 'intro',
    module: 'osc',
    title: `${def.maker} ${def.name}`,
    lead: def.heritage,
    body: def.summary,
    counts,
    chain: ORDER.filter((m) => areas.some((a) => a.module === m)),
  });

  if (naming.length) {
    stops.push({
      kind: 'naming',
      module: 'mode',
      title: 'What this panel calls things',
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
    const extra = groupNotes(
      all.filter((n) => ids.has(n.id) && !namingTexts.has(n.text)),
      3
    );
    stops.push({
      kind: 'module',
      module,
      title: m.label,
      color: m.color,
      areaIds: mine.map((a) => a.id),
      // An area shows its own note on its stop, so the passed notes reach it here.
      areas: notes ? mine.map((a) => ({ ...a, unusual: noteFor(notes, a) })) : mine,
      controls,
      jacks,
      extra,
    });
  });

  stops.push({
    kind: 'outro',
    module: 'out',
    title: 'That is the whole panel',
    lead: `You have been round every section of the ${def.name}. Nothing here changed the sound — the panel is exactly where you left it.`,
  });

  return stops;
}
