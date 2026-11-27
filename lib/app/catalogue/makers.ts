/**
 * The brand a maker is grouped under in the synth picker (`f-synth-picker` t-328).
 *
 * The catalogue and the databank name makers as each instrument was sold, so one brand arrives under several names:
 * the catalogue's "Moog" beside the databank's "Moog Music" and "R. A. Moog Co.", "Sequential" beside "Sequential
 * Circuits". Grouped as written, the picker would show Moog twice. This joins those spellings under the name people
 * look for; every row still prints its own maker.
 *
 * Only spellings that would otherwise split a brand are listed. A maker not here is its own group, so a new one
 * needs no entry until a second spelling of it arrives. Pure: the picker and its tests share it.
 */

/** Each listed maker spelling, lower-cased, and the brand it is grouped under. */
const BRANDS: Record<string, string> = {
  moog: 'Moog',
  'moog music': 'Moog',
  'r. a. moog co.': 'Moog',
  oberheim: 'Oberheim',
  'oberheim electronics': 'Oberheim',
  sequential: 'Sequential',
  'sequential circuits': 'Sequential',
  buchla: 'Buchla',
  'buchla & associates': 'Buchla',
  'buchla electronic musical instruments': 'Buchla',
  ems: 'EMS',
  'electronic music studios': 'EMS',
};

/** The brand `maker` is grouped under: its listed brand, else the maker as written. */
export function makerGroup(maker: string): string {
  const name = maker.trim();
  return BRANDS[name.toLowerCase()] ?? name;
}

/**
 * A databank instrument's name without the maker it starts with, as the catalogue names synths: "ARP Odyssey Mk II"
 * by ARP Instruments is "Odyssey Mk II", "Sequential Circuits Pro-One" is "Pro-One". The maker's first word is enough
 * ("ARP" of "ARP Instruments"); a name that is only its maker is left whole.
 */
export function nameWithoutMaker(name: string, maker: string): string {
  const lower = name.toLowerCase();
  for (const prefix of [maker, maker.split(/\s+/)[0]]) {
    const p = prefix.trim().toLowerCase();
    if (p && lower.startsWith(`${p} `) && name.length > p.length + 1)
      return name.slice(p.length + 1).trim();
  }
  return name;
}
