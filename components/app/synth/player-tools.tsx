'use client';

/**
 * The player bar's tools (`f-player` t-72): the learning layers as toggles on the bar, as a video player carries its
 * captions button, and how the panel is drawn behind a settings menu, as a video player keeps its quality and speed.
 *
 * - `LayerToggle`: one layer over the panel (Sections, Dim unused, Sensitive). An icon, with its word from `xl` up;
 *   the full name is the accessible name and the tooltip at every width.
 * - `PlayerSettings`: Hardware or Outline, Modular or Long, the magnifier and the hover cards, in a popover. Not
 *   portalled, so it opens inside the player and comes with it into full screen. Nothing that holds it may carry a
 *   `transform` (see `synth.css`), so its fixed positioning still escapes the bar's scroller.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import * as Popover from '@radix-ui/react-popover';
import { Settings } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Segmented } from '@/components/app/synth/bar-controls';

export function LayerToggle({
  label,
  short,
  title,
  icon,
  on,
  onClick,
  ref,
}: {
  /** The accessible name, which the page's tests and a screen reader use. */
  label: string;
  /** The word on the bar from `xl` up. */
  short: string;
  title: string;
  icon: ReactNode;
  on: boolean;
  onClick: () => void;
  /** For a toggle that something else hands focus back to when it closes. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`kys-layer ${on ? 'is-on' : ''}`}
    >
      {icon}
      <span className="max-xl:hidden">{short}</span>
    </button>
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
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="kys-pbtn"
          aria-label="Panel settings"
          title="Panel settings"
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Content
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-label="Panel settings"
        className="kys-menu"
      >
        <p className="kys-menu-title">Panel settings</p>
        <Row
          name="Drawn as"
          help="Hardware is the faceplate; Outline is a plain diagram, easier to read."
        >
          <Segmented
            label="Panel view"
            options={[
              [false, 'Hardware'],
              [true, 'Outline'],
            ]}
            value={view.outline}
            onChange={(outline) => onView({ ...view, outline })}
          />
        </Row>
        {modular && (
          <Row
            name="Layout"
            help="Modular stacks the sections as modules; Long is the faceplate as it is on the keyboard."
          >
            <Segmented
              label="Panel layout"
              options={[
                [false, 'Modular'],
                [true, 'Long'],
              ]}
              value={view.long}
              onChange={(long) => onView({ ...view, long })}
            />
          </Row>
        )}
        <Row name="Magnifier" help="A lens that follows the pointer over the panel.">
          <Segmented
            label="Magnifier"
            options={[
              [0, 'Off'],
              [2, '2×'],
              [3, '3×'],
            ]}
            value={zoom}
            onChange={(z) => onZoom(z === 2 || z === 3 ? z : 0)}
          />
        </Row>
        <Row
          name="Hover cards"
          help="The card that pops up when you point at a knob, switch, jack or cable. The Inspector always explains it."
        >
          <Segmented
            label="Hover cards"
            options={[
              [true, 'On'],
              [false, 'Off'],
            ]}
            value={tipsOn}
            onChange={onTips}
          />
        </Row>
      </Popover.Content>
    </Popover.Root>
  );
}

function Row({ name, help, children }: { name: string; help: string; children: ReactNode }) {
  return (
    <div className="kys-menu-row">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-(--kys-text)">{name}</p>
        <p className="text-xs leading-snug text-(--kys-faint)">{help}</p>
      </div>
      {children}
    </div>
  );
}
