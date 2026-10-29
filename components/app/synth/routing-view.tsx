'use client';

/**
 * The routing view (`f-routing-view` t-142, drawn as a manual's flow diagram in t-146): the back of the panel, a
 * diagram of how the synth's parts are wired. The page flips the panel over to it from the Signal routing toggle on
 * the panel's top rail.
 *
 * It is drawn on the faceplate in its silkscreen ink, as the rails are (`--rail-face` / `--rail-print`, from the
 * page), so it is the panel's colours in Hardware and ink on paper in Outline. Blocks are laid out by
 * `layoutRouting()` and drawn as a service manual draws them: a box with the part's schematic symbol and its
 * designator (VCO, VCF, EG), and the module's colour kept to a small lamp. The synth's own routes are fine ink lines
 * with arrowheads (audio heavier, control voltage light, gate dotted); the player's cables are drawn over them as
 * cables, in their colours, with a jack at each end.
 *
 * Two layers of "in use". What `routingState()` says the patch routes is drawn solid, the rest faint: structural,
 * so a filter closed to nothing is still solid. Over that, what is going through it now (`routingActivity()`, from
 * the engine's meters and output level) lights the lamps and runs along the lines, and fades as the sound does; the
 * LFO, and an oscillator slow enough to see, pulse with their waves. That
 * is written straight to a CSS variable (`--a`) once a frame, never through React state.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
import { z } from 'zod';
import type { CSSProperties, ReactNode } from 'react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { routingState } from '@/lib/app/synths/lib/routing';
import {
  levelOfRms,
  routingActivity,
  settle,
  SILENT,
  type ActivityMeters,
} from '@/lib/app/synths/lib/routing-activity';
import { BLOCK_H, BLOCK_W, layoutRouting } from '@/lib/app/synths/lib/routing-layout';
import { meterStore } from '@/components/app/synth/stores';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import type {
  ControlValues,
  RoutingBlock,
  RoutingSymbol,
  SynthDef,
  SynthRouting,
} from '@/lib/app/synths/contract';

/** What the view reads the output's level from: the engine's analyser, as the scope does. */
export interface RoutingSource {
  analyser: Pick<AnalyserNode, 'fftSize' | 'getFloatTimeDomainData'> | null;
}

/** The symbol cell at a block's left, and the symbol's size in it. */
const CELL = 38;
const GLYPH = 22;

/** The symbol for a module, where a block does not name its own. */
const SYMBOL_OF: Record<string, RoutingSymbol> = {
  osc: 'osc',
  mixer: 'mixer',
  filter: 'filter',
  env: 'env',
  amp: 'amp',
  lfo: 'lfo',
  mod: 'mod',
  glide: 'pitch',
  fx: 'fx',
  out: 'out',
};

/** The designator a manual prints under each symbol. */
const TAG: Record<RoutingSymbol, string> = {
  osc: 'VCO',
  noise: 'NOISE',
  input: 'EXT',
  mixer: 'MIX',
  filter: 'VCF',
  env: 'EG',
  amp: 'VCA',
  lfo: 'LFO',
  mod: 'MOD',
  pitch: 'CV',
  midi: 'MIDI',
  fx: 'FX',
  out: 'OUT',
  util: 'UTIL',
};

