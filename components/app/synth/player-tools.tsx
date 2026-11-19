'use client';

/**
 * The player's tools (`f-player` t-72): the learning layers as toggles over the panel, as a video player carries its
 * captions button, and how the panel is drawn, as switches under it.
 *
 * - `LayerToggle`: one layer or tool over the panel (Signal diagram, Dim unused, Live signal, Sections, Sensitive,
 *   Inspect over it, Ask AI at its far right; Piano,
 *   Harmonics, Effects on the bar). An icon, with its word from `xl` up and below `lg` (a phone has no tooltips to name it); the full name is the
 *   accessible name and the tooltip at every width.
 * - `PlayerSettings`: on the panel's rail (the strip along its foot, by the search). Hardware or Outline, Modular or
 *   Long, the magnifier and the hover help, each named in the panel's lettering with an LED by each choice, lit
 *   for the one in use, as a hardware selector shows its position. What each does is on hover.
 *
 * - `RailMenu` and `PlayerSettings`' `menu`: on a phone each rail's toggles or settings are one dropdown (t-286).
 *
 * The page owns every state these show; each is told what is true and calls back to change it.
 */

import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { PlayerTip } from '@/components/app/synth/player-tip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
        <span className={`kys-layer-word ${keepShort ? '' : 'lg:max-xl:hidden'}`}>{short}</span>
        {children}
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

/** A setting's value: one of its choices. */
type Choice = string | number | boolean;
interface SettingSpec {
  at: number;
  name: string;
  short?: string;
  drop?: boolean;
  help: string;
  /** The choices' accessible group name. */
  label: string;
  options: [Choice, string][];
  value: Choice;
  onChange: (v: Choice) => void;
}

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
  menu = false,
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
  /** All in one dropdown, as on a phone (t-286), not a line of LEDs. */
  menu?: boolean;
}) {
  const settings: SettingSpec[] = [
    {
      at: 0,
      name: 'Drawn as',
      drop: true,
      help: 'Hardware is the faceplate; Outline is a plain diagram, easier to read.',
      label: 'Panel view',
      options: [
        [false, 'Hardware'],
        [true, 'Outline'],
      ],
      value: view.outline,
      onChange: (outline) => onView({ ...view, outline: outline === true }),
    },
  ];
  if (language && onEnglish)
    settings.push({
      at: 1,
      name: 'Labels',
      drop: true,
      help: `The panel is printed in ${language}. English reprints every label on it in English; the names in the cards and the search are English either way.`,
      label: 'Panel labels',
      options: [
        [false, language],
        [true, 'English'],
      ],
      value: english,
      onChange: (on) => onEnglish(on === true),
    });
  if (layout)
    settings.push({
      at: 1,
      name: 'Layout',
      drop: true,
      help: LAYOUT_SETTING[layout].help,
      label: 'Panel layout',
      options: [
        [false, LAYOUT_SETTING[layout].own],
        [true, LAYOUT_SETTING[layout].full],
      ],
      value: view.long,
      onChange: (long) => onView({ ...view, long: long === true }),
    });
  settings.push(
    {
      at: 2,
      name: 'Magnifier',
      short: 'Lens',
      help: 'A lens that follows the pointer over the panel.',
      label: 'Magnifier',
      options: [
        [0, 'Off'],
        [2, '2×'],
        [3, '3×'],
      ],
      value: zoom,
      onChange: (z) => onZoom(z === 2 || z === 3 ? z : 0),
    },
    {
      at: 3,
      name: 'Hover help',
      short: 'Tips',
      help: 'The card that pops up when you point at a knob, switch, jack or cable. The Inspector always explains it.',
      label: 'Hover help',
      options: [
        [true, 'On'],
        [false, 'Off'],
      ],
      value: tipsOn,
      onChange: (on) => onTips(on === true),
    }
  );
  if (menu) return <SettingsMenu settings={settings} />;
  return (
    <div role="group" aria-label="Panel settings" className="kys-settings">
      {settings.map((st) => (
        <Setting
          key={st.label}
          at={st.at}
          name={st.name}
          short={st.short}
          drop={st.drop}
          help={st.help}
        >
          {(d) => (
            <LedSelect
              describedBy={d}
              label={st.label}
              options={st.options}
              value={st.value}
              onChange={st.onChange}
            />
          )}
        </Setting>
      ))}
    </div>
  );
}

