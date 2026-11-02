// @vitest-environment happy-dom

/**
 * Admin — the pattern library's pages (`f-pattern-library` t-126): the filtered list, one pattern's editor and one
 * patch's order, each a thin shell over the admin API. Pins what each asks the API for, a 404 for what it does not
 * have, and a message in place of the page where a read failed.
 *
 * @see app/admin/synths/patterns/page.tsx
 * @see app/admin/synths/patterns/[id]/page.tsx
 * @see app/admin/synths/patterns/sounds/[synthId]/[slug]/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { adminLibraryPattern } from '@/tests/helpers/admin-library-pattern';

const mockServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: mockServerFetch,
  parseApiResponse: async (res: Response) => res.json(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn(), patch: vi.fn(), post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import PatternsAdminPage from '@/app/admin/synths/patterns/page';
import PatternAdminPage from '@/app/admin/synths/patterns/[id]/page';
import SoundPatternsAdminPage from '@/app/admin/synths/patterns/sounds/[synthId]/[slug]/page';

const ok = (data: unknown, meta?: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta }), { status: 200 });
const status = (code: number) => new Response('{}', { status: code });

const CHOICES = {
  synths: [{ id: 'model-d', name: 'Model D', maker: 'Moog' }],
  artists: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
  songs: [],
};

/** Answers each URL the page asks for. */
function api(routes: Record<string, () => Response>) {
  mockServerFetch.mockImplementation(async (url: string) => {
    const path = url.split('?')[0];
    const route = routes[path];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PatternsAdminPage', () => {
  it('passes its filters to the list API, and shows the page it gets back', async () => {
    api({
      '/api/v1/admin/library-patterns': () =>
        ok([adminLibraryPattern()], { page: 2, limit: 50, total: 120 }),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });

    render(
      await PatternsAdminPage({
        searchParams: Promise.resolve({ synth: 'model-d', role: ['arp', 'held'], page: '2' }),
      })
    );

    expect(mockServerFetch).toHaveBeenCalledWith(
      '/api/v1/admin/library-patterns?synth=model-d&page=2&limit=50'
    );
    expect(screen.getByRole('link', { name: 'Funk bass' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns/cpat000000000000000000001'
    );
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Synth')).toHaveValue('model-d');
  });

  it('passes the admin-control filters too, and offers the bulk bar (t-156)', async () => {
    api({
      '/api/v1/admin/library-patterns': () =>
        ok([adminLibraryPattern({ rightsRisk: 'needs_review', status: 'disabled' })], {
          page: 1,
          limit: 50,
          total: 1,
        }),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });
    render(
      await PatternsAdminPage({
        searchParams: Promise.resolve({
          origin: 'ai_generated',
          rights: 'needs_review',
          status: 'disabled',
        }),
      })
    );
    expect(mockServerFetch).toHaveBeenCalledWith(
      '/api/v1/admin/library-patterns?origin=ai_generated&rights=needs_review&status=disabled&limit=50'
    );
    expect(
      within(screen.getByRole('form', { name: 'Filter patterns' })).getByLabelText('Status')
    ).toHaveValue('disabled');
    expect(screen.getByRole('region', { name: 'Change several' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Choose Funk bass' })).toHaveAttribute(
      'value',
      'cpat000000000000000000001'
    );
    const row = screen.getByRole('link', { name: 'Funk bass' }).closest('tr')!;
    expect(row).toHaveTextContent('Needs review');
    expect(row).toHaveTextContent('Disabled');
  });

  it('asks for the first page with no filters', async () => {
    api({
      '/api/v1/admin/library-patterns': () => ok([]),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });
    render(await PatternsAdminPage({ searchParams: Promise.resolve({ page: 'x' }) }));
    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/library-patterns?limit=50');
    expect(screen.getByText('The library is empty.')).toBeInTheDocument();
  });

  it('says so when the list or the choices could not be loaded', async () => {
    api({
      '/api/v1/admin/library-patterns': () => status(400),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });
    const { unmount } = render(await PatternsAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    unmount();

    api({
      '/api/v1/admin/library-patterns': () => ok([]),
      '/api/v1/admin/library-patterns/choices': () => {
        throw new Error('down');
      },
    });
    render(await PatternsAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('PatternAdminPage', () => {
  const props = (id: string) => ({ params: Promise.resolve({ id }) });

  it('edits the pattern the API returns, with the choices', async () => {
    api({
      '/api/v1/admin/library-patterns/cpat000000000000000000001': () =>
        ok(adminLibraryPattern({ editedAt: '2026-11-01T00:00:00.000Z' })),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });

    render(await PatternAdminPage(props('cpat000000000000000000001')));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Funk bass');
    expect(heading).toHaveTextContent('Edited');
    expect(screen.getByText('riff:model-d/funk-bass')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit pattern' })).toBeInTheDocument();
  });

  it('shows the provenance panel, with the comments and history it reads (t-156)', async () => {
    api({
      '/api/v1/admin/library-patterns/cpat000000000000000000001': () =>
        ok(adminLibraryPattern({ status: 'disabled', statusReason: 'Too close' })),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
      '/api/v1/admin/library-patterns/cpat000000000000000000001/comments': () =>
        ok([
          {
            id: 'k1',
            body: 'Heard it.',
            author: { id: 'u1', name: 'Jo' },
            createdAt: '2026-11-01T09:30:00.000Z',
          },
        ]),
      '/api/v1/admin/library-patterns/cpat000000000000000000001/history': () => status(500),
    });

    render(await PatternAdminPage(props('cpat000000000000000000001')));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Disabled');
    const panel = screen.getByRole('region', { name: /Provenance/ });
    expect(panel).toHaveTextContent('Too close');
    expect(panel).toHaveTextContent('Heard it.');
    expect(panel).toHaveTextContent('The history could not be loaded');
  });

  it('is a 404 for a pattern the API does not have, or an id that cannot be one', async () => {
    for (const code of [404, 400]) {
      api({
        '/api/v1/admin/library-patterns/nope': () => status(code),
        '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
      });
      await expect(PatternAdminPage(props('nope'))).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('names a stored pattern that no longer parses rather than edit it', async () => {
    api({
      '/api/v1/admin/library-patterns/c1': () =>
        ok({ id: 'c1', key: 'admin:c1', name: 'Broken', problem: 'It no longer parses' }),
      '/api/v1/admin/library-patterns/choices': () => ok(CHOICES),
    });
    render(await PatternAdminPage(props('c1')));
    expect(screen.getByRole('alert')).toHaveTextContent('It no longer parses');
    expect(screen.queryByRole('form', { name: 'Edit pattern' })).toBeNull();
  });

  it('says so when the pattern could not be loaded', async () => {
    api({
      '/api/v1/admin/library-patterns/c1': () => {
        throw new Error('down');
      },
      '/api/v1/admin/library-patterns/choices': () => status(500),
    });
    render(await PatternAdminPage(props('c1')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('SoundPatternsAdminPage', () => {
  const props = { params: Promise.resolve({ synthId: 'model-d', slug: 'funk-bass' }) };
  const url = '/api/v1/admin/synths/model-d/sounds/funk-bass/patterns';

  it('orders the patch’s patterns, linking back to the patch in the catalogue', async () => {
    api({
      [url]: () =>
        ok({
          synthId: 'model-d',
          slug: 'funk-bass',
          name: 'Funk bass',
          patterns: [adminLibraryPattern()],
        }),
    });

    render(await SoundPatternsAdminPage(props));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Funk bass');
    expect(screen.getByRole('link', { name: 'Edit the patch' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d/sounds/funk-bass'
    );
    expect(screen.getByRole('button', { name: 'Save order' })).toBeInTheDocument();
  });

  it('is a 404 for a patch the API does not have', async () => {
    api({ [url]: () => status(404) });
    await expect(SoundPatternsAdminPage(props)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('says so when the patterns could not be loaded', async () => {
    api({ [url]: () => status(500) });
    const { unmount } = render(await SoundPatternsAdminPage(props));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    unmount();

    api({
      [url]: () => {
        throw new Error('down');
      },
    });
    render(await SoundPatternsAdminPage(props));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
