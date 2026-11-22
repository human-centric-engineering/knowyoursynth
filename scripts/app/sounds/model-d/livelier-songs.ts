/**
 * Livelier Model D patterns (`f-livelier-patterns` t-304): new default songs for library sounds whose default was a
 * one- or two-bar loop. Owner ruling (2026-11-22): rework the boring, predictable patterns, not every one; give a
 * well-known song a B variation where it clearly helps; let some, especially leads, bring their own effects. Written
 * to the library by `write-livelier-songs.ts`.
 *
 * Two kinds:
 * - **Composed**: a sound whose riff was its own. A new song in the sound's own key and character, parts A and B,
 *   chained, sometimes with a slow mod lane on a control the lesson's last section suggests turning (`lane-sounds.md`
 *   for the hand rule). The sound's riff becomes part A's first loop.
 * - **Song**: a sound whose default is a researched transcription. Part A is the transcription's steps as they are, so
 *   the sound's riff does not change, and part B is a variation on its figure written for the sound. The transcription
 *   stays on the sound's list behind it, and no other synth's sound moves.
 *
 * `genre` is what the drums' Match goes by (`drumStyleFor`), so it is chosen for the beat as much as the credit, and
 * never names a person (owner ruling, 2026-11-02).
 */
import type { PatternFx } from '@/lib/app/sequencer/pattern';
import type { PatternRole } from '@prisma/client';
import type { Lane } from '@/scripts/app/sounds/lane-kit';
import { wave } from '@/scripts/app/sounds/lane-kit';
import type { StepSize } from '@/lib/app/sequencer/pattern';

export interface LivelierSpec {
  /** The Model D sound's slug. */
  sound: string;
  name: string;
  role: PatternRole;
  bpm: number;
  stepSize?: StepSize;
  swing?: number;
  /** Steps a part. */
  len: number;
  /** Part A as written, or the researched pattern whose first part it keeps note for note. */
  a: string | { from: string };
  b: string;
  /** The lanes each part plays (`wave` with the same low point in both, so the seams join). */
  lanes?: { a: Record<string, Lane>; b: Record<string, Lane> };
  chain: number[];
  /** A composed song's genre; a song keeps its transcription's Inspired by. */
  genre?: string;
  fx?: PatternFx;
  /** What the song does, part by part: the record kept with the pattern. */
  notes: string;
}

/** Beats written four steps at a time, `|` between them for the eye. */
const beats = (...b: string[]): string => b.join(' | ');

