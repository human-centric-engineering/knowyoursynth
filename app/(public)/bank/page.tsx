import type { Metadata } from 'next';

import { Welcome } from '@/components/app/bank/bank-detail';
import { DEFAULT_TAB } from '@/components/app/bank/routes';
import { readNames } from '@/components/app/bank/load';

/** `/bank`: the artists tab, as the prototype's databank opened on it. */

export const metadata: Metadata = { title: 'Databank' };

export default async function BankRoute() {
  return <Welcome tab={DEFAULT_TAB} names={await readNames()} />;
}
