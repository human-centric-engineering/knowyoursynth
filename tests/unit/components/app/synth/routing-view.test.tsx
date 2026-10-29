// @vitest-environment happy-dom

/**
 * The routing view over Model D's real routing: what the patch uses is lit and the rest dimmed, and a mixer level, a
 * switch or a cable changes which. Each block opens its card (t-143) by hover, keyboard or tap, and the card's
 * controls and jacks are handed back to be found on the panel.
 *
 * @see components/app/synth/routing-view.tsx
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutingView } from '@/components/app/synth/routing-view';
import { getSynthDef } from '@/lib/app/synths/defs';
import { routing } from '@/lib/app/synths/routing/model-d';
import { meterStore } from '@/components/app/synth/stores';
import { controlMap, displayName } from '@/lib/app/synths/lib/patch';
import type { ControlValues, SynthRouting } from '@/lib/app/synths/contract';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

type Cable = { from: string; to: string; color?: string };

function view(set: ControlValues = {}, cables: Cable[] = [], wheel = 0) {
  const props = { def, routing, values: { ...def.init, ...set }, cables, wheel };
  const r = render(<RoutingView {...props} />);
  return {
    rerender: (next: ControlValues, nextCables: Cable[] = cables) =>
      r.rerender(<RoutingView {...props} values={{ ...def.init, ...next }} cables={nextCables} />),
  };
}

const lit = (sel: string) => document.querySelector(sel)?.getAttribute('data-live');
const block = (id: string) => lit(`[data-block="${id}"]`);
const edge = (id: string) => lit(`[data-edge="${id}"]`);

describe('RoutingView', () => {
  it('names the diagram, and says what is in use in words', () => {
    view();
    const img = screen.getByRole('group', { name: 'Model D signal routing' });
    expect(img.querySelector('desc')?.textContent).toMatch(
      /^In use now: .*Oscillator 1.*Not in use: .*Oscillator 2/
    );
  });

  it('draws every block and edge of the routing', () => {
    view();
    expect(document.querySelectorAll('[data-block]')).toHaveLength(routing.blocks.length);
    expect(document.querySelectorAll('[data-edge]')).toHaveLength(routing.edges.length);
  });

  it('lights the path the panel as first set takes, with the signal running along it, and dims the rest', () => {
    // As first set: Oscillator 1 alone in the mixer.
    view();
    for (const id of ['osc1', 'mixer', 'filter', 'vca', 'output']) expect(block(id)).toBe('true');
    expect(edge('c40')).toBe('true');
    expect(block('osc2')).toBe('false');
    expect(edge('c41')).toBe('false');
    expect(block('noise')).toBe('false');
    // A lit line carries the moving signal over it; a dim one does not.
    expect(document.querySelector('[data-edge="c40"] .kys-route-flow')).not.toBeNull();
    expect(document.querySelector('[data-edge="c41"] .kys-route-flow')).toBeNull();
    expect(document.querySelector('[data-edge="c40"]')).toHaveClass('is-live');
  });

  it('draws audio, control voltage and gate apart', () => {
    view();
    expect(document.querySelector('[data-edge="c40"]')).toHaveClass('is-audio');
    expect(document.querySelector('[data-edge="c51"]')).toHaveClass('is-cv');
    expect(document.querySelector('[data-edge="c05"]')).toHaveClass('is-gate');
  });

  it('follows a mixer level: Oscillator 1 turned right down goes dark', () => {
    const v = view();
    expect(edge('c40')).toBe('true');
    v.rerender({ 'mix.osc1': 0 });
    expect(edge('c40')).toBe('false');
    expect(block('osc1')).toBe('false');
    expect(block('mixer')).toBe('false');
    // The filter makes noise of its own when it rings, so it stays on the path to the output.
    expect(block('filter')).toBe('true');
  });

  it('follows a switch: Oscillator 2 switched into the mixer, with its level up, lights', () => {
    const v = view();
    v.rerender({ 'mix.osc2': 6 });
    expect(edge('c41')).toBe('false'); // the level alone is not enough: its switch is off
    v.rerender({ 'mix.osc2': 6, 'mix.osc2On': true });
    expect(edge('c41')).toBe('true');
    expect(block('osc2')).toBe('true');
  });

  it('follows a cable: the LFO into the cutoff is drawn in its colour and lights the LFO', () => {
    const v = view();
    expect(block('lfo')).toBe('false');
    expect(document.querySelectorAll('[data-cable]')).toHaveLength(0);
    v.rerender({}, [{ from: 'j.lfoTri', to: 'j.cutCv', color: '#38c6ff' }]);
    const cable = document.querySelector('[data-cable="j.lfoTri>j.cutCv"]');
    expect(cable?.getAttribute('data-live')).toBe('true');
    expect(cable).toHaveStyle({ color: '#38c6ff' });
    expect(block('lfo')).toBe('true');
  });

  it('lights a cable into a normal only under the normal’s switch', () => {
    // Into MOD SOURCE, which replaces the noise as source B, with the mod bus sent to the filter.
    const mod = { 'mod.mix': 10, 'mod.depth': 5, 'mod.toFilter': true };
    const cable = [{ from: 'j.lfoSq', to: 'j.modSrc' }];
    const v = view({ ...mod, 'mod.srcB': 'noise' }, cable);
    expect(lit('[data-cable="j.lfoSq>j.modSrc"]')).toBe('true');
    // Source B switched to the LFO: the jack is ignored.
    v.rerender({ ...mod, 'mod.srcB': 'lfo' }, cable);
    expect(lit('[data-cable="j.lfoSq>j.modSrc"]')).toBe('false');
  });

  it('keys the cables as well as audio, control voltage and gate', () => {
    view();
    const key = screen.getByRole('list', { name: 'Key' });
    expect(key.textContent).toMatch(/Audio.*Control voltage.*Gate.*Patch cable/);
  });

  it('is never drawn bigger than its own size', () => {
    view();
    const svg = screen.getByRole('group', { name: 'Model D signal routing' });
    expect(svg.getAttribute('style')).toContain(`--routing-w: ${svg.getAttribute('width')}px`);
  });

  it('draws nothing for a cable to a jack whose block is missing, rather than failing', () => {
    // Only a malformed routing does this (`routingProblems` refuses it), but the page must survive one.
    const broken: SynthRouting = { ...routing, jacks: { ...routing.jacks, 'j.lfoTri': 'ghost' } };
    render(
      <RoutingView
        def={def}
        routing={broken}
        values={def.init}
        cables={[
          { from: 'j.lfoTri', to: 'j.cutCv' },
          { from: 'j.lfoSq', to: 'j.cutCv' },
        ]}
        wheel={0}
      />
    );
    expect(document.querySelector('[data-cable="j.lfoTri>j.cutCv"]')).toBeNull();
    expect(document.querySelector('[data-cable="j.lfoSq>j.cutCv"]')).not.toBeNull();
  });

  it('lights the mod wheel’s line while the wheel is up and the mod bus goes somewhere', () => {
    const values = { ...def.init, 'mod.toFilter': true };
    const r = render(
      <RoutingView def={def} routing={routing} values={values} cables={[]} wheel={0} />
    );
    expect(edge('c03')).toBe('false');
    r.rerender(<RoutingView def={def} routing={routing} values={values} cables={[]} wheel={0.5} />);
    expect(edge('c03')).toBe('true');
  });

  it('draws every block as a box with its schematic symbol and designator', () => {
    view();
    const want: Record<string, string> = {
      osc1: 'VCO',
      noise: 'NOISE',
      ext_in: 'EXT',
      mixer: 'MIX',
      filter: 'VCF',
      filter_contour: 'EG',
      vca: 'VCA',
      lfo: 'LFO',
      midi: 'MIDI',
      output: 'OUT',
    };
    for (const b of routing.blocks) {
      const g = document.querySelector(`[data-block="${b.id}"]`);
      expect(g?.querySelector('.kys-route-glyph')?.childElementCount, b.id).toBeGreaterThan(0);
      if (want[b.id])
        expect(g?.querySelector('.kys-route-tag')?.textContent, b.id).toBe(want[b.id]);
    }
    // A block that names its own symbol keeps it over its module's: noise is in the mixer module.
    expect(document.querySelector('[data-block="noise"]')).toHaveAttribute('data-symbol', 'noise');
    expect(document.querySelector('[data-block="mixer"]')).toHaveAttribute('data-symbol', 'mixer');
  });

  it('draws the synth’s own routes as ink lines with arrowheads, and cables as cased cables with jacks', () => {
    view({}, [{ from: 'j.lfoTri', to: 'j.cutCv', color: '#38c6ff' }]);
    const route = document.querySelector('[data-edge="c40"]');
    expect(route?.querySelector('.kys-route-line')?.getAttribute('marker-end')).toMatch(/^url\(#/);
    expect(route?.querySelector('.kys-route-casing')).toBeNull();
    expect(route?.querySelectorAll('.kys-route-jack')).toHaveLength(0);
    const cable = document.querySelector('[data-cable="j.lfoTri>j.cutCv"]');
    expect(cable).toHaveClass('is-cable');
    expect(cable?.querySelector('.kys-route-casing')).not.toBeNull();
    expect(cable?.querySelector('.kys-route-line')?.getAttribute('marker-end')).toBeNull();
    expect(cable?.querySelectorAll('.kys-route-jack')).toHaveLength(2);
  });

  it('keeps each cable’s element (and so its glow) with it when an earlier cable comes out', () => {
    const a = { from: 'j.lfoTri', to: 'j.cutCv', color: '#38c6ff' };
    const b = { from: 'j.lfoSq', to: 'j.loudCv', color: '#ffb020' };
    const v = view({}, [a, b]);
    const before = document.querySelector(`[data-cable="${b.from}>${b.to}"]`);
    expect(before).not.toBeNull();
    v.rerender({}, [b]);
    expect(document.querySelector(`[data-cable="${b.from}>${b.to}"]`)).toBe(before);
    expect(document.querySelector(`[data-cable="${a.from}>${a.to}"]`)).toBeNull();
  });

  describe('lit by the sound', () => {
    afterEach(() => meterStore.set({ gate: false, lfo: 0, overload: 0, power: false }));

    /** An analyser reading a steady signal at `rms`. */
    const source = (rms: number) => ({
      analyser: {
        fftSize: 64,
        getFloatTimeDomainData: (out: Float32Array<ArrayBuffer>) => void out.fill(rms),
      },
    });
    const glow = (sel: string) =>
      Number(document.querySelector<SVGElement>(sel)?.style.getPropertyValue('--a') || 0);

    it('glows the routed path while a note sounds, and leaves the unrouted dark', async () => {
      meterStore.set({ gate: true, lfo: 0, overload: 0, power: true, env1: 1, env2: 1 });
      render(
        <RoutingView
          def={def}
          routing={routing}
          values={def.init}
          cables={[]}
          wheel={0}
          source={source(0.5)}
        />
      );
      await waitFor(() => expect(glow('[data-block="vca"]')).toBeGreaterThan(0.5));
      expect(glow('[data-block="midi"]')).toBeGreaterThan(0.5);
      expect(glow('[data-edge="c40"]')).toBeGreaterThan(0.5);
      expect(glow('[data-block="osc2"]')).toBe(0);
    });

    it('fades as the sound does rather than cutting out', async () => {
      meterStore.set({ gate: true, lfo: 0, overload: 0, power: true, env1: 1, env2: 1 });
      const props = { def, routing, values: def.init, cables: [], wheel: 0 };
      const r = render(<RoutingView {...props} source={source(0.5)} />);
      await waitFor(() => expect(glow('[data-block="vca"]')).toBeGreaterThan(0.9));
      meterStore.set({ gate: false, lfo: 0, overload: 0, power: true, env1: 0, env2: 0 });
      r.rerender(<RoutingView {...props} source={source(0)} />);
      // Part way down, then on down: not the cut an on/off light would make.
      await waitFor(() => expect(glow('[data-block="vca"]')).toBeLessThan(0.9));
      expect(glow('[data-block="vca"]')).toBeGreaterThan(0);
      await waitFor(() => expect(glow('[data-block="vca"]')).toBe(0), { timeout: 4000 });
    });
  });
});

