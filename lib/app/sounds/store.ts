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
 * library sound being renamed, or a removal that does not exist yet.
 */
import type { Prisma, UserSound } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import {
  validatePreset,
  validateSound,
  type SoundProblem,
  type SoundState,
} from '@/lib/app/synths/validate';
import type {
  CreateUserSound,
  UpdateUserSound,
  UserSoundDetail,
  UserSoundSummary,
} from '@/lib/app/sounds/data';

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
const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const notFound = (): never => {
  throw new NotFoundError('Sound not found');
};

/** The synth a new sound is saved on: a listed synth the app can play. */
async function playableSynth(synthId: string): Promise<AppSynthDef> {
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
function checkPanel(def: AppSynthDef, panel: unknown): SoundState {
  const result = validateSound(def, panel);
  if (!result.ok)
    refuse(`The panel does not fit ${def.id}`, fromSoundProblems(result.problems, 'panel'));
  return result.value;
}

/**
 * The stored panel as the synth can play it now, or why it cannot. The mapping between definition versions (D1)
 * belongs here; no definition has one yet, so a sound on any other version than the current one has no panel.
 */
function panelOf(row: UserSound, log: boolean): Pick<UserSoundDetail, 'panel' | 'problems'> {
  const def = getSynthDef(row.synthId);
  if (!def) return { panel: null, problems: [`${row.synthId} is not a synth the app can play`] };
  if (row.definitionVersion !== def.version)
    return {
      panel: null,
      problems: [
        `Saved on version ${row.definitionVersion} of ${row.synthId}, which is now at version ${def.version}, and there is no mapping between them`,
      ],
    };
  const result = validateSound(def, { values: row.values, cables: row.cables });
  if (!result.ok) {
    // Logged when one sound is read, not on every list, so one bad row is not an error on each page load.
    if (log)
      logger.error('user sounds: stored panel fails validation', {
        soundId: row.id,
        synthId: row.synthId,
        problems: result.problems,
      });
    return { panel: null, problems: result.problems.map((p) => p.message) };
  }
  return { panel: result.value, problems: [] };
}

function toDetail(row: UserSound, log = true): UserSoundDetail {
  const { panel, problems } = panelOf(row, log);
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
    playable: panel !== null,
    panel,
    problems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: UserSound): UserSoundSummary {
  const { panel: _panel, problems: _problems, ...summary } = toDetail(row, false);
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
  return rows.map(toSummary);
}

/** One of the caller's sounds, or a 404 when they have none with that id. */
export async function getUserSound(userId: string, id: string): Promise<UserSoundDetail> {
  const row = await prisma.userSound.findFirst({ where: { id, userId } });
  return row ? toDetail(row) : notFound();
}

/**
 * Save a new sound. A copy of a library sound records its credit; with no panel sent, the copy is that library sound
 * as it ends, every step applied, and with no name it takes the library sound's.
 */
export async function createUserSound(
  userId: string,
  input: CreateUserSound
): Promise<UserSoundDetail> {
  const def = await playableSynth(input.synthId);

  let source: { id: string; slug: string; name: string; ref: string } | null = null;
  let panel = input.panel ? checkPanel(def, input.panel) : null;
  if (input.source) {
    const { slug } = input.source;
    const row = await prisma.synthSound.findUnique({
      where: { synthId_slug: { synthId: def.id, slug } },
    });
    if (!row)
      refuse(`${def.id} has no library sound ${slug}`, [
        { path: 'source.slug', message: `No library sound ${slug} on ${def.id}` },
      ]);
    source = { id: row.id, slug: row.slug, name: row.name, ref: row.ref };
    if (!panel) {
      // The library sound's own panel, so it has to be one the synth can play now, as the catalogue serves it.
      const preset =
        row.definitionVersion === def.version
          ? validatePreset(def, {
              id: row.slug,
              name: row.name,
              ref: row.ref,
              artist: row.artist,
              tags: row.tags,
              level: row.level,
              blurb: row.blurb,
              how: row.how,
              phrase: row.phrase,
              steps: row.steps,
              context: row.context,
              tweaks: row.tweaks,
            })
          : null;
      if (!preset?.ok)
        refuse(`${slug} cannot be played on ${def.id} as it is now`, [
          { path: 'source.slug', message: `${slug} is not a sound the catalogue serves` },
        ]);
      const state = presetState(def, preset.value);
      panel = { values: state.values, cables: state.cables.map((c) => [c.from, c.to]) };
    }
  }
  if (!panel) return refuse('Send the panel', [{ path: 'panel', message: 'Send the panel' }]);

  const name = input.name ?? source?.name;
  if (!name) return refuse('Name the sound', [{ path: 'name', message: 'Name the sound' }]);

  const row = await prisma.userSound.create({
    data: {
      userId,
      synthId: def.id,
      definitionVersion: def.version,
      name,
      notes: input.notes || null,
      values: toJson(panel.values),
      cables: toJson(panel.cables),
      sourceSoundId: source?.id ?? null,
      sourceSlug: source?.slug ?? null,
      sourceName: source?.name ?? null,
      sourceRef: source?.ref ?? null,
    },
  });
  return toDetail(row);
}

/** Change one of the caller's sounds. A new panel is checked against, and saved on, the synth's current definition. */
export async function updateUserSound(
  userId: string,
  id: string,
  input: UpdateUserSound
): Promise<UserSoundDetail> {
  const existing = await prisma.userSound.findFirst({
    where: { id, userId },
    select: { synthId: true },
  });
  if (!existing) return notFound();

  const data: Prisma.UserSoundUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.panel !== undefined) {
    // The same rule as a new sound: a panel is only saved on a listed synth the app can play.
    const def = await playableSynth(existing.synthId);
    const panel = checkPanel(def, input.panel);
    data.values = toJson(panel.values);
    data.cables = toJson(panel.cables);
    data.definitionVersion = def.version;
  }

  // Keyed on the owner again, so a sound deleted meanwhile is a 404 rather than a write to nothing.
  const { count } = await prisma.userSound.updateMany({ where: { id, userId }, data });
  if (count === 0) return notFound();
  return getUserSound(userId, id);
}

/** Delete one of the caller's sounds, or a 404 when they have none with that id. */
export async function deleteUserSound(userId: string, id: string): Promise<void> {
  const { count } = await prisma.userSound.deleteMany({ where: { id, userId } });
  if (count === 0) notFound();
}
