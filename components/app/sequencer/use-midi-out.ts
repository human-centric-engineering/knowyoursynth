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
 * MIDI clock (t-89) is sent to an output only once it is turned on for that output, as some synths start their own
 * sequencer on it: the outputs it is on for are kept with the choice. While the sequencer follows a MIDI clock
 * (`f-midi-hardware-lead` t-91) none is sent, whatever the choice says, so the two can't go round in a loop.
 *
 * Mod lanes are sent as CCs (t-90) once a lane is given a CC number. The numbers are the hardware's, not the
 * pattern's, so they are kept per synth in this browser (`kys.midiCc`), apart from the output chosen: a pattern shared
 * or moved to another synth carries none.
 *
 * A patch to call up on Play (`f-midi-hardware-lead` t-92), a program and optionally its bank, is kept per synth the
 * same way (`kys.midiProgram`): which program holds which sound is the user's own hardware's business. None is set to
 * begin with, as many synths have no patch memory.
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
import { createMidiScheduler, type MidiProgram } from '@/lib/app/midi/scheduler';
import { ccLookup, validLaneCc, type LaneCcs } from '@/lib/app/midi/cc';
import type { SynthDef } from '@/lib/app/synths/contract';
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
  /** The outputs MIDI clock is sent to (t-89): left out by a choice kept before there was a clock. */
  clock: z.array(z.string().min(1).max(256)).max(64).optional().catch(undefined),
});
export type MidiOutChoice = z.infer<typeof MidiOutChoiceSchema>;

const NO_CHOICE: MidiOutChoice = { output: null, channel: 1, plays: 'midi' };

/**
 * The CCs given to lanes, per synth: synth id → lane control id → CC. A synth's map that doesn't read is dropped, not
 * every synth's: what is read back is written back on the next change.
 */
const MidiCcSchema = z.record(
  z.string(),
  z.record(z.string().max(128), z.number().refine(validLaneCc)).catch({})
);
type MidiCcs = z.infer<typeof MidiCcSchema>;
const NO_CCS: MidiCcs = {};
const NO_LANE_CCS: LaneCcs = {};

const byte = z.number().int().min(0).max(127);
/** The patch Play calls up, per synth: synth id → program and bank. A synth's that doesn't read is dropped, not every synth's. */
const MidiProgramsSchema = z.record(
  z.string(),
  z.object({ program: byte, msb: byte.optional(), lsb: byte.optional() }).nullable().catch(null)
);
type MidiPrograms = z.infer<typeof MidiProgramsSchema>;
const NO_PROGRAMS: MidiPrograms = {};

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
  /** MIDI clock is on for the chosen output. */
  clock: boolean;
  /** The sequencer follows a MIDI clock, so none is sent, whatever `clock` says. */
  following: boolean;
  /** The CCs this synth's lanes are sent as (t-90): lane control id → CC. */
  ccs: LaneCcs;
  setOutput: (id: string | null) => void;
  setChannel: (channel: number) => void;
  setPlays: (plays: MidiPlays) => void;
  setClock: (on: boolean) => void;
  /** Gives lane `id` CC `cc`, taking it from any other lane that had it, or none (`null`). */
  setCc: (id: string, cc: number | null) => void;
  /** The patch Play calls up on this synth's hardware (t-92), or none. */
  program: MidiProgram | null;
  /** Sets it, or none (`null`): a bank goes only with a program. */
  setProgram: (program: MidiProgram | null) => void;
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
  def = null,
  following = false,
}: {
  midi: Pick<Midi, 'status' | 'outputs' | 'output'>;
  engine: MidiOutEngine | null;
  /** Asks for MIDI, as the bar's Connect does. */
  connect: () => void;
  /** The synth on the panel: whose lane CCs are sent, and what its lanes' controls take. */
  def?: SynthDef | null;
  /** The sequencer follows a MIDI clock (t-91): no clock is sent. */
  following?: boolean;
}): MidiOut {
  const [choice, setChoice] = useStoredPref(STORAGE_KEYS.midiOut, MidiOutChoiceSchema, NO_CHOICE);
  // One per engine, which is the page's for its life; the clock reads the engine's context when asked, as the context
  // is made only once the sound is turned on.
  const s = useMemo(() => createMidiScheduler(audioClock(() => engine?.ctx ?? null)), [engine]);

  const id = choice.output?.id ?? null;
  const connected = midi.status === 'on' && id !== null && midi.outputs.some((o) => o.id === id);
  const sending = connected && choice.plays !== 'synth';
  const muted = sending && choice.plays === 'midi';
  const clock = id !== null && (choice.clock ?? []).includes(id);

  const { output } = midi;
  useEffect(() => {
    s.setPort(sending && id ? output(id) : null, choice.channel - 1);
  }, [s, sending, id, output, choice.channel, midi.outputs]);
  // Only while notes are sent there: Synth only, or the output unplugged, sends it nothing. Nor while a clock is
  // followed: a DAW echoing it back would have the two clocks chase each other.
  useEffect(() => s.setClock(sending && clock && !following), [s, sending, clock, following]);

  const [allCcs, setAllCcs] = useStoredPref(STORAGE_KEYS.midiCc, MidiCcSchema, NO_CCS);
  const synthId = def?.id ?? null;
  const ccs = (synthId !== null && allCcs[synthId]) || NO_LANE_CCS;
  useEffect(() => s.setCcs(def ? ccLookup(def, ccs) : null), [s, def, ccs]);
  const setCc = useCallback(
    (id: string, cc: number | null) => {
      if (synthId === null || (cc !== null && !validLaneCc(cc))) return;
      // One lane a CC: two would fight over it.
      const rest = Object.fromEntries(
        Object.entries(ccs).filter(([lane, n]) => lane !== id && n !== cc)
      );
      setAllCcs({ ...allCcs, [synthId]: cc === null ? rest : { ...rest, [id]: cc } });
    },
    [synthId, ccs, allCcs, setAllCcs]
  );

  const [allPrograms, setAllPrograms] = useStoredPref(
    STORAGE_KEYS.midiProgram,
    MidiProgramsSchema,
    NO_PROGRAMS
  );
  const program = (synthId !== null && allPrograms[synthId]) || null;
  useEffect(() => s.setProgram(program), [s, program]);
  const setProgram = useCallback(
    (p: MidiProgram | null) => {
      if (synthId === null) return;
      // Another synth's that didn't read goes now, rather than being written back as none.
      const rest = Object.fromEntries(
        Object.entries(allPrograms).filter(([id, q]) => id !== synthId && q !== null)
      );
      setAllPrograms(p === null ? rest : { ...rest, [synthId]: p });
    },
    [synthId, allPrograms, setAllPrograms]
  );

  // Whether a run is playing: the timer runs only then, and not while the muted player's ticks pump it.
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!sending || !running || muted) return undefined;
    const t = setInterval(() => s.pump(), PUMP_MS);
    return () => clearInterval(t);
  }, [s, sending, running, muted]);

  // The page hidden (closed, or left for another page) or gone: nothing is left held on the hardware. A tab switched
  // away from is not: with the synth sounding it is not slowed, and with MIDI alone the ticks keep it going.
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
  const setClock = useCallback(
    (on: boolean) => {
      if (id === null) return;
      const rest = (choice.clock ?? []).filter((o) => o !== id);
      setChoice({ ...choice, clock: on ? [...rest, id].slice(-64) : rest });
    },
    [choice, id, setChoice]
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
    clock,
    following,
    ccs,
    program,
    setOutput,
    setChannel,
    setPlays,
    setClock,
    setCc,
    setProgram,
    out,
  };
}
