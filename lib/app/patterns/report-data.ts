/**
 * The shapes of reporting a shared pattern and moderating it (`f-step-sequencer` t-83). A report about a pattern takes
 * the same reasons, note and statuses as one about a sound (`lib/app/sounds/report-data.ts`), and the queue the same
 * actions and views; only what a queued item carries differs.
 */
import type { QueueReport } from '@/lib/app/sounds/report-data';
import type { SoundVisibility } from '@/lib/app/sounds/data';

export {
  ReportSoundSchema as ReportPatternSchema,
  type ReportSound as ReportPattern,
} from '@/lib/app/sounds/report-data';

/** A reported or unlisted pattern as the admin queue shows it: the owner by username only, never a reporter. */
export interface QueuePattern {
  /** The pattern's row id: what the actions are addressed by. Admin only. */
  id: string;
  name: string;
  /** The synth it was made on, and its name, or null. */
  synthId: string | null;
  synthName: string | null;
  visibility: SoundVisibility;
  slug: string | null;
  /** The owner's username, or null when they have none (a link share needs none). */
  owner: string | null;
  unlistedAt: string | null;
  /** In the reported view, its open reports; in the unlisted view, the open and actioned ones. Oldest first. */
  reports: QueueReport[];
}
