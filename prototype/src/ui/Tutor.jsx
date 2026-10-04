import { useEffect, useRef, useState } from 'react';
import { describeSynth, sanitizeCables, sanitizePreset, sanitizeSet } from '@/lib/patch.js';

const ERR = {
  not_granted: 'The tutor needs your permission to use Claude. Reload the page if you change your mind.',
  sampling_disabled: 'Claude is not available for this account, so the tutor is switched off.',
  rate_limited: 'Too many questions in a short time. Wait a moment, then ask again.',
  session_expired: 'Your session has expired. Sign in to Claude again, then ask again.',
  refused: 'Claude declined that one. Try asking it a different way.',
  invalid_json: 'The tutor’s patch came back in a form the panel could not read. Try again, or describe the sound more simply.',
  prompt_too_large: 'That was too long. Shorten the question.',
};
const copyFor = (code) => ERR[code] || 'The tutor could not answer just now. Try again.';

const intro = (def) => `You are a patient synthesiser tutor inside a learning app called KnowYourSynth. The learner is working with a software model of the ${def.maker} ${def.name} (${def.heritage}). ${def.summary}
Write plain British English. Be concrete: name controls by their PANEL LABEL, say which way to turn them and what the learner will hear. Explain why, not only what. No hype.`;

function splitAnswer(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!m) return { body: text.replace(/```(?:json)?[\s\S]*$/, '').trim(), data: null };
  let data = null;
  try { data = JSON.parse(m[1]); } catch { data = null; }
  return { body: text.replace(m[0], '').trim(), data };
}

export function Tutor({ def, values, cables, preset, onApply, onNewPreset }) {
  const [sample, setSample] = useState(undefined); // undefined = checking, null = unavailable
  const [mode, setMode] = useState('ask');
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const ctl = useRef(null);

  useEffect(() => {
    let alive = true;
    const c = window.claude;
    if (!c || typeof c.use !== 'function') { setSample(null); return undefined; }
    c.use('sample').then((s) => { if (alive) setSample(s || null); }).catch(() => alive && setSample(null));
    return () => { alive = false; };
  }, []);
  useEffect(() => { setTurns([]); setError(''); }, [def.id]);
  useEffect(() => () => ctl.current && ctl.current.abort(), []);

  const fail = (e) => {
    if (e && e.code === 'cancelled') return;
    if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(e.code)) setSample(null);
    setError(copyFor(e && e.code));
  };

  async function ask(question) {
    if (!question.trim() || busy || !sample) return;
    setBusy(true); setError(''); setLive(''); setDraft('');
    const rules = `${intro(def)}
The sound currently loaded is "${preset.name}" (${preset.ref}). ${preset.how}

${describeSynth(def, values, cables)}

Answer in under 170 words. If changing settings would help, finish with ONE fenced \`\`\`json block shaped {"set": {"<control id>": <value>}, "cables": [["<out jack id>", "<in jack id>"]]} using only ids and legal values from the tables above. Put no other JSON in the answer.`;
    const next = [...turns, { role: 'user', content: question.trim() }];
    setTurns(next);
    ctl.current = new AbortController();
    try {
      const { text } = await sample([{ role: 'user', content: rules }, ...next.slice(-8)], {
        cache: false, signal: ctl.current.signal, onText: ({ text: t }) => setLive(t),
      });
      setTurns([...next, { role: 'assistant', content: text }]);
    } catch (e) {
      if (e && e.text) setTurns([...next, { role: 'assistant', content: e.text }]);
      fail(e);
    } finally { setBusy(false); setLive(''); }
  }

  async function design(description) {
    if (!description.trim() || busy || !sample) return;
    setBusy(true); setError(''); setDraft('');
    const prompt = `${intro(def)}

${describeSynth(def, def.init, [])}
The "current value" column above is the INIT patch: a plain tone. Your steps are applied on top of it, in order.

Design a patch on this synth for the learner's description: "${description.trim().slice(0, 400)}"

Reply with only a JSON object:
{"name": string, "blurb": one sentence, "level": 1|2|3, "tags": [one of "bass","lead","pad","pluck","keys","fx","drone","perc","seq","brass","strings","wind"],
 "how": 2-4 sentences on the idea behind the sound,
 "steps": [{"title": string, "module": "osc"|"mixer"|"filter"|"env"|"amp"|"mod"|"lfo"|"glide"|"util"|"fx"|"patch", "why": one plain sentence on what the step does to the sound, then "\\n- " bullet lines, one per control ("CUTOFF 3: what it does and what to listen for"), "set": {"<control id>": value}, "cables": [["<out jack id>","<in jack id>"]]}],
 "context": {"<control id>": "In this sound, what this control is doing and what happens if you move it"},
 "tweaks": [{"id": "<control id>", "try": an action, "hear": the result}],
 "phrase": {"bpm": number, "steps": [[beat, midiNote, lengthInBeats], ...]}}
Rules: 3 to 6 steps in the order a person would build the sound (oscillators, mixer, filter, envelopes, modulation, cables, effects). Use only control ids, jack ids and legal values from the tables. Make sure the result is audible: at least one oscillator or noise source up in the mixer, the filter open enough, the amplifier envelope able to sound. The phrase is a short original riff (4 to 8 beats) that suits the sound, not a copy of any song.`;
    ctl.current = new AbortController();
    try {
      const raw = await sample.json(prompt, { cache: false, signal: ctl.current.signal });
      const p = sanitizePreset(def, raw);
      if (!p) setError(copyFor('invalid_json'));
      else onNewPreset(p);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (sample === null) {
    return (
      <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
        <h2 className="kys-label mb-1">AI tutor</h2>
        The tutor answers questions about the sound on the panel and designs new sounds from a description. It is available when this page is opened inside Claude and you allow it to use your Claude account.
      </section>
    );
  }

  const submit = (e) => { e.preventDefault(); (mode === 'ask' ? ask : design)(draft); };
  const suggestions = mode === 'ask'
    ? ['Why does this sound the way it does?', 'How do I make it darker and rounder?', 'What should I change to make it more aggressive?']
    : ['A deep, wobbling dub bass', 'A glassy bell with a long tail', 'An 80s synth-pop brass stab'];

  return (
    <section aria-labelledby="tutor-h" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tutor-h" className="kys-label text-muted">AI tutor</h2>
        <div className="flex rounded-md border border-line p-0.5 text-xs">
          {[['ask', 'Ask'], ['design', 'Design a sound']].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
              className={`rounded px-2 py-1 font-semibold ${mode === k ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
      </div>

      {mode === 'ask' && (turns.length > 0 || busy) && (
        <div className="kys-scroll flex max-h-[380px] flex-col gap-2.5 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((t, i) => {
            if (t.role === 'user') return <p key={i} className="self-end rounded-lg bg-raised px-3 py-2 text-[14px]">{t.content}</p>;
            const { body, data } = splitAnswer(t.content);
            const set = data ? sanitizeSet(def, data.set) : {};
            const cbl = data ? sanitizeCables(def, data.cables) : [];
            const can = Object.keys(set).length > 0 || cbl.length > 0;
            return (
              <div key={i} className="rounded-lg bg-ground px-3 py-2.5 text-[14px] leading-relaxed">
                <p className="whitespace-pre-wrap">{body}</p>
                {can && (
                  <button type="button" onClick={() => onApply(set, cbl)} className="mt-2 rounded-md border border-accent px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent hover:text-accent-ink">
                    Apply {Object.keys(set).length} change{Object.keys(set).length === 1 ? '' : 's'}{cbl.length ? ` + ${cbl.length} cable${cbl.length === 1 ? '' : 's'}` : ''} to the panel
                  </button>
                )}
              </div>
            );
          })}
          {busy && <p className="whitespace-pre-wrap rounded-lg bg-ground px-3 py-2.5 text-[14px] leading-relaxed">{live ? splitAnswer(live).body : 'Thinking…'}</p>}
        </div>
      )}
      {mode === 'design' && busy && <p className="rounded-lg bg-ground px-3 py-2.5 text-[14px]" aria-live="polite">Designing the patch and writing the lesson. This usually takes 20 to 60 seconds.</p>}
      {mode === 'design' && !busy && <p className="text-[14px] text-muted">Describe a sound. The tutor builds it on the {def.name}, adds it to the library and writes the step-by-step lesson. Treat the result as a starting point and trust your ears.</p>}

      {error && <p role="alert" className="rounded-lg border border-warn/50 px-3 py-2 text-[13.5px] text-warn">{error}</p>}

      {!busy && turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => <button key={s} type="button" onClick={() => setDraft(s)} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-muted hover:text-text">{s}</button>)}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="tutor-input" className="sr-only">{mode === 'ask' ? 'Question for the tutor' : 'Describe a sound'}</label>
        <input id="tutor-input" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={sample === undefined}
          placeholder={mode === 'ask' ? 'Ask about this sound…' : 'Describe the sound you want…'}
          className="min-w-0 flex-1 rounded-md border border-line bg-ground px-3 py-2 text-sm placeholder:text-faint" />
        {busy
          ? <button type="button" onClick={() => ctl.current && ctl.current.abort()} className="rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-text">Stop</button>
          : <button type="submit" disabled={!draft.trim() || !sample} className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40">{mode === 'ask' ? 'Ask' : 'Design'}</button>}
      </form>
      <p className="text-xs text-faint">Uses your own Claude account. Claude asks for permission the first time.</p>
    </section>
  );
}
