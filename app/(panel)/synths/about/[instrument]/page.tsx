import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import '@/components/app/synth/synth.css';

import { InstrumentAbout } from '@/components/app/synth/instrument-about';
import { synthHref } from '@/components/app/synth/routes';
import { detailFrom, listFrom, loadBank } from '@/lib/app/bank/read';
import { listSynths } from '@/lib/app/catalogue/read';
import { listFamilies } from '@/lib/app/families/read';
import { sitePickerForPage } from '@/lib/app/picker/site-settings';
import { InstrumentIdSchema } from '@/lib/app/profile/instruments-data';
import { logger } from '@/lib/logging';

/**
 * A databank instrument nobody has modelled, in the synth's place (`f-synth-picker` t-330): what the databank knows
 * about it, with the synth picker in its caption, and ways to own it, ask for it to be modelled, or play the nearest
 * synth that does play.
 *
 * Read in process, as the synth page is, from the same functions the databank API serves (`lib/app/bank/read.ts`): the
 * whole databank is read once, for the instrument and for which of its relatives play. An instrument a listed synth
 * models is that synth: its address goes there. One the databank does not have is a 404.
 */

type Props = { params: Promise<{ instrument: string }> };

async function read(param: string) {
  const id = InstrumentIdSchema.safeParse(param);
  if (!id.success) return null;
  const bank = await loadBank();
  const detail = detailFrom(bank, 'instruments', id.data);
  return detail && { detail, instruments: listFrom(bank, 'instruments') };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await read((await params).instrument);
  if (!found) return { title: 'Synth' };
  const { name, maker, year } = found.detail.instrument;
  return {
    title: name,
    description: `${name} by ${maker}, ${year}: what the databank knows about it.`,
  };
}

export default async function InstrumentAboutRoute({ params }: Props) {
  const [found, synths, families, pickerSite] = await Promise.all([
    params.then(({ instrument }) => read(instrument)),
    listSynths(),
    // Families only add rows to the picker: a failed read lists the synths alone rather than failing the page.
    listFamilies().catch((err: unknown) => {
      logger.warn('instrument page: could not read synth families', { err: String(err) });
      return [];
    }),
    sitePickerForPage(),
  ]);
  if (!found) notFound();

  const listed = new Set(synths.map((s) => s.id));
  const plays = found.detail.synths.find((id) => listed.has(id));
  if (plays) redirect(synthHref(plays));

  // Which databank instruments play, and as which synth: what its relatives link to.
  const playsAs: Record<string, string> = {};
  for (const i of found.instruments) {
    const synth = i.synths.find((id) => listed.has(id));
    if (synth) playsAs[i.id] = synth;
  }

  return (
    <InstrumentAbout
      detail={found.detail}
      synths={synths}
      families={families}
      pickerSite={pickerSite}
      playsAs={playsAs}
    />
  );
}
