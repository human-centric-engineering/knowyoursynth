'use client';

/**
 * The player's own pieces (`f-player`): what turns the panel into something you watch and play, as a video player
 * gathers its controls round the picture. BeatBreaker's drummer player is the precedent (its `studio/player/`).
 *
 * - `Wordmark`: the app's name at the right of the Sound Design strip's heading, with an LED that is lit while the sound is on,
 *   and lit yellow while a lesson is being walked (t-204).
 * - `SoundPicker`: the patch's name under the panel, which opens the library (`SoundsDrawer`). Its LED pulses while a
 *   patch loads, when the keys are silent (`f-default-patch` t-172), so a dead key reads as "wait", not as broken.
 * - `SoundDesign`: the strip over the bar that teaches how the sound is built: the lesson's steps as a video's
 *   chapters. Each opens the lesson card over the panel (`lesson-card.tsx`).
 * - `FullscreenButton`: the whole player full screen, where the browser allows it.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Check, ChevronDown, ChevronUp, Maximize, Minimize, Play, Square, X } from 'lucide-react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { START_STEP } from '@/lib/app/synths/default-patch';
import type { PresetStep } from '@/lib/app/synths/contract';
import { stepIds } from '@/components/app/synth/lesson';
import { highlightStore } from '@/components/app/synth/stores';
import { PlayerTip } from '@/components/app/synth/player-tip';
import { logger } from '@/lib/logging';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import {
  PULSE_EVERY,
  prefersLessMotion,
  useStepTick,
} from '@/components/app/sequencer/use-step-tick';

/**
 * The app's name over the panel. The LED is the sound's, lit while it is on, except while a lesson is being walked
 * (`lesson`), when it is lit yellow: the strip's sign that a lesson is under way (t-204).
 */
export function Wordmark({ lit, lesson = false }: { lit: boolean; lesson?: boolean }) {
  return (
    <p className="kys-player-mark" aria-hidden="true">
      <span className={`kys-led ${lesson ? 'is-lesson' : lit ? 'is-lit' : ''}`} />
      Know Your Synth
    </p>
  );
}

/**
 * The patch picker (t-74): the patch's name under the panel, as a button that opens the library (t-207, from the start
 * of the player bar before). It opens the library as a drawer down the left of the screen (`SoundsDrawer`), over the
 * panel and the Play deck, so it has the screen's height whatever the deck holds (a bottom sheet below `lg`). Its LED
 * pulses while a patch loads, when the keys are silent (`f-default-patch` t-172), so a dead key reads as "wait", not as
 * broken. Its text is the name alone, which a long one can run past: its tooltip is the whole name, with its "In the
 * style of…" where it has one. What is loading is said in its label.
 */
export function SoundPicker({
  soundName,
  soundRef,
  onChooseSound,
  soundsOpen = false,
  loading = false,
  buttonRef,
}: {
  /** What is on the panel: a library sound, one of the user's, or "Default patch". */
  soundName: string;
  /** "In the style of…", where the sound has one. */
  soundRef: string | null;
  /** Opens (or closes) the sound library. */
  onChooseSound: () => void;
  /** Whether the library's drawer is open. Below `lg` it is a sheet instead, and this stays false. */
  soundsOpen?: boolean;
  /** A patch is loading onto the panel: nothing sounds until it has. */
  loading?: boolean;
  /** The button, for the drawer: a press on it toggles the drawer rather than closing it, and focus comes back to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="kys-title-pick"
      onClick={onChooseSound}
      aria-expanded={soundsOpen}
      aria-label={`Choose a patch (now: ${soundName}${loading ? ', loading' : ''})`}
      title={soundRef ? `${soundName}: ${soundRef}` : soundName}
    >
      {loading && <span className="kys-led is-lit kys-pulse" aria-hidden="true" />}
      <span className="kys-sound-title truncate">{soundName}</span>
      <ChevronDown size={18} className="kys-title-pick-caret" aria-hidden="true" />
    </button>
  );
}

/**
 * The library's drawer down the left of the screen, opened by the patch picker. In the player, outside its stage, so it
 * stacks over the Play deck and still shows with the player full screen. It closes on a press outside it (not on the
 * picker, which toggles it), on Escape inside it, and when focus leaves it for anything but the picker, by Tab or moved
 * by script.
 */
export function SoundsDrawer({
  open,
  onClose,
  pickRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The patch picker that opens it. */
  pickRef: RefObject<HTMLButtonElement | null>;
  /** The library. */
  children: ReactNode;
}) {
  const pop = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (pop.current?.contains(t) || pickRef.current?.contains(t)) return;
      onClose();
    };
    // Focus goes back to the picker without scrolling to it: it is under the panel, which may be well off screen.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      onClose();
      pickRef.current?.focus({ preventScroll: true });
    };
    // Only for focus that lands somewhere else: a press on the drawer's own padding leaves focus nowhere.
    const onFocusOut = (e: FocusEvent) => {
      const t = e.relatedTarget;
      if (!(t instanceof Node)) return;
      if (pop.current?.contains(t) || pickRef.current?.contains(t)) return;
      onClose();
    };
    const el = pop.current;
    document.addEventListener('pointerdown', onDown);
    el?.addEventListener('keydown', onKey);
    el?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      el?.removeEventListener('keydown', onKey);
      el?.removeEventListener('focusout', onFocusOut);
    };
  }, [open, onClose, pickRef]);
  return (
    <div ref={pop} className="kys-sounds-pop" role="dialog" aria-label="Patches" hidden={!open}>
      <div className="kys-drawer-head">
        <p className="kys-drawer-title">Patches</p>
        {/* The drawer covers the picker, so it carries its own way out. */}
        <button
          type="button"
          className="kys-pbtn"
          aria-label="Close the patches"
          onClick={() => {
            onClose();
            pickRef.current?.focus({ preventScroll: true });
          }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="kys-sounds-pop-body kys-scroll">{children}</div>
    </div>
  );
}

