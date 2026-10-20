'use client';

/**
 * The player's own pieces (`f-player`): what turns the panel into something you watch and play, as a video player
 * gathers its controls round the picture. BeatBreaker's drummer player is the precedent (its `studio/player/`).
 *
 * - `Wordmark`: the app's name in the corner of the stage, with an LED that is lit while the sound is on.
 * - `SoundDesign`: the strip at the top of the dock that teaches how the sound is built: the sound picker, and the
 *   lesson's sections as a video's chapters. Each opens the lesson card over the panel (`lesson-card.tsx`).
 * - `FullscreenButton`: the whole player full screen, where the browser allows it.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Check, ChevronDown, Maximize, Minimize, Play, Square } from 'lucide-react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import type { PresetStep } from '@/lib/app/synths/contract';
import { stepIds } from '@/components/app/synth/lesson';
import { highlightStore } from '@/components/app/synth/stores';
import type { CardId } from '@/components/app/synth/lesson-card';
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
 * The Sound Design strip (t-74): one compact row at the top of the dock, the same height whatever is open.
 *
 * - The sound's name is the sound picker: it opens the library over the strip (a bottom sheet below `lg`).
 * - Then the lesson's sections in order: How it works, each step as a chapter in its module's colour (filled up to
 *   the step the panel is at), the finished sound, and Make it yours. Choosing one opens it in the lesson card, and a
 *   step also moves the panel to it.
 */
export function SoundDesign({
  steps,
  step,
  onStep,
  soundName,
  soundRef,
  onChooseSound,
  soundsOpen = false,
  onCloseSounds,
  sounds,
  hasLesson,
  tweaks,
  card,
  onSection,
}: {
  steps: readonly PresetStep[];
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  onStep: (k: number | null) => void;
  /** What is on the panel: a library sound, one of the user's, or "Blank patch". */
  soundName: string;
  /** "In the style of…", where the sound has one. */
  soundRef: string | null;
  /** Opens (or closes) the sound library. */
  onChooseSound: () => void;
  /** Whether the library is open over the strip. Below `lg` it is a sheet instead, and this stays false. */
  soundsOpen?: boolean;
  onCloseSounds?: () => void;
  /** The library, shown over the strip while `soundsOpen`. */
  sounds?: ReactNode;
  /** Whether the sound on the panel has a lesson: How it works is about it. */
  hasLesson: boolean;
  /** How many ways to make it yours the lesson has. */
  tweaks: number;
  /** The section open in the lesson card, if any. */
  card: CardId | null;
  onSection: (id: CardId) => void;
}) {
  const n = steps.length;
  const pick = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  // The library closes on a press outside it (not on the picker, which toggles it), and on Escape inside it.
  useEffect(() => {
    if (!soundsOpen || !onCloseSounds) return undefined;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (pop.current?.contains(t) || pick.current?.contains(t)) return;
      onCloseSounds();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      onCloseSounds();
      pick.current?.focus();
    };
    const el = pop.current;
    document.addEventListener('pointerdown', onDown);
    el?.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      el?.removeEventListener('keydown', onKey);
    };
  }, [soundsOpen, onCloseSounds]);
  return (
    <section aria-labelledby="kys-design-h" className="kys-design">
      <h2 id="kys-design-h" className="sr-only">
        Sound design
      </h2>
      <div className="kys-design-row">
        <div className="relative min-w-0 shrink-0">
          <button
            ref={pick}
            type="button"
            className="kys-sound-pick"
            onClick={onChooseSound}
            aria-expanded={soundsOpen}
            aria-label={`Choose a sound (now: ${soundName})`}
            title="Choose a sound from the library"
          >
            <span className="kys-sound-pick-eyebrow">Sound</span>
            <span className="kys-sound-pick-name">{soundName}</span>
            {soundRef && <span className="kys-sound-pick-ref">{soundRef}</span>}
            <ChevronDown size={16} className="kys-sound-pick-caret" aria-hidden="true" />
          </button>
          {sounds !== undefined && (
            <div
              ref={pop}
              className="kys-sounds-pop kys-scroll"
              role="dialog"
              aria-label="Sounds"
              hidden={!soundsOpen}
            >
              {sounds}
            </div>
          )}
        </div>
        {hasLesson ? (
          <div className="kys-sections" role="group" aria-label="Lesson">
            <button
              type="button"
              className="kys-section-btn"
              aria-pressed={card === 'how'}
              onClick={() => onSection('how')}
            >
              How it works
            </button>
            {n > 0 && <Chapters steps={steps} step={step} onStep={onStep} />}
            {tweaks > 0 && (
              <button
                type="button"
                className="kys-section-btn"
                aria-pressed={card === 'tweaks'}
                onClick={() => onSection('tweaks')}
              >
                Make it yours <span className="kys-section-count">{tweaks}</span>
              </button>
            )}
          </div>
        ) : (
          <p className="kys-design-sub">
            This sound has no walkthrough. Choose a library sound to learn how one is built.
          </p>
        )}
      </div>
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
