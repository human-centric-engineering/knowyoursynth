// @vitest-environment happy-dom

/**
 * Sharing one of the user's own sounds from the synth page (`f-sharing` h3). Pins:
 *
 * - private: Share with a link sends `visibility: 'link'`, and Publish… opens the dialog;
 * - shared by link: Copy link copies the sound's full address, Stop sharing sends `private`;
 * - published: Unpublish goes back to `link`, Stop sharing to `private`;
 * - the dialog: who it appears as, the tick before anything is sent, at most three of the library's tags, and the
 *   publish request with them;
 * - no username: the first step links to settings with the way back to this sound, and nothing is published;
 * - each refusal stays in the dialog in the server's words; `USERNAME_REQUIRED` turns it to the username step;
 * - a profile that could not be read never offers to choose a username.
 *
 * The API client is a fake; `APIClientError` is the real one, as the client throws it.
 *
 * @see components/app/sharing/sound-sharing.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SoundSharing } from '@/components/app/sharing/sound-sharing';
import { APIClientError } from '@/lib/api/client';
import type { UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, apiClient: api };
});

const SLUG = 'abcdefghjk';
const TAGS = ['bass', 'brass', 'keys', 'lead', 'pad'];

const summary = (over: Partial<UserSoundSummary> = {}): UserSoundSummary => ({
  id: 'cmmine1',
  synthId: 'model-d',
  name: 'Night bass',
  notes: 'Play it low.',
  definitionVersion: 1,
  source: null,
  basedOn: null,
  visibility: 'private',
  slug: null,
  publishedAt: null,
  tags: [],
  playable: true,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  ...over,
});

const detail = (over: Partial<UserSoundSummary> = {}): UserSoundDetail => ({
  ...summary(over),
  panel: { values: {}, cables: [] },
  problems: [],
  fitted: null,
});

const PROFILE = {
  username: 'patchwork',
  nextChangeAt: null,
  links: { youtube: null, spotify: null, instagram: null, bandcamp: null },
  public: true,
  showOwned: false,
  showWishlist: false,
};

const BACK = '/synths/model-d';

function renderSharing(sound: UserSoundSummary) {
  const onChanged = vi.fn();
  const view = render(
    <SoundSharing
      sound={sound}
      libraryTags={TAGS}
      backHref={BACK}
      onChanged={onChanged}
      buttonClass="btn"
    />
  );
  return { onChanged, ...view };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/v1/me/profile') return PROFILE;
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('a private sound', () => {
  it('says only its owner can open it, and Share with a link sends link', async () => {
    const shared = detail({ visibility: 'link', slug: SLUG });
    api.patch.mockResolvedValue(shared);
    const { onChanged } = renderSharing(summary());

    expect(screen.getByText('Private: only you can open it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    await userEvent.click(button('Share with a link'));

    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { visibility: 'link' },
    });
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(shared);
    expect(screen.getByRole('status').textContent).toMatch(/Anyone with the link can open it/);
  });

  it('shows the server’s words when sharing fails, and changes nothing', async () => {
    api.patch.mockRejectedValue(new APIClientError('Too many requests', 'RATE_LIMITED', 429));
    const { onChanged } = renderSharing(summary());
    await userEvent.click(button('Share with a link'));
    expect(screen.getByRole('alert').textContent).toBe('Too many requests');
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('another sound opened while a change is on its way', () => {
  it('hands the answer to the list but says nothing about it under the new sound', async () => {
    let answer: (d: UserSoundDetail) => void = () => undefined;
    api.patch.mockImplementation(
      () => new Promise<UserSoundDetail>((resolve) => (answer = resolve))
    );
    const onChanged = vi.fn();
    const props = { libraryTags: TAGS, backHref: BACK, onChanged, buttonClass: 'btn' };
    const { rerender } = render(
      <SoundSharing sound={summary({ visibility: 'link', slug: SLUG })} {...props} />
    );
    await userEvent.click(button('Stop sharing'));
    // while it is on its way, nothing that acts on the link is offered
    expect(button('Copy link').hasAttribute('disabled')).toBe(true);

    const other = summary({ id: 'cmmine2', name: 'Pad', visibility: 'link', slug: 'zyxwvutsrq' });
    rerender(<SoundSharing sound={other} {...props} />);
    // the new sound's buttons are its own, not held by the last one's request
    expect(button('Stop sharing').hasAttribute('disabled')).toBe(false);

    const stopped = detail({ visibility: 'private' });
    await act(async () => answer(stopped));
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(stopped);
    expect(screen.queryByRole('status')).toBeNull();
    expect(button('Stop sharing').hasAttribute('disabled')).toBe(false);
  });
});

describe('a sound shared by link', () => {
  it('links to its page and copies its full address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderSharing(summary({ visibility: 'link', slug: SLUG }));

    expect(screen.getByRole('link', { name: 'the link' }).getAttribute('href')).toBe(
      `/synths/model-d/s/${SLUG}`
    );
    // its notes go with it, so it says so
    expect(screen.getByText(/notes included/)).toBeTruthy();
    await userEvent.click(button('Copy link'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}/synths/model-d/s/${SLUG}`
    );
    expect(screen.getByRole('status').textContent).toBe('Link copied.');
  });

  it('says what to do when copying is blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    renderSharing(summary({ visibility: 'link', slug: SLUG }));
    await userEvent.click(button('Copy link'));
    expect(screen.getByRole('alert').textContent).toMatch(/Copying was blocked/);
  });

  it('Stop sharing sends private, and offers Publish but not Unpublish', async () => {
    api.patch.mockResolvedValue(detail({ visibility: 'private', slug: SLUG }));
    const { onChanged } = renderSharing(summary({ visibility: 'link', slug: SLUG }));
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
    expect(button('Publish…')).toBeTruthy();
    await userEvent.click(button('Stop sharing'));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { visibility: 'private' },
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('a published sound', () => {
  const PUBLISHED = summary({
    visibility: 'published',
    slug: SLUG,
    publishedAt: '2026-10-16T10:00:00.000Z',
    tags: ['bass'],
  });

  it('Unpublish goes back to a link share', async () => {
    api.patch.mockResolvedValue(detail({ visibility: 'link', slug: SLUG }));
    const { onChanged } = renderSharing(PUBLISHED);
    expect(screen.getByRole('link', { name: 'its page' }).getAttribute('href')).toBe(
      `/synths/model-d/s/${SLUG}`
    );
    expect(screen.queryByRole('button', { name: 'Publish…' })).toBeNull();
    await userEvent.click(button('Unpublish'));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { visibility: 'link' },
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/The link still works/);
  });

  it('Stop sharing makes it private', async () => {
    api.patch.mockResolvedValue(detail({ visibility: 'private', slug: SLUG }));
    renderSharing(PUBLISHED);
    await userEvent.click(button('Stop sharing'));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { visibility: 'private' },
    });
  });
});

describe('the publish dialog', () => {
  const openDialog = async (sound = summary()) => {
    const view = renderSharing(sound);
    await userEvent.click(button('Publish…'));
    const dialog = await screen.findByRole('dialog');
    return { ...view, dialog };
  };

  it('says who it appears as, and publishes nothing until the tick', async () => {
    const { dialog } = await openDialog();
    expect(await within(dialog).findByText('by @patchwork')).toBeTruthy();
    const publish = within(dialog).getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('takes at most three tags, and publishes with them and the confirmation', async () => {
    const published = detail({ visibility: 'published', slug: SLUG, tags: ['bass', 'keys'] });
    api.post.mockResolvedValue(published);
    const { dialog, onChanged } = await openDialog();
    await within(dialog).findByText('by @patchwork');

    for (const t of ['bass', 'brass', 'keys']) await userEvent.click(within(dialog).getByText(t));
    // three chosen: the rest cannot be, and one chosen can still be let go
    expect(within(dialog).getByRole('checkbox', { name: 'lead' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'pad' })).toBeDisabled();
    await userEvent.click(within(dialog).getByText('brass'));
    expect(within(dialog).getByRole('checkbox', { name: 'lead' })).not.toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /I made this, or the sound it came from/ })
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1/publish', {
      body: { confirm: true, tags: ['bass', 'keys'] },
    });
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(published);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/^Published/);
  });

  it('starts from the tags the sound had that the library still uses', async () => {
    const { dialog } = await openDialog(
      summary({ visibility: 'link', slug: SLUG, tags: ['pad', 'gone'] })
    );
    await within(dialog).findByText('by @patchwork');
    expect(within(dialog).getByRole('checkbox', { name: 'pad' })).toBeChecked();
    expect(within(dialog).queryByRole('checkbox', { name: 'gone' })).toBeNull();
  });

  it('with no username yet, sends them to choose one in settings and back to this sound', async () => {
    api.get.mockResolvedValue(null);
    const { dialog } = await openDialog();
    const link = await within(dialog).findByRole('link', { name: 'Choose a username' });
    expect(link.getAttribute('href')).toBe(
      `/settings?back=${encodeURIComponent(BACK)}#synth-profile`
    );
    expect(within(dialog).queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('never offers to choose a username when the profile could not be read', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(PROFILE);
    const { dialog } = await openDialog();
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/could not be checked/);
    expect(within(dialog).queryByRole('link', { name: 'Choose a username' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('by @patchwork')).toBeTruthy();
  });

  it.each([
    [
      'NOT_PLAYABLE',
      409,
      'This sound was saved on an older Model D. Open it and save it again before publishing.',
    ],
    ['NOT_ALLOWED', 422, 'Its name or notes have a word that cannot be published.'],
    ['DUPLICATE', 409, 'It plays the same as the sound it was copied from. Change it first.'],
    ['PUBLISH_LIMIT', 429, "That's 10 sounds published in a day, the limit. Try again tomorrow."],
    ['VALIDATION_ERROR', 400, "Model D's library has no tag bass"],
  ])('keeps the dialog open with the server’s words on %s', async (code, status, message) => {
    api.post.mockRejectedValue(new APIClientError(message, code, status));
    const { dialog, onChanged } = await openDialog();
    await within(dialog).findByText('by @patchwork');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I made this/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    expect(within(dialog).getByRole('alert').textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('turns to the username step when the server says one is needed', async () => {
    api.post.mockRejectedValue(
      new APIClientError('Choose a username first', 'USERNAME_REQUIRED', 409)
    );
    const { dialog } = await openDialog();
    await within(dialog).findByText('by @patchwork');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I made this/ }));
    await act(async () => userEvent.click(within(dialog).getByRole('button', { name: 'Publish' })));
    expect(within(dialog).getByRole('link', { name: 'Choose a username' })).toBeTruthy();
  });

  it('Cancel closes it without publishing', async () => {
    const { dialog } = await openDialog();
    await within(dialog).findByText('by @patchwork');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });
});
