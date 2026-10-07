/**
 * The synth route, `/synths/[id]`: the compiled-in definition plus what the API says about it.
 *
 * @see app/(panel)/synths/[id]/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';

import SynthRoute, { generateMetadata } from '@/app/(panel)/synths/[id]/page';
import { serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/components/app/synth/synth.css', () => ({}));

vi.mock('@/components/app/synth/synth-page', () => ({
  SynthPage: () => null,
}));

vi.mock('@/lib/api/server-fetch', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/server-fetch')>('@/lib/api/server-fetch');
  return { ...actual, serverFetch: vi.fn() };
});

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const props = (id: string, view?: string | string[]) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(view === undefined ? {} : { view }),
});

const ok = (data: unknown) => Response.json({ success: true, data });
const fail = (code: string) =>
  Response.json({ success: false, error: { code, message: 'no' } }, { status: 500 });

const DETAIL = { synth: { id: 'model-d' }, sounds: [], lineage: null, notes: {} };
const LIST = [{ id: 'model-d' }, { id: 'minimoog' }];

/** Route the two API paths the page reads. */
function api(detail: Response, list: Response = ok(LIST)) {
  vi.mocked(serverFetch).mockImplementation((path: string) =>
    Promise.resolve((path === '/api/v1/synths' ? list : detail).clone())
  );
}

const render = async (id: string, view?: string | string[]): Promise<ReactElement> => {
  const el = await SynthRoute(props(id, view));
  if (!isValidElement(el)) throw new Error('expected an element');
  return el;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/synths/[id]', () => {
  it('404s an id the registry does not have, before any fetch', async () => {
    await expect(SynthRoute(props('no-such-synth'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it('reads the detail and the list from the API', async () => {
    api(ok(DETAIL));
    await render('model-d');
    expect(
      vi
        .mocked(serverFetch)
        .mock.calls.map(([p]) => p)
        .sort()
    ).toEqual(['/api/v1/synths', '/api/v1/synths/model-d']);
  });

  it('404s when the API has no detail for it', async () => {
    api(new Response(null, { status: 404 }));
    await expect(SynthRoute(props('model-d'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('passes the detail, the listed synths, and the view to the page, keyed by synth', async () => {
    api(ok(DETAIL));
    const el = await render('model-d', 'long,outline');
    expect(el.props).toEqual({ detail: DETAIL, synths: LIST, viewParam: 'long,outline' });
    expect(el.key).toBe('model-d');
  });

  it('passes no view as null', async () => {
    api(ok(DETAIL));
    expect((await render('model-d')).props).toMatchObject({ viewParam: null });
  });

  it('passes an array view as null', async () => {
    api(ok(DETAIL));
    expect((await render('model-d', ['long', 'outline'])).props).toMatchObject({
      viewParam: null,
    });
  });

  it('passes a view longer than 32 characters as null, and one of 32 as it is', async () => {
    api(ok(DETAIL));
    expect((await render('model-d', 'x'.repeat(33))).props).toMatchObject({ viewParam: null });
    expect((await render('model-d', 'x'.repeat(32))).props).toMatchObject({
      viewParam: 'x'.repeat(32),
    });
  });

  it('still plays when the list read 404s: no other synths', async () => {
    api(ok(DETAIL), new Response(null, { status: 404 }));
    expect((await render('model-d')).props).toMatchObject({ synths: [] });
  });

  it('throws, and logs, on a failure envelope for the detail', async () => {
    api(fail('INTERNAL_ERROR'));
    await expect(SynthRoute(props('model-d'))).rejects.toThrow('/api/v1/synths/model-d');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('API read failed'),
      expect.objectContaining({ path: '/api/v1/synths/model-d', code: 'INTERNAL_ERROR' })
    );
  });

  it('throws on a failure envelope for the list', async () => {
    api(ok(DETAIL), fail('INTERNAL_ERROR'));
    await expect(SynthRoute(props('model-d'))).rejects.toThrow('Could not read /api/v1/synths');
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
