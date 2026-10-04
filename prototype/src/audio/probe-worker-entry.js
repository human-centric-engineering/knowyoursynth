/* global self */
// Worker side of the sound map: holds one probe session and answers one job at a time, so the page decides the
// order and can simply stop asking when the panel changes.
import { createProbe } from './probe.js';

let probe = null;
let run = -1;
self.onmessage = (m) => {
  const msg = m.data;
  if (msg.type === 'start') {
    run = msg.run;
    probe = createProbe(msg.baseline, msg.notes);
    self.postMessage({ type: 'ready', run });
  } else if (msg.type === 'job' && probe && msg.run === run) {
    self.postMessage({ type: 'result', run, result: probe.measure(msg.job) });
  }
};
