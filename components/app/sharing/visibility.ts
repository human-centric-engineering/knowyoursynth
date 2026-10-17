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
