import type { SoundVisibility } from '@/lib/app/sounds/data';

/**
 * What each state is called wherever a sound's state is shown (`f-sharing` h3): My sounds on the synth page, and the
 * dashboard. A plain module, not the client one that shares sounds, so the dashboard's server component can read it.
 */
export const VISIBILITY_LABELS: Record<SoundVisibility, string> = {
  private: 'Private',
  link: 'Shared by link',
  published: 'Published',
};

/** What a sound moderators unlisted is called instead (`f-sharing` h4), whatever its visibility. */
export const UNLISTED_LABEL = 'Unlisted by moderators';

/** A sound's state as My sounds and the dashboard say it. */
export const soundStateLabel = (sound: {
  visibility: SoundVisibility;
  unlisted: boolean;
}): string => (sound.unlisted ? UNLISTED_LABEL : VISIBILITY_LABELS[sound.visibility]);
