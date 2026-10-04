import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SYNTHS, synthById } from '@/synths/index.js';
import { Engine } from '@/audio/engine.js';
import { SynthPanel } from '@/panel/SynthPanel.jsx';
import { Keyboard, QWERTY } from '@/ui/Keyboard.jsx';
import { HarmonicsStrip, Scope, ScopeDialog } from '@/ui/Scope.jsx';
import { Library } from '@/ui/Library.jsx';
import { Lesson } from '@/ui/Lesson.jsx';
import { Inspector, Tooltip } from '@/ui/Inspector.jsx';
import { Tour } from '@/ui/Tour.jsx';
import { Tutor } from '@/ui/Tutor.jsx';
import { Lineage } from '@/ui/Lineage.jsx';
import { Bank } from '@/ui/Bank.jsx';
import { Limits } from '@/ui/Limits.jsx';
import { SynthPicker } from '@/ui/SynthPicker.jsx';
import { Search } from '@/ui/Search.jsx';
import { FxRack } from '@/ui/FxRack.jsx';
import { MapLegend, WhyAsker } from '@/ui/SoundMap.jsx';
import { createMapper, probeNotes } from '@/lib/soundmap.js';
import { normalizeFx } from '@/audio/fx.js';
import { predict } from '@/lib/predict.js';
import { useMidi } from '@/lib/midi.js';
import { cablesToEngine, presetState } from '@/lib/patch.js';
import { modularDef } from '@/lib/layout.js';
import { CABLE_COLORS } from '@/lib/modules.js';
import { createStore, findStore, focusStore, MAP_OFF, mapStore, meterStore, notesStore } from '@/lib/store.js';

const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// The page host may stamp its own theme on <html>; "Auto" goes back to that (or to the system setting).
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

function freshSession(def, presetId) {
  const preset = def.presets.find((p) => p.id === presetId) || def.presets[0];
  return { presetId: preset.id, step: null, ...presetState(def, preset) };
}

const PANEL_HELP = [
  ['Knobs', 'Drag up or down to turn. Hold Shift for fine moves. Double-click to put it back where the sound had it.'],
  ['Sliders', 'Drag along the slot. Hold Shift for fine moves. Double-click to put it back where the sound had it.'],
  ['Switches', 'Click to change.'],
  ['Plug in a cable', 'Click a jack, then point at another to read what that cable would do. Click to plug it in. Move off the panel or press Esc to drop it.'],
  ['Move a cable', 'Drag the plug at either end to another jack.'],
  ['Unplug a cable', 'Click the cable.'],
];

const PLAY_HELP = [
  ['Mouse or touch', 'Click or tap the keys on screen.'],
  ['Computer keys', 'A W S E D F T G Y H U J K play notes. Z and X change octave.'],
  ['MIDI keyboard', 'Click Connect MIDI, then play a USB or Bluetooth keyboard. Notes and the mod wheel both work. Works in Chrome and Edge. Claude’s artifact viewer does not allow MIDI, so it only works when this page is opened on its own.'],
  ['Play riff', 'Plays a short original phrase that suits the sound.'],
];

