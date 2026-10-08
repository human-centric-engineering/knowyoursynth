/**
 * The synth route, `/synths/[id]`: the compiled-in definition plus what the catalogue says about it, read through
 * the same read layer the API serves.
 *
 * @see app/(panel)/synths/[id]/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';

import SynthRoute, { generateMetadata } from '@/app/(panel)/synths/[id]/page';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import type { CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/components/app/synth/synth.css', () => ({}));

vi.mock('@/components/app/synth/synth-page', () => ({
  SynthPage: () => null,
}));

vi.mock('@/lib/app/catalogue/read', () => ({
  getSynthDetail: vi.fn(),
  listSynths: vi.fn(),
}));

const props = (id: string, view?: string | string[]) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(view === undefined ? {} : { view }),
});

const DETAIL = {
  synth: { id: 'model-d' },
  sounds: [],
  lineage: null,
  notes: {},
} as unknown as SynthDetail;
const LIST = [{ id: 'model-d' }, { id: 'minimoog' }] as unknown as CatalogueSynth[];

const render = async (id: string, view?: string | string[]): Promise<ReactElement> => {
  const el = await SynthRoute(props(id, view));
  if (!isValidElement(el)) throw new Error('expected an element');
  return el;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSynthDetail).mockResolvedValue(DETAIL);
  vi.mocked(listSynths).mockResolvedValue(LIST);
});

describe('/synths/[id]', () => {
  it('404s an id the registry does not have, before any read', async () => {
    await expect(SynthRoute(props('no-such-synth'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(getSynthDetail).not.toHaveBeenCalled();
    expect(listSynths).not.toHaveBeenCalled();
  });

  it('reads the synth and the list through the catalogue read layer', async () => {
    await render('model-d');
    expect(getSynthDetail).toHaveBeenCalledWith('model-d');
    expect(listSynths).toHaveBeenCalledTimes(1);
  });

  it('404s when the catalogue does not serve it (not listed)', async () => {
    vi.mocked(getSynthDetail).mockResolvedValue(null);
    await expect(SynthRoute(props('model-d'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('passes the detail, the listed synths, and the view to the page, keyed by synth', async () => {
    const el = await render('model-d', 'long,outline');
    expect(el.props).toEqual({ detail: DETAIL, synths: LIST, viewParam: 'long,outline' });
    expect(el.key).toBe('model-d');
  });

  it('passes no view as null', async () => {
    expect((await render('model-d')).props).toMatchObject({ viewParam: null });
  });

  it('passes an array view as null', async () => {
    expect((await render('model-d', ['long', 'outline'])).props).toMatchObject({
      viewParam: null,
    });
  });

  it('passes a view longer than 32 characters as null, and one of 32 as it is', async () => {
    expect((await render('model-d', 'x'.repeat(33))).props).toMatchObject({ viewParam: null });
    expect((await render('model-d', 'x'.repeat(32))).props).toMatchObject({
      viewParam: 'x'.repeat(32),
    });
  });

  it('lets a failed read reach the error boundary', async () => {
    vi.mocked(getSynthDetail).mockRejectedValue(new Error('db down'));
    await expect(SynthRoute(props('model-d'))).rejects.toThrow('db down');
  });
});

describe('generateMetadata', () => {
  it('titles the page with the definition name', async () => {
    const { title } = await generateMetadata(props('model-d'));
    expect(title).toBe('Model D');
  });

  it('titles an unknown id plainly, and does not echo it', async () => {
    const { title } = await generateMetadata(props('<b>x</b>'));
    expect(title).toBe('Synth');
  });
});
