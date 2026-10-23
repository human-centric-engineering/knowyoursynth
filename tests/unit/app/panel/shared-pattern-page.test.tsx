/**
 * A shared pattern's pages (`f-step-sequencer` t-83): `/patterns/[slug]`, the address its owner copies, and
 * `/synths/[id]/p/[slug]`, the pattern on one synth, with their metadata.
 *
 * The reads are fakes; the definitions are the real registry's. Pins:
 *
 * - `/patterns/<slug>` sends the visitor to the synth it was made on, or the catalogue's first when that one is not
 *   served; a pattern the read does not serve is the 404;
 * - the synth page renders with the pattern on any synth the catalogue serves, signed out (no session is read);
 * - a link share is `noindex`; a published pattern is canonical at the synth it opens on, from every synth's page.
 *
 * That the page opens the sequencer on the pattern and plays it is `synth-page-shared-pattern.test.tsx`'s.
 *
 * @see app/(public)/patterns/[slug]/page.tsx
 * @see app/(panel)/synths/[id]/p/[slug]/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT;${to}`);
  }),
}));
vi.mock('@/components/app/synth/synth-page', () => ({ SynthPage: () => null }));
vi.mock('@/lib/app/catalogue/read', () => ({ getSynthDetail: vi.fn(), listSynths: vi.fn() }));
vi.mock('@/lib/app/patterns/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/patterns/public')>()),
  getSharedPattern: vi.fn(),
}));

import SharedPatternRoute, { generateMetadata } from '@/app/(panel)/synths/[id]/p/[slug]/page';
import PatternAddressRoute from '@/app/(public)/patterns/[slug]/page';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import type { CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { getSharedPattern } from '@/lib/app/patterns/public';
import type { PublicPattern } from '@/lib/app/patterns/data';
import { importPhrase } from '@/lib/app/sequencer/import';

const SLUG = 'abcdefghjk';

const PATTERN: PublicPattern = {
  slug: SLUG,
  visibility: 'published',
  name: 'Acid walk',
  synthId: 'pro-1',
  publishedAt: '2026-10-22T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  basedOn: null,
  pattern: importPhrase({ bpm: 120, loop: true, steps: [[0, 36, 1]] }),
  problems: [],
  steps: 4,
  parts: 1,
};

const DETAIL = { synth: { id: 'model-d', name: 'Model D' }, sounds: [] } as unknown as SynthDetail;
const SYNTHS = [
  { id: 'model-d', name: 'Model D' },
  { id: 'pro-1', name: 'Pro-1' },
] as unknown as CatalogueSynth[];

const props = (id: string, slug = SLUG) => ({
  params: Promise.resolve({ id, slug }),
  searchParams: Promise.resolve({}),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSharedPattern).mockResolvedValue(PATTERN);
  vi.mocked(getSynthDetail).mockResolvedValue(DETAIL);
  vi.mocked(listSynths).mockResolvedValue(SYNTHS);
});

describe('/patterns/[slug]', () => {
  const visit = (slug = SLUG) => PatternAddressRoute({ params: Promise.resolve({ slug }) });

  it('sends the visitor to the pattern on the synth it was made on', async () => {
    await expect(visit()).rejects.toThrow(`NEXT_REDIRECT;/synths/pro-1/p/${SLUG}`);
  });

  it("opens on the catalogue's first synth when the one it was made on is not served", async () => {
    vi.mocked(getSharedPattern).mockResolvedValue({ ...PATTERN, synthId: 'gone-synth' });
    await expect(visit()).rejects.toThrow(`NEXT_REDIRECT;/synths/model-d/p/${SLUG}`);
    vi.mocked(getSharedPattern).mockResolvedValue({ ...PATTERN, synthId: null });
    await expect(visit()).rejects.toThrow(`NEXT_REDIRECT;/synths/model-d/p/${SLUG}`);
  });

  it('is the 404 for a pattern the read does not serve, or with no synth to open on', async () => {
    vi.mocked(getSharedPattern).mockResolvedValue(null);
    await expect(visit()).rejects.toThrow(/404/);
    vi.mocked(getSharedPattern).mockResolvedValue(PATTERN);
    vi.mocked(listSynths).mockResolvedValue([]);
    await expect(visit()).rejects.toThrow(/404/);
  });
});

describe('/synths/[id]/p/[slug]', () => {
  it.each(['model-d', 'pro-1'])('renders the synth page with the pattern on %s', async (id) => {
    const el = (await SharedPatternRoute(props(id))) as ReactElement<{
      sharedPattern: PublicPattern;
      synths: CatalogueSynth[];
    }>;
    expect(el.type).toBe(SynthPage);
    expect(el.props.sharedPattern).toBe(PATTERN);
    // every served synth, for Play it on
    expect(el.props.synths).toBe(SYNTHS);
    expect(getSharedPattern).toHaveBeenCalledWith(SLUG);
  });

  it('is the 404 for a pattern the read does not serve', async () => {
    vi.mocked(getSharedPattern).mockResolvedValue(null);
    await expect(SharedPatternRoute(props('model-d'))).rejects.toThrow(/404/);
  });

  it('is the 404 on a synth the registry or the catalogue lacks', async () => {
    await expect(SharedPatternRoute(props('no-such-synth'))).rejects.toThrow(/404/);
    expect(getSharedPattern).not.toHaveBeenCalled();
    vi.mocked(listSynths).mockResolvedValue([SYNTHS[1]]);
    await expect(SharedPatternRoute(props('model-d'))).rejects.toThrow(/404/);
  });

  it('makes a published pattern canonical at the synth it opens on, from any synth', async () => {
    const meta = await generateMetadata(props('model-d'));
    expect(meta.title).toBe('Acid walk · pattern on the Model D');
    expect(meta.description).toContain('by @patchwork');
    expect(meta.alternates?.canonical).toBe(`/synths/pro-1/p/${SLUG}`);
    expect(meta.robots).toBeUndefined();
  });

  it('keeps a link share out of search, naming nobody the byline rule does not', async () => {
    vi.mocked(getSharedPattern).mockResolvedValue({
      ...PATTERN,
      visibility: 'link',
      author: null,
    });
    const meta = await generateMetadata(props('model-d'));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
    expect(meta.description).not.toContain('@');
  });

  it('gives a miss nothing about the pattern', async () => {
    vi.mocked(getSharedPattern).mockResolvedValue(null);
    expect(await generateMetadata(props('model-d'))).toEqual({ title: 'Not found' });
  });
});
