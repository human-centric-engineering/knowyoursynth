import { useEffect, useRef, useState } from 'react';
import { focusStore, highlightStore } from '@/lib/store.js';
import { moduleOf } from '@/lib/modules.js';
import { controlMap, displayName, formatValue, jackMap } from '@/lib/patch.js';
import { LevelDots } from '@/ui/Library.jsx';

const stepIds = (s) => [...Object.keys(s.set || {}), ...(s.cables || []).flat()];

// A step's `why`: lines starting "- " are bullets, other lines are paragraphs. A short lead-in before a colon
// ("CUTOFF 3:", "Listen for:") is set in bold so the eye can find each control.
function StepText({ text }) {
  const blocks = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last && last.list) last.items.push(line.slice(2)); else blocks.push({ list: true, items: [line.slice(2)] });
    } else blocks.push({ list: false, text: line });
  }
  const lead = (t) => {
    const m = /^([^:]{1,44}):\s(.*)$/.exec(t);
    return m ? <><span className="font-semibold text-text">{m[1]}:</span> {m[2]}</> : t;
  };
  return (
    <div className="mt-2 max-w-[68ch] space-y-1.5 pl-9 text-[14.5px] leading-relaxed text-text/90">
      {blocks.map((b, i) => b.list
        ? <ul key={i} className="list-disc space-y-1 pl-4 marker:text-muted">{b.items.map((t, k) => <li key={k}>{lead(t)}</li>)}</ul>
        : <p key={i}>{b.text}</p>)}
    </div>
  );
}

function Chip({ def, id, value, base }) {
  const c = controlMap(def)[id];
  if (!c) return null;
  const col = moduleOf(c.module).color;
  return (
    <button type="button"
      onPointerEnter={() => highlightStore.set([id])} onPointerLeave={() => highlightStore.set(base)}
      onFocus={() => highlightStore.set([id])} onBlur={() => highlightStore.set(base)}
      onClick={() => focusStore.set({ kind: 'control', id, tip: false })}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ground px-2 py-1 text-left text-[12.5px] hover:border-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col }} />
      <span className="font-label font-semibold uppercase tracking-wide text-muted">{displayName(def, c)}</span>
      <span className="font-mono text-text">{formatValue(c, value)}</span>
    </button>
  );
}

function CableChip({ def, pair, base }) {
  const jm = jackMap(def);
  const [a, b] = pair;
  if (!jm[a] || !jm[b]) return null;
  return (
    <button type="button" onPointerEnter={() => highlightStore.set(pair)} onPointerLeave={() => highlightStore.set(base)}
      onFocus={() => highlightStore.set(pair)} onBlur={() => highlightStore.set(base)}
      onClick={() => focusStore.set({ kind: 'cable', id: pair.join('>'), from: a, to: b, tip: false })}
      title="Explain this cable in the inspector"
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ground px-2 py-1 text-[12.5px] hover:border-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: moduleOf('patch').color }} />
      <span className="font-label font-semibold uppercase tracking-wide text-muted">Cable</span>
      <span className="font-mono text-text">{jm[a].label} out → {jm[b].label} in</span>
    </button>
  );
}

