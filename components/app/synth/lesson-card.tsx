'use client';

/**
 * The lesson card (`f-player` t-74): one section of the lesson floating over the panel from `lg` up, opened from the
 * Sound Design strip's chapters. The finished sound's chapter opens the overview: how the sound works and the ways
 * to make it yours. It does not block the panel, because the card tells you to turn knobs, and the knobs are
 * under it. What a step moves is listed as ①②③, and the panel carries the same numbers (`badgeStore`, drawn by
 * `LessonBadges`), so the card and the panel can be read together. The inspector opens in the same place from the
 * player bar, and so do the effects, so there is one card at a time.
 *
 * The card can be dragged by its header to anywhere on the screen, so it can be put over whatever part of the panel is
 * not in use; moved, it floats over the dock too (t-202). The ⇆ button docks it again, on the other side. Its grip at
 * the bottom right sizes it, by pointer or by the arrow keys (t-203), and the size is kept when it is docked again.
 *
 * The lesson hangs from a strip of the faceplate (`face`, t-201): its header is the panel's colour and silkscreen
 * ink, as the rails along the panel's head and foot are, so the card reads as part of the instrument; its body is the
 * stage's, so the text stands off any faceplate the card is over. The inspector and the effects are the stage's
 * throughout.
 *
 * Below `lg` the lesson stays in its bottom sheet (`lesson.tsx`), and this is not drawn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { stepBadges } from '@/lib/app/synths/lib/history';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { controlMap, displayName, formatValue, jackMap } from '@/lib/app/synths/lib/patch';
import type { Preset, PresetStep, SynthDef } from '@/lib/app/synths/contract';
import { START_STEP, hasStartStep, startStep } from '@/lib/app/synths/default-patch';
import {
  badgeStore,
  focusStore,
  highlightStore,
  moveStore,
  useStore,
} from '@/components/app/synth/stores';
import { StepText, stepIds, type StepHow } from '@/components/app/synth/lesson';
import { markText, reachedStep } from '@/components/app/synth/library';
import type { LessonMark } from '@/components/app/synth/progress';
import { LinksToggle } from '@/components/app/links/links-toggle';
import type { SuggestTarget } from '@/components/app/links/suggest-link';
import type { LinkSummary } from '@/lib/app/links/read';

/** What the card is showing: a lesson section, the inspector or the effects. */
export type CardId = 'build' | 'inspector' | 'fx';

/** The controls a sound's tweaks are about, once each, in their order. */
const tweakBadges = (p: Preset): string[] => [...new Set(p.tweaks.map((t) => t.id))];

/** How close a dragged card may come to the screen's edges, in px. */
const EDGE = 8;
/** How much of a dragged card stays on screen at the bottom: the header and a little of the body, in px. */
const KEEP = 120;
/** The smallest the card can be sized to, in px: room for the header's title and a few lines of the lesson. */
const MIN_W = 280;
const MIN_H = 180;
/** How far an arrow key sizes the card, in px; with Shift, four times as far. */
const NUDGE = 16;

/** Where a dragged card's top-left corner may go, kept on screen. */
const clampPos = (x: number, y: number, w: number) => ({
  x: Math.min(Math.max(x, EDGE), Math.max(EDGE, window.innerWidth - w - EDGE)),
  y: Math.min(Math.max(y, EDGE), Math.max(EDGE, window.innerHeight - KEEP)),
});

/** A size for a card whose top-left corner is at `x`, `y`: no smaller than the least, no further than the screen. */
const clampSize = (w: number, h: number, x: number, y: number) => ({
  w: Math.round(Math.min(Math.max(w, MIN_W), Math.max(MIN_W, window.innerWidth - x - EDGE))),
  h: Math.round(Math.min(Math.max(h, MIN_H), Math.max(MIN_H, window.innerHeight - y - EDGE))),
});

/** The grip's mark: two diagonal strokes in the corner, as a window's resize corner has. */
function GripMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M11 4 4 11M11 8.5 8.5 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A move's number; `now` while the move is being made on the panel (`f-step-moves`). */
function Num({ n, now = false }: { n: number; now?: boolean }) {
  return (
    <span className="kys-card-num" data-now={now || undefined} aria-hidden="true">
      {n}
    </span>
  );
}

