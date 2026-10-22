'use client';

/**
 * The sequencer module (`f-step-sequencer` t-80): under the synth's panel, opened from the player bar, styled as a
 * hardware step sequencer. From `lg` up it is in the dock under the bar; below it, in a bottom sheet.
 *
 * - The head: the transport (Play and Stop, Fill) and the pattern's controls: tempo, swing, length, transpose, step
 *   size, direction, root and scale, the parts (A and B) and the order they chain in.
 * - The step keys, sixteen to a page, lit where a step plays and with the playhead running across them, turning to the
 *   page it is on while it plays (t-87). A key is
 *   chosen by a press (or the arrows), and turned on or off by a press on the chosen key (or Enter or Space).
 * - The tool row: Euclidean fill, rotate, octave and scale-degree shifts, reverse, randomise and mutate, copy and
 *   paste of a step or a page, clear, and Undo.
 * - The step inspector: the chosen step's values on encoders (`step-inspector.tsx`).
 * - Mod lanes (`mod-lanes.tsx`, t-82): a value per step for panel controls, under the keys. **Mod** shows them.
 *
 * - The patterns strip (`pattern-library.tsx`, t-81): save to My patterns, open one, or start from any synth's library.
 *
 * The pattern, its Undo and the transport are the page's (`use-sequencer.ts`), so closing the module loses nothing
 * and the bar's play button and this one are one transport. The rules the pattern plays by are in
 * `.context/app/sequencer.md`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardPaste,
  ChevronUp,
  Copy,
  Dices,
  Eraser,
  Play,
  Shuffle,
  SlidersVertical,
  Square,
  Undo2,
} from 'lucide-react';
import {
  DIRECTIONS,
  MAX_BPM,
  MAX_STEPS,
  MAX_TRANSPOSE,
  MIN_BPM,
  SCALE_NAMES,
  STEP_SIZE_NAMES,
  emptyStep,
  patternLength,
  type Pattern,
  type Step,
} from '@/lib/app/sequencer/pattern';
import {
  clearSteps,
  copySteps,
  euclidFill,
  keepMods,
  mutate,
  onlyLanes,
  pasteSteps,
  randomise,
  resizePattern,
  reverseSteps,
  rotateSteps,
  shiftDegree,
  shiftOctave,
} from '@/lib/app/sequencer/tools';
import {
  CHAINS,
  DIRECTION_LABELS,
  PART_NAMES,
  ROOT_NAMES,
  SCALE_LABELS,
  STEP_SIZE_LABELS,
  chainLabel,
  conditionMark,
  noteName,
} from '@/components/app/sequencer/labels';
import { Encoder } from '@/components/app/sequencer/encoder';
import { StepInspector, Toggle } from '@/components/app/sequencer/step-inspector';
import { ModLanes } from '@/components/app/sequencer/mod-lanes';
import type { ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { SeqSelect as Select } from '@/components/app/sequencer/select';
import type {
  SeqPosition,
  Sequencer as SequencerState,
} from '@/components/app/sequencer/use-sequencer';
import {
  PatternLibrary,
  type PatternLibraryProps,
} from '@/components/app/sequencer/pattern-library';
import { HelpButton } from '@/components/app/synth/bar-controls';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** Steps on one page of keys. */
export const PAGE = 16;

