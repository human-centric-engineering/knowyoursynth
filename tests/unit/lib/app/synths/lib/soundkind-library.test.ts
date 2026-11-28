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
 * Slow by necessity: about 80 ms of rendering a sound, so about three minutes of CPU. It sweeps on two worker threads,
 * not one a core: vitest runs other files alongside it, and a sweep across every core starved them into timeouts.
 *
 * @see scripts/soundkind-sweep.ts
 */

import { describe, it, expect } from 'vitest';

import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { PRESET_CATEGORIES } from '@/lib/app/synths/contract';
import { agreement, confusionMarkdown } from '@/lib/app/synths/lib/soundkind-fit';
import { KIND_MODEL } from '@/lib/app/synths/lib/soundkind-model';
import { sweepLibrary, sweepShard } from '@/scripts/soundkind-sweep';

/**
 * Measured 2026-11-28 over the library's 6,125 sounds: 2,792 agree (45.58%) on macOS arm64, after t-333's 17 MicroFreak
 * sounds, which came with the DFAM's and EDGE's 44 since the last measure: the 61 agree on 25 (41%). Not refit: a refit
 * read 2,778 right, fewer than the committed model. Before that, 2026-11-24 over 6,064 sounds: 2,767 agree (45.63%), after t-291 put 79 System
 * 55 sequences on the app's clock, which the probe's held notes do not run (8 of them agree, where 19 did). Before
 * that, 2026-11-21 over 6,054 sounds: 2,768 agree (45.72%), after t-301's 30
 * Model D sounds played by their mod lanes. Before that, 2026-11-20 over 6,024: 2,753 (45.70%), after t-290's 30
 * Subharmonicon patchbay sounds; 2026-11-20 over 5,994: 2,746 (45.81%); 2026-11-14
 * over 5,829 sounds: 2,693 (46.20%); t-289's 98 Subharmonicon sounds, its own sequencers, agree on 9. At an earlier measure
 * (2,998 sounds), CI's Linux x64 read one fx sound as lead: renders are seeded, but the platforms' maths can differ in
 * the last bit. So the floor is one sound below, 2,791 (45.56%).
 */
const MEASURED = 0.4556;

/** Threads for the sweep (see above). */
const SWEEP_THREADS = 2;

describe('a shard of the sweep', () => {
  it('reads every 400th sound with its category, its riff’s role and its features', () => {
    const rows = sweepShard(0, 400);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      expect(PRESET_CATEGORIES).toContain(r.category);
      expect(PATTERN_ROLES).toContain(r.role);
      expect(r.features.voices).toBeGreaterThanOrEqual(1);
    }
    expect(rows.some((r) => !r.features.silent)).toBe(true);
  });
});

describe('the sound detector over the library', () => {
  it(
    'agrees with the sounds’ own categories at least as often as when it was fitted',
    { timeout: 900_000 },
    async () => {
      const rows = await sweepLibrary(SWEEP_THREADS);
      expect(rows.length).toBeGreaterThan(2000); // the whole library, not an empty sweep
      const a = agreement(rows, KIND_MODEL);
      expect(a.agree / a.total, `agreement fell:\n${confusionMarkdown(a)}`).toBeGreaterThanOrEqual(
        MEASURED
      );
    }
  );
});
