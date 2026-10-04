// Songs, albums and scores, and the synths played on them. One record per work; every synth's "Heard on" list and
// every artist page is read from here. Shape: see CONTRACT.md → Databank.
export default [
  { id: 'wendy-carlos-switched-on-bach', title: 'Switched-On Bach', kind: 'album', year: '1968', artists: ['wendy-carlos'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular', synths: ['model-d'], sounds: { 'model-d': 'baroque-line-voice', 'system-15': 's15-brass' },
        text: 'Every line played and overdubbed separately. The record that made "Moog" a household word.' },
    ] },
  { id: 'the-beatles-abbey-road-here-comes-the-sun-because', title: 'Abbey Road — "Here Comes the Sun", "Because"', kind: 'song', year: '1969', artists: ['the-beatles'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular', synths: ['model-d'], sounds: { 'model-d': 'ribbon-slide-lead' },
        text: 'George Harrison’s modular, used for ribbon-like lead lines and white-noise wind.' },
    ] },
  { id: 'emerson-lake-palmer-lucky-man', title: '"Lucky Man"', kind: 'song', year: '1970', artists: ['emerson-lake-palmer'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular', synths: ['model-d'], sounds: { 'model-d': 'lucky-lead' },
        text: 'Keith Emerson’s closing solo: a square-wave lead with heavy glide, improvised in one take.' },
    ] },
  { id: 'devo-late-70s-and-early-80s-records', title: 'Late-70s and early-80s records', kind: 'body', year: '1970s–80s', artists: ['devo'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'], sounds: { cat: 'devo-buzz-riff' },
        text: 'Devo are named among the best-known CAT users on the Vintage Synth Explorer and Cherry Audio lists, and Mark Mothersbaugh has been filmed playing one. No single Devo record credits it by name.' },
    ] },
  { id: 'sun-ra-my-brother-the-wind', title: 'My Brother the Wind', kind: 'album', year: '1970', artists: ['sun-ra'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog prototype (Model B)', synths: ['model-d'], sounds: { 'model-d': 'noise-torn-solo' },
        text: 'Moog lent Sun Ra a prototype before the Model D went on sale. He used it for noise, clusters and free solos.' },
    ] },
  { id: 'the-who-wont-get-fooled-again', title: '"Won’t Get Fooled Again"', kind: 'song', year: '1971', artists: ['the-who'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'Lowrey organ through an EMS VCS3', synths: ['ems-vcs3'], sounds: { 'ems-vcs3': 'vcs3-organ-chop' },
        text: 'Pete Townshend’s organ part was fed through a VCS3, whose filter and envelope turn it into the pulsing, rhythmic pattern the song opens with.' },
    ] },
  { id: 'tangerine-dream-alpha-centauri', title: 'Alpha Centauri', kind: 'album', year: '1971', artists: ['tangerine-dream'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'Two EMS VCS3s, one borrowed from WDR radio in Cologne, with organ', player: 'christopher-franke', sounds: { 'ems-vcs3': 'vcs3-bubbling' },
        text: 'The band’s first use of a synthesizer. Christopher Franke and a guest, Roland Paulyck, each played a VCS3 after learning it in a day and a half.' },
    ] },
  { id: 'tangerine-dream-phaedra', title: 'Phaedra', kind: 'album', year: '1974', artists: ['tangerine-dream'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular with its sequencer', player: 'christopher-franke', sounds: { 'system-55': 's55-berlin' },
        text: 'Christopher Franke’s Moog modular and its sequencer play the repeating bass patterns that the band shifted and filtered by hand, live in the studio: the start of the Berlin-school sequencer sound.' },
    ] },
  { id: 'edgar-winter-group-frankenstein', title: '"Frankenstein"', kind: 'song', year: '1972', artists: ['edgar-winter-group'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600', 'neutron'], sounds: { b2600: 'monster-sync-lead', neutron: 'random-steps' },
        text: 'Edgar Winter played the lead lines on an ARP 2600, with its keyboard hung from a strap so he could move around the stage.',
        notes: {
          'neutron': 'Winter hung the 2600’s keyboard round his neck and played filter sweeps and sample-and-hold runs as a lead instrument.',
        } },
    ] },
  { id: 'roxy-music-ladytron', title: '"Ladytron"', kind: 'song', year: '1972', artists: ['roxy-music'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'EMS VCS3', synths: ['ems-vcs3'], sounds: { 'ems-vcs3': 'vcs3-eno-treatment' },
        text: 'Brian Eno played a VCS3 in Roxy Music, using it to treat the band’s instruments and add electronic squeals and chatter.' },
    ] },
  { id: 'hawkwind-silver-machine', title: '"Silver Machine"', kind: 'song', year: '1972', artists: ['hawkwind'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'EMS VCS3', synths: ['ems-vcs3'], sounds: { 'ems-vcs3': 'vcs3-silver-swoop' },
        text: 'Hawkwind’s electronics players, Dik Mik and Del Dettmar, used VCS3s for the swooping, whooshing sounds that run through the band’s records of this period.' },
    ] },
  { id: 'roxy-music-virginia-plain', title: '"Virginia Plain"', kind: 'song', year: '1972', artists: ['roxy-music'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'EMS VCS3, with tape treatments', player: 'brian-eno', sounds: { 'ems-vcs3': 'vcs3-eno-treatment' },
        text: 'Brian Eno is credited with “VCS3 synthesizer, treatments”: the noises and effects that sit around the band.' },
    ] },
  { id: 'rick-wakeman-close-to-the-edge-the-six-wives-of-henry-viii', title: 'Close to the Edge, The Six Wives of Henry VIII', kind: 'album', year: '1972–73', artists: ['rick-wakeman', 'yes'], credit: 'Yes / Rick Wakeman',
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'fast-prog-lead' },
        text: 'Fast, bright sawtooth solos played against Hammond and Mellotron. Wakeman toured with several Minimoogs so he did not have to re-set one between songs.' },
    ] },
  { id: 'pink-floyd-any-colour-you-like', title: '"Any Colour You Like"', kind: 'song', year: '1973', album: 'The Dark Side of the Moon', artists: ['pink-floyd'],
    parts: [
      { instruments: ['ems-vcs3', 'ems-synthi-aks'], on: 'EMS VCS3 (the solo), with a Synthi AKS', player: 'richard-wright', sounds: { 'ems-vcs3': 'vcs3-filter-whistle' },
        text: 'Richard Wright’s VCS3 solo was fed through a long tape delay, which gives the rising and falling line before the guitar comes in.' },
    ] },
  { id: 'herbie-hancock-chameleon', title: '"Chameleon"', kind: 'song', year: '1973', artists: ['herbie-hancock'],
    parts: [
      { instruments: ['arp-odyssey'], on: 'ARP Odyssey', synths: ['neutron'], sounds: { neutron: 'jazz-funk-dry-bass' },
        text: 'The bass line: a synth doing the job of the bass guitar on a hit jazz-funk record.' },
    ] },
  { id: 'pink-floyd-on-the-run', title: '"On the Run"', kind: 'song', year: '1973', artists: ['pink-floyd'],
    parts: [
      { instruments: ['ems-synthi-aks'], on: 'EMS Synthi AKS', synths: ['ems-vcs3', 'neutron'], sounds: { 'ems-vcs3': 'vcs3-run-sequence', neutron: 'fast-filter-seq' },
        text: 'The racing eight-note line comes from the Synthi AKS’s sequencer, not a VCS3, though the voice is the same family.',
        notes: {
          'neutron': 'An eight-note sequence sped up, with the filter and noise worked by hand.',
        } },
    ] },
  { id: 'stevie-wonder-innervisions', title: 'Innervisions', kind: 'album', year: '1973', artists: ['stevie-wonder'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600'], sounds: { b2600: 'stevie-arp-funk-bass' },
        text: 'The sleeve credits Arp and Moog synthesizers together. Wonder was an early 2600 owner and had the panel of his own unit labelled in Braille.' },
    ] },
  { id: 'gong-a-sprinkling-of-clouds', title: '"A Sprinkling of Clouds"', kind: 'song', year: '1974', album: 'You', artists: ['gong'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'EMS synthesizer (the model is not credited), with a Moog', sounds: { 'ems-vcs3': 'vcs3-bubbling' },
        text: 'Tim Blake’s EMS synth builds a bed of delayed, bubbling tones for the first half of the track before the band joins in.' },
    ] },
  { id: 'kraftwerk-autobahn', title: '"Autobahn"', kind: 'song', year: '1974', artists: ['kraftwerk'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d', 'poly-d'], sounds: { 'model-d': 'round-staccato-bass', 'poly-d': 'pd-autobahn-bass' },
        text: 'The bass line that runs through the whole piece.',
        notes: {
          'poly-d': 'Not a Poly D record: the bass line was played on the Minimoog whose panel the Poly D copies.',
        } },
    ] },
  { id: 'stevie-wonder-boogie-on-reggae-woman', title: '"Boogie On Reggae Woman"', kind: 'song', year: '1974', artists: ['stevie-wonder'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular (the TONTO system)', synths: ['model-d'], sounds: { 'model-d': 'squelch-clav-bass' },
        text: 'A squelching, resonant bass played by hand, with the filter doing the talking.' },
    ] },
  { id: 'pink-floyd-shine-on-you-crazy-diamond', title: '"Shine On You Crazy Diamond"', kind: 'song', year: '1975', artists: ['pink-floyd'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'shine-lead' },
        text: 'Richard Wright’s horn-like lead over the opening pad.' },
      { instruments: ['ems-vcs3'], on: 'EMS VCS3, with an ARP Solina and a Minimoog', player: 'richard-wright',
        text: 'In the long opening section Richard Wright layers VCS3, Solina and Minimoog sounds over the drone. Sound On Sound names the VCS3 but not the passage it plays.' },
    ] },
  { id: 'pink-floyd-welcome-to-the-machine', title: '"Welcome to the Machine"', kind: 'song', year: '1975', artists: ['pink-floyd'],
    parts: [
      { instruments: ['ems-vcs3'], on: 'EMS VCS3', synths: ['ems-vcs3'], sounds: { 'ems-vcs3': 'vcs3-machine-throb' },
        text: 'The mechanical throb that opens the track is credited to a VCS3.' },
    ] },
  { id: 'manfred-manns-earth-band-blinded-by-the-light', title: '"Blinded by the Light"', kind: 'song', year: '1976', artists: ['manfred-manns-earth-band'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'singing-filter-lead' },
        text: 'Manfred Mann played his leads on a Minimoog: a singing, resonant line with vibrato brought in by hand on the long notes.' },
    ] },
  { id: 'weather-report-black-market-heavy-weather', title: 'Black Market, Heavy Weather', kind: 'album', year: '1976–77', artists: ['weather-report', 'joe-zawinul'], credit: 'Weather Report / Joe Zawinul',
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['neutron'], sounds: { neutron: 'upside-down-keys-lead' },
        text: 'Zawinul played two 2600s, one with its keyboard scaled upside down so that familiar fingerings gave unfamiliar lines.' },
    ] },
  { id: 'jean-michel-jarre-oxygene', title: 'Oxygène', kind: 'album', year: '1976', artists: ['jean-michel-jarre'],
    parts: [
      { instruments: ['arp-2600', 'ems-vcs3', 'ems-synthi-aks'], on: 'EMS VCS3 and Synthi AKS', synths: ['b2600', 'ems-vcs3'], sounds: { b2600: 'surf-and-wind', 'ems-vcs3': 'vcs3-oxygene-wind' },
        text: 'One of a handful of synths on the album, used alongside an EMS VCS3 and an organ for its washes of filtered noise and effects.',
        notes: {
          'ems-vcs3': 'Jarre used his EMS synthesizers for the wind, sea and sweeping effects on the album.',
        } },
    ] },
  { id: 'don-lewis-sessions-for-sergio-mendes-and-the-brothers-johnso', title: 'Sessions for Sérgio Mendes (Homecooking) and The Brothers Johnson (Look Out for #1)', kind: 'body', year: '1976', artists: ['don-lewis'],
    parts: [
      { instruments: ['oberheim-sem'], on: 'Oberheim SEM (four modules)', synths: ['2-xm'],
        text: 'Lewis played a home-built bank of four SEMs from a digital keyboard, one of the ways SEMs were used for polyphony before Oberheim’s own Four Voice. Each 2-XM module is one of these SEMs.' },
    ] },
  { id: 'parliament-flash-light', title: '"Flash Light"', kind: 'song', year: '1977', artists: ['parliament'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', player: 'bernie-worrell', synths: ['model-d', 'poly-d'], sounds: { 'model-d': 'funk-bass', 'poly-d': 'pd-funk-bass' },
        text: 'Bernie Worrell played the bass line on Minimoog rather than bass guitar, and funk bass changed with it.',
        notes: {
          'poly-d': 'Not a Poly D record: Bernie Worrell played the bass line on a Minimoog rather than a bass guitar.',
        } },
    ] },
  { id: 'david-bowie-heroes', title: '"Heroes"', kind: 'song', year: '1977', album: '“Heroes”', artists: ['david-bowie'],
    parts: [
      { instruments: ['ems-synthi-aks'], on: 'EMS Synthi AKS, also used to filter Robert Fripp’s guitar', player: 'brian-eno', synths: ['ems-vcs3'], sounds: { 'ems-vcs3': 'vcs3-eno-treatment' },
        text: 'Eno set an oscillator very slow and worked the noise filter by hand for the shuddering, chattering texture that builds through the song, and ran Fripp’s guitar feedback through the Synthi too.',
        notes: {
          'ems-vcs3': 'Brian Eno’s Synthi AKS, the VCS3 in a briefcase: an oscillator set very slow and the noise filter worked by hand give the chattering texture that builds through the song.',
        } },
    ] },
  { id: 'donna-summer-i-feel-love', title: '"I Feel Love"', kind: 'song', year: '1977', artists: ['donna-summer', 'giorgio-moroder'], credit: 'Donna Summer / Giorgio Moroder',
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular with sequencer', synths: ['model-d'], sounds: { 'model-d': 'seq-pulse', 'system-55': 's55-hi-nrg' },
        text: 'The pulsing sequencer bass that pointed the way to disco, Hi-NRG and techno.' },
    ] },
  { id: 'weather-report-heavy-weather-birdland', title: 'Heavy Weather — "Birdland"', kind: 'song', year: '1977', artists: ['weather-report'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600'], sounds: { b2600: 'jazz-funk-line' },
        text: 'Joe Zawinul’s ARP 2600 is one of the main voices on the album, played with a lot of hand-moved pitch bending.' },
    ] },
  { id: 'ben-burtt-star-wars-the-voice-of-r2-d2', title: 'Star Wars — the voice of R2-D2', kind: 'score', year: '1977', artists: ['ben-burtt'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600', 'neutron'], sounds: { b2600: 'droid-chatter', neutron: 'droid-chirps' },
        text: 'The sound designer built the robot’s chirps and whistles on an ARP 2600, blended with his own voice.',
        notes: {
          'neutron': 'Patched whistles and chirps mixed with Burtt’s own voice.',
        } },
    ] },
  { id: 'gary-numan-are-friends-electric-cars', title: '"Are ‘Friends’ Electric?", "Cars"', kind: 'song', year: '1979', artists: ['gary-numan'], credit: 'Tubeway Army / Gary Numan',
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d', 'poly-d'], sounds: { 'model-d': 'wavering-saw-lead', 'poly-d': 'pd-buzz-lead' },
        text: 'Numan found a Minimoog left in the studio and rebuilt his band’s sound around it: a buzzing lead and an open, droning bass.',
        notes: {
          'poly-d': 'Not a Poly D record: a buzzing Minimoog lead and a droning bass at the centre of the band’s sound.',
        } },
    ] },
  { id: 'the-cars-lets-go', title: '"Let’s Go"', kind: 'song', year: '1979', artists: ['the-cars'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Sequential Circuits Prophet-5', synths: ['pro-800', 'pro-1'], sounds: { 'pro-800': 'p8-sync-lead', 'pro-1': 'sync-lead' },
        text: 'Greg Hawkes played a Prophet-5 on Candy-O. The oscillator-sync lead of the kind heard on the band’s records is exactly what the PRO-800’s SYNC switch and Poly-Mod FIL ENV do.',
        notes: {
          'pro-1': 'Greg Hawkes’s hard-sync lead. The same sync switch is on this panel.',
        } },
    ] },
  { id: 'devo-duty-now-for-the-future', title: 'Duty Now for the Future', kind: 'album', year: '1979', artists: ['devo'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-buzz-bass' },
        text: 'A Wasp is listed in connection with the album, and Jerry Casale is named as a Wasp user.' },
    ] },
  { id: 'china-crisis-his-first-synthesizer', title: 'His first synthesizer', kind: 'body', year: 'Around 1979', artists: ['china-crisis'], credit: 'Gary Daly (China Crisis)',
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'],
        text: 'Daly has said his first synth was a CAT mono synth bought for £30, which he sold for £40 to buy a Moog Prodigy. That was before China Crisis made their first records, so the CAT is not on them.' },
    ] },
  { id: 'bbc-radiophonic-workshop-doctor-who-theme-1980', title: '"Doctor Who" theme (1980 arrangement)', kind: 'song', year: '1980', artists: ['bbc-radiophonic-workshop'],
    parts: [
      { instruments: ['roland-jupiter-4', 'arp-odyssey', 'yamaha-cs-80'], on: 'Roland Jupiter-4 (arpeggio and chords), ARP Odyssey (melody), Yamaha CS-80', player: 'peter-howell', sounds: { 'jupiter-4': 'j4-random-arp' },
        text: 'Peter Howell’s arrangement for the 1980 series: the Jupiter-4’s arpeggio leaps across octaves and its chords are doubled on a CS-80, while an ARP Odyssey plays the tune.' },
    ] },
  { id: 'depeche-mode-across-the-catalogue', title: 'Across the catalogue', kind: 'body', year: '1980s onwards', artists: ['depeche-mode'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600'], sounds: { b2600: 'dm-dirty-drive-bass' },
        text: 'The band have used a 2600 from the early records to the late ones; Martin Gore was photographed playing one during the Sounds of the Universe sessions.' },
    ] },
  { id: 'vince-clarke-erasure-and-depeche-mode-work', title: 'Erasure and Depeche Mode work', kind: 'body', year: '1980s', artists: ['vince-clarke'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'ms20-lead' },
        text: 'Clarke is a long-standing MS-20 owner and has used it for basses and effects across decades of records.' },
    ] },
  { id: 'martin-hannett-joy-division-closer-the-eternal', title: 'Joy Division — Closer, "The Eternal"', kind: 'album', year: '1980', artists: ['martin-hannett'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600'], sounds: { b2600: 'hannett-atmosphere' },
        text: 'Hannett owned a 2600 and its sequencer and used them on the second album. The synthesizers on Unknown Pleasures the year before were a Transcendent 2000 and an ARP Omni, not this one.' },
    ] },
  { id: 'john-foxx-metamatic', title: 'Metamatic', kind: 'album', year: '1980', artists: ['john-foxx'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-cold-machine' },
        text: 'A Wasp is listed among Foxx’s equipment for his first solo album, made after he left Ultravox.' },
    ] },
  { id: 'gary-numan-telekon', title: 'Telekon', kind: 'album', year: '1980', artists: ['gary-numan'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Prophet-5', synths: ['pro-1'], sounds: { 'pro-1': 'smooth-layer-line' },
        text: 'After two albums built on Moogs, Numan added a Prophet-5 for smoother, layered parts.' },
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4, alongside a Minimoog, a Polymoog and a Prophet-5',
        text: 'The album credits list a Jupiter-4 among the newer polysynths Numan added to his Moog-based sound on Telekon. Which tracks it plays on is not documented.' },
    ] },
  { id: 'split-enz-true-colours-i-got-you', title: 'True Colours — "I Got You"', kind: 'song', year: '1980', artists: ['split-enz'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'], sounds: { cat: 'enz-break-lead' },
        text: 'The CAT is the synth most often linked to the song’s keyboard break, played by Eddie Rayner. The band’s keyboards at the time also included a Prophet-5 and a Yamaha CS-80.' },
    ] },
  { id: 'vince-clarke-yazoo-and-erasure-records', title: 'Yazoo and Erasure records', kind: 'body', year: '1980s onwards', artists: ['vince-clarke'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['b2600'], sounds: { b2600: 'clarke-pop-square-lead' },
        text: 'The 2600 is the instrument Clarke is most associated with. He has owned several and has kept using them across four decades of records.' },
    ] },
  { id: 'phil-collins-in-the-air-tonight', title: '"In the Air Tonight"', kind: 'song', year: '1981', artists: ['phil-collins'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Sequential Circuits Prophet-5', synths: ['pro-800', 'pro-1'], sounds: { 'pro-800': 'p8-air-pad', 'pro-1': 'dark-swell-pad' },
        text: 'The dark, slow chords that open the song were played on a Prophet-5.',
        notes: {
          'pro-1': 'The dark, held chords under the drum machine.',
        } },
    ] },
  { id: 'genesis-abacab', title: 'Abacab', kind: 'album', year: '1981', artists: ['genesis'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-fifths-lead' },
        text: 'A Wasp is listed in the album’s equipment. Which track or part it plays is not recorded.' },
    ] },
  { id: 'john-carpenter-escape-from-new-york', title: 'Escape from New York (soundtrack)', kind: 'score', year: '1981', artists: ['john-carpenter'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Sequential Circuits Prophet-5', synths: ['pro-800', 'pro-1'], sounds: { 'pro-800': 'p8-carpenter-bass', 'pro-1': 'dark-eighths-bass' },
        text: 'Carpenter and Alan Howarth built the score on a Prophet-5: pulsing bass lines and slow, dark pads.',
        notes: {
          'pro-1': 'Pulsing eighth-note bass and simple lead lines, recorded quickly to picture.',
        } },
    ] },
  { id: 'jean-michel-jarre-les-chants-magnetiques', title: 'Les Chants Magnétiques (Magnetic Fields)', kind: 'album', year: '1981', artists: ['jean-michel-jarre'],
    parts: [
      { instruments: ['rsf-kobol'], on: 'RSF Kobol', synths: ['kobol'],
        text: 'The Kobol is listed among the album’s instruments, and the sleeve thanks RSF.' },
    ] },
  { id: 'depeche-mode-speak-spell', title: 'Speak & Spell', kind: 'album', year: '1981', artists: ['depeche-mode', 'daniel-miller'], credit: 'Depeche Mode / Daniel Miller',
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600', synths: ['neutron'], sounds: { neutron: 'zap-kick' },
        text: 'Producer Daniel Miller made the kick and snare sounds on a 2600 with a sequencer in place of a drum machine: a pitch-swept sine for the kick, filtered noise for the snare.' },
    ] },
  { id: 'japan-tin-drum-ghosts', title: 'Tin Drum — "Ghosts"', kind: 'song', year: '1981', artists: ['japan'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Prophet-5', synths: ['pro-1'], sounds: { 'pro-1': 'ghost-metal-tones' },
        text: 'Richard Barbieri used Oscillator B to modulate pitch and filter for atonal, metallic tones that barely sound like a keyboard.' },
    ] },
  { id: 'prince-1999', title: '"1999"', kind: 'song', year: '1982', artists: ['prince'],
    parts: [
      { instruments: ['oberheim-ob-xa'], on: 'Oberheim OB-Xa', synths: ['ub-xa-d'], sounds: { 'ub-xa-d': 'minneapolis-stab' },
        text: 'The OB-Xa is at the centre of the early-80s Minneapolis sound: short, bright synth stabs playing the parts a horn section would have played.' },
    ] },
  { id: 'duran-duran-hungry-like-the-wolf', title: '"Hungry Like the Wolf"', kind: 'song', year: '1982', artists: ['duran-duran'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'bubbling-arp' },
        text: 'The bubbling riff is the Jupiter-8’s arpeggiator, run with a sequencer and a TR-808 drum machine. The backing track was built in a day.' },
    ] },
  { id: 'thomas-dolby-one-of-our-submarines', title: '"One of Our Submarines"', kind: 'song', year: '1982', album: 'The Golden Age of Wireless', artists: ['thomas-dolby'],
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4, with a Micromoog bass', sounds: { 'jupiter-4': 'j4-rio-arp' },
        text: 'Dolby has said the shimmering arpeggio that runs through the song is the Jupiter-4. The bass is a Micromoog.' },
    ] },
  { id: 'duran-duran-rio', title: '"Rio"', kind: 'song', year: '1982', artists: ['duran-duran'],
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4', synths: ['deepmind-12d', 'jupiter-4'], sounds: { 'deepmind-12d': 'random-arp', 'jupiter-4': 'j4-rio-arp' },
        text: 'Nick Rhodes played a C major seventh chord into the Jupiter-4’s arpeggiator set to random, which gives the scattered synth line. The noise at the very start is a piano with metal rods thrown on its strings, played backwards.',
        notes: {
          'jupiter-4': 'Nick Rhodes used a Jupiter-4 on Duran Duran’s first records; the running arpeggio of “Rio” is often credited to its arpeggiator.',
        } },
    ] },
  { id: 'blancmange-sad-day', title: '"Sad Day"', kind: 'song', year: '1982', artists: ['blancmange'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-hollow-reed' },
        text: 'Used on the original version, released on the Some Bizarre Album. It was apparently not used on the later version on Happy Families.' },
    ] },
  { id: 'duran-duran-save-a-prayer', title: '"Save a Prayer"', kind: 'song', year: '1982', artists: ['duran-duran'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8', synths: ['jupiter-8'], sounds: { 'jupiter-8': 'jp8-prayer-arp' },
        text: 'Nick Rhodes’ Jupiter-8 plays the arpeggiated figure that opens the song.' },
    ] },
  { id: 'marvin-gaye-sexual-healing', title: '"Sexual Healing"', kind: 'song', year: '1982', album: 'Midnight Love', artists: ['marvin-gaye'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8, with a Roland TR-808 drum machine', sounds: { 'jupiter-8': 'jp8-glass-pad' },
        text: 'The held synth pad the whole track is built on is a Jupiter-8, over a TR-808 pattern. Gaye’s guitarist Gordon Banks has said those two machines were the only electronic instruments used.' },
    ] },
  { id: 'michael-jackson-thriller', title: '"Thriller"', kind: 'song', year: '1982', artists: ['michael-jackson'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'stacked-night-bass' },
        text: 'The bass line is two Minimoogs layered.' },
    ] },
  { id: 'tangerine-dream-white-eagle', title: '"White Eagle"', kind: 'song', year: '1982', artists: ['tangerine-dream'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Two Roland Jupiter-8s', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'white-eagle' },
        text: 'Johannes Schmoelling played the hypnotic line on the Jupiter-8’s arpeggiator rather than a sequencer, set to random instead of up or down. Two Jupiter-8s were synced together, panned apart and sent through a delay timed to the pattern.' },
    ] },
  { id: 'depeche-mode-a-broken-frame-studio-sessions', title: 'A Broken Frame studio sessions', kind: 'body', year: '1982', artists: ['depeche-mode', 'daniel-miller'], credit: 'Depeche Mode, with producer Daniel Miller',
    parts: [
      { instruments: ['rsf-kobol-expander'], on: 'RSF Kobol Expander', synths: ['kobol'],
        text: 'Miller told Electronics & Music Maker that the band used “an RSF expander module” in the studio alongside the PPG, and praised its voltage control of every setting and the speed of its envelopes. He did not name the tracks it was used on.' },
    ] },
  { id: 'jean-michel-jarre-les-concerts-en-chine', title: 'Les Concerts en Chine', kind: 'album', year: '1982', artists: ['jean-michel-jarre'], credit: 'Jean-Michel Jarre, with Frédérick Rousseau and Dominique Perrier',
    parts: [
      { instruments: ['rsf-kobol-expander'], on: 'RSF Kobol Expander', synths: ['kobol'], sounds: { kobol: 'kobol-sequencer' },
        text: 'For the 1981 concerts in China, Rousseau played sequences and bass lines on a rack of Kobol Expanders driven by an MDB Polysequencer.' },
    ] },
  { id: 'solid-space-space-museum', title: 'Space Museum', kind: 'album', year: '1982', artists: ['solid-space'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-random-bleeps' },
        text: 'A Wasp is listed in the album’s equipment. First released on cassette; the 2017 reissue brought it to a wider audience.' },
    ] },
  { id: 'charanjit-singh-synthesizing-ten-ragas-to-a-disco-beat', title: 'Synthesizing: Ten Ragas to a Disco Beat', kind: 'album', year: '1982', artists: ['charanjit-singh'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303'], sounds: { 'tb-303': 'tb-raga-line' },
        text: 'An Indian film musician’s album of ragas played on a TB-303, TR-808 and Jupiter-8. Rediscovered decades later for sounding like acid house five years early.' },
    ] },
  { id: 'yazoo-upstairs-at-erics-dont-go-only-you', title: 'Upstairs at Eric’s — "Don’t Go", "Only You"', kind: 'song', year: '1982', artists: ['yazoo', 'vince-clarke'], credit: 'Yazoo / Vince Clarke',
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Pro-One', synths: ['pro-1'], sounds: { 'pro-1': 'pop-riff' },
        text: 'Clarke built most of the album from a Pro-One and a sequencer: riffs, bass and much of the percussion, each sound recorded as its own track.' },
    ] },
  { id: 'new-order-blue-monday', title: '"Blue Monday"', kind: 'song', year: '1983', artists: ['new-order'],
    parts: [
      { instruments: ['moog-source'], on: 'Moog Source', synths: ['model-d'], sounds: { 'model-d': 'octave-seq-bass' },
        text: 'The octave-jumping sequenced bass.' },
    ] },
  { id: 'talking-heads-burning-down-the-house', title: '"Burning Down the House"', kind: 'song', year: '1983', artists: ['talking-heads'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Prophet-5', synths: ['pro-1'], sounds: { 'pro-1': 'swoop-answer-lead' },
        text: 'The swooping synth parts that answer the vocal.' },
    ] },
  { id: 'cyndi-lauper-girls-just-wanna-have-fun', title: '"Girls Just Wanna Have Fun"', kind: 'song', year: '1983', artists: ['cyndi-lauper'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'steel-pan' },
        text: 'The bouncing keyboard part and the solo that sounds like a steel drum are both a Juno-60. The solo is said to have been recorded in one take.' },
    ] },
  { id: 'frankie-goes-to-hollywood-relax', title: '"Relax"', kind: 'song', year: '1983', album: 'Welcome to the Pleasuredome', artists: ['frankie-goes-to-hollywood'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8 sequenced from a Roland MC-4, with a Fairlight CMI and a LinnDrum', player: 'andy-richards', sounds: { 'jupiter-8': 'jp8-poly-brass' },
        text: 'Session player Andy Richards’ Jupiter-8, driven by an MC-4 sequencer, plays chords and the sound effects, including the explosion near the end. Producer Trevor Horn described them as “Andy playing his JP8”.' },
    ] },
  { id: 'journey-separate-ways', title: '"Separate Ways (Worlds Apart)"', kind: 'song', year: '1983', artists: ['journey'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'arena-riff' },
        text: 'Jonathan Cain has said the opening synth riff is a Jupiter-8.' },
    ] },
  { id: 'eurythmics-sweet-dreams', title: '"Sweet Dreams (Are Made of This)"', kind: 'song', year: '1983', artists: ['eurythmics'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-dream-riff' },
        text: 'A Wasp is listed among the equipment used on the recording.' },
    ] },
  { id: 'cyndi-lauper-time-after-time', title: '"Time After Time"', kind: 'song', year: '1983', artists: ['cyndi-lauper'],
    parts: [
      { instruments: ['roland-juno-60', 'moog-memorymoog'], on: 'Roland Juno-60, doubled by a Moog Memorymoog', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'juno-ballad-pad' },
        text: 'Co-writer Rob Hyman built the song on a Juno-60 pad with its own stereo chorus switched on. He has said he still remembers the memory number, 61.' },
    ] },
  { id: 'howard-jones-what-is-love', title: '"What Is Love?"', kind: 'song', year: '1983', artists: ['howard-jones'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8', synths: ['jupiter-8'], sounds: { 'jupiter-8': 'jp8-pop-stab' },
        text: 'The Jupiter-8 was at the centre of Howard Jones’ one-man live and studio set-up for his first album.' },
    ] },
  { id: 'harold-faltermeyer-axel-f', title: '"Axel F"', kind: 'song', year: '1984', artists: ['harold-faltermeyer'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'staccato-saw-lead' },
        text: 'The theme from Beverly Hills Cop. The sawtooth lead is a Jupiter-8; the bass is a Moog modular and the drums a LinnDrum.' },
    ] },
  { id: 'van-halen-jump', title: '"Jump"', kind: 'song', year: '1984', artists: ['van-halen'],
    parts: [
      { instruments: ['oberheim-ob-xa'], on: 'Oberheim OB-Xa', synths: ['ub-xa-d'], sounds: { 'ub-xa-d': 'jump-brass' },
        text: 'Eddie Van Halen wrote the song on an OB-Xa, and its chord riff is the best-known Oberheim brass sound. The synth solo in the middle is the OB-Xa too.' },
    ] },
  { id: 'wham-last-christmas', title: '"Last Christmas"', kind: 'song', year: '1984', artists: ['wham'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'soft-chorus-keys' },
        text: 'George Michael played the synth parts himself on a Juno-60, with a bass guitar and sleigh bells alongside.' },
    ] },
  { id: 'queen-radio-ga-ga', title: '"Radio Ga Ga"', kind: 'song', year: '1984', album: 'The Works', artists: ['queen'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8 (arpeggio and pads), with a LinnDrum', sounds: { 'jupiter-8': 'jp8-prayer-arp' },
        text: 'The Jupiter-8’s arpeggiator runs through almost every section except the chorus, with sawtooth pads from the same synth on top.' },
    ] },
  { id: 'howard-jones-humans-lib', title: 'Human’s Lib', kind: 'album', year: '1984', artists: ['howard-jones'],
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Pro-One', synths: ['pro-1'], sounds: { 'pro-1': 'pwm-strings' },
        text: 'Part of the one-man live rig he played early in his career, used for bass lines and solo lines.' },
    ] },
  { id: 'larry-heard-mystery-of-love', title: '"Mystery of Love"', kind: 'song', year: '1985', artists: ['larry-heard'], credit: 'Mr. Fingers (Larry Heard)',
    parts: [
      { instruments: ['roland-jupiter-6'], on: 'Roland Jupiter-6 (bass line and chords), with a Roland TR-707', sounds: { 'jupiter-6': 'jp6-unison-bass' },
        text: 'The Jupiter-6 plays both the arpeggiated bass line and the wavering chords over a TR-707 beat: one of the first Chicago house records.' },
    ] },
  { id: 'a-ha-take-on-me', title: '"Take On Me"', kind: 'song', year: '1985', artists: ['a-ha'],
    parts: [
      { instruments: ['roland-juno-60', 'yamaha-dx7'], on: 'Roland Juno-60, layered with a Yamaha DX7', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'bouncy-pop-keys' },
        text: 'The riff is a Juno-60 layered with a DX7.' },
    ] },
  { id: 'george-michael-a-different-corner', title: '"A Different Corner"', kind: 'song', year: '1986', artists: ['george-michael'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'chorus-strings' },
        text: 'A slow ballad George Michael played almost entirely himself, with soft synth chords under the voice.' },
    ] },
  { id: 'larry-heard-can-you-feel-it', title: '"Can You Feel It"', kind: 'song', year: '1986', artists: ['larry-heard'], credit: 'Mr. Fingers (Larry Heard)',
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'deep-house-bass' },
        text: 'Bass and melody both come from a Juno-60, with a TR-909 for the drums. Larry Heard recorded it by bouncing between two cassette decks, days after buying the two machines. It is one of the founding records of deep house.' },
    ] },
  { id: 'the-cassandra-complex-hello-america', title: 'Hello America', kind: 'album', year: '1986', artists: ['the-cassandra-complex'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-repeat-pulse' },
        text: 'A Wasp is listed in connection with the album.' },
    ] },
  { id: 'phuture-acid-tracks', title: '"Acid Tracks"', kind: 'song', year: '1987', artists: ['phuture'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303', 'td-3'], sounds: { 'tb-303': 'tb-first-squelch', 'td-3': 'td-first-squelch' },
        text: 'DJ Pierre, Spanky and Herb J’s long track built on a TB-303 pattern whose filter and resonance are moved by hand throughout.',
        notes: {
          'td-3': 'The record that started acid house, made on an original TB-303.',
        } },
    ] },
  { id: 'enya-storms-in-africa', title: '"Storms in Africa"', kind: 'song', year: '1988', artists: ['enya'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'storms-arp' },
        text: 'From the album Watermark. The piece began as a melody Enya improvised on the Juno-60’s arpeggiator. She said in 1989 that the Juno was one of their favourites: they had meant to replace its parts with better sounds but could not find any.' },
    ] },
  { id: 'chemical-brothers-studio-work', title: 'Studio work', kind: 'body', year: '1990s onwards', artists: ['chemical-brothers'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'], sounds: { cat: 'big-beat-squelch' },
        text: 'Tom Rowlands has talked in interview about using a CAT in the studio. No single track is credited to it.' },
    ] },
  { id: 'human-resource-dominator', title: '"Dominator"', kind: 'song', year: '1991', artists: ['human-resource'],
    parts: [
      { instruments: ['roland-alpha-juno'], on: 'Roland Alpha Juno', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'rave-hoover' },
        text: 'Another early hit built on the same hoover sound, released the same year as "Mentasm".' },
    ] },
  { id: 'moby-go', title: '"Go" (Rainforest Mix)', kind: 'song', year: '1991', artists: ['moby'],
    parts: [
      { instruments: ['roland-jupiter-6'], on: 'Roland Jupiter-6', sounds: { 'jupiter-6': 'jp6-unison-bass' },
        text: 'The loud, distorted bass line is a Jupiter-6 that Moby bought second-hand from a New York shop, and later learned had been Joey Beltram’s.' },
    ] },
  { id: 'joey-beltram-mentasm', title: '"Mentasm"', kind: 'song', year: '1991', artists: ['joey-beltram'], credit: 'Second Phase (Joey Beltram and Mundo Muzique)',
    parts: [
      { instruments: ['roland-alpha-juno'], on: 'Roland Alpha Juno 2', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'rave-hoover' },
        text: 'The lead is the Alpha Juno 2 factory sound "What the…", sampled and edited further. The sound became known as the hoover and was copied across rave, jungle and hardcore.' },
    ] },
  { id: 'hardfloor-acperience-1', title: '"Acperience 1"', kind: 'song', year: '1992', artists: ['hardfloor'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303', 'td-3'], sounds: { 'tb-303': 'tb-slide-acid', 'td-3': 'td-rolling-sixteenths' },
        text: 'German acid techno built from several TB-303s at once, with long filter builds.',
        notes: {
          'td-3': 'Acid techno built from several 303 lines rolling at once.',
        } },
    ] },
  { id: 'aphex-twin-selected-ambient-works-85-92', title: 'Selected Ambient Works 85–92', kind: 'album', year: '1992', artists: ['aphex-twin'],
    parts: [
      { instruments: ['korg-ms-20', 'roland-sh-101'], on: 'Roland SH-101 and Korg MS-20, among other home-modified gear', synths: ['k2', 'neutron'], sounds: { k2: 'acid-scream', neutron: 'random-bleeps' },
        text: 'Richard D. James has named the MS-20 among the handful of cheap instruments the early records were made on, and its screaming resonant filter runs through them.',
        notes: {
          'neutron': 'Simple 3340-style mono lines, delay and a great deal of modulation.',
        } },
    ] },
  { id: 'dr-dre-the-chronic-nuthin-but-a-g-thang', title: 'The Chronic — "Nuthin’ but a ‘G’ Thang"', kind: 'song', year: '1992', artists: ['dr-dre'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'gfunk-whistle' },
        text: 'The high, gliding sine-like lead that became the signature of G-funk.' },
    ] },
  { id: 'emmanuel-top-acid-phase', title: '"Acid Phase"', kind: 'song', year: '1994', artists: ['emmanuel-top'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303'], sounds: { 'tb-303': 'tb-dotted-phase' },
        text: 'A long, hypnotic acid techno track built on a single repeating 303 line.' },
    ] },
  { id: 'orbital-i-wish-i-had-duck-feet', title: '"I Wish I Had Duck Feet"', kind: 'song', year: '1994', album: 'Snivilisation', artists: ['orbital'],
    parts: [
      { instruments: ['roland-jupiter-6'], on: 'A faulty Roland Jupiter-6', sounds: { 'jupiter-6': 'jp6-random-drone' },
        text: 'The bubbling sound that comes in before the vocals is a broken Jupiter-6. Paul Hartnoll has said it started making sounds it had never made before, and they recorded them.' },
    ] },
  { id: 'global-communication-76-14', title: '76:14', kind: 'album', year: '1994', artists: ['global-communication'],
    parts: [
      { instruments: ['roland-juno-106', 'roland-jupiter-6', 'yamaha-tx81z'], on: 'Roland Juno-106, with a Jupiter-6 and a Yamaha TX81Z', synths: ['deepmind-12d'], sounds: { 'deepmind-12d': 'quadraverb-pad' },
        text: 'An ambient album made in a spare bedroom in Somerset. Mark Pritchard has said the Juno-106 played bass and some of the pads, which they pitch-shifted with a Zoom unit, and that the signature reverb was an Alesis Quadraverb on a chorus-reverb setting: noisy and detuned.' },
    ] },
  { id: 'pulp-common-people-motiv8-remix', title: '"Common People" (Motiv8 remix)', kind: 'song', year: '1995', artists: ['pulp'], credit: 'Pulp, remixed by Steve Rodway (Motiv8)',
    parts: [
      { instruments: ['roland-jupiter-6'], on: 'Roland Jupiter-6 layered with an Oberheim Matrix-1000', sounds: { 'jupiter-6': 'jp6-vibrato-lead' },
        text: 'For the remix, not the album version, Steve Rodway added a lead hook with a little portamento, layering a Jupiter-6 with a Matrix-1000.' },
    ] },
  { id: 'daft-punk-da-funk', title: '"Da Funk"', kind: 'song', year: '1995', artists: ['daft-punk'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303', 'td-3'], sounds: { 'tb-303': 'tb-funk-stab', 'td-3': 'td-high-lead' },
        text: 'The main line is a TB-303 played through distortion, in a slow, funky groove rather than an acid squelch.',
        notes: {
          'td-3': 'A TB-303 played through distortion, the job the TD-3’s built-in distortion does.',
        } },
    ] },
  { id: 'josh-wink-higher-state-of-consciousness', title: '"Higher State of Consciousness"', kind: 'song', year: '1995', artists: ['josh-wink'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303', 'td-3'], sounds: { 'tb-303': 'tb-rising-acid', 'td-3': 'td-distorted-acid' },
        text: 'A 303 line that builds for most of the track, its resonance and cutoff pushed until it screams.',
        notes: {
          'td-3': 'A screaming, heavily driven 303 line that builds for most of the track.',
        } },
    ] },
  { id: 'daft-punk-homework', title: 'Homework', kind: 'album', year: '1997', artists: ['daft-punk'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'rubber-funk' },
        text: 'The duo have listed the MS-20 among the second-hand analogue gear the first album was built on, at a time when the instrument was still cheap.' },
    ] },
  { id: 'boards-of-canada-music-has-the-right-to-children', title: 'Music Has the Right to Children', kind: 'album', year: '1998', artists: ['boards-of-canada'],
    parts: [
      { instruments: ['roland-sh-101'], on: 'Roland SH-101 among others', synths: ['neutron'], sounds: { neutron: 'para-keys' },
        text: 'Detuned, slowly wavering leads made to sound like worn tape.' },
    ] },
  { id: 'mr-oizo-flat-beat', title: '"Flat Beat"', kind: 'song', year: '1999', artists: ['mr-oizo'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2', 'neutron'], sounds: { k2: 'oizo-flat-bass', neutron: 'rubber-drive-bass' },
        text: 'The lead line that carried the record is probably the best-known MS-20 part ever put on tape.',
        notes: {
          'neutron': 'A distorted, rubbery bass line made on one small semi-modular.',
        } },
    ] },
  { id: 'radiohead-everything-in-its-right-place', title: '"Everything In Its Right Place"', kind: 'song', year: '2000', artists: ['radiohead'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Prophet-5', synths: ['pro-1'], sounds: { 'pro-1': 'rounded-ep-keys' },
        text: 'The soft electric-piano-like chords that open Kid A.' },
    ] },
  { id: 'j-dilla-welcome-2-detroit-and-later-productions', title: 'Welcome 2 Detroit and later productions', kind: 'body', year: '2001–06', artists: ['j-dilla'],
    parts: [
      { instruments: ['moog-minimoog-voyager'], on: 'Minimoog Voyager', synths: ['model-d'], sounds: { 'model-d': 'sliding-round-sub' },
        text: 'Round, sliding sub bass played by hand. His custom Voyager is now in the Smithsonian.' },
    ] },
  { id: 'goldfrapp-black-cherry-supernature', title: 'Black Cherry, Supernature', kind: 'album', year: '2003–05', artists: ['goldfrapp'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['neutron'], sounds: { neutron: 'sync-buzz-glam-bass' },
        text: 'Will Gregory’s buzzing glam bass and lead sounds.' },
    ] },
  { id: 'the-prodigy-girls', title: '"Girls"', kind: 'song', year: '2004', artists: ['the-prodigy'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'prodigy-fuzz-bass' },
        text: 'Damian Taylor, who worked on the album, has said most of the synth lines on the track are the MS-20 put through a lot of distortion and fuzz.' },
    ] },
  { id: 'mark-mothersbaugh-the-life-aquatic-with-steve-zissou', title: 'The Life Aquatic with Steve Zissou (score)', kind: 'score', year: '2004', artists: ['mark-mothersbaugh'],
    parts: [
      { instruments: ['oberheim-two-voice'], on: 'Oberheim Two Voice', synths: ['2-xm'], sounds: { '2-xm': 'aquatic-bubbles' },
        text: 'Mothersbaugh used his Two Voice for the score’s electronic sounds and cues.' },
    ] },
  { id: 'editors-camera', title: '"Camera"', kind: 'song', year: '2005', album: 'The Back Room', artists: ['editors'],
    parts: [
      { instruments: ['oberheim-ob-xa'], on: 'Oberheim OB-Xa', sounds: { 'ub-xa-d': 'sync-drone' },
        text: 'Producer Jim Abbiss stripped the song back to a four-to-the-floor beat and built it up again from an OB-Xa drone. The OB-Xa and a Korg Mono/Poly were the only keyboards on the album.' },
    ] },
  { id: 'chemical-brothers-the-big-jump', title: '"The Big Jump"', kind: 'song', year: '2005', artists: ['chemical-brothers'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'chem-squiggle-line' },
        text: 'The squiggling synth lines that run through the track come from the MS-20, usually with effects on top.' },
    ] },
  { id: 'squarepusher-hello-everything-bubble-life', title: 'Hello Everything — "Bubble Life"', kind: 'song', year: '2006', artists: ['squarepusher'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'], sounds: { cat: 'bubble-life-kit' },
        text: 'Tom Jenkinson has said the drum track of "Bubble Life" was built layer by layer from CAT sounds played by hand on its keyboard, and that apart from a Roland SH-101 it was the only vintage synth he owned. The CAT is on the left of the album cover.' },
    ] },
  { id: 'metronomy-nights-out-holiday-heartbreaker', title: 'Nights Out — "Holiday", "Heartbreaker"', kind: 'song', year: '2008', artists: ['metronomy'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-pop-wobble' },
        text: 'Joe Mount is documented using a Wasp on the album and its singles, and one can be seen in the "Holiday" video.' },
    ] },
  { id: 'portishead-third', title: 'Third', kind: 'album', year: '2008', artists: ['portishead'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'noise-wind' },
        text: 'The band’s return leaned on old analogue monosynths for its harsher textures, the MS-20 among them.' },
    ] },
  { id: 'ty-segall-seen-playing-one', title: 'Seen playing one', kind: 'body', year: '2010s', artists: ['ty-segall'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'],
        text: 'Segall is seen playing a CAT in a short clip made for Adult Swim’s Squidbillies. Which records it is on is not known.' },
    ] },
  { id: 'bonobo-studio', title: 'Studio', kind: 'body', year: '2010s', artists: ['bonobo'],
    parts: [
      { instruments: ['octave-cat'], on: 'Octave CAT', synths: ['cat'],
        text: 'A CAT can be seen in a photo of Simon Green’s studio that he posted online. Which records it is on is not known.' },
    ] },
  { id: 'barrow-salisbury-drokk-music-inspired-by-mega-city-one', title: 'Drokk: Music Inspired by Mega-City One', kind: 'album', year: '2012', artists: ['barrow-salisbury'],
    parts: [
      { instruments: ['oberheim-two-voice'], on: 'Oberheim Two Voice', synths: ['2-xm'], sounds: { '2-xm': 'drokk-drone' },
        text: 'Made largely on three original Two Voice units, for music first meant for the film Dredd.' },
    ] },
  { id: 'orbital-wonky', title: 'Wonky', kind: 'album', year: '2012', artists: ['orbital'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-rave-stab' },
        text: 'A Wasp is documented on the album, and Paul Hartnoll has demonstrated one in his studio.' },
    ] },
  { id: 'jon-hopkins-open-eye-signal', title: '"Open Eye Signal"', kind: 'song', year: '2013', artists: ['jon-hopkins'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'hopkins-driving-bass' },
        text: 'Hopkins has said every synth sound in the track is the MS-20, which is unusual — most records use it for one part.' },
    ] },
  { id: 'thom-yorke-atoms-for-peace-amok', title: 'Atoms for Peace — AMOK', kind: 'album', year: '2013', artists: ['thom-yorke'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20', synths: ['k2'], sounds: { k2: 'yorke-amok-lead' },
        text: 'The MS-20 runs through the album, including the title track. Yorke has used one in his own work for years, though it is not documented on Radiohead’s own records.' },
    ] },
  { id: 'alessandro-cortini-forse', title: 'Forse 1–3', kind: 'album', year: '2013', artists: ['alessandro-cortini'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel, nothing else', sounds: { 'buchla-easel': 'easel-breathing-drone' },
        text: 'The whole Forse series was played on one Music Easel, which Cortini had spent several years looking for.' },
    ] },
  { id: 'the-flaming-lips-the-terror', title: 'The Terror', kind: 'album', year: '2013', artists: ['the-flaming-lips'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-feedback-lead' },
        text: 'A Wasp is listed in the album’s equipment.' },
    ] },
  { id: 'chelsea-wolfe-abyss', title: 'Abyss', kind: 'album', year: '2015', artists: ['chelsea-wolfe'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-hold-drone' },
        text: 'A Wasp can be seen in studio material from the album and is listed for it.' },
    ] },
  { id: 'charles-cohen-brother-i-prove-you-wrong', title: 'Brother I Prove You Wrong', kind: 'album', year: '2015', artists: ['charles-cohen'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel, nothing else', sounds: { 'buchla-easel': 'easel-chance-melody' },
        text: 'Improvised pieces made entirely on Cohen’s 1970s Music Easel, recorded in Berlin in 2014: quick, scattered tones and patterns.' },
    ] },
  { id: 'kaitlyn-aurelia-smith-euclid', title: 'Euclid', kind: 'album', year: '2015', artists: ['kaitlyn-aurelia-smith'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel', synths: ['buchla-easel'], sounds: { 'buchla-easel': 'easel-arp-plucks' },
        text: 'Smith built the rippling, sequenced patterns of her early albums on a Music Easel.' },
    ] },
  { id: 'barrow-salisbury-ex-machina', title: 'Ex Machina (score)', kind: 'score', year: '2015', artists: ['barrow-salisbury'], credit: 'Ben Salisbury and Geoff Barrow',
    parts: [
      { instruments: ['oberheim-two-voice'], on: 'Oberheim Two Voice', synths: ['2-xm'],
        text: 'Between them the composers owned three or four Two Voice units, which Salisbury says made many of the score’s heavy, noise-driven sounds.' },
    ] },
  { id: 'kyle-dixon-michael-stein-stranger-things-theme', title: '"Stranger Things" theme', kind: 'song', year: '2016', artists: ['kyle-dixon-michael-stein'],
    parts: [
      { instruments: ['oberheim-two-voice', 'roland-jupiter-8', 'sequential-pro-one', 'roland-sh-2'], on: 'Roland Jupiter-8 (the lead), with an Oberheim, a Sequential Pro-One and a Roland SH-2', synths: ['2-xm', 'deepmind-12d'], sounds: { '2-xm': 'duo-counterpoint', 'deepmind-12d': 'haunting-lead' },
        text: 'The theme’s arpeggio is played on an Oberheim Two Voice, by hand rather than by a sequencer.',
        notes: {
          'deepmind-12d': 'The theme to the Netflix series is built from many synthesizers. The slow, haunting lead is a Jupiter-8 that the two composers fitted with MIDI themselves. The arpeggio was played by hand on an Oberheim, the heartbeat pulses on a Pro-One and the bass on an SH-2.',
        } },
    ] },
  { id: 'bon-iver-22-a-million', title: '22, A Million', kind: 'album', year: '2016', artists: ['bon-iver'],
    parts: [
      { instruments: ['sequential-prophet-600'], on: 'Sequential Circuits Prophet-600, layered with bass guitar through effects pedals', sounds: { 'pro-800': 'p8-unison-bass' },
        text: 'The album’s bass sounds were made by layering a Prophet-600 with bass guitar through a chain of effects pedals.' },
    ] },
  { id: 'kaitlyn-aurelia-smith-ears', title: 'EARS', kind: 'album', year: '2016', artists: ['kaitlyn-aurelia-smith'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel, with woodwind and Smith’s voice', sounds: { 'buchla-easel': 'easel-spring-pad' },
        text: 'Smith wrote the album on the Easel, then arranged woodwind parts and added her voice. The Easel plays most of what you hear.' },
    ] },
  { id: 'lcd-soundsystem-how-do-you-sleep', title: '"how do you sleep?"', kind: 'song', year: '2017', album: 'American Dream', artists: ['lcd-soundsystem'],
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4', sounds: { 'jupiter-4': 'j4-random-arp' },
        text: 'The Jupiter-4 plays the arpeggios that run across the song’s nine minutes.' },
    ] },
  { id: 'barrow-salisbury-annihilation-the-alien', title: 'Annihilation (score), “The Alien”', kind: 'score', year: '2018', artists: ['barrow-salisbury'], credit: 'Ben Salisbury and Geoff Barrow',
    parts: [
      { instruments: ['oberheim-two-voice'], on: 'Oberheim Two Voice', synths: ['2-xm'],
        text: 'Salisbury has said the four-note synth theme heard in the film’s trailer was played on a Two Voice and then processed.' },
    ] },
  { id: 'todd-barton-multum-in-parvo', title: 'Multum in Parvo', kind: 'album', year: '2018', artists: ['todd-barton'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel with an Epoch Modular Benjolin',
        text: 'A 50-minute improvisation on the Easel and a Benjolin, recorded in one take with no edits.' },
    ] },
  { id: 'chris-carter-small-moon', title: 'Small Moon', kind: 'album', year: '2018', artists: ['chris-carter'],
    parts: [
      { instruments: ['edp-wasp'], on: 'EDP Wasp', synths: ['wasp-deluxe'], sounds: { 'wasp-deluxe': 'wasp-ramp-sequence' },
        text: 'The album’s liner notes name an EDP Wasp.' },
    ] },
  { id: 'sharon-van-etten-jupiter-4', title: '"Jupiter 4"', kind: 'song', year: '2019', album: 'Remind Me Tomorrow', artists: ['sharon-van-etten'],
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4', sounds: { 'jupiter-4': 'j4-pwm-pad' },
        text: 'The song is named after the synth that plays its dark drone and slow pulses. Van Etten demoed most of the album on a Jupiter-4.' },
    ] },
  { id: 'rina-sawayama-sawayama', title: 'SAWAYAMA', kind: 'album', year: '2020', artists: ['rina-sawayama'],
    parts: [
      { instruments: ['behringer-poly-d'], on: 'Poly D', synths: ['poly-d'],
        text: 'The Poly D is listed as used on the album. Which tracks and sounds it plays is not documented.' },
    ] },
  { id: 'rina-sawayama-brit-awards-rising-star-session-abbey-road', title: 'BRIT Awards Rising Star session, Abbey Road', kind: 'performance', year: '2021', artists: ['rina-sawayama'],
    parts: [
      { instruments: ['behringer-poly-d'], on: 'Poly D', synths: ['poly-d'],
        text: 'Her keyboard player used a Poly D for the live session.' },
    ] },
  { id: 'kartell-everything-is-here', title: 'Everything Is Here', kind: 'album', year: '2024', artists: ['kartell'],
    parts: [
      { instruments: ['behringer-poly-d'], on: 'Poly D', synths: ['poly-d'],
        text: 'Kartell told MusicRadar the Poly D was one of the first hardware synths he bought while making the album, that it is the piece of gear he uses most, and that he uses it for basses and leads.' },
    ] },
  { id: 'electric-callboy-fckboi', title: '"Fckboi" (music video)', kind: 'song', artists: ['electric-callboy'],
    parts: [
      { instruments: ['behringer-poly-d'], on: 'Poly D', synths: ['poly-d'],
        text: 'Kevin Ratajczak plays a Poly D in the video. Whether it is on the recording itself is not documented.' },
    ] },
  { id: 'perrey-kingsley-kaleidoscopic-vibrations', title: 'Kaleidoscopic Vibrations', kind: 'album', year: '1967', artists: ['perrey-kingsley'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, with Ondioline and tape effects',
        text: 'The duo’s second album added the Moog to their tape loops and Ondioline, a year before Switched-On Bach. It was reissued in 1971 as Spotlight on the Moog.' },
    ] },
  { id: 'morton-subotnick-silver-apples-of-the-moon', title: 'Silver Apples of the Moon', kind: 'album', year: '1967', artists: ['morton-subotnick'],
    parts: [
      { instruments: ['buchla-100'], on: 'Buchla 100 series modular', synths: ['buchla-easel'],
        text: 'Made entirely on the Buchla in Subotnick’s New York studio, as a piece in two halves for the two sides of an LP. The second half is driven by sequenced rhythms.',
        notes: {
          'buchla-easel': 'Not an Easel record: it was made on the Buchla 100 series modular, the system the Easel’s circuits grew out of.',
        } },
    ] },
  { id: 'the-doors-strange-days', title: '"Strange Days"', kind: 'song', year: '1967', album: 'Strange Days', artists: ['the-doors'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, set up by Paul Beaver',
        text: 'Jim Morrison’s vocal was fed through the Moog so that it could be played from the keyboard, giving the voice its wavering, processed sound. One of the earliest uses of the Moog on a rock record.' },
    ] },
  { id: 'the-monkees-daily-nightly', title: '"Daily Nightly"', kind: 'song', year: '1967', album: 'Pisces, Aquarius, Capricorn & Jones Ltd.', artists: ['the-monkees'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, programmed by Paul Beaver',
        text: 'Micky Dolenz plays the swooping, whistling fills on his own Moog, one of the first three sold.' },
    ] },
  { id: 'beaver-krause-the-nonesuch-guide-to-electronic-music', title: 'The Nonesuch Guide to Electronic Music', kind: 'album', year: '1968', artists: ['beaver-krause'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog III modular',
        text: 'A double album that goes through the Moog’s oscillators, filters, envelopes and noise one at a time, with a short piece, “Peace Three”, to close.' },
    ] },
  { id: 'popol-vuh-affenstunde', title: 'Affenstunde', kind: 'album', year: '1970', artists: ['popol-vuh'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog III modular',
        text: 'Florian Fricke’s Moog plays long held tones and slowly wandering lines over hand percussion: one of the first German records built around a synthesizer.' },
    ] },
  { id: 'emerson-lake-palmer-tarkus', title: 'Tarkus', kind: 'album', year: '1971', artists: ['emerson-lake-palmer'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, over Hammond organ and piano', player: 'keith-emerson', synths: ['model-d'], sounds: { 'model-d': 'growl-filter-lead' },
        text: 'Keith Emerson overdubbed Moog parts on the title suite; “Aquatarkus” has a long Moog solo.' },
    ] },
  { id: 'tonto-expanding-head-band-zero-time', title: 'Zero Time', kind: 'album', year: '1971', artists: ['tonto-expanding-head-band'],
    parts: [
      { instruments: ['moog-modular'], on: 'TONTO, built around a Moog III modular',
        text: 'Every sound on the album comes from Cecil and Margouleff’s expanded Moog system. Stevie Wonder heard it and asked to work with them.' },
    ] },
  { id: 'wendy-carlos-a-clockwork-orange', title: 'A Clockwork Orange', kind: 'score', year: '1971', artists: ['wendy-carlos'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, with a vocoder built by Robert Moog',
        text: 'Carlos’s Moog versions of Beethoven and Purcell and her own “Timesteps”. The sung parts of the Ninth Symphony and of “Timesteps” were put through the vocoder.' },
    ] },
  { id: 'wendy-carlos-sonic-seasonings', title: 'Sonic Seasonings', kind: 'album', year: '1972', artists: ['wendy-carlos'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular, with field recordings', synths: ['model-d'], sounds: { 'model-d': 'night-crickets' },
        text: 'Four long pieces, one for each season, that mix slow Moog sounds with recordings of wind, rain, birds and insects. An early example of what was later called ambient music.' },
    ] },
  { id: 'stevie-wonder-superstition', title: '"Superstition"', kind: 'song', year: '1972', album: 'Talking Book', artists: ['stevie-wonder'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog synthesizer (the TONTO system), under a Hohner Clavinet riff',
        text: 'Wonder is credited with Moog bass; Malcolm Cecil and Robert Margouleff programmed the sound on TONTO. The riff on top is a Clavinet, not a synth.' },
    ] },
  { id: 'jan-hammer-birds-of-fire', title: 'Birds of Fire', kind: 'album', year: '1973', artists: ['jan-hammer'], credit: 'Mahavishnu Orchestra / Jan Hammer',
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'],
        text: 'Hammer took up the Minimoog for the band’s second album. On “One Word” he takes the third solo after John McLaughlin’s guitar and Jerry Goodman’s violin, bending notes with the pitch wheel as a guitarist would.' },
    ] },
  { id: 'herbie-hancock-sextant', title: 'Sextant', kind: 'album', year: '1973', artists: ['herbie-hancock', 'patrick-gleeson'], credit: 'Herbie Hancock',
    parts: [
      { instruments: ['arp-2600', 'arp-pro-soloist'], on: 'ARP 2600 and ARP Pro Soloist, with a Moog', player: 'patrick-gleeson', synths: ['b2600'], sounds: { b2600: 'gleeson-space-lead' },
        text: 'Patrick Gleeson and Hancock are both credited on the 2600 and the Pro Soloist, and Hancock on a Moog as well. Gleeson had joined the band as Hancock’s synthesizer technician.' },
    ] },
  { id: 'genesis-the-cinema-show', title: '"The Cinema Show"', kind: 'song', year: '1973', album: 'Selling England by the Pound', artists: ['genesis'],
    parts: [
      { instruments: ['arp-pro-soloist'], on: 'ARP Pro Soloist',
        text: 'Tony Banks’s long solo in the second half, switching between the Pro Soloist’s preset sounds as it goes. He used the instrument on Genesis records from this album to 1977.' },
    ] },
  { id: 'isao-tomita-snowflakes-are-dancing', title: 'Snowflakes Are Dancing', kind: 'album', year: '1974', artists: ['isao-tomita'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog III modular, with a Mellotron', synths: ['model-d'], sounds: { 'model-d': 'thin-high-strings' },
        text: 'Debussy’s piano pieces, including “Clair de Lune” and “Arabesque No. 1”, arranged and overdubbed voice by voice on the Moog. It was nominated for four Grammy Awards.' },
    ] },
  { id: 'tangerine-dream-rubycon', title: 'Rubycon', kind: 'album', year: '1975', artists: ['tangerine-dream'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular with 960 sequencers', player: 'christopher-franke', synths: ['model-d'], sounds: { 'model-d': 'two-note-ostinato' },
        text: 'Christopher Franke’s Moog modular plays the plucked bass sequence of Part I from its 960 sequencers, with Mellotron, organ and other synths over it.' },
    ] },
  { id: 'klaus-schulze-timewind', title: 'Timewind', kind: 'album', year: '1975', artists: ['klaus-schulze'],
    parts: [
      { instruments: ['arp-2600', 'arp-odyssey'], on: 'ARP 2600 and ARP Odyssey, with an EMS Synthi A and a Synthanorma sequencer', synths: ['b2600'], sounds: { b2600: 'schulze-beating-drone' },
        text: 'Two side-long pieces, “Bayreuth Return” and “Wahnfried 1883”. Schulze’s first solo album to use a sequencer.' },
    ] },
  { id: 'larry-fast-electronic-realizations-for-rock-orchestra', title: 'Electronic Realizations for Rock Orchestra', kind: 'album', year: '1975', artists: ['larry-fast'], credit: 'Synergy',
    parts: [
      { instruments: ['moog-modular', 'moog-minimoog', 'oberheim-sem'], on: 'A small Moog modular, a Minimoog and an Oberheim SEM, with sequencers',
        text: 'Rock arrangements in which every part is a synthesizer, multitracked by Fast alone. It sold more than any all-electronic album since Switched-On Bach.' },
    ] },
  { id: 'parliament-mothership-connection', title: 'Mothership Connection', kind: 'album', year: '1975', artists: ['parliament'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog, with ARP Pro Soloist and ARP String Ensemble', player: 'bernie-worrell', synths: ['poly-d'], sounds: { 'model-d': 'warbling-glide-lead' },
        text: 'Bernie Worrell is credited with Minimoog among his keyboards. His gliding, warbling synth lines run through the title track, “Mothership Connection (Star Child)”.',
        notes: {
          'poly-d': 'Not a Poly D record: Bernie Worrell played these lines on the Minimoog whose panel the Poly D copies.',
        } },
    ] },
  { id: 'suzanne-ciani-buchla-concerts-1975', title: 'Buchla Concerts 1975', kind: 'album', year: '1975', artists: ['suzanne-ciani'],
    parts: [
      { instruments: ['buchla-200'], on: 'Buchla 200 series modular', synths: ['buchla-easel'],
        text: 'Two solo concerts, one for the radio station WBAI and one at Phill Niblock’s loft in New York, played live on the Buchla 200. They were not released until 2016.',
        notes: {
          'buchla-easel': 'Not an Easel record: played on a Buchla 200 modular, the series whose circuits the Music Easel puts in one case.',
        } },
    ] },
  { id: 'jan-hammer-wired', title: 'Wired', kind: 'album', year: '1976', artists: ['jan-hammer'], credit: 'Jeff Beck / Jan Hammer',
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', synths: ['model-d'], sounds: { 'model-d': 'driven-bend-lead' },
        text: 'Hammer plays synthesizer on “Led Boots”, “Come Dancing”, “Blue Wind” and “Play with Me”, trading bent, guitar-like lines with Beck. On “Blue Wind”, which he wrote and produced, he also plays drums and keyboard bass.' },
    ] },
  { id: 'mort-garson-mother-earths-plantasia', title: 'Mother Earth’s Plantasia', kind: 'album', year: '1976', artists: ['mort-garson'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular',
        text: 'Short, melodic pieces written for houseplants to listen to, all played on the Moog. It was first given away by a Los Angeles plant shop and with mattresses sold at Sears.' },
    ] },
  { id: 'klaus-schulze-moondawn', title: 'Moondawn', kind: 'album', year: '1976', artists: ['klaus-schulze'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog modular (Florian Fricke’s Moog IIIp and sequencer cabinet)',
        text: 'Schulze’s first album on the large Moog he bought from Florian Fricke of Popol Vuh late in 1975, used within weeks of buying it.' },
    ] },
  { id: 'chick-corea-romantic-warrior', title: 'Romantic Warrior', kind: 'album', year: '1976', artists: ['chick-corea'], credit: 'Return to Forever',
    parts: [
      { instruments: ['moog-minimoog', 'arp-odyssey', 'moog-modular'], on: 'Minimoog, ARP Odyssey, Micromoog, Polymoog and a Moog 15 modular', synths: ['model-d'],
        text: 'Corea is credited with five synthesizers alongside piano, Rhodes, Clavinet and organ. Which one plays each part is not set out track by track.' },
    ] },
  { id: 'george-duke-with-frank-zappa', title: 'With Frank Zappa', kind: 'body', year: '1973–75', artists: ['george-duke'],
    parts: [
      { instruments: ['arp-odyssey'], on: 'ARP Odyssey',
        text: 'Duke has said he made the Odyssey his instrument and played it mostly with Zappa, on studio albums such as Apostrophe (’) and One Size Fits All, where he is credited with synthesizer.' },
    ] },
  { id: 'jean-michel-jarre-equinoxe', title: 'Équinoxe', kind: 'album', year: '1978', artists: ['jean-michel-jarre'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600, run by Michel Geiss’s Matrisequencer', synths: ['b2600'], sounds: { b2600: 'jarre-octave-seq' },
        text: 'The 2600 is one of the main voices on the album, with sequenced lines from the Matrisequencer that Michel Geiss built.' },
      { instruments: ['ems-vcs3'], on: 'EMS VCS3, through an Electro-Harmonix Small Stone phaser',
        text: 'The VCS3 gives the sweeping echo effects, and with an Eminent organ through the phaser makes the string pads.' },
    ] },
  { id: 'talking-heads-stop-making-sense', title: 'Stop Making Sense', kind: 'performance', year: '1984', artists: ['talking-heads'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Sequential Circuits Prophet-5', player: 'bernie-worrell', synths: ['pro-800'], sounds: { 'pro-800': 'p8-squelch-riff' },
        text: 'Bernie Worrell plays the synth parts in the concert film, recorded at the Pantages Theatre in Hollywood in 1983. He has said he used Prophet-5s for his work with the band.' },
    ] },
  { id: 'jan-hammer-miami-vice-theme', title: '"Miami Vice Theme"', kind: 'song', year: '1985', artists: ['jan-hammer'],
    parts: [
      { instruments: ['fairlight-cmi', 'moog-memorymoog'], on: 'Fairlight CMI, playing samples of a Memorymoog',
        text: 'Hammer sampled bass sounds from his Memorymoog into the Fairlight and arranged the three bass tracks on its Page R sequencer. The drums are samples of his own kit. The single reached number one in the United States.' },
    ] },
  { id: 'jan-hammer-crocketts-theme', title: '"Crockett’s Theme"', kind: 'song', year: '1986', artists: ['jan-hammer'],
    parts: [
      { instruments: ['roland-jupiter-8'], on: 'Roland Jupiter-8 (the bass line)',
        text: 'Hammer said he used the Jupiter-8 for the rolling bass line. The single reached number two in the UK.' },
    ] },
  { id: 'suzanne-ciani-sunergy', title: 'Sunergy', kind: 'album', year: '2016', artists: ['suzanne-ciani', 'kaitlyn-aurelia-smith'], credit: 'Suzanne Ciani / Kaitlyn Aurelia Smith',
    parts: [
      { instruments: ['buchla-200e'], on: 'Buchla 200e', player: 'suzanne-ciani',
        text: 'Ciani’s modular, set up beside Smith’s Easel in her living room in Bolinas, California. The two took turns keeping time and improvised over each other.' },
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel', player: 'kaitlyn-aurelia-smith', sounds: { 'buchla-easel': 'easel-spring-pad' },
        text: 'Smith’s Music Easel, played against Ciani’s 200e in long, slowly changing improvisations.' },
    ] },
  { id: 'john-carpenter-halloween', title: 'Halloween', kind: 'score', year: '1978', artists: ['john-carpenter'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog Series III modular, patched by Dan Wyman, with piano',
        text: 'Carpenter played most of the parts while Dan Wyman, a music professor at San Jose State University, set up the patches on his expanded Moog modular and joined in on the hardest lines. The score was recorded at Sound Arts in Los Angeles.' },
    ] },
  { id: 'giorgio-moroder-chase', title: '"Chase"', kind: 'song', year: '1978', album: 'Midnight Express', artists: ['giorgio-moroder'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog (the bass lines), with a Roland SH-2000 for the melody',
        text: 'The director Alan Parker asked for something in the manner of “I Feel Love”. The pulsing bass lines are a Minimoog and the melody a Roland SH-2000; Harold Faltermeyer arranged the music under Moroder.' },
    ] },
  { id: 'yellow-magic-orchestra-yellow-magic-orchestra', title: 'Yellow Magic Orchestra', kind: 'album', year: '1978', artists: ['yellow-magic-orchestra'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog III-C modular driven by a Roland MC-8 Microcomposer, with a Minimoog, a Polymoog, ARP Odysseys and a Korg PS-3100', player: 'hideki-matsutake',
        text: 'Hideki Matsutake typed the parts into the MC-8, which played the Moog modular and the other synths. He gave the machine-played lines their swing by making small changes to the timing he entered.' },
    ] },
  { id: 'ryuichi-sakamoto-thousand-knives', title: 'Thousand Knives', kind: 'album', year: '1978', artists: ['ryuichi-sakamoto'],
    parts: [
      { instruments: ['moog-modular'], on: 'Moog III-C with a Roland MC-8 Microcomposer, with an Oberheim Eight Voice, a Polymoog, a Minimoog, an ARP Odyssey and a Korg PS-3100',
        text: 'Sakamoto’s first solo album, made just before Yellow Magic Orchestra formed. He played and programmed the synthesizers himself, with Hideki Matsutake operating the MC-8 computer sequencer that drove the Moog III-C.' },
    ] },
  { id: 'the-human-league-being-boiled', title: '"Being Boiled"', kind: 'song', year: '1978', artists: ['the-human-league'],
    parts: [
      { instruments: ['roland-system-100', 'korg-700s'], on: 'Roland System-100 and Korg miniKORG 700S',
        text: 'The band’s first single, recorded in mono on a domestic tape recorder in a disused factory in Sheffield. Martyn Ware has said these two monosynths were all they used, and that the bass line owes its sound to the Korg 700S.' },
    ] },
  { id: 'the-buggles-video-killed-the-radio-star', title: '"Video Killed the Radio Star"', kind: 'song', year: '1979', album: 'The Age of Plastic', artists: ['the-buggles'],
    parts: [
      { instruments: ['moog-minimoog', 'sequential-prophet-5'], on: 'Minimoog and Sequential Circuits Prophet-5, with an ARP Solina string ensemble',
        text: 'Geoff Downes made the overdubbed orchestral parts from a Solina, a Minimoog and a Prophet-5. Its video was the first one MTV showed when the channel opened in 1981.' },
    ] },
  { id: 'ultravox-billy-curries-odyssey-leads', title: 'Billy Currie’s Odyssey leads', kind: 'body', year: '1977–1980', artists: ['ultravox'], credit: 'Billy Currie (Ultravox)',
    parts: [
      { instruments: ['arp-odyssey'], on: 'ARP Odyssey through a flanger',
        text: 'Currie bought an Odyssey for the band’s first album in 1977 and found his lead sound by running it through a flanger. He has said he chose it over the Minimoog for its “honky mad sound”, the position of its LFO and its sliders.' },
    ] },
  { id: 'ultravox-vienna', title: '"Vienna"', kind: 'song', year: '1980', album: 'Vienna', artists: ['ultravox'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog (the bass), with an Elka string synthesizer and a Roland CR-78 drum machine',
        text: 'Warren Cann’s CR-78 pattern was the starting point. Under the piano, viola and Midge Ure’s voice, the slow bass line is a Minimoog. Released as a single in 1981, it reached number two in the UK.' },
    ] },
  { id: 'kate-bush-never-for-ever', title: 'Never for Ever', kind: 'album', year: '1980', artists: ['kate-bush'],
    parts: [
      { instruments: ['yamaha-cs-80'], on: 'Yamaha CS-80',
        text: 'Bush plays a CS-80 herself on “Babooshka” and “All We Ever Look For”, according to the album credits. It was her first album to use synthesizers.' },
      { instruments: ['moog-minimoog', 'sequential-prophet-5'], on: 'Minimoog (Max Middleton) and Prophet-5 (Michael Moran)',
        text: 'On “Egypt” Max Middleton plays a Minimoog and Michael Moran a Prophet-5, according to the album credits.' },
    ] },
  { id: 'omd-enola-gay', title: '"Enola Gay"', kind: 'song', year: '1980', album: 'Organisation', artists: ['omd'],
    parts: [
      { instruments: ['korg-micro-preset'], on: 'Korg M-500 Micro-Preset',
        text: 'Most of the melodic parts, including the lead line, were recorded on the Micro-Preset, a cheap single-oscillator synth the band had bought on hire purchase. The song keeps the same four chords all the way through.' },
    ] },
  { id: 'visage-visage', title: 'Visage', kind: 'album', year: '1980', artists: ['visage'],
    parts: [
      { instruments: ['arp-odyssey', 'yamaha-cs-80', 'moog-minimoog'], on: 'Two ARP Odysseys, a Yamaha CS-80 and a Minimoog, with a Fairlight CMI on “Fade to Grey”',
        text: 'Rusty Egan listed the synths in 1984: two Odysseys, a CS-80, a Minimoog and several Yamaha string machines, shared by Billy Currie and Dave Formula. The producer Richard James Burgess programmed a Fairlight that was used heavily on “Fade to Grey”. Which synth plays each part is not documented.' },
    ] },
  { id: 'japan-gentlemen-take-polaroids', title: 'Gentlemen Take Polaroids', kind: 'album', year: '1980', artists: ['japan'],
    parts: [
      { instruments: ['roland-system-700', 'sequential-prophet-5', 'oberheim-ob-x', 'roland-jupiter-4'], on: 'Roland System-700, Prophet-5, Oberheim OB-X and Roland Jupiter-4, with a Polymoog and a Micromoog',
        text: 'The credits list synths for Richard Barbieri, Steve Jansen and David Sylvian. Barbieri has described the set-up as in transition, using whatever came to hand, including a hired Polymoog; the System-700 was his own, bought in 1978.' },
    ] },
  { id: 'zapp-more-bounce-to-the-ounce', title: '"More Bounce to the Ounce"', kind: 'song', year: '1980', album: 'Zapp', artists: ['zapp'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog, with Roger Troutman’s talk box',
        text: 'Roger Troutman sang through an Electro-Harmonix “Golden Throat” talk box driven by a Minimoog, and the bass line is usually credited to a Minimoog too. Produced by Bootsy Collins and Troutman, it reached number two on the US soul chart.' },
    ] },
  { id: 'kitaro-silk-road', title: 'Silk Road', kind: 'score', year: '1980', artists: ['kitaro'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog, with a Korg miniKORG 700 and a Korg 800DV',
        text: 'Music for the NHK television series about the Silk Road, composed mainly on these three synthesizers. Kitaro named the same three as his favourites in 1989, and said a Minimoog fitted with MIDI did not sound the same as an unmodified one.' },
    ] },
  { id: 'vangelis-chariots-of-fire', title: 'Chariots of Fire', kind: 'score', year: '1981', artists: ['vangelis'],
    parts: [
      { instruments: ['yamaha-cs-80'], on: 'Yamaha CS-80, with acoustic piano',
        text: 'Vangelis recorded the score in 1980 at Nemo Studios, his London studio, playing every instrument himself. In the opening “Titles” a CS-80 melody sits over a repeated piano figure; released as a single, it reached number one in the US.' },
    ] },
  { id: 'rush-tom-sawyer', title: '"Tom Sawyer"', kind: 'song', year: '1981', album: 'Moving Pictures', artists: ['rush'],
    parts: [
      { instruments: ['oberheim-ob-x'], on: 'Oberheim OB-X in unison mode', synths: ['ub-xa-d'],
        text: 'Geddy Lee developed the melody from improvisations he played on the OB-X at soundchecks. The growling sweep is the OB-X with its voices stacked on one note; small differences between the voices’ filters and envelopes keep the sound shifting.' },
    ] },
  { id: 'depeche-mode-just-cant-get-enough', title: '"Just Can’t Get Enough"', kind: 'song', year: '1981', album: 'Speak & Spell', artists: ['depeche-mode', 'vince-clarke'], credit: 'Depeche Mode / Vince Clarke',
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4 and Kawai 100F (Vince Clarke), Yamaha CS-5 (Martin Gore), Moog Prodigy (Andy Fletcher)',
        text: 'The credits name each member’s synth, with Daniel Miller programming an ARP 2600 and a Roland MC-4 sequencer. The riff is usually credited to Clarke’s Jupiter-4.' },
    ] },
  { id: 'soft-cell-tainted-love', title: '"Tainted Love"', kind: 'song', year: '1981', album: 'Non-Stop Erotic Cabaret', artists: ['soft-cell'],
    parts: [
      { instruments: ['ned-synclavier'], on: 'New England Digital Synclavier, with Dave Ball’s Korg synth for the bass and a Synare drum synth',
        text: 'The producer Mike Thorne brought his own Synclavier, which gives the piano sound, the orchestral swells and the long horn note in the 12-inch version. The bass is Ball’s Korg, and the two-note “bink bink” is Thorne’s Synare drum synth.' },
    ] },
  { id: 'the-human-league-dare', title: 'Dare', kind: 'album', year: '1981', artists: ['the-human-league'],
    parts: [
      { instruments: ['roland-jupiter-4', 'roland-system-700'], on: 'Roland Jupiter-4 and System-700, sequenced from a Roland MC-8, with a Linn LM-1 drum machine',
        text: 'The producer Martin Rushent built each song up from a Linn LM-1 pattern, with sequenced synth parts locked to it; the System-700, MC-8 and Linn were his own. The main synth riff of “Don’t You Want Me” is credited to the Jupiter-4.' },
    ] },
  { id: 'vangelis-blade-runner', title: 'Blade Runner', kind: 'score', year: '1982', artists: ['vangelis'],
    parts: [
      { instruments: ['yamaha-cs-80'], on: 'Yamaha CS-80',
        text: 'The CS-80 carries most of the score. In the main titles Vangelis bends the melody down with the ribbon controller, “Blush Response” uses the pressure sensitivity of each key, and “Blade Runner Blues” uses its high register. The soundtrack album was not released officially until 1994.' },
    ] },
  { id: 'rush-countdown', title: '"Countdown"', kind: 'song', year: '1982', album: 'Signals', artists: ['rush'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog',
        text: 'Geddy Lee played the lead on a Minimoog, and told Keyboard magazine in 1984 that he did not think he would do that again.' },
    ] },
  { id: 'toto-africa', title: '"Africa"', kind: 'song', year: '1982', album: 'Toto IV', artists: ['toto'],
    parts: [
      { instruments: ['yamaha-cs-80'], on: 'Yamaha CS-80, with a Yamaha GS-1 for the kalimba part',
        text: 'Steve Porcaro introduced David Paich to the CS-80 and asked him to write a song with it in mind; Paich settled on a brassy, flute-like sound. Porcaro programmed the kalimba riff on a GS-1, recorded it six times with different rhythms and layered the takes.' },
    ] },
  { id: 'thomas-dolby-she-blinded-me-with-science', title: '"She Blinded Me with Science"', kind: 'song', year: '1982', artists: ['thomas-dolby'],
    parts: [
      { instruments: ['roland-jupiter-4'], on: 'Roland Jupiter-4 (most of the keyboards)',
        text: 'Most of the keyboard parts, including the horns in the chorus and the strings, recorded on four tracks two octaves apart, are the Jupiter-4.' },
      { instruments: ['moog-source'], on: 'Moog Source, played by Matthew Seligman', synths: ['model-d'],
        text: 'The bass line, a piccolo-trumpet line and the falling “phone” part after the chorus are a Moog Source, played by Dolby’s bass guitarist.' },
    ] },
  { id: 'prince-little-red-corvette', title: '"Little Red Corvette"', kind: 'song', year: '1982', album: '1999', artists: ['prince'],
    parts: [
      { instruments: ['oberheim-ob-xa'], on: 'Oberheim OB-Xa, with a Linn LM-1', sounds: { 'ub-xa-d': 'poly-pluck' },
        text: 'Prince played the OB-Xa and programmed the LM-1 himself. The song builds from the drum machine and slow synth chords into a rock chorus.' },
    ] },
  { id: 'ryuichi-sakamoto-merry-christmas-mr-lawrence', title: 'Merry Christmas Mr. Lawrence', kind: 'score', year: '1983', artists: ['ryuichi-sakamoto'],
    parts: [
      { instruments: ['sequential-prophet-5'], on: 'Sequential Circuits Prophet-5, with piano, a Fairlight CMI and a LinnDrum', synths: ['pro-800', 'pro-1'],
        text: 'Sakamoto’s first film score, for Nagisa Oshima’s film in which he also acted. The Prophet-5, which he named in interviews as his favourite synthesizer, plays most of the string-like parts.' },
    ] },
  { id: 'prince-when-doves-cry', title: '"When Doves Cry"', kind: 'song', year: '1984', album: 'Purple Rain', artists: ['prince'],
    parts: [
      { instruments: ['oberheim-ob-xa', 'yamaha-dx7'], on: 'Oberheim OB-Xa and Yamaha DX7, with a Linn LM-1',
        text: 'Prince recorded the fast, baroque-sounding synth line at half speed and an octave lower, then played the tape back at normal speed. Matt Fink said this gave the part its staccato, classical feel.' },
    ] },
  { id: 'tears-for-fears-everybody-wants-to-rule-the-world', title: '"Everybody Wants to Rule the World"', kind: 'song', year: '1985', album: 'Songs from the Big Chair', artists: ['tears-for-fears'],
    parts: [
      { instruments: ['yamaha-dx7', 'ppg-wave-2'], on: 'Yamaha DX7, with a PPG Wave for the bass and a Fairlight CMI kick drum',
        text: 'According to the engineer David Bascombe, the synth pattern is a DX7 and the bass line was replaced late on with one played on a PPG Wave. Almost everything was programmed; only some guitar parts and the vocals were played live.' },
    ] },
  { id: 'pet-shop-boys-west-end-girls', title: '"West End Girls"', kind: 'song', year: '1985', album: 'Please', artists: ['pet-shop-boys'],
    parts: [
      { instruments: ['roland-jupiter-6', 'yamaha-dx7'], on: 'Roland Jupiter-6, Yamaha DX7 and E-mu Emulator II, joined by MIDI (the bass)',
        text: 'For Stephen Hague’s re-recording, the bass part was played on three instruments linked by MIDI: a Jupiter-6, which gives it its body, a DX7 and an Emulator II. The choirs, strings and the trumpet solo are Emulator samples.' },
    ] },
  { id: 'van-halen-why-cant-this-be-love', title: '"Why Can’t This Be Love"', kind: 'song', year: '1986', album: '5150', artists: ['van-halen'],
    parts: [
      { instruments: ['oberheim-ob-8'], on: 'Oberheim OB-8', synths: ['ub-xa-d'],
        text: 'The first single with Sammy Hagar singing, it began as a jam in which Eddie Van Halen played the riff on an OB-8. Hagar said the riff sounded like a guitar part, where “Jump” had sounded like a synthesizer. On tour Van Halen played it from a keyboard on stage linked by MIDI to an OB-8 kept backstage.' },
    ] },
  { id: 'europe-the-final-countdown', title: '"The Final Countdown"', kind: 'song', year: '1986', artists: ['europe'],
    parts: [
      { instruments: ['roland-jx-8p'], on: 'Roland JX-8P layered with a Yamaha TX816',
        text: 'Joey Tempest wrote the riff years earlier on a Korg Polysix borrowed from Mic Michaeli. For the record Michaeli made a brass sound on the JX-8P and layered it with a factory sound from the TX816.' },
    ] },
  { id: 'jean-michel-jarre-rendez-vous', title: 'Rendez-Vous', kind: 'album', year: '1986', artists: ['jean-michel-jarre'],
    parts: [
      { instruments: ['elka-synthex'], on: 'Elka Synthex',
        text: 'The album makes heavy use of the Synthex, most of all on “Second Rendez-Vous”, a piece Jarre has often played on the laser harp in concert. The credits also list an Oberheim OB-X, a Synthi AKS, a Prophet-5 and an ARP 2600, among many others.' },
    ] },
  { id: 'cybotron-clear', title: '"Clear"', kind: 'song', year: '1983', album: 'Enter', artists: ['cybotron', 'juan-atkins'],
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Circuits Pro-One (bass line), sequenced from a drum machine',
        text: 'The bass line is a Pro-One step sequence triggered by a drum machine. Juan Atkins has said he tried about three different note sequences before settling on a four-note pattern.' },
    ] },
  { id: 'juan-atkins-no-ufos', title: '"No UFOs"', kind: 'song', year: '1985', artists: ['juan-atkins'], credit: 'Model 500 (Juan Atkins)',
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Circuits Pro-One (stabs and drones), through a Lexicon PCM60 reverb',
        text: 'The stabs and drone effects are a Pro-One run through reverb. It was the first release on Atkins’s own label, Metroplex, recorded in his mother’s basement.' },
      { instruments: ['sequential-six-trak'], on: 'Sequential Circuits Six-Trak (bass line), triggered from a Roland MSQ-700',
        text: 'The bass line is a Six-Trak played from a Roland MSQ-700 sequencer, over a TR-909 and a Drumtraks chained by MIDI.' },
    ] },
  { id: 'marshall-jefferson-ive-lost-control', title: '"I’ve Lost Control"', kind: 'song', year: '1986', artists: ['marshall-jefferson'], credit: 'Sleezy D (Derrick Harris), produced by Marshall Jefferson',
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303, with a Roland TR-808', synths: ['tb-303'],
        text: 'Released on Trax in 1986, a year before “Acid Tracks”, with a TB-303 line under Sleezy D’s voice. Marshall Jefferson has said he did not know how to programme the 303 and just hit some notes.' },
    ] },
  { id: 'larry-heard-washing-machine', title: '"Washing Machine"', kind: 'song', year: '1986', artists: ['larry-heard'], credit: 'Mr. Fingers (Larry Heard)',
    parts: [
      { instruments: ['roland-jupiter-6'], on: 'Roland Jupiter-6, with a Roland TR-707',
        text: 'Larry Heard has said he made “Washing Machine” and “Mystery of Love” on the same day he brought the Jupiter-6 and TR-707 home, in 1984. It was released on Trax in 1986.' },
    ] },
  { id: 'armando-land-of-confusion', title: '"Land of Confusion"', kind: 'song', year: '1987', artists: ['armando'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303, with a Roland TR-707', synths: ['tb-303'], sounds: { 'tb-303': 'tb-jack-house' },
        text: 'A loose, overdriven TB-303 line over a heavily swung TR-707 pattern, made when Armando was seventeen.' },
    ] },
  { id: '808-state-newbuild', title: 'Newbuild', kind: 'album', year: '1988', artists: ['808-state'], credit: '808 State (Graham Massey, Martin Price, Gerald Simpson)',
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303'], sounds: { 'tb-303': 'tb-hollow-square' },
        text: 'Graham Massey has said the 303 was central to the album, which was recorded over a weekend at Spirit Studios in Manchester in January 1988.' },
      { instruments: ['roland-sh-101', 'roland-juno-106'], on: 'Three Roland SH-101s run live, triggered from a TR-808, with a Juno-106',
        text: 'The SH-101s were triggered from the drum machine and sequenced, all running at once.' },
    ] },
  { id: 'a-guy-called-gerald-voodoo-ray', title: '"Voodoo Ray"', kind: 'song', year: '1988', artists: ['a-guy-called-gerald'],
    parts: [
      { instruments: ['roland-sh-101'], on: 'Two Roland SH-101s, driven by a Roland TR-808',
        text: 'The main riffs are two SH-101 sequences layered together to sound like a polysynth. Gerald Simpson recorded the track at home on a Tascam four-track, with the 808 keeping time for everything.' },
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303'],
        text: 'A TB-303 plays a counter-riff, which Simpson has said also covered up timing problems between the machines.' },
    ] },
  { id: '808-state-pacific-state', title: '"Pacific State"', kind: 'song', year: '1989', artists: ['808-state'],
    parts: [
      { instruments: ['roland-juno-106'], on: 'Roland Juno-106 chords, sampled into a Casio FZ-1 and layered with a Roland D-50', synths: ['deepmind-12d'],
        text: 'The warm pad is Juno-106 chords with the chorus on and the filter well down, sampled and layered with the D-50’s “Warm Strings” preset.' },
      { instruments: ['roland-sh-101'], on: 'Roland SH-101 (bass line)',
        text: 'A snaking sixteenth-note bass line in octaves. The lead is a soprano saxophone played by Graham Massey, and the bird call is a sample.' },
    ] },
  { id: 'orbital-chime', title: '"Chime"', kind: 'song', year: '1989', artists: ['orbital'],
    parts: [
      { instruments: ['roland-tb-303', 'yamaha-dx100'], on: 'Roland TB-303, with a Yamaha DX100 bass line', synths: ['tb-303'],
        text: 'Paul Hartnoll made the track at home before going to the pub, recording it live onto cassette. A 303 runs under the sampled chime refrain, with a big DX100 bass line and a TR-909.' },
    ] },
  { id: 'carl-craig-early-recordings', title: 'Early recordings', kind: 'body', year: '1989–90', artists: ['carl-craig'],
    parts: [
      { instruments: ['sequential-prophet-600'], on: 'Sequential Circuits Prophet-600, with an Alesis MMT-8 sequencer',
        text: 'Carl Craig has said that when he started making music he had a Prophet-600, an MMT-8 sequencer and a four-track. His records of 1989–90 as Psyche and BFC were later collected on Elements 1989–1990; which tracks use the Prophet is not stated.' },
    ] },
  { id: 'derrick-may-the-beginning', title: '"The Beginning"', kind: 'song', year: '1990', artists: ['derrick-may'], credit: 'Rhythim Is Rhythim (Derrick May)',
    parts: [
      { instruments: ['yamaha-dx100'], on: 'Yamaha DX100, modified (bass line)',
        text: 'Derrick May told Music Technology in 1990 that his modified DX100 plays the sharp bass line on the track, and that he used it for hard bass sounds rather than strings.' },
    ] },
  { id: 'underground-resistance-early-records', title: 'Early records', kind: 'body', year: 'Early 1990s', artists: ['underground-resistance'],
    parts: [
      { instruments: ['yamaha-dx7'], on: 'Yamaha DX7',
        text: 'Jeff Mills has said that all the early Underground Resistance records were made with the DX7.' },
    ] },
  { id: 'future-sound-of-london-papua-new-guinea', title: '"Papua New Guinea"', kind: 'song', year: '1991', artists: ['future-sound-of-london'],
    parts: [
      { instruments: ['roland-jx-3p'], on: 'Roland JX-3P (top line and strings)',
        text: 'Garry Cobain wrote, sequenced and played the JX-3P top line and strings live. The bass line is sampled from Meat Beat Manifesto’s “Radio Babylon” and the voice from Dead Can Dance.' },
    ] },
  { id: 'plastikman-sheet-one', title: 'Sheet One', kind: 'album', year: '1993', artists: ['plastikman'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303, with a Roland TR-606', synths: ['tb-303', 'td-3'], sounds: { 'tb-303': 'tb-dark-rumble' },
        text: 'Richie Hawtin has said the album came together when he paired the TR-606 with the TB-303, the drum machine it was designed to partner, and jammed live on the two for most of 48 hours.' },
    ] },
  { id: 'chemical-brothers-chemical-beats', title: '"Chemical Beats"', kind: 'song', year: '1994', artists: ['chemical-brothers'],
    parts: [
      { instruments: ['roland-juno-106'], on: 'Roland Juno-106 through a Boss Heavy Metal distortion pedal', synths: ['deepmind-12d'],
        text: 'Their MIDI technician Matt Cox has said the Juno-106 through a Boss Heavy Metal pedal is the signature sound of “Chemical Beats”, and that they still played it that way live.' },
    ] },
  { id: 'underworld-born-slippy-nuxx', title: '"Born Slippy .NUXX"', kind: 'song', year: '1995', artists: ['underworld'],
    parts: [
      { instruments: ['roland-juno-106'], on: 'Roland Juno-106 (chords), with a Roland TR-909', synths: ['deepmind-12d'],
        text: 'The chord sequence is a Juno-106, which Rick Smith has called “a supreme piece of kit”. The drums are a 909, heavily driven through the mixing desk.' },
    ] },
  { id: 'leftfield-song-of-life', title: '"Song of Life"', kind: 'song', year: '1995', album: 'Leftism', artists: ['leftfield'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303, sampled and played back at half speed', synths: ['tb-303'],
        text: 'The album version adds a 303 line that is not on the 1992 single. Played back at half speed, every slide, accent and delay can be heard, alongside samples of the Bulgarian singer Yanka Rupkina.' },
    ] },
  { id: 'fatboy-slim-everybody-needs-a-303', title: '"Everybody Needs a 303"', kind: 'song', year: '1996', album: 'Better Living Through Chemistry', artists: ['fatboy-slim'],
    parts: [
      { instruments: ['roland-tb-303'], on: 'Roland TB-303', synths: ['tb-303', 'td-3'], sounds: { 'td-3': 'td-square-line' },
        text: 'A sample-built big-beat track whose TB-303 line comes out of the breakdown, filtered at first and then opened up into a squelch.' },
    ] },
  { id: 'jeff-mills-the-bells', title: '"The Bells"', kind: 'song', year: '1997', artists: ['jeff-mills'],
    parts: [
      { instruments: ['yamaha-dx7'], on: 'Yamaha DX7',
        text: 'Jeff Mills has said he made “The Bells” on the DX7, the synth that, in his words, everybody in Detroit had at the time.' },
    ] },
  { id: 'air-moon-safari', title: 'Moon Safari', kind: 'album', year: '1998', artists: ['air'],
    parts: [
      { instruments: ['moog-minimoog'], on: 'Minimoog', sounds: { 'model-d': 'round-melodic-bass' },
        text: 'The album credits list Nicolas Godin on Minimoog on five tracks and Jean-Benoît Dunckel on Minimoog on “Kelly Watch the Stars” and “Talisman”, with Moog solos on “La Femme d’argent”, “Sexy Boy” and others.' },
      { instruments: ['korg-ms-20'], on: 'Korg MS-20',
        text: 'Both play the MS-20 on the album; Godin is credited with it on “Sexy Boy”, and Dunckel plays the intro of “All I Need” on it.' },
    ] },
  { id: 'ladytron-604', title: '604', kind: 'album', year: '2001', artists: ['ladytron'],
    parts: [
      { instruments: ['roland-sh-09'], on: 'Roland SH-09, with a Korg MS-20 and Korg MS-10',
        text: 'Daniel Hunt said in 2002 that his SH-09 was all over the record; Mira Aroyo played a Korg MS-20 and Reuben Wu a Korg MS-10.' },
    ] },
  { id: 'aphex-twin-analord', title: 'Analord', kind: 'album', year: '2004–05', artists: ['aphex-twin'], credit: 'AFX (Richard D. James)',
    parts: [
      { instruments: ['roland-sh-101', 'roland-tb-303'], on: 'Roland SH-101 and TB-303, with a Synton Fenix modular and a Roland MC-4 sequencer', synths: ['tb-303'],
        text: 'A series of eleven vinyl EPs made mostly on analogue synths, drum machines and sequencers, after years of computer-based records.' },
    ] },
  { id: 'ladytron-witching-hour', title: 'Witching Hour', kind: 'album', year: '2005', artists: ['ladytron'],
    parts: [
      { instruments: ['korg-ms-20', 'roland-sh-2'], on: 'Korg MS-20 and Roland SH-2 (the bass riffs)',
        text: 'Daniel Hunt said most of the bass riffs are an SH-2 or an MS-20, and that the effects they were put through mattered as much as the synths: some parts listeners take for guitar are synths, and the other way round.' },
    ] },
  { id: 'justice-cross-genesis-dance', title: '† — "Genesis", "D.A.N.C.E."', kind: 'song', year: '2007', artists: ['justice'],
    parts: [
      { instruments: ['roland-juno-106'], on: 'Roland Juno-106', synths: ['deepmind-12d'],
        text: 'Xavier de Rosnay has said the Juno-106 plays the opening arpeggio and the chorus chords of “D.A.N.C.E.” and the bass on “Genesis”.' },
    ] },
  { id: 'lcd-soundsystem-someone-great', title: '"Someone Great"', kind: 'song', year: '2007', album: 'Sound of Silver', artists: ['lcd-soundsystem'],
    parts: [
      { instruments: ['ems-synthi-a'], on: 'EMS Synthi A', synths: ['ems-vcs3'],
        text: 'James Murphy has said the swooping chords are the Synthi A: he set the joystick to move the oscillator pitches between chords and faded a fixed lower note in and out by hand with the third oscillator’s level.' },
    ] },
  { id: 'underworld-two-months-off', title: '"Two Months Off"', kind: 'song', year: '2002', album: 'A Hundred Days Off', artists: ['underworld'],
    parts: [
      { instruments: ['roland-vp-330'], on: 'Roland VP-330 Vocoder Plus',
        text: 'Rick Smith has named the VP-330 vocoder as prominent on this track and on “Juanita”, and said it is on 70 to 80 per cent of their records.' },
    ] },
  { id: 'nine-inch-nails-the-downward-spiral', title: 'The Downward Spiral', kind: 'album', year: '1994', artists: ['nine-inch-nails'],
    parts: [
      { instruments: ['moog-minimoog', 'sequential-prophet-vs'], on: 'Minimoog, Sequential Circuits Prophet VS and Oberheim OB-Mx, with Akai samplers', sounds: { 'model-d': 'feedback-growl' },
        text: 'Reznor’s equipment for the album included a Minimoog, a Prophet VS and an Oberheim OB-Mx alongside samplers and guitars. Which part each synth plays is not documented track by track.' },
    ] },
  { id: 'the-chromatics-night-drive', title: 'Night Drive', kind: 'album', year: '2007', artists: ['the-chromatics'],
    parts: [
      { instruments: ['korg-minikorg-700'], on: 'Korg miniKORG 700',
        text: 'Johnny Jewel has said the miniKORG 700 he found in a Kansas pawn shop was the main synth on Night Drive and on the label’s other early records.' },
    ] },
  { id: 'oneohtrix-point-never-rifts', title: 'Rifts', kind: 'album', year: '2009', artists: ['oneohtrix-point-never'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60, inherited from Lopatin’s father',
        text: 'The Juno-60 was Lopatin’s main instrument on the early records collected here: arpeggios run through echo pedals and left to repeat.' },
    ] },
  { id: 'oneohtrix-point-never-returnal', title: 'Returnal', kind: 'album', year: '2010', artists: ['oneohtrix-point-never'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60, with an Akai AX60, a Roland MSQ-700 sequencer and a Korg Electribe ES-1',
        text: 'The album mixes noise with slower synth pieces, made on the Juno-60 and the other synths with Lopatin’s processed voice.' },
    ] },
  { id: 'metronomy-the-bay', title: '"The Bay"', kind: 'song', year: '2011', album: 'The English Riviera', artists: ['metronomy'],
    parts: [
      { instruments: ['roland-juno-60'], on: 'Roland Juno-60',
        text: 'The bass lines are a Juno-60. Joseph Mount has said Juno-60s were the cheap, old synth bands picked up around 2009 to 2011, and the instrument is all over The English Riviera.' },
    ] },
  { id: 'survive-floating-cube', title: '"Floating Cube"', kind: 'song', year: '2012', album: 'HD015', artists: ['survive'],
    parts: [
      { instruments: ['arp-odyssey'], on: 'ARP Odyssey',
        text: 'Mark Donica wrote the opening bass pattern on his ARP Odyssey after getting it working again. The part on the record was played live in a studio, with the Odyssey put through a valve compressor.' },
    ] },
  { id: 'tame-impala-lonerism', title: 'Lonerism', kind: 'album', year: '2012', artists: ['tame-impala'],
    parts: [
      { instruments: ['sequential-pro-one', 'roland-juno-106'], on: 'Sequential Circuits Pro-One and Roland Juno-106',
        text: 'Kevin Parker made the album’s synth parts mainly on these two, layered with guitars and warped audio.' },
    ] },
  { id: 'chvrches-the-bones-of-what-you-believe', title: 'The Bones of What You Believe', kind: 'album', year: '2013', artists: ['chvrches'],
    parts: [
      { instruments: ['roland-juno-106', 'moog-minimoog-voyager'], on: 'Roland Juno-106 and Minimoog Voyager',
        text: 'The band have named the Juno-106 and the Voyager as the cornerstones of the album’s sound. With a Prophet ’08 they were also the analogue synths the band took on stage.' },
    ] },
  { id: 'chvrches-we-sink', title: '"We Sink"', kind: 'song', year: '2013', album: 'The Bones of What You Believe', artists: ['chvrches'],
    parts: [
      { instruments: ['sequential-prophet-08'], on: 'Dave Smith Instruments Prophet ’08',
        text: 'The song is built on the Prophet ’08 sequence it opens with, over a four-to-the-floor kick.' },
    ] },
  { id: 'kaitlyn-aurelia-smith-tides', title: 'Tides', kind: 'album', year: '2014', artists: ['kaitlyn-aurelia-smith'],
    parts: [
      { instruments: ['buchla-music-easel'], on: 'Buchla Music Easel',
        text: 'Made with the new Music Easel Smith bought in 2013, as was Euclid the following year.' },
    ] },
  { id: 'alessandro-cortini-sonno', title: 'Sonno', kind: 'album', year: '2014', artists: ['alessandro-cortini'],
    parts: [
      { instruments: ['roland-mc-202'], on: 'Roland MC-202 through a delay pedal',
        text: 'Cortini wrote the pieces as lullabies for himself in hotel rooms while on tour, and recorded the MC-202 directly through a delay pedal. The title is Italian for sleep.' },
    ] },
  { id: 'steve-moore-the-guest', title: 'The Guest (score)', kind: 'score', year: '2014', artists: ['steve-moore'],
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Circuits Pro-One, among his analogue synths', sounds: { 'pro-1': 'dark-eighths-bass' },
        text: 'Moore said in 2014, just after finishing the score, that his Pro-One had been used on every recording he had made since buying it in 2002, and that he uses it and his Prophet-600 on almost every score for atmospheres and Carpenter-style stings.' },
    ] },
  { id: 'steve-moore-zombi-records', title: 'Zombi records', kind: 'body', year: '2000s–10s', artists: ['steve-moore'],
    parts: [
      { instruments: ['sequential-pro-one', 'sequential-prophet-600', 'korg-polysix'], on: 'Sequential Circuits Pro-One, Prophet-600 and Korg Polysix', sounds: { 'pro-800': 'p8-carpenter-bass' },
        text: 'Moore has said these three synths are on every Zombi recording and go on every tour. On stage he uses the chord memory of the Prophet-600 and Polysix to play chords from one key while also covering the bass.' },
    ] },
  { id: 'tame-impala-currents', title: 'Currents', kind: 'album', year: '2015', artists: ['tame-impala'],
    parts: [
      { instruments: ['roland-juno-106', 'sequential-pro-one'], on: 'Roland Juno-106 and Sequential Circuits Pro-One',
        text: 'Parker kept the two synths he had used on Lonerism.' },
      { instruments: ['roland-jv-1080'], on: 'Roland JV-1080',
        text: 'He added the 1990s rack module for its plasticky preset sounds, which he said were more nostalgic to him than a vintage guitar amp.' },
    ] },
  { id: 'kyle-dixon-michael-stein-kids', title: 'Stranger Things (score), “Kids”', kind: 'score', year: '2016', artists: ['kyle-dixon-michael-stein'],
    parts: [
      { instruments: ['sequential-prophet-6', 'oberheim-sem', 'korg-minikorg-700'], on: 'Prophet-6, ARP Avatar (bass), Univox Mini-Korg (melody) and Oberheim SEM (high arpeggio)',
        text: 'The first music heard in the series, as the boys cycle home. A strange droning bass note on the ARP Avatar builds tension, the Mini-Korg plays the melody and an SEM the high arpeggio. The Prophet-6 was used heavily across the score because it could save patches.' },
    ] },
  { id: 'kyle-dixon-michael-stein-the-upside-down', title: 'Stranger Things (score), the Upside Down', kind: 'score', year: '2016', artists: ['kyle-dixon-michael-stein'],
    parts: [
      { instruments: ['arp-2600'], on: 'ARP 2600 (percussion blasts), with a 5U modular and a Polymoog',
        text: 'Made after the directors asked for a monster theme. Stein sequenced it on the eight-step Encore Event Generator in his large 5U modular, with rising dissonant pads from a Polymoog, sub-bass and percussion blasts from an ARP 2600.' },
    ] },
  { id: 'survive-copter', title: '"Copter"', kind: 'song', year: '2016', album: 'RR7349', artists: ['survive'],
    parts: [
      { instruments: ['korg-mono-poly'], on: 'Korg Mono/Poly',
        text: 'The bass line began when Mark Donica played with the decay on Kyle Dixon’s Mono/Poly over a drum pattern Dixon had been working on. The band say the Mono/Poly is on a lot of their records.' },
    ] },
  { id: 'hans-zimmer-blade-runner-2049', title: 'Blade Runner 2049 (score)', kind: 'score', year: '2017', artists: ['hans-zimmer'], credit: 'Hans Zimmer and Benjamin Wallfisch',
    parts: [
      { instruments: ['yamaha-cs-80'], on: 'Yamaha CS-80',
        text: 'Zimmer took his CS-80, the synth Vangelis used for the 1982 film, out of storage, and the composers used it to begin and end the score. Most of the rest was made on modern synthesizers.' },
    ] },
  { id: 'kaitlyn-aurelia-smith-the-kid', title: 'The Kid', kind: 'album', year: '2017', artists: ['kaitlyn-aurelia-smith'],
    parts: [
      { instruments: ['buchla-music-easel', 'ems-synthi-100'], on: 'Buchla Music Easel, with an EMS Synthi 100 and other synths',
        text: 'The Music Easel remains the main voice, joined on some tracks by the rare EMS Synthi 100.' },
    ] },
  { id: 'alessandro-cortini-avanti', title: 'Avanti', kind: 'album', year: '2017', artists: ['alessandro-cortini'],
    parts: [
      { instruments: ['ems-synthi-aks'], on: 'EMS Synthi AKS, nothing else', synths: ['ems-vcs3'],
        text: 'Cortini made music for his grandfather’s Super 8 films of his childhood using only a Synthi AKS, with no overdubs, and kept the mistakes in as the films kept theirs.' },
    ] },
  { id: 'caterina-barbieri-born-again-in-the-voltage', title: 'Born Again in the Voltage', kind: 'album', year: '2018', artists: ['caterina-barbieri'],
    parts: [
      { instruments: ['buchla-200'], on: 'Buchla 200 at EMS Stockholm, with cello by Antonello Manzo',
        text: 'Four pieces for Buchla 200, voice and cello, recorded at the Elektronmusikstudion between 2014 and 2015 and released in 2018.' },
    ] },
  { id: 'floating-points-crush', title: 'Crush', kind: 'album', year: '2019', artists: ['floating-points'],
    parts: [
      { instruments: ['buchla-200'], on: 'Buchla modular, with drum machines',
        text: 'Much of the album came out of the Buchla and drum-machine set-up Shepherd used to improvise his support sets for The xx, with the Buchla making beats as well as tones.' },
      { instruments: ['rhodes-chroma'], on: 'Rhodes Chroma',
        text: 'On “Apoptose” a Buchla pattern bubbles along while Shepherd plays a simple melody over it on the Chroma.' },
    ] },
  { id: 'lindstrom-on-a-clear-day-i-can-see-you-forever', title: '"On a Clear Day I Can See You Forever"', kind: 'song', year: '2019', album: 'On a Clear Day I Can See You Forever', artists: ['lindstrom'],
    parts: [
      { instruments: ['moog-memorymoog'], on: 'Memorymoog',
        text: 'Lindstrøm has said the album’s first track began as a take he recorded just to try out the Memorymoog, which he kept after deciding it was good.' },
    ] },
  { id: 'kelly-lee-owens-arpeggi', title: '"Arpeggi"', kind: 'song', year: '2020', album: 'Inner Song', artists: ['kelly-lee-owens'],
    parts: [
      { instruments: ['sequential-pro-one'], on: 'Sequential Circuits Pro-One',
        text: 'Owens’s cover of Radiohead’s “Weird Fishes/Arpeggi” was worked out over MIDI on a Pro-One in two afternoons, a year before the rest of the album.' },
    ] },
  { id: 'kelly-lee-owens-inner-song', title: 'Inner Song', kind: 'album', year: '2020', artists: ['kelly-lee-owens'],
    parts: [
      { instruments: ['roland-sh-101'], on: 'Roland SH-101',
        text: 'Owens has said an SH-101 was used for many of the album’s bass lines.' },
      { instruments: ['korg-mono-poly'], on: 'Korg Mono/Poly',
        text: 'James Greenwood’s Mono/Poly is at the centre of her studio, and she has said it is all over her records.' },
    ] },
  { id: 'dr-meaker-the-neutron', title: '"The Neutron"', kind: 'song', year: '2022', artists: ['dr-meaker'],
    parts: [
      { instruments: ['behringer-neutron'], on: 'Behringer Neutron, nothing else',
        text: 'Every element of the drum and bass track was made on one Neutron, an idea that began as a demonstration video for Behringer. It was released on Symmetry Recordings.' },
    ] },
  { id: 'dr-meaker-ms20-life', title: '"MS20 Life"', kind: 'song', artists: ['dr-meaker'],
    parts: [
      { instruments: ['korg-ms-20'], on: 'Korg MS-20',
        text: 'Meaker built the drums from other sources, but all the bass and synth sounds on the track are the MS-20. Whether it is an original or one of Korg’s reissues is not stated.' },
    ] },
  { id: 'jasper-tygner-blue', title: 'Blue', kind: 'album', year: '2026', artists: ['jasper-tygner'],
    parts: [
      { instruments: ['moog-grandmother'], on: 'Moog Grandmother, with a Moog Matriarch and a Prophet',
        text: 'Tygner played the album’s synth parts by hand and ran them through a Vermona RetroVerb for spring reverb and a little drive. Which tracks use the Grandmother is not stated.' },
    ] },
];
