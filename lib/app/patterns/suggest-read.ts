/**
 * Suggestions for the sound on the panel (`f-pattern-library` t-125), server side: score the features the browser's
 * detector heard, and rank the public library against them (`rankPatterns`, `lib/app/patterns/suggest.ts`).
 *
 * Two reads at most: the sound the patch started as, when there is one (its own patterns are not suggested again, and
 * the artist it is inspired by lifts researched patterns of theirs), and the library. The library is the same for
 * every caller and costs up to a second to read and work out the facts of, so it is kept, and read again behind the
 * kept copy once that is a minute old (`publicLibrary`): an admin's edit reaches suggestions at once, a catalogue
 * edit on the call after the refresh that the first call past the minute starts. The whole library's ranking
 * (`rank-read.ts`) shares the kept library, the sound's lookup and the reading.
 *
 * Both offer only patterns of the patch's category (t-255): those a library sound of that category lists, on any
 * synth (`limitToCategory`). The category is the start sound's tag while the patch is that sound as it came, and what
 * the detector hears otherwise (`patchCategory`).
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { getSynthDef } from '@/lib/app/synths/defs';
import { kindOf, type KindRegister, type SoundKind } from '@/lib/app/synths/lib/soundkind';
import type { PatternRole } from '@prisma/client';
import type { PresetCategory } from '@/lib/app/synths/contract';
import { DEFAULT_FIRST, type LibraryPatternView } from '@/lib/app/patterns/library';
import {
  listAllPublicPatterns,
  categoryOfTags,
  listPublicPatternCategories,
} from '@/lib/app/patterns/library-read';
import {
  kindSummary,
  rankPatterns,
  soundTraits,
  SoundFeaturesSchema,
  SUGGEST_DEFAULT,
  SUGGEST_MAX,
  type SuggestContext,
  type Suggestion,
} from '@/lib/app/patterns/suggest';

export const SuggestBodySchema = z.object({
  /** The synth on the panel. */
  synthId: SynthIdSchema,
  /** The library sound the patch started as, if it did: its slug on that synth. */
  sound: SoundSlugSchema.optional(),
  /** What the detector heard (`soundFeatures`). */
  features: SoundFeaturesSchema,
  /** Whether the patch is still `sound` as it came (not moved far from it): then it is limited to that sound's tag. */
  asCame: z.boolean().default(false),
  limit: z.number().int().min(1).max(SUGGEST_MAX).default(SUGGEST_DEFAULT),
});
export type SuggestBody = z.infer<typeof SuggestBodySchema>;

/** What the patch sounds like, as the endpoints say it. */
export interface SoundReading {
  category: PresetCategory;
  role: PatternRole;
  register: KindRegister;
  traits: string[];
  /** `slow attack, low register → drone, ambient`. */
  summary: string;
}

/** What the endpoint returns. */
export interface SuggestResult {
  /** What the patch sounds like, or null when it is silent: then nothing is suggested. */
  reading: SoundReading | null;
  /**
   * The category the suggestions are limited to: the start sound's tag while the patch is that sound as it came, else
   * the reading's. Null when there is no reading, or no public pattern is of the category (then the whole library).
   */
  category: PresetCategory | null;
  /** Best first, each with the pattern, so the picker reads nothing more. */
  suggestions: (Suggestion & { pattern: LibraryPatternView })[];
}

/** The public library as ranking reads it: every pattern, and the categories of the sounds that list each. */
export interface PublicLibrary {
  views: LibraryPatternView[];
  categories: ReadonlyMap<string, ReadonlySet<PresetCategory>>;
}

/** How long the kept library is fresh: after it, a call still gets it, and one fresh read starts behind it. */
export const KEEP_MS = 60_000;

interface Kept {
  at: number;
  library: Promise<PublicLibrary>;
  /** A read is on its way: the first, or one replacing this copy. No other starts meanwhile. */
  reading: boolean;
}

/**
 * The kept copy lives on `globalThis`, not in this module: `instrumentation.ts` (where the boot warm runs) and the route
 * handlers are separate module graphs, each with its own module state, so a module-level copy warmed at boot would
 * never be the one the routes read (the same reason as `lib/db/client.ts`'s stores, #1138).
 */
const store = globalThis as typeof globalThis & { kysPublicLibrary?: { kept: Kept | null } };
const holder = (store.kysPublicLibrary ??= { kept: null });

const readLibrary = (): Promise<PublicLibrary> =>
  Promise.all([listAllPublicPatterns(), listPublicPatternCategories()]).then(
    ([views, categories]) => ({ views, categories })
  );

/**
 * The public library, read once and kept (`f-pattern-prefetch` t-262). A cold read takes the best part of a second, so
 * no call waits on one after the first: once the kept copy is older than `KEEP_MS`, the call still gets it, and one
 * fresh read starts behind it and replaces it when it lands. An admin's edit (`forgetSuggestLibrary`) is seen on the
 * next call; a catalogue edit reaches the call after the refresh it starts. There is no upper bound on the kept copy's
 * age: after a quiet spell the first call is answered from it however old it is, and the refresh it starts serves the
 * next. A first read that fails is not kept; a refresh that fails keeps the copy it would have replaced, and is tried
 * again once another `KEEP_MS` has passed.
 */
