'use client';

/**
 * The synth page: it holds the page state and lays out the regions (plan §4 "The synth page").
 *
 * Split from the prototype file `prototype/src/App.jsx` (decision D3). What moved:
 * - The synth is the URL: the route fetches it from the API and passes it in, and the picker navigates.
 * - The panel view is in the query (`?view=`), with the last choice in browser storage.
 * - The panel is kept per synth in browser storage (`storage.ts`). A signed-in user also saves it to their account
 *   as one of their own sounds, and opens those again (`my-sounds.tsx`, `f-my-sounds`). Signed in, how far they got
 *   through each lesson is kept, and they star synths and sounds (`progress.ts`, `favourites.tsx`, s4).
 * - The audio engine outlives the page (`engine.ts`), so changing synth keeps the sound on.
 * - The panel draws the synth's design (D11), as an admin set it: `neutral` leaves the maker's marks out.
 * - A sound someone shared opens at its own address, `/synths/<id>/s/<slug>` (`f-sharing` h2): this page with that
 *   sound loaded and a strip above the panel saying whose it is (`SharedSoundStrip`). The view's query is kept on that
 *   address, so changing the view does not lose it.
 *
 * - The tutor sits under the Inspector (`f-tutor` t-56, `components/app/tutor/`). It changes the panel only through the
 *   page: a proposal the learner applies, and a sound it designs, which opens here with its lesson (`designed`). Either
 *   is undone back to what was on the panel before.
 *
 * - On a phone or a tablet held upright (`f-phone-and-tablet`), a note above the panel says it wants a landscape tablet
 *   or a bigger screen (`rotate-prompt.tsx`). The panel fits the page and zooms in its scroller (`panel-zoom.tsx`), and
 *   the two rows of buttons over it each scroll sideways on one line.
 * - Below `lg` the library, lesson, inspector and tutor are not stacked under the panel: a bar of buttons opens each as
 *   a bottom sheet (`components/app/ui/bottom-sheet.tsx`, t-66). The library and the tutor are modal. The lesson and the
 *   inspector are docked at half height with the panel live above them: a tap on the panel opens the inspector on what
 *   was tapped, and a lesson step scrolls its controls into the band above the sheet (`reveal.ts`). Each stays mounted
 *   while its sheet is closed (`kept.tsx`), so the tutor's answer keeps streaming and the step stays lit.
 *
 * The theme switch is Sunrise's, in the header.
 */

import { z } from 'zod';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { useSession } from '@/lib/auth/client';
import type { PublicSound, UserSoundDetail } from '@/lib/app/sounds/data';
import { lessonPreset } from '@/lib/app/sounds/lesson';
import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { CableEnd } from '@/components/app/panel/synth-panel';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef, loadedSynthDef } from '@/lib/app/synths/defs/load';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { cablesToEngine, presetState, type PanelState } from '@/lib/app/synths/lib/patch';
import { predict } from '@/lib/app/synths/lib/predict';
import type { Prediction } from '@/lib/app/synths/lib/predict';
import { createMapper, probeNotes } from '@/lib/app/synths/lib/soundmap';
import type { Mapper } from '@/lib/app/synths/lib/soundmap';
import type { ControlValue, ControlValues, Phrase, SynthDef } from '@/lib/app/synths/contract';
import type { SynthEvent } from '@/lib/app/synths/audio/dsp-core';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { HelpButton, MidiStatus, PanelSwitch } from '@/components/app/synth/bar-controls';
import {
  AudioWaveform,
  Columns4,
  EyeOff,
  Flame,
  Eraser,
  Piano,
  Play,
  RotateCcw,
  ScanSearch,
  Settings2,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getEngine, listen } from '@/components/app/synth/engine';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer } from '@/components/app/sequencer/use-sequencer';
import { useFavourites } from '@/components/app/synth/favourites';
import { FxRack } from '@/components/app/synth/fx-rack';
import { Inspector, Tooltip } from '@/components/app/synth/inspector';
import { Keyboard, OCTAVE_MAX, OCTAVE_MIN, QWERTY } from '@/components/app/synth/keyboard';
import { Lesson, stepIds } from '@/components/app/synth/lesson';
import { Library } from '@/components/app/synth/library';
import { Limits } from '@/components/app/synth/limits';
import { About } from '@/components/app/synth/about';
import { PanelZoom, panelFrameStyle, useKeepCentre } from '@/components/app/synth/panel-zoom';
import { PlayerTip, PlayerTips } from '@/components/app/synth/player-tip';
import { LayerToggle, PlayerSettings } from '@/components/app/synth/player-tools';
import { TutorDrawer } from '@/components/app/synth/drawers';
import { LessonCard, type CardId } from '@/components/app/synth/lesson-card';
import {
  FullscreenButton,
  PlayButton,
  SoundDesign,
  SoundPicker,
  Wordmark,
} from '@/components/app/synth/player';
import type { PanelScale } from '@/components/app/synth/panel-zoom';
import { RotatePrompt, SMALL_QUERY, useMediaQuery } from '@/components/app/synth/rotate-prompt';
import { revealOnPanel } from '@/components/app/synth/reveal';
import { BottomSheet, HALF_HEIGHT, type SheetSnap } from '@/components/app/ui/bottom-sheet';
import { KeptSlot, useKeptNode } from '@/components/app/ui/kept';
import { Lineage } from '@/components/app/synth/lineage';
import { MySoundsList, SoundActions, useMySounds } from '@/components/app/synth/my-sounds';
import { useLessonProgress } from '@/components/app/synth/progress';
import { bankHashRoute } from '@/components/app/bank/routes';
import {
  DEFAULT_VIEW,
  hashTarget,
  parseView,
  sharedSoundHref,
  synthHref,
} from '@/components/app/synth/routes';
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
  fitPanel,
  useStoredPref,
  parseSession,
  readStored,
  sessionKey,
  sharedFromKey,
  useStoredSession,
  writeStored,
} from '@/components/app/synth/storage';
import type { Session } from '@/components/app/synth/storage';
import { useSettings } from '@/components/app/synth/settings';
import {
  MAP_OFF,
  findStore,
  focusStore,
  highlightStore,
  mapStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { SynthPicker } from '@/components/app/synth/synth-picker';
import { Tour } from '@/components/app/synth/tour';
import type { TutorDesign } from '@/components/app/tutor/apply';
import { TutorPanel } from '@/components/app/tutor/tutor-panel';
import { useMidi } from '@/components/app/synth/use-midi';
import { withNotes } from '@/components/app/synth/with-notes';
import {
  SharedSoundStrip,
  sharedSourceGone,
  sharedViewerOf,
  type SharedCopyResult,
} from '@/components/app/sharing/shared-sound-strip';

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
  [
    'The piano',
    'Click or tap its keys. On a computer the Piano button in the bar shows it or puts it away: on a short screen it starts put away, so press Piano to bring it out.',
    <Piano key="piano" size={14} />,
  ],
  [
    'Computer keys',
    'The middle row (A S D F G H J K L ;) plays the white keys and the row above (W E T Y U O P) the black ones, as the letters on the piano show. Z and X move down and up an octave. They play with the piano put away too.',
  ],
  [
    'Octave, Hold and the mod wheel',
    'The − and + beside the piano move it an octave. Hold keeps the notes sounding after you let go, until you play the next one. The wheel on the left is the synth’s mod wheel.',
  ],
  [
    'A MIDI keyboard',
    'Press MIDI in the bar to connect one plugged into this computer, in Chrome or Edge. Its notes and mod wheel both play the panel.',
  ],
  [
    'Play riff',
    'Plays a short original phrase that suits the sound, so you can turn the knobs and hear what they do.',
    <Play key="play" size={13} />,
  ],
  [
    'No sound?',
    'The first note you play turns the sound on. If it is still silent, press Unmute in the bar and check the computer’s volume.',
    <Volume2 key="volume" size={14} />,
  ],
] as const;

type AudioState = 'off' | 'starting' | 'on' | 'error';

/** The side regions, each a bottom sheet below `lg`. */
type SheetId = 'library' | 'lesson' | 'inspector' | 'tutor' | 'sequencer';
const SHEETS: [SheetId, string][] = [
  ['library', 'Library'],
  ['lesson', 'Lesson'],
  ['inspector', 'Inspector'],
  ['tutor', 'Tutor'],
];
/** The dock's piano and scope, shown or put away, as chosen; `null` until the user chooses, and the screen decides. */
const DeckSchema = z.boolean().nullable();
/** A screen tall enough to keep the piano in the dock under the panel without crowding it: it is out by default. */
const TALL_QUERY = '(min-height: 900px)';
/** The side of the panel the lesson card floats on, as stored. */
const CardSideSchema = z.enum(['left', 'right']);
/** How long the pointer may rest before the player's secondary controls fade, as a video's do, in ms. */
const IDLE_MS = 2500;
/** How far above the dock the pointer brings up the Sound Design strip, in px: the strip's height and a little more. */
const STRIP_REACH = 160;
/** How far a press may move and still be a tap, in px. */
const TAP_SLOP = 10;

