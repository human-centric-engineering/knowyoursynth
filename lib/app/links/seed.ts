/**
 * Write the videos and links seed data into `external_link` (`f-videos-and-links` t-199). Spec: `.context/app/links.md`
 * (Seeded links).
 *
 * Called by the seed unit `prisma/seeds/app-knowyoursynth/006-links.ts`, which reads the data files and passes them in,
 * after the catalogue and databank units have written the owners. The rules, each tested:
 *
 * - **Checked before anything is written.** Every URL must parse to itself (`parseLinkUrl`), once per owner, with a
 *   valid kind and title. One problem anywhere and the seed throws with the whole list, having written nothing.
 * - **Create only.** A link its owner already has (the owner and the canonical URL, the table's unique key) is left
 *   exactly as it is: an admin's title, kind, ours, order and rating, and YouTube's counts, are never overwritten.
 * - **Never deletes.** A link the data does not list stays, so an admin's own links and a partial source are safe.
 * - **Reads nothing from providers.** The title comes from the data; a YouTube picture is derived from its id when
 *   shown (`thumbnailFor`), and the daily `app:refresh-link-stats` job fills view counts. So a seed runs offline.
 * - **An owner the database does not have is skipped and reported**, not thrown: a databank row an admin removed
 *   should not stop the rest.
 *
 * Accepted cost (journal, 2026-11-07): a seeded link an admin deletes comes back when the unit next re-runs. To
 * remove one for good, delete it in dev and re-export (`npm run links:export`), which drops it from the data.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  isBandcampId,
  LINK_KINDS,
  parseLinkUrl,
  safeThumbnailUrl,
} from '@/lib/app/links/providers';
import {
  splitSoundKey,
  validOwnerId,
  type OwnerKind,
  type OwnerRef,
} from '@/lib/app/links/owner-ref';

/** One link in a data file. What an admin sets, and what a URL cannot say for itself. */
export const SeedLinkSchema = z
  .object({
    url: z.string().min(1).max(2000),
    kind: z.enum(LINK_KINDS),
    title: z.string().trim().min(1).max(200),
    ours: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    /** Bandcamp's embed id (`album=<n>` / `track=<n>`), which is on its page, not in its URL. */
    providerId: z.string().min(1).max(200).optional(),
    /** A picture read from a provider other than YouTube, whose is derived from its id. */
    thumbnailUrl: z.string().min(1).max(2000).optional(),
  })
  .strict();
export type SeedLink = z.infer<typeof SeedLinkSchema>;

/** A data file: one owner's links. */
export const LinkSeedFileSchema = z.array(SeedLinkSchema);

/** The seed data: every owner's links. */
export type LinkSeedData = { owner: OwnerRef; links: SeedLink[] }[];

/** The data does not check. Nothing was written. */
export class LinkDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`The links seed data has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'LinkDataError';
  }
}

/** What one run did. */
export interface LinkSeedReport {
  created: number;
  /** Links their owner already had, left as they are. */
  existing: number;
  /** Owners the database does not have, as `<kind>:<id>`, whose links were skipped. */
  missingOwners: string[];
}

const ownerKey = (o: OwnerRef): string => `${o.kind}:${o.id}`;

/** A stored link, as the columns the export reads. */
export interface StoredLink {
  url: string;
  provider: string;
  providerId: string | null;
  kind: SeedLink['kind'];
  title: string;
  thumbnailUrl: string | null;
  ours: boolean;
  order: number;
  rating: number | null;
}

/**
 * A stored link as its data file holds it: what an admin set, with each default left out so a file reads as the
 * links in it. A provider id and a picture are kept only where the URL cannot give them back (`SeedLinkSchema`).
 */
export function toSeedLink(row: StoredLink): z.input<typeof SeedLinkSchema> {
  return {
    url: row.url,
    kind: row.kind,
    title: row.title,
    ...(row.ours ? { ours: true } : {}),
    ...(row.order !== 0 ? { order: row.order } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    ...(row.provider === 'bandcamp' && row.providerId ? { providerId: row.providerId } : {}),
    ...(row.provider !== 'youtube' && row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}),
  };
}

/** One owner's links, as its data file holds them. */
export interface LinkFile {
  owner: OwnerRef;
  links: z.input<typeof SeedLinkSchema>[];
}

/**
 * The data files a table's links make (`npm run links:export`): one per owner, in the order each owner's links come in
 * (the export reads them oldest first). Throws, as the seed would, on data the seed would refuse, so a bad table
 * never replaces good data.
 */
export function exportLinkData(rows: (StoredLink & { owner: OwnerRef })[]): LinkFile[] {
  const files = new Map<string, LinkFile>();
  for (const row of rows) {
    const key = ownerKey(row.owner);
    const file = files.get(key) ?? { owner: { kind: row.owner.kind, id: row.owner.id }, links: [] };
    file.links.push(toSeedLink(row));
    files.set(key, file);
  }
  const out = [...files.values()];
  const problems: string[] = [];
  const data: LinkSeedData = [];
  for (const { owner, links } of out) {
    const parsed = LinkSeedFileSchema.safeParse(links);
    if (parsed.success) data.push({ owner, links: parsed.data });
    else problems.push(`${ownerKey(owner)}: ${parsed.error.message}`);
  }
  problems.push(...checkLinkData(data));
  if (problems.length) throw new LinkDataError(problems);
  return out;
}

/** Every problem in the data. Pure: the seed runs it first, and the data test over the committed files. */
export function checkLinkData(data: LinkSeedData): string[] {
  const problems: string[] = [];
  const owners = new Set<string>();
  for (const { owner, links } of data) {
    const at = ownerKey(owner);
    if (!validOwnerId(owner.kind, owner.id)) problems.push(`${at}: not an id of that kind`);
    if (owners.has(at)) problems.push(`${at}: listed twice`);
    owners.add(at);
    const urls = new Set<string>();
    for (const link of links) {
      const parsed = parseLinkUrl(link.url);
      if (!parsed.ok) {
        problems.push(`${at}: ${link.url}: ${parsed.problem}`);
        continue;
      }
      if (parsed.link.url !== link.url)
        problems.push(`${at}: ${link.url} is stored as ${parsed.link.url}`);
      if (urls.has(parsed.link.url)) problems.push(`${at}: ${link.url} listed twice`);
      urls.add(parsed.link.url);
      if (link.providerId !== undefined && parsed.link.provider !== 'bandcamp')
        problems.push(`${at}: ${link.url}: only a Bandcamp link carries its provider id`);
      if (link.providerId !== undefined && !isBandcampId(link.providerId))
        problems.push(`${at}: ${link.url}: not a Bandcamp embed id: ${link.providerId}`);
      if (
        link.thumbnailUrl !== undefined &&
        (parsed.link.provider === 'youtube' ||
          safeThumbnailUrl(parsed.link.provider, link.thumbnailUrl) !== link.thumbnailUrl)
      )
        problems.push(`${at}: ${link.url}: a picture not on its provider's image hosts`);
    }
  }
  return problems;
}

