/**
 * Admin edits to videos and links (`f-videos-and-links` t-179). Spec: `.context/app/links.md`.
 *
 * The rules, each tested:
 *
 * - **A link's URL is parsed on every write** (`parseLinkUrl`): its provider and provider id come from it, never from
 *   the caller, and a URL the parser refuses is refused with its reason.
 * - **One link per URL per owner.** A second is refused with 409 (the table's unique indexes decide it).
 * - **The owner is set at create and never changes.** To move a link, delete it and add it to the other owner.
 * - **A new URL drops what was read from the old one** (thumbnail, views, likes, when they were read): they described
 *   a different video.
 * - **A link marked ours goes to the end of its owner's own videos**; unmarking keeps its stored position, unused.
 * - **A save that changes nothing writes nothing**, and says so, so the route audits nothing.
 * - **A reorder names every one of the owner's own videos, once**, or it is refused and nothing moves. One deleted or
 *   unmarked while the reorder was in flight is a 409, and nothing moves.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import { paginationQuerySchema } from '@/lib/validations/common';
import {
  embedUrl,
  LINK_KINDS,
  LINK_PROVIDERS,
  parseLinkUrl,
  thumbnailFor,
} from '@/lib/app/links/providers';
import type { LinkKind, LinkProvider } from '@/lib/app/links/providers';
import {
  columnsOf,
  OWNER_INCLUDE,
  OWNER_KINDS,
  OwnerRefSchema,
  ownerOf,
  resolveOwner,
  validOwnerId,
  type OwnerColumns,
  type OwnerRef,
  type OwnerSummary,
} from '@/lib/app/links/owner';

const TitleSchema = z.string().trim().min(1, 'A link needs a title').max(200);
const RatingSchema = z.number().int().min(1).max(5).nullable();
const UrlSchema = z.string().trim().min(1).max(2000);

export const LinkCreateSchema = z.object({
  owner: OwnerRefSchema,
  url: UrlSchema,
  kind: z.enum(LINK_KINDS),
  title: TitleSchema,
  ours: z.boolean().default(false),
  rating: RatingSchema.default(null),
});
export type LinkCreate = z.infer<typeof LinkCreateSchema>;

export const LinkUpdateSchema = z
  .object({
    url: UrlSchema,
    kind: z.enum(LINK_KINDS),
    title: TitleSchema,
    ours: z.boolean(),
    rating: RatingSchema,
  })
  .partial()
  .refine((u) => Object.keys(u).length > 0, { message: 'Nothing to change' });
export type LinkUpdate = z.infer<typeof LinkUpdateSchema>;

export const LinkReorderSchema = z.object({
  owner: OwnerRefSchema,
  ids: z.array(z.string().min(1).max(40)).max(500),
});

/** The admin list's filters: at most one owner, a provider, and whether ours. */
export const AdminLinkQuerySchema = z
  .object({
    instrument: z.string().max(200).optional(),
    sound: z.string().max(200).optional(),
    song: z.string().max(200).optional(),
    artist: z.string().max(200).optional(),
    provider: z.enum(LINK_PROVIDERS).optional(),
    ours: z.enum(['true', 'false']).optional(),
  })
  .extend({
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit.unwrap().default(50),
  })
  .superRefine((q, ctx) => {
    const owners = OWNER_KINDS.filter((k) => q[k] !== undefined);
    if (owners.length > 1)
      ctx.addIssue({ code: 'custom', message: 'Filter by one owner at a time' });
    for (const k of owners)
      if (!validOwnerId(k, q[k] ?? ''))
        ctx.addIssue({ code: 'custom', path: [k], message: 'Not an id of that kind' });
  });
export type AdminLinkQuery = z.infer<typeof AdminLinkQuerySchema>;

