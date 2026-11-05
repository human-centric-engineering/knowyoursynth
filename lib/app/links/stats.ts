/**
 * YouTube view and like counts for links (`f-videos-and-links` t-180), the popularity the order weighs
 * (`lib/app/links/order.ts`). Server-side only. Spec: `.context/app/links.md` → "View counts".
 *
 * Read with the YouTube Data API's `videos.list`, which needs `YOUTUBE_API_KEY` (optional). The rules, each tested:
 *
 * - **No key, no work**: nothing is read or written, and the job says why.
 * - **Batched**: one call per 50 videos, the most `videos.list` takes. A video linked from several owners is asked for
 *   once and written to each.
 * - **Idempotent**: a link whose counts have not changed is not written. A changed one keeps its `updatedAt`, so a
 *   refresh does not float every link to the top of the admin list ("newest edit first" means an admin's edit).
 * - **YouTube rows only.** Nothing else has a view count to read.
 * - **One failure is contained**: a batch the API refuses, or a row that will not write, is counted and skipped, and
 *   the rest still run. A video the API does not return (removed, private) keeps the counts it had.
 * - **Capped at the largest Int**, the column's type; the order takes a logarithm, so the cap never changes it.
 * - **The write is conditional on the link still naming that video**, so an admin's URL change mid-run is not given
 *   the old video's counts.
 */
import { z } from 'zod';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import { readJson } from '@/lib/app/links/fetch';

export const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_API_HOSTS = new Set(['www.googleapis.com']);
/** The most ids one `videos.list` call takes. */
export const BATCH_SIZE = 50;
const MAX_INT = 2_147_483_647;
const TIMEOUT_MS = 10_000;
/** Fifty videos' statistics are a few kilobytes. */
const MAX_REPLY_BYTES = 256 * 1024;

export interface VideoStats {
  views: number | null;
  likes: number | null;
}

/** A count YouTube sends as a decimal string, as an Int: capped, and null when it is hidden or not a count. */
function count(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d{1,30}$/.test(raw)) return null;
  return Math.min(Number(raw), MAX_INT);
}

const replySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        statistics: z
          .object({ viewCount: z.string().optional(), likeCount: z.string().optional() })
          .optional(),
      })
    )
    .default([]),
});

/** The counts for up to 50 videos, by id; null when the call failed. Videos YouTube did not return are absent. */
export async function fetchYouTubeStats(
  ids: readonly string[],
  key: string
): Promise<Map<string, VideoStats> | null> {
  if (ids.length === 0) return new Map();
  const query = new URLSearchParams({
    part: 'statistics',
    id: ids.slice(0, BATCH_SIZE).join(','),
    maxResults: String(BATCH_SIZE),
    key,
  });
  const body = await readJson(`${YOUTUBE_VIDEOS_URL}?${query.toString()}`, {
    hosts: YOUTUBE_API_HOSTS,
    maxBytes: MAX_REPLY_BYTES,
    timeoutMs: TIMEOUT_MS,
    purpose: 'youtube:videos.list',
  });
  const parsed = replySchema.safeParse(body);
  if (body === null || !parsed.success) return null;
  const out = new Map<string, VideoStats>();
  for (const item of parsed.data.items)
    out.set(item.id, {
      views: count(item.statistics?.viewCount),
      likes: count(item.statistics?.likeCount),
    });
  return out;
}

/** One video's counts for a link being added, or null with no key or when YouTube did not answer. */
export async function statsForVideo(videoId: string): Promise<VideoStats | null> {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return null;
  return (await fetchYouTubeStats([videoId], key))?.get(videoId) ?? null;
}

export type RefreshSummary =
  | { status: 'skipped'; reason: string }
  | { videos: number; updated: number; unchanged: number; missing: number; failed: number };

/** Read every YouTube link's counts again and write the ones that changed. The app job's body. */
export async function refreshYouTubeStats(now: Date = new Date()): Promise<RefreshSummary> {
  // Read per run, not at module scope, so setting the key and restarting is all it takes.
  const key = env.YOUTUBE_API_KEY;
  if (!key) return { status: 'skipped', reason: 'YOUTUBE_API_KEY is not set' };

  const rows = await prisma.externalLink.findMany({
    where: { provider: 'youtube', providerId: { not: null } },
    select: { id: true, providerId: true, views: true, likes: true, updatedAt: true },
    orderBy: [{ id: 'asc' }],
  });
  const byVideo = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.providerId) continue;
    byVideo.set(row.providerId, [...(byVideo.get(row.providerId) ?? []), row]);
  }
  const videos = [...byVideo.keys()];
  const summary = { videos: videos.length, updated: 0, unchanged: 0, missing: 0, failed: 0 };

  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    const stats = await fetchYouTubeStats(batch, key);
    if (!stats) {
      summary.failed += batch.reduce((n, id) => n + (byVideo.get(id)?.length ?? 0), 0);
      continue;
    }
    for (const videoId of batch) {
      const read = stats.get(videoId);
      for (const row of byVideo.get(videoId) ?? []) {
        if (!read) {
          summary.missing++;
          continue;
        }
        if (row.views === read.views && row.likes === read.likes) {
          summary.unchanged++;
          continue;
        }
        try {
          await prisma.externalLink.update({
            where: { id: row.id, provider: 'youtube', providerId: videoId },
            data: { views: read.views, likes: read.likes, statsAt: now, updatedAt: row.updatedAt },
          });
          summary.updated++;
        } catch (err) {
          // P2025: deleted, or given another URL, since the read. Either way these counts are no longer its.
          if (!hasPrismaCode(err, 'P2025')) {
            summary.failed++;
            logger.warn('Links: could not write the counts for a video', {
              linkId: row.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
  }
  return summary;
}
