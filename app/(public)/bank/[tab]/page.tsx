import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { Welcome } from '@/components/app/bank/bank-detail';
import { DEFAULT_TAB, bankHref, isBankTab, tabLabel } from '@/components/app/bank/routes';
import { readNames } from '@/components/app/bank/load';

/** One databank tab with no row open. The default tab lives at `/bank`, so its own URL redirects there. */

type Props = { params: Promise<{ tab: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  return { title: isBankTab(tab) ? `${tabLabel(tab)} · Databank` : 'Databank' };
}

export default async function BankTabRoute({ params }: Props) {
  const { tab } = await params;
  if (!isBankTab(tab)) notFound();
  if (tab === DEFAULT_TAB) permanentRedirect(bankHref());
  return <Welcome tab={tab} names={await readNames()} />;
}
