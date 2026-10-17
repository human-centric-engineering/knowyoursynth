/**
 * `/synths/[id]/s/[slug]`: a shared sound's page, its metadata and its social card (`f-sharing` h2).
 *
 * The reads are fakes; the definitions are the real registry's, so the card's colours are checked against each
 * synth's own theme. Pins:
 *
 * - a link and a published sound render the synth page with the sound, as the catalogue serves the synth (its design
 *   included);
 * - private, unknown and on another synth are each the 404, and so is a synth the registry or catalogue lacks;
 * - a link share is `noindex`; a published sound is canonical at its address;
 * - the card's colours are the synth's theme, so two synths give two cards, and the byline is the read's.
 *
 * @see app/(panel)/synths/[id]/s/[slug]/page.tsx
 * @see app/(panel)/synths/[id]/s/[slug]/opengraph-image.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { imageResponse } = vi.hoisted(() => ({ imageResponse: vi.fn() }));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: unknown) {
      imageResponse(element, options);
    }
  },
}));
// the suite's setup makes notFound a no-op; here it throws, as Next's does
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));
vi.mock('@/components/app/synth/synth-page', () => ({ SynthPage: () => null }));
vi.mock('@/lib/app/catalogue/read', () => ({ getSynthDetail: vi.fn(), listSynths: vi.fn() }));
vi.mock('@/lib/app/sounds/public', () => ({ getSharedSound: vi.fn() }));

import SharedSoundRoute, { generateMetadata } from '@/app/(panel)/synths/[id]/s/[slug]/page';
import Image from '@/app/(panel)/synths/[id]/s/[slug]/opengraph-image';
import { SocialCard } from '@/components/app/sharing/social-card';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import type { CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { getSharedSound } from '@/lib/app/sounds/public';
import type { PublicSound } from '@/lib/app/sounds/data';
import { getSynthDef } from '@/lib/app/synths/defs';

const SLUG = 'abcdefghjk';

const SOUND: PublicSound = {
  slug: SLUG,
  synthId: 'model-d',
  visibility: 'published',
  name: 'Glass pluck',
  notes: null,
  tags: [],
  publishedAt: '2026-10-16T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  source: null,
  basedOn: null,
  definitionVersion: 1,
  playable: true,
  panel: { values: {}, cables: [] },
  problems: [],
  fitted: null,
};

const DETAIL = {
  synth: { id: 'model-d', name: 'Model D', design: 'faithful' },
  sounds: [],
} as unknown as SynthDetail;
const SYNTHS = [{ id: 'model-d' }] as unknown as CatalogueSynth[];

const props = (id: string, slug = SLUG) => ({
  params: Promise.resolve({ id, slug }),
  searchParams: Promise.resolve({}),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSharedSound).mockResolvedValue(SOUND);
  vi.mocked(getSynthDetail).mockResolvedValue(DETAIL);
  vi.mocked(listSynths).mockResolvedValue(SYNTHS);
});

describe('the page', () => {
  it.each(['published', 'link'] as const)(
    'renders the synth page with a %s sound, and the synth as the catalogue serves it',
    async (visibility) => {
      const sound = { ...SOUND, visibility };
      vi.mocked(getSharedSound).mockResolvedValue(sound);
      const el = (await SharedSoundRoute(props('model-d'))) as ReactElement<{
        shared: PublicSound;
        detail: SynthDetail;
      }>;
      expect(el.type).toBe(SynthPage);
      expect(el.props.shared).toBe(sound);
      // the design is the catalogue's, not one the page picks
      expect(el.props.detail.synth.design).toBe('faithful');
      expect(getSharedSound).toHaveBeenCalledWith(SLUG);
    }
  );

  it('is the 404 for a sound the read does not serve (private, unknown, malformed)', async () => {
    vi.mocked(getSharedSound).mockResolvedValue(null);
    await expect(SharedSoundRoute(props('model-d'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/
    );
  });

  it('is the 404 for a sound shared on another synth', async () => {
    await expect(SharedSoundRoute(props('pro-1'))).rejects.toThrow(/404/);
  });

  it('is the 404 for a synth the registry lacks, before any read', async () => {
    await expect(SharedSoundRoute(props('no-such-synth'))).rejects.toThrow(/404/);
    expect(getSharedSound).not.toHaveBeenCalled();
  });

  it('is the 404 for a synth the catalogue does not serve', async () => {
    vi.mocked(getSynthDetail).mockResolvedValue(null);
    await expect(SharedSoundRoute(props('model-d'))).rejects.toThrow(/404/);
  });
});

describe('the metadata', () => {
  it('makes a published sound canonical at its address, and indexable', async () => {
    const meta = await generateMetadata(props('model-d'));
    expect(meta.title).toBe('Glass pluck · Model D');
    expect(meta.description).toContain('by @patchwork');
    expect(meta.alternates?.canonical).toBe(`/synths/model-d/s/${SLUG}`);
    expect(meta.robots).toBeUndefined();
  });

  it('keeps a link share out of search', async () => {
    vi.mocked(getSharedSound).mockResolvedValue({ ...SOUND, visibility: 'link', author: null });
    const meta = await generateMetadata(props('model-d'));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
    expect(meta.description).not.toContain('@');
  });

  it('gives a miss nothing about the sound', async () => {
    vi.mocked(getSharedSound).mockResolvedValue(null);
    expect(await generateMetadata(props('model-d'))).toEqual({ title: 'Not found' });
  });
});

describe('the social card', () => {
  it.each(['model-d', 'pro-1'])("draws %s's card in that synth's own theme", async (id) => {
    const def = getSynthDef(id)!;
    vi.mocked(getSharedSound).mockResolvedValue({ ...SOUND, synthId: id });
    await Image({ params: Promise.resolve({ id, slug: SLUG }) });

    const [element] = imageResponse.mock.calls[0] as [ReactElement<Record<string, unknown>>];
    expect(element.type).toBe(SocialCard);
    expect(element.props).toMatchObject({
      name: 'Glass pluck',
      synthName: def.name,
      maker: def.maker,
      author: 'patchwork',
      theme: def.theme,
    });
  });

  it('gives two synths with different faceplates two different cards', () => {
    const a = getSynthDef('model-d')!.theme;
    const b = getSynthDef('pro-1')!.theme;
    expect(a.panel).not.toBe(b.panel);
    const html = (theme: typeof a) =>
      renderToStaticMarkup(
        <SocialCard name="X" synthName="Y" maker="Z" author={null} theme={theme} brand="B" />
      );
    for (const theme of [a, b]) {
      const out = html(theme);
      expect(out).toContain(theme.panel);
      expect(out).toContain(theme.panel2);
      expect(out).toContain(theme.ink);
    }
  });

  it('has no card for a sound the page would 404', async () => {
    vi.mocked(getSharedSound).mockResolvedValue({ ...SOUND, synthId: 'pro-1' });
    await expect(Image({ params: Promise.resolve({ id: 'model-d', slug: SLUG }) })).rejects.toThrow(
      /404/
    );
    expect(imageResponse).not.toHaveBeenCalled();
  });
});
