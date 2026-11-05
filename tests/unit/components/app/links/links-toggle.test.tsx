// @vitest-environment happy-dom

/**
 * Unit Tests: a patch's or a record's videos and links behind one button (`f-videos-and-links` t-183).
 *
 * Pins: nothing is drawn without links; closed, it says how many and of which kinds and reads nothing; the list is
 * read once, on the first press, for its target; the cards are `LinkCard`'s, a link from the patch's inspiration
 * marked with where it came from; a failed read offers to try again; the container is told when it opens and closes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiClient: { get } }));

import { LinksToggle } from '@/components/app/links/links-toggle';

const OWN = {
  id: 'own',
  url: 'https://example.com/walk-through',
  provider: 'other',
  kind: 'lesson',
  title: 'How this patch is made',
  thumbnailUrl: null,
  embedUrl: null,
  ours: true,
  views: null,
  via: null,
};
const ORIGINAL = {
  id: 'orig',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  provider: 'youtube',
  kind: 'original',
  title: 'Autobahn (1974)',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ours: false,
  views: 12_000_000,
  via: { kind: 'song', id: 'kraftwerk-autobahn', name: 'Autobahn' },
};

const summary = { count: 2, kinds: ['lesson' as const, 'original' as const] };
const button = () => screen.getByRole('button', { name: /Videos and links/ });

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue([OWN, ORIGINAL]);
});

describe('LinksToggle', () => {
  it.each([
    ['no count', undefined],
    ['a count of none', { count: 0, kinds: [] }],
  ])('draws nothing for %s', (_, none) => {
    const { container } = render(
      <LinksToggle
        target="sound"
        id="model-d/autobahn-lead"
        summary={none}
        label="Videos and links"
      />
    );
    expect(container.innerHTML).toBe('');
    expect(get).not.toHaveBeenCalled();
  });

  it('says how many and of which kinds, closed, and reads nothing until pressed', () => {
    render(
      <LinksToggle
        target="sound"
        id="model-d/autobahn-lead"
        summary={summary}
        label="Videos and links"
      />
    );
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().textContent).toContain('lessons and originals');
    expect(button().textContent).toContain('2');
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads the list once, on the first press, and shows the cards, the inherited one marked', async () => {
    const onOpenChange = vi.fn();
    render(
      <LinksToggle
        target="sound"
        id="model-d/autobahn-lead"
        summary={summary}
        label="Videos and links"
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.click(button());
    const cards = await screen.findAllByRole('listitem');

    expect(get).toHaveBeenCalledWith('/api/v1/links', {
      params: { sound: 'model-d/autobahn-lead' },
    });
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining('How this patch is made'),
      expect.stringContaining('From Autobahn'),
    ]);
    expect(cards[0].textContent).not.toContain('From ');
    // Click to embed: no player before a card is pressed.
    expect(document.querySelector('iframe')).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(button());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(button());
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reads a record by its id', async () => {
    render(
      <LinksToggle
        target="song"
        id="kraftwerk-autobahn"
        summary={summary}
        label="Watch and listen"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Watch and listen/ }));
    await screen.findAllByRole('listitem');
    expect(get).toHaveBeenCalledWith('/api/v1/links', { params: { song: 'kraftwerk-autobahn' } });
  });

  it('offers to try again when the read fails, and reads again when asked', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    render(
      <LinksToggle
        target="sound"
        id="model-d/autobahn-lead"
        summary={summary}
        label="Videos and links"
      />
    );

    fireEvent.click(button());
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
