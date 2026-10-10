'use client';

/**
 * The words that go with the sound map: the key under the panel, the line about one control in the cards, and the
 * part that asks the mapper why a dark control is dark. The map itself is worked out by `lib/app/synths/lib/soundmap`
 * (in its probe workers, or on the main thread where workers are blocked) and drawn on the panel by its layers.
 *
 * Transliterated from the prototype file `prototype/src/ui/SoundMap.jsx` (decision D3).
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { heatColor } from '@/components/app/panel/layers';
import { controlMap, displayName, formatValue } from '@/lib/app/synths/lib/patch';
import { WHEEL } from '@/lib/app/synths/lib/soundmap';
import type { Mapper } from '@/lib/app/synths/lib/soundmap';
import type { Control, ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { findStore, focusStore, mapStore, useStore } from '@/components/app/synth/stores';
import type { Door } from '@/components/app/synth/stores';

// [name on the hardware view, name on the paper outline (where unused parts fade instead of going dark), meaning, wash, hatched]
const KEY: [string, string, string, number, boolean][] = [
  ['Bright', 'Full ink', 'shaping the sound', 0, false],
  ['Striped', 'Striped', 'at zero or switched off. Move it to bring that part in', 0.4, true],
  ['Dark', 'Faded', 'does nothing at the moment', 0.78, false],
];

const HOW =
  'Worked out by playing two notes of the riff through the synth model again and again, each time with one control moved, and comparing the results. The mod wheel counts as it is set now, so wheel controls stay dark until you push it up.';

export interface MapLegendProps {
  def: SynthDef;
  values: ControlValues;
  dimOn: boolean;
  heatOn: boolean;
  outline: boolean;
}

/** Strip under the faceplate: progress while the map is worked out, then the key, the most sensitive controls and the way in to the dark control being pointed at. */
export function MapLegend({ def, values, dimOn, heatOn, outline }: MapLegendProps) {
  const map = useStore(mapStore);
  if (map.status === 'off') return null;
  const cm = controlMap(def);
  const top = map.ranked
    .slice(0, 5)
    .map((id) => cm[id])
    .filter((c) => !!c);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-3 py-2 text-xs text-(--kys-muted)">
      {!map.state && (
        <span role="status">
          Working out what is in this sound… {Math.round(map.progress * 100)}%
        </span>
      )}
      {map.state && dimOn && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Key">
          {KEY.map(([hw, paper, text, wash, hatched]) => (
            <li key={hw} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`relative h-4 w-4 overflow-hidden rounded-sm border border-(--kys-line) ${outline ? 'bg-[#1c2530]' : 'bg-[#d8d5cc]'}`}
              >
                <span
                  className={`absolute inset-0 ${outline ? 'bg-[#eef0ec]' : 'bg-black'}`}
                  style={{ opacity: outline ? Math.min(0.9, wash * 1.15) : wash }}
                />
                {hatched && (
                  <span
                    className="absolute inset-0"
                    style={{
                      background: `repeating-linear-gradient(45deg, ${outline ? '#1c2530' : '#ffffff'} 0 2px, transparent 2px 5px)`,
                      opacity: outline ? 0.6 : 0.75,
                    }}
                  />
                )}
              </span>
              <span>
                <span className="font-semibold text-(--kys-text)">{outline ? paper : hw}:</span>{' '}
                {text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {map.state && heatOn && map.heat && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-(--kys-text)">
            {top.length
              ? 'A small move changes the sound most here:'
              : 'No control changes this sound much with a small move.'}
          </span>
          {top.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => findStore.set({ kind: 'control', id: c.id })}
              title="Show this control on the panel"
              className="flex items-center gap-1.5 rounded-full border border-(--kys-line) bg-(--kys-ground) py-0.5 pr-2.5 pl-1 font-semibold text-(--kys-text) hover:border-(--kys-muted)"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] text-[#1b1204]"
                style={{ background: heatColor(map.heat?.[c.id] ?? 0, def, outline) }}
              >
                {i + 1}
              </span>
              {displayName(def, c)}
            </button>
          ))}
        </div>
      )}
      {map.state && map.status === 'working' && (
        <span role="status" className="text-(--kys-faint)">
          Updating…
        </span>
      )}
      {map.state && dimOn && <WhyLine def={def} values={values} />}
      <details className="basis-full">
        <summary className="cursor-pointer text-(--kys-faint) hover:text-(--kys-text)">
          How this is worked out
        </summary>
        <p className="mt-1 max-w-[110ch] leading-snug">{HOW}</p>
      </details>
    </div>
  );
}

/**
 * Renders nothing. When a dark control is pointed at, asks the mapper why it is dark (once per control per map) and
 * files the answer in the map store, where the cards and the panel pick it up.
 */
export function WhyAsker({ mapperRef }: { mapperRef: RefObject<Mapper | null> }) {
  const id = useStore(focusStore, (f) => (f && f.kind === 'control' ? f.id : null));
  const ask = useStore(
    mapStore,
    (m) => !!id && m.status === 'ready' && !!m.state && m.state[id] === 'dead' && !(id in m.why)
  );
  useEffect(() => {
    const mapper = mapperRef.current;
    if (!ask || !id || !mapper) return;
    const key = mapStore.get().key;
    mapper.explain(id, (cid, ways) =>
      mapStore.set((m) =>
        m.key === key && m.status !== 'off' ? { ...m, why: { ...m.why, [cid]: ways } } : m
      )
    );
  }, [ask, id, mapperRef]);
  return null;
}