/** What the help lists: every control, as the panel's help does. */
export const SEQ_HELP: readonly (readonly [string, string])[] = [
  [
    'Step keys',
    'Press a key to choose its step; press it again to turn it on or off. From the keyboard: the arrows move along, Up and Down move its notes a semitone, Enter or Space turns it on or off, Delete makes it a rest.',
  ],
  [
    'Pages',
    'A pattern longer than 16 steps is shown 16 at a time. The page the playhead is on is lit, and while it plays the keys turn to it. A page you choose holds until the playhead moves on to the next.',
  ],
  [
    'Play and Stop',
    'Play on the bar plays the pattern while the sequencer is open, and Stop stops it.',
  ],
  [
    'Fill',
    'While it is on, steps set to “Only with Fill” play and steps set to “Not with Fill” do not, from the next loop.',
  ],
  [
    'Tempo and swing',
    'Beats per minute, and how late every second step is: 50% is straight, 75% a heavy shuffle.',
  ],
  ['Length and step size', 'How many steps the pattern has (up to 128), and how long each one is.'],
  [
    'Direction',
    'Forward, reverse, pendulum (there and back), random, or Brownian (a walk, mostly forward).',
  ],
  [
    'Root and scale',
    'Every note is moved to the nearest note of the scale as it plays. Chromatic leaves them as they are.',
  ],
  ['Transpose', 'Moves every note by semitones, before the scale.'],
  [
    'Patterns',
    'Save keeps the pattern in My patterns, to open again on any synth. My patterns opens one of yours; Library opens any synth’s riff as a starting point. With one of your sounds open, With sound makes the sound open the sequencer on the saved pattern.',
  ],
  ['A and B', 'Two variations of the pattern, chained: A A A B plays A three times, then B.'],
  [
    'Tools',
    'Euclid spreads hits as evenly as they go. Rotate, octave and degree shifts, reverse, randomise and mutate change the part being edited. Undo takes back any change.',
  ],
  [
    'Step inspector',
    'The chosen step: on, accent, slide, ratchet, chance and condition, and each note’s pitch, gate, velocity and nudge.',
  ],
  [
    'Mod lanes',
    'Mod shows them. Each lane moves one panel control, step by step: draw values across its cells, double-press a cell to clear it, and the control plays the panel’s value there (the dashed line). Stop puts the panel back. A lane for a control this synth lacks is kept, silent.',
  ],
];

/** The note new notes start on: the pattern's last note before `at`, else the first after it, else C3 above the root. */
function nearbyNote(steps: readonly Step[], at: number, root: number): number {
  for (let i = at; i >= 0; i--) {
    const n = steps[i]?.notes[0];
    if (n) return n.note;
  }
  const after = steps.find((s) => s.notes.length > 0);
  return after?.notes[0].note ?? 48 + root;
}

/** The lowest and highest notes of the steps, or a range round C3 when there are none: what Randomise picks from. */
function noteRange(steps: readonly Step[], root: number): [number, number] {
  const ns = steps.flatMap((s) => s.notes.map((n) => n.note));
  if (ns.length === 0) return [48 + root, 60 + root];
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  return hi - lo < 7 ? [lo, lo + 12] : [lo, hi];
}

