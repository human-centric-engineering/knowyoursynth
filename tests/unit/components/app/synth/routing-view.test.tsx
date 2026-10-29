// @vitest-environment happy-dom

/**
 * The routing view over Model D's real routing: what the patch uses is lit and the rest dimmed, and a mixer level, a
 * switch or a cable changes which.
 *
 * @see components/app/synth/routing-view.tsx
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoutingView } from '@/components/app/synth/routing-view';
import { getSynthDef } from '@/lib/app/synths/defs';
import { routing } from '@/lib/app/synths/routing/model-d';
import type { ControlValues } from '@/lib/app/synths/contract';

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
    const img = screen.getByRole('img', { name: 'Model D signal routing' });
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

  it('lights the mod wheel’s line while the wheel is up and the mod bus goes somewhere', () => {
    const values = { ...def.init, 'mod.toFilter': true };
    const r = render(
      <RoutingView def={def} routing={routing} values={values} cables={[]} wheel={0} />
    );
    expect(edge('c03')).toBe('false');
    r.rerender(<RoutingView def={def} routing={routing} values={values} cables={[]} wheel={0.5} />);
    expect(edge('c03')).toBe('true');
  });
});
