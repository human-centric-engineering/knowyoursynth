/**
 * The synth contract: the shapes a synth definition (`SynthDef`) is written in,
 * and the shapes the sound engine, the panel renderer, the cable explainer and
 * the sound library read from it.
 *
 * Transliterated from the prototype's `prototype/CONTRACT.md` (decision D3),
 * Addenda included, and checked against what the 25 prototype definitions and
 * the engine, renderer and library actually read and write. Where the prose and
 * the code disagreed, these types follow the code, and the field says so.
 *
 * Types only. The prose guide (how to author a definition, the rules the types
 * cannot express) is `.context/app/synths.md`. Definitions live in
 * `lib/app/synths/defs/`, and a sound is validated against its definition by
 * `lib/app/synths/validate.ts`.
 *
 * Coordinates are always view units: the SVG viewBox of the panel, which is the
 * pixel space of the cropped panel photo. Angles are degrees, 0 = 12 o'clock,
 * clockwise positive.
 */

// ─── Shared vocabularies ─────────────────────────────────────────────────────

/**
 * The parts of a synth voice. Drives colour coding in lessons, cards and panel
 * highlights, and the order of the orientation tour. `patch` (patch cables) is
 * used by areas and sound steps only; no control carries it.
 */
export const SYNTH_MODULES = [
  'osc',
  'mixer',
  'filter',
  'env',
  'amp',
  'mod',
  'lfo',
  'glide',
  'util',
  'fx',
  'out',
  'mode',
  'patch',
] as const;
export type SynthModule = (typeof SYNTH_MODULES)[number];

