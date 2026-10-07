'use client';

/**
 * Web MIDI input: note on/off from any connected keyboard (all channels) and the mod wheel (CC 1).
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
  const doc = document as PolicyDocument;
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

export interface Midi {
  status: MidiStatus;
  /** The connected inputs' names. */
  devices: string[];
  error: string;
  connect: () => Promise<boolean>;
  disconnect: () => void;
}

export function useMidi({ noteOn, noteOff, onWheel, remember, load }: MidiHandlers): Midi {
  // `off` on the server and the first client render alike; the frame check runs after mount.
  const [status, setStatus] = useState<MidiStatus>('off');
  const [devices, setDevices] = useState<string[]>([]);
  const [error, setError] = useState('');
  const access = useRef<MIDIAccess | null>(null);
  const handlers = useRef({ noteOn, noteOff, onWheel });
  useEffect(() => {
    handlers.current = { noteOn, noteOff, onWheel };
  });

  const onMessage = useCallback((e: MIDIMessageEvent) => {
    const [st = 0, d1 = 0, d2 = 0] = e.data ?? [];
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) handlers.current.noteOn(d1, d2 / 127);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) handlers.current.noteOff(d1);
    else if (type === 0xb0 && d1 === 1) handlers.current.onWheel(d2 / 127);
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
  }, [onMessage]);

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
    try {
      const a = await navigator.requestMIDIAccess({ sysex: false });
      access.current = a;
      a.onstatechange = bind;
      bind();
      setStatus('on');
      setError('');
      remember(true);
      return true;
    } catch (err) {
      setStatus('blocked');
      setError(err instanceof Error ? err.message : String(err));
      remember(false);
      return false;
    }
  }, [bind, remember]);

  const disconnect = useCallback(() => {
    const a = access.current;
    if (a) {
      a.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
      a.onstatechange = null;
    }
    access.current = null;
    setDevices([]);
    setStatus('off');
    remember(false);
  }, [remember]);

  useEffect(() => {
    if (frameBlocksMidi()) setStatus('frame');
    else if (load()) void connect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount, as the prototype
  useEffect(
    () => () => {
      const a = access.current;
      if (a)
        a.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
    },
    []
  );

  return { status, devices, error, connect, disconnect };
}
