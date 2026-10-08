import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import '@/components/app/synth/synth.css';

import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';

/**
 * One synth: play it, patch it and read about it (plan §4 "The synth page").
 *
 * The instrument is compiled in (the definition registry). Everything said about it comes from the catalogue tables
 * (D13), read through `lib/app/catalogue/read.ts`: the same functions `GET /api/v1/synths` and `/api/v1/synths/[id]`
 * serve, so this page and every API client (the browser, a native app) see the same data, checked the same way.
 *
 * In-process rather than through `serverFetch`: a server render calling its own API forwards no visitor IP, so every
 * signed-out visitor would share one rate-limit bucket, and the round trip buys nothing (journal, `f-model-d`).
 *
 * A synth the registry does not have is a 404 before any read; one the catalogue does not serve (not listed) is a
 * 404 too. The page component is keyed by synth, so moving to another synth starts its panel afresh rather than
 * carrying the last one's state across.
 */

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewParam = z.string().max(32).optional().catch(undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const def = getSynthDef(id);
  return { title: def ? def.name : 'Synth' };
}

export default async function SynthRoute({ params, searchParams }: Props) {
  const { id } = await params;
  if (!getSynthDef(id)) notFound();

  const [detail, synths] = await Promise.all([getSynthDetail(id), listSynths()]);
  if (!detail) notFound();

  return (
    <SynthPage
      key={id}
      detail={detail}
      synths={synths}
      viewParam={viewParam.parse((await searchParams).view) ?? null}
    />
  );
}
