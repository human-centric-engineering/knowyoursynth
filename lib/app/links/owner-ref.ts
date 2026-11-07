/**
 * What a link is about, as the APIs name it (`f-videos-and-links` t-179): an owner kind and its natural key. Shapes
 * only, with no database client, so a form can validate with them. Looking an owner up is `owner.ts`.
 */
import { z } from 'zod';
import { BankIdSchema } from '@/lib/app/bank/data';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/sounds/data';

export const OWNER_KINDS = ['instrument', 'sound', 'song', 'artist'] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];

/** The `external_link` column that names an owner of each kind. A new kind means a new column (`links.md`). */
export const OWNER_COLUMN = {
  instrument: 'instrumentId',
  sound: 'soundId',
  song: 'songId',
  artist: 'artistId',
} as const satisfies Record<OwnerKind, string>;

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
