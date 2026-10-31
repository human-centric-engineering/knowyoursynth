// Worker side of the sound map: holds one probe session and answers one job at a time, so the page decides the
// order and can simply stop asking when the panel changes. It also answers the sound detector (`kind`, t-125): what a
// patch sounds like, read off the probe notes, so suggesting patterns never renders on the page's thread.
//
// Transliterated from the prototype's `prototype/src/audio/probe-worker-entry.js` (D3). Bundled on its own by
// `scripts/build-audio-workers.ts` into `public/worklets/kys-probe.js` (PROBE_WORKER_URL); nothing imports it.
import {
  createProbe,
  type Probe,
  type ProbeWorkerReply,
  type ProbeWorkerRequest,
} from '@/lib/app/synths/audio/probe';
import { soundFeatures } from '@/lib/app/synths/lib/soundkind';

/** The part of a dedicated Worker's global scope this file uses (the project's TypeScript lib is `dom`, not `webworker`). */
interface ProbeWorkerScope {
  onmessage: ((m: MessageEvent<ProbeWorkerRequest>) => void) | null;
  postMessage: (msg: ProbeWorkerReply) => void;
}
// In a Worker, `self` is the worker's global scope; the DOM typings call it a Window.
const scope = self as unknown as ProbeWorkerScope;

let probe: Probe | null = null;
let run = -1;
scope.onmessage = (m) => {
  const msg = m.data;
  if (msg.type === 'start') {
    run = msg.run;
    probe = createProbe(msg.baseline, msg.notes);
    scope.postMessage({ type: 'ready', run });
  } else if (msg.type === 'job' && probe && msg.run === run) {
    scope.postMessage({ type: 'result', run, result: probe.measure(msg.job) });
  } else if (msg.type === 'kind') {
    scope.postMessage({ type: 'kind', id: msg.id, features: soundFeatures(msg.params) });
  }
};
