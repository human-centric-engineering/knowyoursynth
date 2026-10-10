'use client';

/**
 * The oscilloscope. The strip beside the keyboard is a button; clicking it opens the big view, which draws the same
 * signal with a proper time base, the harmonics on their own axis, live readings, and the words explaining what the
 * panel is doing to the shape (`lib/app/synths/lib/wavestory`). The harmonics strip under the panel shows the wave
 * and the harmonics together, live while something plays and predicted from the panel (`predict`) when not.
 *
 * Transliterated from the prototype file `prototype/src/ui/Scope.jsx` (decision D3). What changed:
 * - The engine is passed in, not a ref to it: the page's engine outlives the page (`engine.ts`), so it never changes.
 * - Canvas colours are read from the `--kys-*` roles, and re-read when Sunrise's theme class changes on `<html>`.
 * - The dialog opens through `useDialog`, as the lineage and limits dialogs do. It is marked `data-plays`, so the
 *   page's computer keys still play while it is open, as its footer says.
 * - A harmonics canvas that mounts with nothing sounding starts on the prediction. The prototype held the analyser
 *   for its 1.8 s "release tail" first, drawing a flat orange line under a badge that already said Predicted.
 * - The dialog's content is only rendered while it is open. The prototype kept it mounted, which ran its two canvas
 *   loops and a second keyboard behind a closed dialog for the whole visit.
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { PREDICT_NOTE } from '@/lib/app/synths/lib/predict';
import type { Prediction } from '@/lib/app/synths/lib/predict';
import { buffers, detectPeriod, grab, readLevels } from '@/lib/app/synths/lib/scope-read';
import type { ScopeBuffers } from '@/lib/app/synths/lib/scope-read';
import { noteAt, waveStory } from '@/lib/app/synths/lib/wavestory';
import type { StoryEntry, WaveStory } from '@/lib/app/synths/lib/wavestory';
import type { ControlValues, PatchCable, Phrase, SynthDef } from '@/lib/app/synths/contract';
import { Keyboard } from '@/components/app/synth/keyboard';
import type { KeyboardProps } from '@/components/app/synth/keyboard';
import { createStore, findStore, notesStore, useStore } from '@/components/app/synth/stores';
import type { Store } from '@/components/app/synth/stores';
import { useDialog } from '@/components/app/synth/use-dialog';

const TRACE_N = 512; // points drawn per trace: enough for a 4096-sample window, cheap enough to keep 10 of them
const TRAILS = 10;
// How long the shape from before a panel move stays on screen — long, and much longer than the cutoff line's:
// comparing two waveforms takes more looking than two positions.
const TRACE_GHOST_MS = 2600;
const LIVE_HOLD_MS = 1800; // after the last note, keep showing the real sound this long before going back to grey
const LIVE_FADE_MS = 700; // ...then crossfade to the model's answer over this long, rather than cutting
const HINT_MS = 2600; // how long "Hold a note to see the change" stays up after a move with nothing playing

/** What the scope reads: the engine's analyser and the sample rate it runs at. The page's `Engine` is one. */
export interface ScopeSource {
  analyser: AnalyserNode | null;
  ctx: { sampleRate: number } | null;
}

/** The scope's live readings, filled by its measuring pass. */
export interface Measure {
  freq: number;
  peak: number;
  rms: number;
  centroid: number;
  /** Milliseconds of signal on screen. */
  ms: number;
}

export const createMeasureStore = (): Store<Measure> =>
  createStore<Measure>({ freq: 0, peak: 0, rms: 0, centroid: 0, ms: 0 });

const CSSV = ['accent', 'line', 'muted', 'faint', 'text', 'good', 'warn'] as const;
type Colors = Record<(typeof CSSV)[number], string>;
const FALLBACK: Colors = {
  accent: '#f6a63a',
  line: '#333',
  muted: '#979eac',
  faint: '#667083',
  text: '#ece9e2',
  good: '#7ed267',
  warn: '#ff7d54',
};

/** The theme colours, re-read whenever the light/dark setting or the system theme changes. Canvas cannot use CSS vars. */
function useColors(): MutableRefObject<Colors> {
  const ref = useRef<Colors>({ ...FALLBACK });
  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      CSSV.forEach((k) => {
        const v = css.getPropertyValue(`--kys-${k}`).trim();
        if (v) ref.current[k] = v;
      });
    };
    read();
    // Sunrise's theme toggle sets `.dark` on <html>; the surface is `data-surface` on the same element.
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-surface'],
    });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    mq?.addEventListener('change', read);
    return () => {
      mo.disconnect();
      mq?.removeEventListener('change', read);
    };
  }, []);
  return ref;
}

/** The canvas sized to its box at the device's pixel ratio (capped at 2). → [width, height, ratio]. */
function fit(cv: HTMLCanvasElement): [number, number, number] {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return [w, h, dpr];
}

/** The scope's graticule: four rows and eight columns. */
function grid(g: CanvasRenderingContext2D, w: number, h: number, c: Colors) {
  g.globalAlpha = 1;
  g.lineWidth = 1;
  g.strokeStyle = c.line;
  g.beginPath();
  for (let i = 1; i < 4; i++) {
    g.moveTo(0, (h * i) / 4);
    g.lineTo(w, (h * i) / 4);
  }
  for (let i = 1; i < 8; i++) {
    g.moveTo((w * i) / 8, 0);
    g.lineTo((w * i) / 8, h);
  }
  g.stroke();
}

/** A trace across the whole width, clipped one pixel inside the box. */
function path(g: CanvasRenderingContext2D, pts: ArrayLike<number>, w: number, h: number, gain = 1) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = (i / (pts.length - 1)) * w;
    let y = h / 2 - pts[i] * gain * h * 0.46;
    if (y < 1) y = 1;
    else if (y > h - 1) y = h - 1;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

