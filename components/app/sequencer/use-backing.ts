'use client';

/**
 * What plays along with the sequencer (`f-step-sequencer` t-266, t-267): the Metronome (off to begin with), the
 * Count-in (on), and the Drums: off, a beat that matches the pattern, or one chosen by name. A screen setting, kept in
 * this browser only (`kys.backing`).
 *
 * It hands the sequencer what to play (`seq.setBacking`) whenever any of it changes, including the pattern under a
 * matched beat: another pattern opened can match another beat, and the beat swings with the pattern's swing. Match
 * goes by what the pattern was inspired by, or by `fallbackInspiredBy` (the sound's default pattern's, for the sound's
 * own riff), then by the tempo and swing (`drumStyleFor`).
 *
 * Another patch (`patchKey` changing) brings the drums back to Match, so the beat is the one that suits the new patch
 * rather than one chosen for the last. Off stays off.
 *
 * The stored setting is read by `useBackingPref`, apart from the rest, so the page can know whether Match is on before
 * it has read what Match goes by.
 */

import { useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { STORAGE_KEYS, useStoredPref } from '@/components/app/synth/storage';
import {
  DRUM_BEAT_IDS,
  beatGrid,
  drumBeat,
  drumStyleFor,
  type DrumBeatId,
  type DrumStyle,
} from '@/lib/app/sequencer/drums';
import type { Sequencer } from '@/components/app/sequencer/use-sequencer';

export const DRUM_CHOICES = ['off', 'auto', ...DRUM_BEAT_IDS] as const;
export type DrumChoice = (typeof DRUM_CHOICES)[number];

const BackingPrefSchema = z.object({
  metronome: z.boolean(),
  countIn: z.boolean(),
  drums: z.enum(DRUM_CHOICES),
});
export type BackingPref = z.infer<typeof BackingPrefSchema>;

export const DEFAULT_BACKING: BackingPref = { metronome: false, countIn: true, drums: 'off' };

export interface Backing {
  metronome: boolean;
  setMetronome: (on: boolean) => void;
  countIn: boolean;
  setCountIn: (on: boolean) => void;
  drums: DrumChoice;
  setDrums: (d: DrumChoice) => void;
  /** What Match picks for the pattern held now. */
  matched: DrumStyle;
  /** The beat that plays, or null for none. */
  beat: DrumBeatId | null;
}

/** The stored Metronome, Count-in and Drums. */
export function useBackingPref(): [BackingPref, (next: BackingPref) => void] {
  return useStoredPref(STORAGE_KEYS.backing, BackingPrefSchema, DEFAULT_BACKING);
}

export function useBacking(
  seq: Pick<Sequencer, 'pattern' | 'loaded' | 'setBacking'>,
  [pref, setPref]: [BackingPref, (next: BackingPref) => void],
  {
    fallbackInspiredBy = null,
    patchKey = null,
  }: { fallbackInspiredBy?: string | null; patchKey?: string | null } = {}
): Backing {
  // Another patch: a beat chosen by name gives way to the one that matches it.
  const lastPatch = useRef(patchKey);
  useEffect(() => {
    if (lastPatch.current === patchKey) return;
    lastPatch.current = patchKey;
    if (pref.drums !== 'off' && pref.drums !== 'auto') setPref({ ...pref, drums: 'auto' });
  }, [patchKey, pref, setPref]);
  const { bpm, swing } = seq.pattern;
  const inspiredBy = seq.loaded ? (seq.loaded.inspiredBy ?? null) : fallbackInspiredBy;
  const matched = useMemo(() => drumStyleFor(inspiredBy, bpm, swing), [inspiredBy, bpm, swing]);
  const beat = pref.drums === 'off' ? null : pref.drums === 'auto' ? matched.beat : pref.drums;

  const { setBacking } = seq;
  const { metronome, countIn } = pref;
  useEffect(() => {
    setBacking({
      countIn,
      settings: { click: metronome, drums: beat ? beatGrid(drumBeat(beat), swing) : null },
    });
  }, [setBacking, countIn, metronome, beat, swing]);

  return {
    metronome,
    setMetronome: (on) => setPref({ ...pref, metronome: on }),
    countIn,
    setCountIn: (on) => setPref({ ...pref, countIn: on }),
    drums: pref.drums,
    setDrums: (d) => setPref({ ...pref, drums: d }),
    matched,
    beat,
  };
}
