'use client';

/**
 * The synth page: it holds the page state and lays out the regions (plan §4 "The synth page").
 *
 * Split from the prototype file `prototype/src/App.jsx` (decision D3). What moved:
 * - The synth is the URL: the route fetches it from the API and passes it in, and the picker navigates.
 * - The panel view is in the query (`?view=`), with the last choice in browser storage.
 * - The panel, signed out, is kept per synth in browser storage (`storage.ts`); signed in is `f-my-sounds`.
 * - The audio engine outlives the page (`engine.ts`), so changing synth keeps the sound on.
 * - The panel uses the neutral design (D11). Choosing a design per synth is `f-panel-designs`.
 *
 * What is not here yet, so that no button opens nothing (`B31`): the tutor (`f-tutor`) and the databank
 * (`f-databank`). The theme switch is Sunrise's, in the header.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { CableEnd } from '@/components/app/panel/synth-panel';
import { normalizeFx } from '@/lib/app/synths/audio/fx';
import type { RackFx } from '@/lib/app/synths/audio/fx';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef, loadedSynthDef } from '@/lib/app/synths/defs/load';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { cablesToEngine, presetState } from '@/lib/app/synths/lib/patch';
import { predict } from '@/lib/app/synths/lib/predict';
import type { Prediction } from '@/lib/app/synths/lib/predict';
import { createMapper, probeNotes } from '@/lib/app/synths/lib/soundmap';
import type { Mapper } from '@/lib/app/synths/lib/soundmap';
import type { ControlValue, Phrase, SynthDef } from '@/lib/app/synths/contract';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import {
  HelpButton,
  MidiStatus,
  PanelSwitch,
  Segmented,
} from '@/components/app/synth/bar-controls';
import { getEngine, listen } from '@/components/app/synth/engine';
import { FxRack } from '@/components/app/synth/fx-rack';
import { Inspector, Tooltip } from '@/components/app/synth/inspector';
import { Keyboard, OCTAVE_MAX, OCTAVE_MIN, QWERTY } from '@/components/app/synth/keyboard';
import { Lesson } from '@/components/app/synth/lesson';
import { Library } from '@/components/app/synth/library';
import { Limits } from '@/components/app/synth/limits';
import { Lineage } from '@/components/app/synth/lineage';
import { DEFAULT_VIEW, hashTarget, parseView, synthHref } from '@/components/app/synth/routes';
import type { PanelView } from '@/components/app/synth/routes';
import {
  HarmonicsStrip,
  Scope,
  ScopeDialog,
  createMeasureStore,
} from '@/components/app/synth/scope';
import { Search } from '@/components/app/synth/search';
import { MapLegend, WhyAsker } from '@/components/app/synth/sound-map';
import {
  PanelViewSchema,
  STORAGE_KEYS,
  readStored,
  useStoredPref,
  useStoredSession,
  writeStored,
} from '@/components/app/synth/storage';
import type { Session } from '@/components/app/synth/storage';
import {
  MAP_OFF,
  findStore,
  focusStore,
  mapStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { SynthPicker } from '@/components/app/synth/synth-picker';
import { Tour } from '@/components/app/synth/tour';
import { useMidi } from '@/components/app/synth/use-midi';
import { withNotes } from '@/components/app/synth/with-notes';

const PANEL_HELP = [
  [
    'Knobs',
    'Drag up or down to turn. Hold Shift for fine moves. Double-click to put it back where the sound had it.',
  ],
  [
    'Sliders',
    'Drag along the slot. Hold Shift for fine moves. Double-click to put it back where the sound had it.',
  ],
  ['Switches', 'Click to change.'],
  [
    'Plug in a cable',
    'Click a jack, then point at another to read what that cable would do. Click to plug it in. Move off the panel or press Esc to drop it.',
  ],
  ['Move a cable', 'Drag the plug at either end to another jack.'],
  ['Unplug a cable', 'Click the cable.'],
] as const;

const PLAY_HELP = [
  ['Mouse or touch', 'Click or tap the keys on screen.'],
  ['Computer keys', 'A W S E D F T G Y H U J K play notes. Z and X change octave.'],
  [
    'MIDI keyboard',
    'Click Connect MIDI, then play a USB or Bluetooth keyboard. Notes and the mod wheel both work. Works in Chrome and Edge.',
  ],
  ['Play riff', 'Plays a short original phrase that suits the sound.'],
] as const;

type AudioState = 'off' | 'starting' | 'on' | 'error';

const BoolSchema = z.boolean();
const FxSchema = z.unknown().transform(normalizeFx);
const FX_FALLBACK = normalizeFx(null);

/** A panel with the synth's first sound loaded and no lesson step: how a synth opens the first time. */
function freshSession(def: SynthDef, preset: CatalogueSound | undefined): Session {
  return { presetId: preset?.id ?? null, step: null, ...presetState(def, preset) };
}

