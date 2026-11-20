/**
 * The Subharmonicon's new sounds, family by family, in library order (`f-own-sequencer` t-289). The patchbay sounds
 * (t-290) are placed through the families, each after the sound it names.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { DRONE } from '@/scripts/app/sounds/subharmonicon/drone';
import { FX } from '@/scripts/app/sounds/subharmonicon/fx';
import { JUST } from '@/scripts/app/sounds/subharmonicon/just';
import { KEYS } from '@/scripts/app/sounds/subharmonicon/keys';
import { MINIMAL } from '@/scripts/app/sounds/subharmonicon/minimal';
import { PATCH } from '@/scripts/app/sounds/subharmonicon/patch';
import { PATCHBAY } from '@/scripts/app/sounds/subharmonicon/patchbay';
import { PERC } from '@/scripts/app/sounds/subharmonicon/perc';
import { POLY } from '@/scripts/app/sounds/subharmonicon/poly';
import { RHYTHM_KEYS } from '@/scripts/app/sounds/subharmonicon/rhythm-keys';
import { TRANSPOSED } from '@/scripts/app/sounds/subharmonicon/transposed';
import { UNDERTONE } from '@/scripts/app/sounds/subharmonicon/undertone';

const BASE: SoundSpec[][] = [
  POLY,
  UNDERTONE,
  KEYS,
  TRANSPOSED,
  JUST,
  MINIMAL,
  RHYTHM_KEYS,
  PERC,
  DRONE,
  PATCH,
  FX,
];

const placed = new Set<string>();
export const FAMILIES: SoundSpec[][] = BASE.map((family) =>
  family.flatMap((s) => {
    const after = PATCHBAY.filter((p) => p.after === s.id);
    after.forEach((p) => placed.add(p.sound.id));
    return [s, ...after.map((p) => p.sound)];
  })
);
const lost = PATCHBAY.filter((p) => !placed.has(p.sound.id)).map((p) => p.after);
if (lost.length)
  throw new Error(`patchbay sounds follow sounds not in the library: ${lost.join(', ')}`);
