// @vitest-environment happy-dom

/**
 * A block's card, its picture of the panel (t-147): a crop of the faceplate on the page, reused through `<use>`, with
 * the block's controls and jacks lit in its module's colour. One crop per cluster for a spread-out block, none for a
 * block with nothing on the panel or without the panel's definition.
 *
 * @see components/app/synth/routing-card.tsx
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoutingCard } from '@/components/app/synth/routing-card';
import { PANEL_ALL_ID, SynthPanel } from '@/components/app/panel/synth-panel';
import { getSynthDef } from '@/lib/app/synths/defs';
import { routing } from '@/lib/app/synths/routing/model-d';
import { panelCrops } from '@/lib/app/synths/lib/routing';
import { moduleOf } from '@/lib/app/synths/lib/modules';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

const blockOf = (id: string) => {
  const b = routing.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`no block ${id}`);
  return b;
};

function card(id: string, withPanel = true) {
  const block = blockOf(id);
  return render(
    <RoutingCard
      def={def}
      routing={routing}
      block={block}
      tag="TAG"
      live
      panel={withPanel ? def : undefined}
    />
  );
}

const crops = () => screen.queryAllByTestId('routing-card-crop');

describe('RoutingCard’s picture of the panel', () => {
  it('shows every Model D block with something on the panel a crop of it, and the rest none', () => {
    let shown = 0;
    for (const b of routing.blocks) {
      const { unmount } = card(b.id);
      const want = panelCrops(def, routing, b);
      expect(crops(), b.id).toHaveLength(want.length);
      if (want.length) {
        shown++;
        expect(
          screen.getByRole('img', {
            name: `Where the ${b.name} sits on the panel, its controls and jacks lit`,
          })
        ).toBeTruthy();
      } else expect(screen.getByText('Nothing on the panel sets it.')).toBeTruthy();
      unmount();
    }
    expect(shown).toBe(routing.blocks.length - 1);
  });

  it('draws the panel itself, cropped to the block, and rings each of its controls and jacks', () => {
    card('filter');
    const [want] = panelCrops(def, routing, blockOf('filter'));
    const [svg] = crops();
    expect(svg.getAttribute('viewBox')).toBe(`${want.x} ${want.y} ${want.w} ${want.h}`);
    expect(svg.querySelector('use')?.getAttribute('href')).toBe(`#${PANEL_ALL_ID}`);
    const rings = [...svg.querySelectorAll('[data-spot]')].map((r) => r.getAttribute('data-spot'));
    expect(rings.sort()).toEqual(want.spots.map((s) => `${s.kind}:${s.id}`).sort());
    // Lit in the card's colour, which is the block's module's.
    expect(svg.querySelector('[data-spot]')?.getAttribute('stroke')).toBe('currentColor');
    const body = svg.closest('.kys-routing-card-body');
    expect(body?.getAttribute('style')).toContain(moduleOf(blockOf('filter').module).color);
    // Dimmed outside its spots: the mask cuts one hole per spot.
    expect(svg.querySelectorAll('mask rect')).toHaveLength(want.spots.length + 1);
  });

  it('draws a spread-out block as one crop per cluster, in a row at one scale', () => {
    card('mod_bus');
    const want = panelCrops(def, routing, blockOf('mod_bus'));
    expect(want).toHaveLength(2);
    const shown = crops();
    expect(shown.map((s) => s.getAttribute('viewBox'))).toEqual(
      want.map((k) => `${k.x} ${k.y} ${k.w} ${k.h}`)
    );
    // Each takes its width's share of the row, so both draw at the same scale.
    expect(shown.map((s) => Number(s.style.flexGrow))).toEqual(want.map((k) => k.w));
  });

  it('shows no picture without the panel’s definition', () => {
    card('filter', false);
    expect(crops()).toHaveLength(0);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('points at the faceplate on the page, so it shows the panel’s own values, cables and design', () => {
    render(
      <>
        <SynthPanel
          def={def}
          values={def.init}
          cables={[]}
          onChange={() => undefined}
          onConnect={() => undefined}
          onRemoveCable={() => undefined}
        />
        <RoutingCard
          def={def}
          routing={routing}
          block={blockOf('osc1')}
          tag="VCO"
          live
          panel={def}
        />
      </>
    );
    const target = crops()[0].querySelector('use')?.getAttribute('href')?.slice(1);
    const group = target ? document.getElementById(target) : null;
    expect(group?.closest('svg')?.getAttribute('aria-label')).toBe(
      `${def.maker} ${def.name} front panel`
    );
  });
});