/** "?" button that opens instructions in a dialog, instead of a paragraph taking up space on the page. */
function HelpButton({ title, items }) {
  const ref = useRef(null);
  const hid = useId();
  return (
    <>
      <button type="button" onClick={() => ref.current && ref.current.showModal()} aria-label={title} title={title}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface font-semibold text-muted hover:border-muted hover:text-text">?</button>
      <dialog ref={ref} aria-labelledby={hid} onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-xl border border-line bg-raised p-0 text-text shadow-2xl backdrop:bg-black/50">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id={hid} className="kys-label text-muted">{title}</h2>
            <button type="button" onClick={() => ref.current.close()} aria-label="Close" className="px-1 text-lg leading-none text-muted hover:text-text">×</button>
          </div>
          <dl className="mt-3 flex flex-col gap-2.5 text-sm">
            {items.map(([t, d]) => (
              <div key={t}><dt className="font-semibold">{t}</dt><dd className="leading-snug text-muted">{d}</dd></div>
            ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}

/**
 * The three looks a panel switch can have. `start` is the one button that begins something rather than toggling
 * a view, so it is outlined in the accent colour even when it is off.
 */
const TONES = {
  start: ['border-accent bg-accent text-accent-ink', 'border-accent bg-surface text-accent hover:bg-accent hover:text-accent-ink'],
  view: ['border-accent bg-accent text-accent-ink', 'border-line bg-surface text-muted hover:text-text'],
  quiet: ['border-line bg-surface text-text hover:border-muted', 'border-line bg-surface text-muted hover:text-text'],
};

/**
 * One of the switches over the faceplate. The full row of them needs about 1070px, so under `xl` each falls back
 * to a shorter label; the full wording stays in the tooltip and in the accessible name at every width, and each
 * short label is a substring of the long one so speaking the visible text still works.
 */
function PanelSwitch({ label, short, title, on, tone = 'view', onClick }) {
  const [onCls, offCls] = TONES[tone];
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={title} onClick={onClick}
      className={`rounded-md border px-2 py-1.5 font-semibold sm:px-2.5 ${on ? onCls : offCls}`}>
      <span className="xl:hidden">{short}</span>
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function MidiStatus({ midi, onConnect }) {
  const { status, devices } = midi;
  const note = {
    off: '',
    asking: 'Waiting for the browser to allow MIDI…',
    on: devices.length ? `Listening to ${devices.join(', ')}` : 'MIDI is on, but no keyboard is connected. Plug one in and it is picked up straight away.',
    unsupported: 'This browser has no MIDI support. Chrome and Edge on a computer do; Safari does not.',
    frame: 'MIDI keyboards cannot connect inside Claude’s artifact viewer. It does not pass MIDI permission through to the page.',
    blocked: 'MIDI was not allowed. If you did not see a browser prompt, the page this is shown in does not permit MIDI.',
  }[status];
  return (
    <div className="flex items-center gap-2 text-xs">
      {note && <span className={`max-w-[46ch] text-right ${status === 'blocked' ? 'text-warn' : status === 'on' && devices.length ? 'text-good' : 'text-faint'}`}>{note}</span>}
      {status === 'on'
        ? <button type="button" onClick={midi.disconnect} className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 font-semibold text-muted hover:text-text">Stop MIDI</button>
        : status !== 'unsupported' && status !== 'frame' && <button type="button" onClick={onConnect} disabled={status === 'asking'} className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 font-semibold text-muted hover:text-text disabled:opacity-40">{status === 'blocked' ? 'Try MIDI again' : 'Connect MIDI'}</button>}
    </div>
  );
}

export default function App() {
  const [synthId, setSynthId] = useState(() => {
    const hash = typeof location !== 'undefined' ? location.hash.replace('#', '').split('/')[0] : '';
    return synthById(SYNTHS.some((s) => s.id === hash) ? hash : load('kys.synth', 'model-d')).id;
  });
  const [aiPresets, setAiPresets] = useState(() => load('kys.ai', {}));
  const [sessions, setSessions] = useState(() => Object.fromEntries(SYNTHS.map((s) => [s.id, freshSession(s)])));
  const [outline, setOutline] = useState(() => (typeof location !== 'undefined' && location.hash.includes('/outline')) || load('kys.outline', false));
  // Synths with a `modular` layout show it by default; the long keyboard faceplate is one press away (and `#id/long`).
  const [long, setLong] = useState(() => (typeof location !== 'undefined' && location.hash.includes('/long')) || load('kys.long', false));
  const [audio, setAudio] = useState('off'); // off | starting | on | error
  const [playing, setPlaying] = useState(false);
  const [wheel, setWheel] = useState(0);
  const [octave, setOctave] = useState(0);
  const [hold, setHold] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [zoom, setZoom] = useState(0); // magnifier: 0 = off, else the enlargement
  const [areasOn, setAreasOn] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [tipsOn, setTipsOn] = useState(() => load('kys.tips', true) !== false);
  const [dimOn, setDimOn] = useState(() => load('kys.dim', false) === true);
  const [heatOn, setHeatOn] = useState(() => load('kys.heat', false) === true);
  const [harmOn, setHarmOn] = useState(() => load('kys.harm', false) === true);
  const [lineageOpen, setLineageOpen] = useState(false);
  // The databank opens from the header, from an artist in a synth's "Heard on" list, or from a `#bank/<tab>/<id>` link.
  const [bankOpen, setBankOpen] = useState(() => typeof location !== 'undefined' && location.hash.startsWith('#bank'));
  const [bankRoute, setBankRoute] = useState(() => {
    const [, tab, id] = (typeof location !== 'undefined' ? location.hash.replace('#', '') : '').split('/');
    return { tab: ['artists', 'makers', 'songs', 'instruments'].includes(tab) ? tab : 'artists', id };
  });
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [theme, setTheme] = useState(() => { const t = load('kys.theme', 'auto'); return THEMES.some(([k]) => k === t) ? t : 'auto'; });
  useEffect(() => {
    const root = document.documentElement;
    const t = theme === 'auto' ? HOST_THEME : theme;
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  }, [theme]);
  const [fx, setFx] = useState(() => normalizeFx(load('kys.fx', null)));

  const synthDef = synthById(synthId);
  // The panel as drawn. Only positions differ from `synthDef`; the sound map works from `synthDef`, so it gives the same
  // answers whichever layout is showing.
  const def = useMemo(() => (long ? synthDef : modularDef(synthDef)), [synthDef, long]);
  const sess = sessions[synthId];
  const presets = useMemo(() => [...def.presets, ...((aiPresets[synthId] || []))], [def, aiPresets, synthId]);
  const preset = presets.find((p) => p.id === sess.presetId) || presets[0];
  const target = useMemo(() => presetState(def, preset).values, [def, preset]);
  const patch = (fn) => setSessions((all) => ({ ...all, [synthId]: fn(all[synthId]) }));

  // ── audio ──
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new Engine((e) => {
      if (e.type === 'meter') meterStore.set((m) => ({ ...m, gate: e.gate, lfo: e.lfo, overload: e.overload, voices: e.voices || 0, env1: e.env1 || 0, seq: e.seq == null ? -1 : e.seq, pulser: e.pulser || 0 }));
      else if (e.type === 'note') notesStore.set((ns) => (e.on ? (ns.includes(e.n) ? ns : [...ns, e.n]) : ns.filter((n) => n !== e.n)));
      else if (e.type === 'allOff') notesStore.set([]);
      else if (e.type === 'phraseEnd') setPlaying(false);
    });
  }
  const engine = engineRef.current;
  useEffect(() => { engine.setFx(fx); }, [engine, fx]);
  const changeFx = (next) => { setFx(next); save('kys.fx', next); };

  const ensureAudio = useCallback(async () => {
    if (engine.running) return true;
    setAudio('starting');
    try {
      await (engine.ctx ? engine.resume() : engine.start());
      setAudio('on');
      meterStore.set((m) => ({ ...m, power: true }));
      return true;
    } catch {
      setAudio('error');
      return false;
    }
  }, [engine]);

  useEffect(() => {
    try {
      const patched = Object.fromEntries(sess.cables.flatMap((c) => [[c.to, true], [c.from, true]]));
      const p = synthDef.toEngine(sess.values, { wheel, patched });
      p.cables = cablesToEngine(synthDef, sess.cables, sess.values);
      p.wheel = wheel;
      engine.send({ type: 'params', p });
      setEngineError('');
    } catch (err) {
      setEngineError(String(err && err.message ? err.message : err));
    }
  }, [synthDef, sess.values, sess.cables, wheel, engine]);

  // Where the harmonics strip draws its dashed line. One toEngine() call — the same one the voice gets — so it keeps
  // up with a knob being dragged. waveStory's attribution is hundreds of calls and stays in the dialog.
  const cutoffNow = useMemo(() => {
    if (!harmOn) return null;
    try {
      const patched = Object.fromEntries(sess.cables.flatMap((c) => [[c.to, true], [c.from, true]]));
      const p = synthDef.toEngine(sess.values, { wheel, patched });
      return p.filter ? p.filter.cutoff : null;
    } catch { return null; } // the panel already reports the error
  }, [harmOn, synthDef, sess.values, sess.cables, wheel]);
  // A fresh identity whenever the panel moves, so the scope can hold the shape from just before the move.
  const traceKey = useMemo(() => ({}), [sess.values, sess.cables, wheel]);
  // Filled by the small scope strip's measuring pass, read by the big view to number the harmonics.
  const measureRef = useRef(null);
  if (!measureRef.current) measureRef.current = createStore({ freq: 0, peak: 0, rms: 0, centroid: 0, ms: 0 });

  // The predicted wave and harmonics: one note rendered through the synth model offline, so the graphs show this
  // patch whether or not anything is playing. About 10 ms — too much for every frame of a knob drag, so it waits
  // for a short gap in the moving. That reads as live without the drag itself stuttering.
  const [pred, setPred] = useState(null);
  useEffect(() => {
    if (!harmOn) { setPred(null); return undefined; }
    const t = setTimeout(() => setPred(predict(synthDef, sess.values, sess.cables, wheel)), 60);
    return () => clearTimeout(t);
  }, [harmOn, synthDef, sess.values, sess.cables, wheel]);

  // ── sound map: which controls are in the sound, and which it is most sensitive to ──
  const mapperRef = useRef(null);
  useEffect(() => () => { if (mapperRef.current) mapperRef.current.dispose(); mapperRef.current = null; }, []);
  const mapOn = dimOn || heatOn;
  const soundKey = `${synthId}/${preset.id}/${sess.step}`;
  useEffect(() => {
    if (!mapOn) { if (mapperRef.current) mapperRef.current.cancel(); mapStore.set(MAP_OFF); return undefined; }
    if (!mapperRef.current) mapperRef.current = createMapper();
    // A map of another sound says nothing about this one, so it goes at once. After a knob move the old map stays up until the new one is ready.
    mapStore.set((m) => (m.key === soundKey ? { ...m, status: 'working' } : { ...MAP_OFF, status: 'working', key: soundKey }));
    const t = setTimeout(() => {
      try {
        mapperRef.current.analyse(synthDef, sess.values, sess.cables, wheel, probeNotes(preset),
          (progress) => mapStore.set((m) => (m.state ? m : { ...m, progress })),
          (res) => mapStore.set({ status: 'ready', progress: 1, key: soundKey, why: {}, ...res }));
      } catch { mapStore.set(MAP_OFF); } // toEngine threw: the panel already reports that
    }, 300);
    return () => clearTimeout(t);
  }, [mapOn, synthDef, sess.values, sess.cables, wheel, preset, soundKey]);

  const heldRef = useRef(new Set());
  const noteOn = useCallback((n, v = 0.85) => {
    ensureAudio();
    if (hold) { heldRef.current.forEach((h) => engine.send({ type: 'noteOff', n: h })); heldRef.current.clear(); heldRef.current.add(n); }
    engine.send({ type: 'noteOn', n, v });
  }, [engine, ensureAudio, hold]);
  const noteOff = useCallback((n) => { if (!hold) engine.send({ type: 'noteOff', n }); }, [engine, hold]);
  const setHoldMode = (h) => { setHold(h); if (!h) { heldRef.current.forEach((n) => engine.send({ type: 'noteOff', n })); heldRef.current.clear(); } };

  const rememberMidi = useCallback((v) => save('kys.midi', v), []);
  const loadMidi = useCallback(() => load('kys.midi', false) === true, []);
  const midi = useMidi({ noteOn, noteOff, onWheel: setWheel, remember: rememberMidi, load: loadMidi });
  // The browser only starts sound after a click, so connecting MIDI also turns the sound on.
  const connectMidi = () => { ensureAudio(); midi.connect(); };

  // SynthDef `tempo` names the control whose value is the riff's BPM (the TB-303's TEMPO knob): the riff plays at
  // that speed, and turning it while the riff plays moves the riff with it.
  const tempoBpm = def.tempo ? sess.values[def.tempo] : null;
  const tempoRef = useRef(tempoBpm);
  tempoRef.current = tempoBpm;
  useEffect(() => { if (tempoBpm) engine.send({ type: 'tempo', bpm: tempoBpm }); }, [engine, tempoBpm]);
  const stopRiff = useCallback(() => { engine.send({ type: 'stopPhrase' }); setPlaying(false); }, [engine]);
  const playRiff = useCallback(async (ph) => {
    await ensureAudio();
    engine.send({ type: 'phrase', phrase: tempoRef.current ? { ...ph, bpm: tempoRef.current } : ph });
    setPlaying(true);
  }, [engine, ensureAudio]);

  // computer keyboard
  useEffect(() => {
    const downKeys = new Set();
    const typing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    const kd = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k in QWERTY && !downKeys.has(k)) { downKeys.add(k); noteOn(48 + octave * 12 + QWERTY[k]); }
      else if (k === 'z') setOctave((o) => Math.max(-1, o - 1));
      else if (k === 'x') setOctave((o) => Math.min(2, o + 1));
    };
    const ku = (e) => {
      const k = e.key.toLowerCase();
      if (downKeys.delete(k)) noteOff(48 + octave * 12 + QWERTY[k]);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [noteOn, noteOff, octave]);

  // ── actions ──
  const onChange = useCallback((id, v) => {
    setSessions((all) => {
      const s = all[synthId];
      const d = synthById(synthId);
      const nv = v === null ? (presetState(d, [...d.presets, ...((aiPresets[synthId]) || [])].find((p) => p.id === s.presetId)).values[id]) : v;
      if (s.values[id] === nv) return all;
      return { ...all, [synthId]: { ...s, values: { ...s.values, [id]: nv } } };
    });
  }, [synthId, aiPresets]);

  const onConnect = useCallback((from, to) => patch((s) => (s.cables.some((c) => c.from === from && c.to === to) ? s
    : { ...s, cables: [...s.cables, { from, to, color: CABLE_COLORS[s.cables.length % CABLE_COLORS.length] }] })), [synthId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRemoveCable = useCallback((i) => patch((s) => ({ ...s, cables: s.cables.filter((_, k) => k !== i) })), [synthId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Move one end of a connected cable to another jack. A move that would duplicate an existing cable is ignored.
  const onMoveCable = useCallback((i, end, jackId) => patch((s) => {
    const cb = s.cables[i];
    if (!cb) return s;
    const next = { ...cb, [end]: jackId };
    if (s.cables.some((c, k) => k !== i && c.from === next.from && c.to === next.to)) return s;
    return { ...s, cables: s.cables.map((c, k) => (k === i ? next : c)) };
  }), [synthId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onUnplug = useCallback((from, to) => patch((s) => ({ ...s, cables: s.cables.filter((c) => !(c.from === from && c.to === to)) })), [synthId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    focusStore.set(null);
    patch(() => ({ presetId: id, step: null, ...presetState(def, p) }));
    if (playing) playRiff(p.phrase);
  };
  const setStep = (k) => patch((s) => ({ ...s, step: k, ...presetState(def, preset, k == null ? undefined : k) }));
  const switchSynth = (id) => {
    engine.send({ type: 'panic' });
    setPlaying(false);
    heldRef.current.clear();
    focusStore.set(null);
    findStore.set(null);
    setTourOn(false);
    setSynthId(id);
    save('kys.synth', id);
  };
  // From the databank: open another synth's panel, or load one of its sounds.
  const openSynth = (id) => { if (id !== synthId) switchSynth(id); setBankOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const loadSound = (id, presetId) => {
    openSynth(id);
    setSessions((all) => ({ ...all, [id]: freshSession(synthById(id), presetId) }));
  };
  const openArtist = (id) => { setLineageOpen(false); setBankRoute({ tab: 'artists', id }); setBankOpen(true); };
  const applyFromTutor = (set, cbl) => patch((s) => {
    const cables = [...s.cables];
    cbl.forEach(([from, to]) => { if (!cables.some((c) => c.from === from && c.to === to)) cables.push({ from, to, color: CABLE_COLORS[cables.length % CABLE_COLORS.length] }); });
    return { ...s, values: { ...s.values, ...set }, cables };
  });
  const addAiPreset = (p) => {
    setAiPresets((all) => { const next = { ...all, [synthId]: [...(all[synthId] || []), p].slice(-12) }; save('kys.ai', next); return next; });
    patch(() => ({ presetId: p.id, step: null, ...presetState(def, p) }));
  };

  const changed = def.controls.filter((c) => sess.step == null && sess.values[c.id] !== target[c.id]).length;
  const toggleAudio = async () => {
    if (audio === 'on') { setPlaying(false); await engine.suspend(); setAudio('off'); meterStore.set((m) => ({ ...m, power: false, gate: false })); notesStore.set([]); } else ensureAudio();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[1720px] flex-col gap-5 px-4 pb-10 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[19px] tracking-wide">Know<span className="text-accent">Your</span>Synth</h1>
          <span className="hidden text-sm text-muted md:inline">Learn sound design on the hardware you own</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SynthPicker synthId={synthId} onSelect={switchSynth} />
          <button type="button" onClick={() => setBankOpen(true)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted hover:border-muted hover:text-text">Artists &amp; innovators</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="group" aria-label="Colour theme">
          {THEMES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={theme === k} onClick={() => { setTheme(k); save('kys.theme', k); }}
              title={k === 'auto' ? 'Follow your system (or Claude) setting' : `${l} theme`}
              className={`rounded-md px-2.5 py-1.5 font-semibold ${theme === k ? 'bg-text text-ground' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={toggleAudio} aria-pressed={audio === 'on'}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${audio === 'on' ? 'border-good/60 text-good' : 'border-line text-muted hover:text-text'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${audio === 'on' ? 'bg-good' : audio === 'error' ? 'bg-warn' : 'bg-faint'}`} />
          {audio === 'on' ? 'Sound on' : audio === 'starting' ? 'Starting…' : audio === 'error' ? 'Sound unavailable' : 'Turn sound on'}
        </button>
        </div>
      </header>

      <section aria-label={`${def.name} panel`} className="kys-stage rounded-2xl border border-line p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="kys-label flex flex-wrap items-baseline gap-x-2 text-faint">{def.maker} {def.name} · {def.heritage}
              {def.lineage && <button type="button" onClick={() => setLineageOpen(true)} className="kys-label text-accent underline-offset-2 hover:underline">History ›</button>}
              <button type="button" onClick={() => setLimitsOpen(true)} className="kys-label text-accent underline-offset-2 hover:underline">What is not modelled ›</button>
            </p>
            <p className="truncate text-[15px]"><span className="text-muted">Loaded: </span><span className="font-semibold">{preset.name}</span>
              {sess.step != null && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-accent-ink">step {sess.step + 1} of {preset.steps.length}</span>}
              {changed > 0 && <span className="ml-2 text-sm text-accent">{changed} control{changed === 1 ? '' : 's'} moved</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {changed > 0 && <button type="button" onClick={() => selectPreset(preset.id)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-muted hover:text-text">Restore sound</button>}
            <button type="button" onClick={() => patch((s) => ({ ...s, values: { ...def.init }, cables: [] }))} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-muted hover:text-text">Blank patch</button>
            {sess.cables.length > 0 && <button type="button" onClick={() => patch((s) => ({ ...s, cables: [] }))} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-muted hover:text-text">Unplug all</button>}
            {synthDef.modular && (
              <div className="flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Panel layout"
                title="Modular: the sections stacked as modules, easier to read on a small screen. Long: the faceplate as it is on the keyboard.">
                {[[false, 'Modular'], [true, 'Long']].map(([v, l]) => (
                  <button key={l} type="button" aria-pressed={long === v} onClick={() => { setLong(v); save('kys.long', v); }}
                    className={`rounded px-2.5 py-1 font-semibold ${long === v ? 'bg-text text-ground' : 'text-muted hover:text-text'}`}>{l}</button>
                ))}
              </div>
            )}
            <div className="flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Panel view">
              {[[false, 'Hardware'], [true, 'Outline']].map(([v, l]) => (
                <button key={l} type="button" aria-pressed={outline === v} onClick={() => { setOutline(v); save('kys.outline', v); }}
                  className={`rounded px-2.5 py-1 font-semibold ${outline === v ? 'bg-text text-ground' : 'text-muted hover:text-text'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Search def={def} />
          <div className="flex flex-wrap items-center gap-1.5 text-sm sm:gap-2">
            <PanelSwitch label="Orientation tour" short="Tour" tone="start" on={tourOn}
              title={`A guided walk round the ${def.name}: what its words mean, then every section in the order the sound passes through it. It changes nothing on the panel.`}
              onClick={() => { setTourOn(!tourOn); setAreasOn(false); findStore.set(null); }} />
            <PanelSwitch label="Explain sections" short="Sections" on={areasOn}
              title="Colour in every named part of the panel, and explain what it does when you point at it."
              onClick={() => { setAreasOn(!areasOn); setTourOn(false); findStore.set(null); focusStore.set((f) => (f && f.kind === 'area' ? null : f)); }} />
            <PanelSwitch label="Dim unused parts" short="Dim unused" on={dimOn}
              title="Darken every part of the panel that is not part of the sound as it is set now. Point at a dark control to see what would bring it in."
              onClick={() => { setDimOn(!dimOn); save('kys.dim', !dimOn); }} />
            <PanelSwitch label="Show sensitive controls" short="Sensitive" on={heatOn}
              title="Put a glow behind the controls where a small move changes the sound most. The bigger and stronger the glow, the more effect. The three strongest are numbered."
              onClick={() => { setHeatOn(!heatOn); save('kys.heat', !heatOn); }} />
            <PanelSwitch label="Show harmonics" short="Harmonics" on={harmOn}
              title="Show the wave and the harmonics of this patch under the panel, worked out by rendering a note through the synth model. No sound need be playing; turn a knob and both redraw."
              onClick={() => { setHarmOn(!harmOn); save('kys.harm', !harmOn); }} />
            <PanelSwitch label={`Info cards: ${tipsOn ? 'on' : 'off'}`} short={`Cards: ${tipsOn ? 'on' : 'off'}`} tone="quiet" on={tipsOn}
              title="Show or hide the pop-up card when you point at a knob, switch, jack or cable. The inspector on the right always explains it."
              onClick={() => { setTipsOn(!tipsOn); save('kys.tips', !tipsOn); }} />
            <HelpButton title="How to use the panel" items={PANEL_HELP} />
            <div className="flex items-center rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Magnifier">
              <span className="px-1.5 text-muted sm:px-2"><span className="xl:hidden">Zoom</span><span className="hidden xl:inline">Magnify</span></span>
              {[[0, 'Off'], [2, '2×'], [3, '3×']].map(([z, l]) => (
                <button key={l} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}
                  className={`rounded px-2 py-1 font-semibold sm:px-2.5 ${zoom === z ? 'bg-text text-ground' : 'text-muted hover:text-text'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="kys-scroll overflow-x-auto pb-2">
          <div className={`mx-auto max-w-[1560px] ${def.layout ? '' : 'min-w-[920px]'} ${outline ? '' : 'kys-synth-shadow'}`}
            style={def.layout ? { minWidth: Math.min(920, Math.round(def.view.w * 0.2)), maxWidth: `min(1560px, ${(82 * def.view.w / def.view.h).toFixed(1)}vh)` } : undefined}>
            <SynthPanel def={def} values={sess.values} target={sess.step == null ? target : null} cables={sess.cables} outline={outline}
              zoom={zoom} areasOn={areasOn} dimOn={dimOn} heatOn={heatOn} onChange={onChange} onConnect={onConnect} onRemoveCable={onRemoveCable} onMoveCable={onMoveCable} />
          </div>
        </div>
        {!areasOn && <MapLegend def={def} values={sess.values} dimOn={dimOn} heatOn={heatOn} outline={outline} />}
        {mapOn && <WhyAsker mapperRef={mapperRef} />}
        {areasOn && <p className="mt-1 text-xs text-accent">Explain sections is on: point at (or tap) a coloured section to read what it does. Knobs and jacks are locked until you turn it off.</p>}
        {engineError && <p role="alert" className="mt-2 text-sm text-warn">This panel setting could not be turned into sound: {engineError}</p>}

        {harmOn && (
          <HarmonicsStrip cutoff={cutoffNow} pred={pred} engineRef={engineRef} running={audio === 'on'}
            playing={playing} measureStore={measureRef.current} onExpand={() => setScopeOpen(true)} />
        )}

        <FxRack fx={fx} onChange={changeFx} />

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_300px]">
          <Keyboard octave={octave} onOctave={setOctave} wheel={wheel} onWheel={setWheel} hold={hold} onHold={setHoldMode} noteOn={noteOn} noteOff={noteOff} />
          <div className="flex gap-3">
            <button type="button" onClick={() => (playing ? stopRiff() : playRiff(preset.phrase))}
              className={`flex w-[104px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border text-sm font-semibold ${playing ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-text hover:border-muted'}`}>
              <span aria-hidden="true" className="text-xl leading-none">{playing ? '■' : '▶'}</span>
              {playing ? 'Stop riff' : 'Play riff'}
            </button>
            <div className="h-28 min-w-0 flex-1"><Scope engineRef={engineRef} running={audio === 'on'} measureStore={measureRef.current} changeKey={traceKey} onExpand={() => setScopeOpen(true)} /></div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <MidiStatus midi={midi} onConnect={connectMidi} />
          <HelpButton title="How to play" items={PLAY_HELP} />
        </div>
      </section>

      <main className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <Library presets={presets} currentId={preset.id} onSelect={selectPreset} />
        <Lesson def={def} preset={preset} step={sess.step} onStep={setStep} />
        <aside className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
          <Inspector def={def} values={sess.values} target={target} preset={preset} cables={sess.cables} onChange={onChange} onConnect={onConnect} onUnplug={onUnplug} />
          <Tutor def={def} values={sess.values} cables={sess.cables} preset={preset} onApply={applyFromTutor} onNewPreset={addAiPreset} />
          <section className="rounded-xl border border-line p-4 text-sm text-muted">
            <h2 className="kys-label mb-1">About this {def.name}</h2>
            <p>{def.summary}</p>
            {def.lineage && (
              <button type="button" onClick={() => setLineageOpen(true)}
                className="mt-2 block text-left text-accent underline underline-offset-2">Where it comes from: the {def.name}’s lineage</button>
            )}
            <button type="button" onClick={() => setLimitsOpen(true)}
              className="mt-2 block text-left text-accent underline underline-offset-2">What this app does not model on the {def.name}</button>
          </section>
        </aside>
      </main>

      {tourOn && <Tour def={def} onClose={() => setTourOn(false)} />}
      <Lineage def={def} presets={presets} open={lineageOpen} onClose={() => setLineageOpen(false)} onSelect={(id) => { selectPreset(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onArtist={openArtist} />
      <Bank open={bankOpen} route={bankRoute} onRoute={setBankRoute} onClose={() => setBankOpen(false)} onLoadSound={loadSound} onOpenSynth={openSynth} />
      <Limits def={def} open={limitsOpen} onClose={() => setLimitsOpen(false)} />
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} engineRef={engineRef} running={audio === 'on'}
        def={def} values={sess.values} cables={sess.cables} preset={preset}
        playing={playing} onPlay={playRiff} onStop={stopRiff}
        wheel={wheel} onWheel={setWheel} octave={octave} onOctave={setOctave} hold={hold} onHold={setHoldMode}
        noteOn={noteOn} noteOff={noteOff} changeKey={traceKey} />

      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-faint">
        KnowYourSynth is an independent learning tool. It is not affiliated with or endorsed by Behringer, Music Tribe, Moog or Sequential; product names are used only to identify the instruments. Sounds are approximations "in the style of" and the audio is a simplified model, so expect your hardware to differ a little. Panel settings are the point: copy them to your own synth and adjust by ear.
      </footer>
      <Tooltip enabled={tipsOn} def={def} values={sess.values} target={sess.step == null ? target : null} preset={preset} cables={sess.cables} />
    </div>
  );
}
