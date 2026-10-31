/**
 * Suggestions for the sound on the panel (`f-pattern-library` t-125), server side: score the features the browser's
 * detector heard, and rank the public library against them (`rankPatterns`, `lib/app/patterns/suggest.ts`).
 *
 * Two reads at most: the sound the patch started as, when there is one (its own patterns are not suggested again, and
 * the artist it is inspired by lifts researched patterns of theirs), and the library. The library is the same for
 * every caller and costs about 80 ms to read and work out the facts of, so it is kept for a minute: an admin's edit
 * reaches suggestions within that.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { getSynthDef } from '@/lib/app/synths/defs';
import { kindOf, type KindRegister } from '@/lib/app/synths/lib/soundkind';
import type { PatternRole } from '@prisma/client';
import type { PresetCategory } from '@/lib/app/synths/contract';
import { DEFAULT_FIRST, type LibraryPatternView } from '@/lib/app/patterns/library';
import { listAllPublicPatterns } from '@/lib/app/patterns/library-read';
import {
  kindSummary,
  rankPatterns,
  soundTraits,
  SoundFeaturesSchema,
  SUGGEST_DEFAULT,
  SUGGEST_MAX,
  type Suggestion,
} from '@/lib/app/patterns/suggest';

export const SuggestBodySchema = z.object({
  /** The synth on the panel. */
  synthId: SynthIdSchema,
  /** The library sound the patch started as, if it did: its slug on that synth. */
  sound: SoundSlugSchema.optional(),
  /** What the detector heard (`soundFeatures`). */
  features: SoundFeaturesSchema,
  limit: z.number().int().min(1).max(SUGGEST_MAX).default(SUGGEST_DEFAULT),
});
export type SuggestBody = z.infer<typeof SuggestBodySchema>;

/** What the endpoint returns. */
export interface SuggestResult {
  /** What the patch sounds like, or null when it is silent: then nothing is suggested. */
  reading: {
    category: PresetCategory;
    role: PatternRole;
    register: KindRegister;
    traits: string[];
    /** `slow attack, low register → held, slow melody`. */
    summary: string;
  } | null;
  /** Best first, each with the pattern, so the picker reads nothing more. */
  suggestions: (Suggestion & { pattern: LibraryPatternView })[];
}

const KEEP_MS = 60_000;
let kept: { at: number; views: Promise<LibraryPatternView[]> } | null = null;

/** The public library, read at most once a minute. A read that fails is not kept. */
function publicLibrary(now = Date.now()): Promise<LibraryPatternView[]> {
  if (kept && now - kept.at < KEEP_MS) return kept.views;
  const views = listAllPublicPatterns();
  const mine = { at: now, views };
  kept = mine;
  views.catch(() => {
    if (kept === mine) kept = null;
  });
  return views;
}

/** Forgets the kept library. For tests. */
export function forgetSuggestLibrary(): void {
  kept = null;
}

/**
 * Suggestions for these features, or null for a synth the app has no definition for, or a sound named that is not on
 * a listed synth. The synth only steers the ranking (a researched pattern of it is lifted); what is suggested is
 * always the public library, so an unlisted synth's id reads nothing that is not public.
 */
export async function suggestPatterns(body: SuggestBody): Promise<SuggestResult | null> {
  if (!getSynthDef(body.synthId)) return null;
  // The library is read while the sound is looked up; a silent patch needs neither.
  const kind = kindOf(body.features);
  const library = kind ? publicLibrary() : null;
  let artistId: string | null = null;
  const exclude = new Set<string>();
  if (body.sound) {
    const sound = await prisma.synthSound.findFirst({
      where: { synthId: body.synthId, slug: body.sound, synth: { listed: true } },
      select: {
        patterns: {
          orderBy: DEFAULT_FIRST,
          select: { patternId: true, pattern: { select: { inspiredArtistId: true } } },
        },
      },
    });
    if (!sound) return null;
    for (const { patternId, pattern } of sound.patterns) {
      exclude.add(patternId);
      artistId ??= pattern.inspiredArtistId;
    }
  }
  if (!kind || !library) return { reading: null, suggestions: [] };
  const views = await library;
  const byId = new Map(views.map((v) => [v.id, v]));
  const ranked = rankPatterns(
    kind,
    views.map((v) => ({
      id: v.id,
      name: v.name,
      role: v.role,
      fidelity: v.fidelity,
      facts: v.facts,
      inspiredBy: { artistId: v.inspiredBy.artistId, synthId: v.inspiredBy.synthId },
    })),
    { synthId: body.synthId, artistId, exclude },
    body.limit
  );
  return {
    reading: {
      category: kind.category,
      role: kind.role,
      register: kind.register,
      traits: soundTraits(kind),
      summary: kindSummary(kind),
    },
    suggestions: ranked.flatMap((s) => {
      const pattern = byId.get(s.id);
      return pattern ? [{ ...s, pattern }] : [];
    }),
  };
}
