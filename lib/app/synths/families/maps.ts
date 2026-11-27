/**
 * Every family's map (t-319), one per family the seed data holds (`prisma/seeds/app-knowyoursynth/data/families/`).
 * `check:synths` checks each against the definitions it joins (`checkFamilyMaps`). A family with no map here still
 * translates, under shared ids only, and `check:synths` reports it.
 */
import type { FamilyMap } from '@/lib/app/synths/families/translate';
import { TB_303_FAMILY } from '@/lib/app/synths/families/tb-303';
import { SYNCUSSION_FAMILY } from '@/lib/app/synths/families/syncussion';
import { GRANDMOTHER_FAMILY } from '@/lib/app/synths/families/grandmother';
import { MOOG_MODULAR_FAMILY } from '@/lib/app/synths/families/moog-modular';
import { DFAM_FAMILY } from '@/lib/app/synths/families/dfam';

export const FAMILY_MAPS: readonly FamilyMap[] = [
  TB_303_FAMILY,
  SYNCUSSION_FAMILY,
  GRANDMOTHER_FAMILY,
  MOOG_MODULAR_FAMILY,
  DFAM_FAMILY,
];
