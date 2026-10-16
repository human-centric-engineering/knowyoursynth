import { FavouritesCard } from '@/components/app/dashboard/favourites-card';
import { LessonsCard } from '@/components/app/dashboard/lessons-card';
import { MySoundsCard } from '@/components/app/dashboard/my-sounds-card';

/**
 * Know Your Synth's cards on `/dashboard`: the user's own sounds (`f-my-sounds` s2), then their favourites and lessons
 * (s4) side by side. One element in the platform's page, so a new card here is not another edit to it (divergence row
 * in `.context/app/divergences.md`).
 */
export function SynthCards({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <MySoundsCard userId={userId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FavouritesCard userId={userId} />
        <LessonsCard userId={userId} />
      </div>
    </div>
  );
}
