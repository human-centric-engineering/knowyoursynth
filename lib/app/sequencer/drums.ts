/**
 * Drum beats to play along with a pattern (`f-step-sequencer` t-267), and which one suits it.
 *
 * Each beat is one bar of sixteen sixteenths, written a line per voice, as on a drum machine's grid: `x` a hit, `X` an
 * accent, `o` a ghost note, `.` nothing. `beatGrid` turns one into the hits the pattern player plays
 * (`lib/app/synths/audio/backing.ts`), with the pattern's swing.
 *
 * `drumStyleFor` picks a beat for a pattern. Its Inspired by comes first: a genre, or an artist known for one, by words
 * in it. Some styles have no beat (ambient, drone, film scores, classical): then none, rather than a beat that fights
 * the music. With no word to go by it falls back on the tempo and the swing. Pure, so the page and tests share it.
 */
import {
  BEAT_STEPS,
  DRUM_VOICES,
  type DrumGrid,
  type DrumHit,
} from '@/lib/app/synths/audio/backing';

export const DRUM_BEAT_IDS = [
  'four',
  'techno',
  'disco',
  'backbeat',
  'electro',
  'hiphop',
  'trap',
  'funk',
  'breakbeat',
  'onedrop',
  'halftime',
] as const;
export type DrumBeatId = (typeof DRUM_BEAT_IDS)[number];

type Lines = Partial<Record<(typeof DRUM_VOICES)[number], string>>;

export interface DrumBeat {
  id: DrumBeatId;
  name: string;
  /** What it is heard in: shown beside it. */
  styles: string;
  lines: Lines;
}

