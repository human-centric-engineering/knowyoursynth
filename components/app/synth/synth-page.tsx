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
 * What is not here yet, so that no button opens nothing (`B31`): the library and the lesson (t-14), the tour, lineage
 * and "What is not modelled" (t-14), the sound map and the harmonics and scope (t-15), the tutor (`f-tutor`) and the
 * databank (`f-databank`). The theme switch is Sunrise's, in the header.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { CableEnd } from '@/components/app/panel/synth-panel';
import { normalizeFx } from '@/lib/app/synths/audio/fx';
import type { RackFx } from '@/lib/app/synths/audio/fx';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { cablesToEngine, presetState } from '@/lib/app/synths/lib/patch';
import type { ControlValue, Phrase } from '@/lib/app/synths/contract';
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
import { DEFAULT_VIEW, hashTarget, parseView, synthHref } from '@/components/app/synth/routes';
import type { PanelView } from '@/components/app/synth/routes';
import { Search } from '@/components/app/synth/search';
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
  findStore,
  focusStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { SynthPicker } from '@/components/app/synth/synth-picker';
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
function freshSession(def: AppSynthDef, preset: CatalogueSound | undefined): Session {
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
 * The synth's definition is looked up here, not passed in: it holds functions, so it cannot cross from the server
 * page.
 */
export function SynthPage(props: SynthPageProps) {
  const baseDef = getSynthDef(props.detail.synth.id);
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

  const [sess, patch] = useStoredSession(synthDef, () => freshSession(baseDef, sounds[0]));
  const preset = sounds.find((p) => p.id === sess.presetId) || sounds[0];
  const target = useMemo(() => presetState(synthDef, preset).values, [synthDef, preset]);

  const [audio, setAudio] = useState<AudioState>('off');
  const [playing, setPlaying] = useState(false);
  const [wheel, setWheel] = useState(0);
  const [octave, setOctave] = useState(0);
  const [hold, setHold] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [zoom, setZoom] = useState(0); // magnifier: 0 = off, else the enlargement
  const [areasOn, setAreasOn] = useState(false);
  const [tipsOn, setTipsOn] = useStoredPref(STORAGE_KEYS.tips, BoolSchema, true);
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
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
    const kd = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      const semi = QWERTY[k];
      if (semi !== undefined && !downKeys.has(k)) {
        const n = 48 + octave * 12 + semi;
        downKeys.set(k, n);
        noteOn(n);
      } else if (k === 'z') setOctave((o) => Math.max(OCTAVE_MIN, o - 1));
      else if (k === 'x') setOctave((o) => Math.min(OCTAVE_MAX, o + 1));
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const n = downKeys.get(k);
      if (n === undefined) return;
      downKeys.delete(k);
      noteOff(n);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
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
  const switchSynth = (id: string) => {
    if (id === synthId) return;
    router.push(synthHref(id, view));
  };

  const changed = def.controls.filter(
    (c) => sess.step == null && sess.values[c.id] !== target[c.id]
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
            <h1 className="kys-label text-(--kys-faint)">
              {detail.synth.maker} {detail.synth.name} · {detail.synth.heritage}
            </h1>
            <p className="truncate text-[15px]">
              <span className="text-(--kys-muted)">Loaded: </span>
              <span className="font-semibold">{preset ? preset.name : 'Blank patch'}</span>
              {preset && sess.step != null && (
                <span className="ml-2 rounded bg-(--kys-accent) px-1.5 py-0.5 font-mono text-xs text-(--kys-accent-ink)">
                  step {sess.step + 1} of {preset.steps.length}
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
              label="Explain sections"
              short="Sections"
              on={areasOn}
              title="Colour in every named part of the panel, and explain what it does when you point at it."
              onClick={() => {
                setAreasOn(!areasOn);
                findStore.set(null);
                focusStore.set((f) => (f && f.kind === 'area' ? null : f));
              }}
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
              target={sess.step == null ? target : null}
              cables={sess.cables}
              outline={view.outline}
              zoom={zoom}
              areasOn={areasOn}
              onChange={onChange}
              onConnect={onConnect}
              onRemoveCable={onRemoveCable}
              onMoveCable={onMoveCable}
              design="neutral"
            />
          </div>
        </div>
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

        <FxRack fx={fx} onChange={setFx} />

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
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
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <MidiStatus midi={midi} onConnect={connectMidi} />
          <HelpButton title="How to play" items={PLAY_HELP} />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Inspector
            def={def}
            values={sess.values}
            target={sess.step == null ? target : null}
            preset={preset ?? null}
            cables={sess.cables}
            onChange={onChange}
            onConnect={onConnect}
            onUnplug={onUnplug}
          />
        </div>
        <section className="rounded-xl border border-(--kys-line) p-4 text-sm text-(--kys-muted)">
          <h2 className="kys-label mb-1">About this {detail.synth.name}</h2>
          <p>{detail.synth.summary}</p>
        </section>
      </div>

      <Tooltip
        enabled={tipsOn}
        def={def}
        values={sess.values}
        target={sess.step == null ? target : null}
        preset={preset ?? null}
        cables={sess.cables}
      />
    </div>
  );
}
