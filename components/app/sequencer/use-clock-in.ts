'use client';

/**
 * Following a MIDI clock (`f-midi-hardware-lead` t-91): the input chosen as the clock source, and the follower
 * (`lib/app/midi/follow.ts`) between it and the sequencer.
 *
 * The source is Internal (the sequencer's own tempo and Play, as before) or one MIDI input, chosen in the sequencer's
 * readout and kept in this browser only. The input comes from the page's MIDI grant (`useMidi`), and only its clock
 * messages are read: notes and the mod wheel go on working from every input. Unplugged, or MIDI turned off, the
 * sequencer is its own clock again, and a run the clock started stops.
 *
 * The sequencer hands `clock` what it sends the player and its run's events, as it does MIDI out, and `attach`es its
 * transport: the follower starts, stops and moves the tempo of the run through it. A `loop` event's frame is placed in
 * `performance.now()` time by the same audio clock MIDI out uses, so the beat matched to the pulses is the one heard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { Midi, MidiPortInfo, MidiStatus } from '@/components/app/synth/use-midi';
import { STORAGE_KEYS, useStoredPref } from '@/components/app/synth/storage';
import type { MidiOutEngine } from '@/components/app/sequencer/use-midi-out';
import { audioClock } from '@/lib/app/midi/clock';
import { createClockFollower, type ClockTransport } from '@/lib/app/midi/follow';
import { STOP } from '@/lib/app/midi/scheduler';
import type { SynthEvent, SynthMessage } from '@/lib/app/synths/audio/dsp-core';

/** How often a clock gone quiet is looked for, in ms. */
export const CHECK_MS = 100;

const ClockChoiceSchema = z.object({
  input: z.object({ id: z.string().min(1).max(256), name: z.string().max(256) }).nullable(),
});
type ClockChoice = z.infer<typeof ClockChoiceSchema>;
const INTERNAL: ClockChoice = { input: null };

/** What the sequencer tells the clock follower, and how it is driven. */
export interface SequencerClock {
  /** A MIDI input's clock is followed: the tempo and the transport are its. */
  following: boolean;
  /** The clock's tempo, once known. */
  bpm: number | null;
  /** The sequencer's transport, for the follower to drive. Returns the undo. */
  attach: (t: ClockTransport) => () => void;
  /** Where the clock is now, while a run it started plays: null otherwise. */
  beat: () => number | null;
  /** The next run starts at clock beat `beat`, and is held to the clock from there. */
  rejoin: (beat: number) => void;
  message: (m: SynthMessage) => void;
  event: (e: SynthEvent) => void;
}

export interface ClockIn {
  status: MidiStatus;
  inputs: MidiPortInfo[];
  /** The input chosen, or null for Internal. */
  source: MidiPortInfo | null;
  setSource: (id: string | null) => void;
  /** The chosen input is plugged in. */
  connected: boolean;
  clock: SequencerClock;
}

export function useClockIn({
  midi,
  engine,
}: {
  midi: Pick<Midi, 'status' | 'inputs' | 'listen'>;
  engine: MidiOutEngine | null;
}): ClockIn {
  const [choice, setChoice] = useStoredPref(STORAGE_KEYS.midiClock, ClockChoiceSchema, INTERNAL);
  const source = choice.input;
  const id = source?.id ?? null;
  const connected = midi.status === 'on' && id !== null && midi.inputs.some((i) => i.id === id);

  const [bpm, setBpm] = useState<number | null>(null);
  const shown = useRef<number | null>(null);
  // One follower for the page's life, driving whichever transport is attached.
  const follower = useMemo(() => createClockFollower(), []);
  const at = useMemo(() => audioClock(() => engine?.ctx ?? null), [engine]);

  const { listen } = midi;
  useEffect(() => {
    if (!connected || id === null) return undefined;
    const undo = listen((data, ms, input) => {
      if (input !== id) return;
      follower.input(data, ms);
      // 24 pulses a beat: the page is told only when the tempo taken moves.
      const now = follower.bpm();
      if (now !== shown.current) {
        shown.current = now;
        setBpm(now);
      }
    });
    const t = setInterval(() => follower.check(performance.now()), CHECK_MS);
    return () => {
      undo();
      clearInterval(t);
      // No longer followed (another source, the input unplugged, MIDI off): what the clock started stops, and its
      // tempo is no longer shown.
      follower.input([STOP], performance.now());
      shown.current = null;
      setBpm(null);
    };
  }, [connected, id, listen, follower]);

  const following = connected;
  const followingRef = useRef(following);
  useEffect(() => {
    followingRef.current = following;
    if (!following) follower.stopped();
  }, [following, follower]);

  const attach = useCallback(
    (t: ClockTransport) => {
      follower.drive(t);
      return () => follower.drive(null);
    },
    [follower]
  );
  const message = useCallback(
    (m: SynthMessage) => {
      if (!followingRef.current) return;
      if (m.type === 'pattern') follower.started();
      else if (m.type === 'stopPattern') follower.stopped();
    },
    [follower]
  );
  const event = useCallback(
    (e: SynthEvent) => {
      if (!followingRef.current) return;
      if (e.type === 'loop') follower.loop(e, at.at(e.frame));
      else if (e.type === 'patternEnd') follower.stopped();
    },
    [follower, at]
  );
  const beat = useCallback(
    () => (followingRef.current ? follower.beat(performance.now()) : null),
    [follower]
  );
  const rejoin = useCallback((b: number) => follower.rejoin(b), [follower]);
  const clock = useMemo<SequencerClock>(
    () => ({ following, bpm: following ? bpm : null, attach, beat, rejoin, message, event }),
    [following, bpm, attach, beat, rejoin, message, event]
  );

  const setSource = useCallback(
    (to: string | null) =>
      setChoice({ input: to === null ? null : (midi.inputs.find((i) => i.id === to) ?? null) }),
    [midi.inputs, setChoice]
  );

  return { status: midi.status, inputs: midi.inputs, source, setSource, connected, clock };
}
