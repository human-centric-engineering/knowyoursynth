'use client';

/**
 * Mod lanes in the sequencer module (`f-step-sequencer` t-82): rows under the step keys, one per panel control the
 * pattern moves, with a value (or nothing) per step.
 *
 * - **Tabs.** One lane shows at a time, chosen from a row of tabs, one per lane, which share the lane's head with Add
 *   lane, View all, the readout and Clear all: the lanes take one row and its cells however many there are. The open
 *   tab carries the lane's remove (×), and a second press on it lists the controls, to move the lane to another.
 * - **Moving a lane** to another control keeps its shape: each value goes to the same height on the new control's
 *   lane (`carryLaneValue`). A lane for a control this synth has not got has no heights to keep, so its values go.
 * - **Add lane** picks a control of the synth on the panel, and its tab opens. **Clear all** takes every value off the
 *   lane in the part being edited.
 * - **View all** opens every lane at once in a dialog, where each draws as it does here and has its own select, which
 *   moves it as a second press on its tab does.
 * - **Drawing.** A press or a drag across a lane's cells sets each one to the height it is at. A double press clears
 *   a cell, so the control plays the panel's value there. A stroke is one Undo.
 * - **From the keyboard** a lane is one Tab stop. Left and Right move along it, Up and Down change the value (Page Up
 *   and Page Down by more), Home and End go to either end, and Delete clears the cell.
 * - A dashed line marks the panel's value, which a cell with nothing set plays.
 * - A lane for a control this synth does not have stays with the pattern, silent, and says so.
 *
 * The values are the pattern's (`Step.mod`), so rotate, reverse, copy and paste carry them with their steps.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { ChevronDown, Eraser, Rows3, X } from 'lucide-react';
import { MAX_LANES, type Pattern } from '@/lib/app/sequencer/pattern';
import {
  carryLaneValue,
  laneControl,
  laneControls,
  lanePos,
  laneValueAt,
} from '@/lib/app/sequencer/lanes';
import {
  addLane,
  clearLane,
  removeLane,
  retargetLane,
  setLaneStep,
} from '@/lib/app/sequencer/tools';
import { displayName, formatValue } from '@/lib/app/synths/lib/patch';
import type { Control, ControlValue, ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SeqPicker, SeqSelect as Select } from '@/components/app/sequencer/select';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** How far Up and Down move a value along its lane, and Page Up and Page Down. */
const NUDGE = 1 / 50;
const BIG_NUDGE = 1 / 10;
/** How soon a second press on a cell makes a double press. */
const DOUBLE_MS = 500;

/**
 * The words a control goes by in a lane: its name as the search gives it (`displayName`), which tells apart controls
 * that share a panel label, with its id where two still read the same.
 */