type OwnerColumn = 'instrumentId' | 'soundId' | 'songId' | 'artistId';
const OWNER_COLUMN: Record<OwnerKind, OwnerColumn> = {
  instrument: 'instrumentId',
  sound: 'soundId',
  song: 'songId',
  artist: 'artistId',
};

/** Each owner the database has, by `<kind>:<id>`, mapped to its row id (a sound's is its `SynthSound.id`). */
async function ownerRows(prisma: TenancyClient, owners: OwnerRef[]): Promise<Map<string, string>> {
  const ids = (kind: OwnerKind) => owners.filter((o) => o.kind === kind).map((o) => o.id);
  const sounds = ids('sound').flatMap((id) => splitSoundKey(id) ?? []);
  const select = { id: true } as const;
  const [instruments, songs, artists, soundRows] = await Promise.all([
    prisma.bankInstrument.findMany({ where: { id: { in: ids('instrument') } }, select }),
    prisma.bankSong.findMany({ where: { id: { in: ids('song') } }, select }),
    prisma.bankArtist.findMany({ where: { id: { in: ids('artist') } }, select }),
    sounds.length
      ? prisma.synthSound.findMany({
          where: { OR: sounds },
          select: { id: true, synthId: true, slug: true },
        })
      : Promise.resolve([]),
  ]);
  const found = new Map<string, string>();
  for (const r of instruments) found.set(`instrument:${r.id}`, r.id);
  for (const r of songs) found.set(`song:${r.id}`, r.id);
  for (const r of artists) found.set(`artist:${r.id}`, r.id);
  for (const r of soundRows) found.set(`sound:${r.synthId}/${r.slug}`, r.id);
  return found;
}

/** Create the links the data lists that their owners do not have yet. */
export async function seedLinks(
  prisma: TenancyClient,
  data: LinkSeedData
): Promise<LinkSeedReport> {
  const problems = checkLinkData(data);
  if (problems.length) throw new LinkDataError(problems);

  const found = await ownerRows(
    prisma,
    data.map((d) => d.owner)
  );
  const missingOwners = data.map((d) => ownerKey(d.owner)).filter((k) => !found.has(k));

  const rows: Prisma.ExternalLinkCreateManyInput[] = [];
  for (const { owner, links } of data) {
    const rowId = found.get(ownerKey(owner));
    if (!rowId) continue;
    for (const link of links) {
      // Checked above: every URL parses, to itself.
      const parsed = parseLinkUrl(link.url);
      if (!parsed.ok) continue;
      const { provider, providerId, url } = parsed.link;
      rows.push({
        [OWNER_COLUMN[owner.kind]]: rowId,
        url,
        provider,
        providerId: provider === 'bandcamp' ? (link.providerId ?? null) : providerId,
        kind: link.kind,
        title: link.title,
        thumbnailUrl: link.thumbnailUrl ?? null,
        ours: link.ours,
        order: link.order,
        rating: link.rating,
      });
    }
  }

  // The unique index on owner + URL decides what an owner already has, so a link created meanwhile is skipped too.
  const { count } = rows.length
    ? await prisma.externalLink.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  return { created: count, existing: rows.length - count, missingOwners };
}
