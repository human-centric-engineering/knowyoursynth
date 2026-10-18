import { z } from 'zod';
import { readPanel, type TutorPanel } from '@/lib/app/tutor/panel';
import {
  DESCRIBE_MAX_CHARS,
  describesWhole,
  modelled,
  sectionIndex,
} from '@/lib/app/tutor/sections';
import { areaMembers } from '@/lib/app/synths/lib/areas';
import { jackName } from '@/lib/app/synths/lib/explain';
import { describeSynth, displayName } from '@/lib/app/synths/lib/patch';
import type { Control, Jack } from '@/lib/app/synths/contract';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

const schema = z
  .object({
    section: z.string().min(1).max(64).optional(),
    prefix: z.string().min(1).max(160).optional(),
  })
  .strict();

type Args = z.infer<typeof schema>;

export interface DescribeData {
  synthId: string;
  /**
   * What `text` holds: the whole synth, a section, the controls under a prefix, or an index to narrow by (a synth's
   * sections, or the prefixes inside a section or prefix too big to list at once).
   */
  scope: 'whole' | 'section' | 'prefix' | 'index';
  text: string;
}

/** How many example labels an index row gives for a prefix. */
const EXAMPLES = 3;

/** Heads a narrowed answer, whose cable list covers only the jacks in it. */
const NARROWED =
  "Cables listed are only those to and from the jacks below; get_panel lists the panel's cables (up to 100).";

/**
 * `describe_synth`: the synth's controls, jacks and legal values, with the panel's current values, from the
 * definition (`describeSynth`). A lookup for every synth (the decision and its numbers are in `.context/app/tutor.md`):
 * with no arguments it returns the whole synth when that is small, and its section index when not; a section returns
 * what is in it, a prefix the controls whose ids start with it. Anything too big to hand over in one call comes back as
 * an index of the next prefixes down. A turn has five model calls in all (`MAX_TOOL_ITERATIONS`), so the context
 * names the prefixes inside a large section up front: one effect's parameters on the DeepMind are two calls away
 * (`fx1`, then `fx1.<effect>`), the first made alongside `get_panel`.
 */