/** The dark control being pointed at (it stays the one in question after the pointer leaves, like the inspector), and the ways in to it once known. */
function useDarkFocus(): { id: string; ways: Door[][] | undefined } | null {
  const id = useStore(focusStore, (f) => (f && f.kind === 'control' ? f.id : null));
  const dark = useStore(mapStore, (m) => !!id && !!m.state && m.state[id] === 'dead');
  const ways = useStore(mapStore, (m) => (id ? m.why[id] : undefined));
  return dark && id ? { id, ways } : null;
}

/** True while the control being pointed at would come in if the mod wheel were pushed up: the keyboard strip rings its wheel. */
export function useWheelWanted(): boolean {
  const focus = useDarkFocus();
  return !!focus?.ways && focus.ways.some((combo) => combo.some((d) => d.id === WHEEL));
}

/** The line of the legend that goes with the dashed rings: which dark control is in question, and what would bring it in. */
function WhyLine({ def, values }: { def: SynthDef; values: ControlValues }) {
  const focus = useDarkFocus();
  const c = focus ? controlMap(def)[focus.id] : undefined;
  if (!focus || !c)
    return (
      <p className="basis-full">
        <span className="font-semibold text-(--kys-text)">Why is it dark?</span> Point at (or tap)
        any dark control. Dashed rings then mark the controls that would bring it into the sound,
        and this line says what to do with them.
      </p>
    );
  return (
    <p className="basis-full leading-snug" role="status">
      <span className="font-semibold text-(--kys-text)">{displayName(def, c)} is dark.</span>
      <Why def={def} ways={focus.ways} values={values} link />
      {focus.ways && focus.ways.length > 0 && ' They are ringed on the panel.'}
    </p>
  );
}

/** "turn OSC 2 VOLUME up" – what to do to one door, with the control's name as a button that finds it on the panel. */
function DoorStep({
  def,
  door,
  values,
  link,
}: {
  def: SynthDef;
  door: Door;
  values: ControlValues;
  link: boolean;
}) {
  if (door.id === WHEEL) return <>push the mod wheel up</>;
  const c = controlMap(def)[door.id];
  if (!c) return null;
  const name = link ? (
    <button
      type="button"
      onClick={() => findStore.set({ kind: 'control', id: c.id })}
      title="Show this control on the panel"
      className="font-semibold text-(--kys-accent) underline underline-offset-2"
    >
      {displayName(def, c)}
    </button>
  ) : (
    <span className="font-semibold text-(--kys-text)">{displayName(def, c)}</span>
  );
  // A switch that is already called "… on" reads better without a second "on".
  if (c.kind === 'bool')
    return (
      <>
        switch {name}
        {door.v && /\bon$/i.test(displayName(def, c)) ? '' : door.v ? ' on' : ' off'}
      </>
    );
  if (c.kind === 'enum' && door.v !== undefined)
    return (
      <>
        set {name} to {formatValue(c, door.v)}
      </>
    );
  const now = values[c.id];
  const up = typeof door.v === 'number' && typeof now === 'number' && door.v > now;
  return (
    <>
      {c.type === 'fader' ? 'move' : 'turn'} {name} {up ? 'up' : 'down'}
    </>
  );
}

/** The sentence(s) that say what would bring a dark control into the sound. */
function Why({
  def,
  ways,
  values,
  link,
}: {
  def: SynthDef;
  ways: Door[][] | undefined;
  values: ControlValues;
  link: boolean;
}) {
  if (!ways) return <> Looking for what would bring it in…</>;
  if (!ways.length)
    return (
      <>
        {' '}
        No one or two controls bring it in. It may need a patch cable, or several things changed at
        once.
      </>
    );
  return (
    <>
      {ways.map((combo, i) => (
        <span key={i}>
          {i === 0 ? ' It comes in if you ' : ' Or '}
          {combo.map((d, k) => (
            <span key={k}>
              {k > 0 && ' and '}
              <DoorStep def={def} door={d} values={values} link={link} />
            </span>
          ))}
          .
        </span>
      ))}
    </>
  );
}

const LEVELS: [number, string][] = [
  [0.75, 'very high'],
  [0.5, 'high'],
  [0.25, 'medium'],
  [0, 'low'],
];

export interface MapNoteProps {
  def: SynthDef;
  c: Control;
  values: ControlValues;
  /** Makes the control names in it clickable (the inspector; the hover card cannot be clicked). */
  link?: boolean;
  className?: string;
}

/** One line for the hover card and the inspector: where this control stands in the sound map. Nothing when the map is off. */
export function MapNote({ def, c, values, link = false, className = '' }: MapNoteProps) {
  const value = values[c.id];
  const st = useStore(mapStore, (m) => (m.state ? m.state[c.id] : null));
  const heat = useStore(mapStore, (m) => (m.heat ? m.heat[c.id] : null));
  const ways = useStore(mapStore, (m) => m.why[c.id]);
  if (!st) return null;
  const level =
    c.kind === 'cont' && st !== 'dead'
      ? heat
        ? (LEVELS.find(([min]) => heat >= min)?.[1] ?? 'low')
        : 'very low'
      : null;
  const zero =
    c.kind !== 'cont'
      ? 'Switched off, so it adds nothing yet. Switching it on brings something new into the sound.'
      : `${value === c.min || value === 0 ? 'At zero' : 'At its neutral position'}, so it adds nothing yet. Moving it brings something new into the sound.`;
  return (
    <p className={`leading-snug text-(--kys-muted) ${className}`}>
      <span className="font-semibold text-(--kys-text)">Sound map: </span>
      {st === 'dead' ? (
        <>
          Does nothing at the moment: wherever you set it, the sound stays the same.
          <Why def={def} ways={ways} values={values} link={link} />
        </>
      ) : st === 'zero' ? (
        zero
      ) : (
        'Shaping the sound.'
      )}
      {level && ` Effect of a small move: ${level}.`}
    </p>
  );
}
