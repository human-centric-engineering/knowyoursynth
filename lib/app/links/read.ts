/**
 * Videos and links, as anyone reads them (`f-videos-and-links` t-179). Spec: `.context/app/links.md`.
 *
 * - **A databank instrument's, song's or artist's links are public**, as the databank is.
 * - **A synth's** are its databank instruments' links together (a synth models one or more; every synth has one),
 *   one per URL. **A library sound's** are its own, then its inspiration's (t-183): the song and artist its default
 *   library pattern is inspired by, each marked with where it came from (`via`). Both only for a listed synth: a
 *   hidden synth's page is not served, so neither are its links.
 * - **Ordered by `orderLinks`**: ours first, then a popularity-weighted draw, different on each read. So a list is
 *   never cached: the route says `no-store`. A sound's own are ordered, then its inspiration's after them.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { orderLinks } from '@/lib/app/links/order';
import {
  embedUrl,
  LINK_KINDS,
  thumbnailFor,
  type LinkKind,
  type LinkProvider,
} from '@/lib/app/links/providers';
import { splitSoundKey, validOwnerId } from '@/lib/app/links/owner';
import { DEFAULT_FIRST, headOf } from '@/lib/app/patterns/library';
import { SynthIdSchema } from '@/lib/app/sounds/data';

/** Where a link on a library sound's list came from when it is not the sound's own: its inspiration (t-183). */
export interface LinkVia {
  kind: 'song' | 'artist';
  /** The databank id: the song's or artist's `/bank` page. */
  id: string;
  /** The song's title or the artist's name. */
  name: string;
}

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
  /** On a library sound's list, the song or artist this one is about; null for the target's own. */
  via: LinkVia | null;
}

