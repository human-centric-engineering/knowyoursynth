import Link from 'next/link';
import { Star } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listFavourites } from '@/lib/app/sounds/favourites';
import type { Favourite } from '@/lib/app/sounds/favourite-data';

/** Where a favourite opens: its synth, with the library sound or the user's own sound on the panel. */
function hrefOf(f: Favourite): string {
  const synth = `/synths/${encodeURIComponent(f.synthId)}`;
  if (f.kind === 'sound' && f.slug) return `${synth}?sound=${encodeURIComponent(f.slug)}`;
  if (f.kind === 'mine' && f.soundId) return `${synth}?mine=${encodeURIComponent(f.soundId)}`;
  return synth;
}

const KIND_LABEL: Record<Favourite['kind'], string> = {
  synth: 'Synth',
  sound: 'Library sound',
  mine: 'Your sound',
};

/**
 * The signed-in user's favourites on `/dashboard` (`f-my-sounds` s4), each opening on its synth. An in-process read,
 * as the my-sounds card makes: the same function `GET /api/v1/me/favourites` serves. One on a synth the catalogue no
 * longer lists is shown without a link, since its page would be a 404.
 */
export async function FavouritesCard({ userId }: { userId: string }) {
  const favourites = await listFavourites(userId);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1.5">
          <CardTitle>Favourites</CardTitle>
          <CardDescription>Synths and sounds you starred, most recent first.</CardDescription>
        </div>
        <Star className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {favourites.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No favourites yet. Press the star beside a synth&apos;s name, or beside a sound in its
            library, and it will show up here.
          </p>
        ) : (
          <ul className="divide-y">
            {favourites.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                {f.available ? (
                  <Link href={hrefOf(f)} className="font-medium underline-offset-2 hover:underline">
                    {f.name}
                  </Link>
                ) : (
                  <span className="font-medium">{f.name}</span>
                )}
                <span className="text-muted-foreground text-sm">
                  {f.available ? KIND_LABEL[f.kind] : 'No longer available'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
