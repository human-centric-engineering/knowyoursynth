/**
 * App subject-data export seam (GDPR Art. 15).
 *
 * **Fork-owned scaffold** — Sunrise ships this returning nothing and does NOT
 * change it after release, so your edits here merge cleanly on upgrade (the
 * stable contract is this file's `collectAppSubjectData` export, not its body).
 * Treat it like the other `lib/app/*` seams.
 *
 * Auto-wired: `exportUserData()` (`lib/privacy/export-user.ts`) calls this and
 * folds the result into the `app` section of the export bundle, so both the
 * self-service and admin export endpoints pick it up with no core edit.
 *
 * Declare every app-owned table that holds data about a person. Core covers its
 * own tables via `lib/privacy/export-sources.ts`; it cannot see yours.
 *
 * ```ts
 * export async function collectAppSubjectData({ userId }: AppSubjectQuery): Promise<AppSubjectData> {
 *   const [invoices, bookings] = await Promise.all([
 *     prisma.appInvoice.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
 *     prisma.appBooking.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
 *   ]);
 *   return { invoices, bookings };
 * }
 * ```
 *
 * **Why a plain function and not a registry.** The erasure sibling
 * (`lib/privacy/erasure-hooks.ts`) is a boot-time registry, and this seam
 * deliberately is not. Erasure fails loudly if a hook never registers — the
 * rows are still there afterwards. An export fails *silently*: an unregistered
 * collector yields a bundle that looks complete and is not, and neither the
 * subject nor the operator can tell. A static import cannot be missed.
 *
 * **Keep it complete — and core now checks that you did.** Declare your tables
 * in `initAppSubjectSources()` below. The core guard test
 * (`export-sources.test.ts`) diffs `prisma/schema/*.prisma` against the core
 * manifest so a new core table can't quietly narrow the export, and it holds
 * your tier's schema file to the same rule against your declarations: **every**
 * model in a schema file that is not one of Sunrise's own — `app.prisma`,
 * `framework-*.prisma`, or any other name you choose — must be declared as a
 * source or excluded with a reason, or the suite fails naming it.
 *
 * Full accounting, rather than the user-id heuristic core applies to itself,
 * because core reads its own column vocabulary and cannot read yours: a table
 * keyed `authorId` or `respondentId` is invisible to that scan, and the tables
 * it cannot see are exactly the ones nobody remembers. A lookup or join table
 * holding no personal data is an `excluded` row with a one-line reason — which
 * is the note a DPO wants anyway, and it costs you a line once per table.
 *
 * Full guide: .context/privacy/data-export.md · CUSTOMIZATION.md §4
 */

import { prisma } from '@/lib/db/client';
import { registerAppSubjectSources } from '@/lib/privacy/subject-source-registry';

/** Identity of the subject being exported. */
export interface AppSubjectQuery {
  /** Id of the data subject. */
  userId: string;
  /** The subject's email — for app tables keyed by address rather than user id. */
  email: string;
}

/**
 * App-owned subject data, keyed by section name. Each section lands under
 * `app.<section>` in the export bundle. Values must be JSON-serialisable.
 */
export type AppSubjectData = Record<string, unknown>;

/**
 * Declare which of your tier's models hold data about a person, and which
 * deliberately do not.
 *
 * **Fork-owned scaffold**, run once and lazily by
 * `lib/privacy/subject-source-registry.ts` before its first read — so the
 * coverage guard and the export both see your declarations with no wiring step.
 *
 * ```ts
 * export function initAppSubjectSources(): void {
 *   registerAppSubjectSources({
 *     tier: 'app',
 *     sources: [
 *       {
 *         model: 'AppInvoice',
 *         section: 'invoices',
 *         disposition: 'export',
 *         description: 'Invoices raised against your account.',
 *       },
 *     ],
 *     excluded: [
 *       { model: 'AppCountry', reason: 'Reference list of countries — holds no personal data.' },
 *     ],
 *   });
 * }
 * ```
 *
 * A framework tier declares from its own init with `tier: 'framework'`; both
 * tiers register independently, so filling this in does not consume the slot a
 * leaf fork is entitled to.
 *
 * **Every `section` you declare must appear in what `collectAppSubjectData()`
 * returns** — `exportUserData()` throws if one is missing. Return the key with
 * an empty array when the subject has no rows rather than omitting it: a bundle
 * short by a section reads exactly like a complete answer. `undefined` counts
 * as missing, because `JSON.stringify` drops the key — so
 * `rows.length ? rows : undefined` is the shape to avoid.
 */
