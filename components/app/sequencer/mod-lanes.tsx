'use client';

/**
 * Mod lanes in the sequencer module (`f-step-sequencer` t-82): rows under the step keys, one per panel control the
 * pattern moves, with a value (or nothing) per step.
 *
 * - **Add lane** picks a control of the synth on the panel. A lane's own select moves it to another control, which
 *   clears its values: they were in the other control's units.
 * - **Drawing.** A press or a drag across a lane's cells sets each one to the height it is at. A double press clears
 *   a cell, so the control plays the panel's value there. A stroke is one Undo.
 * - **From the keyboard** a lane is one Tab stop. Left and Right move along it, Up and Down change the value (Page Up
 *   and Page Down by more), Home and End go to either end, and Delete clears the cell.
 * - A dashed line marks the panel's value, which a cell with nothing set plays.
 * - A lane for a control this synth does not have stays with the pattern, silent, and says so.
 *
 * The values are the pattern's (`Step.mod`), so rotate, reverse, copy and paste carry them with their steps.
 */

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { X } from 'lucide-react';
import { MAX_LANES, type Pattern } from '@/lib/app/sequencer/pattern';
import { laneControl, laneControls, lanePos, laneValueAt } from '@/lib/app/sequencer/lanes';
import { addLane, removeLane, retargetLane, setLaneStep } from '@/lib/app/sequencer/tools';
import { cleanLabel, formatValue } from '@/lib/app/synths/lib/patch';
import type { Control, ControlValue, ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { SeqSelect as Select } from '@/components/app/sequencer/select';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** How far Up and Down move a value along its lane, and Page Up and Page Down. */
const NUDGE = 1 / 50;
const BIG_NUDGE = 1 / 10;
/** How soon a second press on a cell makes a double press. */
const DOUBLE_MS = 500;

/** The words a control goes by in a lane: its name, with its module where another control shares the name. */
export function controlNames(def: SynthDef): Map<string, string> {
  const cs = laneControls(def);
  const base = (c: Control) => c.name || cleanLabel(c);
  const count = new Map<string, number>();
  cs.forEach((c) => count.set(base(c), (count.get(base(c)) ?? 0) + 1));
  return new Map(
    cs.map((c) => [c.id, (count.get(base(c)) ?? 0) > 1 ? `${base(c)} (${c.module})` : base(c)])
  );
}

/**
 * The value one nudge up (`dir` 1) or down from `v` along the lane, or the end it is already at. A knob with a step
 * can round a small move back to where it was, and a switch or a choice only changes at its next option: either way,
 * it keeps going until the value changes, so a press always moves it by at least one.
 */
export function nudged(c: Control, v: ControlValue, dir: number, by: number): ControlValue {
  const from = lanePos(c, v);
  for (let k = 1; k <= Math.ceil(1 / by) + 1; k++) {
    const next = laneValueAt(c, from + dir * by * k);
    if (next !== v) return next;
  }
  return v;
}

export function ModLanes({
  pattern,
  def,
  panel,
  part,
  first,
  count,
  at,
  onEdit,
}: {
  pattern: Pattern;
  /** The synth on the panel: the controls a lane can move, and what they take. */
  def: SynthDef;
  /** The panel's values: what a cell with nothing set plays, and where a new value starts. */
  panel: ControlValues;
  /** The part being edited. */
  part: number;
  /** The first step on show, and how many are: the page of keys above. */
  first: number;
  count: number;
  at: SeqPosition | null;
  onEdit: (fn: (p: Pattern) => Pattern, group?: string) => void;
}) {
  const lanes = useMemo(() => pattern.lanes ?? [], [pattern.lanes]);
  const names = useMemo(() => controlNames(def), [def]);
  const free = useMemo(() => laneControls(def).filter((c) => !lanes.includes(c.id)), [def, lanes]);
  return (
    <div className="kys-seq-lanes" role="group" aria-label="Mod lanes">
      {lanes.map((id) => (
        <Lane
          key={id}
          id={id}
          control={laneControl(def, id)}
          name={names.get(id) ?? id}
          pattern={pattern}
          free={free}
          names={names}
          panel={panel}
          part={part}
          first={first}
          count={count}
          at={at}
          onEdit={onEdit}
        />
      ))}
      {lanes.length < MAX_LANES && (
        <div className="kys-seq-lane-add">
          <Select
            label="Mod lane"
            help="Adds a lane: a value per step for a panel control, which moves while the pattern plays."
            value=""
            options={[
              ['', '+ Add lane'],
              ...free.map((c) => [c.id, names.get(c.id) ?? c.id] as const),
            ]}
            onChange={(v) => {
              if (v) onEdit((q) => addLane(q, v));
            }}
          />
        </div>
      )}
    </div>
  );
}

function Lane({
  id,
  control: c,
  name,
  pattern,
  free,
  names,
  panel,
  part,
  first,
  count,
  at,
  onEdit,
}: {
  id: string;
  control: Control | null;
  name: string;
  pattern: Pattern;
  free: Control[];
  names: Map<string, string>;
  panel: ControlValues;
  part: number;
  first: number;
  count: number;
  at: SeqPosition | null;
  onEdit: (fn: (p: Pattern) => Pattern, group?: string) => void;
}) {
  const steps = pattern.parts[part].steps;
  const [cursor, setCursor] = useState(0);
  const sel = Math.min(cursor, count - 1);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const stroke = useRef(0);
  const drawing = useRef<string | null>(null);
  const lastPress = useRef<{ cell: number | null; at: number } | null>(null);

  const valueOf = (i: number): ControlValue | undefined => {
    const mod = steps[i]?.mod;
    return mod && Object.hasOwn(mod, id) ? mod[id] : undefined;
  };
  const restValue = c ? (panel[c.id] ?? c.def) : undefined;
  const set = (i: number, v: ControlValue | null, group?: string) =>
    onEdit((q) => setLaneStep(q, part, i, id, v), group);

  /** The cell under the pointer and the value at its height. */
  const pick = (e: PointerEvent): [number, ControlValue] | null => {
    if (!c) return null;
    for (let k = 0; k < count; k++) {
      const r = cells.current[k]?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right) continue;
      return [first + k, laneValueAt(c, 1 - (e.clientY - r.top) / Math.max(1, r.height))];
    }
    return null;
  };
  const draw = (e: PointerEvent) => {
    const hit = pick(e);
    if (!hit || !drawing.current) return;
    setShownAt(hit[0]);
    if (valueOf(hit[0]) !== hit[1]) set(hit[0], hit[1], drawing.current);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>, k: number) => {
    const i = first + k;
    const move = (to: number) => {
      const next = Math.max(0, Math.min(count - 1, to));
      setCursor(next);
      setShownAt(first + next);
      cells.current[next]?.focus();
    };
    if (e.key === 'ArrowLeft') move(k - 1);
    else if (e.key === 'ArrowRight') move(k + 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(count - 1);
    else if (c && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      const dir = e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : -1;
      const by = e.key.startsWith('Page') ? BIG_NUDGE : NUDGE;
      const from = valueOf(i) ?? restValue;
      if (from === undefined) return;
      set(i, nudged(c, from, dir, by), `lane:${id}:${part}:${i}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') set(i, null);
    else return;
    e.preventDefault();
    // The page plays notes from the computer keyboard; these keys are the lane's while it has focus.
    e.stopPropagation();
  };

  const shownValue = shownAt !== null ? valueOf(shownAt) : undefined;
  const readout =
    shownAt === null || !c
      ? null
      : `Step ${shownAt + 1}: ${shownValue === undefined ? `panel (${formatValue(c, restValue)})` : formatValue(c, shownValue)}`;
  const restPos = c && restValue !== undefined ? lanePos(c, restValue) : null;

  return (
    <div className="kys-seq-lane" data-missing={!c || undefined}>
      <div className="kys-seq-lane-head">
        <Select
          label="Lane"
          help="The panel control this lane moves. Choosing another clears its values."
          value={id}
          options={[
            [id, c ? name : `${id} (not on this synth)`],
            ...free.map((x) => [x.id, names.get(x.id) ?? x.id] as const),
          ]}
          onChange={(v) => onEdit((q) => retargetLane(q, id, v))}
        />
        <span className="kys-seq-lane-readout" aria-live="polite">
          {c ? readout : 'Not on this synth: kept with the pattern, and silent here.'}
        </span>
        <PlayerTip name={`Remove the ${name} lane`} help="Takes the lane and its values away.">
          <button
            type="button"
            className="kys-seq-tool"
            aria-label={`Remove the ${name} lane`}
            onClick={() => onEdit((q) => removeLane(q, id))}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </PlayerTip>
      </div>
      <div
        className="kys-seq-lane-cells"
        role="group"
        aria-label={`${name} lane`}
        onPointerDown={(e) => {
          if (!c || e.button !== 0) return;
          // A second press on the same cell straight after the first is a double press: it stays in the first one's
          // stroke, as does the clear it ends in, so one Undo puts back what the cell held before either.
          const cell = pick(e)?.[0] ?? null;
          const now = Date.now();
          const again = lastPress.current?.cell === cell && now - lastPress.current.at < DOUBLE_MS;
          lastPress.current = { cell, at: now };
          if (!again) stroke.current++;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drawing.current = `lane:${id}:stroke:${stroke.current}`;
          draw(e);
        }}
        onPointerMove={draw}
        onPointerUp={() => {
          drawing.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = null;
        }}
        onPointerLeave={() => {
          if (!drawing.current) setShownAt(null);
        }}
      >
        {Array.from({ length: count }, (_, k) => {
          const i = first + k;
          const v = valueOf(i);
          const here = at !== null && at.part === part && at.step === i;
          return (
            <div
              key={i}
              ref={(el) => {
                cells.current[k] = el;
              }}
              role="slider"
              tabIndex={k === sel ? 0 : -1}
              aria-label={`${name}, step ${i + 1}`}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={c && v !== undefined ? lanePos(c, v) : undefined}
              aria-valuetext={
                !c
                  ? v === undefined
                    ? 'nothing set'
                    : String(v)
                  : v === undefined
                    ? `panel value, ${formatValue(c, restValue)}`
                    : formatValue(c, v)
              }
              aria-disabled={!c || undefined}
              data-beat={i % 4 === 0 || undefined}
              data-set={v !== undefined || undefined}
              data-here={here || undefined}
              className="kys-seq-lane-cell"
              onFocus={() => {
                setCursor(k);
                setShownAt(i);
              }}
              onPointerEnter={() => setShownAt(i)}
              onDoubleClick={() => set(i, null, `lane:${id}:stroke:${stroke.current}`)}
              onKeyDown={(e) => onKey(e, k)}
            >
              {restPos !== null && (
                <span
                  className="kys-seq-lane-rest"
                  style={{ bottom: `${restPos * 100}%` }}
                  aria-hidden="true"
                />
              )}
              {v !== undefined && (
                <span
                  className="kys-seq-lane-bar"
                  style={{ height: `${c ? Math.max(4, lanePos(c, v) * 100) : 50}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
