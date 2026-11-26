import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import '@/components/app/synth/synth.css';

import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import { FamilySlugSchema } from '@/lib/app/families/data';
import { listFamilies } from '@/lib/app/families/read';
import { logger } from '@/lib/logging';
import { getSynthDef } from '@/lib/app/synths/defs';
import { UserSoundIdSchema } from '@/lib/app/sounds/data';

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
 * carrying the last one's state across. The version toggle is the one exception: it carries the panel between members
 * of a synth family itself (`components/app/synth/family-carry.ts`), with nothing in the URL. A member nobody has
 * modelled has no synth of its own: `?member=<slug>` shows it as a blank panel over this synth's page.
 */

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewParam = z.string().max(32).optional().catch(undefined);
const soundParam = z.string().max(128).optional().catch(undefined);
// One of the signed-in user's sounds, as the dashboard links to it. Whether it is theirs is the sounds API's answer.
const mineParam = UserSoundIdSchema.optional().catch(undefined);
// An unmodelled member of this synth's family, shown as a blank panel (`f-synth-families` t-321). Whether the family has
// one by that slug is the page's answer: a slug it does not have opens the synth itself.
const memberParam = FamilySlugSchema.optional().catch(undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const def = getSynthDef(id);
  return { title: def ? def.name : 'Synth' };
}

export default async function SynthRoute({ params, searchParams }: Props) {
  const { id } = await params;
  if (!getSynthDef(id)) notFound();

  const [detail, synths, families] = await Promise.all([
    getSynthDetail(id),
    listSynths(),
    // Families only group the picker: a failed read lists every synth alone rather than failing the page.
    listFamilies().catch((err: unknown) => {
      logger.warn('synth page: could not read synth families', { err: String(err) });
      return [];
    }),
  ]);
  if (!detail) notFound();

  const query = await searchParams;
  return (
    <SynthPage
      key={id}
      detail={detail}
      synths={synths}
      families={families}
      viewParam={viewParam.parse(query.view) ?? null}
      soundParam={soundParam.parse(query.sound) ?? null}
      mineParam={mineParam.parse(query.mine) ?? null}
      memberParam={memberParam.parse(query.member) ?? null}
    />
  );
}
