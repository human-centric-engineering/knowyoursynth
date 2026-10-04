import { useEffect, useMemo } from 'react';
import { findStore, focusStore, pendingStore, useStore } from '@/lib/store.js';
import { areaMap, areaMembers } from '@/lib/areas.js';
import { moduleOf } from '@/lib/modules.js';
import { controlMap, displayName, formatValue, isShown, jackMap } from '@/lib/patch.js';
import { explainCable, jackName, shortHear } from '@/lib/explain.js';
import { MapNote } from '@/ui/SoundMap.jsx';

const PATCH = moduleOf('patch');

function useFocused(def) {
  const f = useStore(focusStore);
  if (!f) return { f: null };
  const c = f.kind === 'control' ? controlMap(def)[f.id] : null;
  const j = f.kind === 'jack' ? jackMap(def)[f.id] : null;
  const cable = f.kind === 'cable' && jackMap(def)[f.from] && jackMap(def)[f.to] ? f : null;
  const area = f.kind === 'area' ? areaMap(def)[f.id] || null : null;
  return { f, c, j, cable, area };
}

/** Keep a floating card on screen: flip to the left of the pointer near the right edge, and above it in the lower half. */
function place(f, w) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(w, vw - 16);
  const left = f.x + 18 + width > vw - 8 ? f.x - 18 - width : f.x + 18;
  const style = { left: Math.max(8, Math.min(left, vw - width - 8)), width };
  if (f.y > vh * 0.55) { style.bottom = Math.max(8, vh - f.y + 16); style.maxHeight = Math.max(160, f.y - 24); } else { style.top = f.y + 22; style.maxHeight = Math.max(160, vh - f.y - 30); }
  return style;
}

/** How this synth differs from common practice for the focused control, jack or section. `full` = the inspector's roomier version. */
function Unusual({ def, text, full }) {
  if (!text) return null;
  return full ? (
    <div className="mt-3 rounded-lg border border-line p-3">
      <p className="kys-label text-muted">Unusual on the {def.name}</p>
      <p className="mt-1 text-[14.5px] leading-relaxed">{text}</p>
    </div>
  ) : (
    <div className="mt-2 border-t border-line pt-2">
      <p className="kys-label text-[11px] text-muted">Unusual on the {def.name}</p>
      <p className="mt-0.5 leading-snug text-text/90">{text}</p>
    </div>
  );
}

