/**
 * Write the videos and links seed data into `external_link` (`f-videos-and-links` t-199). Spec: `.context/app/links.md`
 * (Seeded links).
 *
 * Called by the seed unit `prisma/seeds/app-knowyoursynth/006-links.ts`, which reads the data files and passes them in,
 * after the catalogue and databank units have written the owners. The rules, each tested:
 *
 * - **Checked before anything is written.** Every URL must parse to itself (`parseLinkUrl`), once per owner, with a
 *   valid kind and title. One problem anywhere and the seed throws with the whole list, having written nothing.
 * - **Once per database** (owner ruling, t-200). Each link applied is recorded (`LinkSeedRecord`, owner and URL), and
 *   a recorded link is never applied again: one an admin deletes, or moves to another URL, stays gone through every
 *   reseed. Links new to the data still arrive.
 * - **Create only.** A link its owner already has (the owner and the canonical URL, the table's unique key) is left
 *   exactly as it is: an admin's title, kind, ours, order and rating, and YouTube's counts, are never overwritten.
 * - **Never deletes.** A link the data does not list stays, so an admin's own links and a partial source are safe.
 * - **Reads nothing from providers.** The title comes from the data; a YouTube picture is derived from its id when
 *   shown (`thumbnailFor`), and the daily `app:refresh-link-stats` job fills view counts. So a seed runs offline.
 * - **An owner the database does not have is skipped and reported**, not thrown: a databank row an admin removed
 *   should not stop the rest.
 *
 * Accepted costs (journal, 2026-11-07): a link removed from the data and added back later is not applied again on a
 * database that had it; and an owner that was missing gets its links only when the unit next runs.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  isBandcampId,
  LINK_KINDS,
  LINK_PROVIDERS,
  MAX_THUMBNAIL_LENGTH,
  MAX_URL_LENGTH,
  parseLinkUrl,
  providerIdFor,
  safeThumbnailUrl,
  type ParsedLink,
} from '@/lib/app/links/providers';
import {
  OWNER_COLUMN,
  OWNER_KINDS,
  splitSoundKey,
  validOwnerId,
  type OwnerKind,
  type OwnerRef,
} from '@/lib/app/links/owner-ref';

/** One link in a data file. What an admin sets, and what a URL cannot say for itself. */
export const SeedLinkSchema = z
  .object({
    url: z.string().min(1).max(MAX_URL_LENGTH),
    kind: z.enum(LINK_KINDS),
    title: z.string().trim().min(1).max(200),
    ours: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    /** Bandcamp's embed id (`album=<n>` / `track=<n>`), which is on its page, not in its URL. */
    providerId: z.string().min(1).max(200).optional(),
    /** A picture read from a provider other than YouTube, whose is derived from its id. */
    thumbnailUrl: z.string().min(1).max(MAX_THUMBNAIL_LENGTH).optional(),
  })
  .strict();
export type SeedLink = z.infer<typeof SeedLinkSchema>;

/**
 * A data file: one owner's links, naming the owner inside it as well as in its path. The runner hashes a unit's inputs
 * by their contents only, so a file that moved to another owner without this would not re-run the seed.
 */
export const LinkSeedFileSchema = z
  .object({
    kind: z.enum(OWNER_KINDS),
    id: z.string().min(1).max(200),
    links: z.array(SeedLinkSchema),
  })
  .strict();
/** A data file as it is written: defaults left out. */
export type LinkFile = z.input<typeof LinkSeedFileSchema>;

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
  /** Links their owner already had, left as they are, and now recorded as applied. */
  existing: number;
  /** Links this database has had from the seed before (`LinkSeedRecord`): never applied again. */
  alreadyApplied: number;
  /** Owners the database does not have, as `<kind>:<id>`, whose links were skipped. */
  missingOwners: string[];
}

const ownerKey = (o: OwnerRef): string => `${o.kind}:${o.id}`;

/** The data with each link's URL parsed once, and every problem found on the way. */
interface LinkPlan {
  problems: string[];
  owners: { owner: OwnerRef; links: { link: SeedLink; parsed: ParsedLink }[] }[];
}

