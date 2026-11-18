'use client';

/**
 * The player's tools (`f-player` t-72): the learning layers as toggles over the panel, as a video player carries its
 * captions button, and how the panel is drawn, as switches under it.
 *
 * - `LayerToggle`: one layer or tool over the panel (Sections, Sensitive, Inspect over it, Ask AI at its far right; Piano,
 *   Harmonics, Effects on the bar). An icon, with its word from `xl` up and below `lg` (a phone has no tooltips to name it); the full name is the
 *   accessible name and the tooltip at every width.
 * - `SignalFlow`: the Signal layer over the panel (`f-live-panel` t-150), named Flow (t-279): a split button with a menu of
 *   its modes, each drawn small: off, the parts the patch uses ("Path", once "Dim unused"), those parts lit live as
 *   signal goes through them, and that with lines between them.
 * - `PlayerSettings`: on the panel's rail (the strip along its foot, by the search). Hardware or Outline, Modular or
 *   Long, the magnifier and the hover help, each named in the panel's lettering with an LED by each choice, lit
 *   for the one in use, as a hardware selector shows its position. What each does is on hover.
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useId, useRef, useState } from 'react';
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
  children,
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
  /** Drawn after its word: what it is doing while closed (the Sequencer's step lamp, t-225). */
  children?: ReactNode;
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
        {children}
        {/* Open, it says a press closes it. */}
        {on && <X size={13} strokeWidth={2.5} aria-hidden="true" className="kys-layer-x" />}
      </button>
    </PlayerTip>
  );
}

/**
 * The Signal layer's modes: nothing, the parts the patch uses (its path), those lit live as signal goes through them,
 * and that with lines from each lit part to the next.
 */
export type SignalMode = 'off' | 'inUse' | 'live' | 'flow';

const SIGNAL_MODES: readonly { mode: SignalMode; name: string; help: string }[] = [
  { mode: 'off', name: 'Off', help: 'Nothing over the panel.' },
  {
    mode: 'inUse',
    name: 'Path',
    help: 'Darken every part of the panel the patch does not use as it is set now. Point at a dark control to see what would bring it in.',
  },
  {
    mode: 'live',
    name: 'Live',
    help: 'As Path, and each part the patch uses lights up as signal goes through it when you play.',
  },
  {
    mode: 'flow',
    name: 'Live + lines',
    help: 'As Live, with a line from each part to the next while signal runs along it: audio heavy, control light, gate dotted.',
  },
];

/**
 * A mode drawn small, as the menu shows it (t-279): three knobs in a row, as they look on the panel in that mode.
 * Off, all plain; Path, the middle one dark (the patch does not use it); Live, the other two glowing; Live + lines,
 * that with a line running from the first to the last.
 */
