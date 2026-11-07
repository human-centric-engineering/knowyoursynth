/**
 * Researched patterns (`f-pattern-library` t-127, t-128, t-159, t-129, t-160, t-161, t-162, t-163, t-164, t-165, t-166, t-167, t-168, t-169): the research batches under the seed's `data/patterns/`, and
 * the seed that puts them on their sounds.
 *
 * First the real batches, against the real catalogue and databank data: every pattern parses and plays, every sound a
 * batch names is in the catalogue and is looked at by one batch (one or more patterns, or a reason it has none), every
 * link resolves, the rights rule's length holds, and the parts named below play the notes their leads give. Then the sync, over the stateful catalogue fake seeded from Model D's real sounds:
 * a pattern goes behind the riff and never in front, a second run writes nothing, an empty batch writes nothing, and an
 * admin's pattern (edited, or made a default) is left alone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PresetSchema } from '@/lib/app/synths/validate';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import { compileLoop, seededRng, SLIDE_OVERLAP } from '@/lib/app/sequencer/compile';
import { MAX_STEPS, PatternSchema, stepsPerBeat, type Pattern } from '@/lib/app/sequencer/pattern';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { loadPatternData } from '@/prisma/seeds/app-knowyoursynth/pattern-data';
import { riffKey, syncRiffPatterns, type LibraryDb } from '@/lib/app/patterns/library';
import { firstLoop } from '@/lib/app/patterns/library-facts';
import {
  ResearchBatchSchema,
  syncResearchedPatterns,
  type ResearchBatch,
  type ResearchedPattern,
} from '@/lib/app/patterns/library-researched';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';

const catalogue = loadCatalogueData();
const bank = loadBankData();
const batches = loadPatternData();
const patterns = batches.flatMap((b) => b.patterns);

const sounds = new Map<string, ReturnType<typeof PresetSchema.parse>>(
  catalogue.sounds.flatMap((file) =>
    file.sounds.map((s) => {
      const preset = PresetSchema.parse(s);
      return [`${file.synth}/${preset.id}`, preset];
    })
  )
);

/** The beats a pattern's chain plays through once. */
const chainBeats = (p: Pattern) => p.chain.length * firstLoop(p).beats;

/**
 * The most notes sounding at once in a pattern: a note held over the next one counts, as it does on a synth’s voices.
 * A slide's overlap does not: it is how a mono synth glides into the next note, not a second voice. A slid note is
 * one that ends exactly SLIDE_OVERLAP steps past another note's start; only that note is forgiven, and only that much.
 */
const mostSounding = (p: Pattern) => {
  const { notes } = firstLoop(p);
  const overlap = SLIDE_OVERLAP / stepsPerBeat(p);
  const slid = (end: number) => notes.some(([at]) => Math.abs(at + overlap - end) < 1e-9);
  const ends = notes.map(([beat, , len]) => (slid(beat + len) ? beat + len - overlap : beat + len));
  return notes.reduce(
    (most, [at]) =>
      Math.max(
        most,
        notes.filter(([beat], i) => beat === at || (beat < at && at < ends[i] - 1e-9)).length
      ),
    0
  );
};