function planLinks(data: LinkSeedData): LinkPlan {
  const problems: string[] = [];
  const seen = new Set<string>();
  const owners: LinkPlan['owners'] = [];
  for (const { owner, links } of data) {
    const at = ownerKey(owner);
    if (!validOwnerId(owner.kind, owner.id)) problems.push(`${at}: not an id of that kind`);
    if (seen.has(at)) problems.push(`${at}: listed twice`);
    seen.add(at);
    const urls = new Set<string>();
    const planned: LinkPlan['owners'][number]['links'] = [];
    for (const link of links) {
      const result = parseLinkUrl(link.url);
      if (!result.ok) {
        problems.push(`${at}: ${link.url}: ${result.problem}`);
        continue;
      }
      const parsed = result.link;
      if (parsed.url !== link.url) problems.push(`${at}: ${link.url} is stored as ${parsed.url}`);
      if (urls.has(parsed.url)) problems.push(`${at}: ${link.url} listed twice`);
      urls.add(parsed.url);
      if (link.providerId !== undefined && parsed.provider !== 'bandcamp')
        problems.push(`${at}: ${link.url}: only a Bandcamp link carries its provider id`);
      if (link.providerId !== undefined && !isBandcampId(link.providerId))
        problems.push(`${at}: ${link.url}: not a Bandcamp embed id: ${link.providerId}`);
      if (
        link.thumbnailUrl !== undefined &&
        (parsed.provider === 'youtube' ||
          safeThumbnailUrl(parsed.provider, link.thumbnailUrl) !== link.thumbnailUrl)
      )
        problems.push(`${at}: ${link.url}: a picture not on its provider's image hosts`);
      planned.push({ link, parsed });
    }
    owners.push({ owner, links: planned });
  }
  return { problems, owners };
}

/** Every problem in the data. Pure: the seed runs it first, and the data test over the committed files. */
export function checkLinkData(data: LinkSeedData): string[] {
  return planLinks(data).problems;
}

