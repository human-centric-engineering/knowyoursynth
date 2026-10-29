'use client';

/**
 * The routing view (`f-routing-view` t-142): the back of the panel, a diagram of how the synth's parts are wired. The
 * page flips the panel over to it from the Signal routing toggle on the panel's top rail.
 *
 * Blocks are laid out by `layoutRouting()` and coloured by module, as the panel's lesson highlights are. What
 * `routingState()` says the patch uses now is lit, its lines drawn solid with the signal running along them; the
 * rest is dimmed. Audio, CV and gate lines are drawn apart (thick, thin, dotted), and cables in their own colours.
 * It is drawn from the panel's values and cables, so it follows the panel as the patch changes. Structural, not
 * heard: a filter closed to nothing is still lit, which the key says.
 */

import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { routingState } from '@/lib/app/synths/lib/routing';
import { BLOCK_H, BLOCK_W, layoutRouting } from '@/lib/app/synths/lib/routing-layout';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import type { ControlValues, SynthDef, SynthRouting } from '@/lib/app/synths/contract';

export function RoutingView({
  def,
  routing,
  values,
  cables,
  wheel,
}: {
  def: SynthDef;
  routing: SynthRouting;
  values: ControlValues;
  cables: (CableLike & { color?: string })[];
  /** Mod wheel position, 0..1. */
  wheel: number;
}) {
  const titleId = useId();
  const descId = useId();
  const state = useMemo(
    () => routingState(def, routing, { values, cables, wheel }),
    [def, routing, values, cables, wheel]
  );
  // Laid out again only when a cable goes in or comes out, not on every turn of a knob: `state.cables` is a new array
  // each time, so the memo is keyed on the blocks each cable joins.
  const cableEnds = state.cables.map((c) => `${c.fromBlock}>${c.toBlock}`).join(' ');
  const layout = useMemo(
    () =>
      layoutRouting(
        routing,
        cableEnds
          .split(' ')
          .filter(Boolean)
          .map((ends, i) => {
            const [from, to] = ends.split('>');
            return { id: `cable:${i}`, from, to };
          })
      ),
    [routing, cableEnds]
  );
  const size: CSSProperties & Record<'--routing-w', string> = {
    '--routing-w': `${layout.width}px`,
  };
  // A cable's path by its id: the layout leaves out one whose ends are not both blocks.
  const cablePath = new Map(layout.cables.map((p) => [p.id, p]));
  const byId = useMemo(() => new Map(routing.blocks.map((b) => [b.id, b])), [routing]);
  const colourOf = (block: string) => moduleOf(byId.get(block)?.module).color;
  // A cable's colour, from the patch: `state.cables` keeps the patch's order but drops a cable it cannot place.
  const cableColour = (from: string, to: string) =>
    cables.find((c) => c.from === from && c.to === to)?.color ?? moduleOf('patch').color;

  const lit = routing.blocks.filter((b) => state.blocks[b.id]).map((b) => b.name);
  const dark = routing.blocks.filter((b) => !state.blocks[b.id]).map((b) => b.name);

  return (
    <div className="kys-routing">
      <div className="kys-routing-scroll kys-scroll">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="kys-routing-svg"
          style={size}
        >
          <title id={titleId}>{`${def.name} signal routing`}</title>
          <desc id={descId}>
            {`In use now: ${lit.join(', ') || 'nothing'}. Not in use: ${dark.join(', ') || 'nothing'}.`}
          </desc>
          {routing.edges.map((e, i) => {
            const p = layout.edges[i];
            const live = state.edges[e.id];
            return (
              <g
                key={e.id}
                data-edge={e.id}
                data-live={live ? 'true' : 'false'}
                className={`kys-route-edge is-${e.signal} ${live ? 'is-live' : ''}`}
                style={{ color: colourOf(e.from) }}
              >
                <title>{`${byId.get(e.from)?.name} → ${byId.get(e.to)?.name}${e.label ? ` (${e.label})` : ''}`}</title>
                <path d={p.d} className="kys-route-line" />
                {live && <path d={p.d} className="kys-route-flow" />}
              </g>
            );
          })}
          {state.cables.map((c, i) => {
            const p = cablePath.get(`cable:${i}`);
            if (!p) return null;
            return (
              <g
                key={p.id}
                data-cable={`${c.from}>${c.to}`}
                data-live={c.live ? 'true' : 'false'}
                className={`kys-route-edge is-cable ${c.live ? 'is-live' : ''}`}
                style={{ color: cableColour(c.from, c.to) }}
              >
                <title>{`Cable: ${byId.get(c.fromBlock)?.name} → ${byId.get(c.toBlock)?.name}`}</title>
                <path d={p.d} className="kys-route-line" />
                {c.live && <path d={p.d} className="kys-route-flow" />}
              </g>
            );
          })}
          {routing.blocks.map((b) => {
            const at = layout.blocks[b.id];
            const live = state.blocks[b.id];
            return (
              <g
                key={b.id}
                data-block={b.id}
                data-live={live ? 'true' : 'false'}
                className={`kys-route-block ${live ? 'is-live' : ''}`}
                style={{ color: moduleOf(b.module).color }}
                transform={`translate(${at.x} ${at.y})`}
              >
                <title>{b.description}</title>
                <rect width={BLOCK_W} height={BLOCK_H} rx={7} />
                <text
                  x={BLOCK_W / 2}
                  y={BLOCK_H / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                >
                  {b.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul aria-label="Key" className="kys-routing-key">
        <li>
          <svg width="26" height="8" aria-hidden="true" className="kys-route-edge is-audio is-live">
            <path d="M1,4 H25" className="kys-route-line" />
          </svg>
          Audio
        </li>
        <li>
          <svg width="26" height="8" aria-hidden="true" className="kys-route-edge is-cv is-live">
            <path d="M1,4 H25" className="kys-route-line" />
          </svg>
          Control voltage
        </li>
        <li>
          <svg width="26" height="8" aria-hidden="true" className="kys-route-edge is-gate is-live">
            <path d="M1,4 H25" className="kys-route-line" />
          </svg>
          Gate
        </li>
        <li>
          <svg width="26" height="8" aria-hidden="true" className="kys-route-edge is-cable is-live">
            <path d="M1,4 H25" className="kys-route-line" />
          </svg>
          Cable, in its colour on the panel
        </li>
        <li className="kys-routing-note">
          Lit: the path the patch is set to use now. A part can be lit and still quiet, such as a
          filter closed right down.
        </li>
      </ul>
    </div>
  );
}