/** A sound's category: the first of its `tags`. */
export const PRESET_CATEGORIES = [
  'bass',
  'lead',
  'pad',
  'pluck',
  'keys',
  'fx',
  'drone',
  'perc',
  'seq',
  'brass',
  'strings',
  'wind',
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

/**
 * An engine signal name (a modulation or audio source a jack, route or normal
 * reads). The closed list is the engine's `SIGNALS`, which includes per-slot
 * names generated for the Moog 900 systems (`v1saw`, `e3`, `mu4` …), so it is
 * a string here and checked against that list where it matters.
 */
export type EngineSignal = string;

/** An engine destination name (`cutoff`, `pitch1`, `vcfIn` …): the engine's `DESTS`, as for {@link EngineSignal}. */
export type EngineDest = string;

/** A control's value: a number for `cont`, an option value for `enum`, a boolean for `bool`. */
export type ControlValue = number | string | boolean;

/** The value of one `enum` option. Most are strings; a few are numbers (DeepMind ARP OCTAVES, the Easel's stage count). */
export type OptionValue = string | number;

/** The whole panel state: control id → value. `toEngine` receives it, and a sound's `init` and `set` are partial copies. */
export type ControlValues = Record<string, ControlValue>;

/** A rectangle in view units. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── SynthDef ────────────────────────────────────────────────────────────────

/**
 * One synth: plain data plus one pure `toEngine()` function. The renderer and
 * the engine know nothing synth-specific; everything comes from here.
 */
export interface SynthDef {
  /** URL-safe id, e.g. `model-d`. */
  id: string;
  name: string;
  maker: string;
  year: number;
  /** One line: what it is based on, e.g. "Based on the 1970 Minimoog Model D". */
  heritage: string;
  /** One or two sentences on the signal path. */
  summary: string;
  /** The SVG viewBox. `h` is the faceplate height only (background cropped); the cheeks sit inside `w`. */
  view: { w: number; h: number };
  theme: Theme;
  /** Silkscreen and hardware that is not a control. */
  decor: Decor[];
  /** Named regions for "Explain sections", the search, the cards and the orientation tour. */
  areas: Area[];
  controls: Control[];
  jacks: Jack[];
  /** The init patch: a plain audible tone. Built from each control's `def`. */
  init: ControlValues;
  /**
   * Panel values → engine parameters. Must be pure, and must keep "nothing" a
   * real `0` / `false` / absent (a level knob at 0 gives `level: 0`, not
   * `0.0001`), or the sound map cannot tell a control that is off from one that
   * is on. Cables are not handled here: the app turns them into routes from the
   * jack definitions. Must ignore `ui` controls.
   */
  toEngine: (v: ControlValues, ctx: EngineContext) => EngineParams;
  /**
   * The sound library. The prototype keeps it on the definition (its own sounds
   * plus `sounds/<id>.js`); in the app sounds come from the catalogue tables, so
   * an app definition leaves this out.
   */
  presets?: Preset[];
  /** The history section. On the prototype definition; in the app it comes from the catalogue tables. */
  lineage?: Lineage;
  /** What this synth calls an engine signal in running text: `{ env1: 'the filter contour' }`. */
  signalNames?: Record<EngineSignal, string>;
  /** What this synth calls an engine destination when the explainer lists where a panel route sends a signal. */
  destNames?: Record<EngineDest, string>;
  /** The control whose value is the riff's BPM (TB-303 and TD-3 `seq.tempo`). */
  tempo?: string;
  /** The synth is silent with no cables, by design; the reason. The checker then accepts a silent init. */
  silentInit?: string;
  /** A pin matrix (EMS VCS3). */
  matrix?: PinMatrix;
  /** The same panel cut into modules and stacked like a modular case (the Jupiters). */
  modular?: ModularLayout;
}

/** The second argument of `toEngine`. */
export interface EngineContext {
  /** Mod wheel position, 0..1. */
  wheel: number;
  /** Which jacks have a cable, inputs and outputs alike (an output flag is for insert jacks such as the Kobol's VCO 2 OUT). */
  patched: Record<string, boolean>;
}

/** Faceplate look. Colours are CSS colours. */
export interface Theme {
  /** Faceplate colour. */
  panel: string;
  /** Darker shade for the faceplate gradient. */
  panel2: string;
  /** Silkscreen colour: labels, frames, ticks. Decor colours default to it. */
  ink: string;
  /** `din` = Barlow Semi Condensed, `helv` = Archivo Narrow. */
  font: 'din' | 'helv';
  /** End cheeks drawn outside the faceplate. */
  cheeks: 'wood' | 'metal' | 'none';
  /** Width of each cheek, inside `view.w`. */
  cheekW?: number;
  /** Lettering weight for the `din` font (default 500). */
  weight?: number;
  /** Section names on a solid label plate (ink plate, panel-colour letters). */
  tabs?: boolean;
  /** An unnumbered tick ring round every knob with no `scale`; `'dots'` prints dots instead (WASP). */
  knobRing?: boolean | 'dots';
  /** Output-jack names on a solid plate, so ins and outs read apart. */
  outPlates?: boolean;
  /** `button` controls get a black bezel. */
  bezel?: boolean;
  /** Round black sockets instead of hex nuts. */
  jack?: 'black';
  /** Plain `button` caps in black instead of light grey (UB-Xa D). */
  button?: 'black';
}

/** A pin board (EMS VCS3). A pin is a cable from a row jack to a column jack, so sounds list pins under `cables`. */
export interface PinMatrix {
  /** The hole of the first row and column. */
  x: number;
  y: number;
  /** Hole spacing. */
  pitch: number;
  /** Output jack ids, top to bottom. */
  rows: string[];
  /** Input jack ids, left to right. */
  cols: string[];
  /** Hit-box sizes `[w, h]` centred on each row / column jack, which sit at their printed legends. */
  legend: { row: [number, number]; col: [number, number] };
}

/** The modular case layout. Built into a renderable layout by `modularDef()` (the layout library). */
export interface ModularLayout {
  /** Printed on the blank panels that pad out short rows. */
  brand: string;
  /** Rows of modules, left to right. Each `cut` is `[x0, y0, x1, y1]` on the long panel, normally one printed section. */
  rows: { cut: [number, number, number, number] }[][];
}

// ─── Area ────────────────────────────────────────────────────────────────────

/**
 * A named region of the panel. Every control and jack sits inside exactly one
 * area; areas do not overlap (the rects of one area may touch).
 */
export interface Area {
  id: string;
  label: string;
  /** Colours the area and its card, and places it in the orientation tour. */
  module: SynthModule;
  /** Extra search words not in the label or help (synonyms, an effect's common name). */
  keywords: string;
  rects: ViewRect[];
  /** Two to four plain sentences: what this part is for and what its main controls do. */
  help: string;
  /** How this synth names or does it differently from most synths. */
  unusual?: string;
}

// ─── Control ─────────────────────────────────────────────────────────────────

export type LabelPos = 'top' | 'bottom' | 'left' | 'right' | 'none';

/**
 * Show a control only while another control has a value (`eq`) or one of
 * several (`in`). A list means all must hold. A hidden control keeps its value
 * and stays part of the sound, the search and the lessons.
 */
export type ShowCondition = { id: string; eq: ControlValue } | { id: string; in: ControlValue[] };

/** Fields every control has, whatever its `type` and `kind`. */
export interface ControlCommon {
  /** `module.param`, e.g. `filter.cutoff`. */
  id: string;
  /** Centre of the control. For a `select`, the point that decides its area. */
  x: number;
  y: number;
  module: SynthModule;
  /** One or two plain sentences: what the control does to the sound in general. */
  help: string;
  /** Printed label; may contain `\n`. Defaults to the id. */
  label?: string;
  /** The name used wherever the control is listed (search, cards), instead of `label` made unique. */
  name?: string;
  /** A `\n` label at `left` / `right` is stacked and centred on the control. */
  labelPos?: LabelPos;
  /** Default 17 (knobs) / 12 (switches). */
  labelSize?: number;
  /** Extra gap between the control and its label. */
  labelGap?: number;
  /** How this synth names or does it differently from most synths. */
  unusual?: string;
  show?: ShowCondition | ShowCondition[];
  /** A panel mode: changes what the panel shows, never the sound. `toEngine` ignores it; the sound map skips it. */
  ui?: boolean;
  /** One of many parameters behind a menu: a section card lists it only while it is on screen. */
  deep?: boolean;
  /** `false` leaves it out of the panel search (a copy of a control already indexed). */
  find?: boolean;
}

/** A continuous control, in panel units (what the hardware prints, usually 0–10). */
export interface ContinuousValue {
  kind: 'cont';
  min: number;
  max: number;
  def: number;
  /** Shown after the value (the Moog 900 systems use `'V'`). */
  unit?: string;
  /** Readout string for a value, e.g. `'420 ms'`. */
  fmt?: (v: number) => string;
  /** `'log'`: dragging moves the value by ratio (frequencies, times). Only applies when `min > 0`. */
  taper?: 'log';
  /** Values are rounded to this step. */
  step?: number;
}

/** One position of an `enum` control. */
export interface ControlOption {
  v: OptionValue;
  label: string;
  /** Pointer angle for an enum knob. Without it the options spread over −120°…+120°. */
  a?: number;
  /** `select`: where this option's button sits. An option with `hide` takes the first option's x, y. */
  x?: number;
  y?: number;
  /** `select`: text printed above this option's button. */
  text?: string;
  /** `select`: a coloured square cap with a lamp in its top edge. */
  capColor?: string;
  /** `select`: this option's lamp colour, overriding the control's. */
  lamp?: LampColor;
  /** `select`: no button for this option. */
  hide?: boolean;
}

/** A control with named positions. An enum knob prints each option's `label` at its angle (`''` suppresses it). */
export interface EnumValue {
  kind: 'enum';
  options: ControlOption[];
  def: OptionValue;
  /** Readout string for an option (Jupiter-8 wave knobs). */
  fmt?: (v: OptionValue) => string;
  /** Set on some Jupiter enum knobs by a shared helper; not read for an enum. */
  min?: number;
  max?: number;
}

/** An on/off control. */
export interface BoolValue {
  kind: 'bool';
  def: boolean;
}

export type ControlKind = 'cont' | 'enum' | 'bool';

/** Knob skirts and caps, one or more per maker. `vcs3` takes its cap colour from `cap`; `vcs3-dial` is a slow-motion dial. */
export type KnobStyle =
  | 'd-silver'
  | 'd-chicken'
  | 'pro1'
  | 'neutron'
  | 'neutron-big'
  | 'obxa'
  | 'kobol'
  | 'cat'
  | 'wasp'
  | 'vcs3'
  | 'vcs3-dial';

/**
 * Printing round a knob. `nums` are panel values printed at their true angle;
 * `labels` print text that is not the value (`{ at: 0, text: '10' }`, `at` a
 * panel value). Sweep is always −150°…+150°. Radii are in knob radii.
 */
export interface KnobScale {
  nums?: number[];
  labels?: { at: number; text: string }[];
  ticks?: number;
  numR?: number;
  tickR?: number;
  size?: number;
}

/** Lamp colours of backlit buttons and selects. */
export type LampColor = 'white' | 'blue' | 'amber' | 'red';

/** Rotary knob. */
export type KnobControl = ControlCommon & {
  type: 'knob';
  r: number;
  style: KnobStyle;
  scale?: KnobScale;
  /** `false` leaves this knob out of `theme.knobRing` (e.g. one with its own printed arc). */
  ring?: boolean;
  /** Cap colour for `vcs3` knobs. */
  cap?: string;
} & (ContinuousValue | EnumValue);

/**
 * Slide switch: an enum of 2–3 options (top→bottom or left→right) or a bool
 * (`true` at top/left unless `onAt: 'bottom'`). Position labels are decor.
 */
export type SlideControl = ControlCommon & {
  type: 'slide';
  w: number;
  h: number;
  orient: 'v' | 'h';
  onAt?: 'bottom';
} & (EnumValue | BoolValue);

/** Rocker switch: bool, or an enum (first option = left/top pressed; three options draw as one three-segment paddle). */
export type RockerControl = ControlCommon & {
  type: 'rocker';
  w: number;
  h: number;
  color: 'red' | 'blue' | 'white' | 'black' | 'orange' | 'teal' | 'green';
  orient?: 'h' | 'v';
} & (BoolValue | EnumValue);

/** Square button: a bool toggles, an enum cycles. Pair it with `led` decor, or give it a lamp of its own. */
export type ButtonControl = ControlCommon & {
  type: 'button';
  w: number;
  h: number;
  /** A backlit button that lights when on (bool) or not at its first option (enum). */
  lamp?: LampColor;
  /** `'always'`: an enum button that steps through a list and is lit whatever it is on. */
  lit?: 'always';
  /** `'ring'`: a cap with a printed rim, its name on the cap (`caption`) and a small corner lamp (PRO-800, VCS3). */
  face?: 'ring';
  /** Text printed on a `face: 'ring'` cap; `\n` for a second line. */
  caption?: string;
  /** Default 11. */
  captionSize?: number;
  /** `'red'`: a red `face: 'ring'` cap. */
  faceColor?: 'red';
  /** `'black'`: a black cap whatever `theme.button` says (the 303's black keys). */
  cap?: 'black';
  /** A plain flat cap of this colour (the Jupiters). */
  capColor?: string;
  /** With `capColor`: the button draws its own lamp in the cap, lit when on. */
  capLamp?: boolean;
} & (BoolValue | EnumValue);

/** Fader colours. `led` colours the lamp in the cap; `cap` replaces the lamp cap with a round coloured one. */
export type FaderLed = 'red' | 'green' | 'blue' | 'yellow' | 'white' | 'amber';

/**
 * Slider. (x, y) is the middle of the travel; vertical faders have max at the
 * top, horizontal at the right.
 */
export type FaderControl = ControlCommon & {
  type: 'fader';
  /** Travel length. */
  len: number;
  orient: 'v' | 'h';
  led?: FaderLed;
  /** A named colour (`white`, `red`, `grey`, `blue`, `green`, `yellow`, `black`) or a CSS colour. */
  cap?: string;
  /** Level marks: default 5 (vertical) / 0 (horizontal). */
  ticks?: number;
  /** Marks print on the right unless `'left'`. */
  tickSide?: 'left';
  /** `false` leaves out the first and last mark. */
  tickEnds?: boolean;
  /** How far the slot runs past each end of the travel (default 12). */
  pad?: number;
} & ContinuousValue;

/**
 * A row of backlit buttons, one per option, each at the option's own x, y with
 * printed `text` above it.
 */
export type SelectControl = ControlCommon & {
  type: 'select';
  w: number;
  h: number;
  lamp?: LampColor;
  /** Coloured square caps for every option. */
  capColor?: string;
  /** Pressing the lit button again sets this value (the Jupiter-8 arpeggio MODE buttons switch it off). */
  offValue?: OptionValue;
} & EnumValue;

/** One row of a display page: `label` on the left, the value in an inverted box on the right. Pair with `lcd` decor. */
export type MenuControl = ControlCommon & {
  type: 'menu';
  w: number;
  h: number;
  /** Text size. */
  size: number;
  /** Width of the value box. */
  vw: number;
} & (EnumValue | ContinuousValue);

/**
 * Bat-handle toggle seen from above. A bool leans up for `true` unless
 * `onAt: 'bottom'`; an enum of three is up–centre–down, or left–centre–right
 * with `orient: 'h'`.
 */
export type ToggleControl = ControlCommon & {
  type: 'toggle';
  /** Diameter of the nut. */
  w: number;
  h?: number;
  orient?: 'h';
  onAt?: 'bottom';
  /** How far the bat reaches from the nut, in radii (default 0.42). */
  lean?: number;
  /** Bat colour. */
  tip?: string;
} & (BoolValue | EnumValue);

/**
 * A two-axis stick: two cont −1..1 controls. The drawn one (left–right) names
 * the other in `pair`; the other (up–down) carries `pairOf`, is not drawn, and
 * sits a pixel off the first so the cells stay distinct.
 */
export type JoystickControl = ControlCommon & {
  type: 'joystick';
  r: number;
  pair?: string;
  pairOf?: string;
} & ContinuousValue;

/**
 * Any control. Narrow on `type` for its geometry and on `kind` for its values.
 * (`type: 'wheel'` is reserved in the prose; the mod wheel lives in the app's
 * keyboard strip, and no definition uses it.)
 */
export type Control =
  | KnobControl
  | SlideControl
  | RockerControl
  | ButtonControl
  | FaderControl
  | SelectControl
  | MenuControl
  | ToggleControl
  | JoystickControl;

export type ControlType = Control['type'];

// ─── Jack ────────────────────────────────────────────────────────────────────

/**
 * What the cable explainer passes a jack's `hear`: the facts it has already
 * worked out about the source on the cable. The definitions read `src` and
 * `kind` (and occasionally `root`, `live`, `amount`, `depth`).
 */
export interface JackHearContext {
  /** The source's name in running text, using `signalNames`. */
  src: string;
  /** The source's type: `none`, `noise`, `lfo`, `fast`, `audio`, `env`, `random`, `kbd`, `gate`, `other`. */
  kind: string;
  /** The engine signal at the root of the source. */
  root: EngineSignal;
  /** The source with the live facts that matter now, e.g. "the LFO (triangle, 5.2 Hz)". */
  live: string;
  /** Size of the move at the destination, in its unit (absolute). */
  amount: number;
  /** The move as words, e.g. "up to 2 semitones either way". */
  depth: string;
  /** The move as a size, e.g. "2 semitones". */
  size: string;
  /** +1 or −1. */
  sign: number;
  hz: number;
  shape: string;
  target: string;
  normal: string;
  replaced: boolean;
  shared: boolean;
  same: boolean;
  plural: boolean;
  uni: boolean;
  slowOsc: boolean;
  slowAttack: string;
  leaks: string;
  gated: string;
  stepped: string;
  smooth: boolean;
  doubles: boolean;
  self: boolean;
  synced: boolean;
}

/** Fields every jack has. */
export interface JackCommon {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Printed label. */
  label: string;
  /** `'none'` hides the printed label (its source is printed in a box below it, as on the 2600). */
  labelPos?: 'top' | 'bottom' | 'none';
  labelSize?: number;
  help: string;
  /** Unambiguous name when two jacks share a panel label (`'LFO (triangle)'`). Defaults to `label`. */
  name?: string;
  unusual?: string;
  /** Which voice of a two-voice synth (`dual`) the jack belongs to. */
  part?: 0 | 1;
  /**
   * A plain-English reason this jack's cable cannot be heard with the panel as
   * it is, naming the control to move; `null` when it can.
   */
  check?: (v: ControlValues) => string | null;
  /** Draws a banana socket of this colour (Easel): a named colour or a CSS colour. */
  banana?: string;
  /** Module, on a few Easel jacks. */
  module?: SynthModule;
}

/** An input. */
export interface InputJack extends JackCommon {
  dir: 'in';
  /** `null`: the engine cannot model this input; `help` says so, and a cable there does nothing audible. */
  dest: EngineDest | null;
  /**
   * How far a full-scale source moves the destination, in the destination's
   * unit (default 1). A function of the panel when a depth knob scales the jack.
   */
  amt?: number | ((v: ControlValues) => number);
  /** A cable here sums with the normalled source instead of breaking it (most CV inputs). */
  add?: boolean;
  /**
   * Replaces the generated "what you will hear" sentence when the effect depends
   * on panel routing; `null` (from the function) falls back to the generated text.
   */
  hear?: ((v: ControlValues, x: JackHearContext) => string | null) | null;
  /** Replaces the generic first sentence about depth. */
  does?: string | ((v: ControlValues) => string);
  /** Kobol's unmodelled inputs set it to `null` alongside `dest`. Not read for an input. */
  signal?: null;
}

/** An output. */
export interface OutputJack extends JackCommon {
  dir: 'out';
  /** `null`: the engine cannot model this output. */
  signal: EngineSignal | null;
  /** Scales what the jack sends wherever it is patched (the VCS3's numbered LEVEL knobs are row gains). */
  gain?: number | ((v: ControlValues) => number);
}

export type Jack = InputJack | OutputJack;

// ─── Decor ───────────────────────────────────────────────────────────────────

/** Fields every decor item may carry. Colours default to `theme.ink`; the outline view draws coloured print in ink. */
export interface DecorCommon {
  /** Faceplate artwork printed in the hardware view only, left out of the outline view. */
  hw?: boolean;
}

/**
 * Renderer print patterns usable as a `rect` or `path` fill:
 * `url(#kysPatStripes)`, `url(#kysPatDots)`, `url(#kysPatFine)`,
 * `url(#kysPatMesh)`, `url(#kysPatWaves)`, `url(#kysPatScales)`,
 * `url(#kysPatBay)`. Any CSS colour also works.
 */
export type DecorFill = string;

/** Rounded silkscreen frame. A label on the top/bottom line sits in a gap, like the hardware. */
export interface FrameDecor extends DecorCommon {
  t: 'frame';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius (default 14). */
  r?: number;
  label?: string;
  /** Default `'top'`. The `inside-*` positions print inside the frame, not on the line. */
  labelAt?: 'top' | 'bottom' | 'inside-top' | 'inside-bottom' | 'none';
  /** Default 22. */
  labelSize?: number;
  /** Width of the gap knocked out of the line behind the label. */
  gapW?: number;
  /** Label centre x, when it is not the frame's centre (PRO-800). */
  labelX?: number;
  /** Stroke width (default 2). */
  sw?: number;
  /** SVG dash pattern, e.g. `'8 5'`. */
  dash?: string;
}

/** Panel lettering in the theme font, upper-case as supplied. `\n` for more lines. */
export interface TextDecor extends DecorCommon {
  t: 'text';
  x: number;
  y: number;
  text: string;
  /** Default 17. */
  size?: number;
  anchor?: 'middle' | 'start' | 'end';
  weight?: number;
  fill?: string;
  /** Letter spacing: a CSS length (`'0.04em'`) or a number. */
  spacing?: string | number;
  /** Degrees about (x, y) (VCS3 matrix column names). */
  rotate?: number;
}

export interface LineDecor extends DecorCommon {
  t: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke width (default 2). */
  w?: number;
  stroke?: string;
  opacity?: number;
}

export interface PathDecor extends DecorCommon {
  t: 'path';
  /** SVG path data. */
  d: string;
  /** Stroke width (default 2); `0` for a filled, unstroked shape. */
  w?: number;
  fill?: DecorFill;
  stroke?: string;
  opacity?: number;
  dash?: string;
  /** `[dx, dy]`: the path moved as a whole (written by the modular layout). */
  shift?: [number, number];
}

export interface RectDecor extends DecorCommon {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill?: DecorFill;
  stroke?: string;
  /** Stroke width. */
  sw?: number;
  /** Present on the Moog 900 definitions; the renderer does not draw it for a rect. */
  dash?: string;
}

/** Not in the prose contract's list, but used by seven definitions (nuts, holes, rings). */
export interface CircleDecor extends DecorCommon {
  t: 'circle';
  x: number;
  y: number;
  r: number;
  fill?: string;
  stroke?: string;
  /** Stroke width (default 2). */
  sw?: number;
}

/** Waveform and envelope-shape glyphs. */
export type WaveShape =
  | 'tri'
  | 'shark'
  | 'saw'
  | 'rsaw'
  | 'sq'
  | 'pulse'
  | 'npulse'
  | 'sine'
  | 'tmod'
  | 'noise'
  | 'adsr'
  | 'ar';

/** A waveform glyph centred at (x, y). */
export interface WaveDecor extends DecorCommon {
  t: 'wave';
  x: number;
  y: number;
  /** Default 12. */
  size?: number;
  shape: WaveShape;
  /** Print colour, e.g. white on the 2600's orange boxes. */
  stroke?: string;
  /** Stroke width. */
  w?: number;
}

export interface ScrewDecor extends DecorCommon {
  t: 'screw';
  x: number;
  y: number;
  r?: number;
}

/** MIDI DIN socket. */
export interface DinDecor extends DecorCommon {
  t: 'din';
  x: number;
  y: number;
  r?: number;
}

export interface UsbDecor extends DecorCommon {
  t: 'usb';
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export type LedColor = 'red' | 'amber' | 'blue' | 'green' | 'white' | 'yellow';

/**
 * When an `led` lights.
 * - `'power'` always; `'gate'` while a key is held; `'lfo'` on the LFO's high
 *   half; `'overload'` when the output overloads; `'env1'` glows with Envelope 1
 *   over a dim floor (VCS3); `'pulser'` follows the Easel pulser's ramp.
 * - `{ id, eq }` while a control has a value (or `in` one of several; `near`
 *   allows a tolerance for a number; `not` inverts the test).
 * - `{ id, morph }` one lamp of a row a continuous knob fades across (Neutron SHAPE).
 * - `{ voice }` / `{ osc }` while that voice / oscillator sounds; `{ seq }` while
 *   the sequencer is on that stage (0-based).
 */
export type LitWhen =
  | 'power'
  | 'gate'
  | 'lfo'
  | 'overload'
  | 'env1'
  | 'pulser'
  | { id: string; eq?: ControlValue; in?: ControlValue[]; near?: number; not?: boolean }
  | { id: string; morph: number }
  | { voice: number }
  | { osc: number }
  | { seq: number };

export interface LedDecor extends DecorCommon {
  t: 'led';
  x: number;
  y: number;
  /** Default 6. */
  r?: number;
  color: LedColor;
  /** Unlit when absent. */
  litWhen?: LitWhen;
}

export interface LogoDecor extends DecorCommon {
  t: 'logo';
  x: number;
  y: number;
  size?: number;
  /** Text of a `behringer`, `plate` or `neutron` logo. */
  text?: string;
  /** Default `'behringer'`. */
  style?: 'behringer' | 'plate' | 'outline-d' | 'neutron';
  /** Strapline under a `neutron` logo. */
  sub?: string;
}

/** Little jack in/out arrow. */
export interface ArrowDecor extends DecorCommon {
  t: 'arrow';
  x: number;
  y: number;
  dir: 'down' | 'up';
  size?: number;
}

/**
 * A section name centred on (x, y), for names that are not a frame's label.
 * With `theme.tabs` it is a solid plate (`line`: outlined plate); otherwise
 * plain lettering with a gap knocked out of the line behind it.
 */
export interface TabDecor extends DecorCommon {
  t: 'tab';
  x: number;
  y: number;
  text: string;
  /** Default 14. */
  size?: number;
  line?: boolean;
  /** `false` when there is no line behind it. */
  gap?: boolean;
}

/** A printed arc, `a0 < a1`. */
export interface ArcDecor extends DecorCommon {
  t: 'arc';
  x: number;
  y: number;
  r: number;
  a0: number;
  a1: number;
  /** Stroke width (default 2). */
  w?: number;
  /** Default `'round'`. */
  cap?: 'round' | 'butt';
  opacity?: number;
  stroke?: string;
}

/** A backlit screen printing the title of the page the `page` control is on, and a note for pages with no rows. */
export interface LcdDecor extends DecorCommon {
  t: 'lcd';
  x: number;
  y: number;
  w: number;
  h: number;
  /** The control whose value is the page. */
  page: string;
  /** Page value → title. */
  titles: Record<string, string>;
  /** Page value → note (`\n` for lines), for pages with no rows. */
  notes?: Record<string, string>;
  /** Height of the title bar (default 30). */
  titleH?: number;
}

export type Decor =
  | FrameDecor
  | TextDecor
  | LineDecor
  | PathDecor
  | RectDecor
  | CircleDecor
  | WaveDecor
  | ScrewDecor
  | DinDecor
  | UsbDecor
  | LedDecor
  | LogoDecor
  | ArrowDecor
  | TabDecor
  | ArcDecor
  | LcdDecor;

export type DecorKind = Decor['t'];

// ─── Sounds (presets) ────────────────────────────────────────────────────────

/** A cable in a sound: `[outputJackId, inputJackId]`. A matrix pin is the same. */
export type CablePair = [from: string, to: string];

/** A cable on the panel at run time, as `presetState()` builds it. */
export interface PatchCable {
  from: string;
  to: string;
  /** Drawing colour, from the cable palette. */
  color: string;
}

/** One riff note: `[beat, midiNote, lengthBeats]`, with an optional velocity 0..1 (default 0.85). */
export type PhraseNote = [beat: number, note: number, length: number, velocity?: number];

/** A short riff that shows a sound off (not a copy of the song). */
export interface Phrase {
  bpm: number;
  loop: boolean;
  steps: PhraseNote[];
  /** Semitones added at play time. The engine reads it; no sound sets it. */
  transpose?: number;
}

/** One step of a sound's build. Steps apply cumulatively on top of `init`. */
export interface PresetStep {
  title: string;
  module: SynthModule;
  /** Plain-English reason, and what to listen for. */
  why: string;
  /** Control values this step sets. */
  set?: ControlValues;
  cables?: CablePair[];
}

/** A suggested move once the sound is built. */
export interface PresetTweak {
  /** Control id. */
  id: string;
  try: string;
  hear: string;
}

/** A sound in the library, built step by step. */
export interface Preset {
  id: string;
  name: string;
  /** `In the style of <artist> — "<work>"`. Never a claim to be the exact patch. */
  ref: string;
  artist: string;
  /** First tag is the category ({@link PRESET_CATEGORIES}). */
  tags: string[];
  /** 1 beginner · 2 intermediate · 3 advanced. */
  level: 1 | 2 | 3;
  /** One sentence describing the sound. */
  blurb: string;
  /** Two to four sentences: which module does what and why it sounds the way it does. */
  how: string;
  phrase: Phrase;
  steps: PresetStep[];
  /** Control id → what that control is doing in this sound. */
  context: Record<string, string>;
  tweaks: PresetTweak[];
  /** Set on a sound the AI tutor designed. */
  ai?: boolean;
}

// ─── Unusual notes and lineage ───────────────────────────────────────────────

/**
 * Per-synth notes on how it names or does a thing differently from most
 * synths: control, jack or area id → one to three sentences. Attached to the
 * items by `annotate()`, which throws on an id that matches nothing.
 */
export type UnusualNotes = Record<string, string>;

/** A step in a synth's family history. */
export interface LineageEntry {
  /** A year or range, as text (`'1975–81'`). */
  year: string;
  name: string;
  /** e.g. `'The original'`, `'This synth'`, `'Closest ancestor'`. */
  tag?: string;
  /** What it introduced and how that shows on this panel. */
  text: string;
}

/** A closely related instrument (or an honest rival, labelled as such). */
export interface LineageRelative {
  name: string;
  years: string;
  text: string;
}

/** One "Heard on" row, joined from the databank (`heardFor()`), never written in a lineage file. */
export interface HeardEntry {
  /** Artist names as displayed. */
  who: string;
  /** The work as displayed. */
  what: string;
  year?: string;
  /** The real instrument played. */
  on: string;
  text: string;
  /** A library sound in this style. */
  sound?: string;
  /** Song id. */
  song: string;
  /** Artist ids. */
  artists: string[];
}

/** The history section shown under the lesson. */
export interface Lineage {
  title: string;
  /** Two or three sentences. */
  intro: string;
  timeline: LineageEntry[];
  relatives: LineageRelative[];
  /** Filled from the databank; absent in the lineage file itself. */
  heard?: HeardEntry[];
  /** Players known to have used one, with no single record to list. */
  users?: string[];
  /** A caveat about the list. */
  note?: string;
}

// ─── Databank ────────────────────────────────────────────────────────────────

/** A real instrument: one named on records, or an original a panel copies. */
export interface BankInstrument {
  id: string;
  name: string;
  maker: string;
  /** As text. */
  year: string;
  kind: 'mono' | 'poly' | 'paraphonic' | 'modular' | 'semi-modular' | 'module' | 'sequencer';
  /** Maker (innovator) ids. */
  people?: string[];
  /** App synth ids that model this instrument; records made on it show in their "Heard on" lists. */
  app?: string[];
  text: string;
}

/** One instrument part on a work. */
export interface BankSongPart {
  /** Instrument ids. */
  instruments: string[];
  /** The real instrument, in words: `'Roland Jupiter-8 (the lead), with …'`. */
  on: string;
  /** Artist id. */
  player?: string;
  /** Extra app synths to list it under. */
  synths?: string[];
  /** App synth id → a library sound id in this style. */
  sounds?: Record<string, string>;
  /** What the synth plays on the record. */
  text: string;
  /** App synth id → text shown in that synth's list instead of `text`. */
  notes?: Record<string, string>;
}

/** One work. `body` is a body of work with no single record to name. */
export interface BankSong {
  id: string;
  /** Keeps its quotes for a song (`'"Axel F"'`), none for an album or score. */
  title: string;
  kind: 'song' | 'album' | 'score' | 'body' | 'performance';
  year?: string;
  album?: string;
  /** Artist ids. */
  artists: string[];
  /** Printed credit, when the names alone lose something. */
  credit?: string;
  parts: BankSongPart[];
}

/** A player, band, producer, composer or sound designer. */
export interface BankArtist {
  id: string;
  name: string;
  kind: 'person' | 'group';
  members?: string[];
  memberOf?: string[];
  country: string;
  active: string;
  eras: string[];
  genres: string[];
  roles: string[];
  summary: string;
  /** Three to five sentences of fact. */
  story: string;
  /** One sentence each, only where a matter of record. */
  innovations: string[];
  /** Instrument ids used beyond the records listed. */
  instruments?: string[];
}

/** An innovator: designer, engineer or founder. What they made is read from `BankInstrument.people`. */
export interface BankMaker {
  id: string;
  name: string;
  born?: string;
  died?: string;
  country: string;
  companies: string[];
  summary: string;
  story: string;
  innovations: string[];
}

// ─── EngineParams ────────────────────────────────────────────────────────────

/** Gain per waveform; omitted or 0 = silent. */
export interface OscMix {
  tri?: number;
  shark?: number;
  saw?: number;
  rsaw?: number;
  pulse?: number;
  sine?: number;
  tmod?: number;
  /** DeepMind OSC 2 TONE MOD: a square whose half cycles each start with a gap of `pw` (0..0.6). */
  notch?: number;
  /** A square an octave below, from a flip-flop on each cycle restart (follows sync resets). */
  sub?: number;
}

/** One oscillator (up to four; the fourth has signal `osc4`, dest `pitch4` and shares `pw2`). */
export interface OscParams {
  /** 0..1 into the filter. */
  level: number;
  mix?: OscMix;
  /** Pulse width 0.03..0.97 (default 0.5). */
  pw?: number;
  /** Offset in semitones from the played note (octave + detune, fractional ok). */
  semi: number;
  /** `false`: pitch = `fixedNote` + `semi`, ignoring the keyboard (default true). */
  kbd?: boolean;
  /** Default 60. */
  fixedNote?: number;
  /** Index of the master oscillator for hard sync, or −1 (default). */
  syncTo?: number;
  /** One morphing waveform instead of `mix`: 0 triangle → 0.5 saw → 2/3 square → 1 narrow pulse (Kobol). */
  morph?: number;
  /** Silent for the second half of each master cycle as well as synced (CAT SYNC MODE A). */
  syncGate?: boolean;
  /** 0..1: the triangle output leans into a ramp (VCS3). */
  skew?: number;
  /** −1..1: the sine output folds towards a rectified sine (VCS3). */
  sineShape?: number;
  /** Level of the sub-octave square straight into the mixer, on a channel of its own (Model 15). */
  subLevel?: number;
}

export interface NoiseParams {
  level: number;
  /** Default white. */
  color?: 'white' | 'pink';
  /** 0..1, low-frequency → pink → white; replaces `color`. */
  tone?: number;
  /** Scales the `noise` signal everywhere. */
  gain?: number;
  /** −1..1, dark … white … light (VCS3). */
  tilt?: number;
}

/** An envelope signal a filter or VCA can follow; `env1v` / `env2v` are scaled by key velocity. */
export type EnvSignal = 'env1' | 'env2' | 'env1v' | 'env2v';

export interface FilterParams {
  type: 'ladder' | 'svf';
  /** `'morph'` (SVF only): low-pass fading into high-pass by `morph`, notch halfway. */
  mode: 'lp' | 'hp' | 'bp' | 'morph';
  /** Second output's mode (Neutron). */
  mode2?: 'lp' | 'hp' | 'bp';
  /** Hz. */
  cutoff: number;
  /** 0..1.1; ≥ 1 self-oscillates. */
  res: number;
  /** Octaves; may be negative. */
  envAmt: number;
  envSrc: EnvSignal;
  /** Key tracking 0..1. */
  kbd: number;
  /** Input gain before the ladder's saturation (default 0.8). */
  drive?: number;
  /** 0..1 for `mode: 'morph'`. */
  morph?: number;
}

export interface EnvParams {
  /** Seconds. */
  a: number;
  d: number;
  /** 0..1. */
  s: number;
  r: number;
  /** Seconds to wait after the gate before the attack. */
  dly?: number;
  /** Seconds held at the peak before the decay. */
  hold?: number;
  /** 0..1 per stage (0.5 = straight): timed stages of exactly a / d / r seconds, each shaped. */
  curve?: { a: number; d: number; r: number };
  /** Key follow 0..1.2: times halve every two octaves above middle C at 1. */
  kf?: number;
  /** While held: rise over `a`, fall to silence over `d`, repeat (WASP REPEAT). `s` is ignored. */
  loop?: boolean;
  /** The level stops where it is (WASP HOLD). */
  freeze?: boolean;
}

export interface VcaParams {
  /** `'none'`: loudness only from `bias` and the `amp` destination. */
  envSrc: EnvSignal | 'none';
  /** 0..1 constant open. */
  bias: number;
  /** Level after the VCA (default 1). */
  gain?: number;
}

/** Gain per LFO shape. `sh` / `shg` are sample and hold / sample and glide. */
export interface LfoMix {
  tri?: number;
  saw?: number;
  rsaw?: number;
  sq?: number;
  sine?: number;
  sh?: number;
  shg?: number;
}

export interface LfoParams {
  /** Hz. */
  rate: number;
  mix: LfoMix;
  keySync: boolean;
  /** Seconds: silent for 40 %, then a fade-in. */
  delay?: number;
  /** Seconds before the `vib` signal fades in after each note. */
  vibDelay?: number;
  /** 0..1 depth of the `vib` signal. */
  vibDepth?: number;
}

/** A second LFO: signals `lfo2` and `lfo2Uni`. */
export interface Lfo2Params {
  rate: number;
  mix: LfoMix;
  keySync?: boolean;
  delay?: number;
}

export interface GlideParams {
  /** Seconds. */
  time: number;
  /** Glide only on overlapping notes. */
  legato: boolean;
}

/** What fires an envelope: dest `gateIn`, a pulse on each rise of `trigIn` (or each note), or `envClk`. */
export type EnvTrigSource = 'gate' | 'trig' | 'sh';

export interface TrigParams {
  retrig: boolean;
  drone: boolean;
  /** Envelopes gated by the LFO square. */
  repeat: boolean;
  /** Per envelope `[env1, env2]`. */
  src?: [EnvTrigSource, EnvTrigSource];
  /** Fire the envelopes from the LFO square with no key held. */
  auto?: boolean;
}

/** A panel modulation routing. Routes sum; they never break normals. */
export interface EngineRoute {
  src: EngineSignal;
  dst: EngineDest;
  /** In the destination's unit. */
  amt: number;
  /** The depth is multiplied by this signal (Jupiter-6 CROSS MOD ENV-1). */
  by?: EngineSignal;
}

/**
 * What feeds a destination when no cable is in its jack: a signal at unit
 * gain, `[signal, gain]`, or `null` to remove a built-in normal.
 */
export type NormalSource = EngineSignal | [EngineSignal, number] | null;

/** A cable as the engine takes it, from `cablesToEngine()`. */
export interface EngineCable {
  src: EngineSignal;
  dst: EngineDest;
  /** Input `amt` × output `gain`. */
  amt: number;
  /** Sums with the normal instead of breaking it. */
  add: boolean;
  /** Source and destination voice of a `dual` synth. */
  sp?: number;
  dp?: number;
  /** Set by the engine: the cable reads the other voice's signal. */
  x?: boolean;
}

export interface OverdriveParams {
  on: boolean;
  drive?: number;
  tone?: number;
  level?: number;
}

export interface DelayParams {
  on: boolean;
  /** Seconds. */
  time?: number;
  fb?: number;
  mix?: number;
}

export interface SampleHoldParams {
  /** Hz. */
  rate: number;
  /** Seconds. */
  glide: number;
  /** `'lfo'`: clocked by each rise of the LFO square (a cable into `shClock` still wins). */
  clock?: 'lfo';
}

/** A resonant 24 dB high-pass in series before the main filter (MS-20 pair), output signal `vcfHp`, cutoff dest `cutoffHp`. */
export interface HighPassParams {
  /** Hz. */
  cutoff: number;
  /** 0..1.1. */
  res: number;
  /** Octaves. */
  envAmt: number;
  envSrc: EnvSignal;
  kbd: number;
  /** `1`: a plain 6 dB one-pole, no resonance (Jupiter-8, Jupiter-4). */
  poles?: 1;
}

/** Spring reverb on dest `revIn`; signal `rev` is its output. */
export interface ReverbParams {
  on: boolean;
  mix: number;
  decay?: number;
  damp?: number;
  /** Signal `rev` is the dry/wet blend itself (set by `mix` plus dest `revMix`) and is not added to the output (VCS3). */
  unit?: boolean;
}

/** A pool of voices behind a note allocator. Without it the engine is the single voice. */
export interface PolyParams {
  voices: number;
  /** Voices per note, spread ±`detune`. */
  stack: number;
  /** Every key to one stack, legato like a mono synth. */
  mono: boolean;
  /** Semitones. */
  detune?: number;
}

export type ArpMode = 'up' | 'down' | 'updown' | 'downup' | 'random' | 'played';

/** Arpeggiator (poly only), sixteenth notes. */
export interface ArpParams {
  on: boolean;
  bpm: number;
  gate: number;
  mode: ArpMode;
  octaves: number;
  hold: boolean;
}

/** One effects slot: an algorithm with its parameters in display units, or empty. */
export type FxSlot =
  { alg: string; level: number; p: Record<string, number | string> } | { alg: null };

/** DeepMind effects processor (poly only). `{ mode: 'bypass' }` alone when nothing is loaded. */
export interface FxParams {
  mode: 'insert' | 'send' | 'bypass';
  /** 1..10. */
  routing?: number;
  /** Four slots. */
  slots?: FxSlot[];
}

/** Two different voices (2-XM). The top-level params are the first voice. */
export interface DualParams {
  /** The second voice: a full voice with its own settings. The volume is the top-level one. */
  b: Omit<EngineParams, 'volume' | 'dual'>;
  assign: 'unison' | 'split' | 'duo';
  /** MIDI note: keys below go to the first voice. */
  split: number;
  level: [number, number];
  /** −1..1 each. */
  pan: [number, number];
}

/** A note per oscillator (Poly D, paraphonic). */
export interface OscAssignParams {
  mode: 'poly' | 'unison';
  /** A let-go note stops at once while other keys are held. */
  damp?: boolean;
}

/** Juno-60-style stereo chorus (poly wrapper only). `0` = off (both buttons up), `3` = both pressed. */
export interface ChorusParams {
  on: boolean;
  mode: 0 | 1 | 2 | 3;
}

/** TB-303 accent (mono voice). */
export interface AcidParams {
  /** Velocity at or above which a note is accented (default 0.9). */
  thresh?: number;
  /** Accent every note. */
  force?: boolean;
  /** Envelope 1 decay on an accented note, seconds. */
  decay?: number;
  /** Accent sweep rise / fall, seconds. */
  rise?: number;
  fall?: number;
  /** Cutoff lift at full charge, octaves. */
  cut: number;
  /** Envelope 1 × amp added to the VCA. */
  amp: number;
}

/** Trapezoid generator replacing Envelope 1 (VCS3); signal `trap` = 1 − 2 × env1. */
export interface TrapParams {
  /** Rise, seconds. */
  a: number;
  /** Hold at the top, seconds. */
  on: number;
  /** Fall, seconds (scaled by 2^`decayCv`). */
  d: number;
  /** Rest, seconds. */
  off: number;
  /** Repeat; otherwise wait for a key or `hold`. */
  auto: boolean;
  hold: boolean;
}

/** One output amplifier (VCS3), fed by `out1In` / `out2In`; level adds dests `out1Lvl` / `out2Lvl`. */
export interface OutAmpParams {
  level: number;
  /** −1..1. */
  tone: number;
  /** 0..1. */
  pan: number;
}

/** Easel lowpass gate (vactrol). Each turns its signal upside down. */
export interface EaselGate {
  mode: 'lp' | 'combo' | 'vca';
  level: number;
}

/**
 * The Buchla Music Easel's own sound path, run in place of the oscillators,
 * mixer, filter, overdrive, VCA and delay. Control voltages are 0..1 for the
 * Easel's 0..10.
 */
export interface EaselParams {
  /** Complex oscillator. */
  cosc: {
    note: number;
    kbd: boolean;
    sign: number;
    /** 0..1, sine → wave. */
    shape: number;
    wave: 'spike' | 'sq' | 'tri';
    /** 0..1, folds sine and triangle. */
    timbre: number;
  };
  /** Modulation oscillator. */
  mosc: {
    hz: number;
    kbd: boolean;
    wave: 'saw' | 'sq' | 'tri';
    mode: 'fm' | 'am' | 'bal';
    index: number;
    fmIn: number;
  };
  /** `v` is the period slider 0..10; a change of `fire` fires it once. */
  pulser: { v: number; trig: 'kbd' | 'self' | 'seq'; mode: 'sus' | 'trans' | 'off'; fire: number };
  /** Time sliders 0..10 (0.002 s at 10 to 10 s at 0). */
  env: {
    a: number;
    s: number;
    d: number;
    trig: 'kbd' | 'pulser' | 'seq';
    mode: 'sus' | 'trans' | 'self';
  };
  seq: { levels: number[]; stages: number; pulses: boolean[]; trig: 'kbd' | 'pulser' | 'off' };
  rvs: { trig: 'kbd' | 'pulser' | 'seq' };
  gates: [EaselGate, EaselGate];
  mix: [number, number];
  /** Seconds, linear glide across the 28-key span. */
  porta: number;
  /** Semitones added to the key voltage. */
  add: number;
  /** 0..1. */
  preset: number;
  /** Steps through the held keys; each step is a new touch. */
  arp: { on: boolean; mode: 'up' | 'random'; rate: number };
}

/** One 921 / 921B oscillator. `semi` is the offset from middle C at 0 V. */
export interface MoogVco {
  kind: 'b' | '921';
  semi: number;
  sync: 'off' | 'weak' | 'strong';
  width?: number;
  clamp?: number;
  aux?: string;
  auxLevel?: number;
}

/**
 * The Moog 900-series modular (Systems 15, 35, 55), run in place of the fixed
 * voice. Every signal is in volts. Modules come in numbered slots; a slot no
 * cable reads is not run.
 */
export interface MoogParams {
  vco: MoogVco[];
  /** 921A drivers: frequency and width. */
  drv?: { v: number; w: number }[];
  lp904?: { lo: number; v: number; regen: number };
  hp904?: { lo: number; v: number };
  /** 914 fixed filter bank: 14 band gains. */
  fb914?: { g: number[] };
  /** 923 filters, Hz. */
  f923?: { lp: number; hp: number };
  vca?: { v: number; exp: boolean }[];
  /** 911 envelopes: times in seconds, sustain in volts. */
  env?: { t1: number; t2: number; t3: number; sus: number }[];
  /** Mixers: four gains and a master. */
  mix?: { g: number[]; m: number }[];
  /** Four attenuator gains. */
  att?: number[];
  /** CP3A-O / 992 controllers: switched inputs and the EXT INPUT attenuation. */
  ctl?: { on: boolean[]; x: number }[];
  i961?: { sens: number; onL: number; onR: number };
  /** CM1A trigger type. */
  cm1a?: { trig: 'v' | 's' | 'both' };
  /** 960 sequencer (System 55). A change of a `btn` field is a press. */
  s960?: {
    hz: number;
    timing: boolean;
    /** Three rows × eight stages, 0..10. */
    rows: number[][];
    /** Per row: 2, 4 or 8 volts full scale. */
    range: number[];
    mode: ('skip' | 'normal' | 'stop')[];
    btn: { on: boolean; off: boolean; shift: boolean; set: boolean[] };
  };
  /** 962 sequential switch: a change of a button is a press. */
  s962?: { btn: boolean[] };
  /** 911A dual trigger delay: delays in seconds. */
  d911a?: { d: number[]; mode: 'off' | 'parallel' | 'series' };
  /** 995 attenuators: six gains. */
  q995?: number[];
}

/**
 * What `toEngine()` returns: one voice's settings plus the opt-in features.
 * Everything optional is off (or at its default) when absent. A synth whose
 * sound path is `easel` or `moog` still supplies the stubs (`osc: []`,
 * `filter`, `vca`, `lfo`, `glide`, `trig`, `env1`, `env2`).
 */
export interface EngineParams {
  /** Up to four oscillators. */
  osc: OscParams[];
  noise: NoiseParams;
  /** Gain on the `extIn` audio destination, into the mixer. */
  ext: { level: number };
  filter: FilterParams;
  env1: EnvParams;
  env2: EnvParams;
  /** A third envelope, fired with the loudness envelope. */
  env3?: EnvParams;
  vca: VcaParams;
  lfo: LfoParams;
  lfo2?: Lfo2Params;
  glide: GlideParams;
  trig: TrigParams;
  /** 0..1. */
  volume: number;
  /** Semitones. */
  tune?: number;
  /** Oscillator `note2Osc` follows the second held note. */
  paraphonic?: boolean;
  /** Which oscillator follows the second note with `paraphonic` (default 1). */
  note2Osc?: number;
  /** Panel modulation routings. */
  routes?: EngineRoute[];
  /** Destination → what feeds it with no cable. Overrides the engine's built-in normals. */
  normals?: Record<EngineDest, NormalSource>;
  od?: OverdriveParams;
  delay?: DelayParams;
  sh?: SampleHoldParams;
  slew?: { time: number };
  /** Attenuator gains. */
  att?: [number, number];
  /** Reference tone. */
  a440?: boolean;
  /** Separate waveform signals `o1saw o1pulse o1tri o1sine … o3sine`. */
  oscOuts?: boolean;
  /** Oscillator 3 gets its own pulse-width destination `pw3`. */
  pwSplit?: boolean;
  /** Duophonic keyboard: `kbd` is the lowest key held, `kbd2` the highest. */
  duo?: boolean;
  /** Signal `ring` = `ringA` × `ringB`; `ac` / `acB` block DC on A / B. */
  ring?: { ac?: boolean; acB?: boolean };
  /** Signal `preamp` = tanh(`preampIn` × gain). */
  preamp?: { gain: number };
  /** Signal `envf` follows the level of `envfIn`. */
  envf?: { sens: number };
  rev?: ReverbParams;
  hpf?: HighPassParams;
  /** A 6 dB high-pass utility with nothing wired in: dest `hp6In` → signal `hp6`. */
  hp6?: { cutoff: number };
  /** Signal `sub` carries Oscillator 2's sub-octave square. */
  subOut?: boolean;
  poly?: PolyParams;
  arp?: ArpParams;
  /** Poly only: 6 dB high-pass (Hz) and a +12 dB shelf below ~110 Hz on the voice sum. */
  post?: { hpf: number; boost: boolean };
  /** Slow random pitch per voice. */
  drift?: { depth: number; rate: number };
  fx?: FxParams;
  dual?: DualParams;
  oscAssign?: OscAssignParams;
  chorus?: ChorusParams;
  acid?: AcidParams;
  trap?: TrapParams;
  /** Joystick position: signals `joyX`, `joyY`. */
  joy?: [number, number];
  /** Two output amplifiers; the voice is then stereo and is the whole output. */
  outAmps?: [OutAmpParams, OutAmpParams];
  easel?: EaselParams;
  moog?: MoogParams;
  /** Set by the app after `toEngine()`, from the cables (`cablesToEngine()`). Not returned by a definition. */
  cables?: EngineCable[];
  /** Set by the app after `toEngine()`: the mod wheel. Not returned by a definition. */
  wheel?: number;
}