/** Each owner the database has, by `<kind>:<id>`, mapped to its row id (a sound's is its `SynthSound.id`). */
async function ownerRows(prisma: TenancyClient, owners: OwnerRef[]): Promise<Map<string, string>> {
  const ids: Record<OwnerKind, string[]> = { instrument: [], sound: [], song: [], artist: [] };
  for (const o of owners) ids[o.kind].push(o.id);
  const sounds = ids.sound.flatMap((id) => splitSoundKey(id) ?? []);
  const select = { id: true } as const;
  // A kind the data names no owner of is not asked about.
  const byId = (kind: OwnerKind, find: (ids: string[]) => Promise<{ id: string }[]>) =>
    ids[kind].length ? find(ids[kind]) : Promise.resolve([]);
  const [instruments, songs, artists, soundRows] = await Promise.all([
    byId('instrument', (in_) =>
      prisma.bankInstrument.findMany({ where: { id: { in: in_ } }, select })
    ),
    byId('song', (in_) => prisma.bankSong.findMany({ where: { id: { in: in_ } }, select })),
    byId('artist', (in_) => prisma.bankArtist.findMany({ where: { id: { in: in_ } }, select })),
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

const recordKey = (kind: string, id: string, url: string): string => `${kind}:${id} ${url}`;

/**
 * Create the links the data lists that this database has never had from the seed, and record each as applied. A link
 * with a record (`LinkSeedRecord`) is never applied again, whether or not its owner still has it.
 */
export async function seedLinks(
  prisma: TenancyClient,
  data: LinkSeedData
): Promise<LinkSeedReport> {
  const plan = planLinks(data);
  if (plan.problems.length) throw new LinkDataError(plan.problems);

  const applied = new Set(
    (
      await prisma.linkSeedRecord.findMany({
        select: { ownerKind: true, ownerId: true, url: true },
      })
    ).map((r) => recordKey(r.ownerKind, r.ownerId, r.url))
  );
  // A link already applied here is done with: dropped from the plan before anything is looked up.
  let alreadyApplied = 0;
  const pending = plan.owners.map(({ owner, links }) => ({
    owner,
    links: links.filter(({ parsed }) => {
      const done = applied.has(recordKey(owner.kind, owner.id, parsed.url));
      if (done) alreadyApplied++;
      return !done;
    }),
  }));

  // An owner with nothing left to apply is neither looked up nor reported missing.
  const withLinks = pending.filter((o) => o.links.length);
  const found = await ownerRows(
    prisma,
    withLinks.map((o) => o.owner)
  );
  const missingOwners = withLinks.map((o) => ownerKey(o.owner)).filter((k) => !found.has(k));

  const rows: Prisma.ExternalLinkCreateManyInput[] = [];
  const records: Prisma.LinkSeedRecordCreateManyInput[] = [];
  for (const { owner, links } of withLinks) {
    const rowId = found.get(ownerKey(owner));
    // No record for a missing owner's links, so they are applied once it exists.
    if (!rowId) continue;
    for (const { link, parsed } of links) {
      records.push({ ownerKind: owner.kind, ownerId: owner.id, url: parsed.url });
      rows.push({
        [OWNER_COLUMN[owner.kind]]: rowId,
        url: parsed.url,
        provider: parsed.provider,
        providerId: providerIdFor(parsed, link.providerId ?? null),
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
  // Links first, then their records: a run that stops between the two finds the links there next time and records
  // them, where records first could mark a link applied that was never written.
  const { count } = rows.length
    ? await prisma.externalLink.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  if (records.length)
    await prisma.linkSeedRecord.createMany({ data: records, skipDuplicates: true });
  return { created: count, existing: rows.length - count, alreadyApplied, missingOwners };
}

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
 * links in it. A provider id and a picture are kept only where the URL cannot give them back (`SeedLinkSchema`), and a
 * picture only while `safeThumbnailUrl` still accepts it: the app would not show one it refuses (`thumbnailFor`), so
 * leaving it out loses nothing, where writing it would stop the seed.
 */
export function toSeedLink(row: StoredLink): z.input<typeof SeedLinkSchema> {
  const provider = LINK_PROVIDERS.find((p) => p === row.provider);
  const picture =
    provider && provider !== 'youtube' ? safeThumbnailUrl(provider, row.thumbnailUrl) : null;
  return {
    url: row.url,
    kind: row.kind,
    title: row.title,
    ...(row.ours ? { ours: true } : {}),
    ...(row.order !== 0 ? { order: row.order } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    ...(row.provider === 'bandcamp' && row.providerId ? { providerId: row.providerId } : {}),
    ...(picture === row.thumbnailUrl && picture ? { thumbnailUrl: picture } : {}),
  };
}

/** What an export writes, and the committed links it drops (only ever with `prune`). */
export interface LinkExport {
  /** One per owner, by owner. */
  files: LinkFile[];
  /** Committed links the table no longer has, as `<kind>:<id> <url>`. */
  dropped: string[];
}

/** The export would drop committed links, and was not told to. Nothing was written. */
export class LinkDropError extends Error {
  constructor(readonly dropped: string[]) {
    const shown = dropped.slice(0, 20);
    super(
      `This database lacks ${dropped.length} committed link(s), so the export would drop them. Check DATABASE_URL ` +
        `points at the database you curate in; to drop them on purpose, run it with -- --prune.\n- ` +
        [...shown, ...(dropped.length > shown.length ? ['…'] : [])].join('\n- ')
    );
    this.name = 'LinkDropError';
  }
}

/**
 * The data files a table's links make (`npm run links:export`), given what is committed now. Each owner's links keep
 * their committed order, and links new to the data follow in the order they come in (the export reads them oldest
 * first). So a re-export after a reseed, which gives every row the same `createdAt`, does not re-sort anything.
 *
 * Throws before anything is written: `LinkDropError` when a committed link is missing from the table and `prune` is
 * not set, so the wrong database (an empty one, or one missing a databank row) cannot wipe or shrink the data; and
 * `LinkDataError` on data the seed would refuse, so a bad table never replaces good data.
 */
export function exportLinkData(
  rows: (StoredLink & { owner: OwnerRef })[],
  committed: LinkSeedData,
  { prune = false }: { prune?: boolean } = {}
): LinkExport {
  const byOwner = new Map<string, { owner: OwnerRef; links: Map<string, StoredLink> }>();
  for (const row of rows) {
    const key = ownerKey(row.owner);
    const entry = byOwner.get(key) ?? {
      owner: { kind: row.owner.kind, id: row.owner.id },
      links: new Map(),
    };
    entry.links.set(row.url, row);
    byOwner.set(key, entry);
  }
  const committedUrls = new Map(
    committed.map(({ owner, links }) => [ownerKey(owner), links.map((l) => l.url)])
  );

  const dropped: string[] = [];
  for (const [key, urls] of committedUrls)
    for (const url of urls) if (!byOwner.get(key)?.links.has(url)) dropped.push(`${key} ${url}`);
  if (dropped.length && !prune) throw new LinkDropError(dropped);

  const files: LinkFile[] = [...byOwner.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { owner, links }]) => {
      const before = committedUrls.get(key) ?? [];
      const isBefore = new Set(before);
      const kept = before.flatMap((url) => links.get(url) ?? []);
      const added = [...links.values()].filter((l) => !isBefore.has(l.url));
      return { kind: owner.kind, id: owner.id, links: [...kept, ...added].map(toSeedLink) };
    });

  const problems: string[] = [];
  const data: LinkSeedData = [];
  for (const file of files) {
    const parsed = LinkSeedFileSchema.safeParse(file);
    if (parsed.success)
      data.push({
        owner: { kind: parsed.data.kind, id: parsed.data.id },
        links: parsed.data.links,
      });
    else problems.push(`${file.kind}:${file.id}: ${parsed.error.message}`);
  }
  problems.push(...checkLinkData(data));
  if (problems.length) throw new LinkDataError(problems);
  return { files, dropped };
}
