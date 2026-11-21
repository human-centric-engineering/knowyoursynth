/**
 * The Default patch's checklist (`DefaultPatch.checklist`): which controls each step covers, which controls the
 * checklist has to cover, and the line each control gets in a step's text, saying where to put it on the hardware.
 *
 * A newcomer setting their own synth to the Default patch starts from wherever its knobs were left, so a step names
 * every control in its part of the panel, and says where each goes in words that do not need the app's numbers:
 * "fully anticlockwise", "about 2 o'clock", "all the way up", "on".
 */
import type {
  Control,
  ControlValue,
  ControlValues,
  DefaultPatchStep,
  SynthDef,
} from '@/lib/app/synths/contract';
import { maxAtBottom } from '@/lib/app/synths/contract';
import { displayName, formatValue } from '@/lib/app/synths/lib/patch';

/** A step's pattern as a test of an id: `*` is any run of characters, everything else is itself. */
export function patternTest(pattern: string): (id: string) => boolean {
  if (!pattern.includes('*')) return (id) => id === pattern;
  const re = new RegExp(
    `^${pattern
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`
  );
  return (id) => re.test(id);
}

/** The controls the checklist has to cover: every one that shapes the sound and is on the panel, not behind a menu. */
export const checklistRequired = (def: SynthDef): Control[] =>
  def.controls.filter((c) => !c.ui && !c.deep);

/**
 * The controls a step covers, in panel order: every control its patterns match, `ui` ones aside. A `*` pattern leaves
 * out a control behind a menu (`deep`), which only its own id brings in, so `osc*` is the oscillator section as the
 * panel shows it rather than every page behind it. A control another step already took is left to that one, so a
 * broad pattern after a narrow one picks up the rest.
 */
export function stepControls(
  def: SynthDef,
  step: Pick<DefaultPatchStep, 'controls'>,
  taken: ReadonlySet<string> = new Set()
): Control[] {
  const ids = new Set(step.controls.filter((p) => !p.includes('*')));
  const globs = step.controls.filter((p) => p.includes('*')).map(patternTest);
  return def.controls.filter(
    (c) => !c.ui && !taken.has(c.id) && (ids.has(c.id) || (!c.deep && globs.some((t) => t(c.id))))
  );
}

/**
 * Every step's controls, each control in the first step that matches it. A control a step names by its own id goes
 * to that step, whatever an earlier step's `*` pattern matches.
 */
export function checklistControls(def: SynthDef, steps: readonly DefaultPatchStep[]): Control[][] {
  const taken = new Set<string>();
  const named = steps.map((s) => s.controls.filter((p) => !p.includes('*')));
  return steps.map((s, i) => {
    const elsewhere = named.flatMap((ids, j) => (j === i ? [] : ids));
    const cs = stepControls(def, s, new Set([...taken, ...elsewhere]));
    cs.forEach((c) => taken.add(c.id));
    return cs;
  });
}

/** A knob's pointer as a clock face: its sweep runs from 7 o'clock to 5 o'clock, through 12 at the centre. */
function clock(f: number): string {
  // −150°…+150° from the top, 30° an hour, to the nearest half hour
  const halves = Math.round(((-150 + 300 * f) / 30) * 2);
  const hours = (((12 * 2 + halves) % 24) + 24) % 24;
  const h = Math.floor(hours / 2) || 12;
  return hours % 2 ? `between ${h} and ${(h % 12) + 1} o’clock` : `${h} o’clock`;
}

const near = (a: number, b: number, span: number): boolean => Math.abs(a - b) <= span * 0.005;

/** Where a control goes, in words someone can follow on the hardware whatever its scale says. */
export function positionText(c: Control, v: ControlValue, values?: ControlValues): string {
  const shown = formatValue(c, v, values);
  if (c.kind === 'bool') {
    if (c.type === 'button') return v ? 'on (lit)' : 'off (not lit)';
    return v ? 'on' : 'off';
  }
  if (c.type === 'menu') return `set to ${shown} (in the display)`;
  if (c.kind === 'enum') return `set to ${shown}`;
  const num = Number(v);
  const span = c.max - c.min;
  const f = span > 0 ? (num - c.min) / span : 0;
  const atMin = near(num, c.min, span);
  const atMax = near(num, c.max, span);
  const mid = near(f, 0.5, 1);
  if (c.type === 'joystick') return mid ? 'centred' : `at ${shown}`;
  if (c.type === 'knob') {
    if (atMin) return `fully anticlockwise (${shown})`;
    if (atMax) return `fully clockwise (${shown})`;
    if (mid) return `straight up, at 12 o’clock (${shown})`;
    const at = clock(f);
    // near an end but not at it: the nearest half hour would read as the end itself
    if (at === '7 o’clock') return `at ${shown}, just past 7 o’clock`;
    if (at === '5 o’clock') return `at ${shown}, just short of 5 o’clock`;
    return `at ${shown}, ${at.startsWith('between') ? at : `about ${at}`}`;
  }
  // faders: up for more, or down for more on a lever with its maximum at the bottom; across, right for more
  const across = c.type === 'fader' && c.orient === 'h';
  const flip = maxAtBottom(c);
  const low = across ? 'all the way left' : flip ? 'all the way up' : 'all the way down';
  const high = across ? 'all the way right' : flip ? 'all the way down' : 'all the way up';
  if (atMin) return `${low} (${shown})`;
  if (atMax) return `${high} (${shown})`;
  if (mid) return `half way (${shown})`;
  // neither end, so never "0/10" or "10/10"
  const tenths = Math.min(9, Math.max(1, Math.round(f * 10)));
  return `at ${shown}, about ${tenths}/10 of the way ${across ? 'across' : flip ? 'down' : 'up'}`;
}

/** A control's line in a step's text: "- CUTOFF: fully clockwise (10)". */
export const controlLine = (
  def: SynthDef,
  c: Control,
  v: ControlValue,
  values?: ControlValues
): string => `- ${displayName(def, c)}: ${positionText(c, v, values)}`;
