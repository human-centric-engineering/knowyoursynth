'use client';

/**
 * The lesson for the loaded sound: how it works, how to build it a step at a time, and ways to make it yours.
 *
 * Transliterated from the prototype file `src/ui/Lesson.jsx` (decision D3). The sound is the catalogue's, read from
 * the API by the page (D13). The lesson only points at the panel (through `highlightStore` and `focusStore`); the page
 * owns the panel and moves it to a step through `onStep`.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { controlMap, displayName, formatValue, jackMap } from '@/lib/app/synths/lib/patch';
import type {
  CablePair,
  ControlValue,
  Preset,
  PresetStep,
  SynthDef,
} from '@/lib/app/synths/contract';
import { focusStore, highlightStore } from '@/components/app/synth/stores';
import { LevelDots } from '@/components/app/synth/library';

/** The controls and jacks a step touches, for the panel highlight. */
export const stepIds = (s: PresetStep): string[] => [
  ...Object.keys(s.set || {}),
  ...(s.cables || []).flat(),
];

// A step's `why`: lines starting "- " are bullets, other lines are paragraphs. A short lead-in before a colon
// ("CUTOFF 3:", "Listen for:") is set in bold so the eye can find each control.
type Block = { list: true; items: string[] } | { list: false; text: string };

function StepText({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last && last.list) last.items.push(line.slice(2));
      else blocks.push({ list: true, items: [line.slice(2)] });
    } else blocks.push({ list: false, text: line });
  }
  const lead = (t: string) => {
    const m = /^([^:]{1,44}):\s(.*)$/.exec(t);
    return m ? (
      <>
        <span className="font-semibold text-(--kys-text)">{m[1]}:</span> {m[2]}
      </>
    ) : (
      t
    );
  };
  return (
    <div className="mt-2 max-w-[68ch] space-y-1.5 pl-9 text-[14.5px] leading-relaxed text-(--kys-text)/90">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="list-disc space-y-1 pl-4 marker:text-(--kys-muted)">
            {b.items.map((t, k) => (
              <li key={k}>{lead(t)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        )
      )}
    </div>
  );
}

const chipClass =
  'inline-flex items-center gap-1.5 rounded-md border border-(--kys-line) bg-(--kys-ground) px-2 py-1 text-left text-[12.5px] hover:border-(--kys-muted)';

function Chip({
  def,
  id,
  value,
  base,
}: {
  def: SynthDef;
  id: string;
  value: ControlValue;
  base: string[];
}) {
  const c = controlMap(def)[id];
  if (!c) return null;
  return (
    <button
      type="button"
      onPointerEnter={() => highlightStore.set([id])}
      onPointerLeave={() => highlightStore.set(base)}
      onFocus={() => highlightStore.set([id])}
      onBlur={() => highlightStore.set(base)}
      onClick={() => focusStore.set({ kind: 'control', id, x: 0, y: 0, tip: false })}
      className={chipClass}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: moduleOf(c.module).color }}
      />
      <span className="kys-label text-(--kys-muted)">{displayName(def, c)}</span>
      <span className="font-mono text-(--kys-text)">{formatValue(c, value)}</span>
    </button>
  );
}

function CableChip({ def, pair, base }: { def: SynthDef; pair: CablePair; base: string[] }) {
  const jm = jackMap(def);
  const [a, b] = pair;
  const from = jm[a];
  const to = jm[b];
  if (!from || !to) return null;
  return (
    <button
      type="button"
      onPointerEnter={() => highlightStore.set(pair)}
      onPointerLeave={() => highlightStore.set(base)}
      onFocus={() => highlightStore.set(pair)}
      onBlur={() => highlightStore.set(base)}
      onClick={() =>
        focusStore.set({
          kind: 'cable',
          id: pair.join('>'),
          from: a,
          to: b,
          x: 0,
          y: 0,
          tip: false,
        })
      }
      title="Explain this cable in the inspector"
      className={chipClass}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: moduleOf('patch').color }}
      />
      <span className="kys-label text-(--kys-muted)">Cable</span>
      <span className="font-mono text-(--kys-text)">
        {from.label} out → {to.label} in
      </span>
    </button>
  );
}

interface Tab {
  id: TabId;
  label: string;
  badge?: string;
}
type TabId = 'how' | 'build' | 'tweaks';

