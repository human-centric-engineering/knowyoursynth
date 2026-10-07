/**
 * `/synths`: hands the listed ids to the component that reopens the last synth.
 *
 * @see app/(panel)/synths/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import SynthsRoute, { metadata } from '@/app/(panel)/synths/page';
import { ReopenSynth } from '@/components/app/synth/reopen-synth';
import { serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

vi.mock('@/components/app/synth/reopen-synth', () => ({ ReopenSynth: () => null }));

vi.mock('@/lib/api/server-fetch', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/server-fetch')>('@/lib/api/server-fetch');
  return { ...actual, serverFetch: vi.fn() };
});

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/synths', () => {
  it('reads the list and passes just the ids, in order, to ReopenSynth', async () => {
    vi.mocked(serverFetch).mockResolvedValue(
      Response.json({
        success: true,
        data: [
          { id: 'minimoog', name: 'Minimoog' },
          { id: 'model-d', name: 'Model D' },
        ],
      })
    );

    const el = (await SynthsRoute()) as ReactElement;

    expect(serverFetch).toHaveBeenCalledWith('/api/v1/synths');
    expect(el.type).toBe(ReopenSynth);
    expect(el.props).toEqual({ ids: ['minimoog', 'model-d'] });
  });

  it('passes an empty list through', async () => {
    vi.mocked(serverFetch).mockResolvedValue(Response.json({ success: true, data: [] }));
    const el = (await SynthsRoute()) as ReactElement;
    expect(el.props).toEqual({ ids: [] });
  });

  it('throws, and logs the code, on a failure envelope', async () => {
    vi.mocked(serverFetch).mockResolvedValue(
      Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } })
    );

    await expect(SynthsRoute()).rejects.toThrow('Could not read /api/v1/synths');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API read failed'), {
      code: 'INTERNAL_ERROR',
    });
  });

  it('titles the page', () => {
    expect(metadata.title).toBe('Synths');
  });
});