export function controlNames(def: SynthDef): Map<string, string> {
  const cs = laneControls(def);
  const count = new Map<string, number>();
  cs.forEach((c) => count.set(displayName(def, c), (count.get(displayName(def, c)) ?? 0) + 1));
  return new Map(
    cs.map((c) => {
      const name = displayName(def, c);
      return [c.id, (count.get(name) ?? 0) > 1 ? `${name} (${c.id})` : name];
    })
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

/**
 * The pattern with lane `from` moved to control `to`, its values carried by height (`carryLaneValue`): the shape drawn
 * on it stays, in the new control's units.
 */
export function moveLane(def: SynthDef, p: Pattern, from: string, to: string): Pattern {
  const was = laneControl(def, from);
  const now = laneControl(def, to);
  if (!now) return retargetLane(p, from, to);
  return retargetLane(p, from, to, (v) => carryLaneValue(was, now, v));
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
  onDrawing,
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
  /** A stroke starting and ending on a lane: the page above holds still while one is drawn. */
  onDrawing?: (on: boolean) => void;
}) {
  const lanes = useMemo(() => pattern.lanes ?? [], [pattern.lanes]);
  const names = useMemo(() => controlNames(def), [def]);
  const free = useMemo(() => laneControls(def).filter((c) => !lanes.includes(c.id)), [def, lanes]);
  // The open tab goes by place, not control: moving a lane to another control keeps it open, and removing the last
  // lane opens the one before it.
  const [tab, setTab] = useState(0);
  const [all, setAll] = useState(false);
  // The open tab's control list, from a second press on it.
  const [picking, setPicking] = useState(false);
  const openTab = useRef<HTMLButtonElement | null>(null);
  const uid = useId();
  const open = Math.min(tab, lanes.length - 1);
  const lane = (id: string, tabbed?: { lead: ReactNode; panelId: string }) => (
    <Lane
      key={id}
      tabbed={tabbed}
      def={def}
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
      onDrawing={onDrawing}
    />
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    const to =
      e.key === 'ArrowLeft'
        ? k - 1
        : e.key === 'ArrowRight'
          ? k + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? lanes.length - 1
              : null;
    if (to === null) return;
    const next = (to + lanes.length) % lanes.length;
    setTab(next);
    setPicking(false);
    tabs.current[next]?.focus();
    e.preventDefault();
    // The page plays notes from the computer keyboard; these keys are the tabs' while one has focus.
    e.stopPropagation();
  };
  const closePicker = useCallback(() => setPicking(false), []);
  const nav = (
    <>
      {/* The tabs are a cell of the readout, as the part keys are: its name under them, a key per lane. */}
      {lanes.length > 0 && (
        <div className="kys-cell kys-cell-part kys-seq-lane-tabcell">
          <span className="kys-cell-label" aria-hidden="true">
            Lanes
          </span>
          <div className="kys-seq-part-row kys-seq-lane-tabs" role="tablist" aria-label="Lanes">
            {lanes.map((id, k) => {
              const on = k === open;
              const label = names.get(id) ?? id;
              return (
                <span key={id} role="presentation" className="kys-seq-lane-tabkey">
                  <button
                    ref={(el) => {
                      tabs.current[k] = el;
                      if (on) openTab.current = el;
                    }}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${k}`}
                    aria-selected={on}
                    aria-controls={`${uid}-panel`}
                    aria-haspopup={on ? 'listbox' : undefined}
                    aria-expanded={on ? picking : undefined}
                    tabIndex={on ? 0 : -1}
                    title={on ? `${label}: press again to move the lane to another control` : label}
                    data-missing={!laneControl(def, id) || undefined}
                    className={`kys-seq-part kys-seq-lane-tab ${on ? 'is-on' : ''}`}
                    onClick={() => {
                      if (on) setPicking((was) => !was);
                      else {
                        setTab(k);
                        setPicking(false);
                      }
                    }}
                    onKeyDown={(e) => onTabKey(e, k)}
                  >
                    <span className="kys-seq-lane-tab-name">{label}</span>
                    {on && <ChevronDown size={11} aria-hidden="true" />}
                  </button>
                  {on && (
                    <PlayerTip
                      name={`Remove the ${label} lane`}
                      help="Takes the lane and its values away."
                    >
                      <button
                        type="button"
                        className="kys-seq-part kys-seq-lane-tab-x is-on"
                        aria-label={`Remove the ${label} lane`}
                        onClick={() => {
                          setPicking(false);
                          onEdit((q) => removeLane(q, id));
                        }}
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </PlayerTip>
                  )}
                </span>
              );
            })}
          </div>
          {picking && open >= 0 && (
            <SeqPicker
              label="Move the lane to"
              value={lanes[open]}
              options={[
                [
                  lanes[open],
                  laneControl(def, lanes[open])
                    ? (names.get(lanes[open]) ?? lanes[open])
                    : `${lanes[open]} (not on this synth)`,
                ],
                ...free.map((c) => [c.id, names.get(c.id) ?? c.id] as const),
              ]}
              anchor={openTab}
              onChange={(v) => onEdit((q) => moveLane(def, q, lanes[open], v))}
              onClose={closePicker}
            />
          )}
        </div>
      )}
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
              if (!v) return;
              onEdit((q) => addLane(q, v));
              setTab(lanes.length);
            }}
          />
        </div>
      )}
      {lanes.length > 1 && (
        <PlayerTip
          name="View all lanes"
          help="Opens every lane at once, to see and draw them together."
        >
          <button
            type="button"
            className="kys-seq-toggle kys-seq-lane-all"
            aria-label="View all lanes"
            onClick={() => setAll(true)}
          >
            <Rows3 size={15} aria-hidden="true" />
            View all
          </button>
        </PlayerTip>
      )}
    </>
  );
  return (
    <div className="kys-seq-lanes" role="group" aria-label="Mod lanes">
      {/* One row: the tabs, Add lane and View all, then the open lane's readout and its remove. */}
      {open >= 0 ? (
        lane(lanes[open], { lead: nav, panelId: `${uid}-panel` })
      ) : (
        <div className="kys-seq-lane-head">{nav}</div>
      )}
      <Dialog open={all && lanes.length > 0} onOpenChange={setAll}>
        {/* Never taller than the screen: a long list of lanes scrolls inside it. Outside the module, so it takes the
            module's skin (its readout and key colours) itself. */}
        <DialogContent className="kys-seq-skin flex max-h-[85dvh] w-[min(960px,calc(100vw-32px))] flex-col rounded-xl border-(--kys-line) bg-(--kys-raised) p-4 text-(--kys-text) sm:max-w-[960px]">
          <DialogTitle className="kys-label text-(--kys-muted)">Mod lanes</DialogTitle>
          <DialogDescription className="sr-only">
            Every lane of the pattern, for the page of steps on show.
          </DialogDescription>
          <div className="kys-seq-lanes min-h-0 overflow-y-auto pr-1">
            {lanes.map((id) => lane(id))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Lane({
  tabbed,
  def,
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
  onDrawing,
}: {
  /**
   * In the module, the lane is the tab panel of the tabs, which take the head's lead in place of its select (a lane
   * is moved to another control from its tab, pressed again). In View all, each lane has its select.
   */
  tabbed?: { lead: ReactNode; panelId: string };
  def: SynthDef;
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
  onDrawing?: (on: boolean) => void;
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

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = null;
    onDrawing?.(false);
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
        {tabbed ? (
          tabbed.lead
        ) : (
          <Select
            label="Lane"
            help="The panel control this lane moves. Choosing another moves its values to the same heights there."
            value={id}
            options={[
              [id, c ? name : `${id} (not on this synth)`],
              ...free.map((x) => [x.id, names.get(x.id) ?? x.id] as const),
            ]}
            onChange={(v) => onEdit((q) => moveLane(def, q, id, v))}
          />
        )}
        <span className="kys-seq-lane-readout" aria-live="polite">
          {c ? readout : 'Not on this synth: kept with the pattern, and silent here.'}
        </span>
        <PlayerTip
          name={`Clear the ${name} lane`}
          help="Takes every value off the lane in this part, so each step plays the panel's value."
        >
          <button
            type="button"
            className="kys-seq-tool"
            aria-label={`Clear the ${name} lane`}
            disabled={!steps.some((s) => s.mod && Object.hasOwn(s.mod, id))}
            onClick={() => onEdit((q) => clearLane(q, part, id))}
          >
            <Eraser size={14} aria-hidden="true" />
            <span>Clear all</span>
          </button>
        </PlayerTip>
        {/* In the module the open tab carries the remove. */}
        {!tabbed && (
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
        )}
      </div>
      <div
        {...(tabbed && { id: tabbed.panelId })}
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
          onDrawing?.(true);
          draw(e);
        }}
        onPointerMove={draw}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
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
