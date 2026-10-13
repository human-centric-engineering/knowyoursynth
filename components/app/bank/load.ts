/**
 * What the databank pages read, once per request: the layout and the page beside it share one read.
 *
 * In-process, from the same read layer `GET /api/v1/bank/*` and `GET /api/v1/synths` serve, as the synth page reads
 * the catalogue (see `app/(panel)/synths/[id]/page.tsx` for why not through the API).
 */

import { cache } from 'react';
import { loadBank } from '@/lib/app/bank/read';
import { listSoundNames, listSynths } from '@/lib/app/catalogue/read';
import { namesFrom, type BankNames } from '@/components/app/bank/bank-detail';
import { browseLists, type BrowseLists } from '@/components/app/bank/lists';
import type { Bank } from '@/lib/app/bank/data';

export const readBank: () => Promise<Bank> = cache(loadBank);

const readSynths = cache(listSynths);

/** Each tab's rows, for the list beside every page. */
export const readBrowseLists = cache(async (): Promise<BrowseLists> => {
  const [bank, synths] = await Promise.all([readBank(), readSynths()]);
  return browseLists(bank, new Set(synths.map((s) => s.id)));
});

/** The names a page prints for what it links to. */
export const readNames = cache(async (): Promise<BankNames> => {
  const [bank, synths, sounds] = await Promise.all([readBank(), readSynths(), listSoundNames()]);
  return namesFrom(bank, synths, sounds);
});
