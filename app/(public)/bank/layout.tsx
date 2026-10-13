import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/synth/synth.css';

import { BankShell } from '@/components/app/bank/bank-shell';
import { readBrowseLists } from '@/components/app/bank/load';

/**
 * The databank (plan §4, `/bank` and `/bank/[tab]/[id]`): its tabs, search and list, around whichever page is open.
 *
 * A layout, so the list is read and sent once and stays as the visitor moves between pages. The faces are the
 * prototype's, from Fontsource, as the synth frame loads them (`app/(panel)/layout.tsx`); the label and display
 * classes are the synth page's (`synth.css`).
 */
export default async function BankLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <BankShell lists={await readBrowseLists()}>{children}</BankShell>;
}
