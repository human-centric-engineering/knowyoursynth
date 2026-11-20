/**
 * Writes a synth's library sounds from compact specs (`f-own-sequencer` t-289): each step's text gets a readout line
 * for every control it sets and every cable it moves, worked out from the definition's own controls and jacks at
 * that step's panel, so the lesson and the panel always agree. A spec says why and what to listen for; the writer
 * adds the readouts between them.
 *
 * Synth-agnostic: a synth's sounds live in their own file beside this one (`subharmonicon.ts`), which hands its specs
 * to `writeSounds`. See `.context/app/sequencer-synths.md`.
 */
import type {
  CablePair,
  ControlValue,
  ControlValues,
  Phrase,
  PhraseNote,
  Preset,
  PresetStep,
  PresetTweak,
  SynthDef,
  SynthModule,
} from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';

/** One step of a sound, before its readouts are written. */
export interface StepSpec {
  title: string;
  module: SynthModule;
  /** What the step does and why, one or two sentences. */
  why: string;
  set?: ControlValues;
  cables?: CablePair[];
  unplug?: CablePair[];
  /** What to listen for once the step is made. */
  listen: string;
}

/** One sound, before its readouts are written. */
export interface SoundSpec {
  id: string;
  name: string;
  ref: string;
  artist: string;
  tags: string[];
  level: 1 | 2 | 3;
  blurb: string;
  how: string;
  /** The riff's tempo. */
  bpm: number;
  /** The riff: a held C4 the length of a bar when left out (the synth plays itself). */
  riff?: PhraseNote[];
  steps: StepSpec[];
  context: Record<string, string>;
  tweaks: PresetTweak[];
}

/** A held C4 over `beats`: the app sends only its clock (`sequencer-synths.md`, "Who plays a sound"). */
export const held = (beats = 4): PhraseNote[] => [[0, 60, beats]];

const round = (v: number): string => String(Math.round(v * 100) / 100);

/** A control's readout at `values`: its name, its position and what that position does. */
export function readout(def: SynthDef, id: string, v: ControlValue, values: ControlValues): string {
  const c = def.controls.find((x) => x.id === id);
  if (!c) throw new Error(`${def.id}: no control ${id}`);
  const name = c.name ?? c.label ?? id;
  if (c.kind === 'bool') return `${name} ${v ? 'lit' : 'off'}`;
  if (c.kind === 'enum') {
    if ('fmt' in c && c.fmt) return `${name} ${(c.fmt as (x: ControlValue) => string)(v)}`;
    const o = 'options' in c ? c.options?.find((x) => x.v === v) : undefined;
    return `${name} ${o?.label || String(v)}`;
  }
  if (typeof v !== 'number') throw new Error(`${def.id}: ${id} takes a number`);
  const shown = 'fmt' in c && c.fmt ? c.fmt(v, values) : '';
  return shown && shown !== round(v) ? `${name} ${round(v)} · ${shown}` : `${name} ${round(v)}`;
}

/** A jack's name, as the lesson prints it. */
function jackName(def: SynthDef, id: string): string {
  const j = def.jacks.find((x) => x.id === id);
  if (!j) throw new Error(`${def.id}: no jack ${id}`);
  return j.name ?? `${j.label} ${j.dir === 'in' ? 'input' : 'OUT'}`;
}

/** The finished sounds, each step's text with its readouts. */
export function writeSounds(def: SynthDef, specs: SoundSpec[]): Preset[] {
  const ids = new Set<string>();
  return specs.map((s) => {
    if (ids.has(s.id)) throw new Error(`${def.id}: two sounds are ${s.id}`);
    ids.add(s.id);
    const phrase: Phrase = { bpm: s.bpm, loop: true, steps: s.riff ?? held() };
    const draft: Pick<Preset, 'steps' | 'phrase'> = {
      phrase,
      steps: s.steps.map((st) => ({
        title: st.title,
        module: st.module,
        why: '',
        ...(st.set && { set: st.set }),
        ...(st.unplug && { unplug: st.unplug }),
        ...(st.cables && { cables: st.cables }),
      })),
    };
    const steps: PresetStep[] = s.steps.map((st, k) => {
      const at = presetState(def, draft, k).values;
      const lines = [
        st.why,
        ...(st.unplug ?? []).map(
          ([a, b]) => `- Unplug ${jackName(def, a)} from ${jackName(def, b)}`
        ),
        ...Object.entries(st.set ?? {}).map(([id, v]) => `- ${readout(def, id, v, at)}`),
        ...(st.cables ?? []).map(([a, b]) => `- Patch ${jackName(def, a)} to ${jackName(def, b)}`),
        `- Listen for: ${st.listen}`,
      ];
      return { ...draft.steps[k], why: lines.join('\n') };
    });
    return {
      id: s.id,
      name: s.name,
      ref: s.ref,
      artist: s.artist,
      tags: s.tags,
      level: s.level,
      blurb: s.blurb,
      how: s.how,
      phrase,
      steps,
      context: s.context,
      tweaks: s.tweaks,
    };
  });
}
