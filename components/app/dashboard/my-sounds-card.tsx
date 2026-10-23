import Link from 'next/link';
import { AudioLines } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { soundStateLabel } from '@/components/app/sharing/visibility';
import { mySoundHref, sharedSoundHref } from '@/components/app/synth/routes';
import { listSynths } from '@/lib/app/catalogue/read';
import { listUserSounds } from '@/lib/app/sounds/store';

/**
 * The signed-in user's own sounds on `/dashboard` (`f-my-sounds` s2), each opening on its synth.
 *
 * In-process reads, as the synth page's route makes them: the same functions `GET /api/v1/sounds` and
 * `GET /api/v1/synths` serve. A sound on a synth the catalogue no longer lists is shown without a link, since its
 * page would be a 404. One saved on a definition the synth has moved on from still opens, with what fits.
 *
 * Each says who can open it (`f-sharing` h3), and a shared one links to its page.
 */
export async function MySoundsCard({ userId }: { userId: string }) {
  const [sounds, synths] = await Promise.all([listUserSounds(userId), listSynths()]);
  const synthById = new Map(synths.map((s) => [s.id, s]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1.5">
          <CardTitle>My patches</CardTitle>
          <CardDescription>
            Patches you have saved on a synth&apos;s page, most recently changed first.
          </CardDescription>
        </div>
        <AudioLines className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {sounds.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven&apos;t saved a patch yet. Open a{' '}
            <Link href="/synths" className="underline underline-offset-2">
              synth
            </Link>
            , get it sounding the way you like and press <strong>Save</strong>. Or save a copy of a
            library patch and change it from there.
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
                      href={mySoundHref(s.synthId, s.id)}
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
                    {' · '}
                    {synth && s.visibility !== 'private' && s.slug && !s.unlisted ? (
                      <Link
                        href={sharedSoundHref(s.synthId, s.slug)}
                        className="underline underline-offset-2"
                      >
                        {soundStateLabel(s)}
                      </Link>
                    ) : (
                      soundStateLabel(s)
                    )}
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
