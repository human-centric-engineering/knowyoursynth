/**
 * Users' own sounds (`f-my-sounds` s1): a panel state on one synth, named and kept under the user's account.
 *
 * **Owner-scoped.** Every read and write is keyed on the caller's user id as well as the sound's, so another user's
 * sound is indistinguishable from one that does not exist: a 404, never a 403 (`.context/auth/authorization.md`).
 *
 * **Validated on write and on read.** A panel is checked against the synth's current definition with `validateSound`
 * and refused (400) when anything in it is wrong, never repaired. On read it is checked again, against the definition
 * the app has now: a sound saved on an older definition version needs the mapping D1 requires, and until a definition
 * ships one (plan §5) such a sound is listed and kept but has no panel to play, with the reason. That is the one place
 * a mapping applies, `panelOf` below.
 *
 * **Credit.** A copy of a library sound links to it (`SetNull`) and keeps its slug, name and ref as they read when it
 * was copied. The catalogue seed and the admin never re-create a library sound (each is created once and then updated
 * by synth and slug, and nothing deletes one), so the link holds across seeds; the snapshot is what survives the
 * library sound being renamed, or a removal that does not exist yet. A copy of a sound someone shared links to it too,
 * and carries its library credit across; that credit is read live (`sharing.ts`), never kept.
 *
 * **Sharing** (`f-sharing` h1): PATCH moves a sound between private and link; only `publish.ts` makes it published.
 * Changing a published sound's name or notes runs the word check again, and its panel the unchanged-copy check.
 */
import type { Prisma, UserSound } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { sanitizeCables, sanitizeSet } from '@/lib/app/synths/lib/patch';
import { validateSound, type SoundProblem, type SoundState } from '@/lib/app/synths/validate';
import type {
  CreateUserSound,
  SharedSource,
  UpdateUserSound,
  UserSoundDetail,
  UserSoundSummary,
} from '@/lib/app/sounds/data';
import {
  assertChanged,
  assertPublishableText,
  libraryPanel,
  lockOwnersSounds,
  sharedSourcesOf,
  visibilityData,
  withFreshSlug,
} from '@/lib/app/sounds/sharing';

function refuse(message: string, problems: { path: string; message: string }[]): never {
  throw new ValidationError(message, { errors: problems });
}

const fromSoundProblems = (problems: SoundProblem[], prefix: string) =>
  problems.map((p) => ({
    path: p.path ? `${prefix}.${p.path}` : prefix,
    message: p.message,
    code: p.code,
  }));

/** A copy typed as JSON for a Prisma `Json` column. */
export const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const notFound = (): never => {
  throw new NotFoundError('Sound not found');
};

/** The synth a new sound (or a last panel, `preferences.ts`) is saved on: a listed synth the app can play. */
export async function playableSynth(synthId: string): Promise<AppSynthDef> {
  const def = getSynthDef(synthId);
  const row = def
    ? await prisma.synth.findUnique({ where: { id: synthId }, select: { listed: true } })
    : null;
  if (!def || !row?.listed)
    refuse(`${synthId} is not a synth in the catalogue`, [
      { path: 'synthId', message: `No listed synth has the id ${synthId}` },
    ]);
  return def;
}

/** A panel checked against the synth's current definition, or a 400 naming every problem. */
export function checkPanel(def: AppSynthDef, panel: unknown): SoundState {
  const result = validateSound(def, panel);
  if (!result.ok)
    refuse(`The panel does not fit ${def.id}`, fromSoundProblems(result.problems, 'panel'));
  return result.value;
}

/** As much of a stored panel as fits the synth's definition now: what the page opens for a sound that is not playable. */
const fit = (def: AppSynthDef, row: UserSound): NonNullable<UserSoundDetail['fitted']> => ({
  values: { ...def.init, ...sanitizeSet(def, row.values) },
  cables: sanitizeCables(def, row.cables),
});

/**
 * The stored panel as the synth can play it now, or why it cannot and what of it still fits. The mapping between
 * definition versions (D1) belongs here; no definition has one yet, so a sound on any other version than the current
 * one has no panel.
 */
function panelOf(
  row: UserSound,
  log: boolean
): Pick<UserSoundDetail, 'panel' | 'problems' | 'fitted'> {
  const def = getSynthDef(row.synthId);
  if (!def)
    return {
      panel: null,
      problems: [`${row.synthId} is not a synth the app can play`],
      fitted: null,
    };
  if (row.definitionVersion !== def.version)
    return {
      panel: null,
      problems: [
        `Saved on version ${row.definitionVersion} of ${row.synthId}, which is now at version ${def.version}, and there is no mapping between them`,
      ],
      fitted: fit(def, row),
    };
  const result = validateSound(def, { values: row.values, cables: row.cables });
  if (!result.ok) {
    // Logged when its owner reads one sound, not on every list or public read, so one bad row is not an error on
    // each page load.
    if (log)
      logger.error('user sounds: stored panel fails validation', {
        soundId: row.id,
        synthId: row.synthId,
        problems: result.problems,
      });
    return {
      panel: null,
      problems: result.problems.map((p) => p.message),
      fitted: fit(def, row),
    };
  }
  return { panel: result.value, problems: [], fitted: null };
}

