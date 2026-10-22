// @vitest-environment happy-dom

/**
 * Sharing one of the user's patterns from the sequencer (`f-step-sequencer` t-83): each state's buttons and what they
 * send, Copy link, the publish step (the username read, the tick, no username yet), a refusal in the server's words,
 * and an unlisted pattern.
 *
 * @see components/app/sharing/pattern-sharing.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PatternSharing } from '@/components/app/sharing/pattern-sharing';
import type { UserPatternDetail } from '@/lib/app/patterns/data';
import { APIClientError } from '@/lib/api/client';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: api,
}));

const SLUG = 'abcdefghjk';
const pattern = (over: Partial<UserPatternDetail> = {}): UserPatternDetail => ({
  id: 'cmpat1',
  name: 'Acid walk',
  synthId: 'model-d',
  steps: 16,
  parts: 1,
  visibility: 'private',
  slug: null,
  publishedAt: null,
  unlisted: false,
  basedOn: null,
  pattern: null,
  problems: [],
  createdAt: '2026-10-22T10:00:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
  ...over,
});

const share = vi.fn();
const view = (p: UserPatternDetail) =>
  render(<PatternSharing pattern={p} share={share} backHref="/synths/model-d" />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};

beforeEach(() => {
  share.mockReset();
  api.get.mockReset().mockResolvedValue({ username: 'moog-fan' });
});

describe('PatternSharing', () => {
  it('shares a private pattern by link, then offers Copy link, Publish and Stop sharing', async () => {
    share.mockResolvedValue(pattern({ visibility: 'link', slug: SLUG }));
    view(pattern());
    expect(screen.getByText(/Only you can open it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull();
    await click('Share with a link');
    expect(share).toHaveBeenCalledWith('link');
    expect(screen.getByText('Shared by link.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Shared\. Anyone with the link/);
    expect(screen.getByRole('link', { name: 'Its page' }).getAttribute('href')).toBe(
      `/patterns/${SLUG}`
    );
    expect(button('Copy link')).toBeTruthy();
    expect(button('Publish…')).toBeTruthy();
    expect(button('Stop sharing')).toBeTruthy();
  });

  it('copies the full address', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    view(pattern({ visibility: 'link', slug: SLUG }));
    await click('Copy link');
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/patterns/${SLUG}`);
    expect(screen.getByText('Link copied.')).toBeTruthy();
  });

  it('publishes only once the tick is given, as the username the profile has', async () => {
    share.mockResolvedValue(pattern({ visibility: 'published', slug: SLUG }));
    view(pattern({ visibility: 'link', slug: SLUG }));
    await click('Publish…');
    await waitFor(() => expect(screen.getByText(/by @moog-fan/)).toBeTruthy());
    expect((button('Publish') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I made this pattern/));
    await click('Publish');
    expect(share).toHaveBeenCalledWith('published');
    expect(screen.getByText(/Listed on Explore and your profile/)).toBeTruthy();
    expect(button('Unpublish')).toBeTruthy();
  });

  it('sends someone with no username to choose one, back to this synth', async () => {
    api.get.mockResolvedValue(null);
    view(pattern());
    await click('Publish…');
    const link = await screen.findByRole('link', { name: 'Choose a username' });
    expect(link.getAttribute('href')).toBe(
      `/settings?back=${encodeURIComponent('/synths/model-d')}#synth-profile`
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it("shows a refusal in the server's words", async () => {
    share.mockRejectedValue(
      new APIClientError('That name can’t be published.', 'NOT_ALLOWED', 422)
    );
    view(pattern());
    await click('Publish…');
    await waitFor(() => expect(screen.getByLabelText(/I made this pattern/)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/I made this pattern/));
    await click('Publish');
    expect(screen.getByText('That name can’t be published.')).toBeTruthy();
    expect(screen.getByText(/Only you can open it/)).toBeTruthy();
  });

  it('says an unlisted pattern is unlisted, and offers only Stop sharing', () => {
    view(pattern({ visibility: 'published', slug: SLUG, unlisted: true }));
    expect(screen.getByText(/Moderators unlisted it/)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Stop sharing']);
    expect(screen.queryByRole('link', { name: 'Its page' })).toBeNull();
  });
});
