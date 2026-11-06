// @vitest-environment happy-dom

/**
 * Editing a sound's links from My patches (`f-link-suggestions` t-187). Pins:
 *
 * - it opens with the sound's links, in order, and saves the whole list, an empty title left out;
 * - a row with no address is refused before anything is sent;
 * - the server's refusals land on the rows they name; one it names no row for is said as it said it;
 * - no more than five rows can be added; removing the last link saves an empty list.
 *
 * The API client is a fake; `APIClientError` is the real one, as the client throws it.
 *
 * @see components/app/synth/sound-links-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SoundLinksForm } from '@/components/app/synth/sound-links-form';
import { APIClientError } from '@/lib/api/client';
import type { UserSoundSummary } from '@/lib/app/sounds/data';

const { api } = vi.hoisted(() => ({ api: { patch: vi.fn() } }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, apiClient: api };
});

const VIDEO = 'dQw4w9WgXcQ';

const SOUND: UserSoundSummary = {
  id: 'cmmine1',
  synthId: 'model-d',
  name: 'Bass',
  notes: null,
  definitionVersion: 1,
  source: null,
  basedOn: null,
  fromTutor: false,
  lesson: null,
  visibility: 'link',
  slug: 'abcdefghjk',
  publishedAt: null,
  tags: [],
  unlisted: false,
  patternId: null,
  links: [
    {
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      title: 'My demo',
      thumbnailUrl: null,
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    },
  ],
  playable: true,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

function form(sound: UserSoundSummary = SOUND) {
  const onSaved = vi.fn();
  render(<SoundLinksForm sound={sound} onSaved={onSaved} onCancel={vi.fn()} buttonClass="btn" />);
  return { onSaved };
}

beforeEach(() => {
  api.patch.mockReset();
  api.patch.mockImplementation(async () => ({ ...SOUND, links: [] }));
});

describe('the links form', () => {
  it("opens with the sound's links and saves the whole list, in order, an empty title left out", async () => {
    const { onSaved } = form();
    expect(screen.getByRole('textbox', { name: /^Address/ })).toHaveProperty(
      'value',
      SOUND.links[0].url
    );
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveProperty('value', 'My demo');

    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    await userEvent.type(
      screen.getAllByRole('textbox', { name: /^Address/ })[1],
      'https://vimeo.com/76979871'
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Move up' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save links' }));

    expect(api.patch).toHaveBeenCalledWith('/api/v1/sounds/cmmine1', {
      body: {
        links: [
          { url: 'https://vimeo.com/76979871' },
          { url: SOUND.links[0].url, title: 'My demo' },
        ],
      },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('refuses a row with no address before anything is sent', async () => {
    form();
    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save links' }));
    expect(screen.getByText('Paste the address')).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('puts the server’s refusals on the rows they name', async () => {
    api.patch.mockRejectedValue(
      new APIClientError('Only YouTube…', 'VALIDATION_ERROR', 400, {
        errors: [
          {
            path: 'links.0.url',
            message:
              'Only YouTube, Vimeo, Spotify, Bandcamp and SoundCloud links can go on a patch.',
          },
        ],
      })
    );
    const { onSaved } = form();
    await userEvent.click(screen.getByRole('button', { name: 'Save links' }));
    expect(
      await screen.findByText(
        'Only YouTube, Vimeo, Spotify, Bandcamp and SoundCloud links can go on a patch.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /^Address/ }).getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("says a refusal it cannot place in the server's words", async () => {
    api.patch.mockRejectedValue(
      new APIClientError(
        "A link's title can't be published. Change the title, or remove the link, and try again.",
        'NOT_ALLOWED',
        422
      )
    );
    form();
    await userEvent.click(screen.getByRole('button', { name: 'Save links' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /A link's title can't be published/
    );
  });

  it('offers no sixth row, and removing the last link saves an empty list', async () => {
    form();
    for (let i = 0; i < 4; i++)
      await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    expect(screen.getAllByRole('textbox', { name: /^Address/ })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Add a link' })).toBeNull();

    for (const remove of screen.getAllByRole('button', { name: 'Remove' }).reverse())
      await userEvent.click(remove);
    expect(screen.getByText('No links on it yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save links' }));
    expect(api.patch).toHaveBeenCalledWith('/api/v1/sounds/cmmine1', { body: { links: [] } });
  });
});