export interface LessonCardProps {
  def: SynthDef;
  /** The sound whose lesson this is, or `null` when nothing on the panel has one. */
  preset: Preset | null;
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  onStep: (k: number | null, how?: StepHow) => void;
  section: CardId;
  onClose: () => void;
  /** Which side of the panel the card floats on. */
  side: 'left' | 'right';
  onSide: () => void;
  /** The inspector, kept by the page so it keeps its state while the card shows the lesson. */
  inspector: ReactNode;
  /** The effects rack. */
  effects: ReactNode;
  mark?: LessonMark | null;
  /** A library sound's videos and links, counted: its own and its inspiration's (`f-videos-and-links` t-183). */
  links?: LinkSummary;
  /** What a link suggested for it is about: a library sound, never one of a user's own (`f-link-suggestions` t-186). */
  suggestLink?: readonly SuggestTarget[];
  /** The player's colour roles in the faceplate's colours (`faceRoles`), for the lesson's header. */
  face?: CSSProperties;
}

/** A module's colour, kept as far off the face as the face's roles allow (`--kys-module-mix`; all of it on the stage). */
const moduleInk = (colour: string) =>
  `color-mix(in srgb, ${colour} var(--kys-module-mix, 100%), var(--kys-text))`;

export function LessonCard({
  def,
  preset,
  step,
  onStep,
  section,
  onClose,
  side,
  onSide,
  inspector,
  effects,
  mark = null,
  links,
  suggestLink,
  face,
}: LessonCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Where the card has been dragged to, or `null` while it is docked at its side.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; w: number } | null>(null);
  // The size the card has been given by its grip, or `null` for the stylesheet's.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const sizing = useRef<{
    id: number;
    x0: number;
    y0: number;
    w: number;
    h: number;
    x: number;
    y: number;
  } | null>(null);
  const n = preset?.steps.length ?? 0;
  const starting = !!preset && step === START_STEP;
  const current = preset && step != null && !starting ? preset.steps[step] : undefined;
  // Where the walkthrough starts: step 0, the Default patch, where the lesson has it.
  const begin = hasStartStep(preset) ? START_STEP : 0;
  // The move being made on the panel, while Next step or Replay changes shows the step's moves.
  const moving = useStore(moveStore, (m) => m?.id ?? null);

  // The panel's numbers follow the card: the step's moves, or, with the finished sound on, the tweaks' controls. Step 0
  // sets the whole patch, so it has no moves to number.
  const badges =
    section !== 'build' || !preset || starting
      ? []
      : current
        ? stepBadges(current)
        : tweakBadges(preset);
  const badgeKey = badges.join('|');
  useEffect(() => {
    badgeStore.set(badgeKey ? badgeKey.split('|') : []);
  }, [badgeKey]);
  useEffect(() => () => badgeStore.set([]), []);

  // Closed from inside (Escape or ×), focus goes back to what opened the card rather than dropping to the page. The
  // opener is whatever focus last came into the card from, so a section switched from the bar is the one returned to.
  // Only when focus is in the card: a mouse close that left focus elsewhere is not moved.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    const el = ref.current;
    if (!el) return undefined;
    const onFocusIn = (e: FocusEvent) => {
      const from = e.relatedTarget;
      if (from instanceof HTMLElement && !el.contains(from)) opener.current = from;
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, []);
  const close = useCallback(() => {
    const inside = !!ref.current?.contains(document.activeElement);
    onClose();
    if (inside && opener.current?.isConnected) opener.current.focus();
  }, [onClose]);

  // Escape inside the card closes it. Not on the window: the panel and the dialogs have their own uses for it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [close]);

  // A dragged or sized card stays on screen when the window shrinks.
  const dragged = pos != null;
  const sized = size != null;
  useEffect(() => {
    if (!dragged && !sized) return undefined;
    // The size first, to the screen alone (so a card that only needs moving keeps it), then the place, for that width.
    const onResize = () => {
      const w = Math.min(ref.current?.offsetWidth ?? 0, window.innerWidth - 2 * EDGE);
      setSize((z) => (z ? clampSize(z.w, z.h, EDGE, EDGE) : z));
      setPos((p) => (p ? clampPos(p.x, p.y, w) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dragged, sized]);

  // Dragged by the header, but not by its buttons.
  const onDragStart = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0 || (e.target as Element).closest('button')) return;
    const r = el.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onDragMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clampPos(e.clientX - d.dx, e.clientY - d.dy, d.w));
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  // Sized by the grip at its bottom right, its top-left corner staying put. A docked card stands on the dock by its
  // foot, so it is first lifted out where it is, or its top would move instead of its foot.
  const fromHere = () => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!pos) setPos({ x: r.left, y: r.top });
    return r;
  };
  const onSizeStart = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const r = fromHere();
    if (!r) return;
    sizing.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      w: r.width,
      h: r.height,
      x: r.left,
      y: r.top,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onSizeMove = (e: ReactPointerEvent<HTMLElement>) => {
    const z = sizing.current;
    if (!z || z.id !== e.pointerId) return;
    setSize(clampSize(z.w + e.clientX - z.x0, z.h + e.clientY - z.y0, z.x, z.y));
  };
  const onSizeEnd = (e: ReactPointerEvent<HTMLElement>) => {
    if (sizing.current?.id === e.pointerId) sizing.current = null;
  };
  const onSizeKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const by: Partial<Record<string, [number, number]>> = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowDown: [0, step],
      ArrowUp: [0, -step],
    };
    const d = by[e.key];
    if (!d) return;
    e.preventDefault();
    const r = fromHere();
    if (!r) return;
    setSize(clampSize(r.width + d[0], r.height + d[1], r.left, r.top));
  };

  const lit = starting ? stepIds(startStep(def)) : current ? stepIds(current) : [];
  const point = (ids: string[]) => () => highlightStore.set(ids);
  const back = point(lit);

  // A lesson the tutor wrote says so wherever it is read, as the lesson panel's header does: it is checked by ear only.
  const aiMark = preset?.ai ? (
    <p className="mb-2">
      <span className="kys-label rounded bg-(--kys-raised) px-1.5 py-0.5 text-(--kys-muted)">
        AI designed · check by ear
      </span>
    </p>
  ) : null;

  let eyebrow: ReactNode;
  let title: string;
  let body: ReactNode;
  let foot: ReactNode = null;

  if (section === 'fx') {
    eyebrow = <span className="text-(--kys-accent)">Effects</span>;
    title = 'Pedals after the synth';
    body = effects;
  } else if (section === 'inspector') {
    eyebrow = <span className="text-(--kys-accent)">Inspector</span>;
    title = 'What is under the pointer';
    body = inspector;
  } else if (!preset) {
    eyebrow = <span className="text-(--kys-accent)">Lesson</span>;
    title = 'No lesson for this patch';
    body = (
      <p className="text-(--kys-muted)">
        Choose a library patch to learn how one is built, a step at a time.
      </p>
    );
  } else if (starting) {
    // Step 0: the Default patch on the user's own synth, before step 1. The panel shows it, to copy a control at a time.
    const s = startStep(def);
    eyebrow = <span className="text-(--kys-accent)">Step 0 of {n} · Start</span>;
    title = `Set your synth to the ${s.title}`;
    body = (
      <>
        <StepText text={s.why} className="text-[14.5px]" />
        <p className="mt-2 text-[13.5px] text-(--kys-muted)">
          The panel is set to it: copy each control across to your synth.
        </p>
      </>
    );
    foot = (
      <>
        <button type="button" className="kys-step-btn" aria-label="Previous lesson step" disabled>
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="kys-step-btn is-primary"
          aria-label="Next lesson step"
          onClick={() => onStep(0, 'next')}
        >
          Next step
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </>
    );
  } else if (current && step != null) {
    const m = moduleOf(current.module);
    const cm = controlMap(def);
    const jm = jackMap(def);
    const moves = stepBadges(current);
    eyebrow = (
      <span style={{ color: moduleInk(m.color) }}>
        Step {step + 1} of {n} · {m.label}
      </span>
    );
    title = current.title;
    body = (
      <>
        {aiMark}
        <StepText text={current.why} className="text-[14.5px]" />
        {moves.length > 0 && (
          <>
            <div className="mt-4 mb-1.5 flex items-center justify-between gap-2">
              <h3 className="kys-label text-(--kys-muted)">On the panel</h3>
              {step > begin && (
                <button
                  type="button"
                  className="kys-card-replay"
                  onClick={() => onStep(step, 'replay')}
                  title="Put the panel back to the step before and make this step's moves again"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Replay changes
                </button>
              )}
            </div>
            <ol className="flex flex-col gap-1" aria-label="What this step sets">
              {Object.entries(current.set || {}).map(([id, v]) => {
                const c = cm[id];
                if (!c) return null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="kys-card-move"
                      onPointerEnter={point([id])}
                      onPointerLeave={back}
                      onFocus={point([id])}
                      onBlur={back}
                      onClick={() =>
                        focusStore.set({ kind: 'control', id, x: 0, y: 0, tip: false })
                      }
                    >
                      <Num n={moves.indexOf(id) + 1} now={moving === id} />
                      <span className="kys-label text-(--kys-muted)">{displayName(def, c)}</span>
                      <span className="ml-auto font-mono">{formatValue(c, v)}</span>
                    </button>
                  </li>
                );
              })}
              {(current.unplug || []).map(([a, b]) => {
                const from = jm[a];
                const to = jm[b];
                if (!from || !to) return null;
                return (
                  <li key={`-${a}>${b}`}>
                    <span
                      className="kys-card-move"
                      onPointerEnter={point([a, b])}
                      onPointerLeave={back}
                    >
                      <Num n={moves.indexOf(b) + 1} now={moving === b} />
                      <span className="kys-label text-(--kys-muted)">Unplug</span>
                      <span className="ml-auto font-mono">
                        {from.label} out → {to.label} in
                      </span>
                    </span>
                  </li>
                );
              })}
              {(current.cables || []).map(([a, b]) => {
                const from = jm[a];
                const to = jm[b];
                if (!from || !to) return null;
                return (
                  <li key={`${a}>${b}`}>
                    <span
                      className="kys-card-move"
                      onPointerEnter={point([a, b])}
                      onPointerLeave={back}
                    >
                      <Num n={moves.indexOf(b) + 1} now={moving === b} />
                      <span className="kys-label text-(--kys-muted)">Cable</span>
                      <span className="ml-auto font-mono">
                        {from.label} out → {to.label} in
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </>
    );
    foot = (
      <>
        <button
          type="button"
          className="kys-step-btn"
          aria-label="Previous lesson step"
          disabled={step <= begin}
          onClick={() => onStep(step - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="kys-step-btn is-primary"
          aria-label={step >= n - 1 ? 'Finish the lesson' : 'Next lesson step'}
          onClick={() => onStep(step >= n - 1 ? null : step + 1, 'next')}
        >
          {step >= n - 1 ? 'Finish' : 'Next step'}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </>
    );
  } else {
    // The finished sound: how it works, and the ways to make it yours, since the whole sound is on the panel.
    const chain: PresetStep['module'][] = [];
    preset.steps.forEach((s) => {
      if (!chain.includes(s.module)) chain.push(s.module);
    });
    const cm = controlMap(def);
    const order = tweakBadges(preset);
    eyebrow = (
      <span className="flex items-center gap-1.5 text-(--kys-accent)">
        <Check size={12} strokeWidth={3} aria-hidden="true" /> The finished patch
      </span>
    );
    title = preset.name;
    body = (
      <>
        {aiMark}
        {preset.ref && <p className="text-(--kys-muted)">{preset.ref}</p>}
        {mark && n > 0 && (
          <p className="mt-1 text-sm text-(--kys-muted)">
            <span className={mark.completed ? 'text-(--kys-good)' : undefined}>
              {mark.completed
                ? '✓ You finished this lesson'
                : `You ${markText(mark, n).toLowerCase()}`}
            </span>
            {!mark.completed && (
              <button
                type="button"
                onClick={() => onStep(reachedStep(mark, n))}
                className="ml-2 text-(--kys-accent) underline underline-offset-2"
              >
                Continue from step {reachedStep(mark, n) + 1}
              </button>
            )}
          </p>
        )}
        <h3 className="kys-label mt-3 mb-1.5 text-(--kys-muted)">How it works</h3>
        <p className="leading-relaxed">{preset.how}</p>
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5"
          aria-label="Parts of the synth this patch uses, in order"
        >
          {chain.map((m, i) => (
            <span key={m} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-(--kys-faint)">→</span>}
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{ borderColor: moduleOf(m).color, color: moduleOf(m).color }}
              >
                {moduleOf(m).label}
              </span>
            </span>
          ))}
        </div>
        <LinksToggle
          key={preset.id}
          target="sound"
          id={`${def.id}/${preset.id}`}
          summary={links}
          suggest={suggestLink}
          label="Videos and links"
          className="mt-4"
        />
        {preset.tweaks.length > 0 && (
          <>
            <h3 className="kys-label mt-5 mb-1.5 text-(--kys-muted)">
              Make it yours · {preset.tweaks.length} way{preset.tweaks.length === 1 ? '' : 's'} to
              change it
            </h3>
            <ol className="flex flex-col gap-2.5" aria-label="Ways to make it yours">
              {preset.tweaks.map((t, i) => {
                const c = cm[t.id];
                if (!c) return null;
                return (
                  <li
                    key={i}
                    className="flex gap-2.5"
                    onPointerEnter={point([t.id])}
                    onPointerLeave={back}
                  >
                    <Num n={order.indexOf(t.id) + 1} />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          focusStore.set({ kind: 'control', id: t.id, x: 0, y: 0, tip: false })
                        }
                        className="kys-label"
                        style={{ color: moduleOf(c.module).color }}
                      >
                        {displayName(def, c)}
                      </button>
                      <p className="leading-snug font-semibold">{t.try}</p>
                      <p className="text-[13.5px] text-(--kys-muted)">{t.hear}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[13px] text-(--kys-faint)">
              Lost your place? The amber marker on each control shows where this patch had it.
              Double-click a knob to send it back.
            </p>
          </>
        )}
      </>
    );
    foot = n > 0 && (
      <>
        <span />
        <button type="button" className="kys-step-btn is-primary" onClick={() => onStep(begin)}>
          Build it step by step
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </>
    );
  }

  const lesson = section === 'build' ? face : undefined;
  return (
    <aside
      ref={ref}
      className={`kys-card ${lesson ? 'is-faced' : ''}`}
      data-side={side}
      data-detached={pos ? '' : undefined}
      style={{
        ...(size && { width: size.w, height: size.h }),
        ...(pos && {
          left: pos.x,
          top: pos.y,
          right: 'auto',
          bottom: 'auto',
          maxHeight: `calc(100vh - ${pos.y + EDGE}px)`,
        }),
      }}
      aria-labelledby="kys-card-h"
      data-testid="lesson-card"
    >
      <header
        className={`kys-card-head ${lesson ? 'kys-face' : ''}`}
        style={lesson}
        title="Drag to move the card"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div className="min-w-0">
          <p className="kys-card-eyebrow">{eyebrow}</p>
          <h2 id="kys-card-h" className="kys-card-title">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className="kys-pbtn"
            aria-label={`Move the card to the ${side === 'right' ? 'left' : 'right'}`}
            title="Move the card to the other side of the panel"
            onClick={() => {
              setPos(null);
              onSide();
            }}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="kys-pbtn" aria-label="Close the card" onClick={close}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      {/* The lesson is announced as it moves on; the inspector and the effects change on every hover and drag, and
      are not. */}
      <div
        className="kys-card-body kys-scroll"
        aria-live={section === 'build' ? 'polite' : undefined}
      >
        {body}
      </div>
      {foot && <footer className="kys-card-foot">{foot}</footer>}
      <button
        type="button"
        className="kys-card-grip"
        aria-label="Resize the card"
        title="Drag to resize the card (or use the arrow keys)"
        onPointerDown={onSizeStart}
        onPointerMove={onSizeMove}
        onPointerUp={onSizeEnd}
        onPointerCancel={onSizeEnd}
        onKeyDown={onSizeKey}
      >
        <GripMark />
      </button>
    </aside>
  );
}
