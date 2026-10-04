import modelD from '@/synths/model-d.js';
import neutron from '@/synths/neutron.js';
import pro1 from '@/synths/pro1.js';
import b2600 from '@/synths/b2600.js';
import k2 from '@/synths/k2.js';
import deepmind from '@/synths/deepmind-12d.js';
import ubxad from '@/synths/ub-xa-d.js';
import xm2 from '@/synths/2-xm.js';
import kobol from '@/synths/kobol.js';
import cat from '@/synths/cat.js';
import wasp from '@/synths/wasp-deluxe.js';
import polyD from '@/synths/poly-d.js';
import pro800 from '@/synths/pro-800.js';
import vcs3 from '@/synths/ems-vcs3.js';
import easel from '@/synths/buchla-easel.js';
import tb303 from '@/synths/tb-303.js';
import td3 from '@/synths/td-3.js';
import jupiter4 from '@/synths/jupiter-4.js';
import jupiter6 from '@/synths/jupiter-6.js';
import jupiter8 from '@/synths/jupiter-8.js';
import system15 from '@/synths/system-15.js';
import system35 from '@/synths/system-35.js';
import system55 from '@/synths/system-55.js';
import model15 from '@/synths/model-15.js';
import grandmother from '@/synths/grandmother.js';
import { heardFor } from '@/bank/index.js';

export const SYNTHS = [modelD, neutron, pro1, k2, b2600, deepmind, ubxad, xm2, kobol, cat, wasp, polyD, pro800, vcs3, easel, tb303, td3, jupiter4, jupiter6, jupiter8, system15, system35, system55, model15, grandmother];

// A synth's "Heard on" list is read from the databank (src/bank/songs.js), not written in its lineage file.
for (const s of SYNTHS) if (s.lineage) s.lineage = { ...s.lineage, heard: heardFor(s.id) };
export const synthById = (id) => SYNTHS.find((s) => s.id === id) || SYNTHS[0];