/** Each symbol on a 24-unit square, in strokes. */
const GLYPHS: Record<RoutingSymbol, ReactNode> = {
  osc: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M6,12 C8,6.5 10,6.5 12,12 S16,17.5 18,12" />
    </>
  ),
  noise: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M5.5,12 L7.5,8.5 L9,15 L10.5,7.5 L12,16 L13.5,9 L15,14.5 L16.5,10 L18.5,12" />
    </>
  ),
  input: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.2" className="is-solid" />
    </>
  ),
  mixer: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12,6 V18 M6,12 H18" />
    </>
  ),
  filter: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" />
      <path d="M4.5,8.5 H12 C15,8.5 16,10 17,13 L19.5,19.5" />
    </>
  ),
  env: <path d="M2.5,19.5 L7,4.5 L11,11.5 H16 L21.5,19.5" />,
  amp: <path d="M4.5,3.5 L20.5,12 L4.5,20.5 Z" />,
  lfo: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M5.5,12 L8.75,7 L15.25,17 L18.5,12" />
    </>
  ),
  mod: (
    <>
      <path d="M3,6 L11,12 M3,18 L11,12 M14,12 H21" />
      <circle cx="12.5" cy="12" r="2.2" />
    </>
  ),
  pitch: <path d="M3,19.5 H7 V15.5 H11 V11.5 H15 V7.5 H21" />,
  midi: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      {[
        [6.5, 12],
        [17.5, 12],
        [8.1, 8.1],
        [15.9, 8.1],
        [12, 6.5],
      ].map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="1.1" className="is-solid" />
      ))}
      <path d="M10.5,19.5 H13.5" />
    </>
  ),
  fx: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" />
      <path d="M5,14 C7,8 9,8 10.5,12 S14,16 15.5,12 S18,9 19,10" />
    </>
  ),
  out: (
    <path d="M3.5,9 H7.5 L12.5,4.5 V19.5 L7.5,15 H3.5 Z M15.5,8.5 C17.5,10.5 17.5,13.5 15.5,15.5 M18,6 C21.5,9.5 21.5,14.5 18,18" />
  ),
  util: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8,12 H16" />
    </>
  ),
};

const symbolOf = (b: RoutingBlock): RoutingSymbol => b.symbol ?? SYMBOL_OF[b.module] ?? 'util';

/** A block's name in one line, or two split at the space nearest its middle when it is long. */
function nameLines(name: string): string[] {
  if (name.length <= 12 || !name.includes(' ')) return [name];
  const spaces = [...name].flatMap((ch, i) => (ch === ' ' ? [i] : []));
  const at = spaces.reduce((best, i) =>
    Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best
  );
  return [name.slice(0, at), name.slice(at + 1)];
}

/** The output's RMS, from `samples` read off the analyser. */
function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / (samples.length || 1));
}