export class DescribeSynthCapability extends BaseCapability<Args, DescribeData> {
  readonly slug = 'describe_synth';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'describe_synth',
    description:
      'Look up the synth\'s controls (id, panel label, section, legal values, current value) and patch jacks. With no arguments it returns the whole synth when it is small; on a large synth it returns the section list instead. Name a section to see what is in it, or a prefix to see the controls whose ids start with it (a prefix of "vcf" matches "vcf.cutoff"). When a result is too big to list, it returns the prefixes to narrow by. Use only ids and values it shows you. Read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        section: {
          type: 'string',
          description: 'A section id from the synth\'s section list, e.g. "filter".',
        },
        prefix: {
          type: 'string',
          description:
            'A control id prefix, from a previous result\'s list of prefixes, e.g. "fx1" or "fx1.tc-deepvrb". Matches the id itself and every id that continues it after a dot.',
        },
      },
    },
  };

  execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<DescribeData>> {
    const read = readPanel(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    return Promise.resolve(this.describe(read.panel, args));
  }

  private describe(panel: TutorPanel, { section, prefix }: Args): CapabilityResult<DescribeData> {
    const { def, values } = panel;
    const cables = panel.cables.map(([from, to]) => ({ from, to }));
    const synthId = def.id;
    // Only the cables to and from the jacks being listed: a lookup of a few controls must not carry a heavily patched
    // panel's whole cable list, or no answer would ever fit and some controls could not be looked up at all.
    const textOf = (controls: Control[], jacks: Jack[]) => {
      const ids = new Set(jacks.map((j) => j.id));
      const shown = cables.filter((c) => ids.has(c.from) || ids.has(c.to));
      return describeSynth({ ...def, controls, jacks }, values, shown);
    };

    if (section === undefined && prefix === undefined) {
      // A synth too big even on the init patch is never built whole just to be measured.
      const whole = describesWhole(def) ? textOf(def.controls, def.jacks.filter(modelled)) : null;
      if (whole !== null && whole.length <= DESCRIBE_MAX_CHARS)
        return this.success({ synthId, scope: 'whole', text: whole });
      return this.success({
        synthId,
        scope: 'index',
        text: `The ${def.name} has ${def.controls.length} controls, too many to list at once. Call describe_synth again with a section from this list.\n${sectionIndex(def)}`,
      });
    }

    let controls = def.controls;
    // Only the jacks `describeSynth` lists, so a prefix or a count never rests on one it leaves out.
    let jacks = def.jacks.filter(modelled);
    let title = `The ${def.name}`;
    if (section !== undefined) {
      // A find, not a lookup in `areaMap`: the id comes from the model, and a plain object would answer `constructor`.
      const area = def.areas.find((a) => a.id === section);
      if (!area)
        return this.error(
          `The ${def.name} has no section "${section}". Its sections are: ${def.areas.map((a) => a.id).join(', ')}.`,
          'unknown_section'
        );
      const members = areaMembers(def, area);
      controls = members.controls;
      jacks = members.jacks.filter(modelled);
      title = `Section ${area.id} (${area.label})`;
    }
    if (prefix !== undefined) {
      const under = (id: string) => id === prefix || id.startsWith(`${prefix}.`);
      controls = controls.filter((c) => under(c.id));
      jacks = jacks.filter((j) => under(j.id));
      if (!controls.length && !jacks.length)
        return this.error(
          `No control or jack ${section !== undefined ? `in section ${section} ` : ''}has the id "${prefix}" or one that starts "${prefix}.".`,
          'unknown_prefix'
        );
      title = `${title}, prefix ${prefix},`;
    }

    const text = textOf(controls, jacks);
    // One control or jack is described however long it is: an index of one would point back at itself.
    if (text.length <= DESCRIBE_MAX_CHARS || controls.length + jacks.length === 1)
      return this.success({
        synthId,
        scope: prefix !== undefined ? 'prefix' : 'section',
        text: `${NARROWED}\n${text}`,
      });
    return this.success({
      synthId,
      scope: 'index',
      text: this.index(def, textOf, { controls, jacks, title, section, prefix }),
    });
  }

  /**
   * What is under a section or prefix too big to list: its ids grouped one dot-segment deeper than the prefix, each
   * group with a count and example labels. A group of one is that control itself, so those are described in full
   * (`fx1.type`, the effect a slot holds) unless even they are too many.
   */
  private index(
    def: TutorPanel['def'],
    textOf: (controls: Control[], jacks: Jack[]) => string,
    at: { controls: Control[]; jacks: Jack[]; title: string; section?: string; prefix?: string }
  ): string {
    const { controls, jacks, title, section, prefix } = at;
    const depth = prefix === undefined ? 1 : prefix.split('.').length + 1;
    const keyOf = (id: string) => id.split('.').slice(0, depth).join('.');
    const groups = new Map<string, { controls: Control[]; jacks: Jack[] }>();
    const groupOf = (id: string) => {
      const key = keyOf(id);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { controls: [], jacks: [] }));
      return g;
    };
    for (const c of controls) groupOf(c.id).controls.push(c);
    for (const j of jacks) groupOf(j.id).jacks.push(j);

    const isLeaf = (key: string, g: { controls: Control[]; jacks: Jack[] }) =>
      g.controls.length + g.jacks.length === 1 && (g.controls[0]?.id ?? g.jacks[0]?.id) === key;
    const leaves = [...groups].filter(([key, g]) => isLeaf(key, g));
    let full = leaves.length
      ? textOf(
          leaves.flatMap(([, g]) => g.controls),
          leaves.flatMap(([, g]) => g.jacks)
        )
      : '';
    if (full.length > DESCRIBE_MAX_CHARS) full = '';
    const listed = [...groups].filter(([key, g]) => !full || !isLeaf(key, g));

    const rows = listed.map(([key, g]) => {
      const examples = [
        ...g.controls.map((c) => displayName(def, c)),
        ...g.jacks.map((j) => jackName(j)),
      ].slice(0, EXAMPLES);
      return `${key} | ${g.controls.length + g.jacks.length} | ${examples.join(', ')}`;
    });
    return [
      `${title} has ${controls.length} controls and ${jacks.length} jacks, too many to list at once. Call describe_synth again with a prefix from this list${section !== undefined ? `, and section ${section}` : ''}.`,
      `PREFIXES (prefix | how many | for example)\n${rows.join('\n')}`,
      ...(full ? [`These are single controls, in full. ${NARROWED}\n${full}`] : []),
    ].join('\n\n');
  }
}