describe('the research batches', () => {
  it('has the pilot, with patterns and reasons, or every check below is vacuous', () => {
    expect(batches.map((b) => b.task)).toContain('t-127');
    expect(patterns.length).toBeGreaterThan(10);
    expect(batches.flatMap((b) => b.notRecreated).length).toBeGreaterThan(0);
  });

  it('names only sounds that are in the catalogue', () => {
    const named = [
      ...patterns.flatMap((p) => p.sounds),
      ...batches.flatMap((b) => b.notRecreated.map((n) => n.sound)),
    ];
    expect(named.filter((s) => !sounds.has(s))).toEqual([]);
  });

  /** Each batch's artists and how many of their sounds the catalogue held when it was researched. */
  const rosters: [string, string[], number][] = [
    ['t-127', ['Kraftwerk', 'Depeche Mode'], 52],
    ['t-128', ['Daft Punk', 'Jean-Michel Jarre', 'Tangerine Dream'], 89],
    ['t-129', ['Brian Eno', 'Daniel Lanois', 'Vangelis', 'Boards of Canada'], 88],
    [
      't-160',
      [
        'Bernie Worrell',
        'Herbie Hancock',
        'Prince',
        'Stevie Wonder',
        'Booker T. & the M.G.’s',
        'Zapp',
        'Funkadelic',
        'George Duke',
        'Parliament',
        'Ray Charles',
        '80s ballads',
        'Anita Ward',
        'Bob James',
        'Chuck Mangione',
        'Donny Hathaway',
        'Dr. Dre',
        'D’Angelo',
        'Earth, Wind & Fire',
        'G-funk',
        'George Clinton',
        'Hall & Oates',
        'Herb Alpert',
        'Isaac Hayes',
        'J Dilla',
        'Jimmy Smith',
        'Kaytranada',
        'Marvin Gaye',
        'Massive Attack',
        'Michael Jackson',
        'Public Enemy',
        'Whitney Houston',
      ],
      111,
    ],
    [
      't-161',
      [
        'Gary Numan',
        'Vince Clarke',
        'New Order',
        'Soft Cell',
        'Ultravox',
        'CHVRCHES',
        'Japan',
        'Marc Almond',
        'The Human League',
        'Yellow Magic Orchestra',
        'Early synth-pop',
        'Goldfrapp',
        'Joy Division',
        'Yazoo',
        'Björk',
        'Cabaret Voltaire / early Human League',
        'Crystal Castles',
        'Devo',
        'Grimes',
        'John Foxx',
        'Ladytron',
        'Mark Mothersbaugh',
        'Martin Hannett',
        'Metronomy',
        'OMD',
        'Orchestral Manoeuvres in the Dark',
        'SOPHIE',
        'The Cure',
        'Tubeway Army',
      ],
      80,
    ],
    [
      't-162',
      [
        'Duran Duran',
        'Talking Heads',
        'Eurythmics',
        'Van Halen',
        'Pet Shop Boys',
        'The Cars',
        'a-ha',
        'Howard Jones',
        'Phil Collins',
        'Tears for Fears',
        'Europe',
        'Cyndi Lauper',
        'Journey',
        'Thomas Dolby',
        'Alphaville',
        'Billie Eilish',
        'Dead or Alive',
        'Frankie Goes to Hollywood',
        'Genesis',
        'Greg Hawkes',
        'Haddaway',
        'New wave',
        'Roxy Music',
        'Simple Minds',
        'Spandau Ballet',
        'Split Enz',
        'Styx',
        'Toto',
        'Wham!',
        'Yello',
      ],
      92,
    ],
    [
      't-163',
      [
        'John Carpenter',
        'Jan Hammer',
        'Harold Faltermeyer',
        'Kavinsky',
        'Ben Burtt',
        'Hans Zimmer',
        // One duo under two spellings; the rename is housekeeping's, so both are looked at here.
        'Kyle Dixon & Michael Stein',
        'Kyle Dixon and Michael Stein',
        'M83',
        'The Weeknd',
        'Ennio Morricone',
        'Goblin',
        'S U R V I V E',
        'Angelo Badalamenti',
        'Buckner & Garcia',
        'Chromatics',
        'Cliff Martinez',
        'Com Truise',
        'Disasterpeace',
        'Gunship',
        'Hildur Guðnadóttir',
        'John Williams',
        'Jóhann Jóhannsson',
        'Kitaro',
        'Klaus Doldinger',
        'Koji Kondo',
        'Mica Levi',
        'Perturbator',
        'Ry Cooder',
        'Walter Murch',
        'Yann Tiersen',
      ],
      100,
    ],
    [
      't-164',
      [
        'Pink Floyd',
        'Rush',
        'Hawkwind',
        'Radiohead',
        'The Beatles',
        'The Who',
        'Keith Emerson',
        'Rick Wakeman',
        'Tame Impala',
        'King Crimson',
        'My Bloody Valentine',
        'Supertramp',
        'The Doors',
        '? and the Mysterians',
        'Black Sabbath',
        'Bruce Springsteen',
        'Cocteau Twins',
        'Dead Can Dance',
        'Dick Dale',
        'Edgar Winter',
        'Emerson, Lake & Palmer',
        'Gary Wright',
        'George Harrison',
        'Gong',
        'Jethro Tull',
        'Jimi Hendrix',
        'MGMT',
        'Manfred Mann',
        'Mike Oldfield',
        'Neutral Milk Hotel',
        'Richard Wright',
        'Robert Fripp',
        'Sigur Rós',
        // One band under two names; the rename is housekeeping's, so both are looked at here.
        'Small Faces',
        'The Beach Boys',
        'The Small Faces',
        'The Stranglers',
        'The Tornados',
        'The Zombies',
        'Thin Lizzy',
        'Thom Yorke',
        'U2',
      ],
      100,
    ],
    [
      't-165',
      [
        'Giorgio Moroder',
        'Nine Inch Nails',
        'Phuture',
        'Acid house',
        'Electro',
        'Josh Wink',
        'Afrika Bambaataa',
        'Derrick May',
        'Hardfloor',
        'Hot Butter',
        'Justice',
        'Kevin Saunderson',
        'Mr. Fingers',
        'Skinny Puppy',
        '808 State',
        'Armand Van Helden',
        'Armando',
        'Charanjit Singh',
        'DAF',
        'Drexciya',
        'Emmanuel Top',
        'Fatboy Slim',
        'Front 242',
        'Front 242 / Nitzer Ebb',
        // Credited alone as well as with Front 242.
        'Nitzer Ebb',
        'Jeff Mills',
        'Joey Beltram',
        'LFO',
        'Larry Heard',
        'Lil Louis',
        // One artist under two spellings; the rename is housekeeping's, so both are looked at here.
        'Mr Oizo',
        'Mr. Oizo',
        'Plastikman',
        'Robin S',
        'Second Phase',
      ],
      119,
    ],
    [
      't-166',
      [
        'Alabama 3',
        'Jon Hopkins',
        'Portishead',
        'Air',
        'Aphex Twin',
        'Orbital',
        'Röyksopp',
        'The Chemical Brothers',
        'Burial',
        'Tycho',
        'Underworld',
        'Zero 7',
        'deadmau5',
        'Autechre',
        'Avicii',
        'Bonobo',
        'Eric Prydz',
        'Moderat',
        'Paul van Dyk',
        'The Prodigy',
        '90s drum & bass',
        'Artful Dodger',
        'Bicep',
        'Darude',
        'Four Tet',
        'Gas',
        'Gigi D’Agostino',
        'Global Communication',
        'LTJ Bukem',
        'Mount Kimbie',
        'Skrillex',
        'Squarepusher',
        'The Future Sound of London',
        'Ulrich Schnauss',
        'Wiley',
      ],
      117,
    ],
    [
      't-167',
      [
        'Wendy Carlos',
        'BBC Radiophonic Workshop',
        'Isao Tomita',
        'Terry Riley',
        'Klaus Schulze',
        'Delia Derbyshire',
        'Kaitlyn Aurelia Smith',
        'Morton Subotnick',
        'Silver Apples',
        'Suicide',
        'Suzanne Ciani',
        'Cluster',
        'Laurie Spiegel',
        'Mort Garson',
        'Perrey and Kingsley',
        'Raymond Scott',
        'Steve Reich',
        'Sun Ra',
        'Caterina Barbieri',
        'Charles Cohen',
        'Clara Rockmore',
        'Cluster & Eno',
        'Daphne Oram',
        'Holger Czukay',
        'Laurie Anderson',
        'Louis and Bebe Barron',
        'Manuel Göttsching',
        'Neu!',
        'Nils Frahm',
        'Patrick Gleeson',
        'Pierre Schaeffer',
        'Popol Vuh',
        'Roger Payne',
      ],
      112,
    ],
    [
      't-168',
      [
        'Joe Zawinul',
        'Éliane Radigue',
        'La Monte Young',
        'Biosphere',
        'Enya',
        'Hiroshi Yoshimura',
        'Ryuichi Sakamoto',
        'Stars of the Lid',
        'Steve Roach',
        'Chick Corea',
        'Fripp & Eno',
        'György Ligeti',
        'Harold Budd',
        'Jean-Luc Ponty',
        'Lyle Mays',
        'Milt Jackson',
        'Olivier Messiaen',
        'Ólafur Arnalds',
        'Pauline Oliveros',
        'Tchaikovsky',
        'Tim Hecker',
        'William Basinski',
        'Abing',
        'Alice Coltrane',
        'Astor Piazzolla',
        'Augustus Pablo',
        'Bennie Maupin',
        'Camille Saint-Saëns',
        'Djivan Gasparyan',
        'Earl Scruggs',
        'Harold Budd and Brian Eno',
        'Huun-Huur-Tu',
        'Jaco Pastorius',
        'Johann Sebastian Bach',
        'John Coltrane',
        'Jon Hassell',
        'Kali Malone',
        'Kodo',
        'Leroy Anderson',
        'Little Walter',
        'Max Richter',
        'Midori Takada',
        'Miles Davis',
        'Nusrat Fateh Ali Khan',
        'Paul Chambers',
        'Pérotin',
        'Pyotr Ilyich Tchaikovsky',
        'Robert Fripp and Brian Eno',
        'Scottish pipe band tradition',
        'Shona mbira tradition',
        'Sunn O)))',
        'Wolfgang Amadeus Mozart',
        'Yo-Yo Ma',
        'Yoshida Brothers',
      ],
      123,
    ],
  ];

  it('has a roster for every batch, so none goes unchecked below', () => {
    expect(batches.map((b) => b.task).sort()).toEqual(rosters.map(([task]) => task).sort());
  });

  it('places each sound in one batch at most', () => {
    const named = batches.flatMap((b) => [
      ...new Set([...b.patterns.flatMap((p) => p.sounds), ...b.notRecreated.map((n) => n.sound)]),
    ]);
    expect(named.filter((s, i) => named.indexOf(s) !== i)).toEqual([]);
  });

  it.each(rosters)(
    '%s looks at every sound by %j exactly once: one or more patterns, or a reason it has none',
    (task, artists, count) => {
      const roster = [...sounds]
        .filter(([, s]) => artists.includes(s.artist))
        .map(([k]) => k)
        .sort();
      expect(roster.length).toBe(count);
      const batch = batches.find((b) => b.task === task);
      if (!batch) throw new Error(`No batch for ${task} under data/patterns/`);
      // A sound can have its work's hook and another part of it (t-159), so it can be on more than one pattern.
      const patterned = new Set(batch.patterns.flatMap((p) => p.sounds));
      const reasoned = batch.notRecreated.map((n) => n.sound);
      // No pattern lists a sound twice, and a reason beside a pattern would be stale.
      for (const p of batch.patterns) expect(new Set(p.sounds).size, p.key).toBe(p.sounds.length);
      expect(reasoned.filter((s) => patterned.has(s))).toEqual([]);
      expect([...patterned, ...reasoned].sort()).toEqual(roster);
    }
  );

  it('links Inspired by only to databank rows that exist', () => {
    const songs = new Map(bank.songs.map((s) => [s.id, s]));
    const artists = new Set(bank.artists.map((a) => a.id));
    for (const p of patterns) {
      const i = p.inspiredBy;
      if (i.kind === 'work') {
        expect(songs.has(i.songId), p.key).toBe(true);
        if (i.part !== undefined) expect(songs.get(i.songId)!.parts[i.part], p.key).toBeDefined();
      }
      if (i.kind === 'artist') expect(artists.has(i.artistId), p.key).toBe(true);
    }
  });

  it('keeps every pattern playable, within the sequencer and the rights rule’s 8 bars', () => {
    for (const p of patterns) {
      const pattern = PatternSchema.parse(p.pattern);
      const loop = compileLoop(pattern, { loop: 0, rng: seededRng(1) });
      expect(loop.notes.length, p.key).toBeGreaterThan(0);
      // No note runs past the loop it is in.
      for (const [beat, , len] of loop.notes)
        expect(beat + len, p.key).toBeLessThanOrEqual(loop.beats + 1e-9);
      expect(pattern.parts[0].steps.length, p.key).toBeLessThanOrEqual(MAX_STEPS);
      expect(chainBeats(pattern), p.key).toBeLessThanOrEqual(8 * 4);
      // A batch pattern goes on its sounds whole: the same every loop.
      expect(pattern.direction, p.key).toBe('forward');
    }
  });

  it('gives a mono line to every sound whose own riff plays no chords', () => {
    for (const p of patterns)
      for (const s of p.sounds) {
        const riff = sounds.get(s)!.phrase;
        const starts = new Map<number, number>();
        for (const [beat] of riff.steps) starts.set(beat, (starts.get(beat) ?? 0) + 1);
        if (Math.max(...starts.values()) === 1)
          expect(mostSounding(p.pattern), `${p.key} on ${s}`).toBe(1);
      }
  });

  it('never gives a sound more notes at once than its synth has voices', () => {
    // A sound's own patterns skip the voices filter, so only this stops a chord that loses a note to voice stealing.
    // A mono synth is left out: its own patterns may use chords its oscillators can stack.
    for (const p of patterns)
      for (const s of p.sounds) {
        const [synth] = s.split('/');
        const def = SYNTH_DEFS.find((d) => d.id === synth)!;
        const values = Object.assign(
          {},
          def.init,
          ...sounds.get(s)!.steps.map((st) => st.set ?? {})
        );
        const poly = def.toEngine(values, { wheel: 0, patched: {} }).poly;
        if (poly && !poly.mono)
          expect(mostSounding(p.pattern), `${p.key} on ${s}`).toBeLessThanOrEqual(poly.voices);
      }
  });

  it('records each pattern’s research: the work, the part, its leads and why its fidelity is what it is', () => {
    const ruling =
      'no free lead has this part, so the notes are written to the style and taken from no record (owner ruling, 2026-11-02)';
    // The tasks that added best guesses to a batch researched before the ruling, and the day each did.
    const addedLater: Record<string, string> = { 't-169': '2026-11-02' };
    for (const b of batches)
      for (const p of b.patterns) {
        // A pattern with no lead is a best guess (owner ruling, 2026-11-02), its record says so, and only it does.
        if (p.research.leads.length) expect(p.research.notes, p.key).not.toMatch(/best guess/);
        else {
          // Written after the ruling: in a batch researched since, or added later by a task that says when (t-169).
          // The task and day are checked against those that did, so a pattern cannot vouch for itself.
          const [, task, added] =
            /Written by (t-\d+) on (\d{4}-\d{2}-\d{2})\./.exec(p.research.notes) ?? [];
          if (task && b.researchedAt < '2026-11-02') expect(addedLater[task], p.key).toBe(added);
          expect((added ?? b.researchedAt) >= '2026-11-02', p.key).toBe(true);
          expect(p.research.notes, p.key).toContain(ruling);
        }
      }
    for (const p of patterns) {
      expect(p.research.listenedAt, p.key).toBeNull();
      // Leads are not sources (Order of trust), so nothing in the pilot can claim more than _In the style of_.
      expect(p.fidelity, p.key).toBe('in_the_style_of');
    }
  });

  it('plays the notes its leads give: the bass of “Just Can’t Get Enough”, as both leads have it', () => {
    const p = patterns.find((x) => x.key === 'researched:depeche-mode/just-cant-get-enough-bass')!;
    const pitches = compileLoop(PatternSchema.parse(p.pattern), {
      loop: 0,
      rng: seededRng(1),
    }).notes.map(([, n]) => n);
    // G G C B, G G C B, C C F E, C C C C: Songsterr track 6 and the BitMIDI file, bars 5–8, an octave up.
    expect(pitches).toEqual([43, 43, 48, 47, 43, 43, 48, 47, 48, 48, 53, 52, 48, 48, 48, 48]);
  });

  /** The pitches a batch pattern plays through its first loop. */
  const pitches = (key: string) =>
    compileLoop(PatternSchema.parse(patterns.find((x) => x.key === key)!.pattern), {
      loop: 0,
      rng: seededRng(1),
    }).notes.map(([, n]) => n);

  it('plays the notes its lead gives: the break figure of “Da Funk”, in both octaves the record has it', () => {
    // G G' D E♭ D E♭ F G' G: Songsterr “Synths 1”, bar 71, and “Synths 3”, bar 65, two octaves apart.
    const high = pitches('researched:daft-punk/da-funk-breakdown-figure');
    expect(high).toEqual([55, 67, 62, 63, 62, 63, 65, 67, 55]);
    expect(pitches('researched:daft-punk/da-funk-breakdown-figure-low')).toEqual(
      high.map((n) => n - 24)
    );
  });

  it('plays the notes its lead gives: the main riff of “Da Funk”, now the hook rule is dropped', () => {
    // G F G B♭ D, C D F B♭, A B♭ D G, A B♭: Songsterr “Main Synth Riff 1”, bars 1–4, ties merged.
    const high = pitches('researched:daft-punk/da-funk-riff');
    expect(high).toEqual([67, 65, 67, 70, 62, 60, 62, 65, 58, 57, 58, 62, 55, 57, 58]);
    expect(pitches('researched:daft-punk/da-funk-riff-low')).toEqual(high.map((n) => n - 24));
  });

  it('plays the notes its leads give: the End Titles theme of “Blade Runner”, as both leads have it', () => {
    // C B♭ A♭ G, B♭ A G F: Songsterr keys track 5 and the BitMIDI file's track 4, bars 13–20.
    expect(pitches('researched:vangelis/blade-runner-end-titles-theme')).toEqual([
      72, 70, 68, 67, 70, 69, 67, 65,
    ]);
  });

  it('plays the notes its lead gives: the bass of “Flash Light”', () => {
    // C C B♭ B♭ G G F♯ F♯, F … A B♭ B: Songsterr “Bernie Worrell” synth bass, bars 5–6.
    expect(pitches('researched:parliament/flash-light-bass')).toEqual([
      36, 36, 34, 34, 31, 31, 30, 30, 29, 29, 33, 34, 35,
    ]);
  });

  it('plays the notes its lead gives: the clavinet riff of “Superstition”, in both octaves', () => {
    // Songsterr clavinet (left hand), bars 6–7.
    const low = pitches('researched:stevie-wonder/superstition-clavinet');
    expect(low).toEqual([39, 51, 49, 51, 54, 49, 46, 44, 46, 49, 51, 54, 49, 49, 51]);
    expect(pitches('researched:stevie-wonder/superstition-clavinet-high')).toEqual(
      low.map((n) => n + 12)
    );
  });

  it('plays the notes its lead gives: the bass of “Blue Monday”, an octave up', () => {
    // F with two Fs an octave up, F again, then the same on C; D; G and C; D: Songsterr “Synthesised Bass”, bars 17–20.
    const octave = (lo: number) => [lo, lo + 12, lo + 12, lo, lo + 12, lo + 12];
    expect(pitches('researched:new-order/blue-monday-bass')).toEqual(
      [41, 36, 38, 38, 43, 36, 38, 38].flatMap(octave)
    );
  });

  it('plays t-161’s octave copies an octave from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:ultravox/vienna-strings-low')).toEqual(
      shifted('researched:ultravox/vienna-strings', -12)
    );
    expect(pitches('researched:gary-numan/cars-strings-line-low')).toEqual(
      shifted('researched:gary-numan/cars-strings-line', -12)
    );
    expect(pitches('researched:yazoo/only-you-arpeggio-high')).toEqual(
      shifted('researched:yazoo/only-you-arpeggio', 12)
    );
  });

  it('moves every -low and -high copy evenly from the pattern it copies, and nothing else', () => {
    // A -low or -high copy carries its pattern to a sound that plays lower or higher (t-191 added 34, each an octave or two).
    const byKey = new Map(patterns.map((p) => [p.key, p]));
    const baseOf = (key: string) => key.replace(/-(low|high)(-2)?$/, '');
    const copies = patterns.filter((p) => p.key !== baseOf(p.key) && byKey.has(baseOf(p.key)));
    expect(copies.length).toBeGreaterThan(50);
    const shape = (p: (typeof patterns)[number]) =>
      compileLoop(PatternSchema.parse(p.pattern), { loop: 0, rng: seededRng(1) }).notes.map(
        ([beat, , len, velocity]) => [beat, len, velocity]
      );
    for (const copy of copies) {
      const base = byKey.get(baseOf(copy.key))!;
      const by = pitches(copy.key)[0] - pitches(base.key)[0];
      expect(by, copy.key).not.toBe(0);
      expect(by < 0, copy.key).toBe(/-low(-2)?$/.test(copy.key));
      // An octave copy says so in its notes; the rest (the Numbers kick, a fifth down) are retuned on purpose.
      if (/This copy is moved/.test(copy.research.notes))
        expect([-24, -12, 12, 24], copy.key).toContain(by);
      expect(pitches(copy.key), copy.key).toEqual(pitches(base.key).map((n) => n + by));
      expect(shape(copy), copy.key).toEqual(shape(base));
      expect(copy.research.leads, copy.key).toEqual(base.research.leads);
    }
  });

  it('plays the notes its lead gives: the riff of “Take On Me”', () => {
    // F♯ F♯ D B B E E E G♯ G♯ A B, A A A E D F♯ F♯ F♯ E E F♯ E: Songsterr “Keyboard”, bars 13–16.
    expect(pitches('researched:a-ha/take-on-me-riff')).toEqual([
      78, 78, 74, 71, 71, 76, 76, 76, 80, 80, 81, 83, 81, 81, 81, 76, 74, 78, 78, 78, 76, 76, 78,
      76,
    ]);
  });

  it('plays the notes its lead gives: the riff of “Sweet Dreams (Are Made of This)”', () => {
    // C C C C E♭ E♭ C C, A♭ A♭ A♭ C G G G C: Songsterr “Bass Synth (Right)”, bars 1–2.
    expect(pitches('researched:eurythmics/sweet-dreams-riff')).toEqual([
      36, 36, 48, 60, 51, 63, 48, 60, 44, 44, 56, 60, 43, 43, 55, 60,
    ]);
  });

  it('plays t-162’s octave copies an octave from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:a-ha/take-on-me-riff-low')).toEqual(
      shifted('researched:a-ha/take-on-me-riff', -12)
    );
    expect(pitches('researched:eurythmics/sweet-dreams-riff-up')).toEqual(
      shifted('researched:eurythmics/sweet-dreams-riff', 12)
    );
    expect(pitches('researched:pet-shop-boys/west-end-girls-bass-low')).toEqual(
      shifted('researched:pet-shop-boys/west-end-girls-bass', -12)
    );
  });

  it('plays the notes its lead gives: the theme of “Axel F”', () => {
    // F A♭ F F B♭ F E♭, F C F F D♭ C A♭, F C F' F E♭ E♭ C G F: Songsterr “Synth Brass 1”, bars 1–4.
    expect(pitches('researched:harold-faltermeyer/axel-f-theme')).toEqual([
      65, 68, 65, 65, 70, 65, 63, 65, 72, 65, 65, 73, 72, 68, 65, 72, 77, 65, 63, 63, 60, 67, 65,
    ]);
  });

  it('plays the notes its lead gives: the arpeggio of “Stranger Things”, an octave up', () => {
    // C E G B C B G E, twice: Songsterr “Track 1”, bar 2.
    const once = [48, 52, 55, 59, 60, 59, 55, 52];
    expect(pitches('researched:kyle-dixon-michael-stein/stranger-things-arpeggio')).toEqual([
      ...once,
      ...once,
    ]);
  });

  it('plays t-163’s octave copies an octave from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:john-carpenter/escape-from-new-york-ostinato-low')).toEqual(
      shifted('researched:john-carpenter/escape-from-new-york-ostinato', -12)
    );
    expect(pitches('researched:goblin/suspiria-theme-low')).toEqual(
      shifted('researched:goblin/suspiria-theme', -12)
    );
  });

  it('plays the notes its lead gives: the sequence of “On the Run”, two octaves up', () => {
    // E G A G D C D E, twice: Songsterr “EMS Synthi AKS - Bassline”, bar 9.
    const once = [52, 55, 57, 55, 62, 60, 62, 64];
    expect(pitches('researched:pink-floyd/on-the-run-sequence')).toEqual([...once, ...once]);
  });

  it('plays the notes its lead gives: the growl of “Tom Sawyer”', () => {
    // E D A C, each held from the second beat: Songsterr “Oberheim OB-X”, bars 59–62.
    expect(pitches('researched:rush/tom-sawyer-growl')).toEqual([40, 38, 45, 36]);
  });

  it('plays t-164’s octave copies an octave from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:pink-floyd/on-the-run-sequence-high')).toEqual(
      shifted('researched:pink-floyd/on-the-run-sequence', 12)
    );
    expect(pitches('researched:pink-floyd/shine-on-solina-low')).toEqual(
      shifted('researched:pink-floyd/shine-on-solina', -12)
    );
    expect(pitches('researched:the-who/wont-get-fooled-again-organ-top-low')).toEqual(
      shifted('researched:the-who/wont-get-fooled-again-organ-top', -12)
    );
  });

  it('plays the notes its leads give: the bass of “I Feel Love”', () => {
    // Root, root, fifth, seventh on C, E♭, F and G: Songsterr “Synth Bass 1”, bars 41–44.
    const bar = (root: number) => [root, root, root + 7, root + 10];
    expect(pitches('researched:giorgio-moroder/i-feel-love-bass')).toEqual(
      [36, 39, 41, 43].flatMap((root) => [...bar(root), ...bar(root)])
    );
  });

  it('plays the notes its lead gives: the theme of “Popcorn”', () => {
    // B A B F♯ D F♯ B, twice: Songsterr “Track 1”, bars 1–2.
    const once = [71, 69, 71, 66, 62, 66, 59];
    expect(pitches('researched:hot-butter/popcorn-theme').slice(0, 14)).toEqual([...once, ...once]);
  });

  it('plays t-165’s octave copies one or two octaves from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:front-242/headhunter-bass-high')).toEqual(
      shifted('researched:front-242/headhunter-bass', 12)
    );
    expect(pitches('researched:giorgio-moroder/i-feel-love-roots-high')).toEqual(
      shifted('researched:giorgio-moroder/i-feel-love-roots', 24)
    );
    expect(pitches('researched:acid-house/acid-line-high')).toEqual(
      shifted('researched:acid-house/acid-line', 24)
    );
  });

  it('plays the notes its lead gives: the bass of “Sexy Boy”', () => {
    // D D' D D C' D', twice, then the same on C: Songsterr “basse (effet talker)”, bars 1–4.
    const bar = (root: number) => [root, 50, root, root, 48, 50];
    expect(pitches('researched:air/sexy-boy-bass')).toEqual([38, 38, 36, 36].flatMap(bar));
  });

  it('plays the notes its lead gives: the riff of “Levels”', () => {
    // F♯ E E E E E E, D♯ D♯ E E C♯ B G♯: Songsterr “Layer 1”, bars 73–74.
    expect(pitches('researched:avicii/levels-riff')).toEqual([
      66, 64, 64, 64, 64, 64, 64, 63, 63, 64, 64, 73, 71, 68,
    ]);
  });

  it('plays t-166’s octave copies one or two octaves from the part they copy', () => {
    const shifted = (key: string, by: number) => pitches(key).map((n) => n + by);
    expect(pitches('researched:alabama-3/woke-up-this-morning-bass-high')).toEqual(
      shifted('researched:alabama-3/woke-up-this-morning-bass', 12)
    );
    expect(pitches('researched:jon-hopkins/open-eye-signal-roots-high')).toEqual(
      shifted('researched:jon-hopkins/open-eye-signal-roots', 12)
    );
  });

  it('plays the notes its lead gives: the subject of Bach’s Invention in F, from the score', () => {
    // F A F C F, F E D C D C B♭ A B♭ A G, F A C A F C, then A C B♭ C three times: Mutopia edition, upper part, bars 1–4.
    expect(pitches('researched:wendy-carlos/invention-in-f-subject')).toEqual([
      65, 69, 65, 72, 65, 77, 76, 74, 72, 74, 72, 70, 69, 70, 69, 67, 65, 69, 72, 69, 77, 72, 81,
      84, 82, 84, 81, 84, 82, 84, 81, 84, 82, 84,
    ]);
  });

  it('plays the notes its lead gives: the riff of “Ghost Rider”, an octave up', () => {
    // C F E♭ on every beat: Songsterr “Bass”, bar 1.
    expect(pitches('researched:suicide/ghost-rider-riff')).toEqual([
      48, 53, 51, 48, 53, 51, 48, 53, 51, 48, 53, 51,
    ]);
  });

  it('plays t-167’s octave copy two octaves from the part it copies', () => {
    // The invention’s left hand is the subject an octave down, a bar later; the copy goes a second octave down so
    // all of it sits below the Solar’s split at F♯4, on the left plates its split sound plays the bass from.
    expect(pitches('researched:wendy-carlos/invention-in-f-answer')).toEqual(
      pitches('researched:wendy-carlos/invention-in-f-subject').map((n) => n - 24)
    );
  });

  it('plays the notes its lead gives: the riff of “Are ‘Friends’ Electric?”', () => {
    // G D F D D A C A, F C E C C G C B: Songsterr “Synth Lead”, bars 33–34.
    expect(pitches('researched:tubeway-army/are-friends-electric-riff')).toEqual([
      55, 62, 65, 62, 50, 57, 60, 57, 53, 60, 64, 60, 48, 55, 60, 59,
    ]);
  });

  it('plays the notes its lead gives: the intro of “Digital Love”, which t-159 left for a later batch', () => {
    // Songsterr “Lead Synths”, bars 9–16.
    expect(pitches('researched:daft-punk/digital-love-intro')).toEqual([
      81, 80, 81, 76, 73, 76, 69, 71, 69, 73, 69, 76, 69, 81, 57, 64, 69, 66, 76,
    ]);
  });

  it('plays the notes its lead gives: the theme of “Birdland”', () => {
    // D D D, C B A G B, D G A, B G G, D, D E B G B, D G G, B B♭: Songsterr “Tenor Saxophone”, bars 76–83.
    expect(pitches('researched:joe-zawinul/birdland-theme')).toEqual([
      74, 74, 74, 72, 71, 69, 67, 71, 74, 67, 69, 71, 67, 67, 74, 74, 76, 71, 67, 71, 74, 79, 67,
      71, 70,
    ]);
  });

  it('plays the notes its lead gives: the Prelude of Bach’s first cello suite, from the score', () => {
    // Each bar's figure twice, over G, C, D and G; the fourth bar ends on F♯: Mutopia edition, bars 1–4.
    const bar = (fig: number[]) => [...fig, ...fig];
    const fourth = bar([43, 55, 59, 57, 59, 55, 59, 55]);
    fourth[15] = 54;
    expect(pitches('researched:yo-yo-ma/cello-suite-1-prelude')).toEqual([
      ...bar([43, 50, 59, 57, 59, 50, 59, 50]),
      ...bar([43, 52, 60, 59, 60, 52, 60, 52]),
      ...bar([43, 54, 60, 59, 60, 54, 60, 54]),
      ...fourth,
    ]);
  });

  it('holds the keys that play “Black Market” on the upside-down keyboard, mirrored around middle C', () => {
    // D F D C B♭ G F B♭ G D, the climb back to a held D, A G F G, D: Songsterr “ARP 2600”, bars 7–10.
    // The sound plays key k at 120 − k.
    expect(
      pitches('researched:joe-zawinul/black-market-theme-inverted').map((k) => 120 - k)
    ).toEqual([
      74, 77, 74, 72, 70, 67, 65, 70, 67, 62, 65, 67, 62, 65, 67, 70, 72, 67, 70, 74, 72, 74, 81,
      79, 77, 79, 74,
    ]);
  });
});