function Warnings({ list, className = '' }) {
  if (!list || !list.length) return null;
  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {list.map((w, i) => (
        <li key={i} className="flex gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 leading-snug text-text">
          <span aria-hidden="true" className="font-semibold text-warn">!</span><span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

function StoryRow({ tag, label, full, children }) {
  return (
    <div className={full ? 'mt-3' : 'mt-2'}>
      <p className="kys-label flex items-baseline gap-1.5"><span style={{ color: PATCH.color }}>{tag}</span>{label && <span className="truncate text-muted">{label}</span>}</p>
      <div className={`mt-0.5 ${full ? 'text-[14.5px] leading-relaxed' : 'leading-snug'}`}>{children}</div>
    </div>
  );
}

/** The three-part story of a cable: what comes out, what the input does with it, what you hear. `full` adds the jacks' general help. */
function CableStory({ x, full }) {
  if (!x.modelled) return <StoryRow tag="Sound" full={full}><p>{x.hear}</p></StoryRow>;
  return (
    <>
      <StoryRow tag="Out" label={x.fromLabel} full={full}>
        {full && <p className="text-muted">{x.fromHelp}</p>}
        <p className={full ? 'mt-1' : ''}>{x.carries}</p>
      </StoryRow>
      {(full || x.does) && (
        <StoryRow tag="In" label={x.toLabel} full={full}>
          {full && <p className="text-muted">{x.toHelp}</p>}
          {x.does && <p className={full ? 'mt-1' : ''}>{x.does}</p>}
        </StoryRow>
      )}
      <StoryRow tag="Sound" label="what you will hear" full={full}><p className="text-text">{x.hear}</p></StoryRow>
    </>
  );
}

/** Floating card that follows the mouse over the panel. */
/** "Here: TUNE, SHAPE … · 4 jacks" for an area card. */
function membersLine(def, area) {
  const { controls, jacks } = areaMembers(def, area);
  const names = controls.map((c) => displayName(def, c));
  const parts = [];
  if (names.length) parts.push(names.join(', '));
  if (jacks.length) parts.push(jacks.length <= 6 && !names.length ? jacks.map((j) => jackName(j)).join(', ') : `${jacks.length} jack${jacks.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function Tooltip({ enabled = true, def, values, target, preset, cables }) {
  const { f, c, j, cable, area } = useFocused(def);
  const pending = useStore(pendingStore);
  const jm = jackMap(def);
  const pj = pending && j && pending !== j.id ? jm[pending] : null;
  const pair = cable ? [cable.from, cable.to] : pj && pj.dir !== j.dir ? (j.dir === 'in' ? [pj.id, j.id] : [j.id, pj.id]) : null;
  const pairKey = pair ? pair.join('>') : '';
  const x = useMemo(() => (pair ? explainCable(def, pair[0], pair[1], values, cables) : null), [def, pairKey, values, cables]); // eslint-disable-line react-hooks/exhaustive-deps

  // A card put up by plugging a cable in has no hover to end it on touch screens: the next press anywhere clears it.
  const stickyId = f && f.sticky && f.tip ? f.id : null;
  useEffect(() => {
    if (!stickyId) return undefined;
    const clear = () => focusStore.set((s) => (s && s.id === stickyId ? { ...s, tip: false, sticky: false } : s));
    window.addEventListener('pointerdown', clear, { once: true });
    return () => window.removeEventListener('pointerdown', clear);
  }, [stickyId]);

  if (!f || !f.tip || (!c && !j && !cable && !area)) return null;
  // With info cards off, only the card that guides a cable you are plugging in still appears.
  const patching = !!pj || !!f.prospect;
  if (!enabled && !patching) return null;

  if (area) {
    const mod = moduleOf(area.module);
    const here = membersLine(def, area);
    return (
      <div role="tooltip" className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-line bg-raised p-3.5 text-[13.5px] shadow-2xl" style={place(f, 340)}>
        <p className="kys-label" style={{ color: mod.color }}>Section · <span className="text-muted">{mod.label}</span></p>
        <p className="mt-0.5 font-display text-[15px] leading-tight">{area.label}</p>
        <p className="mt-1.5 leading-snug text-text/90">{area.help}</p>
        <Unusual def={def} text={area.unusual} />
        {here && <p className="mt-2 border-t border-line pt-2 text-xs leading-snug text-muted"><span className="font-semibold text-text">Here: </span>{here}</p>}
      </div>
    );
  }

  if (x) {
    // `pin`: the card is for a hole of a pin matrix (VCS3), where a click puts the pin in or takes it out.
    const foot = f.pin ? (x.plugged ? 'Click the hole to take the pin out.' : 'Click to put the pin in.') : f.prospect ? 'Let go to plug it in here. Drop it anywhere else and the cable goes back where it was.' : cable
      ? (x.plugged ? 'Click the cable to unplug it. The inspector keeps this explanation and updates it as you move knobs.' : '')
      : x.plugged ? 'These two are already connected.' : 'Click to plug the cable in, or press Esc to drop it.';
    return (
      <div role="tooltip" className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-line bg-raised p-3.5 text-[13px] shadow-2xl" style={place(f, 380)}>
        <p className="kys-label" style={{ color: PATCH.color }}>{f.pin ? (x.plugged ? 'Pin' : 'If you put a pin here') : f.prospect ? 'If you move the plug here' : cable ? 'Patch cable' : 'If you plug it in here'} · <span className="text-muted">{x.kind}</span></p>
        <p className="mt-0.5 font-display text-[15px] leading-tight">{x.title}</p>
        <Warnings list={x.warnings} className="mt-2" />
        <CableStory x={x} />
        {foot && <p className="mt-2.5 border-t border-line pt-2 text-xs text-muted">{foot}</p>}
      </div>
    );
  }

  const ctxLine = c && preset && preset.context ? preset.context[c.id] : null;
  const mod = c ? moduleOf(c.module) : PATCH;
  const here = j ? cables.filter((cb) => (cb.from === j.id || cb.to === j.id) && jm[cb.from] && jm[cb.to]) : [];
  return (
    <div role="tooltip" className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-line bg-raised p-3.5 text-[13.5px] shadow-2xl" style={place(f, 320)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="kys-label" style={{ color: mod.color }}>{c ? displayName(def, c) : `${jackName(j)} · ${j.dir === 'out' ? 'output' : 'input'}`}</span>
        {c && <span className="font-mono text-text">{formatValue(c, values[c.id])}</span>}
      </div>
      <p className="mt-1.5 leading-snug text-text/90">{(c || j).help}</p>
      <Unusual def={def} text={(c || j).unusual} />
      {c && <MapNote def={def} c={c} values={values} className="mt-2 border-t border-line pt-2" />}
      {ctxLine && <p className="mt-2 border-t border-line pt-2 leading-snug"><span className="font-semibold text-accent">In this sound: </span>{ctxLine}</p>}
      {c && target && target[c.id] !== values[c.id] && <p className="mt-2 font-mono text-xs text-accent">Sound setting: {formatValue(c, target[c.id])}</p>}
      {here.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {here.map((cb) => (
            <li key={`${cb.from}>${cb.to}`} className="flex items-baseline gap-1.5 leading-snug">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cb.color }} />
              <span><span className="font-semibold">{jackName(jm[cb.from])} → {jackName(jm[cb.to])}.</span> <span className="text-muted">{shortHear(explainCable(def, cb.from, cb.to, values, cables))}</span></span>
            </li>
          ))}
        </ul>
      )}
      {j && pj && pj.dir === j.dir && <p className="mt-2 text-xs text-warn">A cable runs from an output to an input. You are holding {jackName(pj)}, which is also an {j.dir === 'out' ? 'output' : 'input'}, so clicking here starts a new cable from this jack instead.</p>}
      {j && !pj && <p className="mt-2 text-xs text-muted">Click, then hover over any {j.dir === 'out' ? 'input' : 'output'}: this card will say what that cable would do before you plug it in.</p>}
    </div>
  );
}

function CableList({ def, values, cables, focusedId, onUnplug }) {
  const jm = jackMap(def);
  if (!cables.length) return null;
  return (
    <section aria-labelledby="cables-h" className="rounded-xl border border-line bg-surface p-4">
      <h2 id="cables-h" className="kys-label mb-2 text-muted">Cables in this patch · {cables.length}</h2>
      <ul className="flex flex-col gap-1.5">
        {cables.map((cb) => {
          const id = `${cb.from}>${cb.to}`;
          if (!jm[cb.from] || !jm[cb.to]) return null;
          const x = explainCable(def, cb.from, cb.to, values, cables);
          return (
            <li key={id} className={`flex items-start gap-1 rounded-lg border ${focusedId === id ? 'border-accent bg-raised' : 'border-line bg-ground'}`}>
              <button type="button" onClick={() => focusStore.set({ kind: 'cable', id, from: cb.from, to: cb.to, tip: false })} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cb.color }} />
                  <span className="truncate font-mono text-[12.5px] text-text">{x.title}</span>
                  {x.warnings.length > 0 && <span className="rounded bg-warn/20 px-1 text-[11px] font-semibold text-warn">check</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{shortHear(x)}</span>
              </button>
              <button type="button" onClick={() => onUnplug(cb.from, cb.to)} aria-label={`Unplug ${x.title}`} className="px-2.5 py-2 text-muted hover:text-text">×</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Persistent version of the same information, for touch screens and for reading at leisure. */
export function Inspector({ def, values, target, preset, cables, onChange, onConnect, onUnplug }) {
  const { f, c, j, cable, area } = useFocused(def);
  const cableKey = cable ? cable.id : '';
  const x = useMemo(() => (cable ? explainCable(def, cable.from, cable.to, values, cables) : null), [def, cableKey, values, cables]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = <CableList def={def} values={values} cables={cables} focusedId={cableKey} onUnplug={onUnplug} />;

  if (x) {
    return (
      <>
        <section aria-live="polite" className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="kys-label flex items-center gap-1.5" style={{ color: PATCH.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: PATCH.color }} />Patch cable · <span className="text-muted">{x.kind}</span>
            </h2>
            <span className="kys-label text-faint">{x.plugged ? 'plugged in' : 'not plugged in'}</span>
          </div>
          <p className="mt-1 font-display text-[15px] leading-tight">{x.title}</p>
          <Warnings list={x.warnings} className="mt-3 text-[14px]" />
          <CableStory x={x} full />
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{x.plugged ? 'This follows the panel: move a knob and the text updates.' : 'This is what the cable would do with the panel as it is now.'}</span>
            {x.plugged
              ? <button type="button" onClick={() => onUnplug(x.from, x.to)} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-muted hover:text-text">Unplug</button>
              : <button type="button" onClick={() => onConnect(x.from, x.to)} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-muted hover:text-text">Plug it in</button>}
          </div>
        </section>
        {list}
      </>
    );
  }

  if (area) {
    const mod = moduleOf(area.module);
    const members = areaMembers(def, area);
    // Parameters deep in a menu tree (the DeepMind's effects) are listed only while they are on the screen.
    const controls = members.controls.filter((k) => !k.deep || isShown(k, values));
    const { jacks } = members;
    const show = (kind, id) => { findStore.set({ kind, id }); focusStore.set({ kind, id, tip: false }); };
    return (
      <>
        <section aria-live="polite" className="rounded-xl border border-line bg-surface p-4">
          <h2 className="kys-label flex items-center gap-1.5" style={{ color: mod.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: mod.color }} />Section · <span className="text-muted">{mod.label}</span>
          </h2>
          <p className="mt-1 font-display text-[15px] leading-tight">{area.label}</p>
          <p className="mt-2 text-[14.5px] leading-relaxed">{area.help}</p>
          <Unusual def={def} text={area.unusual} full />
          {controls.length + jacks.length > 0 && (
            <div className="mt-3">
              <p className="kys-label text-muted">In this section · click one to find it</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {controls.map((k) => <li key={k.id}><button type="button" onClick={() => show('control', k.id)} className="rounded-md border border-line px-2 py-1 text-[13px] text-muted hover:border-muted hover:text-text">{displayName(def, k)}</button></li>)}
                {jacks.map((k) => <li key={k.id}><button type="button" onClick={() => show('jack', k.id)} className="rounded-md border border-dashed border-line px-2 py-1 font-mono text-xs text-muted hover:border-muted hover:text-text">{jackName(k)} {k.dir}</button></li>)}
              </ul>
            </div>
          )}
        </section>
        {list}
      </>
    );
  }

  if (!f || (!c && !j)) {
    return (
      <>
        <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          <h2 className="kys-label mb-1 text-muted">Control inspector</h2>
          Hover or touch any knob, switch, jack or cable on the panel. This card explains what it does in general, and what it is doing in the sound you have loaded. For a cable it says what the output carries, what the input does with it, and how the sound changes.
        </section>
        {list}
      </>
    );
  }
  const mod = c ? moduleOf(c.module) : PATCH;
  const ctxLine = c && preset && preset.context ? preset.context[c.id] : null;
  const differs = c && target && target[c.id] !== values[c.id];
  return (
    <>
      <section aria-live="polite" className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="kys-label flex items-center gap-1.5" style={{ color: mod.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: mod.color }} />{mod.label}
          </h2>
          {c && <span className="font-mono text-sm">{formatValue(c, values[c.id])}</span>}
        </div>
        <p className="mt-1 font-display text-[15px] leading-tight">{c ? displayName(def, c) : `${jackName(j)} ${j.dir === 'out' ? 'output' : 'input'}`}</p>
        <p className="mt-2 text-[14.5px] leading-relaxed">{(c || j).help}</p>
        <Unusual def={def} text={(c || j).unusual} full />
        {c && <MapNote def={def} c={c} values={values} link className="mt-3 text-[14.5px]" />}
        {ctxLine && (
          <p className="mt-3 rounded-lg bg-ground p-3 text-[14.5px] leading-relaxed"><span className="font-semibold text-accent">In this sound: </span>{ctxLine}</p>
        )}
        {differs && (
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">The sound has this at <span className="font-mono text-accent">{formatValue(c, target[c.id])}</span></span>
            <button type="button" onClick={() => onChange(c.id, null)} className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-text">Put it back</button>
          </div>
        )}
        {j && <p className="mt-3 text-sm text-muted">To patch: click this jack on the panel, then hover over {j.dir === 'out' ? 'any input' : 'any output'} to read what that cable would do, and click to plug it in. Click a cable to unplug it.</p>}
      </section>
      {list}
    </>
  );
}
