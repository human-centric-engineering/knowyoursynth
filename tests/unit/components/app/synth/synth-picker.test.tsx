// @vitest-environment happy-dom

/**
 * The synth chooser: a dropdown listing each synth's name, maker, year and heritage.
 *
 * @see components/app/synth/synth-picker.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPicker } from '@/components/app/synth/synth-picker';
import { FAMILY_SYNTHS, TB_303_FAMILY } from '@/tests/helpers/synth-family';

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

  it('lists every synth with maker, year and heritage, and marks the current one selected', () => {
    const { trigger } = setup('ob-x');
    fireEvent.click(trigger);

    const options = within(screen.getByRole('listbox', { name: 'Choose a synth' })).getAllByRole(
      'option'
    );
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toContain('OB-X');
    expect(options[1].textContent).toContain('Oberheim · 1979');
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

describe('SynthPicker families (f-synth-families t-320)', () => {
  const open = (synthId: string, owned?: ReadonlySet<string>) => {
    const onSelect = vi.fn();
    render(
      <SynthPicker
        synths={FAMILY_SYNTHS}
        families={[TB_303_FAMILY]}
        owned={owned}
        synthId={synthId}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return onSelect;
  };
  const options = () => within(screen.getByRole('listbox')).getAllByRole('option');

  it("lists a family as one entry with its members' makers and years", () => {
    open('model-d');
    expect(options()).toHaveLength(2);
    const family = options()[1];
    expect(family.textContent).toContain('TB-303');
    expect(family.textContent).toContain('Behringer 2019 · Roland 1981 · Nobody 1997');
  });

  it('marks the family selected while one of its members is open', () => {
    open('tb-303');
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('opens the member the user owns', () => {
    const onSelect = open('model-d', new Set(['roland-tb-303']));
    fireEvent.click(options()[1]);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('tb-303');
  });

  it("opens the family's default member for a user who owns none of them", () => {
    const onSelect = open('model-d', new Set(['moog-model-d']));
    fireEvent.click(options()[1]);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('td-3');
  });

  it('stays on the member open when its own family is chosen', () => {
    const onSelect = open('tb-303');
    fireEvent.click(options()[1]);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it("finds a member by its own name, and opens that member, not the family's default", () => {
    const onSelect = open('model-d');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a synth' }), {
      target: { value: 'TB-303' },
    });
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Roland · 1981')]);
    fireEvent.click(options()[0]);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('tb-303');
  });

  it('opens the first match on Enter, and moves into the list on the down arrow', () => {
    const onSelect = open('model-d');
    const search = screen.getByRole('searchbox', { name: 'Find a synth' });
    fireEvent.change(search, { target: { value: 'td' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options()[0]);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('td-3');
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
    expect(options()).toHaveLength(2);
  });

  it('opens nothing on Enter in an empty box', () => {
    const onSelect = open('model-d');
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
