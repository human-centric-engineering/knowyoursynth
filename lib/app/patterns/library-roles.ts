/**
 * The pattern roles, in the order the design lists them (`.context/app/pattern-library.md`, Roles). In a file of their
 * own, importing nothing, so the sound detector can name them inside the probe worker without bundling the sequencer.
 */
import type { PatternRole } from '@prisma/client';

export const PATTERN_ROLES = [
  'lead_line',
  'held',
  'bass_line',
  'slow_melody',
  'percussive',
  'chord_changes',
  'arp',
  'chord_stabs',
] as const satisfies readonly PatternRole[];