describe('a block’s card', () => {
  const blockButton = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name},`) });
  const card = (name: string) => screen.queryByRole('dialog', { name });
  const cardBody = (name: string) => {
    const c = card(name);
    if (!c) throw new Error(`no card for ${name}`);
    return within(c);
  };
  const DESIGNATOR: Record<string, string> = {
    midi: 'MIDI',
    pitch_bus: 'CV',
    mod_bus: 'MOD',
    lfo: 'LFO',
    osc1: 'VCO',
    osc2: 'VCO',
    osc3: 'VCO',
    noise: 'NOISE',
    ext_in: 'EXT',
    mixer: 'MIX',
    filter: 'VCF',
    filter_contour: 'EG',
    loudness_contour: 'EG',
    vca: 'VCA',
    output: 'OUT',
  };

  it('shows every block’s type, description and the controls that set it, on a tap', () => {
    view();
    const controls = controlMap(def);
    expect(Object.keys(DESIGNATOR)).toEqual(routing.blocks.map((b) => b.id));
    for (const b of routing.blocks) {
      fireEvent.click(blockButton(b.name));
      const c = cardBody(b.name);
      expect(c.getByText(DESIGNATOR[b.id], { selector: '.kys-routing-card-tag' })).toBeTruthy();
      expect(c.getByText(b.description)).toBeTruthy();
      for (const id of b.controls ?? []) {
        const ctl = controls[id];
        if (!ctl) throw new Error(`no control ${id}`);
        expect(c.getByText(displayName(def, ctl))).toBeTruthy();
      }
      for (const s of b.specs ?? []) expect(c.getByText(s.value)).toBeTruthy();
    }
    // Model D's blocks between them name every control on the panel.
    const named = new Set(routing.blocks.flatMap((b) => b.controls ?? []));
    expect(def.controls.filter((c) => !named.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('lists a block’s jacks, and says so when nothing on the panel sets it', () => {
    view();
    fireEvent.click(blockButton('LFO'));
    const lfo = cardBody('LFO');
    for (const name of ['LFO CV', 'LFO (triangle)', 'LFO (square)'])
      expect(lfo.getByText(name)).toBeTruthy();
    fireEvent.click(blockButton('MIDI / USB'));
    expect(cardBody('MIDI / USB').getByText('Nothing on the panel sets it.')).toBeTruthy();
  });

  it('says whether the block is on the path the patch uses now', () => {
    view();
    fireEvent.click(blockButton('Oscillator 1'));
    expect(cardBody('Oscillator 1').getByText('On the path the patch uses now')).toBeTruthy();
    fireEvent.click(blockButton('Oscillator 2'));
    expect(cardBody('Oscillator 2').getByText('Not on the path the patch uses now')).toBeTruthy();
    expect(blockButton('Oscillator 2')).toHaveAccessibleName('Oscillator 2, not in use');
  });

  it('hands a chosen control or jack back to be found on the panel', () => {
    const onShow = vi.fn();
    render(
      <RoutingView
        def={def}
        routing={routing}
        values={def.init}
        cables={[]}
        wheel={0}
        onShow={onShow}
      />
    );
    fireEvent.click(blockButton('Ladder filter'));
    fireEvent.click(cardBody('Ladder filter').getByRole('button', { name: 'EMPHASIS' }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'control', id: 'filter.emphasis' });
    fireEvent.click(cardBody('Ladder filter').getByRole('button', { name: /CUT CV/ }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'jack', id: 'j.cutCv' });
  });

  it('lists the controls without offering them when nothing can find them', () => {
    view();
    fireEvent.click(blockButton('Ladder filter'));
    const c = cardBody('Ladder filter');
    expect(c.getByText('EMPHASIS')).toBeTruthy();
    expect(c.queryByRole('button')).toBeNull();
  });

  it('is reached by the keyboard: Enter opens it with focus inside, Tab reaches its controls, Escape returns', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <RoutingView
        def={def}
        routing={routing}
        values={def.init}
        cables={[]}
        wheel={0}
        onShow={onShow}
      />
    );
    const filter = blockButton('Ladder filter');
    expect(filter).toHaveAttribute('tabindex', '0');
    act(() => filter.focus());
    await user.keyboard('{Enter}');
    const dialog = card('Ladder filter');
    expect(dialog).not.toBeNull();
    expect(filter).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(within(dialog as HTMLElement).getAllByRole('button')[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onShow).toHaveBeenCalledWith({ kind: 'control', id: 'filter.cutoff' });
    await user.keyboard('{Escape}');
    expect(card('Ladder filter')).toBeNull();
    expect(filter).toHaveFocus();
    expect(filter).toHaveAttribute('aria-expanded', 'false');
    // Space opens it too.
    await user.keyboard(' ');
    expect(card('Ladder filter')).not.toBeNull();
  });

  it('opens on a tap of another block in place of the one open, and closes on a tap away', async () => {
    view();
    fireEvent.pointerEnter(blockButton('Mixer'), { pointerType: 'touch' });
    expect(card('Mixer')).toBeNull(); // a touch has no hover
    fireEvent.click(blockButton('Mixer'));
    expect(card('Mixer')).not.toBeNull();
    fireEvent.pointerDown(blockButton('Noise'));
    fireEvent.click(blockButton('Noise'));
    expect(card('Mixer')).toBeNull();
    expect(card('Noise')).not.toBeNull();
    await userEvent
      .setup()
      .pointer({ keys: '[MouseLeft]', target: screen.getByRole('list', { name: 'Key' }) });
    expect(card('Noise')).toBeNull();
  });

  describe('on hover', () => {
    afterEach(() => vi.useRealTimers());

    it('shows while the pointer is on the block or the card, and goes when it leaves both', () => {
      vi.useFakeTimers();
      view();
      const lfo = blockButton('LFO');
      fireEvent.pointerEnter(lfo, { pointerType: 'mouse' });
      const dialog = card('LFO');
      expect(dialog).not.toBeNull();
      expect(dialog).not.toHaveFocus(); // a hover does not take focus
      // Across the gap into the card, it stays.
      fireEvent.pointerLeave(lfo, { pointerType: 'mouse' });
      fireEvent.pointerEnter(dialog as HTMLElement, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(card('LFO')).not.toBeNull();
      fireEvent.pointerLeave(dialog as HTMLElement, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(card('LFO')).toBeNull();
    });

    it('keeps a card opened by a click while the pointer passes over other blocks', () => {
      vi.useFakeTimers();
      view();
      fireEvent.click(blockButton('LFO'));
      fireEvent.pointerLeave(blockButton('LFO'), { pointerType: 'mouse' });
      fireEvent.pointerEnter(blockButton('Mixer'), { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(card('LFO')).not.toBeNull();
      expect(card('Mixer')).toBeNull();
    });
  });
});
