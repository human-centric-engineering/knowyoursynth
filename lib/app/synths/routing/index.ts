/**
 * The routing registry: every synth's signal routing, by synth id. A synth without one has no routing view yet.
 *
 * A routing joins by adding its module under `routing/` and one line below (`.context/app/synths.md`).
 * `tests/unit/lib/app/synths/routing.test.ts` checks every one listed here against its definition and its spec.
 *
 * The System 15, 35 and 55 are built from their definitions instead (`moog900Routing()`), so `getSynthRouting()`
 * takes the definition. Importing the definitions here would put them in every synth page's bundle, which loads one
 * definition at a time (`defs/load.ts`).
 */
import type { SynthDef, SynthRouting } from '@/lib/app/synths/contract';
import { moog900Routing } from '@/lib/app/synths/routing/moog900';
import { routing as modelD } from '@/lib/app/synths/routing/model-d';
import { routing as neutron } from '@/lib/app/synths/routing/neutron';
import { routing as pro1 } from '@/lib/app/synths/routing/pro-1';
import { routing as k2 } from '@/lib/app/synths/routing/k2';
import { routing as kobol } from '@/lib/app/synths/routing/kobol';
import { routing as waspDeluxe } from '@/lib/app/synths/routing/wasp-deluxe';
import { routing as b2600 } from '@/lib/app/synths/routing/b2600';
import { routing as tb303 } from '@/lib/app/synths/routing/tb-303';
import { routing as td3 } from '@/lib/app/synths/routing/td-3';
import { routing as donnerB1 } from '@/lib/app/synths/routing/donner-b1';
import { routing as grandmother } from '@/lib/app/synths/routing/grandmother';
import { routing as model15 } from '@/lib/app/synths/routing/model-15';
import { routing as cat } from '@/lib/app/synths/routing/cat';
import { routing as xm2 } from '@/lib/app/synths/routing/2-xm';
import { routing as polyD } from '@/lib/app/synths/routing/poly-d';
import { routing as jupiter4 } from '@/lib/app/synths/routing/jupiter-4';
import { routing as jupiter6 } from '@/lib/app/synths/routing/jupiter-6';
import { routing as jupiter8 } from '@/lib/app/synths/routing/jupiter-8';
import { routing as pro800 } from '@/lib/app/synths/routing/pro-800';
import { routing as buchlaEasel } from '@/lib/app/synths/routing/buchla-easel';
import { routing as ubXaD } from '@/lib/app/synths/routing/ub-xa-d';
import { routing as deepmind12d } from '@/lib/app/synths/routing/deepmind-12d';
import { routing as take5 } from '@/lib/app/synths/routing/take-5';
import { routing as cs80 } from '@/lib/app/synths/routing/cs-80';
import { routing as superGemini } from '@/lib/app/synths/routing/super-gemini';
import { routing as pearlSyncussion } from '@/lib/app/synths/routing/pearl-syncussion';
import { routing as behringerSyncussion } from '@/lib/app/synths/routing/behringer-syncussion';
import { routing as e7 } from '@/lib/app/synths/routing/e7';
import { routing as solar42n } from '@/lib/app/synths/routing/solar-42n';
import { routing as emsVcs3 } from '@/lib/app/synths/routing/ems-vcs3';
import { routing as syntrxIi } from '@/lib/app/synths/routing/syntrx-ii';

export const SYNTH_ROUTINGS: SynthRouting[] = [
  modelD,
  neutron,
  pro1,
  k2,
  waspDeluxe,
  kobol,
  b2600,
  tb303,
  td3,
  donnerB1,
  grandmother,
  model15,
  cat,
  xm2,
  polyD,
  jupiter4,
  jupiter6,
  jupiter8,
  pro800,
  buchlaEasel,
  ubXaD,
  deepmind12d,
  take5,
  cs80,
  superGemini,
  pearlSyncussion,
  behringerSyncussion,
  e7,
  solar42n,
  emsVcs3,
  syntrxIi,
];

/** The routings built from their definition, by synth id. */
export const DERIVED_ROUTINGS: Record<string, (def: SynthDef) => SynthRouting> = {
  'system-15': moog900Routing,
  'system-35': moog900Routing,
  'system-55': moog900Routing,
};

const BY_ID = new Map(SYNTH_ROUTINGS.map((r) => [r.synth, r]));
const built = new WeakMap<SynthDef, SynthRouting>();

/** `def`'s routing, or undefined when it has none. A derived one is built once per definition. */
export function getSynthRouting(def: SynthDef): SynthRouting | undefined {
  const fixed = BY_ID.get(def.id);
  if (fixed) return fixed;
  const build = Object.hasOwn(DERIVED_ROUTINGS, def.id) ? DERIVED_ROUTINGS[def.id] : undefined;
  if (!build) return undefined;
  let r = built.get(def);
  if (!r) {
    r = build(def);
    built.set(def, r);
  }
  return r;
}
