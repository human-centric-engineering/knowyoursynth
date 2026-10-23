// @vitest-environment happy-dom

/**
 * The app's cards on `/dashboard`: My patches, then Favourites and Lessons (`f-my-sounds` s2, s4), each for the signed-in
 * user. The cards are stubbed; each has its own test.
 *
 * @see components/app/dashboard/synth-cards.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/app/dashboard/my-sounds-card', () => ({
  MySoundsCard: ({ userId }: { userId: string }) => <p>sounds of {userId}</p>,
}));
vi.mock('@/components/app/dashboard/favourites-card', () => ({
  FavouritesCard: ({ userId }: { userId: string }) => <p>favourites of {userId}</p>,
}));
vi.mock('@/components/app/dashboard/lessons-card', () => ({
  LessonsCard: ({ userId }: { userId: string }) => <p>lessons of {userId}</p>,
}));

import { SynthCards } from '@/components/app/dashboard/synth-cards';

describe('SynthCards', () => {
  it("draws the user's sounds, then their favourites and lessons, for that user", () => {
    render(<SynthCards userId="user-1" />);
    expect(screen.getAllByRole('paragraph').map((p) => p.textContent)).toEqual([
      'sounds of user-1',
      'favourites of user-1',
      'lessons of user-1',
    ]);
  });
});
