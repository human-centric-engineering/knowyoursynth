import Link from 'next/link';
import { AudioLines } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listSynths } from '@/lib/app/catalogue/read';
import { listUserSounds } from '@/lib/app/sounds/store';

/**
 * The signed-in user's own sounds on `/dashboard` (`f-my-sounds` s2), each opening on its synth.
 *
 * In-process reads, as the synth page's route makes them: the same functions `GET /api/v1/sounds` and
 * `GET /api/v1/synths` serve. A sound on a synth the catalogue no longer lists is shown without a link, since its
 * page would be a 404. One saved on a definition the synth has moved on from still opens, with what fits.
 */
export async function MySoundsCard({ userId }: { userId: string }) {
  const [sounds, synths] = await Promise.all([listUserSounds(userId), listSynths()]);
  const synthById = new Map(synths.map((s) => [s.id, s]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1.5">
          <CardTitle>My sounds</CardTitle>
          <CardDescription>
            Sounds you have saved on a synth&apos;s page, most recently changed first.
          </CardDescription>
        </div>
        <AudioLines className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {sounds.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet. Open a synth from{' '}
            <Link href="/synths" className="underline underline-offset-2">
              Synths
            </Link>{' '}
            and press Save, or Save a copy of a library sound.
          </p>
        ) : (
          <ul className="divide-y">
            {sounds.map((s) => {
              const synth = synthById.get(s.synthId);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 py-2"
                >
                  {synth ? (
                    <Link
                      href={`/synths/${encodeURIComponent(s.synthId)}?mine=${encodeURIComponent(s.id)}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {s.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                  <span className="text-muted-foreground text-sm">
                    {synth ? `${synth.maker} ${synth.name}` : `${s.synthId}, no longer available`}
                    {s.source ? ` · copied from ${s.source.name}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