/**
 * The foot's settings as one dropdown, on a phone (t-286): each setting a named group of choices, the one in use
 * marked. A choice is picked by its place in the setting's list, so a choice's value can be any of a string, a number
 * or a flag.
 */
function SettingsMenu({ settings }: { settings: SettingSpec[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="kys-layer kys-rail-menu-trigger is-plain"
          aria-label="Display settings"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>Display</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="kys-rail-menu">
        {settings.map((st, i) => (
          <div key={st.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{st.name}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              aria-label={st.label}
              value={String(st.options.findIndex(([v]) => v === st.value))}
              onValueChange={(at) => {
                const picked = st.options[Number(at)];
                if (picked) st.onChange(picked[0]);
              }}
            >
              {st.options.map(([, word], j) => (
                <DropdownMenuRadioItem key={word} value={String(j)}>
                  {word}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One layer in the head's dropdown (`RailMenu`). */
export interface RailMenuItem {
  label: string;
  icon: ReactNode;
  on: boolean;
  onClick: () => void;
}

/**
 * The head's layers as one dropdown, on a phone (t-286): a key with its LED lit while any of them is on, opening onto
 * each layer by its full name, ticked while it is over the panel. Groups are ruled off from each other; an empty
 * group (Signal, on a synth with no routing) is left out.
 */
export function RailMenu({
  label,
  short,
  icon,
  groups,
  ref,
}: {
  /** The accessible name, which starts with the visible word (`short`), so a voice command can name it. */
  label: string;
  short: string;
  icon: ReactNode;
  groups: RailMenuItem[][];
  /** The key, where focus goes back to once the routing view it opened closes. */
  ref?: Ref<HTMLButtonElement>;
}) {
  const shown = groups.filter((g) => g.length > 0);
  const anyOn = shown.some((g) => g.some((item) => item.on));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={`kys-layer kys-rail-menu-trigger ${anyOn ? 'is-on' : ''}`}
          aria-label={label}
        >
          {icon}
          <span>{short}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="kys-rail-menu">
        {shown.map((g, i) => (
          <div key={g[0].label}>
            {i > 0 && <DropdownMenuSeparator />}
            {g.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.label}
                checked={item.on}
                onCheckedChange={item.onClick}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="mr-2 inline-flex">{item.icon}</span>
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

/**
 * How close the panel's top rail packs, from what fits on one line of it: like the foot rail it is as wide as the
 * panel, not the screen, so a breakpoint cannot say. Each step is tried in turn until every button sits on one line:
 * `short` (the rail closer together, the tour's short name), then `icons` (the toggles' icons and LEDs without their
 * words; each keeps its name in its tooltip). If it still does not fit, it wraps. Written as `data-fit`, as the foot's.
 * The rail and its parts are observed, so a part coming or going (the inspector, Signal) measures it again.
 */
export function useTopFit() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = ref.current;
    if (!rail || typeof ResizeObserver === 'undefined') return undefined;
    const oneLine = () => {
      const mids = Array.from(rail.querySelectorAll('button'), (b) => {
        const r = b.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      return mids.length === 0 || Math.max(...mids) - Math.min(...mids) < 8;
    };
    const measure = () => {
      delete rail.dataset.fit;
      for (const fit of ['short', 'short icons']) {
        if (oneLine()) return;
        rail.dataset.fit = fit;
      }
    };
    measure();
    // On the next frame, as the foot's: its height changes with what it writes (see `useFootFit`).
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    const observeParts = () => {
      for (const part of Array.from(rail.children)) ro.observe(part);
    };
    ro.observe(rail);
    observeParts();
    // A part that comes later (the phone's menu once the page knows it is on a phone, the inspector as the screen
    // widens) is observed too, and the rail measured again with it.
    const mo = new MutationObserver(() => {
      observeParts();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    mo.observe(rail, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
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
