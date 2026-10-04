import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web MIDI input: note on/off from any connected keyboard (all channels) and the mod wheel (CC 1).
 * Status: 'off' | 'asking' | 'on' | 'unsupported' | 'frame' | 'blocked'.
 * 'frame' = the page is embedded in a frame that does not pass MIDI permission through (Claude's artifact viewer),
 * so the browser refuses without asking. Chrome can tell us this up front; elsewhere we only learn it from the refusal. `devices` lists the connected input names.
 * Connecting needs a click the first time; after that it reconnects on load (the browser remembers the permission).
 */
function frameBlocksMidi() {
  if (typeof document === 'undefined') return false;
  const fp = document.permissionsPolicy || document.featurePolicy;
  try { return !!fp && typeof fp.allowsFeature === 'function' && !fp.allowsFeature('midi'); } catch { return false; }
}

export function useMidi({ noteOn, noteOff, onWheel, remember, load }) {
  const [status, setStatus] = useState(() => (frameBlocksMidi() ? 'frame' : 'off'));
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const access = useRef(null);
  const handlers = useRef({ noteOn, noteOff, onWheel });
  handlers.current = { noteOn, noteOff, onWheel };

  const onMessage = useCallback((e) => {
    const [st, d1 = 0, d2 = 0] = e.data || [];
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) handlers.current.noteOn(d1, d2 / 127);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) handlers.current.noteOff(d1);
    else if (type === 0xb0 && d1 === 1) handlers.current.onWheel(d2 / 127);
  }, []);

  const bind = useCallback(() => {
    const a = access.current;
    if (!a) return;
    const names = [];
    a.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
      if (input.state !== 'disconnected') names.push(input.name || 'MIDI input');
    });
    setDevices(names);
  }, [onMessage]);

  const connect = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) { setStatus('unsupported'); return false; }
    if (frameBlocksMidi()) { setStatus('frame'); remember(false); return false; }
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
      setError(String(err && err.message ? err.message : err));
      remember(false);
      return false;
    }
  }, [bind, remember]);

  const disconnect = useCallback(() => {
    const a = access.current;
    if (a) { a.inputs.forEach((input) => { input.onmidimessage = null; }); a.onstatechange = null; }
    access.current = null;
    setDevices([]);
    setStatus('off');
    remember(false);
  }, [remember]);

  useEffect(() => { if (load() && !frameBlocksMidi()) connect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const a = access.current; if (a) a.inputs.forEach((input) => { input.onmidimessage = null; }); }, []);

  return { status, devices, error, connect, disconnect };
}