export function RoutingView({
  def,
  routing,
  values,
  cables,
  wheel,
  source = null,
}: {
  def: SynthDef;
  routing: SynthRouting;
  values: ControlValues;
  cables: (CableLike & { color?: string })[];
  /** Mod wheel position, 0..1. */
  wheel: number;
  /** Where the output's level comes from. Absent: the audio path never lights, but the keyboard and contours do. */
  source?: RoutingSource | null;
}) {
  const titleId = useId();
  const descId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const state = useMemo(
    () => routingState(def, routing, { values, cables, wheel }),
    [def, routing, values, cables, wheel]
  );
  // Laid out again only when a cable goes in or comes out, not on every turn of a knob: `state.cables` is a new array
  // each time, so the memo is keyed on the blocks each cable joins (as JSON, which no id can break).
  const cableEnds = JSON.stringify(state.cables.map((c) => [c.fromBlock, c.toBlock]));
  const { layout, cablePath } = useMemo(() => {
    const ends = z.array(z.tuple([z.string(), z.string()])).parse(JSON.parse(cableEnds));
    const l = layoutRouting(
      routing,
      ends.map(([from, to], i) => ({ id: `cable:${i}`, from, to }))
    );
    // A cable's path by its id: the layout leaves out one whose ends are not both blocks.
    return { layout: l, cablePath: new Map(l.cables.map((p) => [p.id, p])) };
  }, [routing, cableEnds]);
  const size: CSSProperties & Record<'--routing-w', string> = {
    '--routing-w': `${layout.width}px`,
  };
  const byId = useMemo(() => new Map(routing.blocks.map((b) => [b.id, b])), [routing]);
  const accentOf = (block: string) => moduleOf(byId.get(block)?.module).color;
  // A cable's colour, from the patch: `state.cables` keeps the patch's order but drops a cable it cannot place.
  const cableColour = (from: string, to: string) =>
    cables.find((c) => c.from === from && c.to === to)?.color ?? moduleOf('patch').color;

  // The glow, once a frame: the meters and the output's level in, each part's `--a` eased towards its target. The
  // latest state and source are read through refs, so the loop runs for as long as the view is up rather than
  // restarting (and dropping every glow to dark) with every knob turned.
  const stateRef = useRef(state);
  const sourceRef = useRef(source);
  useEffect(() => {
    stateRef.current = state;
    sourceRef.current = source;
  }, [state, source]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Each part's eased level, and what was last written to it: a write is skipped when it would not show, but the
    // easing carries on from the exact level, or a slow fade on a fast screen would stall in steps too small to write.
    const shown = new Map<Element, number>();
    const written = new Map<Element, number>();
    let samples: Float32Array<ArrayBuffer> | null = null;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const m = meterStore.get();
      const an = sourceRef.current?.analyser;
      let out = 0;
      if (an) {
        if (samples?.length !== an.fftSize) samples = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(samples);
        out = levelOfRms(rmsOf(samples));
      }
      const meters: ActivityMeters = m.power
        ? {
            gate: m.gate,
            env1: m.env1 ?? 0,
            env2: m.env2 ?? 0,
            lfo: m.lfo,
            lfoHz: m.lfoHz ?? 0,
            osc: (m.oscV ?? []).map((v, k) => ({
              v,
              hz: m.oscHz?.[k] ?? 0,
              lv: m.oscLv?.[k] ?? 0,
            })),
            out,
          }
        : SILENT;
      const a = routingActivity(routing, stateRef.current, meters);
      const dt = now - last;
      last = now;
      const ease = (el: Element | null, target: number, pulsing: boolean) => {
        if (!(el instanceof SVGElement)) return;
        const v = settle(shown.get(el) ?? 0, target, dt, pulsing);
        shown.set(el, v);
        const was = written.get(el) ?? -1;
        // Small steps wait until they add up, but landing on the target is always written.
        if (v === was || (v !== target && Math.abs(v - was) < 0.004)) return;
        written.set(el, v);
        el.style.setProperty('--a', v.toFixed(3));
      };
      for (const [id, v] of Object.entries(a.blocks))
        ease(svg.querySelector(`[data-block="${CSS.escape(id)}"]`), v, a.pulsing[id]);
      for (const e of routing.edges)
        ease(
          svg.querySelector(`[data-edge="${CSS.escape(e.id)}"]`),
          a.edges[e.id],
          a.pulsing[e.from]
        );
      stateRef.current.cables.forEach((c, i) =>
        ease(svg.querySelector(`[data-cable-index="${i}"]`), a.cables[i], a.pulsing[c.fromBlock])
      );
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [routing]);

  const lit = routing.blocks.filter((b) => state.blocks[b.id]).map((b) => b.name);
  const dark = routing.blocks.filter((b) => !state.blocks[b.id]).map((b) => b.name);
  const arrow = `${titleId}-arrow`;

  return (
    <div className="kys-routing">
      <p className="kys-routing-caption" aria-hidden="true">
        <span>Signal flow</span>
        <span>{def.name}</span>
      </p>
      <div className="kys-routing-scroll kys-scroll">
        <svg
          ref={svgRef}
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
          <defs>
            <marker
              id={arrow}
              viewBox="0 0 8 8"
              refX="7.5"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0,0.5 L8,4 L0,7.5 Z" className="kys-route-arrow" />
            </marker>
          </defs>
          {routing.edges.map((e, i) => {
            const p = layout.edges[i];
            const live = state.edges[e.id];
            return (
              <g
                key={e.id}
                data-edge={e.id}
                data-live={live ? 'true' : 'false'}
                className={`kys-route-edge is-${e.signal} ${live ? 'is-live' : ''}`}
                style={{ color: accentOf(e.from) }}
              >
                <title>{`${byId.get(e.from)?.name} → ${byId.get(e.to)?.name}${e.label ? ` (${e.label})` : ''}`}</title>
                <path d={p.d} className="kys-route-line" markerEnd={`url(#${arrow})`} />
                {live && <path d={p.d} className="kys-route-flow" />}
              </g>
            );
          })}
          {routing.blocks.map((b) => {
            const at = layout.blocks[b.id];
            const live = state.blocks[b.id];
            const sym = symbolOf(b);
            const lines = nameLines(b.name);
            const nameX = CELL + (BLOCK_W - CELL) / 2;
            return (
              <g
                key={b.id}
                data-block={b.id}
                data-live={live ? 'true' : 'false'}
                data-symbol={sym}
                className={`kys-route-block ${live ? 'is-live' : ''}`}
                style={{ color: moduleOf(b.module).color }}
                transform={`translate(${at.x} ${at.y})`}
              >
                <title>{b.description}</title>
                <rect width={BLOCK_W} height={BLOCK_H} className="kys-route-box" />
                <path d={`M${CELL},0 V${BLOCK_H}`} className="kys-route-rule" />
                <g
                  className="kys-route-glyph"
                  transform={`translate(${(CELL - GLYPH) / 2} 4) scale(${GLYPH / 24})`}
                >
                  {GLYPHS[sym]}
                </g>
                <text x={CELL / 2} y={BLOCK_H - 6} textAnchor="middle" className="kys-route-tag">
                  {TAG[sym]}
                </text>
                <text x={nameX} y={BLOCK_H / 2} textAnchor="middle" className="kys-route-name">
                  {lines.map((line, k) => (
                    <tspan
                      key={k}
                      x={nameX}
                      dy={k === 0 ? `${0.35 - (lines.length - 1) * 0.55}em` : '1.1em'}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                <circle cx={BLOCK_W - 7} cy={7} r={2.6} className="kys-route-lamp" />
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
                data-cable-index={i}
                data-live={c.live ? 'true' : 'false'}
                className={`kys-route-edge is-cable ${c.live ? 'is-live' : ''}`}
                style={{ color: cableColour(c.from, c.to) }}
              >
                <title>{`Cable: ${byId.get(c.fromBlock)?.name} → ${byId.get(c.toBlock)?.name}`}</title>
                <path d={p.d} className="kys-route-casing" />
                <path d={p.d} className="kys-route-line" />
                {c.live && <path d={p.d} className="kys-route-flow" />}
                {[p.start, p.end].map(([x, y], k) => (
                  <circle key={k} cx={x} cy={y} r={4.5} className="kys-route-jack" />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <ul aria-label="Key" className="kys-routing-key">
        <li>
          <svg
            width="30"
            height="10"
            aria-hidden="true"
            className="kys-route-edge is-audio is-live"
          >
            <path d="M1,5 H29" className="kys-route-line" />
          </svg>
          Audio
        </li>
        <li>
          <svg width="30" height="10" aria-hidden="true" className="kys-route-edge is-cv is-live">
            <path d="M1,5 H29" className="kys-route-line" />
          </svg>
          Control voltage
        </li>
        <li>
          <svg width="30" height="10" aria-hidden="true" className="kys-route-edge is-gate is-live">
            <path d="M1,5 H29" className="kys-route-line" />
          </svg>
          Gate
        </li>
        <li>
          <svg
            width="30"
            height="10"
            aria-hidden="true"
            className="kys-route-edge is-cable is-live"
          >
            <path d="M5,5 H25" className="kys-route-casing" />
            <path d="M5,5 H25" className="kys-route-line" />
            <circle cx="5" cy="5" r="3.5" className="kys-route-jack" />
            <circle cx="25" cy="5" r="3.5" className="kys-route-jack" />
          </svg>
          Patch cable, in its colour
        </li>
        <li className="kys-routing-note">
          Solid: the path the patch is set to use. Lamps and moving lines: signal going through it
          now, fading as the sound does. A part can be on the path and still quiet, such as a filter
          closed right down.
        </li>
      </ul>
    </div>
  );
}