describe('a batch file', () => {
  const one = (): ResearchedPattern => structuredClone(patterns[0]);
  const batch = (p: unknown): unknown => ({
    task: 't-1',
    researchedBy: 'a test',
    researchedAt: '2026-11-01',
    patterns: [p],
    notRecreated: [],
  });

  it('refuses a transcribed or reconstructed pattern that names no work or lists no sources', () => {
    const p = {
      ...one(),
      fidelity: 'reconstructed',
      inspiredBy: { kind: 'artist', artistId: 'kraftwerk' },
      sources: [],
    };
    const parsed = ResearchBatchSchema.safeParse(batch(p));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.at(-1))).toEqual(['inspiredBy', 'sources']);
  });

  it('refuses a tempo range that leaves out the pattern’s own tempo, and a key used twice', () => {
    const p = { ...one(), tempo: { min: 20, max: 30 } };
    expect(ResearchBatchSchema.safeParse(batch(p)).error?.issues[0].path.at(-1)).toBe('tempo');
    const twice = { ...(batch(one()) as object), patterns: [one(), one()] };
    expect(ResearchBatchSchema.safeParse(twice).error?.issues[0].message).toBe(
      'A key is used once'
    );
  });
});

describe('the loader', () => {
  it('names the file that does not parse as JSON, or does not fit the schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'patterns-'));
    writeFileSync(join(dir, 'a.json'), '{ not json');
    expect(() => loadPatternData(dir)).toThrow(/^patterns\/a\.json: /);
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ task: 'nope' }));
    expect(() => loadPatternData(dir)).toThrow(/^patterns\/a\.json: .*task/s);
  });

  it('refuses a key that another batch file already uses, naming both files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'patterns-'));
    const file = { ...batches[0], patterns: [batches[0].patterns[0]], notRecreated: [] };
    writeFileSync(join(dir, 'a.json'), JSON.stringify(file));
    expect(loadPatternData(dir)).toHaveLength(1);
    writeFileSync(join(dir, 'b.json'), JSON.stringify(file));
    expect(() => loadPatternData(dir)).toThrow(
      `patterns/b.json: ${file.patterns[0].key} is already used in patterns/a.json`
    );
  });
});

