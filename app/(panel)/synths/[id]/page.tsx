import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * One synth: placeholder.
 *
 * Holds the route and the frame until the synth page lands (`f-model-d`, m3),
 * which replaces this file with the real page: the provider, the synth bar, the
 * stage and the panels below it (plan §4 "The synth page"). It says what it is
 * rather than imitating the page it stands in for.
 *
 * The id is shape-checked only. Which ids are real comes from the definition
 * registry, which arrives with Model D.
 */

const SYNTH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: SYNTH_ID.test(id) ? id : 'Synth' };
}

export default async function SynthPage({ params }: Props) {
  const { id } = await params;
  if (!SYNTH_ID.test(id)) notFound();

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="kys-wordmark text-2xl">{id}</h1>
      <p className="text-muted-foreground max-w-md">
        This synth&rsquo;s panel isn&rsquo;t in the app yet.
      </p>
    </section>
  );
}
