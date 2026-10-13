import type { Metadata } from 'next';

import { Welcome } from '@/components/app/bank/bank-detail';
import { DEFAULT_TAB } from '@/components/app/bank/routes';
import { readNames } from '@/components/app/bank/load';

/** `/bank`: the artists tab, as the prototype's databank opened on it. */

export const metadata: Metadata = {
  title: 'Databank',
  description:
    'Synth artists, their records, the instruments those were made on, and the people who built them.',
};

export default async function BankRoute() {
  return <Welcome tab={DEFAULT_TAB} names={await readNames()} />;
}