function ModePreview({ mode }: { mode: SignalMode }) {
  const lit = mode === 'live' || mode === 'flow';
  const knobs = [8, 26, 44];
  return (
    <svg
      className={`kys-flow-preview is-${mode}`}
      viewBox="0 0 52 22"
      width="52"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      {mode === 'flow' && (
        <path className="kys-flow-preview-line" d="M8 11 C 16 -1, 36 -1, 44 11" fill="none" />
      )}
      {knobs.map((x, i) => {
        const dark = mode !== 'off' && i === 1;
        const glow = lit && i !== 1;
        return (
          <g key={x} className={dark ? 'is-dark' : glow ? 'is-glow' : undefined}>
            {glow && <circle className="kys-flow-preview-halo" cx={x} cy={11} r={7.5} />}
            <circle className="kys-flow-preview-knob" cx={x} cy={11} r={4.5} />
            <line className="kys-flow-preview-tick" x1={x} y1={11} x2={x + 2.4} y2={7.6} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The Signal layer over the panel (`f-live-panel` t-150), named Flow (t-279): a split button. Its main press turns
 * on the mode last used (Live, the first time, where the synth can show it; Path where it cannot) or turns it off;
 * the caret beside it opens the menu of every mode, each drawn small. Where the rail has the room (`useHeadFit`
 * measures it), the modes are on the rail itself instead, as LEDs, as the foot rail's settings are.
 */
export function SignalFlow({
  mode,
  onMode,
  live,
  icon,
}: {
  mode: SignalMode;
  onMode: (m: SignalMode) => void;
  /** Whether the synth can show its signal live (it has a routing): without it, Live and Live + lines are not offered. */
  live: boolean;
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<SignalMode>(live ? 'live' : 'inUse');
  const modes = SIGNAL_MODES.filter((m) => live || (m.mode !== 'live' && m.mode !== 'flow'));
  const on = mode !== 'off';
  const name = SIGNAL_MODES.find((m) => m.mode === mode)?.name;
  const choose = (m: SignalMode) => {
    if (m !== 'off') setLast(m);
    onMode(m);
  };
  const press = () => {
    if (on) {
      setLast(mode);
      onMode('off');
    } else onMode(live || last === 'inUse' ? last : 'inUse');
  };
  return (
    <div className="kys-flow">
      <div className="kys-flow-split">
        <PlayerTip
          name="Signal flow"
          help="Light the parts of the panel the patch uses, live as you play. The arrow beside it has the other ways to show it."
        >
          <button
            type="button"
            aria-pressed={on}
            aria-label={`Signal flow: ${name}`}
            onClick={press}
            className={`kys-layer kys-flow-main ${on ? 'is-on' : ''}`}
          >
            {icon}
            <span className="lg:max-xl:hidden">{on ? `Flow: ${name}` : 'Flow'}</span>
          </button>
        </PlayerTip>
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="Ways to show the signal flow"
              className={`kys-layer kys-flow-caret ${on ? 'is-on' : ''}`}
            >
              <ChevronDown size={13} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </Popover.Trigger>
          {/* Not portalled, as the tips are not: it opens inside the player and comes with it into full screen. */}
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="kys-signal-menu"
          >
            <div role="group" aria-label="Signal flow" className="kys-signal-modes">
              {modes.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  aria-pressed={mode === m.mode}
                  onClick={() => {
                    choose(m.mode);
                    setOpen(false);
                  }}
                  className="kys-led-opt kys-signal-opt"
                >
                  <ModePreview mode={m.mode} />
                  <span className="kys-signal-name">{m.name}</span>
                  <span className="kys-signal-help">{m.help}</span>
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
      {/* The modes on the rail, where it is wide enough (`synth.css`); the split button is put away then. */}
      <div role="group" aria-label="Signal flow modes" className="kys-flow-inline">
        <span className="kys-setting-name" aria-hidden="true">
          Flow
        </span>
        <div className="kys-leds">
          {modes.map((m) => (
            <PlayerTip key={m.mode} name={m.name} help={m.help}>
              <button
                type="button"
                aria-pressed={mode === m.mode}
                onClick={() => choose(m.mode)}
                className={`kys-led-opt ${m.mode === 'off' ? 'is-off' : ''}`}
              >
                <span className="kys-led-dot" aria-hidden="true" />
                {m.name}
              </button>
            </PlayerTip>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface PanelView {
  outline: boolean;
  long: boolean;
}

/** The Layout setting for each kind of layout a synth can open in: its two halves' words, and its help. */
const LAYOUT_SETTING = {
  modular: {
    own: 'Modular',
    full: 'Long',
    help: 'Modular stacks the sections as modules; Long is the faceplate as it is on the keyboard.',
  },
  compact: {
    own: 'Compact',
    full: 'Full',
    help: "Compact leaves out what the app does not need, such as keys the keyboard below the panel replaces, so the panel is shorter and is drawn bigger wherever the screen's height is what limits it; Full is the whole faceplate as it is on the hardware.",
  },
} as const;

export function PlayerSettings({
  view,
  onView,
  layout,
  zoom,
  onZoom,
  tipsOn,
  onTips,
  language,
  english = false,
  onEnglish,
}: {
  view: PanelView;
  onView: (v: PanelView) => void;
  /** The layout the synth opens in besides its full faceplate, if it has one (`layoutKind`): the Layout setting's other half. */
  layout: 'modular' | 'compact' | null;
  /** The language the panel is printed in, when it has an English reading to switch to (`SynthDef.translation`). */
  language?: string;
  english?: boolean;
  onEnglish?: (on: boolean) => void;
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
        drop
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
      {language && onEnglish && (
        <Setting
          at={1}
          name="Labels"
          drop
          help={`The panel is printed in ${language}. English reprints every label on it in English; the names in the cards and the search are English either way.`}
        >
          {(d) => (
            <LedSelect
              describedBy={d}
              label="Panel labels"
              options={[
                [false, language],
                [true, 'English'],
              ]}
              value={english}
              onChange={onEnglish}
            />
          )}
        </Setting>
      )}
      {layout && (
        <Setting at={1} name="Layout" drop help={LAYOUT_SETTING[layout].help}>
          {(d) => (
            <LedSelect
              describedBy={d}
              label="Panel layout"
              options={[
                [false, LAYOUT_SETTING[layout].own],
                [true, LAYOUT_SETTING[layout].full],
              ]}
              value={view.long}
              onChange={(long) => onView({ ...view, long })}
            />
          )}
        </Setting>
      )}
      <Setting
        at={2}
        name="Magnifier"
        short="Lens"
        help="A lens that follows the pointer over the panel."
      >
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
        short="Tips"
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
 *
 * On a rail too narrow for the whole name (t-226, `useFootFit`), `short` is the shorter word it takes, and `drop` says
 * the name goes, the choices saying what the setting is by themselves (Hardware / Outline). A dropped name's tip hangs
 * from the whole setting, so it is still there to point at.
 */
function Setting({
  at,
  name,
  short,
  drop = false,
  help,
  children,
}: {
  at: number;
  name: string;
  short?: string;
  drop?: boolean;
  help: string;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  const place: CSSProperties & Record<'--at', number> = { '--at': at };
  const label = (
    <span className={`kys-setting-name ${drop ? 'is-droppable' : ''}`}>
      {short ? (
        <>
          <span className="kys-name-long">{name}</span>
          <span className="kys-name-short">{short}</span>
        </>
      ) : (
        name
      )}
    </span>
  );
  const setting = (
    <div className="kys-setting" style={place}>
      {drop ? (
        label
      ) : (
        <PlayerTip name={name} help={help}>
          {label}
        </PlayerTip>
      )}
      <span id={id} className="sr-only">
        {help}
      </span>
      {children(id)}
    </div>
  );
  return drop ? (
    <PlayerTip name={name} help={help}>
      {setting}
    </PlayerTip>
  ) : (
    setting
  );
}

/**
 * How close the panel's foot rail packs (t-226), from its own width: it is as wide as the panel is fitted, often
 * narrower than the screen. Written as `data-fit` on the rail, which `synth.css` reads: `close` (the settings closer
 * together), then `short` (their short names, and no name where the choices say it), then `narrow` (no name for Zoom,
 * the settings closer still, a narrower search). Each step includes the ones before it. With a Layout setting the rail
 * has four settings, not three, so each step comes at a wider rail. Measured rather than a container query: a query
 * container contains its layout, which makes it the containing block of the rail's tooltips, positioned fixed.
 */
export function useFootFit(fourSettings: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = ref.current;
    if (!rail || typeof ResizeObserver === 'undefined') return undefined;
    const [close, short, narrow] = fourSettings ? [1399, 1299, 1009] : [1149, 1059, 869];
    const measure = () => {
      const w = rail.offsetWidth;
      const fit = [w <= close && 'close', w <= short && 'short', w <= narrow && 'narrow']
        .filter(Boolean)
        .join(' ');
      if (fit) rail.dataset.fit = fit;
      else delete rail.dataset.fit;
    };
    measure();
    // Set on the element, not in state, so a resize does not render the page. Its width does not depend on what it
    // writes (the rail is as wide as the panel), but its height does: a closer fit unwraps it (t-268). Written in the
    // observer's callback, that height change was a notification the browser could not deliver that frame, which it
    // reports as a ResizeObserver loop error. So it is written on the next frame, outside the observer's delivery.
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(rail);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [fourSettings]);
  return ref;
}

/** How wide the top rail must be for Flow's modes to sit on it as LEDs rather than behind its caret (t-279), in px. */
const HEAD_WIDE = 1180;

/**
 * Whether the panel's top rail has room for Flow's modes on it (t-279), from its own width, written as
 * `data-fit="wide"` on the rail for `synth.css`: measured, as the foot rail is (`useFootFit`), not a container query.
 */
export function useHeadFit() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = ref.current;
    if (!rail || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      if (rail.offsetWidth >= HEAD_WIDE) rail.dataset.fit = 'wide';
      else delete rail.dataset.fit;
    };
    measure();
    // On the next frame, outside the observer's delivery, as `useFootFit` does: the fit changes the rail's height.
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(rail);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return ref;
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