/** Accessible tab bar: arrow keys, Home and End move between tabs. */
function Tabs({
  tabs,
  current,
  onPick,
}: {
  tabs: Tab[];
  current: TabId;
  onPick: (id: TabId) => void;
}) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const move = (e: KeyboardEvent, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const k = keys[e.key];
    if (k === undefined) return;
    e.preventDefault();
    const t = tabs[(k + tabs.length) % tabs.length];
    onPick(t.id);
    refs.current[t.id]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Lesson"
      className="flex flex-wrap gap-1 border-b border-(--kys-line)"
    >
      {tabs.map((t, i) => {
        const on = t.id === current;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`lesson-tab-${t.id}`}
            aria-selected={on}
            aria-controls="lesson-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={`-mb-px flex items-baseline gap-1.5 rounded-t-md border px-3 py-2 text-sm font-semibold ${on ? 'border-(--kys-line) border-b-(--kys-ground) bg-(--kys-ground) text-(--kys-text)' : 'border-transparent text-(--kys-muted) hover:text-(--kys-text)'}`}
          >
            {t.label}
            {t.badge && (
              <span
                className={`font-mono text-xs ${on ? 'text-(--kys-accent)' : 'text-(--kys-faint)'}`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const reduced = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One step at a time in a sideways scroll-snap track, with a step bar (arrows and numbered dots) to move between
 * them. While walking through, the step in view is the step the panel is at; otherwise browsing only changes what you
 * read.
 */
function StepCarousel({
  def,
  steps,
  step,
  onStep,
  base,
  resetKey,
}: {
  def: SynthDef;
  steps: PresetStep[];
  step: number | null;
  onStep: (k: number | null) => void;
  base: string[];
  resetKey: string;
}) {
  const n = steps.length;
  const walking = step != null;
  const [view, setView] = useState(step ?? 0);
  const track = useRef<HTMLOListElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scrollTo = (i: number, smooth = true) => {
    const t = track.current;
    // `scrollTo` is missing where there is no layout (tests); the step still changes.
    if (t && typeof t.scrollTo === 'function')
      t.scrollTo({ left: i * t.clientWidth, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };
  const go = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i));
    setView(k);
    scrollTo(k);
    if (walking && k !== step) onStep(k);
  };

  // Next / Back / Finish in the header move the walkthrough; bring that step into view.
  useEffect(() => {
    if (step != null && step !== view) {
      setView(step);
      scrollTo(step);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps -- follows the walkthrough, not the reader
  // A new sound starts at its first step.
  useEffect(() => {
    const k = step ?? 0;
    setView(k);
    scrollTo(k, false);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the sound changes

  // Swiping or scrolling the track: once it comes to rest, the step in view becomes current.
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const t = track.current;
      if (!t || !t.clientWidth) return;
      const k = Math.round(t.scrollLeft / t.clientWidth);
      if (k !== view) {
        setView(k);
        if (walking && k !== step) onStep(k);
      }
    }, 140);
  };
  useEffect(() => () => clearTimeout(settle.current), []);

  const cur = steps[view] || steps[0];
  const curModule = moduleOf(cur.module);
  return (
    <div>
      <nav aria-label="Steps" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex max-w-full items-center rounded-md border border-(--kys-line) p-0.5">
          <button
            type="button"
            onClick={() => go(view - 1)}
            disabled={view === 0}
            aria-label="Previous step"
            className="h-7 w-7 shrink-0 rounded text-(--kys-muted) enabled:hover:text-(--kys-text) disabled:opacity-40"
          >
            ‹
          </button>
          <ol className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {steps.map((st, i) => {
              const m = moduleOf(st.module);
              const on = i === view;
              const todo = walking && i > step;
              return (
                <li key={i} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={on ? 'step' : undefined}
                    aria-label={`Step ${i + 1}: ${st.title}`}
                    title={st.title}
                    className={`relative flex h-7 w-7 items-center justify-center rounded font-mono text-xs font-semibold ${on ? '' : todo ? 'text-(--kys-faint) hover:text-(--kys-muted)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
                    style={on ? { background: m.color, color: '#111' } : undefined}
                  >
                    {i + 1}
                    {!on && (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-2 bottom-0.5 h-0.5 rounded-full ${todo ? 'opacity-40' : ''}`}
                        style={{ background: m.color }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => go(view + 1)}
            disabled={view === n - 1}
            aria-label="Next step"
            className="h-7 w-7 shrink-0 rounded text-(--kys-muted) enabled:hover:text-(--kys-text) disabled:opacity-40"
          >
            ›
          </button>
        </div>
        <span className="text-xs text-(--kys-muted)">
          <span className="kys-label" style={{ color: curModule.color }}>
            {curModule.label}
          </span>{' '}
          · step {view + 1} of {n}
        </span>
      </nav>
      <ol
        ref={track}
        onScroll={onScroll}
        className="kys-scroll flex snap-x snap-mandatory items-start overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {steps.map((s, i) => {
          const m = moduleOf(s.module);
          const state = !walking ? 'done' : i < step ? 'done' : i === step ? 'now' : 'todo';
          const ids = stepIds(s);
          return (
            <li
              key={i}
              aria-hidden={i !== view}
              inert={i !== view}
              className="w-full shrink-0 snap-start snap-always px-0.5"
            >
              <div
                className={`rounded-xl border p-3.5 transition-colors ${state === 'now' ? 'border-(--kys-accent) bg-(--kys-raised)' : 'border-(--kys-line) bg-(--kys-surface)'} ${state === 'todo' ? 'opacity-55' : ''}`}
                onPointerEnter={() => !walking && highlightStore.set(ids)}
                onPointerLeave={() => !walking && highlightStore.set([])}
              >
                <button
                  type="button"
                  onClick={() => onStep(i)}
                  title={walking ? undefined : 'Set the panel to this step'}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
                    style={{ background: m.color, color: '#111' }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block leading-snug font-semibold">{s.title}</span>
                    <span className="kys-label" style={{ color: m.color }}>
                      {m.label}
                    </span>
                  </span>
                </button>
                <StepText text={s.why} />
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-9">
                  {Object.entries(s.set || {}).map(([id, v]) => (
                    <Chip key={id} def={def} id={id} value={v} base={base} />
                  ))}
                  {(s.cables || []).map((p) => (
                    <CableChip key={p.join('>')} def={def} pair={p} base={base} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface LessonProps {
  def: SynthDef;
  preset: Preset;
  /** The step the panel is at, or `null` for the finished sound. */
  step: number | null;
  /** Move the panel to a step, or `null` to finish. */
  onStep: (k: number | null) => void;
}

export function Lesson({ def, preset, step, onStep }: LessonProps) {
  const n = preset.steps.length;
  const walking = step != null;
  const [picked, setPicked] = useState<TabId>('how');
  const hasTweaks = preset.tweaks.length > 0;
  // Starting a walkthrough jumps to the steps; a sound with no tweaks falls back to the overview.
  useEffect(() => {
    if (walking) setPicked('build');
  }, [walking]);
  const tab = picked === 'tweaks' && !hasTweaks ? 'how' : picked;
  const tabs: Tab[] = [
    { id: 'how', label: 'How it works' },
    { id: 'build', label: 'Build it', badge: walking ? `${step + 1}/${n}` : `${n} steps` },
    ...(hasTweaks
      ? [{ id: 'tweaks' as const, label: 'Make it yours', badge: String(preset.tweaks.length) }]
      : []),
  ];
  const current = walking ? preset.steps[step] : undefined;
  const base = current ? stepIds(current) : [];
  const baseKey = base.join('|');
  useEffect(() => {
    highlightStore.set(baseKey ? baseKey.split('|') : []);
    return () => highlightStore.set([]);
  }, [baseKey]);

  const chain: PresetStep['module'][] = [];
  preset.steps.forEach((s) => {
    if (!chain.includes(s.module)) chain.push(s.module);
  });

  const primary =
    'rounded-md bg-(--kys-accent) px-3 py-1.5 text-sm font-semibold text-(--kys-accent-ink)';
  const secondary =
    'rounded-md border border-(--kys-line) px-3 py-1.5 text-sm text-(--kys-muted) enabled:hover:text-(--kys-text) disabled:opacity-40';

  return (
    <article aria-labelledby="lesson-h" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="kys-label text-(--kys-accent)">{preset.tags[0]}</span>
          <LevelDots level={preset.level} />
          {preset.ai && (
            <span className="kys-label rounded bg-(--kys-raised) px-1.5 py-0.5 text-(--kys-muted)">
              AI designed · check by ear
            </span>
          )}
        </div>
        <h2 id="lesson-h" className="kys-display text-[22px] leading-tight text-balance">
          {preset.name}
        </h2>
        <p className="text-(--kys-muted)">{preset.ref}</p>
        <p className="max-w-[66ch] text-[15.5px]">{preset.blurb}</p>
      </header>

      <div>
        <Tabs tabs={tabs} current={tab} onPick={setPicked} />
        <div
          role="tabpanel"
          id="lesson-panel"
          aria-labelledby={`lesson-tab-${tab}`}
          className="pt-4"
        >
          {tab === 'how' && (
            <section className="rounded-xl border border-(--kys-line) bg-(--kys-surface) p-4">
              <h3 className="kys-label mb-2 text-(--kys-muted)">How this sound works</h3>
              <p className="max-w-[68ch] leading-relaxed">{preset.how}</p>
              <div
                className="mt-3 flex flex-wrap items-center gap-1.5"
                aria-label="Parts of the synth this sound uses, in order"
              >
                {chain.map((m, i) => (
                  <span key={m} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-(--kys-faint)">→</span>}
                    <span
                      className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                      style={{ borderColor: moduleOf(m).color, color: moduleOf(m).color }}
                    >
                      {moduleOf(m).label}
                    </span>
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {n > 0 && (
                  <button type="button" onClick={() => onStep(0)} className={primary}>
                    Build it step by step
                  </button>
                )}
                {hasTweaks && (
                  <button type="button" onClick={() => setPicked('tweaks')} className={secondary}>
                    Ways to make it yours
                  </button>
                )}
              </div>
            </section>
          )}

          {tab === 'build' && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="kys-label text-(--kys-muted)">Build it yourself · {n} steps</h3>
                {n > 0 && (
                  <div className="flex gap-1.5">
                    {walking ? (
                      <>
                        <button
                          type="button"
                          disabled={step === 0}
                          onClick={() => onStep(step - 1)}
                          className={secondary}
                        >
                          Back
                        </button>
                        {step < n - 1 ? (
                          <button
                            type="button"
                            onClick={() => onStep(step + 1)}
                            className={primary}
                          >
                            Next step
                          </button>
                        ) : (
                          <button type="button" onClick={() => onStep(null)} className={primary}>
                            Finish
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" onClick={() => onStep(0)} className={primary}>
                        Start from a blank patch
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="mb-3 max-w-[68ch] text-sm text-(--kys-muted)">
                {walking
                  ? 'The panel now shows the sound only as far as this step. Play the keys or the riff after each step and listen to what changed.'
                  : 'The panel is set to the finished sound. Step through to hear it come together from a plain tone, one module at a time.'}
              </p>
              {n > 0 && (
                <StepCarousel
                  def={def}
                  steps={preset.steps}
                  step={step}
                  onStep={onStep}
                  base={base}
                  resetKey={preset.id}
                />
              )}
            </section>
          )}

          {tab === 'tweaks' && (
            <section>
              <h3 className="kys-label mb-2 text-(--kys-muted)">Now make it yours</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {preset.tweaks.map((t, i) => {
                  const c = controlMap(def)[t.id];
                  if (!c) return null;
                  const color = moduleOf(c.module).color;
                  return (
                    <li
                      key={i}
                      className="rounded-xl border border-(--kys-line) bg-(--kys-surface) p-3.5"
                      onPointerEnter={() => highlightStore.set([t.id])}
                      onPointerLeave={() => highlightStore.set(base)}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          focusStore.set({ kind: 'control', id: t.id, x: 0, y: 0, tip: false })
                        }
                        className="kys-label flex items-center gap-1.5"
                        style={{ color }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                        {displayName(def, c)}
                      </button>
                      <p className="mt-1 leading-snug font-semibold">{t.try}</p>
                      <p className="mt-0.5 text-[14px] text-(--kys-muted)">{t.hear}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-sm text-(--kys-faint)">
                Moved a control and lost your place? The amber marker on each control shows where
                this sound had it. Double-click a knob to send it back.
              </p>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
