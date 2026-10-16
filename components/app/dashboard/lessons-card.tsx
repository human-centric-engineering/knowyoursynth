import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listSynths } from '@/lib/app/catalogue/read';
import { listProgress } from '@/lib/app/sounds/progress';
import type { LessonProgressEntry } from '@/lib/app/sounds/progress-data';

/**
 * The signed-in user's lessons on `/dashboard` (`f-my-sounds` s4): the ones in progress first, then the ones they
 * finished, each opening its library sound on its synth, where the lesson offers to continue. In-process reads, as the
 * my-sounds card makes: the same function `GET /api/v1/me/progress` serves. One on a synth the catalogue no longer
 * lists is shown without a link.
 */
export async function LessonsCard({ userId }: { userId: string }) {
  const [entries, synths] = await Promise.all([listProgress(userId), listSynths()]);
  const synthById = new Map(synths.map((s) => [s.id, s]));
  const going = entries.filter((e) => e.completedAt === null);
  const done = entries.filter((e) => e.completedAt !== null);

  const item = (e: LessonProgressEntry) => {
    const synth = synthById.get(e.synthId);
    return (
      <li
        key={`${e.synthId}/${e.slug}`}
        className="flex flex-wrap items-baseline justify-between gap-x-4 py-2"
      >
        {e.available ? (
          <Link
            href={`/synths/${encodeURIComponent(e.synthId)}?sound=${encodeURIComponent(e.slug)}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {e.name}
          </Link>
        ) : (
          <span className="font-medium">{e.name}</span>
        )}
        <span className="text-muted-foreground text-sm">
          {synth ? synth.name : `${e.synthId}, no longer available`}
          {' · '}
          {e.completedAt !== null
            ? 'Finished'
            : `Step ${Math.min(e.furthestStep + 1, e.steps)} of ${e.steps}`}
        </span>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1.5">
          <CardTitle>Lessons</CardTitle>
          <CardDescription>Lessons you have started, and the ones you finished.</CardDescription>
        </div>
        <GraduationCap className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet. Open a sound in a synth&apos;s library and press Build it step by step.
          </p>
        ) : (
          <>
            {going.length > 0 && (
              <section aria-label="In progress">
                <h3 className="text-muted-foreground text-xs font-medium uppercase">In progress</h3>
                <ul className="divide-y">{going.map(item)}</ul>
              </section>
            )}
            {done.length > 0 && (
              <section aria-label="Finished">
                <h3 className="text-muted-foreground text-xs font-medium uppercase">Finished</h3>
                <ul className="divide-y">{done.map(item)}</ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
