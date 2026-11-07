/**
 * Every lesson step names the controls it sets, never their ids.
 *
 * A step's text lists each control it sets on a line of its own, "- LFO rate 6 · 5.48 Hz". The lines are generated
 * from the definition's names and labels, and a control with neither came out as its id ("- lfo.rate 6 · …"). Some
 * definitions can't gain a name (a ported one must match the prototype's), so the text says what the control is
 * instead, and this holds every sound in the catalogue to it.
 */
import { describe, expect, it } from 'vitest';
import { getSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

/** The step lines of these steps that start with one of these control ids. */
function idLines(ids: Set<string>, steps: { why: string }[]): string[] {
  return steps
    .flatMap((s) => s.why.split('\n'))
    .filter((line) => {
      const first = /^- (\S+) /.exec(line);
      return first !== null && ids.has(first[1]);
    });
}

describe('lesson step text', () => {
  it('flags a line that prints a control id', () => {
    const ids = new Set(['lfo.rate']);
    expect(
      idLines(ids, [{ why: 'The LFO.\n- lfo.rate 6 · 5.48 Hz\n- Listen for: a wobble.' }])
    ).toEqual(['- lfo.rate 6 · 5.48 Hz']);
    expect(idLines(ids, [{ why: 'The LFO.\n- LFO rate 6 · 5.48 Hz' }])).toEqual([]);
  });

  it('names every control it sets, in every catalogue sound', () => {
    const data = loadCatalogueData();
    expect(data.sounds.length).toBeGreaterThan(20); // the whole catalogue, not an empty read
    const found: string[] = [];
    for (const file of data.sounds) {
      const def = getSynthDef(file.synth);
      if (!def) throw new Error(`no definition for ${file.synth}`);
      const ids = new Set(def.controls.map((c) => c.id));
      for (const raw of file.sounds) {
        const sound = validatePreset(def, raw);
        if (!sound.ok) throw new Error(`${file.synth}/${String(raw.id)} is not a valid sound`);
        for (const line of idLines(ids, sound.value.steps))
          found.push(`${file.synth}/${sound.value.id}: ${line}`);
      }
    }
    expect(found).toEqual([]);
  });
});