/** Every one-step note in `text` cut to `gate` of its step: a staccato line on a gated sound. */
export function stacc(text: string, gate = 0.5): string {
  return text
    .split(/\s+/)
    .map((t) => {
      const m = /^([A-G][#b]?-?\d)([!^]*)(\*\d)?$/.exec(t);
      return m ? `${m[1]}:${gate}${m[2]}${m[3] ?? ''}` : t;
    })
    .join(' ');
}

const reverb = (size: number, mix: number): PatternFx['reverb'] => ({ size, mix });
const delay = (time: number, feedback: number, mix: number): PatternFx['delay'] => ({
  time,
  feedback,
  mix,
});

export const LIVELIER: LivelierSpec[] = [
  // ── Basses ────────────────────────────────────────────────────────────────
  {
    sound: 'feedback-growl',
    name: 'Growl bass: riff and chromatic push',
    role: 'bass_line',
    bpm: 92,
    len: 32,
    a: beats(
      'A1:2 . A1 .',
      'C2 . A1 A1',
      'G1:3 . . Ab1',
      '. A1 . .',
      'A1:2 . A1 .',
      'C2 . D2 C2',
      'G1:2 . Ab1 .',
      'G1 . F1:2 .'
    ),
    b: beats(
      'A1 A1 A2 A1',
      '. A1 C2 D2',
      'Eb2:2 . D2 .',
      'C2 . A1 .',
      'A1 A1 A2 A1',
      '. G1 Ab1 A1',
      'C2 C2 D2 Eb2',
      'E2:2 . Eb2 D2'
    ),
    chain: [0, 0, 0, 1],
    genre: 'Industrial',
    fx: { drive: { amount: 0.45, tone: 0.5 } },
    notes:
      'Part A is the growl riff, a low A that falls to G and creeps up a semitone. Part B doubles the A an octave up and pushes up chromatically, E flat to E, to throw back into the riff. The drive pedal adds the grit an industrial bass is played through.',
  },
  {
    sound: 'open-buzz-bass',
    name: 'Open buzz bass: verse and lift',
    role: 'bass_line',
    bpm: 128,
    len: 32,
    a: beats(
      'E2:2 . E2 E2',
      'G2:2 . D2 E2',
      'E2:2 . E2 E2',
      'A2:2 . G2 D2',
      'E2:2 . E2 E2',
      'G2:2 . D2 E2',
      'C2:2 . C2 C2',
      'D2:2 . D2 B1'
    ),
    b: beats(
      'C2:2 . C2 C2',
      'E2:2 . G2 C2',
      'D2:2 . D2 D2',
      'F#2:2 . A2 D2',
      'E2:2 . E2 E2',
      'G2:2 . B2 E2',
      'E3:2 . D3 B2',
      'A2:2 . G2 D2'
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-1.4, 0.4, 32) },
      b: { 'filter.cutoff': wave(-1.4, 1.6, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'New wave',
    notes:
      'Part A drives E minor in eighths and sixteenths, turning through C and D at its end. Part B lifts through C, D and E with a run up to E3. The cutoff lane opens and closes once a part, wider in B, so the buzz swells with the lift.',
  },
  {
    sound: 'filter-fm-grit-bass',
    name: 'Grit bass: offbeat line and turn',
    role: 'bass_line',
    bpm: 128,
    len: 32,
    a: stacc(
      beats(
        '. F2 F2 F2',
        '. F2 F2 Ab2',
        '. F2 F2 F2',
        '. Eb2 Eb2 F2',
        '. F2 F2 F2',
        '. F2 F2 Ab2',
        '. F2 Bb2 F2',
        '. C3 Bb2 Ab2'
      )
    ),
    b: stacc(
      beats(
        '. F2 F3 F2',
        '. F2 Ab2 F2',
        '. Db2 Db2 Db2',
        '. Db2 Eb2 F2',
        '. Eb2 Eb3 Eb2',
        '. Eb2 G2 Eb2',
        '. C2 C3 C2',
        '. E2 F2 G2'
      )
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-1.8, 0, 32) },
      b: { 'filter.cutoff': wave(-1.8, 1.2, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Techno',
    notes:
      'Off-beat sixteenths, the kick left its downbeats. Part A sits on F with small turns; part B walks F, D flat, E flat and C, an octave jump in each, with E natural leading home. The cutoff lane breathes once a part, wider in B.',
  },
  {
    sound: 'tubby-dub-sub',
    name: 'Dub sub: riddim and turnaround',
    role: 'bass_line',
    bpm: 76,
    len: 32,
    a: beats(
      'C2:3 . . .',
      'C2 . G2:2 .',
      'F2:3 . . .',
      'Eb2 . C2:2 .',
      'C2:3 . . .',
      'C2 . G2:2 .',
      'Bb1:3 . . .',
      'Bb1 . C2:2 .'
    ),
    b: beats(
      'Ab1:3 . . .',
      'Ab1 . Eb2:2 .',
      'Bb1:3 . . .',
      'Bb1 . F2:2 .',
      'C2:3 . . .',
      'Eb2 . F2:2 .',
      'G2:3 . . F2',
      'Eb2 . D2:2 .'
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-2.6, -1.2, 32) },
      b: { 'filter.cutoff': wave(-2.6, -0.6, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Dub',
    notes:
      'Part A is the riddim on C minor with a drop to B flat; part B moves to A flat and B flat and climbs back through G. The cutoff lane opens the sub a little and closes it again, more in B, as a dub engineer rides the bass filter.',
  },
  {
    sound: 'trap-808-slide',
    name: '808 slide: pattern and switch-up',
    role: 'bass_line',
    bpm: 70,
    len: 32,
    a: beats(
      'C2:3 . . C2',
      '. . C2 .',
      'G2:2^ . Eb2:2 .',
      'F2:4 . . .',
      'C2:3 . . C2',
      '. . C2 C2',
      'Bb1:2 . C2:2^ .',
      'Eb2:2 . C2:2 .'
    ),
    b: beats(
      'Ab1:3 . . Ab1',
      '. . Ab1 .',
      'Eb2:2^ . C2:2 .',
      'Bb1:4 . . .',
      'C2:2 . C3:2^ .',
      'C2:2 . . C2',
      'G2:2^ . F2:2^ .',
      'Eb2:2^ . D2:2 .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Trap',
    notes:
      'Part A is the 808 on C with slides up to G and down to E flat; part B switches to A flat and B flat, jumps an octave and slides down G, F, E flat to D. The slides are where the glide is heard.',
  },
  {
    sound: 'walking-upright-bass',
    name: 'Walking bass: two choruses of changes',
    role: 'bass_line',
    bpm: 132,
    stepSize: '1/8',
    swing: 60,
    len: 32,
    a: beats(
      'D2:2 . F2:2 .',
      'A2:2 . C3:2 .',
      'B2:2 . G2:2 .',
      'F2:2 . D2 E2',
      'C3:2 . B2:2 .',
      'G2:2 . E2:2 .',
      'A2:2 . C#3:2 .',
      'E2:2 . C#2:2 .'
    ),
    b: beats(
      'Bb2:2 . A2:2 .',
      'F2:2 . D2:2 .',
      'A2:2 . G2:2 .',
      'E2:2 . C#2:2 .',
      'D2:2 . E2:2 .',
      'F2:2 . F#2:2 .',
      'G2:2 . A2 Bb2',
      'A2:2 . C#2:2 .'
    ),
    chain: [0, 1],
    genre: 'Jazz',
    fx: { reverb: reverb(0.3, 0.15) },
    notes:
      'A walking line in quarter notes, swung: part A walks D minor 7, G7, C major 7 and A7, part B walks down B flat major 7 and A7, then D minor and a chromatic climb back with a pickup. Every bar ends a step away from the next chord. A small room around it.',
  },
  {
    sound: 'long-sub-boom',
    name: 'Jungle sub: rollers and drop',
    role: 'bass_line',
    bpm: 165,
    len: 64,
    a: [
      'G1:6 . . . . . G1:2 . Bb1:4 . . . F1:2 . G1 .',
      'G1:8 . . . . . . . . . D2:2 . C2:2 . Bb1 .',
      'G1:6 . . . . . G1:2 . Bb1:4 . . . F1:2 . G1 .',
      'Eb2:6 . . . . . Eb2:2 . D2:4 . . . C2:2 . Bb1:2 .',
    ].join(' | '),
    b: [
      'G1:4 . . . G2:2 . G1:2 . F1:4 . . . F2:2 . Eb1:2 .',
      'D1:8 . . . . . . . D2:4 . . . C2:2 . Bb1:2 .',
      'G1:4 . . . G2:2 . G1:2 . F1:4 . . . F2:2 . Eb1:2 .',
      'Bb1:4 . . . C2:4 . . . D2:6 . . . . . F1:2 .',
    ].join(' | '),
    chain: [0, 1],
    genre: 'Jungle',
    notes:
      'Four bars of long sub notes under fast breaks: part A rolls on G with a turn down through E flat, part B jumps octaves and drops to a low D before climbing B flat, C, D. The long notes are where the sub booms.',
  },

  // ── Leads ─────────────────────────────────────────────────────────────────
  {
    sound: 'fifths-lead',
    name: 'Fifths lead: theme and answer',
    role: 'lead_line',
    bpm: 108,
    len: 32,
    a: beats(
      'D4:3 . . F4',
      'G4:4 . . .',
      'F4:2 . D4:2 .',
      'C4:4 . . .',
      'D4:2 . F4 G4',
      'A4:3 . . C5',
      'A4:2 . G4 F4',
      'G4:4 . . .'
    ),
    b: beats(
      'A4:3 . . C5',
      'D5:4 . . .',
      'C5:2 . A4 G4',
      'A4:4 . . .',
      'F4:2 . G4 A4',
      'C5:2 . A4 G4',
      'F4:2 . E4 D4',
      'E4:2 . C4:2 .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Jazz-funk',
    fx: { delay: delay(0.3, 0.3, 0.22), reverb: reverb(0.4, 0.18) },
    notes:
      'A D dorian theme in parallel fifths: part A rises to G and A, part B answers an octave higher from D5 and comes down to a half close on C. A short delay and a little room, as a fusion lead is played.',
  },
  {
    sound: 'bubble-wah-lead',
    name: 'Bubbling wah: skank line and answer',
    role: 'lead_line',
    bpm: 76,
    len: 32,
    a: beats(
      '. . A4 .',
      'C5 . A4 .',
      '. . G4 .',
      'E4:3 . . .',
      '. . A4 .',
      'C5 . D5 .',
      'C5 . A4:2 .',
      'G4 . A4:2 .'
    ),
    b: beats(
      '. . E5 .',
      'D5 . C5 .',
      '. . D5 .',
      'A4:3 . . .',
      '. . C5 .',
      'A4 . G4 .',
      'E4 . G4:2 .',
      'G4 . A4:2 .'
    ),
    lanes: {
      a: { 'filter.emphasis': wave(5, 7, 32) },
      b: { 'filter.emphasis': wave(5, 8, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Roots reggae',
    fx: { delay: delay(0.5, 0.45, 0.3), reverb: reverb(0.5, 0.2) },
    notes:
      'Off-beat phrases in A minor that leave the downbeats to the drums: part A climbs to D, part B starts high on E and falls back. The emphasis lane pushes the wah more vocal through each part, most in B, and a dub delay throws the phrase ends back.',
  },
  {
    sound: 'scoop-bend-lead',
    name: 'Scoop lead: lick and high answer',
    role: 'lead_line',
    bpm: 104,
    len: 32,
    a: beats(
      'A4 . C5 .',
      'D5:3 . . .',
      'E5:2 . G5 .',
      'E5:3 . . .',
      '. . D5 C5',
      'A4 . G4:2 .',
      'A4:3 . . C5',
      'A4:4 . . .'
    ),
    b: beats(
      'G5:2 . E5 .',
      'G5:2 . A5:2 .',
      'G5 E5 D5 .',
      'E5:4 . . .',
      'D5 . C5 .',
      'D5 . E5:2 .',
      'C5 . A4 G4',
      'A4:4 . . .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'P-funk',
    notes:
      'An A minor pentatonic lick that glides up to E and settles on A; part B starts high on G and A and answers it on the way down. Every leap is where the glide scoops.',
  },
  {
    sound: 'nasal-reed-lead',
    name: 'Reed lead: theme and development',
    role: 'lead_line',
    bpm: 112,
    len: 32,
    a: beats(
      'G4 . Bb4 .',
      'C5 . D5 C5',
      'Bb4 . F4 .',
      'G4:4 . . .',
      'D5 . C5 .',
      'Bb4 A4 G4 .',
      'D4 . F4 .',
      'G4:4 . . .'
    ),
    b: beats(
      'Bb4 . C5 D5',
      'Eb5 . D5 .',
      'C5 Bb4 C5 .',
      'D5:4 . . .',
      'F5 . Eb5 D5',
      'C5 . Bb4 .',
      'A4 . F#4 .',
      'G4:4 . . .'
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-1.2, -0.2, 32) },
      b: { 'filter.cutoff': wave(-1.2, 0.6, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Prog rock',
    fx: { reverb: reverb(0.45, 0.2) },
    notes:
      'A G minor theme in short phrases; part B develops it upwards to F and comes home through F sharp. The high-pass cutoff lane thins the reed and gives it back once a part, thinnest in B.',
  },
  {
    sound: 'chip-octave-arp',
    name: 'Chiptune arpeggios: verse and chorus',
    role: 'arp',
    bpm: 150,
    len: 32,
    a: beats(
      'C5 E5 G5 C6',
      'A5:2 . G5:2 .',
      'F5 A5 C6 F6',
      'E6:2 . D6:2 .',
      'D5 F5 A5 D6',
      'C6:2 . B5:2 .',
      'G5 B5 D6 B5',
      'G5:2 . . B5'
    ),
    b: beats(
      'A4 C5 E5 A5',
      'G5:2 . E5:2 .',
      'F4 A4 C5 F5',
      'E5:2 . C5:2 .',
      'G4 B4 D5 G5',
      'F5:2 . D5:2 .',
      'E5 G5 C6 E6',
      'D6 C6 B5 G5'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Chiptune',
    notes:
      'Arpeggios as a game console plays chords on one voice: part A climbs C, F, D minor and G, each run landing on two held notes; part B goes A minor, F, G and C, ending on a run down into the top.',
  },
  {
    sound: 'sitar-meend-lead',
    name: 'Sitar meend: alap and answer',
    role: 'lead_line',
    bpm: 76,
    stepSize: '1/8',
    len: 32,
    a: beats(
      'D4:4 . . .',
      'E4:2 . F4:2 .',
      'F4:4 . . .',
      'E4 F4 G4:2 .',
      'F4:2 . E4:2 .',
      'D4:4 . . .',
      'C4:2 . D4:2 .',
      'D4:4 . . .'
    ),
    b: beats(
      'A4:4 . . .',
      'Bb4:2 . A4:2 .',
      'G4:4 . . .',
      'F4 G4 A4:2 .',
      'G4:2 . F4:2 .',
      'E4:4 . . .',
      'F4:2 . E4:2 .',
      'D4:4 . . .'
    ),
    chain: [0, 1],
    genre: 'Hindustani classical',
    fx: { reverb: reverb(0.55, 0.25), delay: delay(0.45, 0.25, 0.15) },
    notes:
      'A slow phrase around D, every step a glide (meend) to the next: part A circles D, E and F; part B starts on the fifth, A, touches B flat and comes down the scale to D. A long room and a soft echo, as a sitar rings. No drums: Match finds none for raga.',
  },

  // ── Sequences and plucks ──────────────────────────────────────────────────
  {
    sound: 'bright-seq-arp',
    name: 'Bright sequence: four chords',
    role: 'arp',
    bpm: 126,
    len: 32,
    a: beats(
      'D4 A4 D5 A4',
      'F5 A4 D5 A5',
      'D4 A4 D5 A4',
      'F5 A4 E5 D5',
      'C4 G4 C5 G4',
      'E5 G4 C5 G5',
      'C4 G4 C5 G4',
      'E5 G4 D5 C5'
    ),
    b: beats(
      'Bb3 F4 Bb4 F4',
      'D5 F4 Bb4 F5',
      'Bb3 F4 Bb4 F4',
      'D5 F4 C5 Bb4',
      'A3 E4 A4 E4',
      'C#5 E4 A4 E5',
      'A3 E4 A4 C#5',
      'E5 C#5 A4 E4'
    ),
    lanes: {
      a: { 'filter.emphasis': wave(2, 4.5, 32) },
      b: { 'filter.emphasis': wave(2, 6, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Synth-pop',
    fx: { delay: delay(0.27, 0.35, 0.2) },
    notes:
      'A sixteenth-note sequence through D minor and C (part A), then B flat and A, the A major chord turning back to D minor (part B). The emphasis lane makes the sequence ring a little more and less once a part, most in B, and a short delay doubles the sixteenths.',
  },
  {
    sound: 'dry-blip-pluck',
    name: 'Blip pluck: riff and turnaround',
    role: 'lead_line',
    bpm: 112,
    len: 32,
    a: stacc(
      beats(
        'E4 E4 . G4',
        '. E4 A4 .',
        'E4 E4 . B4',
        '. A4 G4 .',
        'E4 E4 . G4',
        '. E4 A4 B4',
        'D5 . B4 A4',
        '. G4 . E4'
      )
    ),
    b: stacc(
      beats(
        'C4 C4 . E4',
        '. C4 G4 .',
        'D4 D4 . F#4',
        '. D4 A4 .',
        'E4 E4 . G4',
        '. B4 . A4',
        'G4 . F#4 .',
        'E4 . D4 E4'
      )
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-1, 0, 32) },
      b: { 'filter.cutoff': wave(-1, 0.8, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Post-punk',
    notes:
      'A choppy E minor riff of repeated blips; part B moves it to C and D before coming home. The cutoff lane opens the blips a little once a part, more in B.',
  },
  {
    sound: 'hard-blip-stab',
    name: 'Blip stabs: hook and answer',
    role: 'chord_stabs',
    bpm: 144,
    len: 32,
    a: stacc(
      beats(
        '. . G5 .',
        'G5 . Bb5 .',
        '. . . .',
        '. . F5 G5',
        '. . G5 .',
        'G5 . C6 .',
        'Bb5 . . .',
        '. . F5 G5'
      ),
      0.4
    ),
    b: stacc(
      beats(
        '. . D6 .',
        'C6 . Bb5 .',
        '. . A5 .',
        'Bb5 . G5 .',
        '. . F5 .',
        'G5 . Bb5 .',
        'C6 . Bb5 .',
        'A5 . F5 G5'
      ),
      0.4
    ),
    lanes: {
      a: { 'filter.emphasis': wave(4.5, 6.5, 32) },
      b: { 'filter.emphasis': wave(4.5, 8, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Synth-pop',
    fx: { delay: delay(0.3, 0.4, 0.25) },
    notes:
      'Off-beat stabs on G with gaps for the echo to fill; part B is busier and comes down from D. The emphasis lane sharpens the stabs once a part, most in B.',
  },

  // ── Percussion ────────────────────────────────────────────────────────────
  {
    sound: 'falling-tom',
    name: 'Electronic toms: groove and fill',
    role: 'percussive',
    bpm: 110,
    len: 32,
    a: beats(
      'D3:2 . . .',
      '. . A2 .',
      '. . . .',
      'D3 . A2 .',
      'D3:2 . . .',
      '. . A2 .',
      '. . D3 D3',
      'A2 A2 E2:2 .'
    ),
    b: beats(
      'D3:2 . . .',
      '. . A2 .',
      '. . . .',
      'D3 . A2 .',
      'F3 F3 D3 D3',
      'A2 A2 F2 F2',
      'D3 D3 A2 A2',
      'F2 E2 D2:2 .'
    ),
    chain: [0, 0, 0, 1],
    genre: '80s pop',
    notes:
      'Toms between the drums’ backbeat: part A answers it high and low, with a short roll at its end; part B is the fill, falling all the way from F3 to D2 into the top.',
  },
  {
    sound: 'square-cowbell',
    name: 'Cowbell: pattern and two-note melody',
    role: 'percussive',
    bpm: 112,
    len: 32,
    a: beats(
      'C#4 . . C#4',
      '. . C#4 .',
      'C#4 . C#4 .',
      '. C#4 C#4 .',
      'C#4 . . C#4',
      '. . C#4 .',
      'C#4 . . C#4',
      '. C#4 . G#4'
    ),
    b: beats(
      'C#4 . . G#4',
      '. . C#4 .',
      'F#4 . . C#4',
      '. . G#4 .',
      'C#4 . . G#4',
      '. . C#4 .',
      'F#4 . F#4 .',
      'E4 . G#4 .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Electro',
    notes:
      'The cowbell’s syncopated pattern on one note in part A; in part B it plays a little melody on C sharp, F sharp and G sharp, as the bell is tuned by the keys.',
  },
  {
    sound: 'syndrum-zap',
    name: 'Syndrum: off-beats and fill',
    role: 'percussive',
    bpm: 118,
    len: 32,
    a: beats(
      '. . . .',
      'C3 . . .',
      '. . . .',
      'C3 . G3 .',
      '. . . .',
      'C3 . . .',
      '. . . .',
      'C3 G3 C4 G3'
    ),
    b: beats(
      'C4 . . .',
      'G3 . . .',
      'C4 . . .',
      'G3 . C3 .',
      'C4 . G3 .',
      'C3 . . .',
      'C4 C4 G3 G3',
      'C3 C3 G2 G2'
    ),
    chain: [0, 0, 0, 1],
    genre: 'Disco',
    notes:
      'The zap on the off-beats a disco drummer gave a syndrum, with a pickup at the end of part A; part B is the fill, high zaps falling to low ones.',
  },
  {
    sound: 'talking-tabla',
    name: 'Tabla: theka and variation',
    role: 'percussive',
    bpm: 92,
    len: 32,
    a: beats(
      'A2 . A2 E3',
      '. . A2 .',
      'C3 . . A2',
      'E3 . D3 .',
      'A2 . A2 E3',
      '. . A2 .',
      'C3 . A2 E3',
      'E3 . D3 .'
    ),
    b: beats(
      'A2 A2 E3 .',
      'C3 . D3 E3',
      '. A2 . A2',
      'E3 . D3 C3',
      'A2 . E3 E3',
      'D3 . C3 .',
      'A2 E3 A2 E3',
      'D3 . A2:2 .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Hindustani classical',
    notes:
      'A cycle of low bols and high strokes (part A), then a busier variation (part B) that ends on the low A. No drums: Match finds none for it, and the tabla is the drum.',
  },

  // ── Winds ─────────────────────────────────────────────────────────────────
  {
    sound: 'tenor-sax-lead',
    name: 'Tenor sax: head and bridge',
    role: 'lead_line',
    bpm: 92,
    len: 32,
    a: beats(
      'A3:3 . . C4',
      'D4:3 . . E4',
      'G4:2 . E4 D4',
      'E4:4 . . .',
      'D4 . C4 .',
      'A3:3 . . G3',
      'A3:2 . C4 .',
      'A3:4 . . .'
    ),
    b: beats(
      'E4:3 . . G4',
      'A4:3 . . C5',
      'B4 A4 G4 E4',
      'G4:4 . . .',
      'F4 . E4 .',
      'D4:3 . . E4',
      'C4 . B3 .',
      'A3:4 . . .'
    ),
    lanes: {
      a: { 'mod.depth': wave(0.4, 1.2, 32) },
      b: { 'mod.depth': wave(0.4, 2, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Jazz',
    fx: { reverb: reverb(0.5, 0.22) },
    notes:
      'An A minor head that climbs to E and comes home (part A), and a bridge that starts on E and reaches C5 before falling to A (part B). The MOD DEPTH lane widens the vibrato through each phrase, most in the bridge, and a club-sized room.',
  },
  {
    sound: 'open-trumpet-lead',
    name: 'Trumpet: fanfare and high answer',
    role: 'lead_line',
    bpm: 108,
    len: 32,
    a: beats(
      'G4:3 . . B4',
      'D5:4 . . .',
      'C5 . B4 .',
      'G4:4 . . .',
      'D5:2 . E5 .',
      'D5 . B4 .',
      'C5 . A4 .',
      'B4:4 . . .'
    ),
    b: beats(
      'G5:3 . . F#5',
      'E5:2 . D5 .',
      'E5 . C5 .',
      'D5:4 . . .',
      'B4 . C5 .',
      'D5 . E5 .',
      'F#5 . A5 .',
      'G5:4 . . .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Big band',
    fx: { reverb: reverb(0.55, 0.2) },
    notes:
      'A G major fanfare up the chord to D, ending open on B (part A); part B answers from high G and climbs back to it. A hall-sized reverb.',
  },
  {
    sound: 'hollow-clarinet-lead',
    name: 'Clarinet: melody and answer',
    role: 'lead_line',
    bpm: 96,
    len: 32,
    a: beats(
      'F3:3 . . G3',
      'Bb3:3 . . C4',
      'D4 C4 Bb3 .',
      'C4:4 . . .',
      'Bb3 . G3 .',
      'F3:3 . . D3',
      'F3 . G3 .',
      'F3:4 . . .'
    ),
    b: beats(
      'D4:3 . . Eb4',
      'F4:3 . . D4',
      'C4 Bb3 C4 .',
      'D4:4 . . .',
      'Eb4 . D4 .',
      'C4:3 . . Bb3',
      'A3 . C4 .',
      'Bb3:4 . . .'
    ),
    lanes: {
      a: { 'filter.cutoff': wave(-0.6, 0.4, 32) },
      b: { 'filter.cutoff': wave(-0.6, 1, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Jazz',
    fx: { reverb: reverb(0.45, 0.2) },
    notes:
      'A melody in the clarinet’s low register on F (part A), answered higher on B flat (part B). The cutoff lane brightens each phrase as a player blows harder, and a soft room.',
  },
  {
    sound: 'reedy-bassoon-solo',
    name: 'Bassoon: staccato theme and answer',
    role: 'lead_line',
    bpm: 80,
    len: 32,
    a: stacc(
      beats(
        'A2 . C3 .',
        'E3 . A3:2 .',
        'G3 . F3 .',
        'E3:4 . . .',
        'D3 . F3 .',
        'A3 . G3 F3',
        'E3 . C3 .',
        'A2:4 . . .'
      ),
      0.6
    ),
    b: stacc(
      beats(
        'C3 . E3 .',
        'G3 . C4:2 .',
        'B3 . A3 .',
        'G3:4 . . .',
        'F3 . E3 D3',
        'C3 . B2 .',
        'G#2 . B2 .',
        'A2:4 . . .'
      ),
      0.6
    ),
    chain: [0, 1],
    genre: 'Classical',
    fx: { reverb: reverb(0.5, 0.2) },
    notes:
      'A playful staccato theme in A minor (part A), and its answer in C that comes home through G sharp (part B). A concert-hall room; no drums, as Match plays none for classical.',
  },
  {
    sound: 'treble-recorder-line',
    name: 'Recorder: dance and second strain',
    role: 'lead_line',
    bpm: 104,
    len: 32,
    a: beats(
      'F5:2 . G5 A5',
      'C6:4 . . .',
      'A5 . G5 .',
      'F5:4 . . .',
      'D5:2 . F5 .',
      'E5:2 . G5 .',
      'F5 . E5 D5',
      'C5:4 . . .'
    ),
    b: beats(
      'A5:2 . Bb5 C6',
      'D6:4 . . .',
      'C6 . Bb5 A5',
      'G5:4 . . .',
      'F5:2 . G5 A5',
      'Bb5 . A5 G5',
      'F5 . E5 .',
      'F5:4 . . .'
    ),
    chain: [0, 1, 0, 1],
    genre: 'Baroque',
    fx: { reverb: reverb(0.5, 0.25) },
    notes:
      'A dance tune in F, the first strain ending open on C (part A), the second reaching D6 and closing on F (part B). A church-sized room.',
  },
  {
    sound: 'irish-tin-whistle',
    name: 'Tin whistle: a reel, two parts',
    role: 'lead_line',
    bpm: 110,
    len: 32,
    a: stacc(
      beats(
        'D5 B4 A4 G4',
        'E4 G4 D4 G4',
        'B4 G4 A4 B4',
        'D5 E5 D5 B4',
        'A4 B4 A4 G4',
        'E4 G4 B4 A4',
        'G4 B4 A4 F#4',
        'G4:2 . D4 .'
      ),
      0.8
    ),
    b: stacc(
      beats(
        'G5 F#5 G5 D5',
        'E5 D5 B4 D5',
        'G5 F#5 G5 A5',
        'B5 A5 G5 E5',
        'D5 E5 D5 B4',
        'A4 B4 D5 B4',
        'A4 G4 E4 F#4',
        'G4:2 . . .'
      ),
      0.8
    ),
    chain: [0, 0, 1, 1],
    genre: 'Irish traditional music',
    fx: { reverb: reverb(0.4, 0.2) },
    notes:
      'A reel in G, as tunes are played: the low part twice (A), then the high part twice (B), each ending on G. A pub-sized room; no drums, as Match plays none for Irish traditional music.',
  },

  // ── Brass, keys and strings ───────────────────────────────────────────────
  {
    sound: 'polka-tuba',
    name: 'Tuba: oom-pah and walk',
    role: 'bass_line',
    bpm: 120,
    stepSize: '1/8',
    len: 32,
    a: stacc(
      beats(
        'C2 . G1 .',
        'C2 . G1 .',
        'F1 . C2 .',
        'F1 . C2 .',
        'G1 . D2 .',
        'G1 . B1 .',
        'C2 . G1 .',
        'C2 . E2 .'
      ),
      0.6
    ),
    b: stacc(
      beats(
        'C2 . E2 .',
        'G2 . E2 .',
        'F2 . A1 .',
        'C2 . F2 .',
        'G1 . B1 .',
        'D2 . F2 .',
        'E2 . D2 .',
        'C2 . G1 .'
      ),
      0.6
    ),
    chain: [0, 1],
    genre: 'Polka',
    notes:
      'The oom of an oom-pah band on the beat, root and fifth through C, F and G (part A); part B walks up the chords instead. The drums’ off-beats are the pah.',
  },
  {
    sound: 'plunger-trombone',
    name: 'Plunger trombone: growl and answer',
    role: 'lead_line',
    bpm: 80,
    stepSize: '1/8',
    swing: 60,
    len: 32,
    a: beats(
      'F3:2 . G3 Bb3:5',
      '. . . .',
      'G3:2 . F3:6 .',
      '. . . .',
      'Ab3:2 . G3 F3:2',
      '. D3:2 . .',
      'F3:8 . . .',
      '. . . .'
    ),
    b: beats(
      'C4:2 . Bb3 C4:4',
      '. . . .',
      'Eb4:2 . D4 C4:4',
      '. . . .',
      'Bb3:2 . Ab3 G3:2',
      '. F3 Eb3 .',
      'F3:8 . . .',
      '. . . .'
    ),
    chain: [0, 1],
    genre: 'Big band',
    fx: { reverb: reverb(0.4, 0.2) },
    notes:
      'A swung blues phrase in F with the plunger’s wah on the long notes (part A), answered from C up to E flat (part B). Both end on a long F.',
  },
  {
    sound: 'fm-tine-piano',
    name: 'Tine piano: verse and bridge',
    role: 'lead_line',
    bpm: 80,
    len: 32,
    a: beats(
      'C4:2 . E4 .',
      'G4:2 . C5 .',
      'B4:2 . G4 .',
      'E4:4 . . .',
      'A3:2 . C4 .',
      'E4:2 . A4 .',
      'G4:2 . E4 .',
      'D4:4 . . .'
    ),
    b: beats(
      'F3:2 . A3 .',
      'C4:2 . F4 .',
      'E4:2 . C4 .',
      'A3:4 . . .',
      'G3:2 . B3 .',
      'D4:2 . G4 .',
      'F4 . E4 D4',
      'C4:4 . . .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Soft rock',
    fx: { chorus: { rate: 0.3, depth: 0.5 }, reverb: reverb(0.4, 0.2) },
    notes:
      'Broken chords on C major 7 and A minor (part A), then F and G back to C (part B). The chorus and a little room are the shimmer an electric piano is played through.',
  },
  {
    sound: 'calypso-steel-pan',
    name: 'Steel pan: tune and answer',
    role: 'lead_line',
    bpm: 120,
    len: 32,
    a: beats(
      'C5 . E5 .',
      'G5 . . E5',
      'F5 . D5 .',
      'C5:2 . . .',
      'E5 . G5 .',
      'C6 . . A5',
      'G5 . F5 E5',
      'D5 . C5 .'
    ),
    b: beats(
      'A5 . A5 G5',
      '. F5 . A5',
      'G5 . G5 F5',
      '. E5 . G5',
      'F5 . F5 E5',
      '. D5 . F5',
      'E5 . D5 .',
      'C5:2 . . .'
    ),
    chain: [0, 0, 1, 1],
    genre: 'Calypso',
    fx: { reverb: reverb(0.3, 0.15) },
    notes:
      'A bright tune in C (part A), and a syncopated answer stepping down from A to C (part B). Match plays it a Latin beat; a small open-air room.',
  },
  {
    sound: 'plink-plank-pizzicato',
    name: 'Pizzicato: tune and second phrase',
    role: 'lead_line',
    bpm: 120,
    len: 32,
    a: beats(
      'G4 . G4 .',
      'C5 . C5 .',
      'D5 . E5 .',
      'D5 . C5 .',
      'B4 . B4 .',
      'D5 . D5 .',
      'F5 . E5 .',
      'D5 . G4 .'
    ),
    b: beats(
      'E5 . E5 .',
      'G5 . G5 .',
      'F5 . E5 .',
      'D5 . C5 .',
      'A4 . B4 .',
      'C5 . D5 .',
      'E5 . D5 .',
      'C5 . . .'
    ),
    lanes: {
      a: { 'filter.contour': wave(3, 4.5, 32) },
      b: { 'filter.contour': wave(3, 5.5, 32) },
    },
    chain: [0, 0, 1, 1],
    genre: 'Light orchestral music',
    fx: { reverb: reverb(0.5, 0.2) },
    notes:
      'A light-music tune plucked in pairs, ending on the fifth (part A) and then home on C (part B). The AMOUNT OF CONTOUR lane makes each phrase’s plucks a little brighter and duller again, and an orchestra-sized room.',
  },
  {
    sound: 'solo-string-line',
    name: 'Solo strings: melody and rise',
    role: 'lead_line',
    bpm: 66,
    stepSize: '1/8',
    len: 32,
    a: beats(
      'G4:4 . . .',
      'Bb4:2 . C5:2 .',
      'D5:6 . . .',
      '. . C5 Bb4',
      'A4:4 . . .',
      'F4:2 . G4:2 .',
      'G4:8 . . .',
      '. . . .'
    ),
    b: beats(
      'Bb4:4 . . .',
      'C5:2 . D5:2 .',
      'Eb5:6 . . .',
      '. . D5 C5',
      'D5:4 . . .',
      'A4:2 . F#4:2 .',
      'G4:8 . . .',
      '. . . .'
    ),
    chain: [0, 1],
    genre: 'Film scores',
    fx: { chorus: { rate: 0.25, depth: 0.4 }, reverb: reverb(0.6, 0.3) },
    notes:
      'A slow G minor melody that rises to D and settles (part A), then rises higher to E flat and comes home through F sharp (part B). Chorus thickens the one voice towards a section, in a large hall; no drums.',
  },

  // ── Songs: a B variation beside the transcription ─────────────────────────
  {
    sound: 'stacked-night-bass',
    name: 'Thriller: synth bass, with a variation',
    role: 'bass_line',
    bpm: 120,
    len: 16,
    a: { from: 'researched:michael-jackson/thriller-bass' },
    b: beats('E2:2 . F#2:2 .', 'A2:2 . B2:2 .', 'F#2 . . F#1', '. . . F#2'),
    chain: [0, 0, 0, 1],
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, plays the same climbing figure a fourth up, from E to F sharp, once every four bars, so the ostinato moves.',
  },
  {
    sound: 'funk-bass',
    name: 'Flash Light: bass, with an octave answer',
    role: 'bass_line',
    bpm: 105,
    len: 32,
    a: { from: 'researched:parliament/flash-light-bass' },
    b: beats(
      'C3:2 . C2:2 .',
      'Bb2:2 . Bb1:2 .',
      'G2:2 . G1:2 .',
      'F#2:2 . F#1:2 .',
      'F1:2 . F2 .',
      'Eb2 . F2 .',
      '. F1 A1:2 .',
      'Bb1:2 . B1:2 .'
    ),
    chain: [0, 0, 0, 1],
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, answers each step of the descent with its octave and fills the held F, leading back with the same pickup.',
  },
  {
    sound: 'round-staccato-bass',
    name: 'Autobahn: octave pulse, with a change',
    role: 'bass_line',
    bpm: 120,
    len: 16,
    a: { from: 'researched:kraftwerk/autobahn-octave-pulse' },
    b: beats(
      'F2 F3:0.5 F3:0.5 F3:0.5',
      'F2 F3:0.5 F3:0.5 F2',
      'G3:0.5 G2 G3:0.5 G3:0.5',
      'G2 G3:0.5 G3:0.5 B2:0.5'
    ),
    chain: [0, 0, 1, 1],
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, moves the same octave pulse to F and G, with B leading back to C, so the drive changes chord.',
  },
  {
    sound: 'staccato-quack-bass',
    name: 'Chameleon: bass, with a fill',
    role: 'bass_line',
    bpm: 95,
    len: 32,
    a: { from: 'researched:herbie-hancock/chameleon-bass-high' },
    b: beats(
      'Bb2:2 . . Ab3',
      '. . Bb3 .',
      '. . C3:2 .',
      'C#3:2 . D3:2 .',
      'Eb3:2 . . Bb3',
      '. . C#4 .',
      'C4 Bb3 Ab3 G3',
      'F3:2 . A2:2 .'
    ),
    chain: [0, 0, 0, 1],
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, keeps the riff and replaces its last bar’s climb with a run down from C to F, as a bassist fills the turnaround.',
  },
  {
    sound: 'wavering-saw-lead',
    name: 'Are ‘Friends’ Electric?: riff, with an upper variation',
    role: 'arp',
    bpm: 90,
    stepSize: '1/8',
    len: 16,
    a: { from: 'researched:tubeway-army/are-friends-electric-riff' },
    b: beats('G3 D4 G4 F4', 'D3 A3 D4 C4', 'F3 C4 F4 E4', 'C3 G3 C4 D4'),
    chain: [0, 0, 0, 1],
    fx: { reverb: reverb(0.35, 0.15) },
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, climbs each broken chord to its octave instead of turning back, and leads home on D. A cold, small room.',
  },
  {
    sound: 'thin-plucked-keys',
    name: 'When Doves Cry: figure, with a turnaround',
    role: 'lead_line',
    bpm: 126,
    stepSize: '1/8',
    len: 16,
    a: { from: 'researched:prince/when-doves-cry-synth' },
    b: beats('A4 E4 G4 E4', 'A4 E4 G4 A4', 'B4 A4 G4 E4', '. D4 . E4'),
    chain: [0, 0, 0, 1],
    notes:
      'Part A is the transcription, note for note. Part B, written for the sound and not from the record, lets the figure climb to B on the fourth time round and turns back through D.',
  },
];
