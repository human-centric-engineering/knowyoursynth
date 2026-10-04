// Where the Jupiter-6 names or does something differently from most synths: one short note per control or area id.
// Shown under the general help as "Unusual on the Jupiter-6". See CONTRACT.md → Unusual notes for the writing rules.
const WAVES = 'Most synths pick one waveform per oscillator. Here each wave has its own button and they can be lit together, so an oscillator can play a sawtooth and a triangle at once, like organ drawbars.';

export default {
  vcf: 'One filter that can be low-pass, high-pass or band-pass, chosen by two buttons: both lit is band-pass. Most polysynths of its time, the Jupiter-8 included, had a low-pass filter only.',
  'vcf.hpf': 'Lit together with LPF it gives band-pass. There is no third button for it: the BPF bracket printed beside the pair says so.',
  'vcf.lpf': 'Lit together with HPF it gives band-pass. There is no third button for it: the BPF bracket printed beside the pair says so.',
  'vco.sync12': 'The Jupiter-6 can sync either oscillator to the other. Most synths sync only the second oscillator to the first.',
  'vco.sync21': 'Syncing VCO-1 to VCO-2 is the reverse of most synths, and lets the cross mod and sync work on the same oscillator.',
  'vco1.xmodEnv': 'Cross mod is Roland’s name for audio-rate frequency modulation of VCO-1 by VCO-2. Here an envelope can open and close it, which few analogue synths allow; most have a fixed FM depth.',
  'vco1.xmod': 'Cross mod is Roland’s name for frequency modulation: VCO-2 moves VCO-1’s pitch, at audio rate for metallic tones or, with VCO-2 at LOW, as a vibrato.',
  'vco1.tri': WAVES,
  'vco1.saw': WAVES,
  'vco1.pulse': WAVES,
  'vco1.square': WAVES,
  'vco2.tri': WAVES,
  'vco2.saw': WAVES,
  'vco2.pulse': WAVES,
  'vco2.noise': 'Noise is one of VCO-2’s waveform buttons, so it shares VCO-2’s side of the MIX knob. There is no separate noise level.',
  'vco2.range': 'One knob covers three jobs: a slow LFO at LOW, half steps from 32’ to 2’ in the middle, and HIGH beyond 2’. Most synths have an octave switch and a separate tuning knob.',
  'vco1.range': 'RANGE steps in half steps rather than octaves, so VCO-1 can be set a fifth or any interval above VCO-2 without a fine-tune knob.',
  'mix.balance': 'One knob for both oscillators: turning towards one turns the other down only past the middle. Most synths have a level knob for each.',
  'env1.polarity': 'Most synths invert an envelope only where it meets the filter. Here POLARITY turns ENV-1 upside down everywhere it goes: filter, pitch, PWM and cross mod.',
  'env1.kf': 'KEY FOLLOW here shortens the envelope times on higher notes. On many synths key follow means filter tracking only.',
  'env2.kf': 'KEY FOLLOW here shortens the envelope times on higher notes, as on a piano. On many synths key follow means filter tracking only.',
  'voice.solo': 'SOLO and UNISON lit together make a third mode, SOLO UNISON: all six voices on one note. UNISON alone shares the voices between the keys held.',
  'glide.gliss': 'Glissando steps through the half steps between notes, like a finger run along a keyboard, where portamento slides. Few synths offer both.',
  lfo2: 'A second LFO kept for the player, brought in by a button beside the bender, with its own rise time. On many synths the mod wheel does this job.',
  'vca.level': 'Roland labels the VCA level ENV-2 LEVEL: it sets how far ENV-2 opens the amplifier, so it is the patch volume.',
};
