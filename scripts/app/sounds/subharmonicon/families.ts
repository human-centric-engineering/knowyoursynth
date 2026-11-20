/** The Subharmonicon's new sounds, family by family, in library order (`f-own-sequencer` t-289). */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { DRONE } from '@/scripts/app/sounds/subharmonicon/drone';
import { FX } from '@/scripts/app/sounds/subharmonicon/fx';
import { JUST } from '@/scripts/app/sounds/subharmonicon/just';
import { KEYS } from '@/scripts/app/sounds/subharmonicon/keys';
import { MINIMAL } from '@/scripts/app/sounds/subharmonicon/minimal';
import { PATCH } from '@/scripts/app/sounds/subharmonicon/patch';
import { PERC } from '@/scripts/app/sounds/subharmonicon/perc';
import { POLY } from '@/scripts/app/sounds/subharmonicon/poly';
import { RHYTHM_KEYS } from '@/scripts/app/sounds/subharmonicon/rhythm-keys';
import { TRANSPOSED } from '@/scripts/app/sounds/subharmonicon/transposed';
import { UNDERTONE } from '@/scripts/app/sounds/subharmonicon/undertone';

export const FAMILIES: SoundSpec[][] = [
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
