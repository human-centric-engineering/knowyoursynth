/**
 * What the links admin reads and sends (`f-videos-and-links` t-181), shared by the server pages and the client
 * components, so it holds no component and nothing that reaches the database. Spec: `.context/app/links.md`.
 *
 * The API's answers are checked here rather than trusted: a link the browser cannot read is dropped, not cast.
 */
import { z } from 'zod';

import { LINK_KINDS, LINK_PROVIDERS, type LinkProvider } from '@/lib/app/links/providers';
// Type only: `owner.ts` holds the database client.
import type { OwnerKind, OwnerRef } from '@/lib/app/links/owner';

export const LINKS_ADMIN_PATH = '/admin/synths/links';
export const LINKS_API = '/api/v1/admin/links';

export const LINK_OWNER_KINDS = [
  'instrument',
  'sound',
  'song',
  'artist',
] as const satisfies readonly OwnerKind[];

/** What each owner kind is called on these pages. */
export const OWNER_LABEL: Record<OwnerKind, string> = {
  instrument: 'Instrument',
  sound: 'Patch',
  song: 'Record',
  artist: 'Artist',
};

export const PROVIDER_LABEL: Record<LinkProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  other: 'Web link',
};

export const AdminLinkSchema = z.object({
  id: z.string(),
  owner: z.object({ kind: z.enum(LINK_OWNER_KINDS), id: z.string(), name: z.string() }),
  url: z.string(),
  provider: z.enum(LINK_PROVIDERS),
  kind: z.enum(LINK_KINDS),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  ours: z.boolean(),
  order: z.number(),
  rating: z.number().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  statsAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminLinkView = z.infer<typeof AdminLinkSchema>;

/** A list answer, keeping each link that reads and dropping any that does not. */
export function readLinks(data: unknown): AdminLinkView[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = AdminLinkSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export const LinkSuggestionSchema = z.object({
  url: z.string(),
  provider: z.enum(LINK_PROVIDERS),
  title: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});
export type LinkSuggestionView = z.infer<typeof LinkSuggestionSchema>;

/** The query that lists one owner's links: `?instrument=moog-minimoog`, `?sound=model-d/stacked-night-bass`. */
export function ownerQuery(owner: OwnerRef): Record<string, string> {
  return { [owner.kind]: owner.id };
}

/** Where an owner is edited. */
export function ownerAdminPath(owner: OwnerRef): string {
  if (owner.kind === 'sound') {
    const [synthId, slug] = owner.id.split('/');
    return `/admin/synths/catalogue/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(slug ?? '')}`;
  }
  const tab = { instrument: 'instruments', song: 'songs', artist: 'artists' }[owner.kind];
  return `/admin/synths/bank/${tab}/${encodeURIComponent(owner.id)}`;
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** A count as a person reads it: 1.2M, 34K, 950. */
export function formatCount(n: number | null): string {
  return n === null ? '—' : COMPACT.format(n);
}
