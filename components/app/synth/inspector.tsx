'use client';

/**
 * What the pointer is on, explained: a floating card that follows it over the panel (`Tooltip`), and the same
 * information kept beside the panel for touch screens and for reading at leisure (`Inspector`). Both cover controls,
 * jacks, sections and cables, with the synth's "Unusual on…" notes and the cables in the patch.
 *
 * Transliterated from the prototype file `prototype/src/ui/Inspector.jsx` (decision D3). The unusual notes are read
 * from the definition as there, but the page attaches them from the API (`withNotes`), not the definition module.
 * Not yet here: the sound map's note on a control (`MapNote`), which arrives with the sound map (t-15).
 */

import { useEffect, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { areaMap, areaMembers } from '@/lib/app/synths/lib/areas';
import { explainCable, jackName, shortHear } from '@/lib/app/synths/lib/explain';
import type { CableExplanation } from '@/lib/app/synths/lib/explain';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { controlMap, displayName, formatValue, isShown, jackMap } from '@/lib/app/synths/lib/patch';
import type {
  Area,
  Control,
  ControlValue,
  ControlValues,
  Jack,
  PatchCable,
  Preset,
  SynthDef,
} from '@/lib/app/synths/contract';
import { findStore, focusStore, pendingStore, useStore } from '@/components/app/synth/stores';
import type { CableFocus, Focus } from '@/components/app/synth/stores';

const PATCH = moduleOf('patch');

/** The sound's own words, from the preset: just what the inspector needs of it. */
type PresetContext = Pick<Preset, 'context'> | null;

interface Focused {
  f: Focus | null;
  c?: Control | null;
  j?: Jack | null;
  cable?: CableFocus | null;
  area?: Area | null;
}

function useFocused(def: SynthDef): Focused {
  const f = useStore(focusStore);
  if (!f) return { f: null };
  const jm = jackMap(def);
  const c = f.kind === 'control' ? controlMap(def)[f.id] : null;
  const j = f.kind === 'jack' ? jm[f.id] : null;
  const cable = f.kind === 'cable' && jm[f.from] && jm[f.to] ? f : null;
  const area = f.kind === 'area' ? areaMap(def)[f.id] || null : null;
  return { f, c, j, cable, area };
}

/** Keep a floating card on screen: flip to the left of the pointer near the right edge, and above it in the lower half. */
function place(f: { x: number; y: number }, w: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(w, vw - 16);
  const left = f.x + 18 + width > vw - 8 ? f.x - 18 - width : f.x + 18;
  const style: CSSProperties = { left: Math.max(8, Math.min(left, vw - width - 8)), width };
  if (f.y > vh * 0.55) {
    style.bottom = Math.max(8, vh - f.y + 16);
    style.maxHeight = Math.max(160, f.y - 24);
  } else {
    style.top = f.y + 22;
    style.maxHeight = Math.max(160, vh - f.y - 30);
  }
  return style;
}

/** How this synth differs from common practice for the focused control, jack or section. `full` = the inspector's roomier version. */
function Unusual({ def, text, full }: { def: SynthDef; text?: string; full?: boolean }) {
  if (!text) return null;
  return full ? (
    <div className="mt-3 rounded-lg border border-(--kys-line) p-3">
      <p className="kys-label text-(--kys-muted)">Unusual on the {def.name}</p>
      <p className="mt-1 text-[14.5px] leading-relaxed">{text}</p>
    </div>
  ) : (
    <div className="mt-2 border-t border-(--kys-line) pt-2">
      <p className="kys-label text-[11px] text-(--kys-muted)">Unusual on the {def.name}</p>
      <p className="mt-0.5 leading-snug text-(--kys-text)/90">{text}</p>
    </div>
  );
}

function Warnings({ list, className = '' }: { list: string[]; className?: string }) {
  if (!list.length) return null;
  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {list.map((w, i) => (
        <li
          key={i}
          className="flex gap-1.5 rounded-md border border-(--kys-warn)/40 bg-(--kys-warn)/10 px-2 py-1.5 leading-snug text-(--kys-text)"
        >
          <span aria-hidden="true" className="font-semibold text-(--kys-warn)">
            !
          </span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

function StoryRow({
  tag,
  label,
  full,
  children,
}: {
  tag: string;
  label?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? 'mt-3' : 'mt-2'}>
      <p className="kys-label flex items-baseline gap-1.5">
        <span style={{ color: PATCH.color }}>{tag}</span>
        {label && <span className="truncate text-(--kys-muted)">{label}</span>}
      </p>
      <div className={`mt-0.5 ${full ? 'text-[14.5px] leading-relaxed' : 'leading-snug'}`}>
        {children}
      </div>
    </div>
  );
}

/** The three-part story of a cable: what comes out, what the input does with it, what you hear. `full` adds the jacks' general help. */
function CableStory({ x, full }: { x: CableExplanation; full?: boolean }) {
  if (!x.modelled)
    return (
      <StoryRow tag="Sound" full={full}>
        <p>{x.hear}</p>
      </StoryRow>
    );
  return (
    <>
      <StoryRow tag="Out" label={x.fromLabel} full={full}>
        {full && <p className="text-(--kys-muted)">{x.fromHelp}</p>}
        <p className={full ? 'mt-1' : ''}>{x.carries}</p>
      </StoryRow>
      {(full || x.does) && (
        <StoryRow tag="In" label={x.toLabel} full={full}>
          {full && <p className="text-(--kys-muted)">{x.toHelp}</p>}
          {x.does && <p className={full ? 'mt-1' : ''}>{x.does}</p>}
        </StoryRow>
      )}
      <StoryRow tag="Sound" label="what you will hear" full={full}>
        <p className="text-(--kys-text)">{x.hear}</p>
      </StoryRow>
    </>
  );
}

/** "Here: TUNE, SHAPE … · 4 jacks" for an area card. */
function membersLine(def: SynthDef, area: Area): string {
  const { controls, jacks } = areaMembers(def, area);
  const names = controls.map((c) => displayName(def, c));
  const parts: string[] = [];
  if (names.length) parts.push(names.join(', '));
  if (jacks.length)
    parts.push(
      jacks.length <= 6 && !names.length
        ? jacks.map((j) => jackName(j)).join(', ')
        : `${jacks.length} jack${jacks.length === 1 ? '' : 's'}`
    );
  return parts.join(' · ');
}

const cardClass =
  'pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-(--kys-line) bg-(--kys-raised) p-3.5 shadow-2xl';

export interface TooltipProps {
  /** Info cards on. Off, only the card that guides a cable being plugged in still appears. */
  enabled?: boolean;
  def: SynthDef;
  values: ControlValues;
  /** The sound's values, when a control has moved off them; `null` during a lesson step. */
  target: ControlValues | null;
  preset: PresetContext;
  cables: PatchCable[];
}

/** Floating card that follows the mouse over the panel. */
export function Tooltip({ enabled = true, def, values, target, preset, cables }: TooltipProps) {
  const { f, c, j, cable, area } = useFocused(def);
  const pending = useStore(pendingStore);
  const jm = jackMap(def);
  const pj = pending && j && pending !== j.id ? jm[pending] : null;
  const pair: [string, string] | null = cable
    ? [cable.from, cable.to]
    : pj && j && pj.dir !== j.dir
      ? j.dir === 'in'
        ? [pj.id, j.id]
        : [j.id, pj.id]
      : null;
  const x = pair ? explainCable(def, pair[0], pair[1], values, cables) : null;

  // A card put up by plugging a cable in has no hover to end it on touch screens: the next press anywhere clears it.
  const stickyId = f && f.sticky && f.tip ? f.id : null;
  useEffect(() => {
    if (!stickyId) return undefined;
    const clear = () =>
      focusStore.set((s) => (s && s.id === stickyId ? { ...s, tip: false, sticky: false } : s));
    window.addEventListener('pointerdown', clear, { once: true });
    return () => window.removeEventListener('pointerdown', clear);
  }, [stickyId]);

  if (!f || !f.tip || (!c && !j && !cable && !area)) return null;
  const prospect = f.kind === 'cable' && !!f.prospect;
  const pin = f.kind === 'cable' && !!f.pin;
  const patching = !!pj || prospect;
  if (!enabled && !patching) return null;

  if (area) {
    const mod = moduleOf(area.module);
    const here = membersLine(def, area);
    return (
      <div role="tooltip" className={`${cardClass} text-[13.5px]`} style={place(f, 340)}>
        <p className="kys-label" style={{ color: mod.color }}>
          Section · <span className="text-(--kys-muted)">{mod.label}</span>
        </p>
        <p className="kys-display mt-0.5 text-[15px] leading-tight">{area.label}</p>
        <p className="mt-1.5 leading-snug text-(--kys-text)/90">{area.help}</p>
        <Unusual def={def} text={area.unusual} />
        {here && (
          <p className="mt-2 border-t border-(--kys-line) pt-2 text-xs leading-snug text-(--kys-muted)">
            <span className="font-semibold text-(--kys-text)">Here: </span>
            {here}
          </p>
        )}
      </div>
    );
  }

  if (x) {
    // `pin`: the card is for a hole of a pin matrix (VCS3), where a click puts the pin in or takes it out.
    const foot = pin
      ? x.plugged
        ? 'Click the hole to take the pin out.'
        : 'Click to put the pin in.'
      : prospect
        ? 'Let go to plug it in here. Drop it anywhere else and the cable goes back where it was.'
        : cable
          ? x.plugged
            ? 'Click the cable to unplug it. The inspector keeps this explanation and updates it as you move knobs.'
            : ''
          : x.plugged
            ? 'These two are already connected.'
            : 'Click to plug the cable in, or press Esc to drop it.';
    const heading = pin
      ? x.plugged
        ? 'Pin'
        : 'If you put a pin here'
      : prospect
        ? 'If you move the plug here'
        : cable
          ? 'Patch cable'
          : 'If you plug it in here';
    return (
      <div role="tooltip" className={`${cardClass} text-[13px]`} style={place(f, 380)}>
        <p className="kys-label" style={{ color: PATCH.color }}>
          {heading} · <span className="text-(--kys-muted)">{x.kind}</span>
        </p>
        <p className="kys-display mt-0.5 text-[15px] leading-tight">{x.title}</p>
        <Warnings list={x.warnings} className="mt-2" />
        <CableStory x={x} />
        {foot && (
          <p className="mt-2.5 border-t border-(--kys-line) pt-2 text-xs text-(--kys-muted)">
            {foot}
          </p>
        )}
      </div>
    );
  }

  const item = c || j;
  if (!item) return null;
  const ctxLine = c && preset && preset.context ? preset.context[c.id] : null;
  const mod = c ? moduleOf(c.module) : PATCH;
  const here = j
    ? cables.filter((cb) => (cb.from === j.id || cb.to === j.id) && jm[cb.from] && jm[cb.to])
    : [];
  return (
    <div role="tooltip" className={`${cardClass} text-[13.5px]`} style={place(f, 320)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="kys-label" style={{ color: mod.color }}>
          {c
            ? displayName(def, c)
            : j && `${jackName(j)} · ${j.dir === 'out' ? 'output' : 'input'}`}
        </span>
        {c && <span className="font-mono text-(--kys-text)">{formatValue(c, values[c.id])}</span>}
      </div>
      <p className="mt-1.5 leading-snug text-(--kys-text)/90">{item.help}</p>
      <Unusual def={def} text={item.unusual} />
      {ctxLine && (
        <p className="mt-2 border-t border-(--kys-line) pt-2 leading-snug">
          <span className="font-semibold text-(--kys-accent)">In this sound: </span>
          {ctxLine}
        </p>
      )}
      {c && target && target[c.id] !== values[c.id] && (
        <p className="mt-2 font-mono text-xs text-(--kys-accent)">
          Sound setting: {formatValue(c, target[c.id])}
        </p>
      )}
      {here.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-(--kys-line) pt-2">
          {here.map((cb) => {
            const a = jm[cb.from];
            const b = jm[cb.to];
            if (!a || !b) return null;
            return (
              <li key={`${cb.from}>${cb.to}`} className="flex items-baseline gap-1.5 leading-snug">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cb.color }} />
                <span>
                  <span className="font-semibold">
                    {jackName(a)} → {jackName(b)}.
                  </span>{' '}
                  <span className="text-(--kys-muted)">
                    {shortHear(explainCable(def, cb.from, cb.to, values, cables))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {j && pj && pj.dir === j.dir && (
        <p className="mt-2 text-xs text-(--kys-warn)">
          A cable runs from an output to an input. You are holding {jackName(pj)}, which is also an{' '}
          {j.dir === 'out' ? 'output' : 'input'}, so clicking here starts a new cable from this jack
          instead.
        </p>
      )}
      {j && !pj && (
        <p className="mt-2 text-xs text-(--kys-muted)">
          Click, then hover over any {j.dir === 'out' ? 'input' : 'output'}: this card will say what
          that cable would do before you plug it in.
        </p>
      )}
    </div>
  );
}

function CableList({
  def,
  values,
  cables,
  focusedId,
  onUnplug,
}: {
  def: SynthDef;
  values: ControlValues;
  cables: PatchCable[];
  focusedId: string;
  onUnplug: (from: string, to: string) => void;
}) {
  const jm = jackMap(def);
  if (!cables.length) return null;
  return (
    <section
      aria-labelledby="cables-h"
      className="rounded-xl border border-(--kys-line) bg-(--kys-surface) p-4"
    >
      <h2 id="cables-h" className="kys-label mb-2 text-(--kys-muted)">
        Cables in this patch · {cables.length}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {cables.map((cb) => {
          const id = `${cb.from}>${cb.to}`;
          const x = explainCable(def, cb.from, cb.to, values, cables);
          if (!jm[cb.from] || !jm[cb.to] || !x) return null;
          return (
            <li
              key={id}
              className={`flex items-start gap-1 rounded-lg border ${focusedId === id ? 'border-(--kys-accent) bg-(--kys-raised)' : 'border-(--kys-line) bg-(--kys-ground)'}`}
            >
              <button
                type="button"
                onClick={() =>
                  focusStore.set({
                    kind: 'cable',
                    id,
                    from: cb.from,
                    to: cb.to,
                    x: 0,
                    y: 0,
                    tip: false,
                  })
                }
                className="min-w-0 flex-1 px-2.5 py-2 text-left"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cb.color }}
                  />
                  <span className="truncate font-mono text-[12.5px] text-(--kys-text)">
                    {x.title}
                  </span>
                  {x.warnings.length > 0 && (
                    <span className="rounded bg-(--kys-warn)/20 px-1 text-[11px] font-semibold text-(--kys-warn)">
                      check
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-muted)">
                  {shortHear(x)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onUnplug(cb.from, cb.to)}
                aria-label={`Unplug ${x.title}`}
                className="px-2.5 py-2 text-(--kys-muted) hover:text-(--kys-text)"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface InspectorProps {
  def: SynthDef;
  values: ControlValues;
  /** The loaded sound's values: "Put it back" returns a control to these. `null` during a lesson step. */
  target: ControlValues | null;
  preset: PresetContext;
  cables: PatchCable[];
  /** `null` puts the control back where the sound had it. */
  onChange: (id: string, v: ControlValue | null) => void;
  onConnect: (from: string, to: string) => void;
  onUnplug: (from: string, to: string) => void;
}

const sectionClass = 'rounded-xl border border-(--kys-line) bg-(--kys-surface) p-4';

/** Persistent version of the same information, for touch screens and for reading at leisure. */
export function Inspector({
  def,
  values,
  target,
  preset,
  cables,
  onChange,
  onConnect,
  onUnplug,
}: InspectorProps) {
  const { f, c, j, cable, area } = useFocused(def);
  const cableKey = cable ? cable.id : '';
  const x = useMemo(
    () => (cable ? explainCable(def, cable.from, cable.to, values, cables) : null),
    // `cable` is a new object on every pointer move; its id is what decides the explanation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, cableKey, values, cables]
  );
  const list = (
    <CableList def={def} values={values} cables={cables} focusedId={cableKey} onUnplug={onUnplug} />
  );

  if (x) {
    return (
      <>
        <section aria-live="polite" className={sectionClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="kys-label flex items-center gap-1.5" style={{ color: PATCH.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: PATCH.color }} />
              Patch cable · <span className="text-(--kys-muted)">{x.kind}</span>
            </h2>
            <span className="kys-label text-(--kys-faint)">
              {x.plugged ? 'plugged in' : 'not plugged in'}
            </span>
          </div>
          <p className="kys-display mt-1 text-[15px] leading-tight">{x.title}</p>
          <Warnings list={x.warnings} className="mt-3 text-[14px]" />
          <CableStory x={x} full />
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-(--kys-muted)">
              {x.plugged
                ? 'This follows the panel: move a knob and the text updates.'
                : 'This is what the cable would do with the panel as it is now.'}
            </span>
            {x.plugged ? (
              <button
                type="button"
                onClick={() => onUnplug(x.from, x.to)}
                className="shrink-0 rounded-md border border-(--kys-line) px-2.5 py-1 text-(--kys-muted) hover:text-(--kys-text)"
              >
                Unplug
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onConnect(x.from, x.to)}
                className="shrink-0 rounded-md border border-(--kys-line) px-2.5 py-1 text-(--kys-muted) hover:text-(--kys-text)"
              >
                Plug it in
              </button>
            )}
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
    const show = (kind: 'control' | 'jack', id: string) => {
      findStore.set({ kind, id });
      focusStore.set({ kind, id, x: 0, y: 0, tip: false });
    };
    return (
      <>
        <section aria-live="polite" className={sectionClass}>
          <h2 className="kys-label flex items-center gap-1.5" style={{ color: mod.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: mod.color }} />
            Section · <span className="text-(--kys-muted)">{mod.label}</span>
          </h2>
          <p className="kys-display mt-1 text-[15px] leading-tight">{area.label}</p>
          <p className="mt-2 text-[14.5px] leading-relaxed">{area.help}</p>
          <Unusual def={def} text={area.unusual} full />
          {controls.length + jacks.length > 0 && (
            <div className="mt-3">
              <p className="kys-label text-(--kys-muted)">In this section · click one to find it</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {controls.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => show('control', k.id)}
                      className="rounded-md border border-(--kys-line) px-2 py-1 text-[13px] text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
                    >
                      {displayName(def, k)}
                    </button>
                  </li>
                ))}
                {jacks.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => show('jack', k.id)}
                      className="rounded-md border border-dashed border-(--kys-line) px-2 py-1 font-mono text-xs text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
                    >
                      {jackName(k)} {k.dir}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        {list}
      </>
    );
  }

  const item = c || j;
  if (!f || !item) {
    return (
      <>
        <section className="rounded-xl border border-dashed border-(--kys-line) p-4 text-sm text-(--kys-muted)">
          <h2 className="kys-label mb-1 text-(--kys-muted)">Control inspector</h2>
          Hover or touch any knob, switch, jack or cable on the panel. This card explains what it
          does in general, and what it is doing in the sound you have loaded. For a cable it says
          what the output carries, what the input does with it, and how the sound changes.
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
      <section aria-live="polite" className={sectionClass}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="kys-label flex items-center gap-1.5" style={{ color: mod.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: mod.color }} />
            {mod.label}
          </h2>
          {c && <span className="font-mono text-sm">{formatValue(c, values[c.id])}</span>}
        </div>
        <p className="kys-display mt-1 text-[15px] leading-tight">
          {c ? displayName(def, c) : j && `${jackName(j)} ${j.dir === 'out' ? 'output' : 'input'}`}
        </p>
        <p className="mt-2 text-[14.5px] leading-relaxed">{item.help}</p>
        <Unusual def={def} text={item.unusual} full />
        {ctxLine && (
          <p className="mt-3 rounded-lg bg-(--kys-ground) p-3 text-[14.5px] leading-relaxed">
            <span className="font-semibold text-(--kys-accent)">In this sound: </span>
            {ctxLine}
          </p>
        )}
        {differs && (
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-(--kys-muted)">
              The sound has this at{' '}
              <span className="font-mono text-(--kys-accent)">{formatValue(c, target[c.id])}</span>
            </span>
            <button
              type="button"
              onClick={() => onChange(c.id, null)}
              className="rounded-md border border-(--kys-line) px-2.5 py-1 text-(--kys-muted) hover:text-(--kys-text)"
            >
              Put it back
            </button>
          </div>
        )}
        {j && (
          <p className="mt-3 text-sm text-(--kys-muted)">
            To patch: click this jack on the panel, then hover over{' '}
            {j.dir === 'out' ? 'any input' : 'any output'} to read what that cable would do, and
            click to plug it in. Click a cable to unplug it.
          </p>
        )}
      </section>
      {list}
    </>
  );
}
