// @vitest-environment happy-dom

/**
 * Reporting a shared sound from its page (`f-sharing` h4). Pins:
 *
 * - the strip offers Report to a signed-in visitor whose sound it is not, and to nobody else;
 * - nothing is sent until a reason is chosen; the request carries the reason and the trimmed note, or no note;
 * - sent, the dialog closes and the strip thanks them; refused, the dialog stays open and says why.
 *
 * The API client is a fake; `APIClientError` is the real one, as the client throws it.
 *
 * @see components/app/sharing/report-button.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReportButton } from '@/components/app/sharing/report-button';
import { SharedSoundStrip, type SharedViewer } from '@/components/app/sharing/shared-sound-strip';
import { APIClientError } from '@/lib/api/client';
import type { PublicSound } from '@/lib/app/sounds/data';

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, apiClient: api };
});

const SLUG = 'abcdefghjk';
const PATH = `/api/v1/public/sounds/${SLUG}/report`;

const SOUND: PublicSound = {
  slug: SLUG,
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
  definitionVersion: 1,
  playable: true,
  panel: { values: {}, cables: [] },
  problems: [],
  fitted: null,
};

const strip = (viewer: SharedViewer) =>
  render(
    <SharedSoundStrip
      sound={SOUND}
      loaded
      onLoad={vi.fn()}
      viewer={viewer}
      signInHref="/login"
      onCopy={vi.fn()}
      onOpen={vi.fn()}
      buttonClass="btn"
    />
  );

beforeEach(() => {
  api.post.mockReset();
  api.post.mockResolvedValue({ id: 'rep1' });
});

describe('the strip', () => {
  it('offers Report only to a signed-in visitor whose sound it is not', () => {
    for (const viewer of ['guest', 'pending', 'owner'] as const) {
      const { unmount } = strip(viewer);
      expect(screen.queryByRole('button', { name: 'Report' }), viewer).toBeNull();
      unmount();
    }
    strip('other');
    expect(screen.getByRole('button', { name: 'Report' })).toBeTruthy();
  });
});

describe('ReportButton', () => {
  const open = async () => {
    render(<ReportButton slug={SLUG} soundName="Their bass" buttonClass="btn" />);
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    return screen.getByRole('dialog');
  };

  it('sends nothing until a reason is chosen, then the reason and the trimmed note', async () => {
    const dialog = await open();
    const send = within(dialog).getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('radio', { name: "It's someone else's sound" }));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Anything to add/ }),
      '  The Lead preset  '
    );
    await userEvent.click(send);

    expect(api.post).toHaveBeenCalledWith(PATH, {
      body: { reason: 'not_theirs', note: 'The Lead preset' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Reported. Thanks');
  });

  it('sends no note when none is written', async () => {
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Spam' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Anything to add/ }), '   ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(api.post).toHaveBeenCalledWith(PATH, { body: { reason: 'spam' } });
  });

  it('keeps the dialog open and says why when the report is refused', async () => {
    api.post.mockRejectedValueOnce(new APIClientError('Too many', 'RATE_LIMIT_EXCEEDED', 429));
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Offensive or hateful' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      "That's as many reports as you can send today"
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    [new APIClientError('x', 'UNAUTHORIZED', 401), 'Your session has ended'],
    [new APIClientError('x', 'NOT_FOUND', 404), 'This sound is not shared any more.'],
    [
      new APIClientError("You can't report your own sound.", 'OWN_SOUND', 400),
      "You can't report your own sound.",
    ],
    [new Error('offline'), 'Check your connection'],
  ])('says what went wrong: %s', async (err, words) => {
    api.post.mockRejectedValueOnce(err);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Spam' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(words);
  });

  it('closes on Cancel without sending, and opens again with nothing said', async () => {
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull();
  });

  it('says a second report replaces the first', async () => {
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Spam' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('sending again replaces that report');
  });
});
