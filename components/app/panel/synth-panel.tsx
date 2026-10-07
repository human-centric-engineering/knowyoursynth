'use client';

/**
 * The faceplate renderer.
 *
 * Transliterated from the prototype file `prototype/src/panel/SynthPanel.jsx` (decision D3): same state, same handlers, same drawing
 * order. Added here: typed props, and the `design` prop (D11).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import {
  Cable,
  Fader,
  INK,
  Jack,
  Joystick,
  Knob,
  Leds,
  Matrix,
  MenuRow,
  ModularCase,
  PanelDefs,
  PAPER,
  Select,
  StaticDecor,
  Switch,
} from '@/components/app/panel/parts';
import type {
  CableHandlers,
  CablePoint,
  ControlChange,
  JackPress,
  PanelCtx,
} from '@/components/app/panel/parts';
import { isShown } from '@/lib/app/synths/lib/patch';
import {
  AreaLayer,
  DimLayer,
  DoorRings,
  HeatLayer,
  HeatRanks,
  Lens,
  Locator,
} from '@/components/app/panel/layers';
import {
  findStore,
  focusStore,
  lensStore,
  mapStore,
  pendingStore,
  useStore,
} from '@/components/app/synth/stores';
import type { CableFocus } from '@/components/app/synth/stores';
import type { ControlValues, PatchCable, SynthDef, Theme } from '@/lib/app/synths/contract';

/** Which end of a cable: the output plug (`from`) or the input plug (`to`). */
export type CableEnd = 'from' | 'to';

/**
 * How the panel is styled (D11). `faithful` draws the hardware as it looks. `neutral` draws the same layout, controls
 * and jacks in one house style for every synth, and leaves out every `brand` decor item (logos, wordmarks, badges).
 */
export type PanelDesign = 'faithful' | 'neutral';

/**
 * The neutral design's faceplate colours: the consumer palette's dark roles (`--kys-raised`, `--kys-surface`,
 * `--kys-text` under `[data-surface='consumer'].dark` in `app/brand-theme.css`). Copied as values, not `var()`,
 * because SVG presentation attributes do not reliably resolve custom properties. Change them with the palette.
 */
export const NEUTRAL_PANEL = { panel: '#222630', panel2: '#191c23', ink: '#ece9e2' } as const;

/**
 * A synth's theme in the neutral design: neutral colours, the panel's own `din` lettering and metal cheeks in place
 * of wood. The structural flags (label plates, knob rings, jack and button styles) stay, so the panel reads the same.
 */
export function neutralTheme(theme: Theme): Theme {
  return {
    ...theme,
    ...NEUTRAL_PANEL,
    font: 'din',
    weight: 500,
    cheeks: theme.cheeks === 'none' ? 'none' : 'metal',
  };
}

/**
 * The definition as the neutral design draws it: the neutral theme, no `brand` decor, and no maker or model name on
 * the modular case's plates. Every consumer of the faceplate's look (decor, heat glow, case) reads this, not `def`.
 */
export function neutralDef(def: SynthDef): SynthDef {
  return {
    ...def,
    theme: neutralTheme(def.theme),
    decor: def.decor.filter((d) => !d.brand),
    layout: def.layout && { ...def.layout, brand: '' },
  };
}

export interface SynthPanelProps {
  /**
   * The synth. Its views: the long faceplate as defined, or (with `layout`, from `modularDef()`) the modular case.
   * Which of the two is the caller's choice: pass the definition, or `modularDef(definition)`.
   */
  def: SynthDef;
  values: ControlValues;
  /** A lesson step's target values: each control shows a marker where it should go. */
  target?: ControlValues | null;
  cables: PatchCable[];
  /** Ink on paper (the worksheet) instead of the shaded hardware. */
  outline?: boolean;
  /** Magnifier zoom; 0 for none. */
  zoom?: number;
  areasOn?: boolean;
  dimOn?: boolean;
  heatOn?: boolean;
  onChange: ControlChange;
  onConnect: (from: string, to: string) => void;
  onRemoveCable: (i: number) => void;
  /** Moves one end of cable `i` to another jack. Without it the plugs cannot be dragged. */
  onMoveCable?: (i: number, end: CableEnd, jackId: string) => void;
  /** D11. Default `faithful`. */
  design?: PanelDesign;
}

