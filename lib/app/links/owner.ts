/**
 * What a link is about (`f-videos-and-links` t-179): exactly one databank instrument, library sound, databank song or
 * databank artist. Spec: `.context/app/links.md`.
 *
 * Every API names an owner by its natural key, as the rest of the app does: a databank row by its id
 * (`moog-minimoog`), a library sound by `<synthId>/<slug>` (`model-d/stacked-night-bass`). The table holds the sound's
 * row id, which survives a reseed: the catalogue seed matches a sound on its synth and slug and updates it in place
 * (`lib/app/catalogue/seed.ts`), and nothing re-creates one.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BankIdSchema } from '@/lib/app/bank/data';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/sounds/data';

export const OWNER_KINDS = ['instrument', 'sound', 'song', 'artist'] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];

/** An owner as an API names it. */
export interface OwnerRef {
  kind: OwnerKind;
  id: string;
}

/** Split a library sound's key, `<synthId>/<slug>`, or null when it is not one. */
export function splitSoundKey(key: string): { synthId: string; slug: string } | null {
  const parts = key.split('/');
  if (parts.length !== 2) return null;
  const synthId = SynthIdSchema.safeParse(parts[0]);
  const slug = SoundSlugSchema.safeParse(parts[1]);
  return synthId.success && slug.success ? { synthId: synthId.data, slug: slug.data } : null;
}

/** An owner's id has its kind's shape. */
export function validOwnerId(kind: OwnerKind, id: string): boolean {
  return kind === 'sound' ? splitSoundKey(id) !== null : BankIdSchema.safeParse(id).success;
}

export const OwnerRefSchema = z
  .object({ kind: z.enum(OWNER_KINDS), id: z.string().min(1).max(200) })
  .refine((o) => validOwnerId(o.kind, o.id), {
    message: 'Not an id of that kind: a databank id, or <synth>/<patch> for a library patch',
    path: ['id'],
  });

/** The foreign-key column a link to this owner sets, with the value: the `where` and `data` for it. */
export type OwnerColumns =
  { instrumentId: string } | { soundId: string } | { songId: string } | { artistId: string };

/**
 * The columns for an owner, after checking it exists; null when it does not. A sound is looked up by its synth and
 * slug for its row id.
 */
export async function resolveOwner(ref: OwnerRef): Promise<OwnerColumns | null> {
  switch (ref.kind) {
    case 'instrument': {
      const row = await prisma.bankInstrument.findUnique({
        where: { id: ref.id },
        select: { id: true },
      });
      return row ? { instrumentId: row.id } : null;
    }
    case 'song': {
      const row = await prisma.bankSong.findUnique({ where: { id: ref.id }, select: { id: true } });
      return row ? { songId: row.id } : null;
    }
    case 'artist': {
      const row = await prisma.bankArtist.findUnique({
        where: { id: ref.id },
        select: { id: true },
      });
      return row ? { artistId: row.id } : null;
    }
    case 'sound': {
      const key = splitSoundKey(ref.id);
      if (!key) return null;
      const row = await prisma.synthSound.findUnique({
        where: { synthId_slug: key },
        select: { id: true },
      });
      return row ? { soundId: row.id } : null;
    }
  }
}

/** What a link row includes to say what it is about. */
export const OWNER_INCLUDE = {
  instrument: { select: { id: true, name: true } },
  sound: { select: { slug: true, name: true, synthId: true } },
  song: { select: { id: true, title: true } },
  artist: { select: { id: true, name: true } },
} as const satisfies Prisma.ExternalLinkInclude;

type WithOwner = Prisma.ExternalLinkGetPayload<{ include: typeof OWNER_INCLUDE }>;

/** An owner as an API shows it: its kind, its natural key and its name. */
export interface OwnerSummary extends OwnerRef {
  name: string;
}

/** What a link row is about. Every row has exactly one owner (the table's CHECK), so the last case cannot be reached. */
export function ownerOf(row: WithOwner): OwnerSummary {
  if (row.instrument)
    return { kind: 'instrument', id: row.instrument.id, name: row.instrument.name };
  if (row.sound)
    return { kind: 'sound', id: `${row.sound.synthId}/${row.sound.slug}`, name: row.sound.name };
  if (row.song) return { kind: 'song', id: row.song.id, name: row.song.title };
  if (row.artist) return { kind: 'artist', id: row.artist.id, name: row.artist.name };
  throw new Error(`external_link ${row.id} has no owner`);
}

/** The owner column a stored row has set, with its value. Every row has exactly one (the table's CHECK). */
export function columnsOf(row: {
  id: string;
  instrumentId: string | null;
  soundId: string | null;
  songId: string | null;
  artistId: string | null;
}): OwnerColumns {
  if (row.instrumentId) return { instrumentId: row.instrumentId };
  if (row.soundId) return { soundId: row.soundId };
  if (row.songId) return { songId: row.songId };
  if (row.artistId) return { artistId: row.artistId };
  throw new Error(`external_link ${row.id} has no owner`);
}
