// @vitest-environment happy-dom

/**
 * The sound library, over Model D's real 200 sounds as the read layer serves them.
 *
 * @see components/app/synth/library.tsx
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Library, LevelDots } from '@/components/app/synth/library';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { CatalogueSound } from '@/lib/app/catalogue/read';
import { defaultPatchSound } from '@/lib/app/synths/default-patch';
import { getSynthDef } from '@/lib/app/synths/defs';
import { modelDRows } from '@/tests/helpers/model-d-detail';

// The videos section's count is the links read layer's, tested there (`tests/unit/lib/app/links/read.test.ts`).
vi.mock('@/lib/app/links/read', () => ({
  summarisePublicLinks: vi.fn(async () => ({ count: 0, kinds: [] })),
  summariseSoundLinks: vi.fn(async () => ({})),
  summariseSongLinks: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findFirst: vi.fn() },
    synthNote: { findMany: vi.fn() },
    // "Heard on" (the databank): none, unless a test says otherwise.
    bankInstrument: { findMany: vi.fn(async () => []) },
    bankSong: { findMany: vi.fn(async () => []) },
  },
}));

let sounds: CatalogueSound[] = [];

beforeAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail('model-d');
  if (!detail) throw new Error('no Model D detail');
  sounds = detail.sounds;
});

const list = () => screen.getByRole('list', { name: '' });
const rows = () => within(list()).getAllByRole('button');
const search = () => screen.getByRole('searchbox', { name: 'Search the patch library' });

function setup(currentId: string | null = null) {
  const onSelect = vi.fn();
  render(<Library presets={sounds} currentId={currentId} onSelect={onSelect} />);
  return { onSelect };
}

describe('Library', () => {
  it('lists all 200 sounds in catalogue order, with the count', () => {
    setup();
    expect(sounds).toHaveLength(200);
    expect(rows().map((r) => r.querySelector('.font-semibold')?.textContent)).toEqual(
      sounds.map((s) => s.name)
    );
    expect(screen.getByText('200 of 200')).toBeTruthy();
  });

  it('marks the loaded sound as current and no other', () => {
    setup(sounds[5].id);
    const current = rows().filter((r) => r.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain(sounds[5].name);
  });

  it('hands every sound’s id to onSelect when it is clicked', () => {
    const { onSelect } = setup();
    rows().forEach((r) => fireEvent.click(r));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(sounds.map((s) => s.id));
  });

  it('offers one filter per category, from each sound’s first tag, and filters by it', () => {
    setup();
    const cats = [...new Set(sounds.map((s) => s.tags[0]))];
    expect(cats.length).toBeGreaterThan(1);
    const filters = screen.getAllByRole('button', { pressed: false });
    for (const c of cats) expect(filters.some((b) => b.textContent === c)).toBe(true);

    const cat = cats[1];
    fireEvent.click(screen.getByRole('button', { name: cat, pressed: false }));
    const expected = sounds.filter((s) => s.tags[0] === cat);
    expect(rows()).toHaveLength(expected.length);
    expect(screen.getByText(`${expected.length} of 200`)).toBeTruthy();
    expect(screen.getByRole('button', { name: cat, pressed: true })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    expect(rows()).toHaveLength(200);
  });

  it('searches name, reference, artist, tags and blurb, every word having to match', () => {
    setup();
    const target = sounds[10];
    // Two words from different fields: the artist and the first tag.
    const q = `${target.artist.split(' ')[0]} ${target.tags[0]}`;
    fireEvent.change(search(), { target: { value: q } });
    const words = q.toLowerCase().split(/\s+/);
    const expected = sounds.filter((s) => {
      const hay = `${s.name} ${s.ref} ${s.artist} ${s.tags.join(' ')} ${s.blurb}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(200);
    expect(rows().map((r) => r.querySelector('.font-semibold')?.textContent)).toEqual(
      expected.map((s) => s.name)
    );
  });

  it('says so when nothing matches, without pointing at a tutor that is not there', () => {
    setup();
    fireEvent.change(search(), { target: { value: 'zzzz-no-such-sound' } });
    expect(screen.getByText('0 of 200')).toBeTruthy();
    const empty = screen.getByText(/No library patch matches that/);
    expect(empty.textContent).not.toMatch(/tutor/i);
  });
});

describe('Library with the Default patch', () => {
  const def = getSynthDef('model-d');
  if (!def) throw new Error('model-d is not registered');
  const start = defaultPatchSound(def);
  const names = () => rows().map((r) => r.querySelector('.font-semibold')?.textContent);

  function setupWithStart(currentId: string | null = null) {
    const onSelect = vi.fn();
    render(<Library presets={sounds} start={start} currentId={currentId} onSelect={onSelect} />);
    return { onSelect };
  }

  it('lists it first, above the catalogue’s sounds, and counts only theirs', () => {
    setupWithStart();
    expect(names()).toEqual(['Default patch', ...sounds.map((s) => s.name)]);
    expect(screen.getByText('200 of 200')).toBeTruthy();
  });

  it('keeps it first whatever the category or search', () => {
    setupWithStart();
    const cat = [...new Set(sounds.map((s) => s.tags[0]))][1];
    fireEvent.click(screen.getByRole('button', { name: cat, pressed: false }));
    expect(names()[0]).toBe('Default patch');
    expect(names().slice(1)).toEqual(sounds.filter((s) => s.tags[0] === cat).map((s) => s.name));

    fireEvent.change(search(), { target: { value: 'zzzz-no-such-sound' } });
    expect(names()).toEqual(['Default patch']);
  });

  it('chooses it by its id, and marks it current while it is on the panel', () => {
    const { onSelect } = setupWithStart(start.id);
    const first = rows()[0];
    expect(first.getAttribute('aria-current')).toBe('true');
    expect(rows().filter((r) => r.getAttribute('aria-current') === 'true')).toHaveLength(1);
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith('default-patch');
  });
});

describe('LevelDots', () => {
  it('lights as many dots as the level and names it', () => {
    const { container } = render(<LevelDots level={2} />);
    const dots = container.querySelectorAll('span > span');
    expect(dots).toHaveLength(3);
    expect([...dots].map((d) => d.className.includes('kys-accent'))).toEqual([true, true, false]);
    expect(screen.getByLabelText('Intermediate')).toBeTruthy();
  });
});