export const DRUM_BEATS: readonly DrumBeat[] = [
  {
    id: 'four',
    name: 'Four on the floor',
    styles: 'House, trance, EDM',
    lines: {
      kick: 'x...x...x...x...',
      clap: '....x.......x...',
      closedHat: 'o...o...o...o...',
      openHat: '..x...x...x...x.',
    },
  },
  {
    id: 'techno',
    name: 'Techno',
    styles: 'Techno, industrial',
    lines: {
      kick: 'X...x...X...x...',
      clap: '....x.......x...',
      closedHat: 'o.x.o.x.o.x.o.x.',
      rim: '...x.....x..x...',
    },
  },
  {
    id: 'disco',
    name: 'Disco',
    styles: 'Disco, Italo, Hi-NRG',
    lines: {
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      closedHat: 'x..ox..ox..ox..o',
      openHat: '..x...x...x...x.',
    },
  },
  {
    id: 'backbeat',
    name: 'Pop backbeat',
    styles: 'Synth-pop, synthwave, rock',
    lines: {
      kick: 'x.......x.x.....',
      snare: '....x.......x...',
      closedHat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'electro',
    name: 'Electro',
    styles: 'Electro, Miami bass, 808',
    lines: {
      kick: 'x......x..x.....',
      clap: '....x.......x...',
      closedHat: 'x.xxx.xxx.xxx.xx',
      rim: '..x.....x.....x.',
    },
  },
  {
    id: 'hiphop',
    name: 'Hip-hop',
    styles: 'Boom bap, lo-fi, G-funk',
    lines: {
      kick: 'x.........x..x..',
      snare: '....x.......x...',
      closedHat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'trap',
    name: 'Trap',
    styles: 'Trap, drill',
    lines: {
      kick: 'x......x.x......',
      clap: '........x.......',
      closedHat: 'x.x.x.x.x.xxx.xx',
    },
  },
  {
    id: 'funk',
    name: 'Funk',
    styles: 'Funk, soul, synth-funk',
    lines: {
      kick: 'x..x.......x..x.',
      snare: '....X..o.o..X...',
      closedHat: 'xoxoxoxoxoxoxoxo',
    },
  },
  {
    id: 'breakbeat',
    name: 'Breakbeat',
    styles: 'Drum & bass, jungle, big beat',
    lines: {
      kick: 'x.x.......x.....',
      snare: '....x..o.o..x..o',
      closedHat: 'x.x.x.x.x.x.x.x.',
    },
  },
  {
    id: 'onedrop',
    name: 'One drop',
    styles: 'Dub, reggae',
    lines: {
      kick: '........x.......',
      rim: '........x.......',
      closedHat: 'x.x.x.x.x.x.x.x.',
      openHat: '..............x.',
    },
  },
  {
    id: 'halftime',
    name: 'Half-time',
    styles: 'Dubstep, downtempo',
    lines: {
      kick: 'x.........x.....',
      snare: '........x.......',
      closedHat: 'x...x...x...x...',
    },
  },
];

export const drumBeat = (id: DrumBeatId): DrumBeat =>
  DRUM_BEATS.find((b) => b.id === id) ?? DRUM_BEATS[0];

const VELOCITY: Record<string, number> = { X: 1, x: 0.85, o: 0.4 };

/** The hits the player plays for `beat`, swung by `swing` (the pattern's, 50–75). */
export function beatGrid(beat: DrumBeat, swing: number): DrumGrid {
  const hits: DrumHit[] = [];
  DRUM_VOICES.forEach((voice, v) => {
    const line = beat.lines[voice];
    if (!line) return;
    for (let s = 0; s < BEAT_STEPS; s++) {
      const vel = VELOCITY[line[s]];
      if (vel) hits.push([s, v, vel]);
    }
  });
  return { hits, swing: Math.min(75, Math.max(50, swing)) };
}

/**
 * Words in an Inspired by, in the order they are tried: the first rule with a match wins, so a narrower style comes
 * before a wider one that its name contains (dubstep before dub, G-funk before funk, electro house before electro).
 * `null` is a style with no beat.
 */
const RULES: readonly [DrumBeatId | null, RegExp][] = [
  [
    null,
    /ambient|drone|orchestral|film scor|scores?\b|soundtrack|baroque|classical|sound effects?|radiophonic|music box|sound design|sci-fi|berlin school|new age|choral|minimalis|\bbach\b|tchaikovsky|scarlatti|messiaen|reich|philip glass|terry riley|la monte young|radigue|oliveros|harold budd|yoshimura|stars of the lid|morricone|herrmann|john williams|lustmord|biosphere|laraaji|steve roach/,
  ],
  ['trap', /\btrap\b|\bdrill\b/],
  ['halftime', /dubstep|future garage|half-?time|downtempo|burial/],
  [
    'breakbeat',
    /drum (and|&|n) bass|\bdnb\b|jungle|breakbeat|big beat|\bamen\b|prodigy|chemical brothers/,
  ],
  ['hiphop', /hip-?hop|lo-?fi|boom bap|g-funk|trip-?hop|\brap\b|nujabes|dilla|dr\.? dre/],
  ['onedrop', /\bdub\b(?! techno)|reggae|\bska\b|king tubby|lee .?scratch.? perry|scientist/],
  [
    'four',
    /house|trance|\bedm\b|\brave\b|eurodance|big room|deadmau5|van dyk|daft punk|swedish house|tiësto|tiesto/,
  ],
  [
    'techno',
    /techno|industrial|\bebm\b|basic channel|saunderson|jeff mills|richie hawtin|minimal(?! (wave|synth))/,
  ],
  ['disco', /disco|hi-?nrg|moroder|patrick cowley|cerrone|boogie/],
  ['electro', /\belectro\b|miami bass|\b808\b|freestyle|bambaataa|mantronix|kraftwerk/],
  ['funk', /funk|\bsoul\b|r&b|booker t|billy preston|parliament|stevie wonder|herbie hancock/],
  [
    'backbeat',
    /\bpop\b|synth-?pop|rock|wave|\b80s\b|ballad|punk|kraut|motorik|indie|kavinsky|carpenter brut|com truise|the weeknd|m83|röyksopp|royksopp|alabama 3|depeche|new order|gary numan|human league|tears for fears|a-ha|vangelis/,
  ],
];

/**
 * The words in a pattern's Inspired by that say its style: a genre, or an artist known for one. A work's title or a
 * synth's name says nothing of it ("Pop Muzik", a "PPG Wave"), so Match goes by the tempo for those.
 */
export function styleWordsOf(inspiredBy: { kind: string; label: string }): string | null {
  return inspiredBy.kind === 'genre' || inspiredBy.kind === 'artist' ? inspiredBy.label : null;
}

/** Which beat suits a pattern, and what it was chosen by. */
export interface DrumStyle {
  /** The beat, or `null` for a style that has none. */
  beat: DrumBeatId | null;
  by: 'style' | 'tempo';
}

/** The beat for a pattern inspired by `inspiredBy` (when known), at `bpm`, with `swing`. */
export function drumStyleFor(
  inspiredBy: string | null | undefined,
  bpm: number,
  swing: number
): DrumStyle {
  const words = (inspiredBy ?? '').toLowerCase();
  if (words) for (const [beat, re] of RULES) if (re.test(words)) return { beat, by: 'style' };
  return { beat: byTempo(bpm, swing), by: 'tempo' };
}

/** With nothing to go by but the feel: a swung groove is hip-hop or funk; straight, the tempo says. */
function byTempo(bpm: number, swing: number): DrumBeatId {
  if (swing >= 58) return bpm < 105 ? 'hiphop' : 'funk';
  if (bpm >= 155) return 'breakbeat';
  if (bpm >= 135) return 'techno';
  if (bpm >= 115) return 'four';
  if (bpm >= 85) return 'backbeat';
  return 'halftime';
}
