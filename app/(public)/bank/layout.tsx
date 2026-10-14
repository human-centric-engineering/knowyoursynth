import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/synth/synth.css';

import type { Metadata } from 'next';

import { BankShell } from '@/components/app/bank/bank-shell';
import { readBrowseLists } from '@/components/app/bank/load';

/**
 * The databank (plan §4, `/bank` and `/bank/[tab]/[id]`): its tabs, search and list, around whichever page is open.
 *
 * A layout, so the list is read and sent once and stays as the visitor moves between pages. The faces are the
 * prototype's, from Fontsource, as the synth frame loads them (`app/(panel)/layout.tsx`); the label and display
 * classes are the synth page's (`synth.css`).
 */
// Every databank page's description unless it says more about itself (a row's page does).
export const metadata: Metadata = {
  description:
    'Synth artists, their records, the instruments those were made on, and the people who built them.',
};

export default async function BankLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <BankShell lists={await readBrowseLists()}>{children}</BankShell>;
}
