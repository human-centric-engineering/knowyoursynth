'use client';

/**
 * The live glow on the panel's face (`f-live-panel` t-150): each part of the synth lights over its own controls as
 * signal goes through it, and fades with the note's release; the LFO and a slow oscillator pulse with their waves.
 * It is the routing view's lamps (`routingActivity()`), drawn where the knobs and patched jacks of each part are (`liveAreas()`),
 * over the "In use" wash, so the still picture and the live one read together.
 *
 * Over a contour, the knob for the stage its envelope is in lights too (t-152, `liveStages()`): Attack, then Decay,
 * then Sustain while the key is held, then Release after it, as the engine reports the stage (`env1Stage`).
 *
 * With Signal ▾ Live + flow (t-153, `LiveFlow`), a line runs from each lit part to the part it feeds while the patch
 * routes signal along it, glowing with the edge or pin it stands for (`routingActivity()`'s `edges` and `cables`), its
 * dashes running in the direction of flow.
 *
 * As on the routing view, the glow is written straight to a CSS variable (`--a`) once a frame, never through React
 * state, and so is how far the flow's dashes have run (`--run`). A visitor who asks for less motion gets steady glows
 * (`steadyMeters()`), and lines that show but do not run.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { liveAreas, liveStages } from '@/lib/app/synths/lib/live-areas';
import { liveFlows } from '@/lib/app/synths/lib/live-flow';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { routingActivity, settle } from '@/lib/app/synths/lib/routing-activity';
import type { RoutingState } from '@/lib/app/synths/lib/routing';
import { createMeterReader, type LiveSource } from '@/components/app/synth/live-meters';
import { meterStore } from '@/components/app/synth/stores';
import { reducedMotion } from '@/components/app/panel/parts';
import { LiveFlow, RUN_PER_S } from '@/components/app/panel/live-flow';
import type { ControlValues, PatchCable, SynthDef, SynthRouting } from '@/lib/app/synths/contract';

/**
 * What the panel needs to glow live: the synth's routing, what the patch routes now, and the engine to listen to;
 * `flow` = draw the lines between the lit parts too (Live + flow).
 */
export interface LiveGlow {
  routing: SynthRouting;
  state: RoutingState;
  source: LiveSource | null;
  flow?: boolean;
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
  const { routing, state, flow } = live;
  // Keyed on the jacks a cable is in, not the cables, which are a new array with every change to the patch.
  const patched = cables
    .flatMap((cb) => [cb.from, cb.to])
    .sort()
    .join(' ');
  const { areas, stages } = useMemo(() => {
    const jacks = patched.split(' ').filter(Boolean);
    return {
      areas: liveAreas(def, routing, jacks, values),
      stages: liveStages(def, routing, jacks, values),
    };
  }, [def, routing, patched, values]);
  const lines = useMemo(
    () => (flow ? liveFlows(def, routing, state, areas) : []),
    [flow, def, routing, state, areas]
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
    let dt = 0;
    // How far the flow's dashes have run: they stand still for a visitor who asks for less motion.
    let run = 0;
    const ease = (el: SVGElement, key: string, target: number, quick: boolean) => {
      const v = settle(shown.get(key) ?? 0, target, dt, quick);
      shown.set(key, v);
      const was = written.get(el) ?? -1;
      if (v === was || (v !== target && Math.abs(v - was) < 0.004)) return;
      written.set(el, v);
      el.style.setProperty('--a', v.toFixed(3));
    };
    let frame = requestAnimationFrame(function tick(now) {
      const { routing: r, state: st, source: src } = liveRef.current;
      const a = routingActivity(r, st, read(src, steady));
      const level = (block: string) => a.blocks[block] ?? 0;
      dt = now - last;
      last = now;
      for (const el of gRef.current?.querySelectorAll<SVGPathElement>('[data-live]') ?? []) {
        const id = el.getAttribute('data-live') ?? '';
        // An area two parts share (`liveAreas()`) glows with the brighter of them, and pulses as that one does.
        const lead = id.split(' ').reduce((x, y) => (level(y) > level(x) ? y : x));
        ease(el, id, level(lead), a.pulsing[lead]);
      }
      // A stage knob is on while its envelope is in that stage, and moves on quickly, as a pulse does.
      const m = meterStore.get();
      const at = {
        env1: m.power ? m.env1Stage : undefined,
        env2: m.power ? m.env2Stage : undefined,
      };
      for (const el of gRef.current?.querySelectorAll<SVGPathElement>('[data-stage]') ?? []) {
        const id = el.getAttribute('data-stage') ?? '';
        const env = el.getAttribute('data-env') === 'env2' ? 'env2' : 'env1';
        ease(el, id, at[env] === el.getAttribute('data-at') ? 1 : 0, true);
      }
      // A flow line glows with the brightest edge or pin it stands for, and pulses with the part it leaves.
      const flowEl = gRef.current?.querySelector<SVGGElement>('.kys-flow');
      for (const el of flowEl?.querySelectorAll<SVGGElement>('[data-flow]') ?? []) {
        const ids = (name: string) => (el.getAttribute(name) ?? '').split(' ').filter(Boolean);
        const target = Math.max(
          0,
          ...ids('data-edges').map((e) => a.edges[e] ?? 0),
          ...ids('data-cables').map((i) => a.cables[Number(i)] ?? 0)
        );
        ease(
          el,
          el.getAttribute('data-flow') ?? '',
          target,
          a.pulsing[el.getAttribute('data-from') ?? '']
        );
      }
      if (flowEl && !steady) {
        run = (run + (dt * RUN_PER_S) / 1000) % 1000;
        flowEl.style.setProperty('--run', run.toFixed(1));
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <g ref={gRef} pointerEvents="none" data-testid="live-layer">
      <g className="kys-live">
        {areas.map((a) => (
          <path key={a.id} data-live={a.id} d={a.d} fill={moduleOf(a.module).color} />
        ))}
        <g className="kys-live-stages">
          {stages.map((st) => (
            <path
              key={st.id}
              data-stage={st.id}
              data-env={st.env}
              data-at={st.stage}
              d={st.d}
              fill={moduleOf(st.module).color}
            />
          ))}
        </g>
      </g>
      {flow && <LiveFlow lines={lines} routing={routing} />}
    </g>
  );
}