// ─── The sync ────────────────────────────────────────────────────────────────

let db: CatalogueTables;
const lib = () => db as unknown as LibraryDb;

/** Model D with its first three sounds, and the databank rows the test batch links to. */
function sample(): CatalogueSeedData {
  const data = structuredClone(catalogue);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = data.sounds
    .filter((f) => f.synth === 'model-d')
    .map((f) => ({ ...f, sounds: f.sounds.slice(0, 3) }));
  data.lineage = [];
  data.notes = [];
  return data;
}

const soundRow = (i: number) => db.synthSound.rows[i];
const ref = (i: number) => `model-d/${String(soundRow(i).slug)}`;
const listOf = (i: number) =>
  db.synthSoundPattern.rows
    .filter((l) => l.soundId === soundRow(i).id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((l) => l.patternId);
const riffOf = (i: number) =>
  db.libraryPattern.rows.find((p) => p.key === riffKey('model-d', String(soundRow(i).slug)))!;
const keyed = (key: string) => db.libraryPattern.rows.find((p) => p.key === key)!;
const writes = () =>
  [db.libraryPattern, db.synthSoundPattern, db.synthSound].reduce(
    (n, t) => n + t.create.mock.calls.length + t.update.mock.calls.length,
    0
  );
const clearWrites = () => {
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
  }
};

