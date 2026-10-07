import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import '@/components/app/synth/synth.css';

import { SynthPage } from '@/components/app/synth/synth-page';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { logger } from '@/lib/logging';

/**
 * One synth: play it, patch it and read about it (plan §4 "The synth page").
 *
 * The instrument is compiled in (the definition registry); everything said about it comes from the API (D13). A synth
 * the registry does not have is a 404 before any fetch. One the API does not serve (not listed) is a 404 too.
 *
 * The page component is keyed by synth, so moving to another synth starts its panel afresh rather than carrying the
 * last one's state across.
 */

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewParam = z.string().max(32).optional().catch(undefined);

async function fetchData<T>(path: string): Promise<T | null> {
  const res = await serverFetch(path);
  if (res.status === 404) return null;
  const body = await parseApiResponse<T>(res);
  if (!body.success) {
    logger.error('synth page: API read failed', { path, code: body.error.code });
    throw new Error(`Could not read ${path}`);
  }
  return body.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const def = getSynthDef(id);
  return { title: def ? def.name : 'Synth' };
}

export default async function SynthRoute({ params, searchParams }: Props) {
  const { id } = await params;
  if (!getSynthDef(id)) notFound();

  const [detail, synths] = await Promise.all([
    fetchData<SynthDetail>(`/api/v1/synths/${encodeURIComponent(id)}`),
    fetchData<CatalogueSynth[]>('/api/v1/synths'),
  ]);
  if (!detail) notFound();

  return (
    <SynthPage
      key={id}
      detail={detail}
      synths={synths ?? []}
      viewParam={viewParam.parse((await searchParams).view) ?? null}
    />
  );
}