export function publicLibrary(now = Date.now()): Promise<PublicLibrary> {
  const kept = holder.kept;
  if (kept) {
    if (now - kept.at >= KEEP_MS && !kept.reading) refresh(kept, now);
    return kept.library;
  }
  const started = Date.now();
  const mine: Kept = { at: now, library: readLibrary(), reading: true };
  holder.kept = mine;
  mine.library.then(
    () => {
      // Stamped when it landed, as a refresh is, so it is fresh for a whole `KEEP_MS` after.
      mine.at = now + (Date.now() - started);
      mine.reading = false;
    },
    () => {
      if (holder.kept === mine) holder.kept = null;
    }
  );
  return mine.library;
}

/**
 * `now` is the caller's clock. The new copy is stamped with it plus the time the read took, so it is fresh for a whole
 * `KEEP_MS` after it lands; a read that fails waits out `KEEP_MS` from when it failed.
 */
function refresh(old: Kept, now: number): void {
  old.reading = true;
  const started = Date.now();
  const landed = () => now + (Date.now() - started);
  readLibrary().then(
    (library) => {
      // Forgotten meanwhile (an admin's edit): the read began before it, so it is not kept.
      if (holder.kept === old)
        holder.kept = { at: landed(), library: Promise.resolve(library), reading: false };
    },
    (err: unknown) => {
      // Forgotten meanwhile: what is served now is not this copy, so there is nothing to back off or report.
      if (holder.kept !== old) return;
      // Not tried again for another `KEEP_MS`, so a database that is down is not read on every call.
      old.at = landed();
      old.reading = false;
      logger.warn('pattern suggestions: the public library could not be read again', {
        err: String(err),
      });
    }
  );
}

/** Reads the library into the kept copy, so the first ranking after the server starts does not wait on it. */
export async function warmPublicLibrary(): Promise<void> {
  await publicLibrary();
}

/**
 * The library's patterns of one category: those a sound of it lists, and the category they are of. With no category to
 * go by, or one no public pattern is of but those left out (`exclude`, the start sound's own, which ranking drops), all
 * of them and no category, so the patch is still offered the library.
 */
export function limitToCategory(
  library: PublicLibrary,
  category: PresetCategory | null,
  exclude: ReadonlySet<string> = new Set()
): { category: PresetCategory | null; views: LibraryPatternView[] } {
  if (!category) return { category: null, views: library.views };
  const views = library.views.filter((v) => library.categories.get(v.id)?.has(category));
  return views.some((v) => !exclude.has(v.id))
    ? { category, views }
    : { category: null, views: library.views };
}

/**
 * The patch's category: the start sound's tag while the patch is that sound as it came (`asCame`), else what the
 * detector hears; null with neither.
 */
export function patchCategory(
  sound: PresetCategory | null,
  asCame: boolean,
  kind: SoundKind | null
): PresetCategory | null {
  if (asCame && sound) return sound;
  return kind?.category ?? null;
}

/**
 * Forgets the kept library, so the next suggestion or ranking reads it afresh. The pattern library's admin writes call
 * it (`library-edit.ts`), and tests do. Catalogue edits don't yet: theirs reach suggestions on the call after the
 * refresh that the first call past `KEEP_MS` starts.
 */
export function forgetSuggestLibrary(): void {
  holder.kept = null;
}

/** What a reading says, for the patch on the panel. */
export function readingOf(kind: SoundKind): SoundReading {
  return {
    category: kind.category,
    role: kind.role,
    register: kind.register,
    traits: soundTraits(kind),
    summary: kindSummary(kind),
  };
}

/** Where the patch came from, as ranking needs it, and the start sound's category (its first tag), if it has one. */
export type SoundContext = SuggestContext & { category: PresetCategory | null };

/**
 * Where the patch came from, as ranking needs it: the sound's own patterns, not offered again, the artist they are
 * after, which lifts researched patterns of theirs, and the sound's category. Null for a sound that is not on a listed
 * synth.
 */
export async function soundContext(
  synthId: string,
  sound: string | undefined
): Promise<SoundContext | null> {
  let artistId: string | null = null;
  let category: PresetCategory | null = null;
  const exclude = new Set<string>();
  if (sound) {
    const found = await prisma.synthSound.findFirst({
      where: { synthId, slug: sound, synth: { listed: true } },
      select: {
        tags: true,
        patterns: {
          orderBy: DEFAULT_FIRST,
          select: {
            patternId: true,
            pattern: { select: { inspiredArtistId: true, status: true } },
          },
        },
      },
    });
    if (!found) return null;
    category = categoryOfTags(found.tags);
    for (const { patternId, pattern } of found.patterns) {
      exclude.add(patternId);
      // A disabled pattern says nothing to users, so not who the sound is after either.
      if (pattern.status === 'enabled') artistId ??= pattern.inspiredArtistId;
    }
  }
  return { synthId, artistId, exclude, category };
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
  const ctx = await soundContext(body.synthId, body.sound);
  if (!ctx) return null;
  if (!kind || !library) return { reading: null, category: null, suggestions: [] };
  // Suggestions are asked for once the patch has moved far from the sound it came as (`movedFar`), then by the category
  // heard, or at once for a start that brought no patterns of its own, by its tag while it is as it came (`asCame`), as
  // the picker's sections are.
  const { category, views } = limitToCategory(
    await library,
    patchCategory(ctx.category, body.asCame, kind),
    ctx.exclude
  );
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
    ctx,
    body.limit
  );
  return {
    reading: readingOf(kind),
    category,
    suggestions: ranked.flatMap((s) => {
      const pattern = byId.get(s.id);
      return pattern ? [{ ...s, pattern }] : [];
    }),
  };
}
