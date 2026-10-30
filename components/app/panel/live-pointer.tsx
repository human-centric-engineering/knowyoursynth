'use client';

/**
 * The live pointers on the panel's face (`f-live-panel` t-154): on the knob or fader that sets the filter's cutoff, and
 * on one that sets the VCA's gain where there is one, a second pointer at the value the engine is running at now. An
 * envelope or LFO sweeping the cutoff moves it while the knob itself stays put; with nothing moving the cutoff it sits
 * under the knob's own pointer and is not drawn.
 *
 * Which control, and where on it, come from the definition (`lib/app/synths/lib/live-pointer.ts`); the value from the
 * engine's meters (`MeterEvent.cutoff`, `.amp`). As the live glow does, the loop writes straight to the elements once a
 * frame, never through React state. The pointer eases between meters, about 25 a second; a visitor who asks for less
 * motion gets it at each meter's value, without easing.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { maxAtBottom } from '@/lib/app/synths/contract';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';
import {
  pointerControls,
  pointerSwitches,
  pointerTable,
  pointerValue,
  type PointerControl,
  type PointerKnob,
} from '@/lib/app/synths/lib/live-pointer';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { settle } from '@/lib/app/synths/lib/routing-activity';
import { meterStore } from '@/components/app/synth/stores';
import { knobRim, reducedMotion } from '@/components/app/panel/parts';

/** Nearer its control's own position than this share of the travel, a pointer is under the control's own and hidden. */
const SAME = 0.01;

/** Where along its travel `v` is on control `c`, 0..1. */
const travel = (c: PointerControl, v: number) =>
  Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min)));

/**
 * The transform that puts a pointer `f` (0..1) along control `c`'s travel: turned about a knob's centre as its own
 * pointer turns (−150° to 150°), or beside a fader's slot opposite the lesson's ghost.
 */
export function pointerAt(c: PointerControl, f: number): string {
  if (c.type === 'knob') return `rotate(${(-150 + 300 * f).toFixed(2)} ${c.x} ${c.y})`;
  const len = c.len || 200;
  const g = maxAtBottom(c) ? 1 - f : f;
  return c.orient !== 'h'
    ? `translate(${c.x + 26} ${(c.y + len / 2 - g * len).toFixed(2)})`
    : `translate(${(c.x - len / 2 + g * len).toFixed(2)} ${c.y - 20})`;
}

/** The pointer's mark, drawn at the transform's origin: on a knob's rim pointing in, or at a fader's cap. */
function mark(c: PointerControl): string {
  if (c.type === 'knob') return `M${c.x} ${c.y - knobRim(c) + 5}l7 -13h-14z`;
  return c.orient !== 'h' ? 'M-5 0l13 -7v14z' : 'M0 5l-7 -13h14z';
}

export function LivePointers({
  def,
  cables,
  values,
}: {
  def: SynthDef;
  cables: PatchCable[];
  values: ControlValues;
}) {
  // Keyed on the jacks a cable is in, not the cables, which are a new array with every change to the patch.
  const patched = cables
    .flatMap((cb) => [cb.from, cb.to])
    .sort()
    .join(' ');
  const switches = pointerSwitches(def, values);
  const ctx = useMemo(
    () => ({
      wheel: 0,
      patched: Object.fromEntries(
        patched
          .split(' ')
          .filter(Boolean)
          .map((j) => [j, true])
      ),
    }),
    [patched]
  );
  const found = useMemo(() => pointerControls(def, switches, ctx), [def, switches, ctx]);
  const pointers = useMemo(
    () => found.map(({ param, control }) => pointerTable(def, param, control, values, ctx)),
    [def, found, values, ctx]
  );

  // Read through a ref, so the loop runs for as long as the layer is up rather than restarting with every knob turned.
  const gRef = useRef<SVGGElement>(null);
  const live = useRef({ pointers, values });
  useLayoutEffect(() => {
    live.current = { pointers, values };
  });
  const any = pointers.length > 0;
  useEffect(() => {
    if (!any) return;
    // Each pointer's eased place, and what was last written to it: a write is skipped when nothing would change.
    const shown = new Map<string, number>();
    const written = new WeakMap<Element, string>();
    const steady = reducedMotion();
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = now - last;
      last = now;
      const m = meterStore.get();
      const { pointers: ps, values: v } = live.current;
      for (const el of gRef.current?.querySelectorAll<SVGGElement>('[data-pointer]') ?? []) {
        const pk: PointerKnob | undefined = ps.find(
          (p) => p.param === el.getAttribute('data-pointer')
        );
        if (!pk) continue;
        const c = pk.control;
        const own = travel(c, Number(v[c.id] ?? c.def));
        const meter = m.power ? m[pk.param] : undefined;
        // Unmetered, the pointer rests under the control's own, so it sets out from there when a note starts.
        const target = meter == null ? own : travel(c, pointerValue(pk, meter));
        const f = steady ? target : settle(shown.get(pk.param) ?? own, target, dt, true);
        shown.set(pk.param, f);
        const transform = pointerAt(c, f);
        const opacity = meter != null && Math.abs(f - own) > SAME ? '1' : '0';
        const key = `${transform}|${opacity}`;
        if (written.get(el) === key) continue;
        written.set(el, key);
        el.setAttribute('transform', transform);
        el.style.opacity = opacity;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [any]);

  if (!any) return null;
  // The loop alone sets a pointer's transform: written here too, React would put it back under the knob's own pointer
  // with every turn of that knob, a frame before the loop moved it again.
  return (
    <g ref={gRef} pointerEvents="none" className="kys-live-pointers" data-testid="live-pointers">
      {pointers.map(({ param, control: c }) => (
        <g key={param} data-pointer={param} data-control={c.id} style={{ opacity: 0 }}>
          <path d={mark(c)} fill={moduleOf(c.module).color} stroke="#000a" strokeWidth="1.5" />
        </g>
      ))}
    </g>
  );
}
