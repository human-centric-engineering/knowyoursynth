/**
 * The tutor's prompt context: the synth's name, what it is, and its section index, registered for `contextType:
 * 'synth'` by the real `lib/app/context-contributors.ts` and framed by the real `buildContext`.
 *
 * @see lib/app/tutor/context.ts · lib/app/context-contributors.ts
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tenancy/context', () => ({ requireTenantContext: () => ({ orgId: 'install' }) }));
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/orchestration/knowledge/search', () => ({ getPatternDetail: vi.fn() }));

import { TUTOR_CONTEXT_TYPE, synthContext } from '@/lib/app/tutor/context';
import { buildContext } from '@/lib/orchestration/chat/context-builder';
import { synth } from '@/tests/helpers/tutor';

describe('synthContext', () => {
  it('names a small synth and its sections, and says describe_synth returns it whole', async () => {
    const modelD = synth('model-d');
    const body = await synthContext('model-d');
    expect(body).toContain(
      `the ${modelD.maker} Model D (id model-d, definition version ${modelD.version})`
    );
    expect(body).toContain(modelD.summary);
    expect(body).toContain(
      'It has 48 controls. describe_synth with no arguments returns all of them (or its sections, on a heavily patched panel).'
    );
    expect(body).toContain('SECTIONS (id | name | controls | jacks)');
    expect(body).toMatch(/^filter \| .+ \| \d+ \| \d+$/m);
  });

  it('tells the model to name a section on a large synth', async () => {
    const body = await synthContext('deepmind-12d');
    expect(body).toContain('It has 1568 controls. That is too many to look up at once');
    expect(body).toMatch(/^display \| Display and menus \| 1514 \| \d+$/m);
  });

  it("counts a section's jacks, so one that holds only jacks does not read as empty", async () => {
    expect(await synthContext('system-15')).toMatch(/^appout \| .+ \| 0 \| 2$/m);
  });

  it('names the prefixes inside a section too big to describe at once, so the model can go straight to one', async () => {
    const body = await synthContext('deepmind-12d');
    expect(body).toContain('PREFIXES IN LARGE SECTIONS (section | prefix | controls)');
    expect(body).toMatch(/^display \| fx1 \| 373$/m);
    // A section small enough to describe whole gets no prefix rows (three fields; its index row has four).
    expect(body).not.toMatch(/^env \| [\w.-]+ \| \d+$/m);
    expect(await synthContext('model-d')).not.toContain('PREFIXES IN LARGE SECTIONS');
  });

  it("does not list a synth's controls", async () => {
    expect(await synthContext('model-d')).not.toContain('filter.cutoff');
  });

  it('says so for a synth the registry does not have', async () => {
    expect(await synthContext('no-such-synth')).toBe("There is no synth with id 'no-such-synth'.");
  });
});

describe('the synth context in a chat turn', () => {
  it('is what buildContext frames for contextType "synth"', async () => {
    const framed = await buildContext(TUTOR_CONTEXT_TYPE, 'model-d');
    expect(framed).toContain(await synthContext('model-d'));
    expect(framed).not.toContain('No context loader');
  });
});