/** What a copy is called when the shared sound it was of has gone, and its name with it (t-52). The visitor renames it. */
const UNNAMED_COPY = 'Untitled sound';

/** A panel with the synth's first sound loaded and no lesson step: how a synth opens the first time. */
function freshSession(def: SynthDef, preset: CatalogueSound | undefined): Session {
  return { presetId: preset?.id ?? null, step: null, soundId: null, ...presetState(def, preset) };
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
  /** The `sound` query: a library sound to open with, as a databank record's link names it. */
  soundParam?: string | null;
  /** The `mine` query: one of the signed-in user's own sounds to open with, as the dashboard links to it. */
  mineParam?: string | null;
  /** On a shared sound's page: that sound, from `GET /api/v1/public/sounds/:slug`, on this synth. */
  shared?: PublicSound | null;
}

/**
 * The synth's definition is loaded here, not passed in: it holds functions, so it cannot cross from the server
 * page. It is loaded alone (`defs/load.ts`), so the page's bundle carries no definition. Until it arrives the page
 * suspends: the server render waits for it, and a move to another synth keeps the last one showing meanwhile. That
 * last part holds while no loading boundary sits between the route and this component: a `loading.tsx` above it
 * would show its fallback over the panel during each load instead.
 */
export function SynthPage(props: SynthPageProps) {
  const id = props.detail.synth.id;
  const loading = loadSynthDef(id);
  const baseDef = loadedSynthDef(id) ?? (loading ? use(loading) : null);
  // One provider for the player's tips, so moving along the bar opens each at once.
  return baseDef ? (
    <PlayerTips>
      <Synth baseDef={baseDef} {...props} />
    </PlayerTips>
  ) : null;
}