/** "before now" in the top-left corner, in the two lines' colours, so two overlapping waves mean something. */
function beforeNow(g: CanvasRenderingContext2D, dpr: number, was: string, now: string) {
  g.font = `600 ${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'left';
  g.fillStyle = was;
  g.fillText('before', 6 * dpr, 13 * dpr);
  g.fillStyle = now;
  g.fillText('now', 6 * dpr + g.measureText('before ').width, 13 * dpr);
}

/** The ghost holds at full strength for the first third, then fades: a shape that starts fading at once is easy to miss. */
const ghostAlpha = (age: number) => (age < 0.34 ? 0.85 : 0.85 * (1 - (age - 0.34) / 0.66));

const sampleRate = (src: ScopeSource | null) => src?.ctx?.sampleRate || 48000;

// ── the trace ───────────────────────────────────────────────────────────────

interface TraceOpts {
  cycles: number;
  gain: number;
  spectrum: boolean;
  trail: boolean;
  freeze: boolean;
}

interface TraceCanvasProps {
  source: ScopeSource | null;
  running: boolean;
  optsRef: MutableRefObject<TraceOpts>;
  measureStore: Store<Measure> | null;
  className?: string;
  changeKey: unknown;
}

/**
 * The scope trace itself. `optsRef` is read inside the animation frame, so changing a setting never restarts it.
 *
 * `changeKey` is a token that gets a new identity whenever the panel moves (a control, a cable, the mod wheel).
 * On a new token the shape from a moment ago is held on screen in grey and fades, so a knob move reads as a
 * before-and-after rather than the trace simply being different. The held copy is taken from a LAGGED buffer, not
 * the live one: the analyser's window is ~85 ms long, so by the time React hands us the new token the live buffer
 * is already part new sound. `lagB` is 8–16 frames (~130–270 ms) old, which is safely before the change.
 */
function TraceCanvas({
  source,
  running,
  optsRef,
  measureStore,
  className,
  changeKey,
}: TraceCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useColors();
  const keyRef = useRef(changeKey);
  useEffect(() => {
    keyRef.current = changeKey;
  }, [changeKey]);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    let raf = 0;
    let buf: ScopeBuffers | null = null;
    let period = 0;
    let tick = 0;
    let ms = 0;
    const cur = new Float32Array(TRACE_N);
    const trails: Float32Array[] = [];
    const lagA = new Float32Array(TRACE_N);
    const lagB = new Float32Array(TRACE_N);
    let lastKey = keyRef.current;
    let ghost: { data: Float32Array; t: number } | null = null; // the shape before the last panel move
    let hint = 0; // when the panel last moved with nothing sounding, so there was nothing to compare

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const [w, h, dpr] = fit(cv);
      const o = optsRef.current;
      const c = colors.current;
      g.clearRect(0, 0, w, h);
      grid(g, w, h, c);

      const an = source?.analyser;
      if (!an || !running) {
        trails.length = 0;
        g.strokeStyle = c.accent;
        g.globalAlpha = 0.5;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
      if (!buf || buf.wave.length !== an.fftSize) buf = buffers(an);
      const sr = sampleRate(source);

      let measure = false;
      if (!o.freeze) {
        tick += 1;
        measure = tick % 8 === 0;
        an.getFloatTimeDomainData(buf.wave);
        if (o.spectrum || measure) an.getByteFrequencyData(buf.spec);
        if (measure) period = detectPeriod(buf.wave, buf.dec, sr);
      }

      if (o.spectrum) {
        g.fillStyle = c.accent;
        g.globalAlpha = 0.18;
        const bins = 160;
        for (let i = 0; i < bins; i++) {
          const idx = Math.floor(Math.pow(i / bins, 2.2) * (buf.spec.length * 0.7));
          const v = buf.spec[idx] / 255;
          g.fillRect((i / bins) * w, h - v * h, w / bins - 1, v * h);
        }
        g.globalAlpha = 1;
      }

      if (!o.freeze) {
        ms = grab(buf.wave, sr, period, o.cycles, cur);
        // Roll the lag buffers on every 8th frame, so lagB always holds a shape from before the last few frames.
        if (tick % 8 === 0) {
          lagB.set(lagA);
          lagA.set(cur);
        }
        if (o.trail) {
          trails.push(Float32Array.from(cur));
          while (trails.length > TRAILS) trails.shift();
        } else trails.length = 0;
        if (measure && measureStore) {
          const lv = readLevels(buf.wave, buf.spec, sr);
          measureStore.set({ ...lv, freq: period > 0 ? sr / period : 0, ms });
        }
      }

      // The panel moved: hold what it looked like just before. Re-armed at most every 200 ms, so dragging a knob
      // leaves a trailing "a moment ago" shape rather than resetting the fade on every pointer event.
      // With nothing sounding there is no shape to hold — both lines would be flat and the ghost invisible — so
      // that case says so on the canvas instead of silently doing nothing.
      const now = performance.now();
      let peak = 0;
      for (let i = 0; i < TRACE_N; i++) {
        const v = cur[i] < 0 ? -cur[i] : cur[i];
        if (v > peak) peak = v;
      }
      if (keyRef.current !== lastKey) {
        lastKey = keyRef.current;
        if (peak < 0.002) hint = now;
        else if (!o.freeze && (!ghost || now - ghost.t > 200)) {
          ghost = { data: Float32Array.from(lagB), t: now };
          hint = 0;
        }
      }

      g.strokeStyle = c.accent;
      g.lineWidth = Math.max(1, 1.2 * dpr);
      trails.forEach((t, i) => {
        g.globalAlpha = 0.06 + (i / TRAILS) * 0.2;
        path(g, t, w, h, o.gain);
      });
      g.globalAlpha = 1;

      // Grey and dashed, so it reads as "before" against the solid accent "now" — and apart from the accent trails.
      if (ghost) {
        const age = (now - ghost.t) / TRACE_GHOST_MS;
        if (age >= 1) ghost = null;
        else {
          g.globalAlpha = ghostAlpha(age);
          g.strokeStyle = c.muted;
          g.lineWidth = Math.max(1, 1.6 * dpr);
          g.setLineDash([5 * dpr, 4 * dpr]);
          path(g, ghost.data, w, h, o.gain);
          g.setLineDash([]);
          beforeNow(g, dpr, c.muted, c.accent);
          g.globalAlpha = 1;
          g.strokeStyle = c.accent;
        }
      }

      g.lineWidth = 2 * dpr;
      g.shadowColor = c.accent;
      g.shadowBlur = 8 * dpr;
      path(g, cur, w, h, o.gain);
      g.shadowBlur = 0;

      // Moved a control with nothing playing: the reason there is nothing to see.
      if (hint && now - hint < HINT_MS) {
        g.globalAlpha = Math.min(1, (HINT_MS - (now - hint)) / 400);
        g.fillStyle = c.warn;
        g.font = `600 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText('Hold a note to see the change', w / 2, h - 8 * dpr);
        g.globalAlpha = 1;
      } else if (hint) hint = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, running, optsRef, measureStore, colors]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

