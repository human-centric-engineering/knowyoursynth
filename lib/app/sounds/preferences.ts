/**
 * A signed-in user's settings and last panel on each synth (`f-my-sounds` s3), kept under their account so they follow
 * the user to another device. Signed out, the page keeps both in browser storage, as it always has.
 *
 * **Owner-scoped by construction.** Every row is keyed on the caller's user id, and there is no way to name another
 * user's.
 *
 * **A last panel is checked on write and fitted on read.** On write it is checked against the synth's current
 * definition with `validateSound`, the same as a saved sound, and refused (400) when anything in it is wrong. On read
 * it is fitted to the definition the app has now, as the page fits the panel it kept in storage
 * (`components/app/synth/storage.ts`): it is only where the user left off, so a panel from an older definition opens
 * with what still fits rather than not at all.
 */
import type { SynthPreference, UserPreference } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getSynthDef } from '@/lib/app/synths/defs';
import { normalizeFx } from '@/lib/app/synths/audio/fx';
import { sanitizeCables, sanitizeSet } from '@/lib/app/synths/lib/patch';
import { checkPanel, playableSynth, toJson } from '@/lib/app/sounds/store';
import type {
  AccountSettings,
  PanelPref,
  PanelPrefInput,
  SettingsPatch,
} from '@/lib/app/sounds/preference-data';

function toSettings(row: UserPreference | null): AccountSettings {
  return {
    tips: row?.tips ?? null,
    dim: row?.dim ?? null,
    heat: row?.heat ?? null,
    harm: row?.harm ?? null,
    // Checked field by field on the way out, as the page checks the browser's copy.
    fx: row?.fx == null ? null : normalizeFx(row.fx),
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
}

/** The caller's settings; every one `null` when they have none yet. */
export async function getSettings(userId: string): Promise<AccountSettings> {
  return toSettings(await prisma.userPreference.findUnique({ where: { userId } }));
}

/** Change the settings named in `patch`, leaving the rest as they are. */
export async function updateSettings(
  userId: string,
  patch: SettingsPatch
): Promise<AccountSettings> {
  const data = {
    ...(patch.tips !== undefined && { tips: patch.tips }),
    ...(patch.dim !== undefined && { dim: patch.dim }),
    ...(patch.heat !== undefined && { heat: patch.heat }),
    ...(patch.harm !== undefined && { harm: patch.harm }),
    ...(patch.fx !== undefined && { fx: toJson(patch.fx) }),
  };
  const row = await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toSettings(row);
}

function toPanelPref(row: SynthPreference): PanelPref | null {
  const def = getSynthDef(row.synthId);
  if (!def) return null;
  return {
    synthId: row.synthId,
    presetId: row.presetId,
    step: row.step,
    soundId: row.soundId,
    values: { ...def.init, ...sanitizeSet(def, row.values) },
    cables: sanitizeCables(def, row.cables),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The caller's last panel on one synth, or `null` when they have none there (or the app no longer plays it). */
export async function getPanelPref(userId: string, synthId: string): Promise<PanelPref | null> {
  const row = await prisma.synthPreference.findUnique({
    where: { userId_synthId: { userId, synthId } },
  });
  return row ? toPanelPref(row) : null;
}

/**
 * Keep the caller's panel on one synth, replacing the last one. Only a listed synth the app can play has one. A sound
 * that is not the caller's is not kept with it: a browser shared with another user can hold theirs.
 */
export async function putPanelPref(
  userId: string,
  synthId: string,
  input: PanelPrefInput
): Promise<PanelPref> {
  const [def, own] = await Promise.all([
    playableSynth(synthId),
    input.soundId === null
      ? null
      : prisma.userSound.findFirst({ where: { id: input.soundId, userId }, select: { id: true } }),
  ]);
  const panel = checkPanel(def, input.panel);
  const data = {
    definitionVersion: def.version,
    presetId: input.presetId,
    step: input.step,
    soundId: own?.id ?? null,
    values: toJson(panel.values),
    cables: toJson(panel.cables),
  };
  const row = await prisma.synthPreference.upsert({
    where: { userId_synthId: { userId, synthId: def.id } },
    create: { userId, synthId: def.id, ...data },
    update: data,
  });
  // A synth `playableSynth` accepted is one the app plays, so this is never null.
  const pref = toPanelPref(row);
  if (!pref) throw new Error(`No definition for ${row.synthId}`);
  return pref;
}
