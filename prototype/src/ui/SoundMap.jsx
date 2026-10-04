// The words that go with the sound map: the key under the panel, and the line about one control in the cards.
import { useEffect } from 'react';
import { findStore, focusStore, mapStore, useStore } from '@/lib/store.js';
import { controlMap, displayName, formatValue } from '@/lib/patch.js';
import { WHEEL } from '@/lib/soundmap.js';
import { heatColor } from '@/panel/layers.jsx';

// [name on the hardware view, name on the paper outline (where unused parts fade instead of going dark), meaning, wash, hatched]
const KEY = [
  ['Bright', 'Full ink', 'shaping the sound', 0, false],
  ['Striped', 'Striped', 'at zero or switched off. Move it to bring that part in', 0.4, true],
  ['Dark', 'Faded', 'does nothing at the moment', 0.78, false],
];

const HOW = 'Worked out by playing two notes of the riff through the synth model again and again, each time with one control moved, and comparing the results. The mod wheel counts as it is set now, so wheel controls stay dark until you push it up.';

/** Strip under the faceplate: progress while the map is worked out, then the key, the most sensitive controls and the way in to the dark control being pointed at. */
export function MapLegend({ def, values, dimOn, heatOn, outline }) {
  const map = useStore(mapStore);
  if (map.status === 'off') return null;
  const cm = controlMap(def);
  const top = map.ranked.slice(0, 5).filter((id) => cm[id]);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
      {!map.state && <span role="status">Working out what is in this sound… {Math.round(map.progress * 100)}%</span>}
      {map.state && dimOn && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {KEY.map(([hw, paper, text, wash, hatched]) => (
            <li key={hw} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`relative h-4 w-4 overflow-hidden rounded-sm border border-line ${outline ? 'bg-[#1c2530]' : 'bg-[#d8d5cc]'}`}>
                <span className={`absolute inset-0 ${outline ? 'bg-[#eef0ec]' : 'bg-black'}`} style={{ opacity: outline ? Math.min(0.9, wash * 1.15) : wash }} />
                {hatched && <span className="absolute inset-0" style={{ background: `repeating-linear-gradient(45deg, ${outline ? '#1c2530' : '#ffffff'} 0 2px, transparent 2px 5px)`, opacity: outline ? 0.6 : 0.75 }} />}
              </span>
              <span><span className="font-semibold text-text">{outline ? paper : hw}:</span> {text}</span>
            </li>
          ))}
        </ul>
      )}
      {map.state && heatOn && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-text">{top.length ? 'A small move changes the sound most here:' : 'No control changes this sound much with a small move.'}</span>
          {top.map((id, i) => (
            <button key={id} type="button" onClick={() => findStore.set({ kind: 'control', id })} title="Show this control on the panel"
              className="flex items-center gap-1.5 rounded-full border border-line bg-ground py-0.5 pl-1 pr-2.5 font-semibold text-text hover:border-muted">
              <span className="flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] text-[#1b1204]" style={{ background: heatColor(map.heat[id], def, outline) }}>{i + 1}</span>
              {displayName(def, cm[id])}
            </button>
          ))}
        </div>
      )}
      {map.state && map.status === 'working' && <span role="status" className="text-faint">Updating…</span>}
      {map.state && dimOn && <WhyLine def={def} values={values} />}
      <details className="basis-full">
        <summary className="cursor-pointer text-faint hover:text-text">How this is worked out</summary>
        <p className="mt-1 max-w-[110ch] leading-snug">{HOW}</p>
      </details>
    </div>
  );
}

/**
 * Renders nothing. When a dark control is pointed at, asks the mapper why it is dark (once per control per map) and
 * files the answer in the map store, where the cards and the panel pick it up.
 */
export function WhyAsker({ mapperRef }) {
  const id = useStore(focusStore, (f) => (f && f.kind === 'control' ? f.id : null));
  const ask = useStore(mapStore, (m) => !!id && m.status === 'ready' && !!m.state && m.state[id] === 'dead' && !(id in m.why));
  useEffect(() => {
    if (!ask || !mapperRef.current) return;
    const key = mapStore.get().key;
    mapperRef.current.explain(id, (cid, ways) => mapStore.set((m) => (m.key === key && m.status !== 'off' ? { ...m, why: { ...m.why, [cid]: ways } } : m)));
  }, [ask, id, mapperRef]);
  return null;
}

