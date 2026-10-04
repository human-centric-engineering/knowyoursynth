// Unusual on the System 55: the shared 900-series notes (src/synths/moog900/unusual.js), plus its own.
export default {
  m992: 'Moog put the filter’s control-voltage mixing in its own module, with switches, so the sources that move the filter can be changed by flicking a rocker instead of re-patching.',
  m960: 'The 960 has no notes and no gate length: each row is just a voltage per stage, and the clock runs on its own. To play notes you patch a row into a 921A and the clock, through the 961, into the envelopes.',
  m911a: 'A trigger delay is rare outside Moog systems. It passes a trigger on only if it lasts longer than the delay, so a short note never reaches the delayed envelope: legato playing and quick notes stay plain.',
};