// ── the harmonics ───────────────────────────────────────────────────────────

const AXIS: [number, string][] = [
  [50, '50'],
  [100, '100'],
  [200, '200'],
  [500, '500'],
  [1000, '1k'],
  [2000, '2k'],
  [5000, '5k'],
  [10000, '10k'],
];
const GHOST_MS = 900; // how long the cutoff line's old position lingers after a control moves it

interface HarmonicsCanvasProps {
  source: ScopeSource | null;
  running: boolean;
  cutoff: number | null;
  measureStore: Store<Measure> | null;
  className?: string;
  pred?: Prediction | null;
  live?: boolean;
}

/**
 * The same sound split by pitch, on a proper frequency axis, with the filter cutoff and the harmonics marked.
 *
 * The axis is FIXED at 20 Hz – 20 kHz: it is the cutoff line that moves when you turn a filter control, not the
 * scale under it. That is only visible if you can reach the panel while this is on screen, which is why the main
 * page shows it under the panel, where the modal cannot block the knobs.
 *
 * `cutoff` is read through a ref rather than an effect dependency, so turning a knob moves the line inside the
 * running animation instead of tearing the loop down and starting it again (which also lost the ghost below).
 */
function HarmonicsCanvas({
  source,
  running,
  cutoff,
  measureStore,
  className,
  pred = null,
  live = true,
}: HarmonicsCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useColors();
  const cutRef = useRef(cutoff);
  const predRef = useRef(pred);
  const liveRef = useRef(live);
  useEffect(() => {
    cutRef.current = cutoff;
    predRef.current = pred;
    liveRef.current = live;
  }, [cutoff, pred, live]);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    let raf = 0;
    let spec: Uint8Array<ArrayBuffer> | null = null;
    let lastCut = cutRef.current; // where the line was on the previous frame
    let ghost: { f: number; t: number } | null = null; // where it just came from, fading out, so the move is a move
    // When the sound last stopped, for the hold-then-fade back to grey. A canvas that starts with nothing sounding
    // starts on the model: there was no live sound to hold.
    let liveOff = liveRef.current ? 0 : -Infinity;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const [w, h, dpr] = fit(cv);
      const c = colors.current;
      const now = performance.now();
      const an = source?.analyser;
      const sr = sampleRate(source);
      const fMin = 20;
      const fMax = Math.min(20000, sr / 2);
      const span = Math.log(fMax / fMin);
      const xOf = (f: number) => (Math.log(f / fMin) / span) * w;
      // Two label rows under the plot: the harmonic numbers at base + 11, the frequency scale at h - 3. With the old
      // base (h - 14) those were the same baseline, so '50' and harmonic '1' printed on top of each other as '501'.
      const base = h - 26 * dpr;
      g.clearRect(0, 0, w, h);
      g.font = `${10 * dpr}px ui-monospace, monospace`;
      g.textAlign = 'center';
      g.strokeStyle = c.line;
      g.lineWidth = 1;
      g.fillStyle = c.faint;
      AXIS.forEach(([f, label]) => {
        if (f > fMax) return;
        const x = xOf(f);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, base);
        g.stroke();
        g.fillText(label, x, h - 3 * dpr);
      });
      g.beginPath();
      g.moveTo(0, base);
      g.lineTo(w, base);
      g.stroke();

      // Two sources for the curve: the live analyser, or a prediction rendered offline from the panel (predict),
      // which is what lets this show a patch that is not sounding. Both end up as "loudness 0..1 at a frequency".
      // `mix` crossfades between them rather than cutting, and holds on the live one for a while after the sound
      // stops — so the release tail stays orange instead of snapping back to the model mid-decay.
      const pr = predRef.current;
      const wantLive = liveRef.current && !!an && running;
      if (wantLive) liveOff = 0;
      else if (!liveOff) liveOff = now;
      const mix = wantLive
        ? 1
        : Math.max(0, 1 - Math.max(0, now - liveOff - LIVE_HOLD_MS) / LIVE_FADE_MS);

      const curve = (level: (f0: number, f1: number) => number, col: string, alpha: number) => {
        g.beginPath();
        g.moveTo(0, base);
        for (let x = 0; x <= w; x += 1) {
          const f0 = fMin * Math.exp((x / w) * span);
          const f1 = fMin * Math.exp(((x + 1) / w) * span);
          g.lineTo(x, base - level(f0, f1) * (base - 2 * dpr));
        }
        g.lineTo(w, base);
        g.closePath();
        g.fillStyle = col;
        g.globalAlpha = 0.3 * alpha;
        g.fill();
        g.strokeStyle = col;
        g.globalAlpha = alpha;
        g.lineWidth = 1.5 * dpr;
        g.stroke();
        g.globalAlpha = 1;
      };

      let noteFreq = 0;
      if (mix < 1 && pr?.spec) {
        const ps = pr.spec;
        const bins = ps.length;
        // spectrumAt floors at -70 dB and peaks near -20, so -70..-20 maps onto the full height.
        curve(
          (f0, f1) => {
            const b0 = Math.max(1, Math.floor(f0 / pr.binHz));
            const b1 = Math.min(bins - 1, Math.ceil(f1 / pr.binHz));
            let v = -999;
            for (let b = b0; b <= b1; b++) if (ps[b] > v) v = ps[b];
            return Math.max(0, Math.min(1, (v + 70) / 50));
          },
          c.muted,
          1 - mix
        );
        noteFreq = pr.freq;
      }
      if (mix > 0 && an && running) {
        if (!spec || spec.length !== an.frequencyBinCount)
          spec = new Uint8Array(an.frequencyBinCount);
        const ls = spec;
        an.getByteFrequencyData(ls);
        const bins = ls.length;
        curve(
          (f0, f1) => {
            const b0 = Math.max(1, Math.floor((f0 * 2 * bins) / sr));
            const b1 = Math.min(bins - 1, Math.ceil((f1 * 2 * bins) / sr));
            let v = 0;
            for (let b = b0; b <= b1; b++) if (ls[b] > v) v = ls[b];
            return v / 255;
          },
          c.accent,
          mix
        );
        const lf = measureStore ? measureStore.get().freq : 0;
        if (lf > 0) noteFreq = lf;
      }

      if (noteFreq > fMin) {
        g.strokeStyle = c.muted;
        g.fillStyle = c.muted;
        for (let k = 1; k <= 12; k++) {
          const f = noteFreq * k;
          if (f > fMax) break;
          const x = xOf(f);
          g.beginPath();
          g.moveTo(x, base);
          g.lineTo(x, base - 6 * dpr);
          g.stroke();
          if (k <= 6) g.fillText(String(k), x, base + 11 * dpr);
        }
      }
      const cut = cutRef.current;
      // A move of any filter control leaves the old position behind for a moment, so you can see which way it went.
      if (cut !== lastCut) {
        if (
          lastCut != null &&
          lastCut > fMin &&
          lastCut < fMax &&
          cut != null &&
          cut > fMin &&
          cut < fMax
        )
          ghost = { f: lastCut, t: now };
        lastCut = cut;
      }
      if (ghost) {
        const age = (now - ghost.t) / GHOST_MS;
        if (age >= 1) ghost = null;
        else {
          const gx = xOf(ghost.f);
          g.globalAlpha = 0.5 * (1 - age);
          g.strokeStyle = c.warn;
          g.lineWidth = 1.5 * dpr;
          g.beginPath();
          g.moveTo(gx, 0);
          g.lineTo(gx, base);
          g.stroke();
          if (cut != null && cut > fMin && cut < fMax) {
            // the span it crossed, so the direction reads at a glance
            g.globalAlpha = 0.16 * (1 - age);
            g.fillStyle = c.warn;
            g.fillRect(Math.min(gx, xOf(cut)), 0, Math.abs(xOf(cut) - gx), base);
          }
          g.globalAlpha = 1;
        }
      }
      if (cut != null && cut > fMin && cut < fMax) {
        const x = xOf(cut);
        g.strokeStyle = c.warn;
        g.lineWidth = 1.5 * dpr;
        g.setLineDash([4 * dpr, 3 * dpr]);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, base);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = c.warn;
        g.textAlign = x > w * 0.8 ? 'right' : 'left';
        g.fillText('cutoff', x + (x > w * 0.8 ? -4 : 4) * dpr, 11 * dpr);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, running, measureStore, colors]);
  // Tall enough that the 26px of label gutter below the plot still leaves a readable trace, short enough for a laptop.
  return (
    <canvas
      ref={ref}
      className={
        className ||
        'h-[clamp(96px,13vh,120px)] w-full rounded-md border border-(--kys-line) bg-(--kys-desk)'
      }
      aria-hidden="true"
    />
  );
}

