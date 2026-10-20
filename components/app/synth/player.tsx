'use client';

/**
 * The player's own pieces (`f-player`): what turns the panel into something you watch and play, as a video player
 * gathers its controls round the picture. BeatBreaker's drummer player is the precedent (its `studio/player/`).
 *
 * - `Wordmark`: the app's name in the corner of the stage, with an LED that is lit while the sound is on.
 * - `Chapters`: the lesson's steps as a video's chapters, one segment per step in its module's colour, filled up to the
 *   step the panel is at. A segment is a place to go: clicked, the panel moves to that step.
 * - `StepTransport`: back a step and on a step, as a player's skip buttons.
 * - `Captions`: the step the panel is at, said under the panel as a video's subtitles are.
 * - `FullscreenButton`: the whole player full screen, where the browser allows it.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Check, Maximize, Minimize, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import type { PresetStep } from '@/lib/app/synths/contract';
import { StepText, stepIds } from '@/components/app/synth/lesson';
import { highlightStore } from '@/components/app/synth/stores';
import { logger } from '@/lib/logging';

/** The app's name over the panel. The LED is the sound's: lit while it is on. */
export function Wordmark({ lit }: { lit: boolean }) {
  return (
    <p className="kys-player-mark" aria-hidden="true">
      <span className={`kys-led ${lit ? 'is-lit' : ''}`} />
      Know Your Synth
    </p>
  );
}

/**
 * One segment per step, as long as each other, and a last one for the finished sound. While walking, the steps up to
 * the panel's are filled and the one it is at glows; with the finished sound on the panel, every step is filled. Hovered
 * while nothing is being walked, a step lights its controls on the panel, as the lesson's step cards do.
 */
export function Chapters({
  steps,
  step,
  onStep,
}: {
  steps: readonly PresetStep[];
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  onStep: (k: number | null) => void;
}) {
  const walking = step != null;
  return (
    <ol className="kys-chapters" aria-label="Lesson steps">
      {steps.map((s, i) => {
        const m = moduleOf(s.module);
        const state = !walking || i < step ? 'done' : i === step ? 'now' : 'todo';
        // The step's module colour, for the stylesheet's fill and glow.
        const colour: CSSProperties & Record<'--chapter', string> = { '--chapter': m.color };
        return (
          <li key={i} className="kys-chapter" data-state={state} style={{ flexGrow: 1 }}>
            <button
              type="button"
              onClick={() => onStep(i)}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Lesson step ${i + 1}: ${s.title}`}
              title={`${i + 1}. ${s.title}`}
              onPointerEnter={() => !walking && highlightStore.set(stepIds(s))}
              onPointerLeave={() => !walking && highlightStore.set([])}
              style={colour}
            >
              <span className="kys-chapter-track" />
            </button>
          </li>
        );
      })}
      <li className="kys-chapter kys-chapter-end" data-state={walking ? 'todo' : 'now'}>
        <button
          type="button"
          onClick={() => onStep(null)}
          aria-current={walking ? undefined : 'step'}
          aria-label="The finished sound"
          title="The finished sound"
        >
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </button>
      </li>
    </ol>
  );
}

/**
 * Back a step and on a step. With the finished sound on the panel, "on" starts the lesson at its first step; from the
 * last step it finishes. Named apart from the lesson's own step arrows, which are still on the page.
 */
export function StepTransport({
  n,
  step,
  onStep,
}: {
  n: number;
  step: number | null;
  onStep: (k: number | null) => void;
}) {
  const next =
    step == null
      ? { to: 0, label: 'Start the lesson' }
      : step >= n - 1
        ? { to: null, label: 'Finish the lesson' }
        : { to: step + 1, label: 'Next lesson step' };
  return (
    <>
      <button
        type="button"
        className="kys-pbtn"
        aria-label="Previous lesson step"
        title="Back a step"
        disabled={step == null || step === 0}
        onClick={() => step != null && onStep(step - 1)}
      >
        <SkipBack size={17} fill="currentColor" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="kys-pbtn"
        aria-label={next.label}
        title={next.label}
        onClick={() => onStep(next.to)}
      >
        <SkipForward size={17} fill="currentColor" aria-hidden="true" />
      </button>
    </>
  );
}

/** The riff: the player's play button. Named for what it will do, as the page's tests and the old button were. */
export function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kys-play ${playing ? 'is-playing' : ''}`}
      title={playing ? 'Stop the riff' : 'Play a short riff that suits the sound'}
    >
      <span className="kys-play-dot" aria-hidden="true">
        {playing ? (
          <Square size={13} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" className="translate-x-px" />
        )}
      </span>
      {playing ? 'Stop riff' : 'Play riff'}
    </button>
  );
}

/** The step the panel is at, under the panel: its number, its part of the synth, its title and what to listen for. */
export function Captions({ steps, step }: { steps: readonly PresetStep[]; step: number }) {
  const s = steps[step];
  if (!s) return null;
  const m = moduleOf(s.module);
  return (
    <div className="kys-captions" aria-live="polite">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="kys-label" style={{ color: m.color }}>
          Step {step + 1} of {steps.length} · {m.label}
        </span>
        <span className="font-semibold text-(--kys-text)">{s.title}</span>
      </p>
      <StepText text={s.why} className="mt-1 max-w-[96ch] text-[14px]" />
    </div>
  );
}

/** Whether `target` is the element shown full screen, kept up to date. */
function useIsFullscreen(target: RefObject<HTMLElement | null>): boolean {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!target.current && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [target]);
  return full;
}

/**
 * The player full screen. Not drawn where the browser has no element full screen (an iPhone's Safari), rather than
 * drawn and doing nothing. A refusal (no user gesture, a frame that does not allow it) leaves the page as it was, and
 * is logged.
 */
export function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const full = useIsFullscreen(target);
  const [able, setAble] = useState(false);
  useEffect(() => setAble(typeof document !== 'undefined' && document.fullscreenEnabled), []);
  if (!able) return null;
  const toggle = () => {
    const refused = (err: unknown) =>
      logger.warn('synth page: full screen refused', { leaving: full, err: String(err) });
    if (full) void document.exitFullscreen().catch(refused);
    else void target.current?.requestFullscreen().catch(refused);
  };
  return (
    <button
      type="button"
      className="kys-pbtn"
      aria-label={full ? 'Leave full screen' : 'Full screen'}
      title={full ? 'Leave full screen' : 'Full screen'}
      onClick={toggle}
    >
      {full ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
    </button>
  );
}
