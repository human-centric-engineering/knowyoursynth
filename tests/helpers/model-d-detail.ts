/**
 * Model D's catalogue rows as the seed would write them, shaped as the database returns them to the read layer: all 99
 * sounds, the lineage and the notes. Model D is the synth the page's own tests run on; `synthRows()` builds the same
 * for any synth.
 */

import { synthRows } from '@/tests/helpers/synth-detail';

export const modelDRows = () => synthRows('model-d');
