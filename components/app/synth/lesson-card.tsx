'use client';

/**
 * The lesson card (`f-player` t-74): one section of the lesson floating over the panel from `lg` up, opened from the
 * Sound Design strip's chips. It does not block the panel, because the card tells you to turn knobs, and the knobs are
 * under it. What a step moves is listed as ①②③, and the panel carries the same numbers (`badgeStore`, drawn by
 * `LessonBadges`), so the card and the panel can be read together. The inspector opens in the same place from the
 * player bar, so there is one card at a time.
 *
 * Below `lg` the lesson stays in its bottom sheet (`lesson.tsx`), and this is not drawn.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { controlMap, displayName, formatValue, jackMap } from '@/lib/app/synths/lib/patch';
import type { Preset, PresetStep, SynthDef } from '@/lib/app/synths/contract';
import { badgeStore, focusStore, highlightStore } from '@/components/app/synth/stores';
import { StepText } from '@/components/app/synth/lesson';
import { markText, reachedStep } from '@/components/app/synth/library';
import type { LessonMark } from '@/components/app/synth/progress';

/** What the card is showing: a lesson section, or the inspector. */
export type CardId = 'how' | 'build' | 'tweaks' | 'inspector';

/** The controls a step moves, then the input end of each cable it patches: the order the card numbers them in. */
export const stepBadges = (s: PresetStep): string[] => [
  ...Object.keys(s.set || {}),
  ...(s.cables || []).map(([, to]) => to),
];

/** The controls a set of tweaks is about, once each, in their order. */
const tweakBadges = (p: Preset): string[] => [...new Set(p.tweaks.map((t) => t.id))];

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
  onSection: (id: CardId) => void;
  onClose: () => void;
  /** Which side of the panel the card floats on. */
  side: 'left' | 'right';
  onSide: () => void;
  /** The inspector, kept by the page so it keeps its state while the card shows the lesson. */
  inspector: ReactNode;
  mark?: LessonMark | null;
}

export function LessonCard({
  def,
  preset,
  step,
  onStep,
  section,
  onSection,
  onClose,
  side,
  onSide,
  inspector,
  mark = null,
}: LessonCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const n = preset?.steps.length ?? 0;
  const current = preset && step != null ? preset.steps[step] : undefined;

  // The panel's numbers follow the card: the step's moves, or the tweaks' controls.
  const badges =
    section === 'build' && current
      ? stepBadges(current)
      : section === 'tweaks' && preset
        ? tweakBadges(preset)
        : [];
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

  const lit = current ? [...Object.keys(current.set || {}), ...(current.cables || []).flat()] : [];
  const point = (ids: string[]) => () => highlightStore.set(ids);
  const back = point(lit);

  let eyebrow: ReactNode;
  let title: string;
  let body: ReactNode;
  let foot: ReactNode = null;

  if (section === 'inspector') {
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
  } else if (section === 'how') {
    const chain: PresetStep['module'][] = [];
    preset.steps.forEach((s) => {
      if (!chain.includes(s.module)) chain.push(s.module);
    });
    eyebrow = <span className="text-(--kys-accent)">How it works</span>;
    title = preset.name;
    body = (
      <>
        <p className="text-(--kys-muted)">{preset.ref}</p>
        <p className="mt-2 leading-relaxed">{preset.how}</p>
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
      </>
    );
    foot = (
      <>
        <span />
        {n > 0 && (
          <button
            type="button"
            className="kys-step-btn is-primary"
            onClick={() => {
              onStep(0);
              onSection('build');
            }}
          >
            Build it step by step
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </>
    );
  } else if (section === 'tweaks') {
    const cm = controlMap(def);
    const order = tweakBadges(preset);
    eyebrow = <span className="text-(--kys-accent)">Make it yours</span>;
    title = `${preset.tweaks.length} way${preset.tweaks.length === 1 ? '' : 's'} to change it`;
    body = (
      <>
        <ol className="flex flex-col gap-2.5">
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
    eyebrow = (
      <span className="flex items-center gap-1.5 text-(--kys-accent)">
        <Check size={12} strokeWidth={3} aria-hidden="true" /> The finished sound
      </span>
    );
    title = 'Everything is on the panel';
    body = (
      <>
        <p className="leading-relaxed text-(--kys-muted)">
          Step through it to watch the panel build the sound one move at a time, and hear what each
          move adds.
        </p>
        {mark && n > 0 && (
          <p className="mt-2 text-sm text-(--kys-muted)">
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
      </>
    );
    foot = n > 0 && (
      <>
        <span />
        <button
          type="button"
          className="kys-step-btn is-primary"
          aria-label="Start the lesson"
          onClick={() => onStep(0)}
        >
          Start at step 1
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
      aria-labelledby="kys-card-h"
      data-testid="lesson-card"
    >
      <header className="kys-card-head">
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
            onClick={onSide}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="kys-pbtn" aria-label="Close the card" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="kys-card-body kys-scroll" aria-live="polite">
        {body}
      </div>
      {foot && <footer className="kys-card-foot">{foot}</footer>}
    </aside>
  );
}
