/**
 * A synth's tempo control (`SynthDef.tempo`): the TB-303's TEMPO knob holds the BPM itself; the Subharmonicon's TEMPO
 * holds a knob position that `SynthDef.tempoMap` turns into the app's BPM and back (`f-own-sequencer`).
 */
import type { ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { MAX_BPM, MIN_BPM } from '@/lib/app/sequencer/pattern';

/** The tempo control's value for a riff's `bpm`: where a sound puts it. */
export function tempoValueFor(def: Pick<SynthDef, 'tempo' | 'tempoMap'>, bpm: number): number {
  return def.tempoMap ? def.tempoMap.fromBpm(bpm) : bpm;
}

/** The BPM the panel's tempo control sets, held to the app's 20 to 300, or `null` where the synth has none (or it holds no number). */
export function tempoBpmOf(
  def: Pick<SynthDef, 'tempo' | 'tempoMap'>,
  values: ControlValues
): number | null {
  if (!def.tempo) return null;
  const v = values[def.tempo];
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  // the app's tempos, whatever the control can reach
  return Math.min(MAX_BPM, Math.max(MIN_BPM, def.tempoMap ? def.tempoMap.toBpm(v) : v));
}

/** `values` with the tempo control set for a riff's `bpm`, where the synth has one. */
export function withRiffTempo(
  def: Pick<SynthDef, 'tempo' | 'tempoMap'>,
  values: ControlValues,
  bpm: number | null | undefined
): ControlValues {
  if (def.tempo && bpm) values[def.tempo] = tempoValueFor(def, bpm);
  return values;
}
