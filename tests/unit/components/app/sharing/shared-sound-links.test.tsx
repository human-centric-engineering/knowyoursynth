// @vitest-environment happy-dom

/**
 * A shared sound's links on its page (`f-link-suggestions` t-187). Pins:
 *
 * - a sound with no links shows no section;
 * - each link is a `LinkCard`, in the owner's order, and pressing Play loads the player from `embedUrl`, never from the
 *   stored address;
 * - an embed address that is not on one of the embed origins is dropped where it is used, and the link opens in a new
 *   tab instead.
 *
 * @see components/app/sharing/shared-sound-strip.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SharedSoundStrip } from '@/components/app/sharing/shared-sound-strip';
import type { PublicSound, SoundLink } from '@/lib/app/sounds/data';

const VIDEO = 'dQw4w9WgXcQ';

const SOUND: PublicSound = {
  slug: 'abcdefghjk',
  synthId: 'model-d',
  visibility: 'published',
  name: 'Their bass',
  notes: null,
  tags: [],
  publishedAt: '2026-10-17T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  source: null,
  basedOn: null,
  fromTutor: false,
  lesson: null,
  links: [],
  definitionVersion: 1,
  playable: true,
  panel: { values: {}, cables: [] },
  problems: [],
  fitted: null,
};

const YOUTUBE: SoundLink = {
  url: `https://www.youtube.com/watch?v=${VIDEO}`,
  provider: 'youtube',
  title: 'My demo',
  thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
};

const strip = (links: SoundLink[]) =>
  render(
    <SharedSoundStrip
      sound={{ ...SOUND, links }}
      loaded
      onLoad={vi.fn()}
      viewer="guest"
      signInHref="/login"
      onCopy={vi.fn()}
      onOpen={vi.fn()}
      buttonClass="btn"
    />
  );

describe("a shared sound's links", () => {
  it('shows no section when it has none', () => {
    strip([]);
    expect(screen.queryByRole('region', { name: 'Videos and recordings' })).toBeNull();
  });

  it("draws a card for each, in the owner's order, and plays from embedUrl", async () => {
    strip([
      YOUTUBE,
      {
        url: 'https://vimeo.com/76979871',
        provider: 'vimeo',
        title: 'Second',
        thumbnailUrl: null,
        embedUrl: 'https://player.vimeo.com/video/76979871?dnt=1',
      },
    ]);
    const section = screen.getByRole('region', { name: 'Videos and recordings' });
    const cards = within(section).getAllByRole('listitem');
    expect(
      cards.map((c) => within(c).getByText(/My demo|Second/, { selector: 'p' }).textContent)
    ).toEqual(['My demo', 'Second']);
    // nothing of the provider's loads until it is pressed
    expect(section.querySelector('iframe')).toBeNull();

    await userEvent.click(within(cards[0]).getByRole('button', { name: /Play My demo/ }));
    const player = section.querySelector('iframe');
    expect(player?.getAttribute('src')).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1`
    );
  });

  it('drops an embed that is not on an embed origin, and opens the link in a new tab instead', () => {
    strip([{ ...YOUTUBE, embedUrl: 'https://evil.example/embed' }]);
    const section = screen.getByRole('region', { name: 'Videos and recordings' });
    expect(within(section).queryByRole('button', { name: /Play/ })).toBeNull();
    const link = within(section).getByRole('link', { name: /My demo/ });
    expect(link.getAttribute('href')).toBe(YOUTUBE.url);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
