// @vitest-environment happy-dom

/**
 * The synth chooser: a dropdown listing each synth by name and maker, grouped by maker, with its year, kind, whether
 * it plays, its heritage and a thumbnail of its panel (`f-synth-picker` t-328).
 *
 * @see components/app/synth/synth-picker.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPicker } from '@/components/app/synth/synth-picker';
import { FAMILY_SYNTHS, TB_303_FAMILY } from '@/tests/helpers/synth-family';
import { FACTORY_PICKER } from '@/lib/app/picker/settings';

const SYNTHS = [
  { id: 'model-d', name: 'Model D', maker: 'Moog', year: 1970, heritage: 'The original monosynth' },
  { id: 'ob-x', name: 'OB-X', maker: 'Oberheim', year: 1979, heritage: 'Polyphonic and bold' },
  { id: 'cs-80', name: 'CS-80', maker: 'Yamaha', year: 1977, heritage: 'The Blade Runner brass' },
];

function setup(synthId = 'ob-x', onSelect = vi.fn()) {
  const utils = render(<SynthPicker synths={SYNTHS} synthId={synthId} onSelect={onSelect} />);
  const trigger = screen.getByRole('button', { expanded: false });
  return { ...utils, trigger, onSelect };
}

describe('SynthPicker', () => {
  it('shows only the current synth name until it is opened', () => {
    const { trigger } = setup('ob-x');
    expect(trigger.textContent).toContain('OB-X');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('falls back to the first synth when the id is not in the list', () => {
    const { trigger } = setup('nope');
    expect(trigger.textContent).toContain('Model D');
  });

  it('renders nothing for an empty catalogue', () => {
    const { container } = render(<SynthPicker synths={[]} synthId="x" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists every synth under its maker with name, maker, year and heritage, and marks the current one selected', () => {
    const { trigger } = setup('ob-x');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Choose a synth' });
    expect(
      within(listbox)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label'))
    ).toEqual(['Moog', 'Oberheim', 'Yamaha']);
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toContain('OB-X');
    expect(options[1].textContent).toContain('Oberheim');
    expect(options[1].textContent).toContain('1979');
    expect(options[1].textContent).toContain('Plays');
    expect(options[1].textContent).toContain('Polyphonic and bold');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('puts focus on the current synth when it opens', () => {
    const { trigger } = setup('cs-80');
    fireEvent.click(trigger);
    expect(document.activeElement?.textContent).toContain('CS-80');
  });

  it('toggles closed when the trigger is pressed again', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a pointer press outside, but not on one inside', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByRole('listbox'));
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves focus down and up the list with the arrow keys, wrapping at both ends', () => {
    const { trigger } = setup('cs-80');
    fireEvent.click(trigger);
    const options = screen.getAllByRole('option');

    // Down from the last wraps to the first.
    fireEvent.keyDown(options[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[0]);

    // Up from the first wraps to the last.
    fireEvent.keyDown(options[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[2]);

    fireEvent.keyDown(options[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[1]);
  });

  it('calls onSelect with the chosen id and closes', () => {
    const { trigger, onSelect } = setup('ob-x');
    fireEvent.click(trigger);

    fireEvent.click(screen.getAllByRole('option')[0]);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('model-d');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stops handling Escape once closed, so it no longer steals focus', () => {
    const { trigger } = setup();
    const other = document.createElement('input');
    document.body.appendChild(other);
    fireEvent.click(trigger);
    fireEvent.click(screen.getAllByRole('option')[0]);

    other.focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe('SynthPicker stars (f-my-sounds s4)', () => {
  const starred = new Set(['model-d']);
  const renderStars = (isStarred: (id: string) => boolean | null, onStar = vi.fn()) => {
    render(
      <SynthPicker
        synths={SYNTHS}
        synthId="model-d"
        onSelect={vi.fn()}
        isStarred={isStarred}
        onStar={onStar}
      />
    );
    return onStar;
  };

  it('stars the synth on show from beside the chooser, not inside its list', () => {
    const onStar = renderStars((id) => starred.has(id));
    const star = screen.getByRole('button', { name: 'Remove Model D from favourites' });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(star);
    expect(onStar).toHaveBeenCalledExactlyOnceWith('model-d');
    // Opening the list does not close on the star, and the list holds only options.
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const list = screen.getByRole('listbox');
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
  });

  it('marks the starred synths in the list', () => {
    renderStars((id) => starred.has(id));
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent?.includes('(in your favourites)'))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('shows no star while signed out or still loading', () => {
    renderStars(() => null);
    expect(screen.queryByRole('button', { name: /favourites$/ })).toBeNull();
  });
});

describe('SynthPicker rows for a family (f-synth-picker t-328)', () => {
  const open = (synthId: string, owned?: ReadonlySet<string>, memberSlug: string | null = null) => {
    const onSelect = vi.fn();
    const onSelectMember = vi.fn();
    render(
      <SynthPicker
        synths={FAMILY_SYNTHS}
        families={[TB_303_FAMILY]}
        owned={owned}
        synthId={synthId}
        memberSlug={memberSlug}
        onSelect={onSelect}
        onSelectMember={onSelectMember}
      />
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return { onSelect, onSelectMember };
  };
  const options = () => within(screen.getByRole('listbox')).getAllByRole('option');
  // By the name it leads with, not anywhere in it: TD-3's description is "A TB-303 copy".
  const row = (name: string) => {
    const o = options().find((x) =>
      [...x.querySelectorAll('span')].some((span) => span.textContent === name)
    );
    if (!o) throw new Error(`no row for ${name}`);
    return o;
  };

  it('lists each member as a row of its own, under its own maker', () => {
    open('model-d');
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining('Model D'),
      expect.stringContaining('TD-3'),
      expect.stringContaining('Unmodelled'),
      expect.stringContaining('TB-303'),
    ]);
    expect(row('Unmodelled').textContent).toContain('Not modelled');
    expect(row('Unmodelled').textContent).toContain('1997 · mono');
  });

  it("shows a playable row's panel thumbnail, and a blank in its place for an unmodelled one", () => {
    open('model-d');
    expect(row('TD-3').querySelector('img')?.getAttribute('src')).toBe(
      '/synths/td-3/thumbnail.png'
    );
    expect(row('Unmodelled').querySelector('img')).toBeNull();
    expect(row('Unmodelled').textContent).toContain('No panel');
  });

  it('marks only the member open as selected', () => {
    open('tb-303');
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ]);
  });

  it('marks an unmodelled member selected while its blank panel shows, not the synth under it', () => {
    open('tb-303', undefined, 'rebirth');
    expect(row('Unmodelled').getAttribute('aria-selected')).toBe('true');
    expect(row('TB-303').getAttribute('aria-selected')).toBe('false');
  });

  it('opens a modelled member as itself', () => {
    const { onSelect } = open('model-d');
    fireEvent.click(row('TB-303'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('tb-303');
  });

  it("opens an unmodelled member over this synth when it is in this synth's family", () => {
    const { onSelect, onSelectMember } = open('tb-303');
    fireEvent.click(row('Unmodelled'));
    expect(onSelectMember).toHaveBeenCalledExactlyOnceWith('tb-303', 'rebirth');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens an unmodelled member over the member the user owns, else the default', () => {
    const owner = open('model-d', new Set(['roland-tb-303']));
    fireEvent.click(row('Unmodelled'));
    expect(owner.onSelectMember).toHaveBeenCalledExactlyOnceWith('tb-303', 'rebirth');
  });

  it("opens an unmodelled member over the family's default for a user who owns none of them", () => {
    const { onSelectMember } = open('model-d', new Set(['moog-model-d']));
    fireEvent.click(row('Unmodelled'));
    expect(onSelectMember).toHaveBeenCalledExactlyOnceWith('td-3', 'rebirth');
  });

  it('leaves unmodelled members out when the page cannot show them', () => {
    render(
      <SynthPicker
        synths={FAMILY_SYNTHS}
        families={[TB_303_FAMILY]}
        synthId="model-d"
        onSelect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(options()).toHaveLength(3);
    expect(screen.queryByText('Unmodelled')).toBeNull();
    // Still found by the family's name.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a synth' }), {
      target: { value: 'tb-303' },
    });
    expect(options()).toHaveLength(2);
  });

  it('shows the empty box in place of a thumbnail that will not load', () => {
    open('model-d');
    const img = row('TD-3').querySelector('img');
    if (!img) throw new Error('no thumbnail');
    fireEvent.error(img);
    expect(row('TD-3').querySelector('img')).toBeNull();
    expect(row('TD-3').textContent).toContain('No panel');
  });

  it('finds a member by its maker, and opens that member', () => {
    const { onSelect } = open('model-d');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a synth' }), {
      target: { value: 'roland' },
    });
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('TB-303')]);
    fireEvent.click(options()[0]);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('tb-303');
  });

  it('finds every member of a family by the family name', () => {
    open('model-d');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a synth' }), {
      target: { value: 'tb-303' },
    });
    expect(options()).toHaveLength(3);
  });

  it('opens the first match on Enter, and moves into the list on the down arrow', () => {
    const { onSelect } = open('model-d');
    const search = screen.getByRole('searchbox', { name: 'Find a synth' });
    fireEvent.change(search, { target: { value: 'td' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options()[0]);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('td-3');
  });

  it('moves through the rows of every group with the arrow keys', () => {
    open('model-d');
    const all = options();
    fireEvent.keyDown(all[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[2]);
    fireEvent.keyDown(all[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[3]);
  });

  it('says so when nothing matches, and starts afresh when opened again', () => {
    open('model-d');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a synth' }), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No synth matches that.')).toBeTruthy();
    const trigger = screen.getByRole('button', { expanded: true });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(options()).toHaveLength(4);
  });

  it('opens nothing on Enter in an empty box', () => {
    const { onSelect } = open('model-d');
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Find a synth' }), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('finds as you type on the list: the letter goes into the box, with the cursor', () => {
    open('model-d');
    fireEvent.keyDown(options()[0], { key: 'a' });
    const search = screen.getByRole('searchbox', { name: 'Find a synth' });
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe('a');
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Roland')]);
  });
});

describe('SynthPicker Advanced search (f-synth-picker t-329)', () => {
  const SITE = { ...FACTORY_PICKER };
  const open = (props: Partial<Parameters<typeof SynthPicker>[0]> = {}) => {
    const onPrefs = vi.fn();
    const utils = render(
      <SynthPicker
        synths={FAMILY_SYNTHS}
        families={[TB_303_FAMILY]}
        synthId="model-d"
        onSelect={vi.fn()}
        onSelectMember={vi.fn()}
        site={SITE}
        prefs={{}}
        onPrefs={onPrefs}
        {...props}
      />
    );
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Model D/ }));
    return { ...utils, onPrefs };
  };
  const advancedButton = () => screen.getByRole('button', { name: /^Advanced/ });
  const window_ = () => screen.getByRole('region', { name: 'Advanced search' });

  it('opens a window that says the site’s settings are in use, with nothing to reset', () => {
    open();
    expect(screen.queryByRole('region', { name: 'Advanced search' })).toBeNull();
    fireEvent.click(advancedButton());
    expect(advancedButton().getAttribute('aria-expanded')).toBe('true');
    expect(window_().textContent).toContain('Using the site’s settings');
    expect(
      within(window_()).getByRole('button', { name: 'Reset to the site’s settings' })
    ).toHaveProperty('disabled', true);
    expect(
      within(within(window_()).getByRole('group', { name: 'Group by' }))
        .getByRole('button', { name: 'Maker' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('keeps a change as the visitor’s own, only what differs from the site’s', () => {
    const { onPrefs } = open({ prefs: { thumbs: false } });
    fireEvent.click(advancedButton());
    fireEvent.click(
      within(within(window_()).getByRole('group', { name: 'Group by' })).getByRole('button', {
        name: 'Lineage',
      })
    );
    expect(onPrefs).toHaveBeenLastCalledWith({ thumbs: false, group: 'lineage' });
    fireEvent.click(within(window_()).getByRole('button', { name: 'modular' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ thumbs: false, kinds: ['modular'] });
  });

  it('lists by the visitor’s choices, counts them on the button, and resets to the site’s', () => {
    const { onPrefs } = open({ prefs: { group: 'name', thumbs: false } });
    expect(advancedButton().textContent).toContain('2');
    // One list with no heading, and no thumbnails.
    expect(within(screen.getByRole('listbox')).getAllByRole('group')).toHaveLength(1);
    expect(screen.getByRole('listbox').querySelector('img')).toBeNull();
    fireEvent.click(advancedButton());
    expect(window_().textContent).toContain('Kept as your settings');
    fireEvent.click(
      within(window_()).getByRole('button', { name: 'Reset to the site’s settings' })
    );
    expect(onPrefs).toHaveBeenLastCalledWith({});
  });

  it('changes the order and the thumbnails, and takes a kind back out', () => {
    const { onPrefs } = open({ prefs: { kinds: ['mono', 'poly'] } });
    fireEvent.click(advancedButton());
    fireEvent.click(
      within(within(window_()).getByRole('group', { name: 'Order' })).getByRole('button', {
        name: 'Newest',
      })
    );
    expect(onPrefs).toHaveBeenLastCalledWith({ kinds: ['mono', 'poly'], order: 'new' });
    fireEvent.click(within(window_()).getByRole('checkbox', { name: 'Panel thumbnails' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ kinds: ['mono', 'poly'], thumbs: false });
    fireEvent.click(within(window_()).getByRole('button', { name: 'mono' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ kinds: ['poly'] });
  });

  it('opens on Enter the row the box found by lineage, not the original over it', () => {
    const onSelect = vi.fn();
    open({ prefs: { group: 'lineage' }, onSelect });
    const search = screen.getByRole('searchbox', { name: 'Find a synth' });
    fireEvent.change(search, { target: { value: 'td-3' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('td-3');
  });

  it('is closed again the next time the list opens after a click away', () => {
    open();
    fireEvent.click(advancedButton());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Model D/ }));
    expect(screen.queryByRole('region', { name: 'Advanced search' })).toBeNull();
  });

  it('closes the window on Escape before the list, and gives focus back to its button', () => {
    open();
    fireEvent.click(advancedButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Advanced search' })).toBeNull();
    expect(document.activeElement).toBe(advancedButton());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('has no Advanced search while the site does not allow it, and lists by the site’s settings', () => {
    open({
      site: { ...SITE, group: 'name', visitorsMayChange: false },
      prefs: { group: 'lineage', thumbs: false },
    });
    expect(screen.queryByRole('button', { name: /^Advanced/ })).toBeNull();
    expect(within(screen.getByRole('listbox')).getAllByRole('group')).toHaveLength(1);
    expect(screen.getByRole('listbox').querySelector('img')).not.toBeNull();
  });

  it('has no Advanced search where the page cannot keep the visitor’s choices', () => {
    open({ onPrefs: undefined });
    expect(screen.queryByRole('button', { name: /^Advanced/ })).toBeNull();
  });

  it('marks a member under its original by lineage', () => {
    open({ prefs: { group: 'lineage' } });
    const tdRow = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .find((o) => [...o.querySelectorAll('span')].some((s) => s.textContent === 'TD-3'));
    expect(tdRow?.textContent).toContain('Recreation');
  });
});