/** What a section says before it is opened: how many links there are, and of which kinds. */
export interface LinkSummary {
  count: number;
  /** The kinds among them, in `LINK_KINDS` order. */
  kinds: LinkKind[];
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

/** The owner columns a list is split and ranked on. */
const OWNER_SELECT = {
  instrumentId: true,
  soundId: true,
  songId: true,
  artistId: true,
} as const satisfies Prisma.ExternalLinkSelect;

const PUBLIC_SELECT = {
  id: true,
  ...OWNER_SELECT,
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

const SUMMARY_SELECT = {
  ...OWNER_SELECT,
  url: true,
  ours: true,
  createdAt: true,
  kind: true,
} as const satisfies Prisma.ExternalLinkSelect;

type PublicRow = Prisma.ExternalLinkGetPayload<{ select: typeof PUBLIC_SELECT }>;
type OwnerCols = Prisma.ExternalLinkGetPayload<{ select: typeof OWNER_SELECT }>;

/** A library sound and what its default library pattern is inspired by: where its inherited links come from. */
interface SoundSource {
  id: string;
  slug: string;
  song: { id: string; name: string } | null;
  artist: { id: string; name: string } | null;
}

const SOUND_SOURCE_SELECT = {
  id: true,
  slug: true,
  patterns: {
    orderBy: DEFAULT_FIRST,
    select: {
      pattern: {
        select: {
          status: true,
          pattern: true,
          inspiredSong: { select: { id: true, title: true } },
          inspiredArtist: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const satisfies Prisma.SynthSoundSelect;

/**
 * Library sounds with their inspiration: the song and artist of the pattern its riff plays (`headOf`, the default).
 * A sound whose default is inspired by a genre or a synth, or that has no default, inherits nothing.
 */
async function soundSources(where: Prisma.SynthSoundWhereInput): Promise<SoundSource[]> {
  const rows = await prisma.synthSound.findMany({ where, select: SOUND_SOURCE_SELECT });
  return rows.map((row) => {
    const head = headOf(row.patterns)?.pattern;
    const song = head?.inspiredSong;
    return {
      id: row.id,
      slug: row.slug,
      song: song ? { id: song.id, name: song.title } : null,
      artist: head?.inspiredArtist ?? null,
    };
  });
}

/** The `where` for a sound's links: its own, and its inspiration's. */
function soundWhere(source: SoundSource): Prisma.ExternalLinkWhereInput {
  return {
    OR: [
      { soundId: source.id },
      ...(source.song ? [{ songId: source.song.id }] : []),
      ...(source.artist ? [{ artistId: source.artist.id }] : []),
    ],
  };
}

/** A row on a sound's list is its own, or from the song or artist it inherits. */
function belongsTo(source: SoundSource, row: OwnerCols): boolean {
  return (
    row.soundId === source.id ||
    (source.song !== null && row.songId === source.song.id) ||
    (source.artist !== null && row.artistId === source.artist.id)
  );
}

/** What a target's list is read from. */
interface Served {
  where: Prisma.ExternalLinkWhereInput;
  /**
   * Which run a row's own videos sort in, when the list joins several owners': each owner numbers its own from 0, so
   * each keeps its own together, in its own order.
   */
  rankOf?: (row: OwnerCols) => number;
  /** A library sound's: whose links it inherits. */
  sound?: SoundSource;
}

/** The target's list, or null when it is not served (a hidden synth, a sound that is not there). */
async function whereFor(query: PublicLinkQuery): Promise<Served | null> {
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
      const rank = new Map(ids.map((id, i) => [id, i]));
      return {
        where: { instrumentId: { in: ids } },
        rankOf: (row) => rank.get(row.instrumentId ?? '') ?? 0,
      };
    }
    case 'sound': {
      const key = splitSoundKey(query.id);
      if (!key) return null;
      const [sound] = await soundSources({
        synthId: key.synthId,
        slug: key.slug,
        synth: { listed: true },
      });
      if (!sound) return null;
      // The song's own videos before the artist's; the sound's own are a list of their own.
      return { where: soundWhere(sound), rankOf: (row) => (row.artistId ? 1 : 0), sound };
    }
  }
}

/** One per URL: our copy when there is one, else the oldest. */
function onePerUrl<Row extends { url: string; ours: boolean; createdAt: Date }>(
  rows: Row[]
): Row[] {
  const byUrl = new Map<string, Row>();
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

/**
 * A target's rows as they are shown, one per URL: its own, and, for a library sound, what its inspiration has that it
 * does not. A URL the sound has too is the sound's.
 */
function shown<Row extends OwnerCols & { url: string; ours: boolean; createdAt: Date }>(
  rows: Row[],
  sound?: SoundSource
): { own: Row[]; inherited: Row[] } {
  if (!sound) return { own: onePerUrl(rows), inherited: [] };
  const own = onePerUrl(rows.filter((row) => row.soundId === sound.id));
  const urls = new Set(own.map((row) => row.url));
  const inherited = onePerUrl(rows.filter((row) => row.soundId !== sound.id && !urls.has(row.url)));
  return { own, inherited };
}

function viaOf(row: OwnerCols, sound: SoundSource | undefined): LinkVia | null {
  if (!sound || row.soundId === sound.id) return null;
  if (sound.song && row.songId === sound.song.id) return { kind: 'song', ...sound.song };
  if (sound.artist && row.artistId === sound.artist.id) return { kind: 'artist', ...sound.artist };
  return null;
}

function toPublicLink(row: PublicRow, via: LinkVia | null): PublicLink {
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
    via,
  };
}

function summaryOf(rows: { kind: LinkKind }[]): LinkSummary {
  return {
    count: rows.length,
    kinds: LINK_KINDS.filter((kind) => rows.some((row) => row.kind === kind)),
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
  const { rankOf, sound } = target;
  // Across several owners, an owner's own videos sort after the owner's before it, never interleaved.
  const ranked = (list: PublicRow[]) =>
    rankOf ? list.map((row) => ({ ...row, order: rankOf(row) * RANK_STRIDE + row.order })) : list;
  const { own, inherited } = shown(rows, sound);
  return [...orderLinks(ranked(own), random), ...orderLinks(ranked(inherited), random)].map((row) =>
    toPublicLink(row, viaOf(row, sound))
  );
}

/**
 * How many links a target has, and of which kinds: the same links `listPublicLinks` would list (one per URL, none for
 * a target it does not serve), without ordering them.
 */
export async function summarisePublicLinks(query: PublicLinkQuery): Promise<LinkSummary> {
  const target = await whereFor(query);
  if (!target) return { count: 0, kinds: [] };
  // Only what `shown` and the count read: this runs on every synth and instrument page render.
  const { own, inherited } = shown(
    await prisma.externalLink.findMany({ where: target.where, select: SUMMARY_SELECT }),
    target.sound
  );
  return summaryOf([...own, ...inherited]);
}

/**
 * Each library sound's links on a listed synth, counted as `summarisePublicLinks` counts one (its own and its
 * inspiration's), by slug. Only sounds with at least one are in it. Two reads, however many sounds: the synth page asks
 * for every sound at once.
 */
export async function summariseSoundLinks(synthId: string): Promise<Record<string, LinkSummary>> {
  const sources = await soundSources({ synthId, synth: { listed: true } });
  if (!sources.length) return {};
  const songs = [...new Set(sources.flatMap((s) => (s.song ? [s.song.id] : [])))];
  const artists = [...new Set(sources.flatMap((s) => (s.artist ? [s.artist.id] : [])))];
  const rows = await prisma.externalLink.findMany({
    where: {
      OR: [
        { soundId: { in: sources.map((s) => s.id) } },
        ...(songs.length ? [{ songId: { in: songs } }] : []),
        ...(artists.length ? [{ artistId: { in: artists } }] : []),
      ],
    },
    select: SUMMARY_SELECT,
  });
  const out: Record<string, LinkSummary> = {};
  for (const source of sources) {
    const { own, inherited } = shown(
      rows.filter((row) => belongsTo(source, row)),
      source
    );
    if (own.length + inherited.length) out[source.slug] = summaryOf([...own, ...inherited]);
  }
  return out;
}

/** Databank songs' links, counted, by song id: one read for a whole "Heard on" list. Only songs with any are in it. */
export async function summariseSongLinks(songIds: string[]): Promise<Map<string, LinkSummary>> {
  const out = new Map<string, LinkSummary>();
  if (!songIds.length) return out;
  const rows = await prisma.externalLink.findMany({
    where: { songId: { in: songIds } },
    select: SUMMARY_SELECT,
  });
  for (const id of songIds) {
    const mine = onePerUrl(rows.filter((row) => row.songId === id));
    if (mine.length) out.set(id, summaryOf(mine));
  }
  return out;
}