export function initAppSubjectSources(): void {
  registerAppSubjectSources({
    tier: 'app',
    sources: [
      {
        model: 'SynthSuggestion',
        section: SUGGESTIONS_SECTION,
        disposition: 'export',
        description:
          'Synths you suggested for the databank, with what you wrote and what an admin decided.',
      },
      {
        model: 'UserSound',
        section: SOUNDS_SECTION,
        disposition: 'export',
        description:
          'Sounds you saved: the synth, the name and notes, the panel settings and cables, and the library sound each copy credits.',
      },
      {
        model: 'SynthPreference',
        section: PANELS_SECTION,
        disposition: 'export',
        description:
          'The panel you last left on each synth: the library sound and lesson step, your sound if one was open, and the settings and cables.',
      },
      {
        model: 'UserPreference',
        section: SETTINGS_SECTION,
        disposition: 'export',
        description:
          'Your synth page settings: hover help, the sound map toggles, the harmonics strip and the effects rack.',
      },
      {
        model: 'LessonProgress',
        section: PROGRESS_SECTION,
        disposition: 'export',
        description:
          'How far you got through each lesson: the library sound, the furthest step and when you finished it.',
      },
      {
        model: 'Favourite',
        section: FAVOURITES_SECTION,
        disposition: 'export',
        description: 'What you starred: synths, library sounds and your own sounds.',
      },
      {
        model: 'SynthProfile',
        section: PROFILE_SECTION,
        disposition: 'export',
        description:
          'Your synth profile: your username and when you last changed it, your links, and who can see your page.',
      },
    ],
    excluded: [
      ...CATALOGUE_MODELS.map((model) => ({ model, reason: CATALOGUE_REASON })),
      ...BANK_MODELS.map((model) => ({ model, reason: BANK_REASON })),
      {
        model: 'HeldUsername',
        reason:
          'A username given up by a change, held for 30 days so nobody else takes it. It records a name with no link to who gave it up: no user foreign key, nothing to find a subject by.',
      },
    ],
  });
}

/**
 * The databank (`f-databank`): reference facts about records, instruments, musicians and instrument designers, the same
 * for every user. Its artists and makers are people, but public figures written up from published sources, not users
 * of this app: no row has a user foreign key, and none is about a data subject of this service.
 */
export const BANK_MODELS = [
  'BankMaker',
  'BankInstrument',
  'BankInstrumentPerson',
  'BankInstrumentSynth',
  'BankArtist',
  'BankArtistMember',
  'BankArtistInstrument',
  'BankSong',
  'BankSongArtist',
  'BankSongPart',
  'BankPartInstrument',
  'BankPartSynth',
  'BankRemoval',
] as const;
const BANK_REASON =
  'Databank reference content written by the seed and by admins, the same for every user; no row is about a user of this app.';

/**
 * The catalogue (`f-model-d`): product content every user sees alike, with no column about a person. With it, the
 * seed's record of what it planned for each row (`f-catalogue-admin`), which is the same content again.
 */
export const CATALOGUE_MODELS = [
  'Synth',
  'SynthSound',
  'SynthLineage',
  'SynthNote',
  'CatalogueSeedRecord',
] as const;
const CATALOGUE_REASON =
  'Catalogue content written by the seed and by admins, the same for every user; it holds no column about a person.';

/** The export section for a user's synth suggestions (`f-databank` t-37). */
const SUGGESTIONS_SECTION = 'synthSuggestions';

/** The export section for a user's own sounds (`f-my-sounds` s1). */
const SOUNDS_SECTION = 'sounds';

