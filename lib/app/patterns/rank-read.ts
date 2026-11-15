/**
 * The whole public library ranked for the patch on the panel (`f-pattern-picker` t-212), server side: score the
 * features the browser's detector heard, if it sent any, and rank every public pattern against them (`rankLibrary`,
 * `lib/app/patterns/rank.ts`).
 *
 * The reads are `/suggest`'s (`suggest-read.ts`): the sound the patch started as, when there is one, and the public
 * library, kept for a minute and shared with suggestions. The library is read whatever the reading, because a silent
 * patch, or one not read yet, still gets every pattern of its category, by role and name.
 *
 * Only the patch's category is listed (t-255, `limitToCategory`): the start sound's tag while the patch is that sound
 * as it came (`asCame`), else the category the detector hears. With neither (a patch of the user's not read yet), the
 * whole library, as when no public pattern is of the category, so the picker is never empty.
 */
import { z } from 'zod';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { getSynthDef } from '@/lib/app/synths/defs';
import { kindOf } from '@/lib/app/synths/lib/soundkind';
import { rankLibrary, type RankSection } from '@/lib/app/patterns/rank';
import { SoundFeaturesSchema } from '@/lib/app/patterns/suggest';
import type { PresetCategory } from '@/lib/app/synths/contract';
import {
  limitToCategory,
  patchCategory,
  publicLibrary,
  readingOf,
  soundContext,
  type SoundReading,
} from '@/lib/app/patterns/suggest-read';

export const RankBodySchema = z.object({
  /** The synth on the panel. */
  synthId: SynthIdSchema,
  /** The library sound the patch started as, if it did: its slug on that synth. */
  sound: SoundSlugSchema.optional(),
  /** What the detector heard (`soundFeatures`), once it has. */
  features: SoundFeaturesSchema.optional(),
  /** Whether the patch is still `sound` as it came (not moved far from it): then it is listed by that sound's tag. */
  asCame: z.boolean().default(false),
});
export type RankBody = z.infer<typeof RankBodySchema>;

/** What the endpoint returns. */
export interface RankResult {
  /** What the patch sounds like, or null when it is silent or no features were sent: then nothing is ranked by fit. */
  reading: SoundReading | null;
  /**
   * The category the sections are limited to; null when nothing said one, or no pattern is of it: then every pattern
   * is listed.
   */
  category: PresetCategory | null;
  /** Every role, each with every public pattern of it and the category but the sound's own. */
  sections: RankSection[];
}

/**
 * The library ranked for these features, or null for a synth the app has no definition for, or a sound named that is
 * not on a listed synth. As with suggestions, the synth only steers the ranking: what is listed is always the public
 * library.
 */
export async function rankLibraryFor(body: RankBody): Promise<RankResult | null> {
  if (!getSynthDef(body.synthId)) return null;
  const kind = body.features ? kindOf(body.features) : null;
  // The library is read while the sound is looked up.
  const library = publicLibrary();
  const ctx = await soundContext(body.synthId, body.sound);
  if (!ctx) return null;
  const { category, views } = limitToCategory(
    await library,
    patchCategory(ctx.category, body.asCame, kind),
    ctx.exclude
  );
  return {
    reading: kind ? readingOf(kind) : null,
    category,
    sections: rankLibrary(kind, views, ctx),
  };
}
