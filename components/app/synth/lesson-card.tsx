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
 * not in use. The ⇆ button docks it again, on the other side.
 *
 * Below `lg` the lesson stays in its bottom sheet (`lesson.tsx`), and this is not drawn.
 */

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { controlMap, displayName, formatValue, jackMap } from '@/lib/app/synths/lib/patch';
import type { Preset, PresetStep, SynthDef } from '@/lib/app/synths/contract';
import { badgeStore, focusStore, highlightStore } from '@/components/app/synth/stores';
import { StepText } from '@/components/app/synth/lesson';
import { markText, reachedStep } from '@/components/app/synth/library';
import type { LessonMark } from '@/components/app/synth/progress';

/** What the card is showing: a lesson section, the inspector or the effects. */
export type CardId = 'build' | 'inspector' | 'fx';

/**
 * The controls a step moves, then the input end of each cable it patches, once each (two cables can share an input):
 * the order the card numbers them in.
 */
export const stepBadges = (s: PresetStep): string[] => [
  ...new Set([...Object.keys(s.set || {}), ...(s.cables || []).map(([, to]) => to)]),
];

/** The controls a sound's tweaks are about, once each, in their order. */
const tweakBadges = (p: Preset): string[] => [...new Set(p.tweaks.map((t) => t.id))];

/** How close a dragged card may come to the screen's edges, in px. */
const EDGE = 8;
/** How much of a dragged card stays on screen at the bottom: the header and a little of the body, in px. */
const KEEP = 120;

/** Where a dragged card's top-left corner may go, kept on screen. */
const clampPos = (x: number, y: number, w: number) => ({
  x: Math.min(Math.max(x, EDGE), Math.max(EDGE, window.innerWidth - w - EDGE)),
  y: Math.min(Math.max(y, EDGE), Math.max(EDGE, window.innerHeight - KEEP)),
});

/** A move's number, as on the panel. */
function Num({ n }: { n: number }) {
  return (
    <span className="kys-card-num" aria-hidden="true">
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
  onStep: (k: number | null) => void;
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
}

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
}: LessonCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Where the card has been dragged to, or `null` while it is docked at its side.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; w: number } | null>(null);
  const n = preset?.steps.length ?? 0;
  const current = preset && step != null ? preset.steps[step] : undefined;

  // The panel's numbers follow the card: the step's moves, or, with the finished sound on, the tweaks' controls.
  const badges =
    section !== 'build' || !preset ? [] : current ? stepBadges(current) : tweakBadges(preset);
  const badgeKey = badges.join('|');
  useEffect(() => {
    badgeStore.set(badgeKey ? badgeKey.split('|') : []);
  }, [badgeKey]);
  useEffect(() => () => badgeStore.set([]), []);

  // Escape inside the card closes it. Not on the window: the panel and the dialogs have their own uses for it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A dragged card stays on screen when the window shrinks.
  const dragged = pos != null;
  useEffect(() => {
    if (!dragged) return undefined;
    const onResize = () => {
      const w = ref.current?.offsetWidth ?? 0;
      setPos((p) => (p ? clampPos(p.x, p.y, w) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dragged]);

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

  const lit = current ? [...Object.keys(current.set || {}), ...(current.cables || []).flat()] : [];
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
    title = 'No lesson for this sound';
    body = (
      <p className="text-(--kys-muted)">
        Choose a library sound to learn how one is built, a step at a time.
      </p>
    );
  } else if (current && step != null) {
    const m = moduleOf(current.module);
    const cm = controlMap(def);
    const jm = jackMap(def);
    const moves = stepBadges(current);
    eyebrow = (
      <span style={{ color: m.color }}>
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
            <h3 className="kys-label mt-4 mb-1.5 text-(--kys-muted)">On the panel</h3>
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
                      <Num n={moves.indexOf(id) + 1} />
                      <span className="kys-label text-(--kys-muted)">{displayName(def, c)}</span>
                      <span className="ml-auto font-mono">{formatValue(c, v)}</span>
                    </button>
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
                      <Num n={moves.indexOf(b) + 1} />
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
          disabled={step === 0}
          onClick={() => onStep(step - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="kys-step-btn is-primary"
          aria-label={step >= n - 1 ? 'Finish the lesson' : 'Next lesson step'}
          onClick={() => onStep(step >= n - 1 ? null : step + 1)}
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
        <Check size={12} strokeWidth={3} aria-hidden="true" /> The finished sound
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
          aria-label="Parts of the synth this sound uses, in order"
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
              Lost your place? The amber marker on each control shows where this sound had it.
              Double-click a knob to send it back.
            </p>
          </>
        )}
      </>
    );
    foot = n > 0 && (
      <>
        <span />
        <button type="button" className="kys-step-btn is-primary" onClick={() => onStep(0)}>
          Build it step by step
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </>
    );
  }

  return (
    <aside
      ref={ref}
      className="kys-card"
      data-side={side}
      data-detached={pos ? '' : undefined}
      style={
        pos
          ? {
              left: pos.x,
              top: pos.y,
              right: 'auto',
              bottom: 'auto',
              maxHeight: `calc(100vh - ${pos.y + EDGE}px)`,
            }
          : undefined
      }
      aria-labelledby="kys-card-h"
      data-testid="lesson-card"
    >
      <header
        className="kys-card-head"
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
          <button type="button" className="kys-pbtn" aria-label="Close the card" onClick={onClose}>
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
    </aside>
  );
}
