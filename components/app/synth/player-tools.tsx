'use client';

/**
 * The player's tools (`f-player` t-72): the learning layers as toggles over the panel, as a video player carries its
 * captions button, and how the panel is drawn, as switches under it.
 *
 * - `LayerToggle`: one layer or tool over the panel (Sections, Dim unused, Sensitive, Inspect over it, Ask AI at its far right; Piano,
 *   Harmonics, Effects on the bar). An icon, with its word from `xl` up and below `lg` (a phone has no tooltips to name it); the full name is the
 *   accessible name and the tooltip at every width.
 * - `PlayerSettings`: under the panel, by the search. Hardware or Outline, Modular or Long, the magnifier and the
 *   hover help, all on show as a row of switches, each named, with what it does on hover.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { X } from 'lucide-react';
import { Segmented } from '@/components/app/synth/bar-controls';
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
        name="Drawn as"
        help="Hardware is the faceplate; Outline is a plain diagram, easier to read."
      >
        {(d) => (
          <Segmented
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
          name="Layout"
          help="Modular stacks the sections as modules; Long is the faceplate as it is on the keyboard."
        >
          {(d) => (
            <Segmented
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
      <Setting name="Magnifier" help="A lens that follows the pointer over the panel.">
        {(d) => (
          <Segmented
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
        name="Hover help"
        help="The card that pops up when you point at a knob, switch, jack or cable. The Inspector always explains it."
      >
        {(d) => (
          <Segmented
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
 * One setting: its name, which explains it on hover, over its switch. The name cannot take focus, so what it says is
 * also the switch's description (`describedBy`), for a keyboard or screen reader.
 */
function Setting({
  name,
  help,
  children,
}: {
  name: string;
  help: string;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="kys-setting">
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
