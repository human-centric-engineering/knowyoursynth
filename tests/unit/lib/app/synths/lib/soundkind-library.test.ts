/**
 * The sound detector over every library sound: how often the category it reads agrees with the one the sound is
 * tagged with. The figure was measured when the model was fitted (`scripts/fit-soundkind.ts`) and is recorded with
 * its confusion table in `.context/app/pattern-library.md` (The sound detector); this pins it, so a change to the
 * probe, the engine, the features or the library cannot make the detector worse without someone deciding to.
 *
 * Disagreeing is not always the detector's fault (the doc goes through which are wrong labels), so the floor is the
 * measured figure, not a target. If it falls: find out why before refitting. If the library has grown or the features
 * changed: refit, then move the floor and the doc's figures together.
 *
 * Slow by necessity: about 80 ms of rendering a sound, so about three minutes of CPU, spread over worker threads.
 *
 * @see scripts/soundkind-sweep.ts
 */

import { describe, it, expect } from 'vitest';

import { agreement, confusionMarkdown } from '@/lib/app/synths/lib/soundkind-fit';
import { KIND_MODEL } from '@/lib/app/synths/lib/soundkind-model';
import { sweepLibrary } from '@/scripts/soundkind-sweep';

/** Measured 2026-10-31 over the library's 2,293 sounds: 1,140 agree (49.72%). */
const MEASURED = 0.4971;

describe('the sound detector over the library', () => {
  it(
    'agrees with the sounds’ own categories at least as often as when it was fitted',
    { timeout: 900_000 },
    async () => {
      const rows = await sweepLibrary();
      expect(rows.length).toBeGreaterThan(2000); // the whole library, not an empty sweep
      const a = agreement(rows, KIND_MODEL);
      expect(a.agree / a.total, `agreement fell:\n${confusionMarkdown(a)}`).toBeGreaterThanOrEqual(
        MEASURED
      );
    }
  );
});
