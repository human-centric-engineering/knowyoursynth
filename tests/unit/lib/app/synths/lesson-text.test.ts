/**
 * Every lesson step names the controls it sets, never their ids.
 *
 * A step's text lists each control it sets on a line of its own, "- LFO rate 6 · 5.48 Hz". The lines are written from
 * the definition's names and labels, and a control with neither came out as its id ("- lfo.rate 6 · …"). A ported
 * definition may now name a control its prototype left unnamed (`scripts/check-synths.ts`); this holds every sound in
 * the catalogue to naming them, anywhere in a step's text.
 */
import { describe, expect, it } from 'vitest';
import { getSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

/**
 * The lines of these steps that print one of these control ids. Only ids with a dot count ("lfo.rate", "vco1.saw"):
 * a bare word such as "volume" is also plain English.
 */
function idLines(ids: Set<string>, steps: { why: string }[]): string[] {
  const dotted = new Set([...ids].filter((id) => id.includes('.')));
  return steps
    .flatMap((s) => s.why.split('\n'))
    .filter((line) => line.split(/[\s,:;·()]+/).some((word) => dotted.has(word)));
}

describe('lesson step text', () => {
  it('flags a line that prints a control id, wherever it stands in the line', () => {
    const ids = new Set(['lfo.rate', 'vco.pw', 'volume']);
    const why = [
      'The LFO.',
      '- lfo.rate 6 · 5.48 Hz',
      '- lfo.rate',
      '- vco.pw: 5',
      '- ENV-2 attack 3, vco.pw 5',
      '- LFO rate 6 · 5.48 Hz',
      '- Master volume 7',
      '- Listen for: a wobble.',
    ].join('\n');
    expect(idLines(ids, [{ why }])).toEqual([
      '- lfo.rate 6 · 5.48 Hz',
      '- lfo.rate',
      '- vco.pw: 5',
      '- ENV-2 attack 3, vco.pw 5',
    ]);
  });

  it('names every control it sets, in every catalogue sound', () => {
    const data = loadCatalogueData();
    let sounds = 0;
    const found: string[] = [];
    for (const file of data.sounds) {
      const def = getSynthDef(file.synth);
      if (!def) throw new Error(`no definition for ${file.synth}`);
      const ids = new Set(def.controls.map((c) => c.id));
      for (const raw of file.sounds) {
        const sound = validatePreset(def, raw);
        if (!sound.ok) throw new Error(`${file.synth}/${String(raw.id)} is not a valid sound`);
        sounds++;
        for (const line of idLines(ids, sound.value.steps))
          found.push(`${file.synth}/${sound.value.id}: ${line}`);
      }
    }
    expect(sounds).toBeGreaterThan(2000); // the whole catalogue, not an empty read
    expect(found).toEqual([]);
  });
});