function keyLabel(s: Step, i: number): string {
  const what =
    s.notes.length === 0
      ? 'rest'
      : `${s.notes.map((n) => noteName(n.note)).join(' ')}, ${s.on ? 'on' : 'off'}`;
  const extras = [
    s.accent && 'accent',
    s.slide && 'slide',
    s.ratchet && s.ratchet > 1 && `ratchet ${s.ratchet}`,
    s.probability !== undefined &&
      s.probability < 1 &&
      `${Math.round(s.probability * 100)}% chance`,
    s.condition && conditionMark(s.condition),
  ].filter(Boolean);
  return `Step ${i + 1}: ${what}${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

export function Sequencer({
  seq,
  playing,
  onPlay,
  onStop,
  transport = false,
  library,
  def,
  panel,
}: {
  seq: SequencerState;
  /** The synth on the panel and its values, for the mod lanes. Left out, the module has no lanes. */
  def?: SynthDef;
  panel?: ControlValues;
  /** My patterns and the library (`f-step-sequencer` t-81). Left out, the module has no patterns strip. */
  library?: PatternLibraryProps;
  /** The page's transport: whether a riff or the pattern is playing. */
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  /**
   * A Play button of its own: in a bottom sheet, which can cover the bar. In the dock the bar's Play is just above it,
   * and the same transport.
   */
  transport?: boolean;
}) {
  const p = seq.pattern;
  const len = patternLength(p);
  const [part, setPart] = useState(0);
  const editing = Math.min(part, p.parts.length - 1);
  const steps = p.parts[editing].steps;
  const [chosen, setChosen] = useState(0);
  const sel = Math.min(chosen, len - 1);
  const page = Math.floor(sel / PAGE);
  const pages = Math.ceil(len / PAGE);
  const [hitsSet, setHits] = useState(4);
  // What Hits shows is what Euclid uses: never more hits than the part has steps.
  const hits = Math.min(hitsSet, len);
  const [clip, setClip] = useState<{ kind: 'step' | 'page'; steps: Step[] } | null>(null);
  const keyRefs = useRef(new Map<number, HTMLButtonElement>());
  const laneCount = p.lanes?.length ?? 0;
  const [lanesOpen, setLanesOpen] = useState(laneCount > 0);
  // A pattern that replaces the whole one (opened, or a sound's riff) shows its lanes if it has any.
  const replacedAt = seq.held();
  const [shownFor, setShownFor] = useState(replacedAt);
  if (shownFor !== replacedAt) {
    setShownFor(replacedAt);
    if (laneCount > 0) setLanesOpen(true);
  }
  const moveFocus = useRef(false);

  // The playhead, read from the audio clock once a frame while the pattern plays; the keys redraw only as it moves on.
  const [at, setAt] = useState<SeqPosition | null>(null);
  const { position } = seq;
  useEffect(() => {
    if (!seq.playing) {
      setAt(null);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      const now = position();
      setAt((was) => (was?.step === now?.step && was?.part === now?.part ? was : now));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seq.playing, position]);

  // While the part on show plays, its keys (and the lanes under them) turn to the page the playhead moves into (t-87),
  // keeping the chosen step's place on the page. A page chosen by hand holds until the playhead's next turn. A key
  // holding focus hands it on, so the keyboard stays on the keys.
  const atPage = at !== null && at.part === editing ? Math.floor(at.step / PAGE) : null;
  const followed = useRef<number | null>(null);
  useEffect(() => {
    if (atPage === followed.current) return;
    followed.current = atPage;
    if (atPage === null || atPage === page) return;
    moveFocus.current = [...keyRefs.current.values()].some((el) => el === document.activeElement);
    setChosen(Math.min(len - 1, atPage * PAGE + (sel % PAGE)));
  }, [atPage, page, sel, len]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    keyRefs.current.get(sel)?.focus();
  }, [sel]);

  const setSteps = (next: Step[], group?: string) =>
    seq.edit(
      (q) => ({
        ...q,
        parts: q.parts.map((pt, i) => (i === editing ? { steps: next } : pt)),
      }),
      { group }
    );
  const changeStep = (i: number, fn: (s: Step) => Step, group?: string) =>
    seq.edit(
      (q) => ({
        ...q,
        parts: q.parts.map((pt, k) =>
          k === editing
            ? { steps: pt.steps.map((s, j) => (j === i ? fn(structuredClone(s)) : s)) }
            : pt
        ),
      }),
      { group }
    );
  const setP = <K extends keyof Pattern>(k: K, v: Pattern[K], group?: string) =>
    seq.edit((q) => ({ ...q, [k]: v }), { group });

  // A note played (the piano, the computer keyboard, MIDI) goes on the chosen step: a rest gets it, and a step's first
  // note becomes it. Read through a ref, so the handler registered once always edits the step chosen now.
  const putNote = useRef<(n: number) => void>(() => undefined);
  useEffect(() => {
    putNote.current = (n: number) =>
      changeStep(sel, (s) =>
        s.notes.length === 0
          ? { ...s, on: true, notes: [{ note: n, gate: 1 }] }
          : { ...s, notes: s.notes.map((x, k) => (k === 0 ? { ...x, note: n } : x)) }
      );
  });
  const { onNoteIn } = seq;
  useEffect(() => onNoteIn((n) => putNote.current(n)), [onNoteIn]);

  const defaultNote = nearbyNote(steps, sel, p.root);
  const toggle = (i: number) =>
    changeStep(i, (s) =>
      s.notes.length === 0
        ? { ...s, on: true, notes: [{ note: nearbyNote(steps, i, p.root), gate: 1 }] }
        : { ...s, on: !s.on }
    );

  const choose = (i: number, focus: boolean) => {
    const to = Math.max(0, Math.min(len - 1, i));
    // Only a move takes focus with it: a press at either end that goes nowhere leaves nothing owed, which a later
    // change to the chosen step (Length shortened) would otherwise pay by taking focus off the control in use.
    moveFocus.current = focus && to !== sel;
    setChosen(to);
  };
  const onKeyKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in by) choose(i + by[e.key], true);
    else if (e.key === 'Home') choose(0, true);
    else if (e.key === 'End') choose(len - 1, true);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const d = e.key === 'ArrowUp' ? 1 : -1;
      changeStep(
        i,
        (s) => ({
          ...s,
          notes: s.notes.map((n) => ({ ...n, note: Math.min(127, Math.max(0, n.note + d)) })),
        }),
        `key:${editing}:${i}`
      );
    }
    // Enter and Space are the button's own: its click turns the chosen step on or off, once in every browser.
    else if (e.key === 'Delete' || e.key === 'Backspace')
      changeStep(i, (s) => keepMods([s], [emptyStep()])[0]);
    else return;
    e.preventDefault();
    // The page plays notes from the computer keyboard; these keys are the sequencer's while a step key has focus.
    e.stopPropagation();
  };

  const addB = () => {
    seq.edit((q) =>
      q.parts.length > 1
        ? q
        : { ...q, parts: [q.parts[0], structuredClone(q.parts[0])], chain: [0, 1] }
    );
    setPart(1);
  };
  const playingPart = at?.part ?? null;
  const chainKey = p.chain.join(',');
  const chains = CHAINS.some((c) => c.key === chainKey)
    ? CHAINS
    : [...CHAINS, { key: chainKey, label: chainLabel(p.chain), chain: p.chain }];

  const shown = useMemo(() => steps.slice(page * PAGE, page * PAGE + PAGE), [steps, page]);
  const tool = (
    name: string,
    help: string,
    icon: ReactNode,
    run: () => void,
    opts: { short?: string; disabled?: boolean } = {}
  ) => (
    <PlayerTip name={name} help={help}>
      <button
        type="button"
        className="kys-seq-tool"
        aria-label={name}
        disabled={opts.disabled}
        onClick={run}
      >
        {icon}
        {/* A word beside an icon gives way to the icon alone where the row is tight; a glyph alone (− +) stays. */}
        {opts.short && <span className={icon ? 'kys-seq-tool-text' : undefined}>{opts.short}</span>}
      </button>
    </PlayerTip>
  );

  return (
    <section className="kys-seq" aria-label="Sequencer">
      {library && <PatternLibrary seq={seq} library={library} />}
      <div className="kys-seq-head">
        <div className="kys-seq-transport">
          {transport && (
            <PlayerTip
              name={playing ? 'Stop' : 'Play the pattern'}
              help={
                playing ? undefined : 'From its first step. The same transport as Play on the bar.'
              }
            >
              <button
                type="button"
                className={`kys-seq-play ${seq.playing ? 'is-playing' : ''}`}
                onClick={playing ? onStop : onPlay}
              >
                {playing ? (
                  <Square size={13} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                )}
                {playing ? 'Stop' : 'Play'}
              </button>
            </PlayerTip>
          )}
          <Toggle
            label="Fill"
            on={seq.fill}
            help="Steps set to “Only with Fill” play, and “Not with Fill” rest, from the next loop."
            onClick={() => seq.setFill(!seq.fill)}
          />
          <Toggle
            label="Loop"
            on={p.loop}
            help="Plays the pattern again from the top. Off, it plays once and stops."
            onClick={() => setP('loop', !p.loop)}
          />
        </div>
        <div className="kys-seq-controls">
          <Encoder
            label="Tempo"
            value={p.bpm}
            min={MIN_BPM}
            max={MAX_BPM}
            format={(v) => `${Math.round(v)}`}
            help="Beats per minute."
            onChange={(v) => setP('bpm', v, 'bpm')}
          />
          <Encoder
            label="Swing"
            value={p.swing}
            min={50}
            max={75}
            big={5}
            format={(v) => `${v}%`}
            help="How late every second step is. 50% is straight; 75% delays it by half a step."
            onChange={(v) => setP('swing', v, 'swing')}
          />
          <Encoder
            label="Length"
            value={len}
            min={1}
            max={MAX_STEPS}
            big={PAGE}
            help="How many steps the pattern has. Steps added at the end are rests. Shortening cuts steps from the end; Undo brings them back."
            onChange={(v) => seq.edit((q) => resizePattern(q, v), { group: 'length' })}
          />
          <Encoder
            label="Transpose"
            value={p.transpose}
            min={-MAX_TRANSPOSE}
            max={MAX_TRANSPOSE}
            big={12}
            format={(v) => (v > 0 ? `+${v}` : `${v}`)}
            help="Moves every note by semitones as it plays, before the scale. Page Up and Page Down move an octave."
            onChange={(v) => setP('transpose', v, 'transpose')}
          />
          <Select
            label="Step"
            help="How long each step is. A triplet fits three in the time of two."
            value={p.stepSize}
            options={STEP_SIZE_NAMES.map((s) => [s, STEP_SIZE_LABELS[s]])}
            onChange={(v) => {
              const size = STEP_SIZE_NAMES.find((x) => x === v);
              if (size) setP('stepSize', size);
            }}
          />
          <Select
            label="Direction"
            help="The order the steps play in, each pass."
            value={p.direction}
            options={DIRECTIONS.map((d) => [d, DIRECTION_LABELS[d]])}
            onChange={(v) => {
              const d = DIRECTIONS.find((x) => x === v);
              if (d) setP('direction', d);
            }}
          />
          <Select
            label="Root"
            help="The scale's first note."
            value={String(p.root)}
            options={ROOT_NAMES.map((n, i) => [String(i), n])}
            onChange={(v) => setP('root', Number(v))}
          />
          <Select
            label="Scale"
            help="Every note moves to the nearest note of the scale as it plays. Chromatic leaves them as they are."
            value={p.scale}
            options={SCALE_NAMES.map((s) => [s, SCALE_LABELS[s]])}
            onChange={(v) => {
              const scale = SCALE_NAMES.find((x) => x === v);
              if (scale) setP('scale', scale);
            }}
          />
        </div>
        <div className="kys-seq-parts">
          {/* The part buttons carry a name under them, as every control in the row does. */}
          <div className="kys-cell kys-cell-part">
            <span className="kys-cell-label" aria-hidden="true">
              Part
            </span>
            <div className="kys-seq-part-row" role="group" aria-label="Parts">
              {p.parts.map((_, i) => (
                <PlayerTip
                  key={i}
                  name={`Edit part ${PART_NAMES[i]}`}
                  help={playingPart === i ? 'Playing now.' : undefined}
                >
                  <button
                    type="button"
                    aria-pressed={editing === i}
                    aria-label={`Edit part ${PART_NAMES[i]}`}
                    className={`kys-seq-part ${editing === i ? 'is-on' : ''}`}
                    onClick={() => setPart(i)}
                  >
                    <span
                      className={`kys-led ${playingPart === i ? 'is-lit' : ''}`}
                      aria-hidden="true"
                    />
                    {PART_NAMES[i]}
                  </button>
                </PlayerTip>
              ))}
              {p.parts.length < 2 ? (
                <PlayerTip
                  name="Add part B"
                  help="A variation, copied from A, that plays after it."
                >
                  <button
                    type="button"
                    className="kys-seq-part"
                    aria-label="Add part B"
                    onClick={addB}
                  >
                    + B
                  </button>
                </PlayerTip>
              ) : null}
            </div>
          </div>
          {p.parts.length > 1 && (
            <Select
              label="Chain"
              help="The order the parts play in, a loop each, then round again."
              value={chainKey}
              options={chains.map((c) => [c.key, c.label])}
              onChange={(v) => {
                const c = chains.find((x) => x.key === v);
                if (c) setP('chain', c.chain);
              }}
            />
          )}
        </div>
        {pages > 1 && (
          <div className="kys-cell kys-cell-part">
            <span className="kys-cell-label" aria-hidden="true">
              Page
            </span>
            <div className="kys-seq-part-row" role="group" aria-label="Pages">
              {Array.from({ length: pages }, (_, k) => {
                const lit = at !== null && at.part === editing && Math.floor(at.step / PAGE) === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={page === k}
                    aria-label={`Page ${k + 1}, steps ${k * PAGE + 1} to ${Math.min(len, (k + 1) * PAGE)}`}
                    className={`kys-seq-page ${page === k ? 'is-on' : ''}`}
                    onClick={() => choose(k * PAGE + (sel % PAGE), false)}
                  >
                    <span className={`kys-led ${lit ? 'is-lit' : ''}`} aria-hidden="true" />
                    {k + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="kys-seq-body">
        <div className="kys-seq-main">
          <div
            className="kys-seq-keys"
            role="group"
            aria-label={`Steps of part ${PART_NAMES[editing]}`}
          >
            {shown.map((s, k) => {
              const i = page * PAGE + k;
              const plays = s.on && s.notes.length > 0;
              const here = at !== null && at.part === editing && at.step === i;
              const n = s.notes[0];
              return (
                <button
                  key={i}
                  ref={(el) => {
                    if (el) keyRefs.current.set(i, el);
                    else keyRefs.current.delete(i);
                  }}
                  type="button"
                  tabIndex={i === sel ? 0 : -1}
                  aria-current={i === sel ? 'true' : undefined}
                  aria-label={keyLabel(s, i)}
                  data-beat={i % 4 === 0 || undefined}
                  data-plays={plays || undefined}
                  data-muted={(!s.on && s.notes.length > 0) || undefined}
                  data-here={here || undefined}
                  className="kys-seq-key"
                  // A press chooses a step; a press on the chosen one turns it on or off (a double tap on a
                  // touch screen is not reliably a double click).
                  onClick={() => (i === sel ? toggle(i) : choose(i, false))}
                  onKeyDown={(e) => onKeyKey(e, i)}
                >
                  <span className="kys-seq-key-led" aria-hidden="true" />
                  <span className="kys-seq-key-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="kys-seq-key-note" aria-hidden="true">
                    {n ? noteName(n.note) : '·'}
                    {s.notes.length > 1 && <sup>+{s.notes.length - 1}</sup>}
                  </span>
                  <span className="kys-seq-key-marks" aria-hidden="true">
                    {s.accent && <span title="Accent">&gt;</span>}
                    {s.slide && <span title="Slide">⌒</span>}
                    {s.ratchet && s.ratchet > 1 && <span>×{s.ratchet}</span>}
                    {s.probability !== undefined && s.probability < 1 && (
                      <span>{Math.round(s.probability * 100)}%</span>
                    )}
                    {conditionMark(s.condition) && <span>{conditionMark(s.condition)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {def && lanesOpen && (
            <ModLanes
              pattern={p}
              def={def}
              panel={panel ?? def.init}
              part={editing}
              first={page * PAGE}
              count={shown.length}
              at={at}
              onEdit={(fn, group) => seq.edit(fn, { group })}
            />
          )}
          <div className="kys-seq-tools" role="toolbar" aria-label="Pattern tools">
            <div className="kys-seq-tool-group">
              <Encoder
                label="Hits"
                compact
                value={hits}
                min={0}
                max={len}
                big={4}
                help="How many hits Euclid spreads over the part."
                onChange={setHits}
              />
              {tool(
                'Euclid',
                'Spreads the hits as evenly as they go over the part. Steps it turns off keep their notes.',
                <Dices size={15} aria-hidden="true" />,
                () => setSteps(euclidFill(steps, hits, 0, defaultNote, 1)),
                { short: 'Euclid' }
              )}
            </div>
            <div className="kys-seq-tool-group">
              {tool(
                'Rotate left',
                'Every step one place earlier, round the end.',
                <ChevronLeft size={16} aria-hidden="true" />,
                () => setSteps(rotateSteps(steps, -1))
              )}
              {tool(
                'Rotate right',
                'Every step one place later, round the end.',
                <ChevronRight size={16} aria-hidden="true" />,
                () => setSteps(rotateSteps(steps, 1))
              )}
              {tool(
                'Reverse',
                'The steps back to front.',
                <ArrowLeftRight size={15} aria-hidden="true" />,
                () => setSteps(reverseSteps(steps))
              )}
            </div>
            <div className="kys-seq-tool-group">
              <span className="kys-seq-tool-label" aria-hidden="true">
                Oct
              </span>
              {tool(
                'Octave down',
                'Every note an octave lower.',
                null,
                () => setSteps(shiftOctave(steps, -1)),
                { short: '−' }
              )}
              {tool(
                'Octave up',
                'Every note an octave higher.',
                null,
                () => setSteps(shiftOctave(steps, 1)),
                { short: '+' }
              )}
            </div>
            <div className="kys-seq-tool-group">
              <span className="kys-seq-tool-label" aria-hidden="true">
                Deg
              </span>
              {tool(
                'Degree down',
                'Every note one note down the scale.',
                null,
                () => setSteps(shiftDegree(steps, -1, p.root, p.scale)),
                { short: '−' }
              )}
              {tool(
                'Degree up',
                'Every note one note up the scale.',
                null,
                () => setSteps(shiftDegree(steps, 1, p.root, p.scale)),
                { short: '+' }
              )}
            </div>
            <div className="kys-seq-tool-group">
              {tool(
                'Randomise',
                'A fresh line on the scale, in the range the part already uses.',
                <Dices size={15} aria-hidden="true" />,
                () => {
                  const [low, high] = noteRange(steps, p.root);
                  setSteps(
                    keepMods(
                      steps,
                      randomise(len, Math.random, {
                        root: p.root,
                        scale: p.scale,
                        low,
                        high,
                        density: 0.6,
                        accents: 0.2,
                        slides: 0.15,
                      })
                    )
                  );
                },
                { short: 'Random' }
              )}
              {tool(
                'Mutate',
                'A variation: some notes move a step along the scale, and a few steps are muted or come back.',
                <Shuffle size={15} aria-hidden="true" />,
                () => setSteps(mutate(steps, Math.random, 0.25, p.root, p.scale)),
                { short: 'Mutate' }
              )}
            </div>
            {def && (
              <div className="kys-seq-tool-group">
                <PlayerTip
                  name="Mod lanes"
                  help="Per-step values for any panel control: the control moves as the pattern plays."
                >
                  <button
                    type="button"
                    className={`kys-seq-tool ${lanesOpen ? 'is-open' : ''}`}
                    aria-label="Mod lanes"
                    aria-pressed={lanesOpen}
                    onClick={() => setLanesOpen(!lanesOpen)}
                  >
                    <SlidersVertical size={15} aria-hidden="true" />
                    <span className="kys-seq-tool-text">Mod</span>
                    {laneCount > 0 && <span className="kys-seq-tool-count">{laneCount}</span>}
                  </button>
                </PlayerTip>
              </div>
            )}
            <EditMenu
              items={[
                {
                  name: 'Copy step',
                  icon: <Copy size={15} aria-hidden="true" />,
                  run: () => setClip({ kind: 'step', steps: copySteps(steps, sel, sel + 1) }),
                },
                {
                  name: 'Copy page',
                  icon: <Copy size={15} aria-hidden="true" />,
                  run: () =>
                    setClip({
                      kind: 'page',
                      steps: copySteps(steps, page * PAGE, page * PAGE + PAGE),
                    }),
                },
                {
                  name: clip?.kind === 'page' ? 'Paste page' : 'Paste step',
                  icon: <ClipboardPaste size={15} aria-hidden="true" />,
                  disabled: !clip,
                  run: () => {
                    if (clip)
                      setSteps(
                        pasteSteps(
                          steps,
                          clip.kind === 'page' ? page * PAGE : sel,
                          onlyLanes(clip.steps, p.lanes ?? [])
                        )
                      );
                  },
                },
                {
                  name: 'Clear',
                  icon: <Eraser size={15} aria-hidden="true" />,
                  run: () => setSteps(keepMods(steps, clearSteps(steps))),
                },
              ]}
            />
            <div className="kys-seq-tool-group kys-seq-undo">
              {tool(
                'Undo',
                'Takes back the last change to the pattern.',
                <Undo2 size={15} aria-hidden="true" />,
                seq.undo,
                {
                  short: 'Undo',
                  disabled: !seq.canUndo,
                }
              )}
              <HelpButton title="How the sequencer works" items={SEQ_HELP} wide />
            </div>
          </div>
        </div>
        <StepInspector
          key={`${editing}:${sel}`}
          step={steps[sel]}
          index={sel}
          part={PART_NAMES[editing]}
          defaultNote={defaultNote}
          onChange={(fn, group) => changeStep(sel, fn, group)}
        />
      </div>
    </section>
  );
}

/** An item of the Edit menu. */
interface EditItem {
  name: string;
  icon: ReactNode;
  run: () => void;
  disabled?: boolean;
}

/**
 * Copy, paste and clear, behind one button rather than always on show: used now and then, they need not take the tool
 * row. It opens upward (the dock is at the foot of the screen) and closes on a choice, Escape, or a press outside it.
 */
function EditMenu({ items }: { items: readonly EditItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={wrap} className="kys-seq-menu-wrap">
      <PlayerTip
        name="Copy, paste and clear"
        help="Copy the chosen step or the page on show, paste it, or clear the part."
      >
        <button
          ref={trigger}
          type="button"
          className={`kys-seq-tool ${open ? 'is-open' : ''}`}
          aria-label="Copy, paste and clear"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ClipboardList size={15} aria-hidden="true" />
          <span className="kys-seq-tool-text">Edit</span>
          <ChevronUp size={13} aria-hidden="true" className="kys-seq-menu-caret" />
        </button>
      </PlayerTip>
      {open && (
        <div role="menu" aria-label="Copy, paste and clear" className="kys-seq-menu">
          {items.map((it) => (
            <button
              key={it.name}
              type="button"
              role="menuitem"
              className="kys-seq-menuitem"
              disabled={it.disabled}
              onClick={() => {
                it.run();
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {it.icon}
              {it.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
