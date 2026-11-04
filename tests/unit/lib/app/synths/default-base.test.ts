/**
 * Every catalogue sound built on the Default patch (`f-default-base` t-176)
 *
 * Step 0 of a lesson sets the Default patch, and `presetState` builds every sound on it. Two invariants over every
 * sound in the catalogue's seed data, which is what the seed writes and the app serves:
 *
 * - **The finished sound states everything it relies on.** Built on the Default patch it is the same panel, values and
 *   cables, as built on `init`: no value or cable it plays with comes from the base rather than from a step. That is
 *   what kept every sound unchanged when the base moved from `init` to the Default patch, and what stops a new sound
 *   relying on a value nobody tells the learner to set.
 * - **Each step changes only what it names.** From step 0 (the Default patch) on, the panel at step k differs from the
 *   panel at step k − 1 only in the controls the step sets, the cables it plugs in and the cables it takes out: the
 *   moves the lesson card shows and lights. So someone following on hardware ends each step where the panel is.
 *
 * The tempo knob (`SynthDef.tempo`) is left out of the second: it takes the riff's BPM, not a step's move.
 *
 * @see lib/app/synths/lib/patch.ts (presetState)
 * @see lib/app/synths/default-patch.ts (lessonState)
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, Preset, SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { lessonState, START_STEP } from '@/lib/app/synths/default-patch';
import { presetState, type PanelState } from '@/lib/app/synths/lib/patch';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

const key = ([from, to]: readonly [string, string]) => `${from}>${to}`;
const cableKeys = (s: PanelState) => s.cables.map((c) => key([c.from, c.to])).sort();

/** A sound built on `init` with no cables, as `presetState` built every sound before t-176. */
function onInit(
  def: SynthDef,
  p: Pick<Preset, 'steps' | 'phrase'>
): { values: ControlValues; cables: string[] } {
  const values: ControlValues = { ...def.init };
  if (def.tempo && p.phrase.bpm) values[def.tempo] = p.phrase.bpm;
  const cables = new Set<string>();
  for (const s of p.steps) {
    Object.assign(values, s.set ?? {});
    // On `init` a cable the Default patch has is not in, so taking it out leaves nothing to take.
    for (const c of s.unplug ?? []) cables.delete(key(c));
    for (const c of s.cables ?? []) cables.add(key(c));
  }
  return { values, cables: [...cables].sort() };
}

/** Where step k's panel differs from the one before it by anything the step does not name, one line per difference. */
function unnamedChanges(def: SynthDef, p: Preset): string[] {
  const out: string[] = [];
  let before = lessonState(def, p, START_STEP);
  p.steps.forEach((s, k) => {
    const after = lessonState(def, p, k);
    const set = new Set(Object.keys(s.set ?? {}));
    for (const id of Object.keys(after.values))
      if (id !== def.tempo && after.values[id] !== before.values[id] && !set.has(id))
        out.push(
          `step ${k + 1} moves ${id} ${JSON.stringify(before.values[id])} → ${JSON.stringify(after.values[id])}`
        );
    const was = new Set(cableKeys(before));
    const now = new Set(cableKeys(after));
    const plugs = new Set((s.cables ?? []).map(key));
    const unplugs = new Set((s.unplug ?? []).map(key));
    for (const c of now) if (!was.has(c) && !plugs.has(c)) out.push(`step ${k + 1} plugs in ${c}`);
    for (const c of was)
      if (!now.has(c) && !unplugs.has(c)) out.push(`step ${k + 1} takes out ${c}`);
    before = after;
  });
  return out;
}

const DATA = loadCatalogueData();
const SYNTHS = DATA.sounds.map((file) => {
  const def = getSynthDef(file.synth);
  if (!def) throw new Error(`no definition for ${file.synth}`);
  const sounds = file.sounds.map((raw) => {
    const r = validatePreset(def, raw);
    if (!r.ok) throw new Error(`${file.synth}/${String(raw.id)}: ${JSON.stringify(r.problems)}`);
    return r.value;
  });
  return { def, sounds };
});

describe('the catalogue', () => {
  it('is read, so every assertion below covers real sounds', () => {
    expect(SYNTHS.reduce((n, s) => n + s.sounds.length, 0)).toBeGreaterThan(2000);
    // And sounds that take a Default-patch cable out are among them, so the cable half is exercised too.
    expect(
      SYNTHS.some(({ sounds }) => sounds.some((p) => p.steps.some((s) => s.unplug?.length)))
    ).toBe(true);
  });
});

describe('every finished sound', () => {
  it.each(SYNTHS.map((s) => [s.def.id, s] as const))(
    '%s: is the same panel built on the Default patch as on init',
    (_id, { def, sounds }) => {
      const differ = sounds.flatMap((p) => {
        const got = presetState(def, p);
        const want = onInit(def, p);
        const values = Object.keys(want.values).filter((id) => got.values[id] !== want.values[id]);
        const cables = cableKeys(got).join(' ') !== want.cables.join(' ');
        return values.length || cables
          ? [`${p.id}: ${values.join(' ')}${cables ? ` cables ${cableKeys(got).join(' ')}` : ''}`]
          : [];
      });

      expect(differ).toEqual([]);
    }
  );
});

describe('every lesson step', () => {
  it.each(SYNTHS.map((s) => [s.def.id, s] as const))(
    '%s: changes only what the step names, from the Default patch on',
    (_id, { def, sounds }) => {
      const unnamed = sounds.flatMap((p) => unnamedChanges(def, p).map((d) => `${p.id} ${d}`));

      expect(unnamed).toEqual([]);
    }
  );
});