/** Jacks with a cable in, inputs and outputs alike, as `toEngine` wants them. */
const patchedJacks = (cables: Session['cables']) =>
  Object.fromEntries(
    cables.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );

export interface SynthPageProps {
  /** From `GET /api/v1/synths/[id]`. Its synth is in the registry: the API serves no other. */
  detail: SynthDetail;
  /** From `GET /api/v1/synths`: what the picker offers. */
  synths: CatalogueSynth[];
  /** The `view` query, as the request had it. */
  viewParam: string | null;
}

/**
 * The synth's definition is loaded here, not passed in: it holds functions, so it cannot cross from the server
 * page. It is loaded alone (`defs/load.ts`), so the page's bundle carries no definition. Until it arrives the page
 * suspends: the server render waits for it, and a move to another synth keeps the last one showing meanwhile.
 */
export function SynthPage(props: SynthPageProps) {
  const id = props.detail.synth.id;
  const loading = loadSynthDef(id);
  const baseDef = loadedSynthDef(id) ?? (loading ? use(loading) : null);
  return baseDef ? <Synth baseDef={baseDef} {...props} /> : null;
}

function Synth({ baseDef, detail, synths, viewParam }: SynthPageProps & { baseDef: AppSynthDef }) {
  const router = useRouter();
  const synthId = baseDef.id;
  const sounds = detail.sounds;

  // The definition with the catalogue's unusual notes on it. The sound map, when it comes, works from this, so it
  // gives the same answers whichever layout is showing.
  const synthDef = useMemo(
    () => withNotes(baseDef, detail.notes.unusual),
    [baseDef, detail.notes.unusual]
  );

  // ── the view: the query first, then the last choice, then the default ──
  const urlView = useMemo(() => parseView(viewParam), [viewParam]);
  const [view, setViewState] = useState<PanelView>(urlView ?? DEFAULT_VIEW);
  const setView = useCallback(
    (next: PanelView) => {
      setViewState(next);
      writeStored(STORAGE_KEYS.view, next);
      window.history.replaceState(null, '', synthHref(synthId, next));
    },
    [synthId]
  );

  // On arrival: follow a prototype hash link, remember this synth, and restore the last view if the URL has none.
  // A hash link to this same synth only sets the view: a navigation to the same page keeps this component, and with
  // it the view it started with.
  useEffect(() => {
    const hash = hashTarget(window.location.hash, (id) => synths.some((s) => s.id === id));
    if (hash && hash.id !== synthId) {
      router.replace(synthHref(hash.id, hash.view));
      return;
    }
    writeStored(STORAGE_KEYS.synth, synthId);
    if (hash) {
      setView(hash.view);
      return;
    }
    if (urlView) return;
    const stored = PanelViewSchema.safeParse(readStored(STORAGE_KEYS.view));
    if (stored.success && (stored.data.outline || stored.data.long)) setView(stored.data);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  // The panel as drawn. Only positions differ from `synthDef`.
  const def = useMemo(
    () => (view.long || !synthDef.modular ? synthDef : modularDef(synthDef)),
    [synthDef, view.long]
  );

  const [sess, patch] = useStoredSession(synthDef, () => freshSession(synthDef, sounds[0]));
  const preset = sounds.find((p) => p.id === sess.presetId) || sounds[0];
  // A stored step can outrun the sound it is read against (the stored sound was removed, or lost steps): the finished
  // sound, then.
  const step = preset && sess.step != null && sess.step < preset.steps.length ? sess.step : null;
  const target = useMemo(() => presetState(synthDef, preset).values, [synthDef, preset]);

  const [audio, setAudio] = useState<AudioState>('off');
  const [playing, setPlaying] = useState(false);
  const [wheel, setWheel] = useState(0);
  const [octave, setOctave] = useState(0);
  const [hold, setHold] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [zoom, setZoom] = useState(0); // magnifier: 0 = off, else the enlargement
  const [areasOn, setAreasOn] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [tipsOn, setTipsOn] = useStoredPref(STORAGE_KEYS.tips, BoolSchema, true);
  const [dimOn, setDimOn] = useStoredPref(STORAGE_KEYS.dim, BoolSchema, false);
  const [heatOn, setHeatOn] = useStoredPref(STORAGE_KEYS.heat, BoolSchema, false);
  const [harmOn, setHarmOn] = useStoredPref(STORAGE_KEYS.harm, BoolSchema, false);
  const [fx, setFx] = useStoredPref<RackFx>(STORAGE_KEYS.fx, FxSchema, FX_FALLBACK);

  // ── audio ──
  const engine = useMemo(() => (typeof window === 'undefined' ? null : getEngine()), []);
  useEffect(() => {
    if (!engine) return undefined;
    // Coming from another synth, the sound may already be on.
    if (engine.running) setAudio('on');
    const unlisten = listen((e) => {
      if (e.type === 'phraseEnd') setPlaying(false);
    });
    return () => {
      unlisten();
      // Leaving the page stops what it was playing; the engine and its sound switch stay as they are.
      engine.send({ type: 'panic' });
      focusStore.set(null);
      findStore.set(null);
      pendingStore.set(null);
    };
  }, [engine]);
  useEffect(() => {
    engine?.setFx(fx);
  }, [engine, fx]);

  const ensureAudio = useCallback(async () => {
    if (!engine) return false;
    if (engine.running) return true;
    setAudio('starting');
    try {
      await engine.resume();
      setAudio('on');
      meterStore.set((m) => ({ ...m, power: true }));
      return true;
    } catch {
      setAudio('error');
      return false;
    }
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    try {
      const p = synthDef.toEngine(sess.values, { wheel, patched: patchedJacks(sess.cables) });
      p.cables = cablesToEngine(synthDef, sess.cables, sess.values);
      p.wheel = wheel;
      engine.send({ type: 'params', p });
      setEngineError('');
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : String(err));
    }
  }, [synthDef, sess.values, sess.cables, wheel, engine]);

  // Where the harmonics strip draws its dashed line. One toEngine() call — the same one the voice gets — so it keeps
  // up with a knob being dragged. waveStory's attribution is hundreds of calls and stays in the dialog.
  const cutoffNow = useMemo(() => {
    if (!harmOn) return null;
    try {
      return synthDef.toEngine(sess.values, { wheel, patched: patchedJacks(sess.cables) }).filter
        .cutoff;
    } catch {
      return null; // the panel already reports the error
    }
  }, [harmOn, synthDef, sess.values, sess.cables, wheel]);
  // A fresh identity whenever the panel moves, so the scope can hold the shape from just before the move.
  const traceKey = useMemo(
    () => ({ values: sess.values, cables: sess.cables, wheel }),
    [sess.values, sess.cables, wheel]
  );
  // Filled by the small scope strip's measuring pass, read by the harmonics strip to number the harmonics.
  const [measureStore] = useState(createMeasureStore);

  // The predicted wave and harmonics: one note rendered through the synth model offline, so the graphs show this
  // patch whether or not anything is playing. About 10 ms — too much for every frame of a knob drag, so it waits
  // for a short gap in the moving. That reads as live without the drag itself stuttering.
  const [pred, setPred] = useState<Prediction | null>(null);
  useEffect(() => {
    const t = setTimeout(
      () => setPred(harmOn ? predict(synthDef, sess.values, sess.cables, wheel) : null),
      harmOn ? 60 : 0
    );
    return () => clearTimeout(t);
  }, [harmOn, synthDef, sess.values, sess.cables, wheel]);

  // ── sound map: which controls are in the sound, and which it is most sensitive to ──
  // It works from `synthDef`, not the drawn layout, so it gives the same answers whichever layout is showing.
  const mapperRef = useRef<Mapper | null>(null);
  useEffect(
    () => () => {
      mapperRef.current?.dispose();
      mapperRef.current = null;
      mapStore.set(MAP_OFF);
    },
    []
  );
  const mapOn = dimOn || heatOn;
  const soundKey = `${synthId}/${preset?.id ?? ''}/${step}`;
  useEffect(() => {
    if (!mapOn) {
      mapperRef.current?.cancel();
      mapStore.set(MAP_OFF);
      return undefined;
    }
    const mapper = (mapperRef.current ??= createMapper());
    // A map of another sound says nothing about this one, so it goes at once. After a knob move the old map stays up
    // until the new one is ready.
    mapStore.set((m) =>
      m.key === soundKey
        ? { ...m, status: 'working' }
        : { ...MAP_OFF, status: 'working', key: soundKey }
    );
    const t = setTimeout(() => {
      try {
        mapper.analyse(
          synthDef,
          sess.values,
          sess.cables,
          wheel,
          probeNotes(preset),
          // An analysis started for another sound can still be running in the gap before this one replaces it: its
          // progress and its answer are for a sound no longer loaded, so they are dropped.
          (progress) =>
            mapStore.set((m) => (m.state || m.key !== soundKey ? m : { ...m, progress })),
          (res) =>
            mapStore.set((m) =>
              m.key === soundKey
                ? { status: 'ready', progress: 1, key: soundKey, why: {}, ...res }
                : m
            )
        );
      } catch {
        mapStore.set(MAP_OFF); // toEngine threw: the panel already reports that
      }
    }, 300);
    return () => clearTimeout(t);
  }, [mapOn, synthDef, sess.values, sess.cables, wheel, preset, soundKey]);

  const heldRef = useRef(new Set<number>());
  const noteOn = useCallback(
    (n: number, v = 0.85) => {
      if (!engine) return;
      void ensureAudio();
      if (hold) {
        heldRef.current.forEach((h) => engine.send({ type: 'noteOff', n: h }));
        heldRef.current.clear();
        heldRef.current.add(n);
      }
      engine.send({ type: 'noteOn', n, v });
    },
    [engine, ensureAudio, hold]
  );
  // Hold keeps only the notes started under it: one already sounding when Hold went on still stops when released.
  const noteOff = useCallback(
    (n: number) => {
      if (!hold || !heldRef.current.has(n)) engine?.send({ type: 'noteOff', n });
    },
    [engine, hold]
  );
  const setHoldMode = (h: boolean) => {
    setHold(h);
    if (!h) {
      heldRef.current.forEach((n) => engine?.send({ type: 'noteOff', n }));
      heldRef.current.clear();
    }
  };

  const rememberMidi = useCallback((v: boolean) => writeStored(STORAGE_KEYS.midi, v), []);
  const loadMidi = useCallback(() => readStored(STORAGE_KEYS.midi) === true, []);
  const midi = useMidi({
    noteOn,
    noteOff,
    onWheel: setWheel,
    remember: rememberMidi,
    load: loadMidi,
  });
  // The browser only starts sound after a click, so connecting MIDI also turns the sound on.
  const connectMidi = () => {
    void ensureAudio();
    void midi.connect();
  };

  // SynthDef `tempo` names the control whose value is the riff's BPM (the TB-303's TEMPO knob): the riff plays at
  // that speed, and turning it while the riff plays moves the riff with it.
  const tempoValue = def.tempo ? sess.values[def.tempo] : null;
  const tempoBpm = typeof tempoValue === 'number' ? tempoValue : null;
  const tempoRef = useRef(tempoBpm);
  useEffect(() => {
    tempoRef.current = tempoBpm;
    if (tempoBpm) engine?.send({ type: 'tempo', bpm: tempoBpm });
  }, [engine, tempoBpm]);
  const stopRiff = useCallback(() => {
    engine?.send({ type: 'stopPhrase' });
    setPlaying(false);
  }, [engine]);
  const playRiff = useCallback(
    async (ph: Phrase) => {
      if (!engine || !(await ensureAudio())) return;
      engine.send({
        type: 'phrase',
        phrase: tempoRef.current ? { ...ph, bpm: tempoRef.current } : ph,
      });
      setPlaying(true);
    },
    [engine, ensureAudio]
  );

  // computer keyboard. Each key remembers the note it started, so a key held across an octave change (or a Hold
  // toggle, which re-registers these listeners) still stops the note it is sounding.
  const downKeysRef = useRef(new Map<string, number>());
  useEffect(() => {
    const downKeys = downKeysRef.current;
    // Held keys are tracked by the physical key: its character can change between press and release (Shift turns
    // `;` into `:`), and a release that did not match would leave the note sounding.
    const physical = (e: KeyboardEvent) => e.code || e.key.toLowerCase();
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
    // A modal dialog (lineage, limits) leaves the panel behind it inert, so its keys do not play. The scope's big view
    // has a keyboard of its own and says its keys play (`data-plays`).
    const inModal = (e: KeyboardEvent) =>
      e.target instanceof Element && !!e.target.closest('dialog:not([data-plays])');
    const kd = (e: KeyboardEvent) => {
      if (typing(e) || inModal(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      const semi = QWERTY[k];
      if (semi !== undefined && !downKeys.has(physical(e))) {
        const n = 48 + octave * 12 + semi;
        downKeys.set(physical(e), n);
        noteOn(n);
      } else if (k === 'z') setOctave((o) => Math.max(OCTAVE_MIN, o - 1));
      else if (k === 'x') setOctave((o) => Math.min(OCTAVE_MAX, o + 1));
    };
    const ku = (e: KeyboardEvent) => {
      const n = downKeys.get(physical(e));
      if (n === undefined) return;
      downKeys.delete(physical(e));
      noteOff(n);
    };
    // A key let go while the window is not focused sends its key-up elsewhere: leaving the window lets every key go.
    const blur = () => {
      downKeys.forEach((n) => noteOff(n));
      downKeys.clear();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, [noteOn, noteOff, octave]);

  // ── actions ──
  const onChange = useCallback(
    (id: string, v: ControlValue | null) =>
      patch((s) => {
        const from = sounds.find((p) => p.id === s.presetId) || sounds[0];
        const nv = v === null ? presetState(synthDef, from).values[id] : v;
        if (nv === undefined || s.values[id] === nv) return s;
        return { ...s, values: { ...s.values, [id]: nv } };
      }),
    [patch, sounds, synthDef]
  );
  const onConnect = useCallback(
    (from: string, to: string) =>
      patch((s) =>
        s.cables.some((c) => c.from === from && c.to === to)
          ? s
          : {
              ...s,
              cables: [
                ...s.cables,
                { from, to, color: CABLE_COLORS[s.cables.length % CABLE_COLORS.length] },
              ],
            }
      ),
    [patch]
  );
  const onRemoveCable = useCallback(
    (i: number) => patch((s) => ({ ...s, cables: s.cables.filter((_, k) => k !== i) })),
    [patch]
  );
  // Move one end of a connected cable to another jack. A move that would duplicate an existing cable is ignored.
  const onMoveCable = useCallback(
    (i: number, end: CableEnd, jackId: string) =>
      patch((s) => {
        const cb = s.cables[i];
        if (!cb) return s;
        const next = { ...cb, [end]: jackId };
        if (s.cables.some((c, k) => k !== i && c.from === next.from && c.to === next.to)) return s;
        return { ...s, cables: s.cables.map((c, k) => (k === i ? next : c)) };
      }),
    [patch]
  );
  const onUnplug = useCallback(
    (from: string, to: string) =>
      patch((s) => ({
        ...s,
        cables: s.cables.filter((c) => !(c.from === from && c.to === to)),
      })),
    [patch]
  );

  const selectPreset = (id: string) => {
    const p = sounds.find((x) => x.id === id);
    if (!p) return;
    focusStore.set(null);
    patch(() => ({ presetId: id, step: null, ...presetState(synthDef, p) }));
    if (playing) void playRiff(p.phrase);
  };
  // A lesson step sets the panel to the sound as far as that step; `null` is the finished sound.
  const setStep = (k: number | null) =>
    patch((s) => {
      const from = sounds.find((p) => p.id === s.presetId) || sounds[0];
      return { ...s, step: k, ...presetState(synthDef, from, k) };
    });
  const closeTour = useCallback(() => setTourOn(false), []);
  const switchSynth = (id: string) => {
    if (id === synthId) return;
    router.push(synthHref(id, view));
  };

  const changed = def.controls.filter(
    (c) => step == null && sess.values[c.id] !== target[c.id]
  ).length;
  const toggleAudio = async () => {
    if (!engine) return;
    if (audio === 'on') {
      setPlaying(false);
      await engine.suspend();
      setAudio('off');
      meterStore.set((m) => ({ ...m, power: false, gate: false }));
      notesStore.set([]);
    } else void ensureAudio();
  };

  const linkBtn = 'kys-label text-(--kys-accent) underline-offset-2 hover:underline';
  const smallBtn =
    'rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-(--kys-muted) hover:text-(--kys-text)';

  return (
    <div className="kys-synth mx-auto flex w-full max-w-[1720px] flex-col gap-5 px-4 pt-4 pb-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SynthPicker synths={synths} synthId={synthId} onSelect={switchSynth} />
        <button
          type="button"
          onClick={() => void toggleAudio()}
          aria-pressed={audio === 'on'}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${audio === 'on' ? 'border-(--kys-good)/60 text-(--kys-good)' : 'border-(--kys-line) text-(--kys-muted) hover:text-(--kys-text)'}`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${audio === 'on' ? 'bg-(--kys-good)' : audio === 'error' ? 'bg-(--kys-warn)' : 'bg-(--kys-faint)'}`}
          />
          {audio === 'on'
            ? 'Sound on'
            : audio === 'starting'
              ? 'Starting…'
              : audio === 'error'
                ? 'Sound unavailable'
                : 'Turn sound on'}
        </button>
      </div>

      <section
        aria-label={`${def.name} panel`}
        className="kys-stage rounded-2xl border border-(--kys-line) p-3 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="kys-label text-(--kys-faint)">
                {detail.synth.maker} {detail.synth.name} · {detail.synth.heritage}
              </h1>
              {detail.lineage && (
                <button type="button" onClick={() => setLineageOpen(true)} className={linkBtn}>
                  History ›
                </button>
              )}
              <button type="button" onClick={() => setLimitsOpen(true)} className={linkBtn}>
                What is not modelled ›
              </button>
            </div>
            <p className="truncate text-[15px]">
              <span className="text-(--kys-muted)">Loaded: </span>
              <span className="font-semibold">{preset ? preset.name : 'Blank patch'}</span>
              {preset && step != null && (
                <span className="ml-2 rounded bg-(--kys-accent) px-1.5 py-0.5 font-mono text-xs text-(--kys-accent-ink)">
                  step {step + 1} of {preset.steps.length}
                </span>
              )}
              {changed > 0 && (
                <span className="ml-2 text-sm text-(--kys-accent)">
                  {changed} control{changed === 1 ? '' : 's'} moved
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {preset && changed > 0 && (
              <button type="button" onClick={() => selectPreset(preset.id)} className={smallBtn}>
                Restore sound
              </button>
            )}
            <button
              type="button"
              onClick={() => patch((s) => ({ ...s, values: { ...synthDef.init }, cables: [] }))}
              className={smallBtn}
            >
              Blank patch
            </button>
            {sess.cables.length > 0 && (
              <button
                type="button"
                onClick={() => patch((s) => ({ ...s, cables: [] }))}
                className={smallBtn}
              >
                Unplug all
              </button>
            )}
            {synthDef.modular && (
              <Segmented
                label="Panel layout"
                title="Modular: the sections stacked as modules, easier to read on a small screen. Long: the faceplate as it is on the keyboard."
                options={[
                  [false, 'Modular'],
                  [true, 'Long'],
                ]}
                value={view.long}
                onChange={(long) => setView({ ...view, long })}
              />
            )}
            <Segmented
              label="Panel view"
              options={[
                [false, 'Hardware'],
                [true, 'Outline'],
              ]}
              value={view.outline}
              onChange={(outline) => setView({ ...view, outline })}
            />
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Search def={def} />
          <div className="flex flex-wrap items-center gap-1.5 text-sm sm:gap-2">
            <PanelSwitch
              label="Orientation tour"
              short="Tour"
              tone="start"
              on={tourOn}
              title={`A guided walk round the ${def.name}: what its words mean, then every section in the order the sound passes through it. It changes nothing on the panel.`}
              onClick={() => {
                setTourOn(!tourOn);
                setAreasOn(false);
                findStore.set(null);
              }}
            />
            <PanelSwitch
              label="Explain sections"
              short="Sections"
              on={areasOn}
              title="Colour in every named part of the panel, and explain what it does when you point at it."
              onClick={() => {
                setAreasOn(!areasOn);
                setTourOn(false);
                findStore.set(null);
                focusStore.set((f) => (f && f.kind === 'area' ? null : f));
              }}
            />
            <PanelSwitch
              label="Dim unused parts"
              short="Dim unused"
              on={dimOn}
              title="Darken every part of the panel that is not part of the sound as it is set now. Point at a dark control to see what would bring it in."
              onClick={() => setDimOn(!dimOn)}
            />
            <PanelSwitch
              label="Show sensitive controls"
              short="Sensitive"
              on={heatOn}
              title="Put a glow behind the controls where a small move changes the sound most. The bigger and stronger the glow, the more effect. The three strongest are numbered."
              onClick={() => setHeatOn(!heatOn)}
            />
            <PanelSwitch
              label="Show harmonics"
              short="Harmonics"
              on={harmOn}
              title="Show the wave and the harmonics of this patch under the panel, worked out by rendering a note through the synth model. No sound need be playing; turn a knob and both redraw."
              onClick={() => setHarmOn(!harmOn)}
            />
            <PanelSwitch
              label={`Info cards: ${tipsOn ? 'on' : 'off'}`}
              short={`Cards: ${tipsOn ? 'on' : 'off'}`}
              tone="quiet"
              on={tipsOn}
              title="Show or hide the pop-up card when you point at a knob, switch, jack or cable. The inspector always explains it."
              onClick={() => setTipsOn(!tipsOn)}
            />
            <HelpButton title="How to use the panel" items={PANEL_HELP} />
            <div
              className="flex items-center rounded-md border border-(--kys-line) bg-(--kys-surface) p-0.5"
              role="group"
              aria-label="Magnifier"
            >
              <span className="px-1.5 text-(--kys-muted) sm:px-2">
                <span className="xl:hidden">Zoom</span>
                <span className="hidden xl:inline">Magnify</span>
              </span>
              {(
                [
                  [0, 'Off'],
                  [2, '2×'],
                  [3, '3×'],
                ] as const
              ).map(([z, l]) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={zoom === z}
                  onClick={() => setZoom(z)}
                  className={`rounded px-2 py-1 font-semibold sm:px-2.5 ${zoom === z ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="kys-scroll overflow-x-auto pb-2">
          <div
            className={`mx-auto max-w-[1560px] ${def.layout ? '' : 'min-w-[920px]'} ${view.outline ? '' : 'kys-synth-shadow'}`}
            style={
              def.layout
                ? {
                    minWidth: Math.min(920, Math.round(def.view.w * 0.2)),
                    maxWidth: `min(1560px, ${((82 * def.view.w) / def.view.h).toFixed(1)}vh)`,
                  }
                : undefined
            }
          >
            <SynthPanel
              def={def}
              values={sess.values}
              target={step == null ? target : null}
              cables={sess.cables}
              outline={view.outline}
              zoom={zoom}
              areasOn={areasOn}
              dimOn={dimOn}
              heatOn={heatOn}
              onChange={onChange}
              onConnect={onConnect}
              onRemoveCable={onRemoveCable}
              onMoveCable={onMoveCable}
              design="neutral"
            />
          </div>
        </div>
        {!areasOn && (
          <MapLegend
            def={def}
            values={sess.values}
            dimOn={dimOn}
            heatOn={heatOn}
            outline={view.outline}
          />
        )}
        {mapOn && <WhyAsker mapperRef={mapperRef} />}
        {areasOn && (
          <p className="mt-1 text-xs text-(--kys-accent)">
            Explain sections is on: point at (or tap) a coloured section to read what it does. Knobs
            and jacks are locked until you turn it off.
          </p>
        )}
        {engineError && (
          <p role="alert" className="mt-2 text-sm text-(--kys-warn)">
            This panel setting could not be turned into sound: {engineError}
          </p>
        )}

        {harmOn && (
          <HarmonicsStrip
            cutoff={cutoffNow}
            pred={pred}
            source={engine}
            running={audio === 'on'}
            playing={playing}
            measureStore={measureStore}
            onExpand={() => setScopeOpen(true)}
          />
        )}

        <FxRack fx={fx} onChange={setFx} />

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_300px]">
          <Keyboard
            octave={octave}
            onOctave={setOctave}
            wheel={wheel}
            onWheel={setWheel}
            hold={hold}
            onHold={setHoldMode}
            noteOn={noteOn}
            noteOff={noteOff}
          />
          <div className="flex gap-3">
            {preset && (
              <button
                type="button"
                onClick={() => (playing ? stopRiff() : void playRiff(preset.phrase))}
                className={`flex w-[104px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border text-sm font-semibold ${playing ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) bg-(--kys-surface) text-(--kys-text) hover:border-(--kys-muted)'}`}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {playing ? '■' : '▶'}
                </span>
                {playing ? 'Stop riff' : 'Play riff'}
              </button>
            )}
            <div className="h-28 min-w-0 flex-1">
              <Scope
                source={engine}
                running={audio === 'on'}
                measureStore={measureStore}
                changeKey={traceKey}
                onExpand={() => setScopeOpen(true)}
              />
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <MidiStatus midi={midi} onConnect={connectMidi} />
          <HelpButton title="How to play" items={PLAY_HELP} />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <Library presets={sounds} currentId={preset?.id ?? null} onSelect={selectPreset} />
        {preset ? (
          <Lesson def={def} preset={preset} step={step} onStep={setStep} />
        ) : (
          <p className="text-sm text-(--kys-muted)">This synth has no sounds yet.</p>
        )}
        <aside className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
          <Inspector
            def={def}
            values={sess.values}
            target={step == null ? target : null}
            preset={preset ?? null}
            cables={sess.cables}
            onChange={onChange}
            onConnect={onConnect}
            onUnplug={onUnplug}
          />
          <section className="rounded-xl border border-(--kys-line) p-4 text-sm text-(--kys-muted)">
            <h2 className="kys-label mb-1">About this {detail.synth.name}</h2>
            <p>{detail.synth.summary}</p>
            {detail.lineage && (
              <button
                type="button"
                onClick={() => setLineageOpen(true)}
                className="mt-2 block text-left text-(--kys-accent) underline underline-offset-2"
              >
                Where it comes from: the {detail.synth.name}’s lineage
              </button>
            )}
            <button
              type="button"
              onClick={() => setLimitsOpen(true)}
              className="mt-2 block text-left text-(--kys-accent) underline underline-offset-2"
            >
              What this app does not model on the {detail.synth.name}
            </button>
          </section>
        </aside>
      </div>

      {tourOn && <Tour def={def} notes={detail.notes.unusual} onClose={closeTour} />}
      {detail.lineage && (
        <Lineage
          synth={detail.synth}
          lineage={detail.lineage}
          open={lineageOpen}
          onClose={() => setLineageOpen(false)}
        />
      )}
      <Limits
        synth={detail.synth}
        limits={detail.notes.limits}
        open={limitsOpen}
        onClose={() => setLimitsOpen(false)}
      />
      <ScopeDialog
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        source={engine}
        running={audio === 'on'}
        def={def}
        values={sess.values}
        cables={sess.cables}
        phrase={preset?.phrase ?? null}
        playing={playing}
        onPlay={(ph) => void playRiff(ph)}
        onStop={stopRiff}
        wheel={wheel}
        onWheel={setWheel}
        octave={octave}
        onOctave={setOctave}
        hold={hold}
        onHold={setHoldMode}
        noteOn={noteOn}
        noteOff={noteOff}
        changeKey={traceKey}
      />

      <Tooltip
        enabled={tipsOn}
        def={def}
        values={sess.values}
        target={step == null ? target : null}
        preset={preset ?? null}
        cables={sess.cables}
      />
    </div>
  );
}