/**
 * The Sound Design strip (t-74): the lesson as a video's chapters, over the player bar. Each step is in its module's
 * colour (filled up to the step the panel is at), then the finished sound. Choosing one moves the panel to it and
 * opens it in the lesson card. The finished sound's card is the overview: how the sound works and the ways to make it
 * yours. From `lg` up, with a pointer, it is a drawer over the foot of the panel: its tab always shows at the right
 * of the dock's top, lifting a little as the pointer comes near (`data-near` on the dock, set by the page), and a
 * press on it slides the strip up, the tab settling into the strip's head with an × that closes it again. The
 * wordmark is at the head's left. Below that, the tab is not drawn and the strip is in
 * the dock's flow. It is drawn in the faceplate's colours (`face`, t-201), as part of the instrument.
 */
export function SoundDesign({
  steps,
  start = null,
  step,
  onStep,
  hasLesson,
  mark,
  lit = [],
  open = false,
  onToggle,
  face,
}: {
  steps: readonly PresetStep[];
  /** Step 0, the Default patch, for a lesson that has it. */
  start?: PresetStep | null;
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  onStep: (k: number | null) => void;
  /** Whether the sound on the panel has a lesson. */
  hasLesson: boolean;
  /** The app's wordmark, at the far right of the strip's heading. */
  mark?: ReactNode;
  /** The controls the page has lit for the step the panel is at, put back when a hovered step is left. */
  lit?: readonly string[];
  /** Whether the drawer is up (from `lg` up, with a pointer). */
  open?: boolean;
  onToggle?: () => void;
  /** The player's colour roles in the faceplate's colours (`faceRoles`); the stage's without it. */
  face?: CSSProperties;
}) {
  const n = steps.length;
  const bodyId = useId();
  return (
    <section
      aria-labelledby="kys-design-h"
      className={`kys-design ${face ? 'kys-face' : ''}`}
      style={face}
      data-open={open || undefined}
    >
      <button
        type="button"
        className="kys-design-tab"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        Learn sound design
        {/* Closed, a caret inviting the pull; open, the tab is in the strip's head and closes it. */}
        {open ? (
          <X size={13} strokeWidth={2.5} className="kys-design-tab-icon" aria-hidden="true" />
        ) : (
          <ChevronUp
            size={13}
            strokeWidth={2.5}
            className="kys-design-tab-icon"
            aria-hidden="true"
          />
        )}
      </button>
      {/* The body's two wrappers let the drawer slide by its own height (a grid row from 0fr to 1fr). */}
      <div id={bodyId} className="kys-design-body">
        <div className="kys-design-inner">
          {/* Open, the whole head closes it, as its tab (over the head's right) does: the tab is the way from the
              keyboard, so the head takes the pointer only. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="kys-design-head"
            data-closes={open || undefined}
            onClick={open ? onToggle : undefined}
          >
            <h2 id="kys-design-h" className="kys-design-h">
              Learn sound design
            </h2>
            {mark}
          </div>
          {/* What the area is for, met on entering it (t-227): a patch with a walkthrough to follow. */}
          {hasLesson && (
            <p className="kys-design-aim">
              Follow along on your own synth and experiment. Analog never sounds exactly the same
              twice, so the aim isn&apos;t to copy a sound note for note: it&apos;s to discover new
              sounds, and what your synth can do.
            </p>
          )}
          <div className="kys-design-row">
            {hasLesson ? (
              n > 0 && (
                <Chapters steps={steps} start={start} step={step} onStep={onStep} lit={lit} />
              )
            ) : (
              <p className="kys-design-sub">
                This patch has no walkthrough. Choose a library patch to learn how one is built.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One chapter per step, as long as each other and labelled with its number, the part of the synth it works on and
 * its title, and a last one for the finished sound. A lesson with step 0 opens with a short chapter for it: setting
 * the Default patch (`f-default-patch` t-173). While walking, the steps up to the panel's are filled and the one it is at glows; with the finished sound on
 * the panel, every step is filled. Hovered, a step lights its controls on the panel in place of whatever was
 * lit, as the lesson's step cards do, and leaving it puts back what the page had lit.
 */
export function Chapters({
  steps,
  start = null,
  step,
  onStep,
  lit = [],
}: {
  steps: readonly PresetStep[];
  start?: PresetStep | null;
  step: number | null;
  onStep: (k: number | null) => void;
  lit?: readonly string[];
}) {
  const walking = step != null;
  return (
    <ol className="kys-chapters" aria-label="Lesson steps">
      {start && (
        <li
          className="kys-chapter kys-chapter-start"
          data-state={step === START_STEP ? 'now' : 'done'}
        >
          <button
            type="button"
            onClick={() => onStep(START_STEP)}
            aria-current={step === START_STEP ? 'step' : undefined}
            aria-label={`Lesson step 0: ${start.title}`}
            onPointerEnter={() => highlightStore.set(stepIds(start))}
            onPointerLeave={() => highlightStore.set([...lit])}
          >
            <span className="kys-chapter-track" />
            <span className="kys-chapter-label" aria-hidden="true">
              <span className="kys-chapter-area">
                <span className="kys-chapter-num">0</span>
                <span className="kys-chapter-module">Start</span>
              </span>
              <span className="kys-chapter-name">{start.title}</span>
            </span>
          </button>
        </li>
      )}
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
              onPointerEnter={() => highlightStore.set(stepIds(s))}
              onPointerLeave={() => highlightStore.set([...lit])}
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
          aria-label="The finished patch"
        >
          <span className="kys-chapter-track" />
          <span className="kys-chapter-label" aria-hidden="true">
            <span className="kys-chapter-area">
              <Check size={12} strokeWidth={3} />
              <span className="kys-chapter-module">Finished</span>
            </span>
            <span className="kys-chapter-name">How it works</span>
          </span>
        </button>
      </li>
    </ol>
  );
}

/**
 * The player's play button: the sound's riff, or the sequencer's pattern while the sequencer is open or holds a pattern
 * chosen beside Play (one transport, t-213). Named for what it will do.
 *
 * Given the sequencer's playhead (`position`, while a pattern plays), the key glows briefly every
 * `PULSE_EVERY` steps, in time with what is heard, rather than breathing at its own pace (t-225). Not where the
 * browser asks for less motion: there it stays lit, still.
 */
export function PlayButton({
  playing,
  onClick,
  position,
}: {
  playing: boolean;
  onClick: () => void;
  position?: () => SeqPosition | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const stepped = playing && !!position;
  useStepTick(position, stepped, (at) => {
    const el = ref.current;
    if (!at || !el || at.step % PULSE_EVERY !== 0 || prefersLessMotion()) return;
    el.animate?.([{ filter: 'brightness(1.28) saturate(1.1)' }, { filter: 'none' }], {
      duration: 320,
      easing: 'ease-out',
    });
  });
  return (
    <PlayerTip
      name={playing ? 'Stop' : 'Play'}
      help={
        playing
          ? undefined
          : 'The pattern named beside it, played through the panel: the patch’s riff, unless another is chosen there or in the sequencer.'
      }
    >
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={`kys-play ${playing ? 'is-playing' : ''} ${stepped ? 'is-stepped' : ''}`}
      >
        <span className="kys-play-dot" aria-hidden="true">
          {playing ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Play size={19} fill="currentColor" className="translate-x-px" />
          )}
        </span>
        <span className="kys-play-word">{playing ? 'Stop' : 'Play'}</span>
      </button>
    </PlayerTip>
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
    <PlayerTip
      name={full ? 'Leave full screen' : 'Full screen'}
      help={full ? undefined : 'The panel, the bar and the piano fill the screen.'}
    >
      <button
        type="button"
        className="kys-pbtn"
        aria-label={full ? 'Leave full screen' : 'Full screen'}
        onClick={toggle}
      >
        {full ? (
          <Minimize size={17} aria-hidden="true" />
        ) : (
          <Maximize size={17} aria-hidden="true" />
        )}
      </button>
    </PlayerTip>
  );
}
