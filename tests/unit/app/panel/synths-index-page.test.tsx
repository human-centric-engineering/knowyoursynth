/**
 * `/synths`: hands the listed ids to the component that reopens the last synth.
 *
 * @see app/(panel)/synths/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import SynthsRoute, { metadata } from '@/app/(panel)/synths/page';
import { ReopenSynth } from '@/components/app/synth/reopen-synth';
import { listSynths } from '@/lib/app/catalogue/read';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';

vi.mock('@/components/app/synth/reopen-synth', () => ({ ReopenSynth: () => null }));
vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/synths', () => {
  it('reads the list and passes just the ids, in order, to ReopenSynth', async () => {
    vi.mocked(listSynths).mockResolvedValue([
      { id: 'minimoog', name: 'Minimoog' },
      { id: 'model-d', name: 'Model D' },
    ] as unknown as CatalogueSynth[]);

    const el = (await SynthsRoute()) as ReactElement;

    expect(el.type).toBe(ReopenSynth);
    expect(el.props).toEqual({ ids: ['minimoog', 'model-d'] });
  });

  it('passes an empty list through', async () => {
    vi.mocked(listSynths).mockResolvedValue([]);
    const el = (await SynthsRoute()) as ReactElement;
    expect(el.props).toEqual({ ids: [] });
  });

  it('titles the page', () => {
    expect(metadata.title).toBe('Synths');
  });
});
