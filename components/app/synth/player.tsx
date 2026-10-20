'use client';

/**
 * The player's own pieces (`f-player`): what turns the panel into something you watch and play, as a video player
 * gathers its controls round the picture. BeatBreaker's drummer player is the precedent (its `studio/player/`).
 *
 * - `Wordmark`: the app's name in the corner of the stage, with an LED that is lit while the sound is on.
 * - `SoundDesign`: the strip under the panel that teaches how the sound is built: its heading, the sound picker, the
 *   lesson's steps as a video's chapters, and the step the panel is at, as subtitles, between Previous and Next.
 * - `FullscreenButton`: the whole player full screen, where the browser allows it.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Play,
  Sparkle,
  Square,
} from 'lucide-react';
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
 * The Sound Design strip under the panel: the sound on it, the steps it is built in, and the step the panel is at.
 * A sound with a lesson is a walk from a blank-ish panel to the finished sound, and this is where the learner sees
 * that and moves along it, as a video's chapters and subtitles are under the picture.
 *
 * - The heading says what the strip is for. The sound's name beside it is the sound picker: it opens the library.
 * - The steps are chapters, labelled, each in its module's colour and filled up to the step the panel is at, with a
 *   labelled stop at the end for the finished sound.
 * - The card under them is the step the panel is at, flanked by Previous and Next; with the finished sound on, it
 *   offers to start the walk at step 1.
 */
export function SoundDesign({
  steps,
  step,
  onStep,
  soundName,
  soundRef,
  onChooseSound,
}: {
  steps: readonly PresetStep[];
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  onStep: (k: number | null) => void;
  /** What is on the panel: a library sound, one of the user's, or "Blank patch". */
  soundName: string;
  /** "In the style of…", where the sound has one. */
  soundRef: string | null;
  /** Opens the sound library. */
  onChooseSound: () => void;
}) {
  const n = steps.length;
  return (
    <section aria-labelledby="kys-design-h" className="kys-design">
      <header className="kys-design-head">
        <div className="min-w-0">
          <h2 id="kys-design-h" className="kys-design-title">
            <Sparkle aria-hidden="true" />
            Sound design
          </h2>
          <p className="kys-design-sub">
            {n > 0
              ? `How this sound is built, in ${n} step${n === 1 ? '' : 's'}. Walk through them and hear each one land.`
              : 'This sound has no walkthrough. Choose a library sound to learn how one is built.'}
          </p>
        </div>
        <button
          type="button"
          className="kys-sound-pick"
          onClick={onChooseSound}
          aria-label={`Choose a sound (now: ${soundName})`}
          title="Choose a sound from the library"
        >
          <span className="kys-sound-pick-eyebrow">Sound</span>
          <span className="kys-sound-pick-name">{soundName}</span>
          {soundRef && <span className="kys-sound-pick-ref">{soundRef}</span>}
          <ChevronDown size={16} className="kys-sound-pick-caret" aria-hidden="true" />
        </button>
      </header>
      {n > 0 && (
        <>
          <Chapters steps={steps} step={step} onStep={onStep} />
          <StepCard steps={steps} step={step} onStep={onStep} />
        </>
      )}
    </section>
  );
}

/**
 * One chapter per step, as long as each other and labelled with its number, the part of the synth it works on and
 * its title, and a last one for the finished
 * sound. While walking, the steps up to the panel's are filled and the one it is at glows; with the finished sound on
 * the panel, every step is filled. Hovered while nothing is being walked, a step lights its controls on the panel, as
 * the lesson's step cards do.
 */
export function Chapters({
  steps,
  step,
  onStep,
}: {
  steps: readonly PresetStep[];
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
          <li key={i} className="kys-chapter" data-state={state}>
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
              <span className="kys-chapter-label" aria-hidden="true">
                <span className="kys-chapter-area">
                  <span className="kys-chapter-num">{i + 1}</span>
                  <span className="kys-chapter-module">{m.label}</span>
                </span>
                <span className="kys-chapter-name">{s.title}</span>
              </span>
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
          title="Put the whole finished sound back on the panel"
        >
          <span className="kys-chapter-track" />
          <span className="kys-chapter-label" aria-hidden="true">
            <span className="kys-chapter-area">
              <Check size={12} strokeWidth={3} />
              <span className="kys-chapter-module">Finished</span>
            </span>
            <span className="kys-chapter-name">The whole sound</span>
          </span>
        </button>
      </li>
    </ol>
  );
}

/**
 * The step the panel is at, as subtitles in a column of reading width in the middle of the strip, with Previous and
 * Next either side of it. With the finished sound on the panel, Next starts the lesson at step 1; from the last step it
 * finishes. Named apart from the lesson region's own step arrows, which can be on the page at the same time.
 */
function StepCard({
  steps,
  step,
  onStep,
}: {
  steps: readonly PresetStep[];
  step: number | null;
  onStep: (k: number | null) => void;
}) {
  const n = steps.length;
  const next =
    step == null
      ? { to: 0, label: 'Start the lesson', text: 'Start at step 1' }
      : step >= n - 1
        ? { to: null, label: 'Finish the lesson', text: 'Finish' }
        : { to: step + 1, label: 'Next lesson step', text: 'Next step' };
  const s = step != null ? steps[step] : undefined;
  const m = s ? moduleOf(s.module) : null;
  return (
    <div className="kys-step-card">
      <button
        type="button"
        className="kys-step-btn"
        aria-label="Previous lesson step"
        disabled={step == null || step === 0}
        onClick={() => step != null && onStep(step - 1)}
      >
        <ChevronLeft size={18} aria-hidden="true" />
        <span className="max-sm:sr-only">Previous</span>
      </button>
      <div className="kys-captions" aria-live="polite">
        {s && m ? (
          <>
            <p className="kys-captions-eyebrow" style={{ color: m.color }}>
              Step {(step ?? 0) + 1} of {n} · {m.label}
            </p>
            <p className="kys-captions-title">{s.title}</p>
            <StepText text={s.why} className="mt-1.5 text-[14.5px]" />
          </>
        ) : (
          <>
            <p className="kys-captions-eyebrow text-(--kys-accent)">The finished sound</p>
            <p className="kys-captions-title">Everything is on the panel.</p>
            <p className="mt-1.5 text-[14.5px] text-(--kys-muted)">
              Step through it to watch the panel build the sound one move at a time, and hear what
              each move adds.
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        className={`kys-step-btn ${step == null ? 'is-primary' : ''}`}
        aria-label={next.label}
        onClick={() => onStep(next.to)}
      >
        <span className="max-sm:sr-only">{next.text}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
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
