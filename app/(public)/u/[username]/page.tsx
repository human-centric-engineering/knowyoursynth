import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/synth/synth.css';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { PublicProfileView } from '@/components/app/profile/public-profile';
import { getPublicProfile } from '@/lib/app/profile/public';
import { BRAND } from '@/lib/brand';

/**
 * `/u/[username]`: a user's public synth profile (`f-profiles` r3), readable signed out.
 *
 * In-process, from the same read `GET /api/v1/profiles/:username` serves, as the databank pages read theirs
 * (`components/app/bank/load.ts`). A private profile, an unknown name and a held one are each a 404. The faces and the
 * label and display classes are the databank's (`app/(public)/bank/layout.tsx`).
 */

type Props = { params: Promise<{ username: string }> };

// the metadata and the page share one read
const readProfile = cache(getPublicProfile);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await readProfile((await params).username);
  if (!profile) return { title: 'Not found' };
  const lists = [profile.owned && 'the synths they own', profile.wishlist && 'the ones they want']
    .filter(Boolean)
    .join(' and ');
  return {
    title: profile.username,
    description: lists
      ? `${profile.username} on ${BRAND.name}: ${lists}.`
      : `${profile.username} on ${BRAND.name}.`,
    alternates: { canonical: `/u/${profile.username}` },
  };
}

export default async function PublicProfileRoute({ params }: Props) {
  const profile = await readProfile((await params).username);
  if (!profile) notFound();
  return <PublicProfileView profile={profile} />;
}
