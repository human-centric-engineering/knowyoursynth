import type { Metadata } from 'next';

import { ReopenSynth } from '@/components/app/synth/reopen-synth';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import { logger } from '@/lib/logging';

/**
 * `/synths`: reopens the last synth opened in this browser, or the first listed one.
 *
 * Owner ruling (journal, `f-model-d`): this stands in until a catalogue is planned. Which synths are listed, and in
 * what order, comes from the API.
 */

export const metadata: Metadata = { title: 'Synths' };

export default async function SynthsRoute() {
  const res = await serverFetch('/api/v1/synths');
  const body = await parseApiResponse<CatalogueSynth[]>(res);
  if (!body.success) {
    logger.error('synths page: API read failed', { code: body.error.code });
    throw new Error('Could not read /api/v1/synths');
  }
  return <ReopenSynth ids={body.data.map((s) => s.id)} />;
}