// ── the small strip beside the keyboard ─────────────────────────────────────

export interface ScopeProps {
  source: ScopeSource | null;
  running: boolean;
  onExpand: () => void;
  measureStore?: Store<Measure> | null;
  changeKey: unknown;
}

const STRIP_OPTS: TraceOpts = { cycles: 2, gain: 1, spectrum: true, trail: false, freeze: false };

/**
 * The scope on the page: a button that opens the big view. It also feeds `measureStore`, which is what lets the
 * harmonics strip under the panel number the harmonics without running a second measuring loop of its own.
 */
export function Scope({ source, running, onExpand, measureStore = null, changeKey }: ScopeProps) {
  const optsRef = useRef<TraceOpts>(STRIP_OPTS);
  return (
    <button
      type="button"
      onClick={onExpand}
      title="Open the big oscilloscope: what the wave is, and which controls shape it"
      aria-label="Oscilloscope and harmonics of the sound. Opens the big view, with more controls and an explanation."
      className="group relative block h-full w-full overflow-hidden rounded-md border border-(--kys-line) bg-(--kys-desk) hover:border-(--kys-muted)"
    >
      <TraceCanvas
        source={source}
        running={running}
        optsRef={optsRef}
        measureStore={measureStore}
        changeKey={changeKey}
        className="absolute inset-0 h-full w-full"
      />
      <span className="kys-label absolute right-1.5 bottom-1 rounded border border-(--kys-line) bg-(--kys-surface) px-1.5 py-0.5 text-(--kys-faint) group-hover:text-(--kys-text)">
        Expand ⤢
      </span>
    </button>
  );
}

/**
 * The strip's trace: the live sound in accent orange when something is actually playing, otherwise the patch as
 * predicted from the panel, drawn in grey. The grey says "this is the model working out what you would hear";
 * the orange says "this is the sound itself". Behind either sits the shape from before the last panel move.
 */
