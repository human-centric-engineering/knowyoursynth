/**
 * The Moog modular systems' map (t-319): Behringer's System 15, 35 and 55, the three sizes of one system. They are
 * built from the same 900-series modules (`defs/moog900/modules.ts`), so a module carries under its own ids, and a
 * module one size lacks is dropped with its knobs and its cables.
 */
import type { SynthDef } from '@/lib/app/synths/contract';
import type { FamilyLink, FamilyMap } from '@/lib/app/synths/families/translate';

/** A module instance's id, from a control's or a jack's (`m921b_3.frequency`, `j.m921b_3.sync` → `m921b_3`). */
const moduleOf = (id: string): string => id.replace(/^j\./, '').split('.')[0];

/** "The System 15 has no 921B Oscillator (5)", when the module itself is missing: a module's area has its id. */
function missingModule(id: string, from: SynthDef, to: SynthDef): string | undefined {
  const mod = moduleOf(id);
  const area = from.areas.find((a) => a.id === mod);
  if (!area || to.areas.some((a) => a.id === mod)) return undefined;
  return `The ${to.name} has no ${area.label}`;
}

const NAMES: Record<string, string> = {
  'system-15': 'System 15',
  'system-35': 'System 35',
  'system-55': 'System 55',
};

const link = (from: string, to: string): FamilyLink => ({
  from,
  to,
  // The app's 960 CLOCK switch (`FOLLOW_960`) sits in the output, which every size has; only the 55 has a 960.
  ...(from === 'system-55' && {
    lacks: { 'out.follow960': `The ${NAMES[to]} has no 960 sequencer for its output to follow` },
  }),
  lacksFallback: missingModule,
});

export const MOOG_MODULAR_FAMILY: FamilyMap = {
  family: 'moog-modular-systems',
  links: Object.keys(NAMES).flatMap((from) =>
    Object.keys(NAMES)
      .filter((to) => to !== from)
      .map((to) => link(from, to))
  ),
};