type PressEvent = MouseEvent<SVGElement> | KeyboardEvent<SVGElement> | PointerEvent<SVGElement>;

/** Focus a cable so the tooltip and inspector explain it. `sticky` cards stay up until the next press anywhere (touch has no hover). */
const cableFocus = (
  e: PressEvent,
  from: string,
  to: string,
  at?: string,
  sticky = false
): CableFocus => {
  const pointer = 'clientX' in e ? e : null;
  const r =
    pointer && (pointer.clientX || pointer.clientY)
      ? null
      : e.currentTarget.getBoundingClientRect();
  return {
    kind: 'cable',
    id: `${from}>${to}`,
    from,
    to,
    at,
    x: r ? r.right : pointer ? pointer.clientX : 0,
    y: r ? r.bottom : pointer ? pointer.clientY : 0,
    tip: true,
    sticky,
  };
};

/** The plug being dragged. */
interface PlugDrag {
  i: number;
  end: CableEnd;
  x0: number;
  y0: number;
  moved: boolean;
  snap: string | null;
}

/**
 * The faceplate. Pure view over a SynthDef + current values + cables.
 * `outline` swaps the shaded hardware rendering for an ink-on-paper worksheet.
 */
export function SynthPanel({
  def,
  values,
  target,
  cables,
  outline = false,
  zoom = 0,
  areasOn = false,
  dimOn = false,
  heatOn = false,
  onChange,
  onConnect,
  onRemoveCable,
  onMoveCable,
  design = 'faithful',
}: SynthPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<PlugDrag | null>(null); // the plug being dragged: { i, end, x0, y0, moved, snap }
  const skipClick = useRef(false);
  const [drag, setDrag] = useState<{
    i: number;
    end: CableEnd;
    x: number;
    y: number;
    snap: string | null;
  } | null>(null); // { i, end, x, y, snap } while a plug is off its jack
  const [pending, setPending] = useState<string | null>(null); // jack id waiting for its partner
  const [mouse, setMouse] = useState<CablePoint | null>(null);
  const { view } = def;
  // What the faceplate looks like; `def` stays the source for geometry, jacks and cables.
  const shown = useMemo(() => (design === 'neutral' ? neutralDef(def) : def), [design, def]);
  const { theme, decor } = shown;
  const cheekW = theme.cheeks && theme.cheeks !== 'none' ? theme.cheekW || 40 : 0;
  const scale = view.w / 2000;

  const ctx = useMemo<PanelCtx>(
    () => ({
      outline,
      theme,
      ink: outline ? INK : theme.ink,
      panelFill: outline ? PAPER : theme.panel,
    }),
    [outline, theme]
  );
  const jackById = useMemo(() => Object.fromEntries(def.jacks.map((j) => [j.id, j])), [def]);
  // A pin matrix (VCS3): its rows and columns are jacks drawn as the matrix legends, and a cable between two of them is a pin.
  const inMatrix = useMemo(
    () => new Set(def.matrix ? [...def.matrix.rows, ...def.matrix.cols] : []),
    [def]
  );
  const isPin = (cb: PatchCable) => inMatrix.has(cb.from) && inMatrix.has(cb.to);

  useEffect(() => {
    setPending(null);
    setDrag(null);
    dragRef.current = null;
  }, [def]);
  useEffect(() => {
    if (!zoom) lensStore.set(null);
    return () => lensStore.set(null);
  }, [zoom]);
  useEffect(() => {
    pendingStore.set(pending);
    if (!pending) setMouse(null);
    return () => pendingStore.set(null);
  }, [pending]);
  const focusedCable = useStore(focusStore, (f) => (f && f.kind === 'cable' ? f.id : null));
  const mapState = useStore(mapStore, (m) => m.state);
  useEffect(() => {
    if (!pending) return undefined;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pending]);

  const onJack = useCallback<JackPress>(
    (id, e) => {
      const cur = pending;
      if (!cur) {
        setPending(id);
        return;
      }
      if (cur === id) {
        setPending(null);
        return;
      }
      const a = jackById[cur];
      const b = jackById[id];
      if (a.dir === b.dir) {
        setPending(id);
        return;
      } // same direction: start again from this jack
      const out = a.dir === 'out' ? a : b;
      const inp = a.dir === 'out' ? b : a;
      onConnect(out.id, inp.id);
      setPending(null);
      // Put the explanation of the new cable where the player is looking.
      if (e) focusStore.set(cableFocus(e, out.id, inp.id, id, true));
    },
    [pending, jackById, onConnect]
  );

  const toSvg = (e: PointerEvent<SVGElement>): CablePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, r: 12 };
  };

  // Dragging a plug: lift one end of a connected cable and drop it on another jack of the same kind.
  const endDrag = (e: PointerEvent<SVGElement>, drop: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d || !d.moved) return; // never left the jack: the click that follows unplugs the cable
    skipClick.current = true;
    setDrag(null);
    const cb = cables[d.i];
    if (drop && d.snap && cb) {
      const from = d.end === 'from' ? d.snap : cb.from;
      const to = d.end === 'to' ? d.snap : cb.to;
      onMoveCable?.(d.i, d.end, d.snap);
      focusStore.set({
        kind: 'cable',
        id: `${from}>${to}`,
        from,
        to,
        at: d.snap,
        x: e.clientX,
        y: e.clientY,
        tip: true,
        sticky: true,
      });
    } else focusStore.set((s) => (s && s.kind === 'cable' && s.prospect ? null : s));
  };
  const plugProps = (i: number, end: CableEnd): CableHandlers => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      skipClick.current = false;
      dragRef.current = { i, end, x0: e.clientX, y0: e.clientY, moved: false, snap: null };
    },
    onPointerMove: (e) => {
      const d = dragRef.current;
      const cb = cables[i];
      if (!d || d.i !== i || d.end !== end || !cb) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      const p = toSvg(e);
      if (!p) return;
      // The nearest jack of the same kind (an output plug can only go to another output) catches the plug.
      const dir = end === 'from' ? 'out' : 'in';
      let snap: string | null = null;
      let best = Infinity;
      def.jacks.forEach((j) => {
        if (j.dir !== dir || j.id === cb[end]) return;
        const dist = Math.hypot(j.x - p.x, j.y - p.y);
        if (dist < Math.max(30, (j.r || 16) * 2) && dist < best) {
          best = dist;
          snap = j.id;
        }
      });
      d.snap = snap;
      setDrag({ i, end, x: p.x, y: p.y, snap });
      if (snap) {
        const from = end === 'from' ? snap : cb.from;
        const to = end === 'to' ? snap : cb.to;
        focusStore.set({
          kind: 'cable',
          id: `${from}>${to}`,
          from,
          to,
          x: e.clientX,
          y: e.clientY,
          tip: true,
          prospect: true,
        });
      } else
        focusStore.set((s) =>
          s && s.kind === 'cable' && s.prospect ? null : s && s.tip ? { ...s, tip: false } : s
        );
    },
    onPointerUp: (e) => endDrag(e, true),
    onPointerCancel: (e) => endDrag(e, false),
    onClick: (e) => {
      e.stopPropagation();
      if (skipClick.current) {
        skipClick.current = false;
        return;
      }
      focusStore.set((s) => (s && s.id === `${cables[i].from}>${cables[i].to}` ? null : s));
      onRemoveCable(i);
    },
  });

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pending) setMouse(toSvg(e));
    // The lens follows the pointer, but holds still while a mouse button is down so it does not chase a knob drag.
    if (zoom && (e.pointerType !== 'mouse' || !e.buttons)) {
      const p = toSvg(e);
      if (p) lensStore.set({ x: p.x, y: p.y });
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${view.w} ${view.h}`}
      className="block h-auto w-full select-none"
      role="group"
      aria-label={`${def.maker} ${def.name} front panel`}
      onPointerMove={pending || zoom ? onMove : undefined}
      onPointerDown={() => findStore.set(null)}
      // Taking the mouse off the faceplate drops a cable that is being held. Mouse only: on a touch screen every
      // lifted finger counts as leaving, and that must not cancel tap-one-jack-then-the-other patching.
      onPointerLeave={(e) => {
        lensStore.set(null);
        if (pending && e.pointerType === 'mouse') {
          setPending(null);
          setMouse(null);
        }
      }}
      onClick={() => {
        if (pending) setPending(null);
      }}
    >
      <PanelDefs />
      <g id="kysPanelAll">
        {shown.layout ? (
          <ModularCase layout={shown.layout} view={view} ctx={ctx} />
        ) : outline ? (
          <g>
            <rect x="0" y="0" width={view.w} height={view.h} rx="10" fill={PAPER} />
            <rect x="0" y="0" width={view.w} height={view.h} rx="10" fill="url(#kysGrid)" />
            <rect
              x={cheekW}
              y="3"
              width={view.w - cheekW * 2}
              height={view.h - 6}
              rx="6"
              fill="none"
              stroke={INK}
              strokeWidth="3"
            />
            {cheekW > 0 &&
              [0, view.w - cheekW].map((x) => (
                <rect
                  key={x}
                  x={x + 3}
                  y="3"
                  width={cheekW - 6}
                  height={view.h - 6}
                  rx="5"
                  fill="none"
                  stroke={INK}
                  strokeWidth="2"
                  strokeDasharray="7 6"
                />
              ))}
          </g>
        ) : (
          <g>
            <linearGradient id="kysFace" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={theme.panel} />
              <stop offset="1" stopColor={theme.panel2 || theme.panel} />
            </linearGradient>
            <rect
              x={cheekW}
              y="0"
              width={view.w - cheekW * 2}
              height={view.h}
              fill="url(#kysFace)"
            />
            <rect
              x={cheekW}
              y="0"
              width={view.w - cheekW * 2}
              height="3"
              fill="#fff"
              opacity="0.12"
            />
            <rect
              x={cheekW}
              y={view.h - 4}
              width={view.w - cheekW * 2}
              height="4"
              fill="#000"
              opacity="0.35"
            />
            {cheekW > 0 &&
              [0, view.w - cheekW].map((x) => (
                <g key={x}>
                  <rect
                    x={x}
                    y="0"
                    width={cheekW}
                    height={view.h}
                    rx="5"
                    fill={theme.cheeks === 'wood' ? 'url(#kysWood)' : 'url(#kysMetal)'}
                  />
                  <rect
                    x={x}
                    y="0"
                    width={cheekW}
                    height={view.h}
                    rx="5"
                    fill="none"
                    stroke="#0008"
                    strokeWidth="2"
                  />
                </g>
              ))}
          </g>
        )}
        <StaticDecor decor={decor} ctx={ctx} />
        <Leds decor={decor} ctx={ctx} values={values} />
        {heatOn && !areasOn && <HeatLayer def={shown} values={values} outline={outline} />}
        {def.controls.map((c) => {
          if (!isShown(c, values)) return null;
          const value = values[c.id];
          const t = target ? target[c.id] : null;
          // The second axis of a joystick (`pairOf`) is drawn by the first.
          if (c.type === 'joystick')
            return c.pairOf ? null : (
              <Joystick
                key={c.id}
                c={c}
                value={value}
                value2={c.pair ? values[c.pair] : undefined}
                target={t}
                ctx={ctx}
                onChange={onChange}
              />
            );
          // const Comp = knob ? Knob : fader ? Fader : select ? Select : menu ? MenuRow : Switch
          if (c.type === 'knob')
            return <Knob key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={onChange} />;
          if (c.type === 'fader')
            return (
              <Fader key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={onChange} />
            );
          if (c.type === 'select')
            return (
              <Select key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={onChange} />
            );
          if (c.type === 'menu')
            return (
              <MenuRow key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={onChange} />
            );
          return <Switch key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={onChange} />;
        })}
        {def.jacks.map((j) =>
          inMatrix.has(j.id) ? null : (
            <Jack key={j.id} j={j} ctx={ctx} pending={pending === j.id} onJack={onJack} />
          )
        )}
        {dimOn && !areasOn && (
          <DimLayer def={def} cables={cables} values={values} outline={outline} />
        )}
        {heatOn && !areasOn && <HeatRanks def={shown} values={values} outline={outline} />}
        {def.matrix && (
          <Matrix
            def={def}
            cables={cables}
            ctx={ctx}
            onConnect={onConnect}
            onRemoveCable={onRemoveCable}
            faded={dimOn && !areasOn && mapState ? (id) => mapState[id] === 'dead' : null}
          />
        )}
        <g>
          {cables.map((cb, i) => {
            if (isPin(cb)) return null;
            const a = jackById[cb.from];
            const b = jackById[cb.to];
            if (!a || !b) return null;
            const id = `${cb.from}>${cb.to}`;
            const lifted: CablePoint | null =
              drag && drag.i === i
                ? drag.snap
                  ? jackById[drag.snap]
                  : { x: drag.x, y: drag.y, r: 12 }
                : null;
            const hover: CableHandlers | null =
              pending || drag
                ? null
                : {
                    onPointerEnter: (e) => {
                      if (e.pointerType === 'mouse') focusStore.set(cableFocus(e, cb.from, cb.to));
                    },
                    onPointerMove: (e) => {
                      if (e.pointerType === 'mouse' && !e.buttons)
                        focusStore.set(cableFocus(e, cb.from, cb.to));
                    },
                    onPointerLeave: () =>
                      focusStore.set((s) => (s && s.id === id ? { ...s, tip: false } : s)),
                  };
            // While a new cable is being held, plugs let clicks through to the jack underneath them.
            return (
              <Cable
                key={id}
                a={lifted && drag && drag.end === 'from' ? lifted : a}
                b={lifted && drag && drag.end === 'to' ? lifted : b}
                color={cb.color}
                scale={scale}
                active={focusedCable === id || !!lifted}
                faded={dimOn && !areasOn && !lifted && !!mapState && mapState[id] === 'dead'}
                hover={hover}
                plugs={pending || !onMoveCable ? null : [plugProps(i, 'from'), plugProps(i, 'to')]}
                passive={!!pending}
                onRemove={(e) => {
                  e.stopPropagation();
                  focusStore.set((s) => (s && s.id === id ? null : s));
                  onRemoveCable(i);
                }}
              />
            );
          })}
          {drag && drag.snap && jackById[drag.snap] && (
            <circle
              className="kys-pulse"
              cx={jackById[drag.snap].x}
              cy={jackById[drag.snap].y}
              r={(jackById[drag.snap].r || 16) * 1.5}
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}
          {pending && mouse && jackById[pending] && (
            <Cable a={jackById[pending]} b={mouse} color="#ffffff" scale={scale} ghost />
          )}
        </g>
      </g>
      {dimOn && !areasOn && <DoorRings def={def} values={values} />}
      <Locator def={def} />
      {areasOn && <AreaLayer def={def} />}
      {zoom > 0 && <Lens view={view} zoom={zoom} source="kysPanelAll" />}
    </svg>
  );
}
