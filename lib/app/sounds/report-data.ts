/**
 * The shapes of reporting a shared sound and moderating it (`f-sharing` h4): what the routes take and what they return.
 * Shapes only, with no database client, so the report button and the admin queue validate with the same schemas.
 */
import { z } from 'zod';
import type { SoundVisibility } from '@/lib/app/sounds/data';

/** Why someone reports a sound. BeatBreaker's `bad-link` is left out: a sound carries no links. */
export const SOUND_REPORT_REASONS = ['offensive', 'not_theirs', 'spam', 'other'] as const;
export type SoundReportReason = (typeof SOUND_REPORT_REASONS)[number];

/** What each reason is called, on the report button and in the queue. */
export const SOUND_REPORT_REASON_LABELS: Record<SoundReportReason, string> = {
  offensive: 'Offensive or hateful',
  not_theirs: "It's someone else's sound",
  spam: 'Spam',
  other: 'Something else',
};

export const REPORT_NOTE_MAX = 1000;

/** `POST /api/v1/public/sounds/:slug/report`. A second report from the same person updates their open one. */
export const ReportSoundSchema = z.object({
  reason: z.enum(SOUND_REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
});
export type ReportSound = z.infer<typeof ReportSoundSchema>;

/**
 * `POST /api/v1/admin/sounds/:id`. **unlist** takes it out of every public read and actions its open reports;
 * **restore** puts an unlisted sound back as its owner left it; **dismiss** closes its open reports and moves nothing.
 */
export const MODERATION_ACTIONS = ['unlist', 'restore', 'dismiss'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
export const ModerationActionSchema = z.object({ action: z.enum(MODERATION_ACTIONS) });

/** The queue's two views: sounds with open reports, oldest report first; and sounds unlisted, most recent first. */
export const MODERATION_VIEWS = ['reported', 'unlisted'] as const;
export type ModerationView = (typeof MODERATION_VIEWS)[number];

/** One report as the queue shows it. **Never who filed it.** */
export interface QueueReport {
  reason: SoundReportReason;
  note: string | null;
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: string;
}

/** A reported or unlisted sound as the admin queue shows it: the owner by username only, never a reporter. */
export interface QueueSound {
  /** The sound's row id: what the actions are addressed by. Admin only. */
  id: string;
  synthId: string;
  synthName: string;
  name: string;
  notes: string | null;
  visibility: SoundVisibility;
  slug: string | null;
  /** The owner's username, or null when they have none (a link share needs none). */
  owner: string | null;
  unlistedAt: string | null;
  /** In the reported view, its open reports; in the unlisted view, the open and actioned ones. Oldest first. */
  reports: QueueReport[];
}
