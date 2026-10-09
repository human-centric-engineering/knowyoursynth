/**
 * Model D's catalogue rows as the seed would write them, shaped as the database returns them to the read layer.
 *
 * A test mocks `@/lib/db/client` with `synth.findFirst` and `synthNote.findMany`, resolves them with these, and calls
 * `getSynthDetail('model-d')`. What comes back is Model D's real content in the shape the API serves and the synth
 * page receives: all 99 sounds, the lineage and the notes. Reading the seed data here is allowed: tests are outside the
 * seed-data boundary (`tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`).
 */

import { planCatalogue } from '@/lib/app/catalogue/seed';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

export function modelDRows() {
  const rows = planCatalogue(loadCatalogueData());
  const synth = rows.synths.find((s) => s.id === 'model-d');
  const lineage = rows.lineage.find((l) => l.synthId === 'model-d');
  if (!synth || !lineage) throw new Error('the seed data has no Model D');
  const sounds = rows.sounds.filter((s) => s.synthId === 'model-d');
  return {
    /** What `prisma.synth.findFirst` returns for Model D. */
    stored: {
      ...synth,
      _count: { sounds: sounds.length },
      sounds: sounds.map((s, i) => ({ id: `row-${i}`, editedAt: null, ...s })),
      lineage: { ...lineage, editedAt: null },
    },
    /** What `prisma.synthNote.findMany` returns for Model D: its own notes and the shared limits. */
    noteRows: rows.notes
      .filter((n) => n.synthId === 'model-d' || n.synthId === null)
      .map(({ kind, synthId, target, title, text }) => ({ kind, synthId, target, title, text })),
  };
}