function StripTraceCanvas({
  pred,
  live,
  source,
  className,
}: {
  pred: Prediction | null;
  live: boolean;
  source: ScopeSource | null;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useColors();
  const predRef = useRef(pred);
  const liveRef = useRef(live);
  useEffect(() => {
    predRef.current = pred;
    liveRef.current = live;
  }, [pred, live]);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return undefined;
    let raf = 0;
    let last = predRef.current;
    let ghost: { wave: Float32Array; t: number } | null = null;
    let buf: ScopeBuffers | null = null;
    let period = 0;
    let tick = 0;
    // When the sound last stopped, for the hold-then-fade back to grey. A canvas that starts with nothing sounding
    // starts on the model: there was no live sound to hold.
    let liveOff = liveRef.current ? 0 : -Infinity;
    const cur = new Float32Array(TRACE_N);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const [w, h, dpr] = fit(cv);
      const c = colors.current;
      const now = performance.now();
      g.clearRect(0, 0, w, h);
      grid(g, w, h, c);

      const p = predRef.current;
      // The prediction is exact and repeatable, so the "before" shape is simply the previous one — no lag buffer.
      if (p !== last) {
        if (last?.wave && p?.wave) ghost = { wave: last.wave, t: now };
        last = p;
      }

      const an = source?.analyser;
      // Hold on the real sound for a moment after it stops, then crossfade back to the model rather than cutting.
      // Reading the analyser through the hold means the release tail is the real tail, still in orange.
      const wantLive = liveRef.current && !!an;
      if (wantLive) liveOff = 0;
      else if (!liveOff) liveOff = now;
      const mix = wantLive
        ? 1
        : Math.max(0, 1 - Math.max(0, now - liveOff - LIVE_HOLD_MS) / LIVE_FADE_MS);
      const isLive = mix > 0.5;
      let shape: Float32Array | null = null;
      if (mix > 0 && an) {
        if (!buf || buf.wave.length !== an.fftSize) buf = buffers(an);
        const sr = sampleRate(source);
        an.getFloatTimeDomainData(buf.wave);
        tick += 1;
        if (tick % 8 === 0) period = detectPeriod(buf.wave, buf.dec, sr);
        grab(buf.wave, sr, period, 2, cur);
        shape = cur;
      }
      if (!shape && !p?.wave) {
        g.strokeStyle = c.accent;
        g.globalAlpha = 0.5;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }

      // Predicted "now" is grey, so its ghost has to be fainter still to stay apart from it.
      const nowCol = isLive ? c.accent : c.muted;
      const wasCol = isLive ? c.muted : c.faint;
      if (ghost) {
        const age = (now - ghost.t) / TRACE_GHOST_MS;
        if (age >= 1) ghost = null;
        else {
          g.globalAlpha = ghostAlpha(age);
          g.strokeStyle = wasCol;
          g.lineWidth = Math.max(1, 1.6 * dpr);
          g.setLineDash([5 * dpr, 4 * dpr]);
          path(g, ghost.wave, w, h);
          g.setLineDash([]);
          beforeNow(g, dpr, wasCol, nowCol);
          g.globalAlpha = 1;
        }
      }
      g.lineWidth = 2 * dpr;
      if (mix < 1 && p?.wave) {
        g.globalAlpha = 1 - mix;
        g.strokeStyle = c.muted;
        path(g, p.wave, w, h);
        g.globalAlpha = 1;
      }
      if (mix > 0 && shape) {
        g.globalAlpha = mix;
        g.strokeStyle = c.accent;
        g.shadowColor = c.accent;
        g.shadowBlur = 8 * dpr;
        path(g, shape, w, h);
        g.shadowBlur = 0;
        g.globalAlpha = 1;
      }

      if (mix === 0 && p?.silent) {
        g.fillStyle = c.warn;
        g.font = `600 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText('This patch makes no sound as it is set', w / 2, h - 8 * dpr);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [colors, source]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

const khz = (f: number) => (f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(1)} kHz`);

export interface HarmonicsStripProps {
  cutoff: number | null;
  pred: Prediction | null;
  source: ScopeSource | null;
  running: boolean;
  playing: boolean;
  measureStore: Store<Measure>;
  onExpand: () => void;
}

/**
 * The harmonics graph on the main page, under the panel, so the knobs stay reachable while you watch it.
 * The cutoff line moves as you turn a filter control and leaves a fading trail behind it; the axis never moves.
 * `cutoff` comes from a single toEngine() call in the page, not from waveStory — the attribution is far too slow to
 * re-run on every knob move, and nothing here needs it.
 */
export function HarmonicsStrip({
  cutoff,
  pred,
  source,
  running,
  playing,
  measureStore,
  onExpand,
}: HarmonicsStripProps) {
  // Live whenever sound is actually coming out: a key down, or the riff playing — the riff is sent to the engine as
  // a phrase and never touches notesStore, so without `playing` the whole riff drew as the model's guess.
  const notes = useStore(notesStore);
  const sounding = running && (playing || notes.length > 0);
  // The badge lags the same way the canvases do, so the label matches the colour on screen.
  const [lagging, setLagging] = useState(false);
  useEffect(() => {
    if (sounding) {
      setLagging(true);
      return undefined;
    }
    const t = setTimeout(() => setLagging(false), LIVE_HOLD_MS + LIVE_FADE_MS);
    return () => clearTimeout(t);
  }, [sounding]);
  const live = sounding || lagging;
  return (
    <section
      aria-label="Harmonics of the sound"
      className="mt-3 rounded-xl border border-(--kys-line) bg-(--kys-surface) p-3"
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="kys-label text-(--kys-muted)">The sound this patch makes</p>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${live ? 'border-(--kys-accent)/60 text-(--kys-accent)' : 'border-(--kys-line) text-(--kys-faint)'}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${live ? 'bg-(--kys-accent)' : 'bg-(--kys-faint)'}`}
            />
            <span className="kys-label">{live ? 'Playing' : `Predicted · ${PREDICT_NOTE}`}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!live && pred && pred.freq > 0 && (
            <span className="kys-label text-(--kys-faint)">Sounds at {khz(pred.freq)}</span>
          )}
          {cutoff != null && (
            <>
              <span className="kys-label text-(--kys-faint)">Cutoff</span>
              <span className="font-mono text-[13px] text-(--kys-warn)">{khz(cutoff)}</span>
            </>
          )}
          <button
            type="button"
            onClick={onExpand}
            className="kys-label text-(--kys-accent) underline-offset-2 hover:underline"
          >
            Big view ›
          </button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <div>
          <p className="kys-label mb-1 text-(--kys-faint)">The wave</p>
          <StripTraceCanvas
            pred={pred}
            live={sounding}
            source={source}
            className="h-[clamp(96px,14vh,150px)] w-full rounded-md border border-(--kys-line) bg-(--kys-desk)"
          />
        </div>
        <div>
          <p className="kys-label mb-1 text-(--kys-faint)">Harmonics · pitch across, loudness up</p>
          <HarmonicsCanvas
            pred={pred}
            cutoff={cutoff}
            running={running}
            live={sounding}
            source={source}
            measureStore={measureStore}
            className="h-[clamp(96px,14vh,150px)] w-full rounded-md border border-(--kys-line) bg-(--kys-desk)"
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-(--kys-muted)">
        Orange is the sound itself while you play. Grey is the synth model’s answer for the panel as
        it stands, from a {PREDICT_NOTE} played through it. Turn a knob and both graphs redraw, with
        the shape from before your move behind them.
      </p>
    </section>
  );
}

// ── the big view ────────────────────────────────────────────────────────────

const dB = (x: number) => (x > 1e-5 ? `${(20 * Math.log10(x)).toFixed(1)} dB` : '—');
const CYCLES: [number, string][] = [
  [1, '1'],
  [2, '2'],
  [4, '4'],
  [8, '8'],
];
const GAINS: [number, string][] = [
  [1, '×1'],
  [2, '×2'],
  [4, '×4'],
  [8, '×8'],
];

function Seg({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [number, string][];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="kys-label text-(--kys-faint)">{label}</span>
      <div
        className="flex rounded-md border border-(--kys-line) bg-(--kys-surface) p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map(([v, l]) => (
          <button
            key={l}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${value === v ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs font-semibold ${on ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) bg-(--kys-surface) text-(--kys-muted) hover:text-(--kys-text)'}`}
    >
      {children}
    </button>
  );
}

/** A ? beside a heading. The explanations in here are long and only wanted once, so they stay folded away. */
function Help({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none font-semibold ${open ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) bg-(--kys-surface) text-(--kys-faint) hover:text-(--kys-text)'}`}
    >
      ?
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="kys-label shrink-0 whitespace-nowrap text-(--kys-faint)">{label}</span>
      <span className="min-w-0 truncate font-mono text-[13px] text-(--kys-text)">
        {value}
        {sub && <span className="ml-1 text-(--kys-faint)">{sub}</span>}
      </span>
    </div>
  );
}

/**
 * The live numbers under the trace. Its own subscription, so the words around it do not redraw with it.
 * One line per reading rather than a grid of boxes, which took two rows and 120px of a short column.
 * A fixed column count, NOT flex-wrap: the readings are much wider with a note playing than sitting at '—',
 * and wrapping made the strip grow a row and shove the harmonics down every time sound started or stopped.
 * The columns are minmax(0,1fr), so a long reading truncates inside its own cell and moves nothing.
 */
function Readouts({ measureStore, running }: { measureStore: Store<Measure>; running: boolean }) {
  const m = useStore(measureStore);
  const note = noteAt(m.freq);
  return (
    <div
      role="group"
      aria-label="Readings"
      className="mt-2 grid grid-cols-2 items-baseline gap-x-4 gap-y-1 rounded-md border border-(--kys-line) bg-(--kys-ground) px-2.5 py-1.5 sm:grid-cols-3 xl:grid-cols-5"
    >
      <Stat
        label="Pitch"
        value={
          !running
            ? '—'
            : m.freq
              ? `${m.freq < 100 ? m.freq.toFixed(1) : Math.round(m.freq)} Hz`
              : 'no pitch'
        }
        sub={
          note
            ? `${note.name}${note.cents ? ` ${note.cents > 0 ? '+' : '−'}${Math.abs(note.cents)}c` : ''}`
            : ''
        }
      />
      <Stat
        label="One cycle"
        value={m.freq ? `${(1000 / m.freq).toFixed(m.freq > 200 ? 2 : 1)} ms` : '—'}
      />
      <Stat label="On screen" value={m.ms ? `${m.ms.toFixed(1)} ms` : '—'} />
      <Stat label="Peak" value={dB(m.peak)} sub={m.peak >= 0.995 ? 'clipping' : ''} />
      <Stat label="Brightness" value={m.centroid ? khz(m.centroid) : '—'} />
    </div>
  );
}

/** One control (or cable) shaping this part of the picture. Clicking a control closes the dialog and finds it on the panel. */
function Chip({ entry, onFind }: { entry: StoryEntry; onFind: (e: StoryEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onFind(entry)}
      title={entry.kind === 'control' ? 'Show this control on the panel' : 'What this is'}
      className="flex items-center gap-1.5 rounded-full border border-(--kys-line) bg-(--kys-ground) py-0.5 pr-2.5 pl-1.5 text-xs font-semibold text-(--kys-text) hover:border-(--kys-muted)"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: moduleOf(entry.module).color }}
      />
      {entry.name}
      <span className="font-mono text-[11px] text-(--kys-faint)">{entry.value}</span>
    </button>
  );
}

