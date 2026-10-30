'use client';

/**
 * The player's tools (`f-player` t-72): the learning layers as toggles over the panel, as a video player carries its
 * captions button, and how the panel is drawn, as switches under it.
 *
 * - `LayerToggle`: one layer or tool over the panel (Sections, Sensitive, Inspect over it, Ask AI at its far right; Piano,
 *   Harmonics, Effects on the bar). An icon, with its word from `xl` up and below `lg` (a phone has no tooltips to name it); the full name is the
 *   accessible name and the tooltip at every width.
 * - `SignalMenu`: the Signal layer over the panel (`f-live-panel` t-150), a toggle with a menu of its modes: off, the parts
 *   the patch uses ("In use", once "Dim unused"), and those parts lit live as signal goes through them.
 * - `PlayerSettings`: on the panel's rail (the strip along its foot, by the search). Hardware or Outline, Modular or
 *   Long, the magnifier and the hover help, each named in the panel's lettering with an LED by each choice, lit
 *   for the one in use, as a hardware selector shows its position. What each does is on hover.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useId, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, X } from 'lucide-react';
import { PlayerTip } from '@/components/app/synth/player-tip';

export function LayerToggle({
  label,
  short,
  title,
  icon,
  on,
  filled = false,
  keepShort = false,
  hoverFill = false,
  onClick,
  ref,
}: {
  /** The accessible name, which the page's tests and a screen reader use. */
  label: string;
  /** The word on the bar from `xl` up. */
  short: string;
  /** What it does, in its tooltip. */
  title: string;
  icon: ReactNode;
  on: boolean;
  /** What it controls is switched on (the effects, say), whether or not it is open: the button is filled. */
  filled?: boolean;
  /** Its word is on show at every width, not only from `xl` up and below `lg`. */
  keepShort?: boolean;
  /** Filled with the accent on hover, as a filled button is: for a button that invites a click (Ask AI). */
  hoverFill?: boolean;
  onClick: () => void;
  /** For a toggle that something else hands focus back to when it closes. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <PlayerTip name={label} help={title}>
      <button
        ref={ref}
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={onClick}
        className={`kys-layer ${on ? 'is-on' : ''} ${filled ? 'is-filled' : ''} ${hoverFill ? 'is-hover-fill' : ''}`}
      >
        {icon}
        <span className={keepShort ? undefined : 'lg:max-xl:hidden'}>{short}</span>
        {/* Open, it says a press closes it. */}
        {on && <X size={13} strokeWidth={2.5} aria-hidden="true" className="kys-layer-x" />}
      </button>
    </PlayerTip>
  );
}

/**
 * The Signal layer's modes: nothing, the parts the patch uses, those lit live as signal goes through them, and that
 * with lines from each lit part to the next.
 */
export type SignalMode = 'off' | 'inUse' | 'live' | 'flow';

const SIGNAL_MODES: readonly { mode: SignalMode; name: string; help: string }[] = [
  { mode: 'off', name: 'Off', help: 'Nothing over the panel.' },
  {
    mode: 'inUse',
    name: 'In use',
    help: 'Darken every part of the panel that is not part of the patch as it is set now. Point at a dark control to see what would bring it in.',
  },
  {
    mode: 'live',
    name: 'Live',
    help: 'As In use, and each part the patch uses lights up as signal goes through it when you play.',
  },
  {
    mode: 'flow',
    name: 'Live + flow',
    help: 'As Live, with a line from each part to the next while signal runs along it: audio heavy, control light, gate dotted.',
  },
];

