/**
 * Videos and links, as anyone reads them (`f-videos-and-links` t-179). Spec: `.context/app/links.md`.
 *
 * - **A databank instrument's, song's or artist's links are public**, as the databank is.
 * - **A synth's** are its databank instruments' links together (a synth models one or more; every synth has one),
 *   one per URL. **A library sound's** are its own. Both only for a listed synth: a hidden synth's page is not
 *   served, so neither are its links.
 * - **Ordered by `orderLinks`**: ours first, then a popularity-weighted draw, different on each read. So a list is
 *   never cached: the route says `no-store`.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { orderLinks } from '@/lib/app/links/order';
import {
  embedUrl,
  thumbnailFor,
  type LinkKind,
  type LinkProvider,
} from '@/lib/app/links/providers';
import { splitSoundKey, validOwnerId } from '@/lib/app/links/owner';
import { SynthIdSchema } from '@/lib/app/sounds/data';

/** A link as the public API serves it. */
export interface PublicLink {
  id: string;
  url: string;
  provider: LinkProvider;
  kind: LinkKind;
  title: string;
  thumbnailUrl: string | null;
  /** The address to load in an iframe when someone presses play; null when the link only opens in a new tab. */
  embedUrl: string | null;
  ours: boolean;
  views: number | null;
}

const PUBLIC_TARGETS = ['instrument', 'synth', 'sound', 'song', 'artist'] as const;
type PublicTarget = (typeof PUBLIC_TARGETS)[number];

/** `?instrument=` | `?synth=` | `?sound=<synth>/<patch>` | `?song=` | `?artist=`: exactly one. */
export const PublicLinkQuerySchema = z
  .object({
    instrument: z.string().max(200).optional(),
    synth: z.string().max(200).optional(),
    sound: z.string().max(200).optional(),
    song: z.string().max(200).optional(),
    artist: z.string().max(200).optional(),
  })
  .transform((q, ctx) => {
    const given = PUBLIC_TARGETS.filter((t) => q[t] !== undefined);
    if (given.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Name one of instrument, synth, sound, song or artist',
      });
      return z.NEVER;
    }
    const target = given[0];
    const id = q[target] ?? '';
    const valid =
      target === 'synth' ? SynthIdSchema.safeParse(id).success : validOwnerId(target, id);
    if (!valid) {
      ctx.addIssue({ code: 'custom', path: [target], message: 'Not an id of that kind' });
      return z.NEVER;
    }
    return { target, id };
  });
export type PublicLinkQuery = { target: PublicTarget; id: string };

/** Far above any one owner's count of its own videos, so ranks never overlap. */
const RANK_STRIDE = 1_000_000;

const PUBLIC_SELECT = {
  id: true,
  instrumentId: true,
  url: true,
  provider: true,
  providerId: true,
  kind: true,
  title: true,
  thumbnailUrl: true,
  ours: true,
  order: true,
  rating: true,
  views: true,
  createdAt: true,
} as const satisfies Prisma.ExternalLinkSelect;

type PublicRow = Prisma.ExternalLinkGetPayload<{ select: typeof PUBLIC_SELECT }>;

/**
 * The `where` for a target's links, or null when it is not served (a hidden synth, a sound that is not there). A
 * synth's also carries its instruments' rank, so each instrument's own videos stay together in that instrument's
 * order (each numbers its own from 0).
 */
async function whereFor(
  query: PublicLinkQuery
): Promise<{ where: Prisma.ExternalLinkWhereInput; rank?: Map<string, number> } | null> {
  switch (query.target) {
    case 'instrument':
      return { where: { instrumentId: query.id } };
    case 'song':
      return { where: { songId: query.id } };
    case 'artist':
      return { where: { artistId: query.id } };
    case 'synth': {
      const synth = await prisma.synth.findFirst({
        where: { id: query.id, listed: true },
        select: {
          bankInstruments: { select: { instrumentId: true }, orderBy: { instrumentId: 'asc' } },
        },
      });
      if (!synth) return null;
      const ids = synth.bankInstruments.map((i) => i.instrumentId);
      return { where: { instrumentId: { in: ids } }, rank: new Map(ids.map((id, i) => [id, i])) };
    }
    case 'sound': {
      const key = splitSoundKey(query.id);
      if (!key) return null;
      const sound = await prisma.synthSound.findFirst({
        where: { synthId: key.synthId, slug: key.slug, synth: { listed: true } },
        select: { id: true },
      });
      return sound ? { where: { soundId: sound.id } } : null;
    }
  }
}

/** One per URL: our copy when there is one, else the oldest. */
function onePerUrl(rows: PublicRow[]): PublicRow[] {
  const byUrl = new Map<string, PublicRow>();
  for (const row of rows) {
    const kept = byUrl.get(row.url);
    if (
      !kept ||
      (row.ours && !kept.ours) ||
      (row.ours === kept.ours && row.createdAt < kept.createdAt)
    )
      byUrl.set(row.url, row);
  }
  return [...byUrl.values()];
}

function toPublicLink(row: PublicRow): PublicLink {
  return {
    id: row.id,
    url: row.url,
    provider: row.provider,
    kind: row.kind,
    title: row.title,
    thumbnailUrl: thumbnailFor(row.provider, row.providerId, row.thumbnailUrl),
    embedUrl: embedUrl(row.provider, row.providerId),
    ours: row.ours,
    views: row.views,
  };
}

/** A target's links in the order to show them. An unknown or unserved target has none. */
export async function listPublicLinks(
  query: PublicLinkQuery,
  random: () => number = Math.random
): Promise<PublicLink[]> {
  const target = await whereFor(query);
  if (!target) return [];
  const rows = await prisma.externalLink.findMany({
    where: target.where,
    select: PUBLIC_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const { rank } = target;
  // Across a synth's instruments, an instrument's own videos sort after the instrument before it, never interleaved.
  const ranked = rank
    ? onePerUrl(rows).map((row) => ({
        ...row,
        order: (rank.get(row.instrumentId ?? '') ?? 0) * RANK_STRIDE + row.order,
      }))
    : onePerUrl(rows);
  return orderLinks(ranked, random).map(toPublicLink);
}