/** The detail of rows already read, their credits read in one go. */
async function details(rows: UserSound[], log: boolean): Promise<UserSoundDetail[]> {
  const credits = await sharedSourcesOf(rows.map((r) => r.sourceUserSoundId));
  return rows.map((row) =>
    toDetail(row, row.sourceUserSoundId ? (credits.get(row.sourceUserSoundId) ?? null) : null, log)
  );
}

function toDetail(row: UserSound, basedOn: SharedSource | null, log: boolean): UserSoundDetail {
  const { panel, problems, fitted } = panelOf(row, log);
  return {
    id: row.id,
    synthId: row.synthId,
    name: row.name,
    notes: row.notes,
    definitionVersion: row.definitionVersion,
    source:
      row.sourceSlug !== null && row.sourceName !== null && row.sourceRef !== null
        ? {
            soundId: row.sourceSoundId,
            slug: row.sourceSlug,
            name: row.sourceName,
            ref: row.sourceRef,
          }
        : null,
    basedOn,
    visibility: row.visibility,
    slug: row.slug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    tags: row.tags,
    playable: panel !== null,
    panel,
    problems,
    fitted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(detail: UserSoundDetail): UserSoundSummary {
  const { panel: _panel, problems: _problems, fitted: _fitted, ...summary } = detail;
  return summary;
}

/** The caller's sounds, most recently changed first: on one synth, or on every synth. */
export async function listUserSounds(
  userId: string,
  synthId?: string
): Promise<UserSoundSummary[]> {
  const rows = await prisma.userSound.findMany({
    where: { userId, ...(synthId ? { synthId } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return (await details(rows, false)).map(toSummary);
}

/**
 * The detail of a row already read, with no log when its panel fails: what the public read serves, where anyone
 * holding the address could otherwise fill the error log by asking again.
 */
export async function quietDetail(row: UserSound): Promise<UserSoundDetail> {
  return (await details([row], false))[0];
}

/** One of the caller's sounds, or a 404 when they have none with that id. */
export async function getUserSound(userId: string, id: string): Promise<UserSoundDetail> {
  const row = await prisma.userSound.findFirst({ where: { id, userId } });
  return row ? (await details([row], true))[0] : notFound();
}

type LibraryCredit = { id: string | null; slug: string; name: string; ref: string };

/**
 * The shared sound a copy is made from: someone's link or published sound on this synth. Private, unknown and on
 * another synth are one refusal, so a copy says nothing about which. The caller's own shared sound is copied as any
 * other of theirs would be, with no credit to themselves.
 */
async function sharedCopySource(
  userId: string,
  def: AppSynthDef,
  slug: string
): Promise<{
  sourceUserSoundId: string | null;
  library: LibraryCredit | null;
  name: string;
  notes: string | null;
  panel: SoundState | null;
}> {
  const row = await prisma.userSound.findFirst({
    where: { slug, synthId: def.id, visibility: { in: ['link', 'published'] } },
  });
  if (!row)
    return refuse('That sound is not shared any more', [
      { path: 'source.shared', message: `No shared ${def.id} sound at ${slug}` },
    ]);
  const stored =
    row.definitionVersion === def.version
      ? validateSound(def, { values: row.values, cables: row.cables })
      : null;
  return {
    sourceUserSoundId: row.userId === userId ? null : row.id,
    library:
      row.sourceSlug !== null && row.sourceName !== null && row.sourceRef !== null
        ? { id: row.sourceSoundId, slug: row.sourceSlug, name: row.sourceName, ref: row.sourceRef }
        : null,
    name: row.name,
    notes: row.notes,
    panel: stored?.ok ? stored.value : null,
  };
}

/**
 * Save a new sound. A copy of a library sound records its credit; with no panel sent, the copy is that library sound
 * as it ends, every step applied, and with no name it takes the library sound's. A copy of a shared sound records the
 * sound it came from and carries its library credit; with no panel, name or notes sent it takes the shared sound's.
 */
export async function createUserSound(
  userId: string,
  input: CreateUserSound
): Promise<UserSoundDetail> {
  const def = await playableSynth(input.synthId);

  let source: LibraryCredit | null = null;
  let sourceUserSoundId: string | null = null;
  let sourceName: string | undefined;
  let notes = input.notes || null;
  let panel = input.panel ? checkPanel(def, input.panel) : null;
  if (input.source && 'shared' in input.source) {
    const shared = await sharedCopySource(userId, def, input.source.shared);
    sourceUserSoundId = shared.sourceUserSoundId;
    source = shared.library;
    sourceName = shared.name;
    if (input.notes === undefined) notes = shared.notes;
    if (!panel) {
      if (!shared.panel)
        refuse(`That sound cannot be played on ${def.id} as it is now`, [
          { path: 'source.shared', message: 'Open it, then save the panel you have' },
        ]);
      panel = shared.panel;
    }
  } else if (input.source) {
    const { slug } = input.source;
    const row = await prisma.synthSound.findUnique({
      where: { synthId_slug: { synthId: def.id, slug } },
    });
    if (!row)
      refuse(`${def.id} has no library sound ${slug}`, [
        { path: 'source.slug', message: `No library sound ${slug} on ${def.id}` },
      ]);
    source = { id: row.id, slug: row.slug, name: row.name, ref: row.ref };
    sourceName = row.name;
    if (!panel) {
      // The library sound's own panel, so it has to be one the synth can play now, as the catalogue serves it.
      const preset = libraryPanel(def, row);
      if (!preset)
        refuse(`${slug} cannot be played on ${def.id} as it is now`, [
          { path: 'source.slug', message: `${slug} is not a sound the catalogue serves` },
        ]);
      panel = preset;
    }
  }
  if (!panel) return refuse('Send the panel', [{ path: 'panel', message: 'Send the panel' }]);

  const name = input.name ?? sourceName;
  if (!name) return refuse('Name the sound', [{ path: 'name', message: 'Name the sound' }]);

  const row = await prisma.userSound.create({
    data: {
      userId,
      synthId: def.id,
      definitionVersion: def.version,
      name,
      notes,
      values: toJson(panel.values),
      cables: toJson(panel.cables),
      sourceSoundId: source?.id ?? null,
      sourceSlug: source?.slug ?? null,
      sourceName: source?.name ?? null,
      sourceRef: source?.ref ?? null,
      sourceUserSoundId,
    },
  });
  return (await details([row], true))[0];
}

/** Change one of the caller's sounds. A new panel is checked against, and saved on, the synth's current definition. */
export async function updateUserSound(
  userId: string,
  id: string,
  input: UpdateUserSound
): Promise<UserSoundDetail> {
  // The slug is minted inside the transaction, so a retry after a clash mints another.
  await withFreshSlug(() =>
    prisma.$transaction(async (tx) => {
      // Read under the owner's lock, so a publish cannot land between the checks below and this write.
      await lockOwnersSounds(tx, userId);
      const existing = await tx.userSound.findFirst({
        where: { id, userId },
        select: {
          synthId: true,
          name: true,
          notes: true,
          slug: true,
          visibility: true,
          sourceSoundId: true,
          sourceUserSoundId: true,
        },
      });
      if (!existing) return notFound();

      const data: Prisma.UserSoundUpdateManyMutationInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.notes !== undefined) data.notes = input.notes || null;
      // Still published after this change: held to what publishing is.
      const published = existing.visibility === 'published' && input.visibility === undefined;
      if (published && (input.name !== undefined || input.notes !== undefined))
        assertPublishableText({
          name: input.name ?? existing.name,
          notes: input.notes !== undefined ? input.notes || null : existing.notes,
        });
      if (input.panel !== undefined) {
        // The same rule as a new sound: a panel is only saved on a listed synth the app can play.
        const def = await playableSynth(existing.synthId);
        const panel = checkPanel(def, input.panel);
        if (published)
          await assertChanged(def, {
            panel,
            sourceSoundId: existing.sourceSoundId,
            sourceUserSoundId: existing.sourceUserSoundId,
          });
        data.values = toJson(panel.values);
        data.cables = toJson(panel.cables);
        data.definitionVersion = def.version;
      }

      // Keyed on the owner again, so a sound deleted meanwhile (a delete does not take the lock) is a 404.
      const { visibility } = input;
      const { count } = await tx.userSound.updateMany({
        where: { id, userId },
        data:
          visibility === undefined ? data : { ...data, ...visibilityData(existing, visibility) },
      });
      if (count === 0) notFound();
    })
  );
  return getUserSound(userId, id);
}

/** Delete one of the caller's sounds, or a 404 when they have none with that id. */
export async function deleteUserSound(userId: string, id: string): Promise<void> {
  const { count } = await prisma.userSound.deleteMany({ where: { id, userId } });
  if (count === 0) notFound();
}
