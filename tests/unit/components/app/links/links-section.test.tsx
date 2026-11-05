// @vitest-environment happy-dom

/**
 * Unit Tests: the videos and links section under a panel and on `/bank` (`f-videos-and-links` t-182).
 *
 * Pins: the closed section teases the count and kinds and reads nothing; the list is read once, on opening; no
 * iframe before a card is pressed; a pressed card's iframe is the address `embedUrl` derives, for each provider; a
 * plain link (and an embed address off the players' origins) opens in a new tab with `noopener`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiClient: { get } }));

import { LinksSection } from '@/components/app/links/links-section';
import { embedUrl, type LinkProvider } from '@/lib/app/links/providers';

/** A link as the API serves it, its embed built as the server builds it. */
function link(provider: LinkProvider, providerId: string | null, title: string, ours = false) {
  return {
    id: `id-${title}`,
    url:
      provider === 'other'
        ? 'https://example.com/minimoog-review'
        : `https://www.${provider}.com/x/${title}`,
    provider,
    kind: 'demo',
    title,
    thumbnailUrl:
      provider === 'youtube' ? `https://i.ytimg.com/vi/${providerId}/hqdefault.jpg` : null,
    embedUrl: embedUrl(provider, providerId),
    ours,
    views: provider === 'youtube' ? 1_250_000 : null,
  };
}

const PLAYERS = [
  link('youtube', 'dQw4w9WgXcQ', 'A YouTube demo', true),
  link('vimeo', '123456:abcdef1234', 'A Vimeo lesson'),
  link('spotify', 'track/4uLU6hMCjMI75M1A2tKUQC', 'A Spotify record'),
  link('bandcamp', 'album=1234567', 'A Bandcamp album'),
  link('soundcloud', 'artist/a-track', 'A SoundCloud track'),
];
const OTHER = link('other', null, 'A review on the web');

const summary = { count: 6, kinds: ['demo' as const, 'review' as const, 'lesson' as const] };

const section = () => render(<LinksSection target="synth" id="model-d" summary={summary} />);
const opener = () => screen.getByRole('button', { name: /Videos and links/ });

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue([...PLAYERS, OTHER]);
});

describe('LinksSection', () => {
  it('says how many there are, and of which kinds, and reads nothing until it is opened', () => {
    section();

    expect(opener().getAttribute('aria-expanded')).toBe('false');
    expect(opener().textContent).toContain('6 · demos, reviews and lessons');
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('reads the list on opening, once, for its target', async () => {
    section();

    fireEvent.click(opener());
    expect(await screen.findAllByRole('listitem')).toHaveLength(6);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/v1/links', { params: { synth: 'model-d' } });

    // Closed and opened again, it keeps the list it read.
    fireEvent.click(opener());
    fireEvent.click(opener());
    expect(get).toHaveBeenCalledTimes(1);
    expect(opener().getAttribute('aria-expanded')).toBe('true');
  });

  it('reads an instrument’s list by its own key', async () => {
    render(<LinksSection target="instrument" id="moog-minimoog" summary={summary} />);
    fireEvent.click(opener());
    await screen.findAllByRole('listitem');
    expect(get).toHaveBeenCalledWith('/api/v1/links', { params: { instrument: 'moog-minimoog' } });
  });

  it('loads no player before a card is pressed', async () => {
    const { container } = section();
    fireEvent.click(opener());

    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(PLAYERS.length);
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });

  it.each(PLAYERS.map((p) => [p.provider, p] as const))(
    'plays %s from the address embedUrl derives',
    async (_provider, player) => {
      const { container } = section();
      fireEvent.click(opener());

      fireEvent.click(
        await screen.findByRole('button', { name: new RegExp(`^Play ${player.title}`) })
      );

      const frames = container.querySelectorAll('iframe');
      expect(frames).toHaveLength(1);
      expect(player.embedUrl).toBeTruthy();
      expect(frames[0].getAttribute('src')).toBe(player.embedUrl);
      expect(frames[0].getAttribute('title')).toBe(player.title);
    }
  );

  it('opens a plain link in a new tab, with noopener, and never embeds it', async () => {
    const { container } = section();
    fireEvent.click(opener());

    const card = (await screen.findByText(OTHER.title)).closest('li');
    if (!card) throw new Error('expected the card');
    expect(within(card).queryByRole('button')).toBeNull();
    const a = within(card).getByRole('link');
    expect(a.getAttribute('href')).toBe(OTHER.url);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('never frames an address off the players’ origins, whatever the response says', async () => {
    get.mockResolvedValue([
      { ...PLAYERS[0], embedUrl: 'https://evil.example.com/embed/x' },
      { ...PLAYERS[1], embedUrl: 'https://player.vimeo.com.evil.example.com/video/1' },
    ]);
    const { container } = section();
    fireEvent.click(opener());

    await screen.findAllByRole('listitem');
    expect(screen.queryAllByRole('button', { name: /^Play / })).toHaveLength(0);
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    for (const a of screen.getAllByRole('link')) expect(a.getAttribute('target')).toBe('_blank');
  });

  it('labels ours, each kind and YouTube’s views', async () => {
    section();
    fireEvent.click(opener());

    const first = (await screen.findAllByRole('listitem'))[0];
    expect(within(first).getByText('Know Your Synth')).toBeTruthy();
    expect(within(first).getByText('Demo')).toBeTruthy();
    expect(within(first).getByText('· 1.3M views')).toBeTruthy();
  });

  it('says so when the list cannot be read, and tries again', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    section();
    fireEvent.click(opener());

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('is not drawn for a target with none', () => {
    const { container } = render(
      <LinksSection target="synth" id="model-d" summary={{ count: 0, kinds: [] }} />
    );
    expect(container.innerHTML).toBe('');
  });
});