const HOW =
  'Which controls are listed is worked out by moving each one a little and comparing the synth model’s own settings before and after. A control that changes nothing whichever way it is moved is left out of the list altogether; one whose every change switches something on from nothing is listed as set to nothing. No audio is rendered to do it, so the list follows the panel as you change it.';

export interface ScopeDialogProps extends Pick<
  KeyboardProps,
  'wheel' | 'onWheel' | 'octave' | 'onOctave' | 'hold' | 'onHold' | 'noteOn' | 'noteOff'
> {
  open: boolean;
  onClose: () => void;
  source: ScopeSource | null;
  running: boolean;
  def: SynthDef;
  values: ControlValues;
  cables: PatchCable[];
  /** The riff the Play button plays; none when the synth has no sounds. */
  phrase: Phrase | null;
  playing: boolean;
  onPlay: (ph: Phrase) => void;
  onStop: () => void;
  changeKey: unknown;
}

/** The big oscilloscope: the trace with a real time base, the harmonics, live readings, and why it looks like that. */
export function ScopeDialog({
  open,
  onClose,
  source,
  running,
  def,
  values,
  cables,
  phrase,
  playing,
  onPlay,
  onStop,
  wheel,
  onWheel,
  octave,
  onOctave,
  hold,
  onHold,
  noteOn,
  noteOff,
  changeKey,
}: ScopeDialogProps) {
  const { ref, close } = useDialog(open);
  const [cycles, setCycles] = useState(2);
  const [gain, setGain] = useState(1);
  const [spectrum, setSpectrum] = useState(false);
  const [harmonics, setHarmonics] = useState(true);
  const [trail, setTrail] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const optsRef = useRef<TraceOpts>({ cycles, gain, spectrum, trail, freeze });
  useEffect(() => {
    optsRef.current = { cycles, gain, spectrum, trail, freeze };
  }, [cycles, gain, spectrum, trail, freeze]);
  const [measureStore] = useState(createMeasureStore);

  // Opening never starts frozen.
  useEffect(() => {
    if (open) setFreeze(false);
  }, [open]);

  // Reading the panel takes a few hundred calls to toEngine() – up to a tenth of a second on the biggest panel – so it
  // waits until the dialog is open, and until the frame after that, so the window and the trace appear straight away.
  const [help, setHelp] = useState<Record<string, boolean>>({}); // which ? explanations are open — all folded away to start
  const toggleHelp = (k: string) => setHelp((h) => ({ ...h, [k]: !h[k] }));
  const [story, setStory] = useState<WaveStory | null>(null);
  useEffect(() => {
    if (!open) {
      setStory(null);
      return undefined;
    }
    const t = setTimeout(() => setStory(waveStory(def, values, cables, wheel)), 60);
    return () => clearTimeout(t);
  }, [open, def, values, cables, wheel]);
  const find = (entry: StoryEntry) => {
    if (entry.kind !== 'control') return;
    findStore.set({ kind: 'control', id: entry.key });
    close();
  };
  // What moves the dashed cutoff line, worked out the same way the rest of the list is — not written per synth.
  const filterStage = story && !story.error ? story.stages.find((s) => s.id === 'filter') : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="scope-h"
      onClose={onClose}
      data-plays=""
      className="m-auto h-[min(940px,calc(100vh-24px))] w-[min(1400px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-(--kys-line) bg-(--kys-surface) p-0 text-(--kys-text) shadow-2xl backdrop:bg-black/60"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="shrink-0 border-b border-(--kys-line) px-4 py-2.5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="kys-label text-(--kys-accent)">
                  Oscilloscope · {def.maker} {def.name}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <h2 id="scope-h" className="kys-display text-[17px] leading-tight">
                    The wave this patch is making
                  </h2>
                  <Help
                    label="What the trace is showing"
                    open={!!help.trace}
                    onClick={() => toggleHelp('trace')}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 px-1 text-2xl leading-none text-(--kys-muted) hover:text-(--kys-text)"
              >
                ×
              </button>
            </div>
            {help.trace && (
              <p className="mt-2 max-w-[92ch] text-[13.5px] leading-relaxed text-(--kys-muted)">
                The line is the sound itself, drawn over time: loud is tall, time runs left to
                right. It is the synth’s own output — after its overdrive, echo and volume, before
                the effects rack under the panel — so the rack’s reverb and chorus do not show here.
                A synth’s own effects (the DeepMind’s FX) do, mixed to mono. Play or hold a note to
                put something on screen.
              </p>
            )}
          </header>

          {/* The picture on the left, the words in their own column on the right: the list of what is shaping the sound is the
              long part of this window, and stacked under the trace it was squeezed into a sliver. Narrow screens stack them. */}
          <div className="kys-scroll min-h-0 flex-1 overflow-y-auto lg:flex lg:overflow-hidden">
            <div className="kys-scroll min-w-0 px-4 py-3 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {/* The two canvases give up height as the window loses it, so the controls and the readings stay on screen
                  on a laptop instead of pushing the harmonics off the bottom. */}
              <div className="h-[clamp(112px,21vh,210px)] overflow-hidden rounded-md border border-(--kys-line) bg-(--kys-desk)">
                <TraceCanvas
                  source={source}
                  running={running}
                  optsRef={optsRef}
                  measureStore={measureStore}
                  changeKey={changeKey}
                  className="h-full w-full"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Seg label="Cycles" options={CYCLES} value={cycles} onChange={setCycles} />
                <Seg label="Height" options={GAINS} value={gain} onChange={setGain} />
                <Toggle
                  on={trail}
                  onClick={() => setTrail(!trail)}
                  title="Keep the last few traces on screen, fading. Anything that is moving shows as a spread of lines."
                >
                  Trails
                </Toggle>
                <Toggle
                  on={spectrum}
                  onClick={() => setSpectrum(!spectrum)}
                  title="Put the harmonics behind the trace as well as under it."
                >
                  Harmonics behind
                </Toggle>
                <Toggle
                  on={freeze}
                  onClick={() => setFreeze(!freeze)}
                  title="Stop redrawing, so you can study one trace."
                >
                  {freeze ? 'Frozen' : 'Freeze'}
                </Toggle>
                {phrase && (
                  <button
                    type="button"
                    onClick={() => (playing ? onStop() : onPlay(phrase))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${playing ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) bg-(--kys-surface) text-(--kys-text) hover:border-(--kys-muted)'}`}
                  >
                    {playing ? '■ Stop riff' : '▶ Play riff'}
                  </button>
                )}
              </div>
              <Readouts measureStore={measureStore} running={running} />
              {!running && (
                <p className="mt-2 text-xs text-(--kys-warn)">
                  Sound is off, so there is nothing to draw. Turn it on with the button at the top
                  of the page.
                </p>
              )}

              {harmonics ? (
                <section className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="kys-label text-(--kys-muted)">
                        Harmonics · pitch across, loudness up
                      </p>
                      <Help
                        label="How to read the harmonics graph"
                        open={!!help.harm}
                        onClick={() => toggleHelp('harm')}
                      />
                    </div>
                    <Toggle
                      on={false}
                      onClick={() => setHarmonics(false)}
                      title="Hide the harmonics graph"
                    >
                      Hide
                    </Toggle>
                  </div>
                  {help.harm && (
                    <p className="mb-1.5 max-w-[92ch] text-xs leading-relaxed text-(--kys-muted)">
                      The same sound split by pitch, low on the left, on a decibel scale. The
                      numbered ticks are the harmonics of the note being played: 1 is the note
                      itself, 2 an octave above it, 3 an octave and a fifth, and so on. A sawtooth
                      has them all, a square has only the odd ones, a sine has just the first. The
                      dashed line is the filter’s cutoff: the pitch where it starts working. A
                      low-pass filter, which is what most synth filters are, lets the harmonics
                      below that line through and turns down the ones above it — so the further left
                      the line sits, the duller the sound. Resonance lifts a peak right at the line.
                      The line rarely sits still once a note is playing: an envelope, the LFO or the
                      keyboard can all move it.
                    </p>
                  )}
                  <HarmonicsCanvas
                    source={source}
                    running={running}
                    cutoff={story ? story.cutoff : null}
                    measureStore={measureStore}
                  />
                  {filterStage && story && story.cutoff != null && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="kys-label text-(--kys-faint)">Cutoff</span>
                      <span className="font-mono text-[13px] text-(--kys-warn)">
                        {khz(story.cutoff)}
                      </span>
                      <span className="text-xs text-(--kys-muted)">
                        — harmonics to the right of the line are being turned down.
                      </span>
                      {filterStage.on.length > 0 && (
                        <div className="flex basis-full flex-wrap items-center gap-1.5">
                          <span className="kys-label mr-0.5 text-(--kys-faint)">Moved by</span>
                          {filterStage.on.map((e) => (
                            <Chip key={e.key} entry={e} onFind={find} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              ) : (
                <div className="mt-3">
                  <Toggle
                    on={false}
                    onClick={() => setHarmonics(true)}
                    title="Show the harmonics graph"
                  >
                    Show harmonics graph
                  </Toggle>
                </div>
              )}
            </div>

            <aside className="flex flex-col border-t border-(--kys-line) bg-(--kys-surface) lg:min-h-0 lg:w-[430px] lg:shrink-0 lg:border-t-0 lg:border-l">
              <div className="shrink-0 border-b border-(--kys-line) px-4 py-2.5 sm:px-6">
                <div className="flex items-center gap-2">
                  <h3 className="kys-label text-(--kys-muted)">What is making this shape</h3>
                  <Help
                    label="What this list is and how it is worked out"
                    open={!!help.story}
                    onClick={() => toggleHelp('story')}
                  />
                </div>
                {help.story && (
                  <p className="mt-1.5 text-xs leading-relaxed text-(--kys-muted)">
                    Down the signal chain, section by section, with the controls shaping each part
                    as the panel stands. Click one to find it on the panel. {HOW}
                  </p>
                )}
              </div>
              <div className="kys-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
                {!story && (
                  <p role="status" className="text-sm text-(--kys-muted)">
                    Reading the panel…
                  </p>
                )}
                {story?.error && (
                  <p role="alert" className="text-sm text-(--kys-warn)">
                    This panel setting could not be turned into sound: {story.error}
                  </p>
                )}
                {story && !story.error && (
                  <div className="flex flex-col gap-3">
                    {story.stages.map((s) => (
                      <section
                        key={s.id}
                        aria-label={s.title}
                        className="rounded-xl border border-(--kys-line) bg-(--kys-ground) p-3.5"
                      >
                        <h4 className="leading-snug font-semibold">{s.title}</h4>
                        {s.text && (
                          <p className="mt-1 text-[14px] leading-relaxed text-(--kys-muted)">
                            {s.text}
                          </p>
                        )}
                        {s.on.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {s.on.map((e) => (
                              <Chip key={e.key} entry={e} onFind={find} />
                            ))}
                          </div>
                        )}
                        {s.zero.length > 0 && (
                          <p className="mt-2 text-xs leading-snug text-(--kys-faint)">
                            Set to nothing at the moment, so not in the picture yet:{' '}
                            {s.zero
                              .slice(0, 8)
                              .map((e) => e.name)
                              .join(', ')}
                            {s.zero.length > 8 ? ` and ${s.zero.length - 8} more` : ''}.
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <footer className="shrink-0 border-t border-(--kys-line) px-4 py-2.5 sm:px-6">
            <Keyboard
              octave={octave}
              onOctave={onOctave}
              wheel={wheel}
              onWheel={onWheel}
              hold={hold}
              onHold={onHold}
              noteOn={noteOn}
              noteOff={noteOff}
            />
            {/* The ? stays put on the right whether the hint is open or shut; on the left it read as the mod wheel's label. */}
            <div className="mt-1 flex items-center justify-end gap-2">
              {help.keys && (
                <p className="mr-auto text-xs text-(--kys-faint)">
                  A W S E D F T G Y H U J K play notes here too. Hold turns a note into a drone,
                  which is the easiest way to read a trace.
                </p>
              )}
              <Help
                label="Playing notes from here"
                open={!!help.keys}
                onClick={() => toggleHelp('keys')}
              />
            </div>
          </footer>
        </div>
      )}
    </dialog>
  );
}