/** A batch of two real pilot patterns, put on the sample's sounds: one on sounds 0 and 1, one on sound 2. */
function testBatch(): ResearchBatch {
  const [a, b] = [
    'researched:kraftwerk/the-model-counter-line',
    'researched:depeche-mode/just-cant-get-enough-bass',
  ].map((k) => structuredClone(patterns.find((p) => p.key === k)!));
  return {
    task: 't-127',
    researchedBy: 'a test',
    researchedAt: '2026-11-01',
    patterns: [
      { ...a, sounds: [ref(0), ref(1)] },
      { ...b, sounds: [ref(2)] },
    ],
    notRecreated: [],
  };
}

beforeEach(async () => {
  db = catalogueTables();
  const prisma = { ...db, catalogueSeedRecord: seedRecordTable() };
  await seedCatalogue(prisma as unknown as TenancyClient, sample());
  db.bankArtist.rows.push({ id: 'kraftwerk', name: 'Kraftwerk' });
  db.bankSong.rows.push({
    id: 'depeche-mode-just-cant-get-enough',
    title: '"Just Can’t Get Enough"',
    parts: [{ id: 'part-1', order: 0 }],
  });
  await syncRiffPatterns(lib());
  clearWrites();
});

describe('syncResearchedPatterns', () => {
  it('puts each pattern on its sounds behind the riff, so every riff stays its sound’s default', async () => {
    const counts = await syncResearchedPatterns(lib(), [testBatch()]);

    expect(counts).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      edited: 0,
      placed: 3,
      skipped: [],
    });
    const model = keyed('researched:kraftwerk/the-model-counter-line');
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    expect(listOf(0)).toEqual([riffOf(0).id, model.id]);
    expect(listOf(1)).toEqual([riffOf(1).id, model.id]);
    expect(listOf(2)).toEqual([riffOf(2).id, jcge.id]);
    // Its riff is untouched, so the sound still plays it.
    expect(db.synthSound.update).not.toHaveBeenCalled();
  });

  it('stores the pattern as the batch has it, AI-generated, its label from the linked row', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    const planned = testBatch().patterns[1];
    expect(PatternSchema.parse(jcge.pattern)).toEqual(planned.pattern);
    expect(jcge).toMatchObject({
      name: planned.name,
      role: 'bass_line',
      fidelity: 'in_the_style_of',
      origin: 'ai_generated',
      inspiration: 'work',
      inspiredBy: '"Just Can’t Get Enough"',
      inspiredSongId: 'depeche-mode-just-cant-get-enough',
      inspiredPartId: null,
      bpmMin: null,
      bpmMax: null,
    });
    expect(keyed('researched:kraftwerk/the-model-counter-line')).toMatchObject({
      inspiration: 'artist',
      inspiredBy: 'Kraftwerk',
      inspiredArtistId: 'kraftwerk',
    });
  });

  it('records who made each pattern, its research record, and its rights risk from its fidelity (t-156)', async () => {
    const batch = testBatch();
    // One says it recreates the part, with a source: it needs review.
    Object.assign(batch.patterns[1], {
      fidelity: 'reconstructed',
      sources: [{ type: 'by_ear', citation: 'The single', checkedAt: '2026-11-01' }],
    });
    await syncResearchedPatterns(lib(), [batch]);
    const model = keyed('researched:kraftwerk/the-model-counter-line');
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    expect(model).toMatchObject({
      origin: 'ai_generated',
      madeBy: 'a test (t-127)',
      madeAt: new Date('2026-11-01T00:00:00.000Z'),
      research: { task: 't-127', ...batch.patterns[0].research },
      rightsRisk: 'none',
    });
    expect(jcge.rightsRisk).toBe('needs_review');
    // The seed never writes a status.
    expect(model.status).toBe('enabled');

    // An admin's rights risk (it has a reason) is kept through a changed batch; status is never touched.
    Object.assign(jcge, { rightsRisk: 'cleared', rightsReason: 'Checked', status: 'disabled' });
    batch.patterns[1].name = 'Renamed in the batch';
    expect(await syncResearchedPatterns(lib(), [batch])).toMatchObject({ updated: 1 });
    expect(jcge).toMatchObject({
      name: 'Renamed in the batch',
      rightsRisk: 'cleared',
      status: 'disabled',
    });
    // Without one, the risk follows the batch's fidelity.
    Object.assign(jcge, { rightsReason: null });
    expect(await syncResearchedPatterns(lib(), [batch])).toMatchObject({ updated: 1 });
    expect(jcge.rightsRisk).toBe('needs_review');
  });

  it('leaves alone a pattern an admin put first while it is disabled, as its notes are the default again once enabled', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    db.synthSoundPattern.rows.find((l) => l.patternId === jcge.id)!.order = -1;
    jcge.status = 'disabled';
    const kept = structuredClone(jcge);
    const changed = testBatch();
    changed.patterns[1].name = 'Renamed in the batch';
    clearWrites();
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ edited: 1, updated: 0 });
    expect(jcge).toEqual(kept);
  });

  it('protects a disabled pattern anywhere ahead of the default, and not an enabled one the sound cannot play', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    // Sound 2: its own riff, disabled, first; this one, disabled, second; nothing enabled ahead of them.
    riffOf(2).status = 'disabled';
    db.synthSoundPattern.rows.find((l) => l.patternId === riffOf(2).id)!.order = -2;
    db.synthSoundPattern.rows.find((l) => l.patternId === jcge.id)!.order = -1;
    jcge.status = 'disabled';
    const changed = testBatch();
    changed.patterns[1].name = 'Renamed in the batch';
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ edited: 1 });
    expect(jcge.name).not.toBe('Renamed in the batch');

    // Enabled but unplayable as a riff (two parts): never the default, so the batch's change lands.
    jcge.status = 'enabled';
    const two = PatternSchema.parse(jcge.pattern);
    two.parts.push(structuredClone(two.parts[0]));
    two.chain = [0, 1];
    jcge.pattern = two;
    changed.patterns[1].pattern = two;
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ updated: 1 });
    expect(jcge.name).toBe('Renamed in the batch');

    // Disabled as well: still never the default, so still the batch's.
    jcge.status = 'disabled';
    changed.patterns[1].name = 'Renamed again';
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ updated: 1 });
    expect(jcge.name).toBe('Renamed again');
  });

  it('writes nothing the second time, nor for an empty batch', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    clearWrites();
    expect(await syncResearchedPatterns(lib(), [testBatch()])).toEqual({
      created: 0,
      updated: 0,
      unchanged: 2,
      edited: 0,
      placed: 0,
      skipped: [],
    });
    expect(await syncResearchedPatterns(lib(), [])).toMatchObject({ created: 0, placed: 0 });
    expect(await syncResearchedPatterns(lib(), [{ ...testBatch(), patterns: [] }])).toMatchObject({
      created: 0,
    });
    expect(writes()).toBe(0);
  });

  it('follows a changed batch, and leaves alone a pattern an admin edited or made a default', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const model = keyed('researched:kraftwerk/the-model-counter-line');
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    // An admin edited one, and made the other sound 2's default.
    model.editedAt = new Date();
    model.name = 'An admin named it';
    const keptModel = structuredClone(model);
    const link = db.synthSoundPattern.rows.find((l) => l.patternId === jcge.id)!;
    link.order = -1;
    const keptJcge = structuredClone(jcge);
    const changed = testBatch();
    for (const p of changed.patterns) p.name = 'Renamed in the batch';
    clearWrites();

    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ edited: 2, updated: 0 });
    expect(model).toEqual(keptModel);
    expect(jcge).toEqual(keptJcge);
    expect(writes()).toBe(0);

    // Without the admin's hand, the batch's change lands.
    model.editedAt = null;
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ updated: 1, edited: 1 });
    expect(model.name).toBe('Renamed in the batch');
  });

  it('adds a newly named sound at the end of its list, and never moves or removes a place', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const before = structuredClone(db.synthSoundPattern.rows);
    const wider = testBatch();
    wider.patterns[1].sounds = [ref(2), ref(0)];
    // Taken out of the file: still in the library and on its sounds.
    wider.patterns.splice(0, 1);

    expect(await syncResearchedPatterns(lib(), [wider])).toMatchObject({ placed: 1 });
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    expect(db.synthSoundPattern.rows.slice(0, before.length)).toEqual(before);
    expect(listOf(0).at(-1)).toBe(jcge.id);
    expect(listOf(0)[0]).toBe(riffOf(0).id);
    expect(keyed('researched:kraftwerk/the-model-counter-line')).toBeDefined();
  });

  it('skips a pattern that names a sound or a song that is not there, and says why, writing nothing for it', async () => {
    const lost = testBatch();
    lost.patterns[0].sounds = [ref(0), 'model-d/no-such-sound'];
    lost.patterns[1].inspiredBy = { kind: 'work', songId: 'no-such-song' };

    const counts = await syncResearchedPatterns(lib(), [lost]);

    expect(counts).toMatchObject({ created: 0, placed: 0 });
    expect(counts.skipped).toEqual([
      {
        key: 'researched:kraftwerk/the-model-counter-line',
        reason: 'Names model-d/no-such-sound, not in the catalogue',
      },
      {
        key: 'researched:depeche-mode/just-cant-get-enough-bass',
        reason: 'Inspired by names the song no-such-song, which is not there',
      },
    ]);
    expect(writes()).toBe(0);
  });

  it('does not create a pattern none of whose sounds has its riff yet, so it is never on no sound', async () => {
    const batch = testBatch();
    db.synthSoundPattern.rows.length = 0;
    const counts = await syncResearchedPatterns(lib(), [batch]);
    expect(counts.skipped.map((s) => s.reason)).toEqual([
      'No sound it names has its riff pattern yet',
      'No sound it names has its riff pattern yet',
    ]);
    expect(writes()).toBe(0);
  });

  it('writes nothing on an empty catalogue, skipping every pattern', async () => {
    const batch = testBatch();
    db.synthSound.rows.length = 0;
    const counts = await syncResearchedPatterns(lib(), [batch]);
    expect(counts.skipped).toHaveLength(2);
    expect(writes()).toBe(0);
  });
});