/** Accessible tab bar: arrow keys, Home and End move between tabs. */
function Tabs({ tabs, current, onPick }) {
  const refs = useRef({});
  const move = (e, i) => {
    const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (k == null) return;
    e.preventDefault();
    const t = tabs[(k + tabs.length) % tabs.length];
    onPick(t.id);
    const el = refs.current[t.id];
    if (el) el.focus();
  };
  return (
    <div role="tablist" aria-label="Lesson" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t, i) => {
        const on = t.id === current;
        return (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`lesson-tab-${t.id}`} aria-selected={on} aria-controls="lesson-panel"
            tabIndex={on ? 0 : -1} onClick={() => onPick(t.id)} onKeyDown={(e) => move(e, i)}
            className={`-mb-px flex items-baseline gap-1.5 rounded-t-md border px-3 py-2 text-sm font-semibold ${on ? 'border-line border-b-ground bg-ground text-text' : 'border-transparent text-muted hover:text-text'}`}>
            {t.label}{t.badge && <span className={`font-mono text-xs ${on ? 'text-accent' : 'text-faint'}`}>{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One step at a time in a sideways scroll-snap track, with a step bar (arrows + numbered dots) to move between them.
 * While walking through, the step in view is the step the panel is at; otherwise browsing only changes what you read.
 */
function StepCarousel({ def, steps, step, onStep, base, resetKey }) {
  const n = steps.length;
  const walking = step != null;
  const [view, setView] = useState(walking ? step : 0);
  const track = useRef(null);
  const settle = useRef(0);

  const scrollTo = (i, smooth = true) => {
    const t = track.current;
    if (t) t.scrollTo({ left: i * t.clientWidth, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };
  const go = (i) => {
    const k = Math.max(0, Math.min(n - 1, i));
    setView(k);
    scrollTo(k);
    if (walking && k !== step) onStep(k);
  };

  // Next / Back / Finish in the header move the walkthrough; bring that step into view.
  useEffect(() => { if (walking && step !== view) { setView(step); scrollTo(step); } }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new sound starts at its first step.
  useEffect(() => { const k = walking ? step : 0; setView(k); scrollTo(k, false); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swiping or scrolling the track: once it comes to rest, the step in view becomes current.
  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const t = track.current;
      if (!t || !t.clientWidth) return;
      const k = Math.round(t.scrollLeft / t.clientWidth);
      if (k !== view) { setView(k); if (walking && k !== step) onStep(k); }
    }, 140);
  };
  useEffect(() => () => clearTimeout(settle.current), []);

  const cur = steps[view] || steps[0];
  return (
    <div>
      <nav aria-label="Steps" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex max-w-full items-center rounded-md border border-line p-0.5">
          <button type="button" onClick={() => go(view - 1)} disabled={view === 0} aria-label="Previous step"
            className="h-7 w-7 shrink-0 rounded text-muted enabled:hover:text-text disabled:opacity-40">‹</button>
          <ol className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {steps.map((st, i) => {
              const m = moduleOf(st.module);
              const on = i === view;
              const todo = walking && i > step;
              return (
                <li key={i} className="shrink-0">
                  <button type="button" onClick={() => go(i)} aria-current={on ? 'step' : undefined} aria-label={`Step ${i + 1}: ${st.title}`} title={st.title}
                    className={`relative flex h-7 w-7 items-center justify-center rounded font-mono text-xs font-semibold ${on ? '' : todo ? 'text-faint hover:text-muted' : 'text-muted hover:text-text'}`}
                    style={on ? { background: m.color, color: '#111' } : undefined}>
                    {i + 1}
                    {!on && <span aria-hidden="true" className={`absolute inset-x-2 bottom-0.5 h-0.5 rounded-full ${todo ? 'opacity-40' : ''}`} style={{ background: m.color }} />}
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => go(view + 1)} disabled={view === n - 1} aria-label="Next step"
            className="h-7 w-7 shrink-0 rounded text-muted enabled:hover:text-text disabled:opacity-40">›</button>
        </div>
        <span className="text-xs text-muted"><span className="kys-label" style={{ color: moduleOf(cur.module).color }}>{moduleOf(cur.module).label}</span> · step {view + 1} of {n}</span>
      </nav>
      <ol ref={track} onScroll={onScroll} className="kys-scroll flex snap-x snap-mandatory items-start overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {steps.map((s, i) => {
          const m = moduleOf(s.module);
          const state = !walking ? 'done' : i < step ? 'done' : i === step ? 'now' : 'todo';
          const ids = stepIds(s);
          return (
            <li key={i} aria-hidden={i !== view} inert={i !== view ? true : undefined} className="w-full shrink-0 snap-start snap-always px-0.5">
              <div className={`rounded-xl border p-3.5 transition-colors ${state === 'now' ? 'border-accent bg-raised' : 'border-line bg-surface'} ${state === 'todo' ? 'opacity-55' : ''}`}
                onPointerEnter={() => !walking && highlightStore.set(ids)} onPointerLeave={() => !walking && highlightStore.set([])}>
                <button type="button" onClick={() => onStep(i)} title={walking ? undefined : 'Set the panel to this step'} className="flex w-full items-start gap-3 text-left">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold" style={{ background: m.color, color: '#111' }}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{s.title}</span>
                    <span className="kys-label" style={{ color: m.color }}>{m.label}</span>
                  </span>
                </button>
                <StepText text={s.why} />
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-9">
                  {Object.entries(s.set || {}).map(([id, v]) => <Chip key={id} def={def} id={id} value={v} base={base} />)}
                  {(s.cables || []).map((p) => <CableChip key={p.join('>')} def={def} pair={p} base={base} />)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Lesson({ def, preset, step, onStep, onTry }) {
  const n = preset.steps.length;
  const walking = step != null;
  const [picked, setPicked] = useState('how');
  const hasTweaks = !!(preset.tweaks && preset.tweaks.length);
  // Starting a walkthrough jumps to the steps; a sound with no tweaks falls back to the overview.
  useEffect(() => { if (walking) setPicked('build'); }, [walking]);
  const tab = picked === 'tweaks' && !hasTweaks ? 'how' : picked;
  const pick = setPicked;
  const tabs = [
    { id: 'how', label: 'How it works' },
    { id: 'build', label: 'Build it', badge: walking ? `${step + 1}/${n}` : `${n} steps` },
    ...(hasTweaks ? [{ id: 'tweaks', label: 'Make it yours', badge: String(preset.tweaks.length) }] : []),
  ];
  const base = walking ? stepIds(preset.steps[step]) : [];
  const baseKey = base.join('|');
  useEffect(() => {
    highlightStore.set(base);
    return () => highlightStore.set([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const chain = [];
  preset.steps.forEach((s) => { if (!chain.includes(s.module)) chain.push(s.module); });

  return (
    <article aria-labelledby="lesson-h" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="kys-label text-accent">{preset.tags[0]}</span>
          <LevelDots level={preset.level} />
          {preset.ai && <span className="kys-label rounded bg-raised px-1.5 py-0.5 text-muted">AI designed · check by ear</span>}
        </div>
        <h2 id="lesson-h" className="font-display text-[22px] leading-tight text-balance">{preset.name}</h2>
        <p className="text-muted">{preset.ref}</p>
        <p className="max-w-[66ch] text-[15.5px]">{preset.blurb}</p>
      </header>

      <div>
      <Tabs tabs={tabs} current={tab} onPick={pick} />
      <div role="tabpanel" id="lesson-panel" aria-labelledby={`lesson-tab-${tab}`} className="pt-4">
      {tab === 'how' && (
      <section className="rounded-xl border border-line bg-surface p-4">
        <h3 className="kys-label mb-2 text-muted">How this sound works</h3>
        <p className="max-w-[68ch] leading-relaxed">{preset.how}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Parts of the synth this sound uses, in order">
          {chain.map((m, i) => (
            <span key={m} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-faint">→</span>}
              <span className="rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: moduleOf(m).color, color: moduleOf(m).color }}>{moduleOf(m).label}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => onStep(0)} className="rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-ink">Build it step by step</button>
          {hasTweaks && <button type="button" onClick={() => setPicked('tweaks')} className="rounded-md border border-line px-3 py-1.5 text-muted hover:text-text">Ways to make it yours</button>}
        </div>
      </section>
      )}

      {tab === 'build' && (
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="kys-label text-muted">Build it yourself · {n} steps</h3>
          <div className="flex gap-1.5">
            {walking ? (
              <>
                <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} className="rounded-md border border-line px-3 py-1.5 text-sm text-muted enabled:hover:text-text disabled:opacity-40">Back</button>
                {step < n - 1
                  ? <button type="button" onClick={() => onStep(step + 1)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Next step</button>
                  : <button type="button" onClick={() => onStep(null)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Finish</button>}
              </>
            ) : (
              <button type="button" onClick={() => onStep(0)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Start from a blank patch</button>
            )}
          </div>
        </div>
        <p className="mb-3 max-w-[68ch] text-sm text-muted">
          {walking
            ? 'The panel now shows the sound only as far as this step. Play the keys or the riff after each step and listen to what changed.'
            : 'The panel is set to the finished sound. Step through to hear it come together from a plain tone, one module at a time.'}
        </p>
        <StepCarousel def={def} steps={preset.steps} step={step} onStep={onStep} base={base} resetKey={preset.id} />
      </section>
      )}

      {tab === 'tweaks' && (
        <section>
          <h3 className="kys-label mb-2 text-muted">Now make it yours</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {preset.tweaks.map((t, i) => {
              const c = controlMap(def)[t.id];
              if (!c) return null;
              return (
                <li key={i} className="rounded-xl border border-line bg-surface p-3.5"
                  onPointerEnter={() => highlightStore.set([t.id])} onPointerLeave={() => highlightStore.set(base)}>
                  <button type="button" onClick={() => { focusStore.set({ kind: 'control', id: t.id, tip: false }); onTry && onTry(t.id); }}
                    className="kys-label flex items-center gap-1.5" style={{ color: moduleOf(c.module).color }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: moduleOf(c.module).color }} />{displayName(def, c)}
                  </button>
                  <p className="mt-1 font-semibold leading-snug">{t.try}</p>
                  <p className="mt-0.5 text-[14px] text-muted">{t.hear}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm text-faint">Moved a control and lost your place? The amber marker on each control shows where this sound had it. Double-click a knob to send it back.</p>
        </section>
      )}
      </div>
      </div>
    </article>
  );
}