export function SignalMenu({
  mode,
  onMode,
  live,
  icon,
}: {
  mode: SignalMode;
  onMode: (m: SignalMode) => void;
  /** Whether the synth can show its signal live (it has a routing): without it, Live and Live + flow are not offered. */
  live: boolean;
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const modes = SIGNAL_MODES.filter((m) => live || (m.mode !== 'live' && m.mode !== 'flow'));
  const on = mode !== 'off';
  const name = SIGNAL_MODES.find((m) => m.mode === mode)?.name;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <PlayerTip
        name="Signal on the panel"
        help="Show which parts of the panel the patch uses, or light them live as you play."
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Signal on the panel: ${name}`}
            className={`kys-layer ${on ? 'is-on' : ''}`}
          >
            {icon}
            <span className="lg:max-xl:hidden">{on ? `Signal: ${name}` : 'Signal'}</span>
            {/* Not the toggles' close mark, which the rail hides: this one says a press opens a menu. */}
            <ChevronDown
              size={13}
              strokeWidth={2.5}
              aria-hidden="true"
              className="kys-signal-caret"
            />
          </button>
        </Popover.Trigger>
      </PlayerTip>
      {/* Not portalled, as the tips are not: it opens inside the player and comes with it into full screen. */}
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="kys-signal-menu"
      >
        <div role="group" aria-label="Signal on the panel" className="kys-signal-modes">
          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={mode === m.mode}
              onClick={() => {
                onMode(m.mode);
                setOpen(false);
              }}
              className="kys-led-opt kys-signal-opt"
            >
              <span className="kys-led-dot" aria-hidden="true" />
              <span className="kys-signal-name">{m.name}</span>
              <span className="kys-signal-help">{m.help}</span>
            </button>
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

export interface PanelView {
  outline: boolean;
  long: boolean;
}

export function PlayerSettings({
  view,
  onView,
  modular,
  zoom,
  onZoom,
  tipsOn,
  onTips,
}: {
  view: PanelView;
  onView: (v: PanelView) => void;
  /** Whether the synth has a modular layout to switch to. */
  modular: boolean;
  zoom: number;
  onZoom: (z: 0 | 2 | 3) => void;
  tipsOn: boolean;
  onTips: (on: boolean) => void;
}) {
  return (
    <div role="group" aria-label="Panel settings" className="kys-settings">
      <Setting
        at={0}
        name="Drawn as"
        help="Hardware is the faceplate; Outline is a plain diagram, easier to read."
      >
        {(d) => (
          <LedSelect
            describedBy={d}
            label="Panel view"
            options={[
              [false, 'Hardware'],
              [true, 'Outline'],
            ]}
            value={view.outline}
            onChange={(outline) => onView({ ...view, outline })}
          />
        )}
      </Setting>
      {modular && (
        <Setting
          at={1}
          name="Layout"
          help="Modular stacks the sections as modules; Long is the faceplate as it is on the keyboard."
        >
          {(d) => (
            <LedSelect
              describedBy={d}
              label="Panel layout"
              options={[
                [false, 'Modular'],
                [true, 'Long'],
              ]}
              value={view.long}
              onChange={(long) => onView({ ...view, long })}
            />
          )}
        </Setting>
      )}
      <Setting at={2} name="Magnifier" help="A lens that follows the pointer over the panel.">
        {(d) => (
          <LedSelect
            describedBy={d}
            label="Magnifier"
            options={[
              [0, 'Off'],
              [2, '2×'],
              [3, '3×'],
            ]}
            value={zoom}
            onChange={(z) => onZoom(z === 2 || z === 3 ? z : 0)}
          />
        )}
      </Setting>
      <Setting
        at={3}
        name="Hover help"
        help="The card that pops up when you point at a knob, switch, jack or cable. The Inspector always explains it."
      >
        {(d) => (
          <LedSelect
            describedBy={d}
            label="Hover help"
            options={[
              [true, 'On'],
              [false, 'Off'],
            ]}
            value={tipsOn}
            onChange={onTips}
          />
        )}
      </Setting>
    </div>
  );
}

/**
 * One setting: its name, which explains it on hover, beside its LEDs. The name cannot take focus, so what it says is
 * also the choice's description (`describedBy`), for a keyboard or screen reader. `at` is its place on the rail, which
 * times its LEDs in the sweep they light in when the panel is first shown.
 */
function Setting({
  at,
  name,
  help,
  children,
}: {
  at: number;
  name: string;
  help: string;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  const place: CSSProperties & Record<'--at', number> = { '--at': at };
  return (
    <div className="kys-setting" style={place}>
      <PlayerTip name={name} help={help}>
        <span className="kys-setting-name">{name}</span>
      </PlayerTip>
      <span id={id} className="sr-only">
        {help}
      </span>
      {children(id)}
    </div>
  );
}

/** A setting's choices: each a word with an LED before it, lit for the one in use. */
function LedSelect<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  options: readonly (readonly [value: T, text: string])[];
  value: T;
  onChange: (v: T) => void;
  describedBy: string;
}) {
  return (
    <div className="kys-leds" role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map(([v, l]) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="kys-led-opt"
        >
          <span className="kys-led-dot" aria-hidden="true" />
          {l}
        </button>
      ))}
    </div>
  );
}
