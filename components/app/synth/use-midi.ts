'use client';

/**
 * Web MIDI input: note on/off from any connected keyboard (all channels) and the mod wheel (CC 1). And the outputs the
 * same grant reaches (`f-midi-out` t-88), for the sequencer to play on: listed here, so the browser is asked once.
 *
 * Transliterated from the prototype file `prototype/src/lib/midi.js` (decision D3). One change: the prototype's
 * `frame` status existed for Claude's artifact viewer. The app can still be framed, so the status stays, worded for
 * any page that embeds it.
 *
 * Connecting needs a click the first time; after that it reconnects on load (the browser remembers the permission).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * - `frame`: the page is in a frame that does not pass MIDI permission through, so the browser refuses without
 *   asking. Chrome can say so up front; elsewhere it is only learnt from the refusal.
 */
export type MidiStatus = 'off' | 'asking' | 'on' | 'unsupported' | 'frame' | 'blocked';

interface PolicyDocument extends Document {
  permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
  featurePolicy?: { allowsFeature?: (feature: string) => boolean };
}

function frameBlocksMidi(): boolean {
  if (typeof document === 'undefined') return false;
  const doc: PolicyDocument = document;
  const fp = doc.permissionsPolicy || doc.featurePolicy;
  try {
    return !!fp && typeof fp.allowsFeature === 'function' && !fp.allowsFeature('midi');
  } catch {
    return false;
  }
}

export interface MidiHandlers {
  noteOn: (n: number, v: number) => void;
  noteOff: (n: number) => void;
  onWheel: (v: number) => void;
  /** Store whether MIDI should reconnect on the next visit. */
  remember: (on: boolean) => void;
  /** Read what `remember` stored. */
  load: () => boolean;
}

/** A MIDI output: the browser's id for it (stable while it stays plugged in, and across visits) and its name. */
export interface MidiPortInfo {
  id: string;
  name: string;
}

export interface Midi {
  status: MidiStatus;
  /** The connected inputs' names. */
  devices: string[];
  /** The connected outputs, kept up to date as devices come and go. */
  outputs: MidiPortInfo[];
  /** The output with this id, while it is connected. */
  output: (id: string) => MIDIOutput | null;
  error: string;
  connect: () => Promise<boolean>;
  disconnect: () => void;
}

export function useMidi({ noteOn, noteOff, onWheel, remember, load }: MidiHandlers): Midi {
  // `off` on the server and the first client render alike; the frame check runs after mount.
  const [status, setStatus] = useState<MidiStatus>('off');
  const [devices, setDevices] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<MidiPortInfo[]>([]);
  const [error, setError] = useState('');
  const access = useRef<MIDIAccess | null>(null);
  const mounted = useRef(false);
  // Each request for access takes a number; only the latest may bind. React's dev double mount runs the reconnect
  // below twice, so two requests are in flight at once, and each grant is its own MIDIAccess with its own inputs:
  // binding both left one attached that Stop MIDI never reached, so the keyboard kept playing with MIDI "off". The bar
  // offers no Connect while asking, but the hook does not rely on that.
  const request = useRef(0);
  const handlers = useRef({ noteOn, noteOff, onWheel });
  useEffect(() => {
    handlers.current = { noteOn, noteOff, onWheel };
  });

  // Notes the keyboard holds down: stopping MIDI (or leaving the page) releases them, since their key-ups never arrive.
  const held = useRef(new Set<number>());
  const onMessage = useCallback((e: MIDIMessageEvent) => {
    const [st = 0, d1 = 0, d2 = 0] = e.data ?? [];
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) {
      held.current.add(d1);
      handlers.current.noteOn(d1, d2 / 127);
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      held.current.delete(d1);
      handlers.current.noteOff(d1);
    } else if (type === 0xb0 && d1 === 1) handlers.current.onWheel(d2 / 127);
  }, []);

  /** Detach from every input and from device changes, and release whatever the keyboard was holding. */
  const detach = useCallback(() => {
    const a = access.current;
    if (a) {
      a.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
      a.onstatechange = null;
    }
    held.current.forEach((n) => handlers.current.noteOff(n));
    held.current.clear();
  }, []);

  const bind = useCallback(() => {
    const a = access.current;
    if (!a) return;
    const names: string[] = [];
    a.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
      if (input.state !== 'disconnected') names.push(input.name || 'MIDI input');
    });
    setDevices(names);
    const outs: MidiPortInfo[] = [];
    a.outputs.forEach((o) => {
      if (o.state !== 'disconnected') outs.push({ id: o.id, name: o.name || 'MIDI output' });
    });
    // A new list only when it changed: a state change fires for every port opened, and each would re-render the page.
    setOutputs((was) =>
      was.length === outs.length &&
      was.every((w, i) => w.id === outs[i].id && w.name === outs[i].name)
        ? was
        : outs
    );
  }, [onMessage]);

  const output = useCallback((id: string) => {
    const o = access.current?.outputs.get(id);
    return o && o.state !== 'disconnected' ? o : null;
  }, []);

  const connect = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      setStatus('unsupported');
      return false;
    }
    if (frameBlocksMidi()) {
      setStatus('frame');
      remember(false);
      return false;
    }
    setStatus('asking');
    const mine = ++request.current;
    try {
      const a = await navigator.requestMIDIAccess({ sysex: false });
      // The page may have gone while the browser asked, or a later request or Stop MIDI overtaken this one: its
      // handlers must not be attached to the inputs.
      if (!mounted.current || mine !== request.current) return false;
      detach();
      access.current = a;
      a.onstatechange = bind;
      bind();
      setStatus('on');
      setError('');
      remember(true);
      return true;
    } catch (err) {
      if (!mounted.current || mine !== request.current) return false;
      // Whatever was bound before must not go on playing under a status that offers no Stop.
      detach();
      access.current = null;
      setDevices([]);
      setOutputs([]);
      setStatus('blocked');
      setError(err instanceof Error ? err.message : String(err));
      remember(false);
      return false;
    }
  }, [bind, detach, remember]);

  const disconnect = useCallback(() => {
    request.current++;
    detach();
    access.current = null;
    setDevices([]);
    setOutputs([]);
    setStatus('off');
    remember(false);
  }, [detach, remember]);

  useEffect(() => {
    if (frameBlocksMidi()) setStatus('frame');
    else if (load()) void connect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount, as the prototype
  // On unmount, including the device-change listener: left attached, it would re-bind this page's handlers to
  // every input the next time a keyboard is plugged in.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      detach();
    };
  }, [detach]);

  return { status, devices, outputs, output, error, connect, disconnect };
}
