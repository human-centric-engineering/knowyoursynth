'use client';

/**
 * The live glow on the panel's face (`f-live-panel` t-150): each part of the synth lights over its own controls as
 * signal goes through it, and fades with the note's release; the LFO and a slow oscillator pulse with their waves.
 * It is the routing view's lamps (`routingActivity()`), drawn where the knobs that set each part are (`liveAreas()`),
 * over the "In use" wash, so the still picture and the live one read together.
 *
 * As on the routing view, the glow is written straight to a CSS variable (`--a`) once a frame, never through React
 * state. A visitor who asks for less motion gets steady glows (`steadyMeters()`).
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { liveAreas } from '@/lib/app/synths/lib/live-areas';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { routingActivity, settle } from '@/lib/app/synths/lib/routing-activity';
import type { RoutingState } from '@/lib/app/synths/lib/routing';
import { createMeterReader, type LiveSource } from '@/components/app/synth/live-meters';
import { reducedMotion } from '@/components/app/panel/parts';
import type { ControlValues, PatchCable, SynthDef, SynthRouting } from '@/lib/app/synths/contract';

/** What the panel needs to glow live: the synth's routing, what the patch routes now, and the engine to listen to. */
export interface LiveGlow {
  routing: SynthRouting;
  state: RoutingState;
  source: LiveSource | null;
}

export function LiveLayer({
  def,
  live,
  cables,
  values,
}: {
  def: SynthDef;
  live: LiveGlow;
  cables: PatchCable[];
  values: ControlValues;
}) {
  const { routing } = live;
  // Keyed on the jacks a cable is in, not the cables, which are a new array with every change to the patch.
  const patched = cables
    .flatMap((cb) => [cb.from, cb.to])
    .sort()
    .join(' ');
  const areas = useMemo(
    () => liveAreas(def, routing, patched.split(' ').filter(Boolean), values),
    [def, routing, patched, values]
  );

  // The latest routing, state and source are read through refs, so the loop runs for as long as the layer is up
  // rather than restarting (and dropping every glow to dark) with every knob turned.
  const gRef = useRef<SVGGElement>(null);
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  useEffect(() => {
    // Each part's eased level and what was last written to it, as on the routing view: a write is skipped when it
    // would not show, but the easing carries on from the exact level.
    const shown = new Map<string, number>();
    const written = new WeakMap<Element, number>();
    const read = createMeterReader();
    const steady = reducedMotion();
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const { routing: r, state: st, source: src } = liveRef.current;
      const a = routingActivity(r, st, read(src, steady));
      const dt = now - last;
      last = now;
      for (const el of gRef.current?.querySelectorAll<SVGPathElement>('[data-live]') ?? []) {
        const id = el.getAttribute('data-live') ?? '';
        const target = a.blocks[id] ?? 0;
        const v = settle(shown.get(id) ?? 0, target, dt, a.pulsing[id]);
        shown.set(id, v);
        const was = written.get(el) ?? -1;
        if (v === was || (v !== target && Math.abs(v - was) < 0.004)) continue;
        written.set(el, v);
        el.style.setProperty('--a', v.toFixed(3));
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <g ref={gRef} pointerEvents="none" className="kys-live" data-testid="live-layer">
      {areas.map((a) => (
        <path key={a.id} data-live={a.id} d={a.d} fill={moduleOf(a.module).color} />
      ))}
    </g>
  );
}