/** A link as admins read it. */
export interface AdminLink {
  id: string;
  owner: OwnerSummary;
  url: string;
  provider: LinkProvider;
  providerId: string | null;
  kind: LinkKind;
  title: string;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  ours: boolean;
  order: number;
  rating: number | null;
  views: number | null;
  likes: number | null;
  statsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type LinkRow = Prisma.ExternalLinkGetPayload<{ include: typeof OWNER_INCLUDE }>;

export function toAdminLink(row: LinkRow): AdminLink {
  return {
    id: row.id,
    owner: ownerOf(row),
    url: row.url,
    provider: row.provider,
    providerId: row.providerId,
    kind: row.kind,
    title: row.title,
    thumbnailUrl: thumbnailFor(row.provider, row.providerId, row.thumbnailUrl),
    embedUrl: embedUrl(row.provider, row.providerId),
    ours: row.ours,
    order: row.order,
    rating: row.rating,
    views: row.views,
    likes: row.likes,
    statsAt: row.statsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What an audit entry records of a link: the fields an admin sets, and what it is about. */
export function auditFields(link: AdminLink): Record<string, unknown> {
  return {
    owner: `${link.owner.kind}:${link.owner.id}`,
    url: link.url,
    kind: link.kind,
    title: link.title,
    ours: link.ours,
    rating: link.rating,
  };
}

function parseOrRefuse(url: string): {
  url: string;
  provider: LinkProvider;
  providerId: string | null;
} {
  const parsed = parseLinkUrl(url);
  if (!parsed.ok) throw new ValidationError(parsed.problem, { url: parsed.problem });
  return parsed.link;
}

async function ownerOrRefuse(ref: OwnerRef): Promise<OwnerColumns> {
  const columns = await resolveOwner(ref);
  if (!columns)
    throw new ValidationError('There is nothing with that id to link to', { owner: ref });
  return columns;
}

async function nextOursOrder(where: OwnerColumns): Promise<number> {
  const last = await prisma.externalLink.aggregate({
    where: { ...where, ours: true },
    _max: { order: true },
  });
  return (last._max.order ?? -1) + 1;
}

const ALREADY_LINKED = 'That address is already linked here';

/** Every link, newest edit first, filtered. */
export async function listAdminLinks(
  query: AdminLinkQuery
): Promise<{ links: AdminLink[]; page: number; limit: number; total: number }> {
  const where: Prisma.ExternalLinkWhereInput = {};
  if (query.provider) where.provider = query.provider;
  if (query.ours) where.ours = query.ours === 'true';
  const ownerKind = OWNER_KINDS.find((k) => query[k] !== undefined);
  if (ownerKind) {
    const columns = await resolveOwner({ kind: ownerKind, id: query[ownerKind] ?? '' });
    // An owner that does not exist has no links.
    if (!columns) return { links: [], page: query.page, limit: query.limit, total: 0 };
    Object.assign(where, columns);
  }
  const [rows, total] = await Promise.all([
    prisma.externalLink.findMany({
      where,
      include: OWNER_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.externalLink.count({ where }),
  ]);
  return { links: rows.map(toAdminLink), page: query.page, limit: query.limit, total };
}

export async function getAdminLink(id: string): Promise<AdminLink | null> {
  const row = await prisma.externalLink.findUnique({ where: { id }, include: OWNER_INCLUDE });
  return row ? toAdminLink(row) : null;
}

export async function createLink(input: LinkCreate): Promise<AdminLink> {
  const parsed = parseOrRefuse(input.url);
  const owner = await ownerOrRefuse(input.owner);
  const order = input.ours ? await nextOursOrder(owner) : 0;
  try {
    const row = await prisma.externalLink.create({
      data: {
        ...owner,
        ...parsed,
        kind: input.kind,
        title: input.title,
        ours: input.ours,
        order,
        rating: input.rating,
      },
      include: OWNER_INCLUDE,
    });
    return toAdminLink(row);
  } catch (err) {
    if (hasPrismaCode(err, 'P2002')) throw new ConflictError(ALREADY_LINKED);
    // The owner went between the check and the write.
    if (hasPrismaCode(err, 'P2003'))
      throw new ValidationError('There is nothing with that id to link to');
    throw err;
  }
}

export async function updateLink(
  id: string,
  input: LinkUpdate
): Promise<{ before: AdminLink; after: AdminLink; changed: boolean }> {
  const row = await prisma.externalLink.findUnique({ where: { id }, include: OWNER_INCLUDE });
  if (!row) throw new NotFoundError('Link not found');
  const before = toAdminLink(row);

  const data: Prisma.ExternalLinkUpdateInput = {};
  if (input.url !== undefined) {
    const parsed = parseOrRefuse(input.url);
    if (parsed.url !== row.url) {
      Object.assign(data, parsed, { thumbnailUrl: null, views: null, likes: null, statsAt: null });
    }
  }
  if (input.kind !== undefined && input.kind !== row.kind) data.kind = input.kind;
  if (input.title !== undefined && input.title !== row.title) data.title = input.title;
  if (input.rating !== undefined && input.rating !== row.rating) data.rating = input.rating;
  if (input.ours !== undefined && input.ours !== row.ours) {
    data.ours = input.ours;
    if (input.ours) data.order = await nextOursOrder(columnsOf(row));
  }
  if (Object.keys(data).length === 0) return { before, after: before, changed: false };

  try {
    const updated = await prisma.externalLink.update({
      where: { id },
      data,
      include: OWNER_INCLUDE,
    });
    return { before, after: toAdminLink(updated), changed: true };
  } catch (err) {
    if (hasPrismaCode(err, 'P2002')) throw new ConflictError(ALREADY_LINKED);
    if (hasPrismaCode(err, 'P2025')) throw new NotFoundError('Link not found');
    throw err;
  }
}

export async function deleteLink(id: string): Promise<AdminLink> {
  try {
    return toAdminLink(await prisma.externalLink.delete({ where: { id }, include: OWNER_INCLUDE }));
  } catch (err) {
    if (hasPrismaCode(err, 'P2025')) throw new NotFoundError('Link not found');
    throw err;
  }
}

/**
 * Put an owner's own videos in the order given. `ids` must be every one of them, once. Returns the ids in their old
 * order and the new, for the audit, and whether anything moved.
 */
export async function reorderOurLinks(
  ref: OwnerRef,
  ids: string[]
): Promise<{ before: string[]; after: string[]; changed: boolean }> {
  const owner = await ownerOrRefuse(ref);
  const current = await prisma.externalLink.findMany({
    where: { ...owner, ours: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const before = current.map((r) => r.id);
  const known = new Set(before);
  if (
    ids.length !== before.length ||
    new Set(ids).size !== ids.length ||
    !ids.every((i) => known.has(i))
  )
    throw new ValidationError('Name each of its own videos once, and nothing else', {
      ids: before,
    });
  if (ids.every((id, i) => before[i] === id)) return { before, after: before, changed: false };

  // Each write is conditional on the link still being one of this owner's own: one deleted or unmarked since the read
  // above fails the whole transaction (P2025), so nothing moves and nothing is written onto a link that is not ours.
  try {
    await prisma.$transaction(
      // Only the links that moved, so an unmoved one keeps its edit time in the admin list.
      ids.flatMap((id, order) =>
        before[order] === id
          ? []
          : [prisma.externalLink.update({ where: { id, ...owner, ours: true }, data: { order } })]
      )
    );
  } catch (err) {
    if (hasPrismaCode(err, 'P2025'))
      throw new ConflictError(
        'Its own videos changed while you were ordering them: reload and try again'
      );
    throw err;
  }
  return { before, after: ids, changed: true };
}