function Synth({
  baseDef,
  detail,
  synths,
  viewParam,
  soundParam = null,
  mineParam = null,
  shared = null,
}: SynthPageProps & { baseDef: AppSynthDef }) {
  const router = useRouter();
  const synthId = baseDef.id;
  const sounds = detail.sounds;
  // What a published sound on this synth may be tagged with (`libraryTags` in `lib/app/sounds/publish.ts`).
  const libraryTags = useMemo(() => [...new Set(sounds.flatMap((p) => p.tags))].sort(), [sounds]);

  // The definition with the catalogue's unusual notes on it. The sound map, when it comes, works from this, so it
  // gives the same answers whichever layout is showing.
  const synthDef = useMemo(
    () => withNotes(baseDef, detail.notes.unusual),
    [baseDef, detail.notes.unusual]
  );

  // ── the view: the query first, then the last choice, then the default ──
  const urlView = useMemo(() => parseView(viewParam), [viewParam]);
  const [view, setViewState] = useState<PanelView>(urlView ?? DEFAULT_VIEW);
  // This page's own address with a view: a shared sound's page keeps its address, until a copy of it is saved and opened
  // as the visitor's own (t-51). Loading the shared sound again takes the address back.
  const [atShared, setAtShared] = useState(true);
  const sharedSlug = atShared ? (shared?.slug ?? null) : null;
  // The view as it is now, for an address written after an await: the one a save started with may have changed since.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  // The shared sound stopped being shared while the page was open (found by Save a copy): its address now 404s.
  const sharedGone = useRef(false);
  const hereHref = useCallback(
    (v: PanelView) =>
      sharedSlug ? sharedSoundHref(synthId, sharedSlug, v) : synthHref(synthId, v),
    [synthId, sharedSlug]
  );
  const setView = useCallback(
    (next: PanelView) => {
      setViewState(next);
      writeStored(STORAGE_KEYS.view, next);
      window.history.replaceState(null, '', hereHref(next));
    },
    [hereHref]
  );

  // On arrival: follow a prototype hash link, remember this synth, and restore the last view if the URL has none.
  // A hash link to this same synth only sets the view: a navigation to the same page keeps this component, and with
  // it the view it started with. A databank link (`#bank/…`) goes to the databank's page.
  useEffect(() => {
    const bank = bankHashRoute(window.location.hash);
    if (bank) {
      router.replace(bank);
      return;
    }
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

  // The session is read before the panel: signed in, the account's last panel replaces the browser's once it arrives.
  const { data: auth, isPending: authPending } = useSession();
  const signedIn = !!auth;
  const userId = auth?.user.id ?? null;
  const [sess, patch] = useStoredSession(synthDef, () => freshSession(synthDef, sounds[0]), userId);
  // `?sound=` loads that sound over whatever was stored, as a fresh panel, then drops out of the URL: a reload should
  // not throw away what was done on the panel since. Declared after the stored session, so it lands after the restore.
  // A sound the library does not have opens the synth as it would have opened anyway. Only `sound` is taken off: the
  // arrival effect above may already have put the restored view in the URL.
  useEffect(() => {
    if (!soundParam) return;
    // The arrival effect is sending the visitor elsewhere: leave this synth's stored panel as it was.
    const hash = window.location.hash;
    const away = hashTarget(hash, (id) => synths.some((s) => s.id === id));
    if (bankHashRoute(hash) || (away && away.id !== synthId)) return;
    const p = sounds.find((x) => x.id === soundParam);
    if (p) patch(() => freshSession(synthDef, p));
    const url = new URL(window.location.href);
    url.searchParams.delete('sound');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  // ── a shared sound (`f-sharing` h2) ──
  // Its panel, while it is what is on the panel: what "controls moved" counts from. Opening anything else clears it.
  const [sharedPanel, setSharedPanel] = useState<Pick<Session, 'values' | 'cables'> | null>(null);
  const [sharedNotice, setSharedNotice] = useState<string | null>(null);
  const leaveShared = () => {
    setSharedPanel(null);
    setSharedNotice(null);
    writeStored(sharedFromKey(synthId), null);
  };

  const preset = sounds.find((p) => p.id === sess.presetId) || sounds[0];
  // A sound the tutor designed, open on the panel (`f-tutor` t-56): its lesson shows until something else opens. Held
  // for the visit only; saving it as one of the user's sounds is what keeps it.
  const [designed, setDesigned] = useState<TutorDesign | null>(null);

  // ── the user's own sounds ──
  // One of theirs is open when the session names it and their list has it: a sound deleted elsewhere, or a session
  // left by someone else signed in on this browser, opens nothing.
  const mine = useMySounds(synthId, signedIn);
  // ── lesson progress and favourites (s4) ──
  const progress = useLessonProgress(synthId, userId);
  const favourites = useFavourites(userId);
  const openSound =
    signedIn && sess.soundId ? (mine.sounds?.find((s) => s.id === sess.soundId) ?? null) : null;
  // The lesson the sound on the panel was saved with (`f-tutor` t-55): one of the user's own, or a shared sound on its
  // page. It is that sound's, so it shows in place of the library's, and stepping through it keeps the sound open.
  const ownLesson = useMemo(() => {
    if (openSound?.lesson)
      return lessonPreset(openSound.lesson, {
        id: `mine:${openSound.id}`,
        name: openSound.name,
        fromTutor: openSound.fromTutor,
      });
    if (sharedPanel && shared?.lesson)
      return lessonPreset(shared.lesson, {
        id: `shared:${shared.slug}`,
        name: shared.name,
        fromTutor: shared.fromTutor,
      });
    return designed?.preset ?? null;
  }, [openSound, sharedPanel, shared, designed]);
  // The sound the lesson, the riff, the sound map and the inspector read.
  const shown = ownLesson ?? preset;
  // A stored step can outrun the sound it is read against (the stored sound was removed, or lost steps): the finished
  // sound, then. A step with one of the user's sounds open belongs to that sound's own lesson, since a library step
  // closes the sound, so it is never read against the library's: not while their list is still loading, and not once
  // the sound or its lesson has gone.
  const step =
    shown &&
    sess.step != null &&
    sess.step < shown.steps.length &&
    (!sess.soundId || ownLesson !== null)
      ? sess.step
      : null;
  // The open sound's panel as last saved: what "controls moved" counts from and Restore puts back.
  const [saved, setSaved] = useState<{
    id: string;
    values: ControlValues;
    cables: Session['cables'];
  } | null>(null);
  const savedOpen = openSound && saved?.id === openSound.id ? saved : null;
  const [mineNotice, setMineNotice] = useState<string | null>(null);
  const signInHref = `/login?callbackUrl=${encodeURIComponent(hereHref(view))}`;

  const libraryTarget = useMemo(
    () => presetState(synthDef, designed?.preset ?? preset).values,
    [synthDef, designed, preset]
  );
  const target = savedOpen ? savedOpen.values : sharedPanel ? sharedPanel.values : libraryTarget;
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  const [audio, setAudio] = useState<AudioState>('off');
  const [playing, setPlaying] = useState(false);
  const [wheel, setWheel] = useState(0);
  const [octave, setOctave] = useState(0);
  const [hold, setHold] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [zoom, setZoom] = useState<number>(0); // magnifier: 0 = off, else the enlargement
  const [scale, setScale] = useState<PanelScale>(1); // the panel's size: 1 fits the page
  const scrollerRef = useKeepCentre(scale);
  const [areasOn, setAreasOn] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const settings = useSettings(userId);
  const [tipsOn, setTipsOn] = settings.tips;
  const [dimOn, setDimOn] = settings.dim;
  const [heatOn, setHeatOn] = settings.heat;
  const [harmOn, setHarmOn] = settings.harm;
  const [fx, setFx] = settings.fx;

  // ── below `lg`: the side regions as bottom sheets ──
  const small = useMediaQuery(SMALL_QUERY);
  const coarse = useMediaQuery('(pointer: coarse)');
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [dockSnap, setDockSnap] = useState<SheetSnap>('half');
  const libraryNode = useKeptNode();
  const lessonNode = useKeptNode();
  const inspectorNode = useKeptNode();
  const tutorNode = useKeptNode();
  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const barRefs = useRef<Partial<Record<SheetId, HTMLButtonElement | null>>>({});
  const openSheet = (id: SheetId | null) => {
    setSheet(id);
    setDockSnap('half');
  };
  // From `lg` up (t-74): the lesson card over the panel, the sounds over the strip, the tutor's drawer over the panel,
  // and the dock's piano. The card's side and the piano are remembered in this browser.
  const [card, setCard] = useState<CardId | null>(null);
  const [cardSide, setCardSide] = useStoredPref(STORAGE_KEYS.cardSide, CardSideSchema, 'right');
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  // On a phone the panel settings are behind a button by the sound's name; from `md` up they are always on show.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The piano is out by default on a tall screen and put away on a short one, until the Piano button says otherwise.
  const tall = useMediaQuery(TALL_QUERY);
  const [deckChoice, setDeckOn] = useStoredPref(STORAGE_KEYS.deck, DeckSchema, null);
  const deckOn = deckChoice ?? tall;
  const tutorBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeTutor = useCallback(() => {
    setTutorOpen(false);
    tutorBtnRef.current?.focus();
  }, []);
  const closeCard = useCallback(() => setCard(null), []);
  const closeSounds = useCallback(() => setSoundsOpen(false), []);
  // The Sound Design strip's sound picker: the library, wherever it is at this width.
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const chooseSound = () => {
    if (small) return openSheet('library');
    if (soundsOpen) return setSoundsOpen(false);
    setSoundsOpen(true);
    // After the popover is shown: a hidden input cannot take focus.
    requestAnimationFrame(() =>
      libraryRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    );
  };
  // A lesson section from the strip: the card from `lg` up, the Lesson sheet below it.
  const openSection = (id: CardId) => {
    if (small)
      return id === 'fx' ? undefined : openSheet(id === 'inspector' ? 'inspector' : 'lesson');
    setCard((c) => (c === id && id !== 'build' ? null : id));
  };

  // From `lg` up the dock is pinned to the bottom of the screen. The page keeps room under it to scroll past, and the
  // panel is fitted to the height between the top of the panel and the dock (`panelFrameStyle` reads the variables).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    const dock = dockRef.current;
    const scroller = scrollerRef.current;
    if (!root || !dock || !scroller) return undefined;
    if (small || typeof ResizeObserver === 'undefined') {
      root.style.removeProperty('--kys-dock-h');
      root.style.removeProperty('--kys-fit-chrome');
      return undefined;
    }
    const measure = () => {
      const dockH = dock.offsetHeight;
      // Full screen, what is above the panel is the player's own top, not the page's header.
      const full = document.fullscreenElement;
      const top = full?.contains(scroller)
        ? scroller.getBoundingClientRect().top - full.getBoundingClientRect().top + full.scrollTop
        : scroller.getBoundingClientRect().top + window.scrollY;
      root.style.setProperty('--kys-dock-h', `${dockH}px`);
      // The space over the panel and under it: what is above it on the page, the scroller's padding and the dock.
      root.style.setProperty('--kys-fit-chrome', `${Math.round(top + dockH + 40)}px`);
    };
    measure();
    // Written on the next frame, not inside the observer's callback: a tall dock (the sequencer open) refits the
    // panel, which resizes the root it also watches, and a resize inside the callback is a "ResizeObserver loop".
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(dock);
    ro.observe(root);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener('fullscreenchange', measure);
    };
  }, [small, scrollerRef]);

  // The Sound Design strip shows while the pointer comes down towards the dock, as a video's chapters do: within
  // `STRIP_REACH` px above it, or over it. Set on the element, not in state, so a pointer move does not render the page.
  useEffect(() => {
    const dock = dockRef.current;
    if (small || !dock) return undefined;
    // The dock's top, read when it or the window changes size rather than on every move: a move can come while a
    // knob or cable drag is re-rendering the panel, and reading layout then forces it.
    let top = dock.getBoundingClientRect().top;
    const remeasure = () => {
      top = dock.getBoundingClientRect().top;
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(dock);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const near = e.clientY >= top - STRIP_REACH;
      if (near !== dock.hasAttribute('data-near')) dock.toggleAttribute('data-near', near);
    };
    const onLeave = () => dock.removeAttribute('data-near');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('resize', remeasure);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', remeasure);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      dock.removeAttribute('data-near');
    };
  }, [small]);

  // The video feel: with the pointer at rest, the player's secondary controls fade until it moves again. Not while
  // the sounds are open. Set on the element, not in state, so resting and waking do not render the page.
  useEffect(() => {
    const root = rootRef.current;
    if (small || soundsOpen || !root) return undefined;
    let t: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      if (root.hasAttribute('data-idle')) root.removeAttribute('data-idle');
      clearTimeout(t);
      t = setTimeout(() => root.setAttribute('data-idle', ''), IDLE_MS);
    };
    wake();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      root.removeAttribute('data-idle');
    };
  }, [small, soundsOpen]);

  // ── audio ──
  const engine = useMemo(() => (typeof window === 'undefined' ? null : getEngine()), []);
  // The sequencer hears the engine's events too (its loops and the playhead): handed over once it exists, below.
  const seqEvents = useRef<(e: SynthEvent) => void>(() => undefined);
  useEffect(() => {
    if (!engine) return undefined;
    // Coming from another synth, the sound may already be on.
    if (engine.running) setAudio('on');
    const unlisten = listen((e) => {
      if (e.type === 'phraseEnd') setPlaying(false);
      seqEvents.current(e);
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
  const soundKey = `${synthId}/${shown?.id ?? ''}/${step}`;
  // The notes the map probes with, as numbers, so a sound re-read with the same riff (a rename, a share) does not
  // restart the analysis.
  const [probeLow, probeHigh] = probeNotes(shown);
  useEffect(() => {
    if (!mapOn) {
      mapperRef.current?.cancel();
      mapStore.set(MAP_OFF);
      return undefined;
    }
    const mapper = (mapperRef.current ??= createMapper());
    // Whatever is still being worked out is for a panel state that has gone: stop it now, not when the next analysis
    // starts after the 300 ms wait, or its answer (or its failure) lands on the store meanwhile. A map of another
    // sound says nothing about this one, so it goes at once. After a knob move the old map stays up until the new
    // one is ready.
    mapper.cancel();
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
          [probeLow, probeHigh],
          (progress) =>
            mapStore.set((m) => (m.state || m.key !== soundKey ? m : { ...m, progress })),
          (res) =>
            mapStore.set((m) =>
              m.key === soundKey
                ? { status: 'ready', progress: 1, key: soundKey, why: {}, ...res }
                : m
            ),
          // The analysis threw part-way (the mapper has logged it): leave "Working out…" for a line saying the map
          // could not be worked out, rather than hang there or vanish. The panel draws nothing for it, as for off. The
          // next change to the sound tries again.
          () =>
            mapStore.set((m) =>
              m.key === soundKey ? { ...MAP_OFF, status: 'failed', key: soundKey } : m
            )
        );
      } catch {
        mapStore.set(MAP_OFF); // toEngine threw: the panel already reports that
      }
    }, 300);
    return () => clearTimeout(t);
  }, [mapOn, synthDef, sess.values, sess.cables, wheel, probeLow, probeHigh, soundKey]);

  const heldRef = useRef(new Set<number>());
  // The keys down now, held or not, as presses per note (a MIDI key and a computer key can both be on one note): under
  // Hold, a note pressed while another is down joins the chord.
  const downRef = useRef(new Map<number, number>());
  const noteOn = useCallback(
    (n: number, v = 0.85) => {
      if (!engine) return;
      void ensureAudio();
      if (hold) {
        // A fresh press, with every key up, replaces what is held.
        if (downRef.current.size === 0) {
          heldRef.current.forEach((h) => engine.send({ type: 'noteOff', n: h }));
          heldRef.current.clear();
        }
        heldRef.current.add(n);
      }
      downRef.current.set(n, (downRef.current.get(n) ?? 0) + 1);
      engine.send({ type: 'noteOn', n, v });
    },
    [engine, ensureAudio, hold]
  );
  // Hold keeps only the notes started under it: one already sounding when Hold went on still stops when released.
  const noteOff = useCallback(
    (n: number) => {
      const presses = (downRef.current.get(n) ?? 0) - 1;
      // Another input still pressing this note keeps it sounding.
      if (presses > 0) {
        downRef.current.set(n, presses);
        return;
      }
      downRef.current.delete(n);
      if (!hold || !heldRef.current.has(n)) engine?.send({ type: 'noteOff', n });
    },
    [engine, hold]
  );
  const setHoldMode = (h: boolean) => {
    setHold(h);
    if (!h) {
      // A note whose key is still down keeps sounding, and stops when it is let go.
      heldRef.current.forEach((n) => {
        if (!downRef.current.has(n)) engine?.send({ type: 'noteOff', n });
      });
      heldRef.current.clear();
      // And a release that never arrived (a key let go outside the window) is forgotten, so Hold starts clean.
      downRef.current.clear();
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
  // The sequencer (`f-step-sequencer` t-80): it holds the sound's riff as a pattern. Play riff and the sequencer are one
  // transport: with the sequencer open, Play plays the pattern; either one starting stops the other, and Stop stops both.
  const [seqOpen, setSeqOpen] = useState(false);
  const seq = useSequencer({
    engine,
    ensureAudio,
    riff: shown?.phrase ?? null,
    tempo: tempoBpm,
  });
  const { stop: stopPattern, play: startPattern, onEvent: seqOnEvent } = seq;
  useEffect(() => {
    seqEvents.current = seqOnEvent;
  }, [seqOnEvent]);
  const stopRiff = useCallback(() => {
    engine?.send({ type: 'stopPhrase' });
    setPlaying(false);
    stopPattern();
  }, [engine, stopPattern]);
  // A pattern starting stops a riff in the engine; the riff's button is told here.
  const playPattern = useCallback(async () => {
    if (await startPattern()) setPlaying(false);
  }, [startPattern]);
  // Open in the dock from `lg` up, in its sheet below it.
  const seqShown = small ? sheet === 'sequencer' : seqOpen;
  const transportPlaying = playing || seq.playing;
  const toggleSequencer = () => {
    const opening = !seqShown;
    if (small) openSheet(opening ? 'sequencer' : null);
    else setSeqOpen(opening);
    // Opened while the riff plays, the pattern takes over: it is the riff, until it is edited.
    if (opening && playing) void playPattern();
  };
  const playRiff = useCallback(
    async (ph: Phrase) => {
      if (!engine || !(await ensureAudio())) return;
      // A riff stops a pattern in the engine, without a word: the sequencer is told here.
      stopPattern();
      engine.send({
        type: 'phrase',
        phrase: tempoRef.current ? { ...ph, bpm: tempoRef.current } : ph,
      });
      setPlaying(true);
    },
    [engine, ensureAudio, stopPattern]
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
    // A modal bottom sheet does the same; a docked one leaves the panel live, and its keys with it.
    const inModal = (e: KeyboardEvent) =>
      e.target instanceof Element &&
      !!e.target.closest('dialog:not([data-plays]), [data-kys-sheet="modal"]');
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
        const nv = v === null ? targetRef.current[id] : v;
        if (nv === undefined || s.values[id] === nv) return s;
        return { ...s, values: { ...s.values, [id]: nv } };
      }),
    [patch]
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

  // Each choice of what is on the panel counts here, so a user sound still being fetched does not open over a later one.
  const openSeq = useRef(0);
  const selectPreset = (id: string) => {
    const p = sounds.find((x) => x.id === id);
    if (!p) return;
    openSeq.current++;
    focusStore.set(null);
    leaveShared();
    setDesigned(null);
    patch(() => ({ presetId: id, step: null, soundId: null, ...presetState(synthDef, p) }));
    if (playing) void playRiff(p.phrase);
  };

  // A sound the tutor designed opens as choosing a library sound does, with its own lesson in the Lesson panel. The
  // tutor's Undo is handed what puts back everything that was on the panel before, its lesson and step included.
  const openDesign = (d: TutorDesign) => {
    const before = { sess, designed, sharedPanel };
    openSeq.current++;
    focusStore.set(null);
    leaveShared();
    setDesigned(d);
    patch(() => ({
      presetId: null,
      step: null,
      soundId: null,
      ...presetState(synthDef, d.preset),
    }));
    if (playing) void playRiff(d.preset.phrase);
    return () => {
      openSeq.current++;
      setDesigned(before.designed);
      if (before.sharedPanel && shared) {
        setSharedPanel(before.sharedPanel);
        writeStored(sharedFromKey(synthId), shared.slug);
      }
      patch(() => before.sess);
    };
  };
  // A change the learner applied from the tutor lands as turning the controls would: the step and the sound stay.
  const setTutorPanel = useCallback(
    (p: PanelState) => patch((s) => ({ ...s, values: p.values, cables: p.cables })),
    [patch]
  );
  const tutorPanel = useMemo(
    () => ({ values: sess.values, cables: sess.cables }),
    [sess.values, sess.cables]
  );
  // The library's "ask the tutor to design one": the question goes in the tutor's composer, for the learner to send.
  const [tutorAsk, setTutorAsk] = useState<{ text: string; n: number } | null>(null);
  const askTutor = (query: string) => {
    setTutorAsk((a) => ({ text: `Design a sound: ${query}`, n: (a?.n ?? 0) + 1 }));
    if (small) openSheet('tutor');
    else setTutorOpen(true);
  };

  // Open one of the user's sounds: it replaces the panel, as choosing a library sound does. One the synth has moved on
  // from opens with what still fits, and says what did not.
  const openMine = async (id: string) => {
    const seq = ++openSeq.current;
    setMineNotice(null);
    let d: UserSoundDetail;
    try {
      d = await apiClient.get<UserSoundDetail>(`/api/v1/sounds/${encodeURIComponent(id)}`);
    } catch {
      if (seq === openSeq.current)
        setMineNotice('That sound could not be opened. It may have been deleted.');
      return;
    }
    if (seq !== openSeq.current) return;
    // A link can name a sound saved on another synth; this panel cannot hold it.
    if (d.synthId !== synthId) {
      setMineNotice(`${d.name} was saved on another synth, so it cannot be opened on this one.`);
      return;
    }
    const from = d.panel ?? d.fitted;
    if (!from) {
      setMineNotice(`${d.name} cannot be opened here: ${d.problems.join(' ')}`);
      return;
    }
    const panel = fitPanel(synthDef, from.values, from.cables);
    // A copy keeps its library sound's lesson beside it while the library still has that sound. Any other leaves the
    // library sound that was on the panel behind, so it is not credited or read as this one's.
    const lib = d.source && sounds.some((x) => x.id === d.source?.slug) ? d.source.slug : null;
    focusStore.set(null);
    leaveShared();
    setDesigned(null);
    patch(() => ({ presetId: lib, step: null, soundId: d.id, ...panel }));
    setSaved({ id: d.id, ...panel });
    mine.put(d);
    if (!d.panel)
      setMineNotice(
        `${d.name} no longer fits this synth as it is now, so it opened with what does. ${d.problems.join(' ')} Save it to keep it this way.`
      );
  };

  // A reload with one of theirs open: fetch its saved panel, so "controls moved" and Restore count from it.
  useEffect(() => {
    if (!openSound || saved?.id === openSound.id) return undefined;
    let live = true;
    apiClient
      .get<UserSoundDetail>(`/api/v1/sounds/${encodeURIComponent(openSound.id)}`)
      .then((d) => {
        const from = d.panel ?? d.fitted;
        if (live && from) setSaved({ id: d.id, ...fitPanel(synthDef, from.values, from.cables) });
      })
      .catch(() => undefined); // nothing to count from; the panel itself is unaffected
    return () => {
      live = false;
    };
  }, [openSound, saved?.id, synthDef]);

  // `?mine=` opens that sound once the session is known, then drops out of the URL, as `?sound=` does.
  const mineArrived = useRef(false);
  useEffect(() => {
    if (!mineParam || authPending || mineArrived.current) return;
    mineArrived.current = true;
    // The arrival effect is sending the visitor elsewhere: leave this synth's stored panel as it was.
    const hash = window.location.hash;
    const away = hashTarget(hash, (id) => synths.some((s) => s.id === id));
    if (bankHashRoute(hash) || (away && away.id !== synthId)) return;
    if (signedIn) void openMine(mineParam);
    const url = new URL(window.location.href);
    url.searchParams.delete('mine');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [authPending, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the session is known

  // Load the shared sound onto the panel, as opening one of the user's does. `keep`: the stored panel was opened from
  // this sound already (a reload), so it stays as the visitor left it, and only what "controls moved" counts from is set.
  const loadShared = (keep = false) => {
    if (!shared) return;
    const from = shared.panel ?? shared.fitted;
    if (!from) {
      setSharedNotice(`${shared.name} cannot be played on this synth as it is now.`);
      return;
    }
    const panel = fitPanel(synthDef, from.values, from.cables);
    // a copy of a library sound keeps that sound's lesson beside it while the library has it, as one of yours does
    const lib =
      shared.source && sounds.some((x) => x.id === shared.source?.slug) ? shared.source.slug : null;
    openSeq.current++;
    focusStore.set(null);
    setDesigned(null);
    // Kept, it still counts as the visitor's change, so the account's last panel arriving later does not replace it.
    if (keep) patch((s) => s);
    else patch(() => ({ presetId: lib, step: null, soundId: null, ...panel }));
    writeStored(sharedFromKey(synthId), shared.slug);
    setSharedPanel(panel);
    setSharedNotice(
      shared.panel
        ? null
        : `${shared.name} no longer fits this synth as it is now, so it opened with what does.`
    );
    if (!atShared && !sharedGone.current) {
      setAtShared(true);
      window.history.replaceState(null, '', sharedSoundHref(synthId, shared.slug, viewRef.current));
    }
  };
  // On arrival, over whatever was stored, as `?sound=` does: the address names this sound. The account's last panel
  // does not replace it when it arrives, since this counts as a change the visitor made. A reload is not an arrival
  // (t-51): when the stored panel was opened from this same sound, what the visitor did to it since is kept.
  useEffect(() => {
    if (!shared) return;
    const hash = window.location.hash;
    const away = hashTarget(hash, (id) => synths.some((s) => s.id === id));
    if (bankHashRoute(hash) || (away && away.id !== synthId)) return;
    const reload =
      readStored(sharedFromKey(synthId)) === shared.slug &&
      parseSession(synthDef, readStored(sessionKey(synthId))) !== null;
    loadShared(reload);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  // The panel as the sounds API takes it, remembered so a save can count from exactly what was sent.
  const sentRef = useRef<Pick<Session, 'values' | 'cables'> | null>(null);
  const panelInput = () => {
    sentRef.current = { values: sess.values, cables: sess.cables };
    return {
      values: sess.values,
      cables: sess.cables.map((c): [string, string] => [c.from, c.to]),
    };
  };
  const onSaved = (d: UserSoundDetail, how: 'created' | 'saved' | 'renamed' | 'shared') => {
    mine.put(d);
    setMineNotice(null);
    if (how === 'renamed' || how === 'shared') return;
    if (sentRef.current) setSaved({ id: d.id, ...sentRef.current });
    if (how === 'created') {
      leaveShared();
      // A designed sound saved is one of theirs now, with its lesson kept with it.
      setDesigned(null);
      patch((s) => ({ ...s, soundId: d.id }));
      // On a shared sound's page the new sound is what is open now, so the address becomes the synth's own and a reload
      // opens it rather than the shared sound (t-51).
      if (shared) {
        setAtShared(false);
        window.history.replaceState(null, '', synthHref(synthId, viewRef.current));
      }
    }
  };

  // Save a copy of the shared sound: the panel as it is, so what the visitor changed is kept, with the shared sound
  // credited. It then opens as theirs, as a new save does, and the address becomes the synth's own, so a reload opens
  // the copy rather than the shared sound (t-51). If the original has stopped being shared since the page opened, there
  // is nothing to credit: the panel alone is saved as a new sound of theirs, under a name of no one's, and says so. Its
  // owner's name and notes stay out of it: they were withdrawn with the sound (t-52).
  const copyShared = async (): Promise<SharedCopyResult> => {
    if (!shared) return { ok: false, error: 'There is no shared sound to copy.' };
    const seq = openSeq.current;
    const panel = panelInput();
    let gone = false;
    let d: UserSoundDetail;
    try {
      d = await apiClient.post<UserSoundDetail>('/api/v1/sounds', {
        body: { synthId, source: { shared: shared.slug }, panel },
      });
    } catch (err) {
      if (!sharedSourceGone(err))
        return { ok: false, error: 'The copy could not be saved. Try again.' };
      try {
        d = await apiClient.post<UserSoundDetail>('/api/v1/sounds', {
          body: { synthId, name: UNNAMED_COPY, panel },
        });
      } catch {
        return { ok: false, error: 'The copy could not be saved. Try again.' };
      }
      gone = true;
      sharedGone.current = true;
    }
    // something else was opened while it saved: the copy is in My sounds, but not what is on the panel now
    if (seq !== openSeq.current) mine.put(d);
    else onSaved(d, 'created');
    return {
      ok: true,
      note: gone
        ? `This sound is not shared any more, so your panel was saved to My sounds as a new sound of yours called “${UNNAMED_COPY}”, without the original's name or notes. You can rename it.`
        : null,
    };
  };
  // Who is looking, as the strip needs it (`sharedViewerOf`).
  const ownShared =
    shared && mine.sounds ? mine.sounds.find((x) => x.slug === shared.slug) : undefined;
  const sharedViewer = sharedViewerOf({
    slug: shared?.slug ?? '',
    authPending,
    signedIn,
    mine: mine.sounds,
  });
  const onDeleted = (id: string) => {
    mine.remove(id);
    setSaved(null);
    // A step of its own lesson goes with it; the panel stays as it is.
    patch((s) => (s.soundId === id ? { ...s, soundId: null, step: null } : s));
  };
  // What a new sound from this panel credits: the library sound it came from, or the one the open sound was copied
  // from, while the library has it.
  const creditSound = openSound
    ? sounds.find((p) => p.id === openSound.source?.slug)
    : sounds.find((p) => p.id === sess.presetId);
  const credit = creditSound ? { slug: creditSound.id, name: creditSound.name } : null;
  // A lesson step sets the panel to the sound as far as that step; `null` is the finished sound. Like choosing a
  // library sound, it replaces the panel, so one of the user's that was open is no longer what Save writes to.
  // Signed in, a step further than the user had got is recorded, and Finish from the last step finishes the lesson.
  // The open sound's own lesson is the exception: the sound stays open (its lesson goes with it), and nothing is
  // recorded, since progress is kept for the library's lessons.
  // The page lights a step's controls only once a step has been picked on this synth since the page opened: a step
  // restored from the stored session (on a refresh, or coming back to a synth) leaves the panel unlit.
  const [litFor, setLitFor] = useState<string | null>(null);
  const setStep = (k: number | null) => {
    setLitFor(synthId);
    // A full-height Lesson sheet would cover the step's controls: it drops to half, and they scroll into view above it.
    if (small && sheet === 'lesson') setDockSnap('half');
    if (ownLesson) {
      openSeq.current++;
      patch((s) => ({ ...s, step: k, ...presetState(synthDef, ownLesson, k) }));
      return;
    }
    leaveShared();
    if (preset && k != null) progress.record(preset.id, k);
    else if (preset && step != null && step === preset.steps.length - 1)
      progress.record(preset.id, step, true);
    openSeq.current++;
    patch((s) => {
      const from = sounds.find((p) => p.id === s.presetId) || sounds[0];
      return {
        ...s,
        presetId: from?.id ?? null,
        step: k,
        soundId: null,
        ...presetState(synthDef, from, k),
      };
    });
  };
  // With the Lesson sheet open at half height, the step's controls are scrolled into the band above it: on opening, on
  // each step, and when the sheet drops back to half. Full height covers the panel, so there is nothing to scroll to.
  // The band is worked out from the half height rather than measured: dropping from full, the sheet is still shrinking.
  const stepKey = shown && step != null ? stepIds(shown.steps[step]).join('|') : '';
  // From `lg` up the lesson is not on the page (it is in the card, when that is open), so the page lights the step's
  // controls itself while the panel is at a step picked here, as the lesson does in its sheet below `lg`.
  const litKey = litFor === synthId ? stepKey : '';
  // What a hovered chapter puts back when it is left: below `lg` the Lesson in its sheet keeps the step lit, and from
  // `lg` up so does the lesson card while it shows the lesson.
  const chapterLit = small || card === 'build' ? stepKey : litKey;
  useEffect(() => {
    if (small) return undefined;
    highlightStore.set(litKey ? litKey.split('|') : []);
    return () => highlightStore.set([]);
  }, [small, litKey]);
  useEffect(() => {
    if (!small || sheet !== 'lesson' || dockSnap !== 'half' || !stepKey) return undefined;
    const t = requestAnimationFrame(() => {
      const svg = frameRef.current?.querySelector('svg');
      if (svg)
        revealOnPanel({
          svg,
          scroller: scrollerRef.current,
          def,
          ids: stepKey.split('|'),
          sheetTop: window.innerHeight * (1 - HALF_HEIGHT),
        });
    });
    return () => cancelAnimationFrame(t);
  }, [small, sheet, dockSnap, stepKey, def, scrollerRef]);

  // On a small touch screen a tap on the panel opens the Inspector on what was tapped, in place of the floating card.
  // Not while another sheet is up, and not on the first tap of a cable being plugged in, which the second tap needs.
  // Only a tap that pointed at something: the focus stays on the last thing touched, so a tap on bare panel would
  // otherwise open it on that. So the focus is taken as the finger arrives, before the part under it sets its own, and
  // the tap counts only if it changed. And not a finger of a gesture that used more than one: a second finger is not
  // the primary pointer, and its arrival ends the first one's tap.
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const focusBefore = useRef<ReturnType<typeof focusStore.get>>(null);
  const panelTaps = small
    ? {
        onPointerOverCapture: (e: ReactPointerEvent) => {
          if (e.pointerType !== 'mouse' && e.isPrimary !== false)
            focusBefore.current = focusStore.get();
        },
        onPointerDownCapture: (e: ReactPointerEvent) => {
          tapRef.current =
            e.pointerType === 'mouse' || e.isPrimary === false
              ? null
              : { x: e.clientX, y: e.clientY };
        },
        onPointerCancelCapture: () => {
          tapRef.current = null;
        },
        onPointerUpCapture: (e: ReactPointerEvent) => {
          if (e.isPrimary === false) return;
          const t = tapRef.current;
          tapRef.current = null;
          if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) return;
          // after the press's own click, which may be what sets the focus
          setTimeout(() => {
            const focus = focusStore.get();
            if (pendingStore.get() || !focus || focus === focusBefore.current) return;
            setSheet((s) => (s === null || s === 'inspector' ? 'inspector' : s));
          });
        },
      }
    : {};

  const closeTour = useCallback(() => setTourOn(false), []);
  const switchSynth = (id: string) => {
    if (id === synthId) return;
    router.push(synthHref(id, view));
  };

  // Nothing to count from while the open sound's saved panel is still being fetched, or could not be.
  const changed = def.controls.filter(
    (c) => step == null && (!openSound || savedOpen) && sess.values[c.id] !== target[c.id]
  ).length;
  const toggleAudio = async () => {
    if (!engine) return;
    if (audio === 'on') {
      setPlaying(false);
      stopPattern();
      await engine.suspend();
      setAudio('off');
      meterStore.set((m) => ({ ...m, power: false, gate: false }));
      notesStore.set([]);
    } else void ensureAudio();
  };

  // The regions beside the panel: in the grid at `lg` and up, each in a bottom sheet below it.
  const library = (
    <div ref={libraryRef} className="flex min-h-0 flex-col gap-5">
      <MySoundsList
        signedIn={authPending ? null : signedIn}
        synthName={def.name}
        signInHref={signInHref}
        sounds={mine.sounds}
        failed={mine.failed}
        currentId={openSound?.id ?? null}
        onOpen={(id) => {
          if (small) openSheet(null);
          else setSoundsOpen(false);
          void openMine(id);
        }}
        isStarred={(id) => favourites.isOn({ kind: 'mine', soundId: id })}
        onStar={(id) => favourites.toggle({ kind: 'mine', soundId: id })}
      />
      <Library
        presets={sounds}
        currentId={openSound || ownLesson ? null : (preset?.id ?? null)}
        onSelect={(id) => {
          if (small) openSheet(null);
          else setSoundsOpen(false);
          selectPreset(id);
        }}
        marks={progress.marks}
        isStarred={(slug) => favourites.isOn({ kind: 'sound', synthId, slug })}
        onStar={(slug) => favourites.toggle({ kind: 'sound', synthId, slug })}
        onAskTutor={askTutor}
      />
    </div>
  );
  const lesson = shown ? (
    <Lesson
      def={def}
      preset={shown}
      step={step}
      onStep={setStep}
      mark={ownLesson ? null : (progress.marks?.get(shown.id) ?? null)}
    />
  ) : (
    <p className="text-sm text-(--kys-muted)">
      There are no library sounds for the {def.name} yet, so there&apos;s no lesson to show. The
      panel still plays.
    </p>
  );
  const inspector = (
    <div className="flex flex-col gap-4">
      <Inspector
        def={def}
        values={sess.values}
        target={step == null ? target : null}
        preset={shown ?? null}
        cables={sess.cables}
        onChange={onChange}
        onConnect={onConnect}
        onUnplug={onUnplug}
      />
    </div>
  );
  const tutor = (
    <TutorPanel
      def={synthDef}
      panel={tutorPanel}
      designedId={designed && !openSound ? designed.id : null}
      signedIn={authPending ? null : signedIn}
      signInHref={signInHref}
      setPanel={setTutorPanel}
      openDesign={openDesign}
      ask={tutorAsk}
      fill
    />
  );
  const linkBtn = 'kys-label text-(--kys-accent) underline-offset-2 hover:underline';
  const smallBtn =
    'rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-(--kys-muted) hover:text-(--kys-text)';
  // The buttons beside the sound's name: the height, type and weight of the panel settings' switches on the same row.
  const rowBtn =
    'inline-flex h-9 items-center rounded-md border border-(--kys-line) bg-(--kys-surface) px-3.5 text-xs font-semibold whitespace-nowrap text-(--kys-muted) hover:text-(--kys-text)';

  const loadedName = openSound
    ? openSound.name
    : sharedPanel && shared
      ? shared.name
      : designed
        ? designed.name
        : preset
          ? preset.name
          : 'Blank patch';
  // What the description says about the sound: the one on the panel, so not a library sound's words under one of the
  // user's own, or under a shared sound, that has no lesson of its own.
  const described = openSound || sharedPanel ? ownLesson : (ownLesson ?? preset ?? null);
  const steps = shown?.steps ?? [];
  // What Restore puts back, when there is anything to: the shared sound, the user's as saved, the tutor's design, or
  // the library sound.
  const restoreFrom =
    changed === 0
      ? null
      : sharedPanel
        ? 'shared'
        : savedOpen
          ? 'saved'
          : designed && !openSound
            ? 'designed'
            : !openSound && preset
              ? 'library'
              : null;
  const restoreSound = () => {
    if (restoreFrom === 'shared' && sharedPanel)
      patch((s) => ({ ...s, step: null, ...sharedPanel }));
    else if (restoreFrom === 'saved' && savedOpen)
      patch((s) => ({ ...s, step: null, values: savedOpen.values, cables: savedOpen.cables }));
    else if (restoreFrom === 'designed' && designed)
      patch((s) => ({ ...s, step: null, ...presetState(synthDef, designed.preset) }));
    else if (restoreFrom === 'library' && preset) selectPreset(preset.id);
  };

  return (
    <div
      ref={rootRef}
      className="kys-synth mx-auto flex w-full max-w-[1720px] flex-col gap-5 px-4 pt-4 pb-10 sm:px-6"
    >
      <RotatePrompt />
      {shared && (
        <SharedSoundStrip
          sound={shared}
          loaded={sharedPanel !== null}
          onLoad={() => loadShared()}
          viewer={sharedViewer}
          signInHref={signInHref}
          onCopy={copyShared}
          onOpen={() => ownShared && void openMine(ownShared.id)}
          buttonClass={smallBtn}
        />
      )}

      <div>
        <div className="flex min-w-0 flex-col gap-5">
          {/* The player: the panel on its stage, the lesson as its chapters, the transport, and the keyboard as its deck. */}
          <section ref={playerRef} aria-label={`${def.name} panel`} className="kys-player">
            <div className="kys-player-stage">
              {/* The row over the panel: the synth and what it is on the left, with its history and what is not
              modelled under the description; the layers, the inspector, the tutor and the tour on the
              right, with their words from `xl` up. The secondary parts fade with the bar while the pointer rests. From
              `lg` up it never wraps, so the panel keeps the height: the description is cut at two lines. */}
              <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 pt-3 pb-1 sm:px-5 lg:flex-nowrap lg:items-center lg:gap-x-4 lg:pt-2 lg:pb-2.5">
                <div className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-1 lg:flex-nowrap lg:items-center lg:gap-x-4">
                  <h1 className="sr-only">
                    {detail.synth.maker} {detail.synth.name} · {detail.synth.heritage}
                  </h1>
                  <div className="shrink-0">
                    <SynthPicker
                      variant="caption"
                      synths={synths}
                      synthId={synthId}
                      onSelect={switchSynth}
                      isStarred={(id) => favourites.isOn({ kind: 'synth', synthId: id })}
                      onStar={(id) => favourites.toggle({ kind: 'synth', synthId: id })}
                    />
                  </div>
                  <div className="kys-autohide flex max-w-[72ch] min-w-0 flex-col gap-0.5 pb-1 text-[13px] text-(--kys-muted) lg:pb-0">
                    <p className="leading-snug lg:line-clamp-2">{detail.synth.heritage}</p>
                    <p className="flex flex-wrap items-baseline gap-x-3 [&>button]:whitespace-nowrap">
                      <button type="button" onClick={() => setAboutOpen(true)} className={linkBtn}>
                        About ›
                      </button>
                      {detail.lineage && (
                        <button
                          type="button"
                          onClick={() => setLineageOpen(true)}
                          className={linkBtn}
                        >
                          History ›
                        </button>
                      )}
                      <button type="button" onClick={() => setLimitsOpen(true)} className={linkBtn}>
                        What is not modelled ›
                      </button>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 max-sm:w-full lg:shrink-0">
                  {/* On a phone: the layers share one row, evenly, with the tour and its help under them. */}
                  <div className="kys-autohide flex flex-wrap items-center gap-1 max-sm:flex-1 max-sm:gap-2">
                    <div
                      role="group"
                      aria-label="Layers over the panel"
                      className="flex items-center gap-1 max-sm:grid max-sm:w-full max-sm:grid-cols-3"
                    >
                      <LayerToggle
                        label="Explain sections"
                        short="Sections"
                        icon={<Shapes size={17} aria-hidden="true" />}
                        on={areasOn}
                        title="Colour in every named part of the panel, and explain what it does when you point at it."
                        onClick={() => {
                          setAreasOn(!areasOn);
                          setTourOn(false);
                          findStore.set(null);
                          focusStore.set((f) => (f && f.kind === 'area' ? null : f));
                        }}
                      />
                      <LayerToggle
                        label="Dim unused parts"
                        short="Dim unused"
                        icon={<EyeOff size={17} aria-hidden="true" />}
                        on={dimOn}
                        title="Darken every part of the panel that is not part of the sound as it is set now. Point at a dark control to see what would bring it in."
                        onClick={() => setDimOn(!dimOn)}
                      />
                      <LayerToggle
                        label="Show sensitive controls"
                        short="Sensitive"
                        icon={<Flame size={17} aria-hidden="true" />}
                        on={heatOn}
                        title="Put a glow behind the controls where a small move changes the sound most. The bigger and stronger the glow, the more effect. The three strongest are numbered."
                        onClick={() => setHeatOn(!heatOn)}
                      />
                    </div>
                    {!small && (
                      <div
                        role="group"
                        aria-label="Over the panel"
                        className="flex items-center gap-1"
                      >
                        <LayerToggle
                          label="Inspector"
                          short="Inspect"
                          icon={<ScanSearch size={17} aria-hidden="true" />}
                          on={card === 'inspector'}
                          title="Open the inspector over the panel: what the control under the pointer does, and its value."
                          onClick={() => openSection('inspector')}
                        />
                      </div>
                    )}
                    <span className="ml-1 flex items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:[&>*:first-child]:flex-1">
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
                      <HelpButton title="How to use the panel" items={PANEL_HELP} />
                    </span>
                  </div>
                  {/* The tutor at the far right, named and always on show: it does not fade with the tools when the
                  pointer rests. */}
                  {!small && (
                    <LayerToggle
                      ref={tutorBtnRef}
                      label="Ask AI tutor"
                      short="Ask AI"
                      keepShort
                      hoverFill
                      icon={<Sparkles size={17} aria-hidden="true" />}
                      on={tutorOpen}
                      title="Ask the tutor about this synth, or have it design a sound. It slides in over the panel."
                      onClick={() => (tutorOpen ? closeTutor() : setTutorOpen(true))}
                    />
                  )}
                </div>
              </header>

              <div
                ref={scrollerRef}
                className="kys-scroll kys-panel-scroller overflow-x-auto p-2"
                {...panelTaps}
              >
                <div
                  ref={frameRef}
                  data-testid="panel-frame"
                  className={`mx-auto ${view.outline ? '' : 'kys-synth-shadow'}`}
                  style={panelFrameStyle(def.view, scale)}
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
                    design={detail.synth.design}
                  />
                </div>
              </div>
              {/* Under the panel, on the stage with it: the sound's name and what you can do with it on the left; how the
              panel is drawn and find a control on the right; and what the sound is under both. The name comes first:
              it stays on one line, and as the screen narrows the search gives up its width, then the tools wrap
              under the name. */}
              <div className="px-3 pt-4 pb-3 sm:px-6">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <section
                    aria-label="The sound on the panel"
                    className="max-w-full min-w-0 max-md:flex-1"
                  >
                    {/* The sound's name, and beside it what can be done with it: keep it, or unplug its cables. */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="flex max-w-full min-w-0 items-baseline gap-x-2.5">
                        <span className="sr-only">Loaded:</span>
                        <span className="kys-sound-title truncate" title={loadedName}>
                          {loadedName}
                        </span>
                        {openSound && (
                          <span className="shrink-0 rounded border border-(--kys-line) px-1.5 py-0.5 font-mono text-xs text-(--kys-muted)">
                            mine
                          </span>
                        )}
                        {designed && !openSound && (
                          <span className="shrink-0 rounded border border-(--kys-line) px-1.5 py-0.5 font-mono text-xs text-(--kys-muted)">
                            from the tutor
                          </span>
                        )}
                        {changed > 0 && (
                          <span className="shrink-0 text-sm text-(--kys-accent)">
                            {changed} control{changed === 1 ? '' : 's'} moved
                          </span>
                        )}
                      </p>
                      {/* Not until the open sound is known: without it, Save would make a new sound instead of
                        saving this one. Not while a shared sound is on the panel either: saving it is Save a copy, which
                        credits it. */}
                      {!authPending &&
                        !sharedPanel &&
                        !(signedIn && sess.soundId && !mine.sounds) && (
                          <SoundActions
                            synthId={synthId}
                            signedIn={signedIn}
                            signInHref={signInHref}
                            open={openSound}
                            midLesson={ownLesson !== null && step != null}
                            credit={credit}
                            design={designed && !openSound ? designed : null}
                            panel={panelInput}
                            onSaved={onSaved}
                            onDeleted={onDeleted}
                            libraryTags={libraryTags}
                            buttonClass={rowBtn}
                          />
                        )}
                      {sess.cables.length > 0 && (
                        <button
                          type="button"
                          onClick={() => patch((s) => ({ ...s, cables: [] }))}
                          className={rowBtn}
                        >
                          Unplug all
                        </button>
                      )}
                    </div>
                  </section>
                  <button
                    type="button"
                    aria-label="Panel settings"
                    aria-expanded={settingsOpen}
                    aria-controls="kys-tools"
                    onClick={() => setSettingsOpen(!settingsOpen)}
                    className={`${rowBtn} ml-auto px-2.5 md:hidden ${settingsOpen ? 'text-(--kys-text)' : ''}`}
                  >
                    <Settings2 size={17} aria-hidden="true" />
                  </button>
                  <div
                    id="kys-tools"
                    data-settings={settingsOpen ? 'open' : 'closed'}
                    className="kys-tools kys-autohide"
                  >
                    <PlayerSettings
                      view={view}
                      onView={setView}
                      modular={!!synthDef.modular}
                      zoom={zoom}
                      onZoom={setZoom}
                      tipsOn={tipsOn}
                      onTips={setTipsOn}
                    />
                    <Search def={def} up className="kys-tools-find" />
                  </div>
                </div>
                {/* What the sound is, under its name as a video's description is under its title. */}
                {(described || mineNotice || sharedNotice) && (
                  <div className="mt-3 min-w-0">
                    {described && (
                      <section
                        aria-label="About the sound"
                        className="mt-1 max-w-[80ch] text-sm leading-relaxed text-(--kys-muted)"
                      >
                        <p className="kys-label text-(--kys-faint)">{described.ref}</p>
                        <p className="mt-0.5">{described.blurb}</p>
                      </section>
                    )}
                    {(mineNotice || sharedNotice) && (
                      <p role="status" className="mt-1 max-w-[80ch] text-sm text-(--kys-warn)">
                        {mineNotice ?? sharedNotice}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {(!areasOn || mapOn || engineError) && (
                <div className="px-4 pb-3 empty:hidden sm:px-6">
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
                  {engineError && (
                    <p role="alert" className="mt-2 text-sm text-(--kys-warn)">
                      This panel setting could not be turned into sound: {engineError}
                    </p>
                  )}
                </div>
              )}
              {areasOn && (
                <p className="px-4 pb-3 text-xs text-(--kys-accent) sm:px-6">
                  Explain sections is on: point at (or tap) a coloured section to read what it does.
                  Knobs and jacks are locked until you turn it off.
                </p>
              )}
            </div>

            {/* The dock: the Sound Design strip, the bar and the deck. From `lg` up it is pinned to the bottom of the
            screen, and what opens from it (the lesson card, the sounds, the tutor) floats over the panel, so it never
            changes height unless the piano is put away. With a pointer, the strip floats over the foot of the panel and
            shows only while the pointer is near the dock. */}
            <div ref={dockRef} className="kys-dock">
              <SoundDesign
                steps={steps}
                step={step}
                onStep={(k) => {
                  setStep(k);
                  openSection('build');
                }}
                hasLesson={!!shown}
                mark={<Wordmark lit={audio === 'on'} />}
                lit={chapterLit ? chapterLit.split('|') : []}
              />

              <div className="kys-player-bar flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 text-sm sm:px-4 lg:flex-nowrap">
                <SoundPicker
                  soundName={loadedName}
                  soundRef={described?.ref ?? null}
                  onChooseSound={chooseSound}
                  soundsOpen={!small && soundsOpen}
                  onCloseSounds={closeSounds}
                  sounds={small ? undefined : library}
                />
                {/* Below `lg` the buttons wrap onto more rows rather than scroll out of reach. */}
                <div className="kys-scroll flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto [&>*]:shrink-0">
                  {(shown || seqShown) && (
                    <PlayButton
                      playing={transportPlaying}
                      onClick={() =>
                        transportPlaying
                          ? stopRiff()
                          : seqShown || !shown
                            ? void playPattern()
                            : void playRiff(shown.phrase)
                      }
                    />
                  )}
                  <LayerToggle
                    label="Sequencer"
                    short="Sequencer"
                    icon={<Columns4 size={17} aria-hidden="true" />}
                    on={seqShown}
                    title="Open the step sequencer under the panel, holding this sound's riff: edit it step by step, and hear each change as it plays."
                    onClick={toggleSequencer}
                  />
                  {/* Named for what it will do, as a video's mute button is: Mute while the sound is on. */}
                  <PlayerTip
                    name={
                      audio === 'on' ? 'Mute' : audio === 'error' ? 'Sound unavailable' : 'Unmute'
                    }
                    help={
                      audio === 'on'
                        ? 'Turn the sound off. The panel keeps its settings.'
                        : audio === 'error'
                          ? 'This browser would not start the sound. Press to try again.'
                          : 'Turn the sound on, to hear the panel as you play and turn it.'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => void toggleAudio()}
                      className={`flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold pointer-coarse:h-11 ${audio === 'on' ? 'text-(--kys-good)' : audio === 'error' ? 'text-(--kys-warn)' : 'text-(--kys-muted) hover:text-(--kys-text)'} hover:bg-(--kys-raised)`}
                    >
                      {audio === 'on' ? (
                        <Volume2 size={17} aria-hidden="true" />
                      ) : (
                        <VolumeX size={17} aria-hidden="true" />
                      )}
                      {audio === 'on'
                        ? 'Mute'
                        : audio === 'starting'
                          ? 'Starting…'
                          : audio === 'error'
                            ? 'Sound unavailable'
                            : 'Unmute'}
                    </button>
                  </PlayerTip>
                  {restoreFrom && (
                    <PlayerTip
                      name="Restore sound"
                      help="Put the sound back as it was before you moved its controls."
                    >
                      <button type="button" onClick={restoreSound} className="kys-layer">
                        <RotateCcw size={16} aria-hidden="true" />
                        Restore sound
                      </button>
                    </PlayerTip>
                  )}
                  <PlayerTip
                    name="Blank patch"
                    help="Start from nothing: every control at its starting place, and no cables."
                  >
                    <button
                      type="button"
                      onClick={() =>
                        patch((s) => ({ ...s, values: { ...synthDef.init }, cables: [] }))
                      }
                      className="kys-layer"
                    >
                      <Eraser size={16} aria-hidden="true" />
                      Blank patch
                    </button>
                  </PlayerTip>
                  <span className="flex-1" />
                  <div className="kys-autohide flex flex-wrap items-center gap-2 lg:flex-nowrap">
                    {!small && (
                      <LayerToggle
                        label="Piano"
                        short="Piano"
                        icon={<Piano size={17} aria-hidden="true" />}
                        on={deckOn}
                        title="Show or put away the piano and the scope under the bar."
                        onClick={() => setDeckOn(!deckOn)}
                      />
                    )}
                    <LayerToggle
                      label="Show harmonics"
                      short="Harmonics"
                      icon={<AudioWaveform size={17} aria-hidden="true" />}
                      on={harmOn}
                      title="Show the wave and the harmonics of this patch over the keyboard, worked out by rendering a note through the synth model. No sound need be playing; turn a knob and both redraw."
                      onClick={() => setHarmOn(!harmOn)}
                    />
                    {!small && (
                      <LayerToggle
                        label="Effects"
                        short={fx.on ? 'Effects on' : 'Effects'}
                        icon={<SlidersHorizontal size={17} aria-hidden="true" />}
                        on={card === 'fx'}
                        filled={fx.on}
                        title="Open the effects rack over the panel: drive, chorus, delay and reverb after the synth."
                        onClick={() => openSection('fx')}
                      />
                    )}
                    <MidiStatus midi={midi} onConnect={connectMidi} />
                    <HelpButton title="How to play sounds" items={PLAY_HELP} />
                    <PanelZoom scale={scale} onScale={setScale} className="max-sm:order-first" />
                  </div>
                </div>
                <div className="kys-autohide flex items-center lg:shrink-0">
                  <FullscreenButton target={playerRef} />
                </div>
              </div>

              {!small && seqOpen && (
                <div className="kys-seq-dock">
                  <Sequencer
                    seq={seq}
                    playing={transportPlaying}
                    onPlay={() => void playPattern()}
                    onStop={stopRiff}
                    onClose={() => setSeqOpen(false)}
                  />
                </div>
              )}

              {/* With the piano put away the deck still holds the harmonics, while they are on. */}
              <div className="kys-player-deck p-3 sm:p-4" hidden={!small && !deckOn && !harmOn}>
                {harmOn && (
                  <HarmonicsStrip
                    cutoff={cutoffNow}
                    pred={pred}
                    source={engine}
                    running={audio === 'on'}
                    playing={transportPlaying}
                    measureStore={measureStore}
                    onExpand={() => setScopeOpen(true)}
                  />
                )}
                <div
                  className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]"
                  hidden={!small && !deckOn}
                >
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
                  {/* Put away, the scope is not drawn at all, so its frame loop does not run for a hidden canvas. It stays
                      while the harmonics are on: it is what measures the pitch they are numbered from. */}
                  {(small || deckOn || harmOn) && (
                    <div className="h-28 min-w-0">
                      <Scope
                        source={engine}
                        running={audio === 'on'}
                        measureStore={measureStore}
                        changeKey={traceKey}
                        onExpand={() => setScopeOpen(true)}
                      />
                    </div>
                  )}
                </div>
                {small && <FxRack fx={fx} onChange={setFx} />}
              </div>
            </div>

            {!small && card && (
              <LessonCard
                def={def}
                preset={shown ?? null}
                step={step}
                onStep={setStep}
                section={card}
                onClose={closeCard}
                side={cardSide}
                onSide={() => setCardSide(cardSide === 'right' ? 'left' : 'right')}
                inspector={inspector}
                effects={<FxRack fx={fx} onChange={setFx} inCard />}
                mark={ownLesson || !shown ? null : (progress.marks?.get(shown.id) ?? null)}
              />
            )}
            {!small && (
              <TutorDrawer open={tutorOpen} onClose={closeTutor}>
                {tutor}
              </TutorDrawer>
            )}

            {/* Inside the player, so the cards and the tour still show with the player full screen. */}
            <Tooltip
              enabled={tipsOn && !(small && coarse)}
              def={def}
              values={sess.values}
              target={step == null ? target : null}
              preset={shown ?? null}
              cables={sess.cables}
            />
            {tourOn && <Tour def={def} notes={detail.notes.unusual} onClose={closeTour} />}
          </section>
        </div>
      </div>

      {small ? (
        <>
          <nav
            aria-label="Beside the panel"
            className="sticky bottom-0 z-40 -mx-4 grid grid-cols-4 gap-1 border-t border-(--kys-line) bg-(--kys-ground) px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:-mx-6"
          >
            {SHEETS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                ref={(el) => {
                  barRefs.current[id] = el;
                }}
                aria-expanded={sheet === id}
                onClick={() => openSheet(sheet === id ? null : id)}
                className={`kys-label h-11 rounded-md ${sheet === id ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {libraryNode && createPortal(library, libraryNode)}
          {lessonNode && createPortal(lesson, lessonNode)}
          {inspectorNode && createPortal(inspector, inspectorNode)}
          {tutorNode && createPortal(tutor, tutorNode)}
          <BottomSheet
            title="Library"
            open={sheet === 'library'}
            fallbackFocus={() => barRefs.current.library ?? null}
            onOpenChange={(o) => openSheet(o ? 'library' : null)}
          >
            <KeptSlot node={libraryNode} />
          </BottomSheet>
          <BottomSheet
            title="Lesson"
            docked
            snap={dockSnap}
            onSnap={setDockSnap}
            open={sheet === 'lesson'}
            fallbackFocus={() => barRefs.current.lesson ?? null}
            onOpenChange={(o) => openSheet(o ? 'lesson' : null)}
          >
            <KeptSlot node={lessonNode} />
          </BottomSheet>
          <BottomSheet
            title="Inspector"
            docked
            snap={dockSnap}
            onSnap={setDockSnap}
            open={sheet === 'inspector'}
            fallbackFocus={() => barRefs.current.inspector ?? null}
            onOpenChange={(o) => openSheet(o ? 'inspector' : null)}
          >
            <KeptSlot node={inspectorNode} />
          </BottomSheet>
          <BottomSheet
            title="Sequencer"
            docked
            snap={dockSnap}
            onSnap={setDockSnap}
            open={sheet === 'sequencer'}
            fallbackFocus={() => playerRef.current}
            onOpenChange={(o) => openSheet(o ? 'sequencer' : null)}
          >
            <Sequencer
              seq={seq}
              playing={transportPlaying}
              onPlay={() => void playPattern()}
              onStop={stopRiff}
              titled={false}
            />
          </BottomSheet>
          <BottomSheet
            title="Tutor"
            open={sheet === 'tutor'}
            fallbackFocus={() => barRefs.current.tutor ?? null}
            onOpenChange={(o) => openSheet(o ? 'tutor' : null)}
          >
            <KeptSlot node={tutorNode} className="h-full" />
          </BottomSheet>
        </>
      ) : null}

      {detail.lineage && (
        <Lineage
          synth={detail.synth}
          lineage={detail.lineage}
          sounds={sounds}
          open={lineageOpen}
          onClose={() => setLineageOpen(false)}
          onSelect={(id) => {
            selectPreset(id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
      <About synth={detail.synth} open={aboutOpen} onClose={() => setAboutOpen(false)} />
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
        phrase={shown?.phrase ?? null}
        playing={transportPlaying}
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
    </div>
  );
}
