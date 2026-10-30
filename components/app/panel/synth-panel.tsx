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
  FallingCable,
  reducedMotion,
  Fader,
  INK,
  Jack,
  Joystick,
  Knob,
  Leds,
  Mark,
  Matrix,
  MenuRow,
  ModularCase,
  PanelDefs,
  PAPER,
  Plate,
  Select,
  StaticDecor,
  Switch,
} from '@/components/app/panel/parts';
import type { NotePress } from '@/components/app/panel/parts';
import { tweenCables } from '@/lib/app/synths/lib/history';
import type {
  CableHandlers,
  CablePoint,
  ControlChange,
  JackPress,
  PanelCtx,
} from '@/components/app/panel/parts';
import { controlMap, faceView, isShown } from '@/lib/app/synths/lib/patch';
import { rebase } from '@/lib/app/sequencer/lanes';
import {
  AreaLayer,
  DimLayer,
  DoorRings,
  HeatLayer,
  HeatRanks,
  Lens,
  LessonBadges,
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
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';
import type { SynthDesign } from '@/lib/app/catalogue/designs';

/**
 * The id of the group holding everything drawn on the faceplate. The magnifier redraws it (`Lens`), and a routing
 * block's card shows a crop of it (`RoutingCard`), both through `<use>`, so neither draws the panel a second time.
 */
export const PANEL_ALL_ID = 'kysPanelAll';

/** Which end of a cable: the output plug (`from`) or the input plug (`to`). */
export type CableEnd = 'from' | 'to';

/**
 * How the panel is styled (D11, revised 2026-10-11). `faithful` draws the hardware as it looks. `neutral` draws the
 * same panel, in its own colours and lettering, without the maker's marks: every `brand` decor item (logos,
 * wordmarks, badges) and the modular case's maker and model plates are left out.
 */
export type PanelDesign = SynthDesign;

/**
 * The definition as the neutral design draws it: no `brand` decor, and no maker or model name on the modular case's
 * plates. Every consumer of the faceplate's look (decor, case) reads this, not `def`.
 */
export function neutralDef(def: SynthDef): SynthDef {
  return {
    ...def,
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
  /**
   * What the sequencer's mod lanes set on the step being heard: those controls draw these values in place of `values`.
   * Nothing else reads them, so what shows and what a turn starts from stay the panel's own: a turn of one of them
   * changes the panel's value by as much as the control moved (`rebase`).
   */
  moved?: ControlValues | null;
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
  /** Plays a touch plate's note (a `button` with `note`). Without it the plates only explain themselves. */
  onNote?: NotePress;
  /** D11. Default `neutral`: faithful needs a recorded approval. */
  design?: PanelDesign;
}

type PressEvent = MouseEvent<SVGElement> | KeyboardEvent<SVGElement> | PointerEvent<SVGElement>;

/** Focus a cable so the tooltip and inspector explain it. `sticky` cards stay up until the next press anywhere (touch has no hover). */
/** The time between the cables a new patch takes out and puts in, in ms, and the most it takes for them all. */
const REPATCH_STEP_MS = 150;
const REPATCH_ALL_MS = 3000;
/** How long after the panel opens a change of cables is the stored panel arriving, not a patch chosen, in ms. */
const REPATCH_SETTLE_MS = 1000;

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
  moved = null,
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
  onNote,
  design = 'neutral',
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
  // The front panel only: the end cheeks inside `view.w` are left out of the view, and not drawn.
  const face = faceView(shown);
  const cheekW = face.x;
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
  // A control the lanes hold is turned from the value it draws: the change goes to the panel's own value instead.
  const live = useRef({ moved, values, onChange });
  useEffect(() => {
    live.current = { moved, values, onChange };
  });
  const controlById = useMemo(() => controlMap(def), [def]);
  const onMovedChange = useCallback<ControlChange>(
    (id, v) => {
      const { moved: m, values: own, onChange: change } = live.current;
      const c = controlById[id];
      change(id, m && c && v !== null && Object.hasOwn(m, id) ? rebase(c, m[id], own[id], v) : v);
    },
    [controlById]
  );
  const turn = moved ? onMovedChange : onChange;
  const drawn = (id: string) => (moved && Object.hasOwn(moved, id) ? moved[id] : values[id]);
  // A pin matrix (VCS3): its rows and columns are jacks drawn as the matrix legends, and a cable between two of them is a pin.
  const inMatrix = useMemo(
    () => new Set(def.matrix ? [...def.matrix.rows, ...def.matrix.cols] : []),
    [def]
  );
  const isPin = (cb: PatchCable) => inMatrix.has(cb.from) && inMatrix.has(cb.to);

  // The cables as drawn, a step behind the patch's: when it changes by more than one at once (another sound, a lesson
  // step, Blank patch), the old come out one by one, in the order they were plugged, each dropping away, then the new go
  // in, each dropping into place (`tweenCables`). The engine has the new patch at once; only the drawing walks. Not as
  // the page opens (the stored panel arriving), on another synth, or with reduced motion: then they are just there.
  const cableKey = (cb: PatchCable) => `${cb.from}>${cb.to}`;
  const patchKey = cables.map(cableKey).join('|');
  const [drawnCables, setDrawnCables] = useState(cables);
  const drawnRef = useRef(drawnCables);
  useEffect(() => {
    drawnRef.current = drawnCables;
  });
  const openedAt = useRef<number | null>(null);
  const drawnFor = useRef(def.id);
  useEffect(() => {
    openedAt.current ??= performance.now();
    const from = drawnRef.current;
    const to = cables;
    const sameSynth = drawnFor.current === def.id;
    drawnFor.current = def.id;
    const had = new Set(from.map(cableKey));
    const has = new Set(to.map(cableKey));
    const n =
      from.filter((cb) => !has.has(cableKey(cb))).length +
      to.filter((cb) => !had.has(cableKey(cb))).length;
    const settling = performance.now() - openedAt.current < REPATCH_SETTLE_MS;
    if (n <= 1 || !sameSynth || settling || reducedMotion()) {
      setDrawnCables(to);
      return undefined;
    }
    const gap = Math.min(REPATCH_STEP_MS, REPATCH_ALL_MS / n);
    const timers = Array.from({ length: n }, (_, k) =>
      setTimeout(
        () => setDrawnCables(k === n - 1 ? to : tweenCables(from, to, (k + 0.5) / n)),
        k * gap
      )
    );
    return () => timers.forEach(clearTimeout);
    // `cables` is read through its key: a new array with the same cables is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchKey, def.id]);
  // Where a drawn cable is in the patch, for what is done to it; -1 for one drawn on its way out.
  const patchIndex = (cb: PatchCable) => cables.findIndex((c) => cableKey(c) === cableKey(cb));
  // The cable just plugged in (or an end just moved to another jack, which makes it another cable): the one new cable
  // since the last render, which drops into place. A sound loaded brings many at once, and they hang still.
  const cableIds = drawnCables.filter((cb) => !isPin(cb)).map((cb) => `${cb.from}>${cb.to}`);
  // Kept from the last render (state, not a ref, so it is read in render): a change of cables names the one new one.
  const cablesKey = cableIds.join('|');
  // And the one cable gone, unplugged on its own (a click, or Unplug all taking them one by one): it is drawn falling
  // from the jack still holding it (`FallingCable`) until it has dropped away. Many gone at once (a sound loaded) just go.
  const [lastCables, setLastCables] = useState({
    key: cablesKey,
    ids: cableIds,
    cables: drawnCables.filter((cb) => !isPin(cb)),
    plugged: null as string | null,
    seq: 0,
  });
  const [leaving, setLeaving] = useState<{ k: number; cable: PatchCable }[]>([]);
  let plugged = lastCables.plugged;
  if (lastCables.key !== cablesKey) {
    const fresh = cableIds.filter((x) => !lastCables.ids.includes(x));
    const gone = lastCables.cables.filter((cb) => !cableIds.includes(`${cb.from}>${cb.to}`));
    plugged = fresh.length === 1 ? fresh[0] : null;
    const seq = lastCables.seq + 1;
    if (gone.length === 1 && fresh.length === 0)
      setLeaving((l) => [...l, { k: seq, cable: gone[0] }]);
    setLastCables({
      key: cablesKey,
      ids: cableIds,
      cables: drawnCables.filter((cb) => !isPin(cb)),
      plugged,
      seq,
    });
  }

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
      viewBox={`${face.x} 0 ${face.w} ${face.h}`}
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
      <g id={PANEL_ALL_ID}>
        {shown.layout ? (
          <ModularCase layout={shown.layout} view={view} ctx={ctx} />
        ) : outline ? (
          <g>
            <rect x="0" y="0" width={view.w} height={view.h} fill={PAPER} />
            <rect x="0" y="0" width={view.w} height={view.h} fill="url(#kysGrid)" />
            <rect
              x={cheekW + 3}
              y="3"
              width={view.w - cheekW * 2 - 6}
              height={view.h - 6}
              rx="6"
              fill="none"
              stroke={INK}
              strokeWidth="3"
            />
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
          </g>
        )}
        <StaticDecor decor={decor} ctx={ctx} />
        <Leds decor={decor} ctx={ctx} values={values} />
        {heatOn && !areasOn && <HeatLayer def={shown} values={values} outline={outline} />}
        {def.controls.map((c) => {
          if (!isShown(c, values)) return null;
          const value = drawn(c.id);
          const t = target ? target[c.id] : null;
          // The second axis of a joystick (`pairOf`) is drawn by the first.
          if (c.type === 'joystick')
            return c.pairOf ? null : (
              <Joystick
                key={c.id}
                c={c}
                value={value}
                value2={c.pair ? drawn(c.pair) : undefined}
                target={t}
                ctx={ctx}
                onChange={turn}
              />
            );
          if (c.type === 'button' && c.note != null)
            return <Plate key={c.id} c={c} onNote={onNote} />;
          // const Comp = knob ? Knob : fader ? Fader : select ? Select : menu ? MenuRow : Switch
          if (c.type === 'knob')
            return <Knob key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={turn} />;
          if (c.type === 'fader')
            return <Fader key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={turn} />;
          if (c.type === 'select')
            return <Select key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={turn} />;
          if (c.type === 'menu')
            return <MenuRow key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={turn} />;
          return <Switch key={c.id} c={c} value={value} target={t} ctx={ctx} onChange={turn} />;
        })}
        {def.marks?.map((m) => (
          <Mark key={m.id} m={m} />
        ))}
        {def.jacks.map((j) =>
          inMatrix.has(j.id) ? null : (
            <Jack key={j.id} j={j} ctx={ctx} pending={pending === j.id} onJack={onJack} />
          )
        )}
        {dimOn && !areasOn && (
          <DimLayer def={def} cables={cables} values={values} outline={outline} />
        )}
        {heatOn && !areasOn && <HeatRanks def={shown} values={values} outline={outline} />}
        {!areasOn && <LessonBadges def={shown} values={values} />}
        {def.matrix && (
          <Matrix
            def={def}
            cables={drawnCables}
            ctx={ctx}
            onConnect={onConnect}
            onRemoveCable={(k) => {
              const i = patchIndex(drawnCables[k]);
              if (i >= 0) onRemoveCable(i);
            }}
            faded={dimOn && !areasOn && mapState ? (id) => mapState[id] === 'dead' : null}
          />
        )}
        <g>
          {drawnCables.map((cb) => {
            if (isPin(cb)) return null;
            const i = patchIndex(cb);
            const a = jackById[cb.from];
            const b = jackById[cb.to];
            if (!a || !b) return null;
            const id = `${cb.from}>${cb.to}`;
            const lifted: CablePoint | null =
              drag && i >= 0 && drag.i === i
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
                plugs={
                  pending || !onMoveCable || i < 0
                    ? null
                    : [plugProps(i, 'from'), plugProps(i, 'to')]
                }
                passive={!!pending || i < 0}
                drop={id === plugged}
                onRemove={(e) => {
                  e.stopPropagation();
                  focusStore.set((s) => (s && s.id === id ? null : s));
                  if (i >= 0) onRemoveCable(i);
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
          {leaving.map(({ k, cable }) =>
            jackById[cable.from] && jackById[cable.to] ? (
              <FallingCable
                key={k}
                a={jackById[cable.from]}
                b={jackById[cable.to]}
                color={cable.color}
                scale={scale}
                onDone={() => setLeaving((l) => l.filter((x) => x.k !== k))}
              />
            ) : null
          )}
          {pending && mouse && jackById[pending] && (
            <Cable a={jackById[pending]} b={mouse} color="#ffffff" scale={scale} ghost />
          )}
        </g>
      </g>
      {dimOn && !areasOn && <DoorRings def={def} values={values} />}
      <Locator def={def} />
      {areasOn && <AreaLayer def={def} />}
      {zoom > 0 && <Lens view={view} zoom={zoom} source={PANEL_ALL_ID} />}
    </svg>
  );
}
