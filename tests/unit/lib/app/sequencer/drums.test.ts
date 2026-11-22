/**
 * Drum beats and which one suits a pattern (`f-step-sequencer` t-267).
 *
 * @see lib/app/sequencer/drums.ts
 */

import { describe, it, expect } from 'vitest';

import {
  DRUM_BEATS,
  DRUM_BEAT_IDS,
  beatGrid,
  drumBeat,
  drumStyleFor,
  styleWordsOf,
} from '@/lib/app/sequencer/drums';
import { BEAT_STEPS, DRUM_VOICES, playableBacking } from '@/lib/app/synths/audio/backing';

describe('the beats', () => {
  it('has one of each id, every line a bar of sixteen steps of hits the player can play', () => {
    expect(DRUM_BEATS.map((b) => b.id)).toEqual([...DRUM_BEAT_IDS]);
    for (const b of DRUM_BEATS) {
      for (const [voice, line] of Object.entries(b.lines)) {
        expect(DRUM_VOICES).toContain(voice);
        expect(line).toMatch(new RegExp(`^[xXo.]{${BEAT_STEPS}}$`));
      }
      expect(playableBacking({ click: false, drums: beatGrid(b, 50) })).toBe(true);
    }
  });

  it('turns a line into hits by step and voice, an accent loudest and a ghost note soft', () => {
    const grid = beatGrid(drumBeat('funk'), 50);
    const snare = DRUM_VOICES.indexOf('snare');
    const snares = grid.hits.filter(([, v]) => v === snare);
    expect(snares).toEqual([
      [4, snare, 1],
      [7, snare, 0.4],
      [9, snare, 0.4],
      [12, snare, 1],
    ]);
  });

  it('carries the pattern’s swing, held to 50–75', () => {
    expect(beatGrid(drumBeat('hiphop'), 62).swing).toBe(62);
    expect(beatGrid(drumBeat('hiphop'), 90).swing).toBe(75);
    expect(beatGrid(drumBeat('hiphop'), 10).swing).toBe(50);
  });

  it('plays four on the floor with a kick on every beat', () => {
    const kick = DRUM_VOICES.indexOf('kick');
    const kicks = beatGrid(drumBeat('four'), 50)
      .hits.filter(([, v]) => v === kick)
      .map(([s]) => s);
    expect(kicks).toEqual([0, 4, 8, 12]);
  });
});

describe('drumStyleFor', () => {
  it.each([
    ['House', 'four'],
    ['Acid house', 'four'],
    ['Electro house', 'four'],
    ['Trance', 'four'],
    ['deadmau5', 'four'],
    ['Techno', 'techno'],
    ['Industrial', 'techno'],
    ['Italo disco', 'disco'],
    ['Giorgio Moroder', 'disco'],
    ['Synth-pop', 'backbeat'],
    ['Synthwave', 'synthwave'],
    ['Outrun', 'synthwave'],
    ['Kavinsky', 'synthwave'],
    ['Krautrock', 'motorik'],
    ['Motorik', 'motorik'],
    ['UK garage', 'garage'],
    ['2-step', 'garage'],
    ['Garage rock', 'backbeat'],
    ['Bossa nova', 'bossa'],
    ['Latin jazz', 'bossa'],
    ['Calypso', 'bossa'],
    ['Jazz', 'jazz'],
    ['Big band', 'jazz'],
    ['Jazz-funk', 'funk'],
    ['Electro', 'electro'],
    ['808-style drums', 'electro'],
    ['Afrika Bambaataa', 'electro'],
    ['Lo-fi hip-hop', 'hiphop'],
    ['G-funk', 'hiphop'],
    ['Trap', 'trap'],
    ['70s funk', 'funk'],
    ['Synth-funk', 'funk'],
    ['Drum and bass', 'breakbeat'],
    ['Jungle', 'breakbeat'],
    ['Dub', 'onedrop'],
    ['Dub techno', 'techno'],
    ['Minimal techno', 'techno'],
    ['Minimal wave', 'backbeat'],
    ['King Tubby', 'onedrop'],
    ['Dubstep', 'halftime'],
    ['Burial', 'halftime'],
  ])('matches %s to %s by its style', (inspiredBy, beat) => {
    expect(drumStyleFor(inspiredBy, 120, 50)).toEqual({ beat, by: 'style' });
  });

  it.each([
    'Ambient',
    'Drone music',
    'Orchestral',
    'Film scores',
    'Steve Reich',
    'Sound effects',
    'Hindustani classical',
    'Irish traditional music',
  ])('gives %s no beat', (inspiredBy) => {
    expect(drumStyleFor(inspiredBy, 120, 50)).toEqual({ beat: null, by: 'style' });
  });

  it('does not hear Bach in Burt Bacharach', () => {
    expect(drumStyleFor('Burt Bacharach', 120, 50).beat).not.toBeNull();
    expect(drumStyleFor('J.S. Bach', 120, 50).beat).toBeNull();
  });

  it.each([
    [90, 62, 'hiphop'],
    [112, 62, 'funk'],
    [172, 50, 'breakbeat'],
    [140, 50, 'techno'],
    [124, 50, 'four'],
    [100, 50, 'backbeat'],
    [70, 50, 'halftime'],
  ])('falls back on the feel: %i BPM at %i%% swing is %s', (bpm, swing, beat) => {
    expect(drumStyleFor(null, bpm, swing)).toEqual({ beat, by: 'tempo' });
    // An Inspired by that names no style it knows is no help either.
    expect(drumStyleFor('Chiptune', bpm, swing)).toEqual({ beat, by: 'tempo' });
  });
});

describe('styleWordsOf', () => {
  it('reads a genre or an artist, not a work’s title nor a synth’s name', () => {
    expect(styleWordsOf({ kind: 'genre', label: 'Deep house' })).toBe('Deep house');
    expect(styleWordsOf({ kind: 'artist', label: 'King Tubby' })).toBe('King Tubby');
    expect(styleWordsOf({ kind: 'work', label: 'Pop Muzik' })).toBeNull();
    expect(styleWordsOf({ kind: 'synth', label: 'PPG Wave' })).toBeNull();
  });
});
