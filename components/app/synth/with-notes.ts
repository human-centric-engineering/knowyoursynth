/**
 * Attach the catalogue's "Unusual on…" notes to a definition.
 *
 * The contract keeps a note on the control, jack or area it is about (`unusual`), and the inspector, the search index
 * and the tour read it from there. In the app the notes are rows (D13), served by `GET /api/v1/synths/[id]`, so the
 * page puts them back where those readers look. The definition module itself never carries one (m1's guard).
 */

import type { SynthDef } from '@/lib/app/synths/contract';

/** `def` with each note set on the item whose id it names. Items with no note are returned as they are. */
export function withNotes(def: SynthDef, unusual: Readonly<Record<string, string>>): SynthDef {
  const note = <T extends { id: string; unusual?: string }>(item: T): T => {
    const text = unusual[item.id];
    return text ? { ...item, unusual: text } : item;
  };
  return {
    ...def,
    controls: def.controls.map(note),
    jacks: def.jacks.map(note),
    ...(def.areas ? { areas: def.areas.map(note) } : {}),
  };
}
