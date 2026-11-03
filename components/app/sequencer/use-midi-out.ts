'use client';

/**
 * MIDI out from the sequencer (`f-midi-out` t-88): the output chosen, its channel, where the pattern plays, and the
 * scheduler that sends its notes there (`lib/app/midi/scheduler.ts`).
 *
 * The outputs come from the page's MIDI grant (`useMidi`), so the browser asks once for keyboard and outputs alike. The
 * choice is a screen setting (D4), kept in this browser only. A chosen output that is unplugged stops being sent to
 * (and its notes are let go first); plugged back in, it is sent to again.
 *
 * Where it plays: the MIDI output alone (the default once one is chosen, so the two don't double), the output and the
 * browser synth, or the synth alone with the output kept chosen. With the output alone, the synth's pattern player
 * still runs, muted (`patternMute`): its `loop` events are the clock MIDI is timed by, so the playhead and MIDI never
 * need a clock of their own. With the chosen output gone, the synth plays it, so Play is never silent.
 *
 * The sequencer hands `out` everything it sends the player and every event of its own run; the scheduler is pumped on
 * each, and on a timer while a run plays. With MIDI alone the tab is silent, so the browser slows that timer (to once a
 * second, then once a minute); the muted player's `patternTick`, sent from the audio thread, pumps it instead.
 * Everything sent is let go on Stop and at the end (through those), and here on a change of output or channel, the
 * output going away, the page being hidden (keeping the run, so a page shown again from the back-forward cache plays
 * on), and the page going.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import type { Midi, MidiPortInfo, MidiStatus } from '@/components/app/synth/use-midi';
import { STORAGE_KEYS, useStoredPref } from '@/components/app/synth/storage';
import { audioClock, type AudioClockSource } from '@/lib/app/midi/clock';
import { createMidiScheduler } from '@/lib/app/midi/scheduler';
import { playable } from '@/lib/app/synths/audio/pattern-player';
import type { SynthEvent, SynthMessage } from '@/lib/app/synths/audio/dsp-core';

/** How often the look-ahead is refilled, in ms: well inside it, so a late timer still finds notes queued. */
export const PUMP_MS = 25;

/** Where the pattern plays while an output is chosen. */
export const MIDI_PLAYS = ['midi', 'both', 'synth'] as const;
export type MidiPlays = (typeof MIDI_PLAYS)[number];
export const MIDI_PLAYS_LABELS: Record<MidiPlays, string> = {
  midi: 'MIDI only',
  both: 'MIDI + synth',
  synth: 'Synth only',
};

const MidiOutChoiceSchema = z.object({
  output: z.object({ id: z.string().min(1).max(256), name: z.string().max(256) }).nullable(),
  channel: z.number().int().min(1).max(16),
  plays: z.enum(MIDI_PLAYS),
});
export type MidiOutChoice = z.infer<typeof MidiOutChoiceSchema>;

const NO_CHOICE: MidiOutChoice = { output: null, channel: 1, plays: 'midi' };

/** What the sequencer tells MIDI out, and whether the synth's own notes are muted. */
export interface SequencerOut {
  /** The browser synth plays no notes: the pattern is heard on the MIDI output alone. */
  muted: boolean;
  message: (m: SynthMessage) => void;
  event: (e: SynthEvent) => void;
}

export interface MidiOut {
  /** The MIDI grant's state: the outputs can be listed only once it is `on`. */
  status: MidiStatus;
  connect: () => void;
  outputs: MidiPortInfo[];
  choice: MidiOutChoice;
  /** The chosen output is plugged in. */
  connected: boolean;
  /** Notes are being sent to it. */
  sending: boolean;
  setOutput: (id: string | null) => void;
  setChannel: (channel: number) => void;
  setPlays: (plays: MidiPlays) => void;
  out: SequencerOut;
}

/** What MIDI out needs of the page's engine: its audio context, for the clock. */
export interface MidiOutEngine {
  readonly ctx: AudioClockSource | null;
}

export function useMidiOut({
  midi,
  engine,
  connect,
}: {
  midi: Pick<Midi, 'status' | 'outputs' | 'output'>;
  engine: MidiOutEngine | null;
  /** Asks for MIDI, as the bar's Connect does. */
  connect: () => void;
}): MidiOut {
  const [choice, setChoice] = useStoredPref(STORAGE_KEYS.midiOut, MidiOutChoiceSchema, NO_CHOICE);
  // One per engine, which is the page's for its life; the clock reads the engine's context when asked, as the context
  // is made only once the sound is turned on.
  const s = useMemo(() => createMidiScheduler(audioClock(() => engine?.ctx ?? null)), [engine]);

  const id = choice.output?.id ?? null;
  const connected = midi.status === 'on' && id !== null && midi.outputs.some((o) => o.id === id);
  const sending = connected && choice.plays !== 'synth';
  const muted = sending && choice.plays === 'midi';

  const { output } = midi;
  useEffect(() => {
    s.setPort(sending && id ? output(id) : null, choice.channel - 1);
  }, [s, sending, id, output, choice.channel, midi.outputs]);

  // Whether a run is playing: the timer runs only then, and not while the muted player's ticks pump it.
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!sending || !running || muted) return undefined;
    const t = setInterval(() => s.pump(), PUMP_MS);
    return () => clearInterval(t);
  }, [s, sending, running, muted]);

  // The page hidden (a tab closed, or switched away on a phone) or gone: nothing is left held on the hardware.
  useEffect(() => {
    const hide = () => s.silence();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      s.release();
      s.setPort(null, 0);
    };
  }, [s]);

  const setOutput = useCallback(
    (to: string | null) => {
      const info = to === null ? null : (midi.outputs.find((o) => o.id === to) ?? null);
      // Choosing one where there was none plays on it alone, so the pattern is not heard twice.
      setChoice({ ...choice, output: info, plays: choice.output ? choice.plays : 'midi' });
    },
    [choice, midi.outputs, setChoice]
  );
  const setChannel = useCallback(
    (channel: number) => setChoice({ ...choice, channel: Math.min(16, Math.max(1, channel)) }),
    [choice, setChoice]
  );
  const setPlays = useCallback(
    (plays: MidiPlays) => setChoice({ ...choice, plays }),
    [choice, setChoice]
  );

  const out = useMemo<SequencerOut>(
    () => ({
      muted,
      message: (m) => {
        if (m.type === 'pattern' && playable(m.loop)) setRunning(true);
        else if (m.type === 'stopPattern') setRunning(false);
        s.message(m);
        s.pump();
      },
      event: (e) => {
        if (e.type !== 'loop' && e.type !== 'patternEnd' && e.type !== 'patternTick') return;
        if (e.type === 'patternEnd') setRunning(false);
        s.event(e);
        s.pump();
      },
    }),
    [s, muted]
  );

  return {
    status: midi.status,
    connect,
    outputs: midi.outputs,
    choice,
    connected,
    sending,
    setOutput,
    setChannel,
    setPlays,
    out,
  };
}