/** The export sections for a user's last panels and their settings (`f-my-sounds` s3). */
const PANELS_SECTION = 'synthPanels';
const SETTINGS_SECTION = 'synthSettings';

/** The export sections for a user's lesson progress and favourites (`f-my-sounds` s4). */
const PROGRESS_SECTION = 'lessonProgress';
const FAVOURITES_SECTION = 'favourites';

/** The export section for a user's synth profile (`f-profiles` r1). */
const PROFILE_SECTION = 'synthProfile';

/**
 * Collect this app's data about one subject: the synths they suggested (`f-databank` t-37), the sounds they saved
 * (`f-my-sounds` s1), their last panels and settings (s3), their lesson progress and favourites (s4), and their synth
 * profile (`f-profiles` r1). Every declared section is returned, empty when they have none.
 */
export async function collectAppSubjectData({ userId }: AppSubjectQuery): Promise<AppSubjectData> {
  const [suggestions, sounds, panels, settings, progress, favourites, profile] = await Promise.all([
    collectSuggestions(userId),
    collectSounds(userId),
    collectPanels(userId),
    collectSettings(userId),
    collectProgress(userId),
    collectFavourites(userId),
    collectProfile(userId),
  ]);
  return {
    [SUGGESTIONS_SECTION]: suggestions,
    [SOUNDS_SECTION]: sounds,
    [PANELS_SECTION]: panels,
    [SETTINGS_SECTION]: settings,
    [PROGRESS_SECTION]: progress,
    [FAVOURITES_SECTION]: favourites,
    [PROFILE_SECTION]: profile,
  };
}

/** At most one row; a list, as every section is, so a user with none gets an empty one. */
function collectProfile(userId: string) {
  return prisma.synthProfile.findMany({
    where: { userId },
    select: {
      username: true,
      usernameChangedAt: true,
      youtube: true,
      spotify: true,
      instagram: true,
      bandcamp: true,
      public: true,
      showOwned: true,
      showWishlist: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Named by the library sound's synth and slug, which mean something outside this database; its row id does not. */
async function collectProgress(userId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      furthestStep: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      sound: { select: { synthId: true, slug: true, name: true } },
    },
  });
  return rows.map(({ sound, ...row }) => ({ ...sound, ...row }));
}

/** Each names what it stars: the synth, the library sound by synth and slug, or the user's own sound by id and name. */
async function collectFavourites(userId: string) {
  const rows = await prisma.favourite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      synthId: true,
      synthSound: { select: { synthId: true, slug: true, name: true } },
      userSound: { select: { id: true, synthId: true, name: true } },
    },
  });
  return rows.map((row) =>
    row.synthSound
      ? { kind: 'sound', ...row.synthSound, createdAt: row.createdAt }
      : row.userSound
        ? {
            kind: 'mine',
            soundId: row.userSound.id,
            synthId: row.userSound.synthId,
            name: row.userSound.name,
            createdAt: row.createdAt,
          }
        : { kind: 'synth', synthId: row.synthId, createdAt: row.createdAt }
  );
}

function collectPanels(userId: string) {
  return prisma.synthPreference.findMany({
    where: { userId },
    orderBy: { synthId: 'asc' },
    select: {
      synthId: true,
      definitionVersion: true,
      presetId: true,
      step: true,
      soundId: true,
      values: true,
      cables: true,
      updatedAt: true,
    },
  });
}

/** At most one row; a list, as every section is, so a user with none gets an empty one. */
function collectSettings(userId: string) {
  return prisma.userPreference.findMany({
    where: { userId },
    select: { tips: true, dim: true, heat: true, harm: true, fx: true, updatedAt: true },
  });
}

function collectSounds(userId: string) {
  return prisma.userSound.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      synthId: true,
      definitionVersion: true,
      name: true,
      notes: true,
      values: true,
      cables: true,
      sourceSlug: true,
      sourceName: true,
      sourceRef: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

function collectSuggestions(userId: string) {
  return prisma.synthSuggestion.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      maker: true,
      link: true,
      note: true,
      status: true,
      instrumentId: true,
      reason: true,
      decidedAt: true,
      createdAt: true,
    },
  });
}