/** The dark control being pointed at (it stays the one in question after the pointer leaves, like the inspector), and the ways in to it once known. */
function useDarkFocus() {
  const id = useStore(focusStore, (f) => (f && f.kind === 'control' ? f.id : null));
  const dark = useStore(mapStore, (m) => !!id && !!m.state && m.state[id] === 'dead');
  const ways = useStore(mapStore, (m) => (id ? m.why[id] : undefined));
  return dark ? { id, ways } : null;
}

/** True while the control being pointed at would come in if the mod wheel were pushed up: the keyboard strip rings its wheel. */
export function useWheelWanted() {
  const focus = useDarkFocus();
  return !!focus && !!focus.ways && focus.ways.some((combo) => combo.some((d) => d.id === WHEEL));
}

/** The line of the legend that goes with the dashed rings: which dark control is in question, and what would bring it in. */
function WhyLine({ def, values }) {
  const focus = useDarkFocus();
  const c = focus && controlMap(def)[focus.id];
  if (!c) return <p className="basis-full"><span className="font-semibold text-text">Why is it dark?</span> Point at (or tap) any dark control. Dashed rings then mark the controls that would bring it into the sound, and this line says what to do with them.</p>;
  return (
    <p className="basis-full leading-snug" role="status">
      <span className="font-semibold text-text">{displayName(def, c)} is dark.</span>
      <Why def={def} ways={focus.ways} values={values} link />
      {focus.ways && focus.ways.length > 0 && ' They are ringed on the panel.'}
    </p>
  );
}

/** "turn OSC 2 VOLUME up" – what to do to one door, with the control's name as a button that finds it on the panel. */
function DoorStep({ def, door, values, link }) {
  if (door.id === WHEEL) return <>push the mod wheel up</>;
  const c = controlMap(def)[door.id];
  if (!c) return null;
  const name = link
    ? <button type="button" onClick={() => findStore.set({ kind: 'control', id: c.id })} title="Show this control on the panel" className="font-semibold text-accent underline underline-offset-2">{displayName(def, c)}</button>
    : <span className="font-semibold text-text">{displayName(def, c)}</span>;
  // A switch that is already called "… on" reads better without a second "on".
  if (c.kind === 'bool') return <>switch {name}{door.v && /\bon$/i.test(displayName(def, c)) ? '' : door.v ? ' on' : ' off'}</>;
  if (c.kind === 'enum') return <>set {name} to {formatValue(c, door.v)}</>;
  return <>{c.type === 'fader' ? 'move' : 'turn'} {name} {door.v > values[c.id] ? 'up' : 'down'}</>;
}

/** The sentence(s) that say what would bring a dark control into the sound. */
function Why({ def, ways, values, link }) {
  if (!ways) return <> Looking for what would bring it in…</>;
  if (!ways.length) return <> No one or two controls bring it in. It may need a patch cable, or several things changed at once.</>;
  return (
    <>
      {ways.map((combo, i) => (
        <span key={i}>{i === 0 ? ' It comes in if you ' : ' Or '}
          {combo.map((d, k) => <span key={k}>{k > 0 && ' and '}<DoorStep def={def} door={d} values={values} link={link} /></span>)}.
        </span>
      ))}
    </>
  );
}

const LEVELS = [[0.75, 'very high'], [0.5, 'high'], [0.25, 'medium'], [0, 'low']];

/** One line for the hover card and the inspector: where this control stands in the sound map. Nothing when the map is off. `link` makes the control names in it clickable (the inspector; the hover card cannot be clicked). */
export function MapNote({ def, c, values, link = false, className = '' }) {
  const value = values[c.id];
  const st = useStore(mapStore, (m) => (m.state ? m.state[c.id] : null));
  const heat = useStore(mapStore, (m) => (m.heat ? m.heat[c.id] : null));
  const ways = useStore(mapStore, (m) => m.why[c.id]);
  if (!st) return null;
  const level = c.kind === 'cont' && st !== 'dead' ? (heat ? LEVELS.find(([min]) => heat >= min)[1] : 'very low') : null;
  const zero = c.kind !== 'cont' ? 'Switched off, so it adds nothing yet. Switching it on brings something new into the sound.'
    : `${value === c.min || value === 0 ? 'At zero' : 'At its neutral position'}, so it adds nothing yet. Moving it brings something new into the sound.`;
  return (
    <p className={`leading-snug text-muted ${className}`}>
      <span className="font-semibold text-text">Sound map: </span>
      {st === 'dead' ? <>Does nothing at the moment: wherever you set it, the sound stays the same.<Why def={def} ways={ways} values={values} link={link} /></> : st === 'zero' ? zero : 'Shaping the sound.'}
      {level && ` Effect of a small move: ${level}.`}
    </p>
  );
}
