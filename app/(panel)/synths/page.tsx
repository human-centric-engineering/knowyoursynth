import type { Metadata } from 'next';

import { ReopenSynth } from '@/components/app/synth/reopen-synth';
import { listSynths } from '@/lib/app/catalogue/read';

/**
 * `/synths`: reopens the last synth opened in this browser, or the first listed one.
 *
 * Owner ruling (journal, `f-model-d`): this stands in until a catalogue is planned. Which synths are listed, and in
 * what order, comes from the catalogue's read layer, the one `GET /api/v1/synths` serves (see `[id]/page.tsx` for why
 * in-process).
 */

export const metadata: Metadata = { title: 'Synths' };

export default async function SynthsRoute() {
  const synths = await listSynths();
  return <ReopenSynth ids={synths.map((s) => s.id)} />;
}
