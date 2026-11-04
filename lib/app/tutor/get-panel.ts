import { z } from 'zod';
import { changedFromDefault, readPanel } from '@/lib/app/tutor/panel';
import { displayName, formatValue } from '@/lib/app/synths/lib/patch';
import type { CablePair, ControlValue } from '@/lib/app/synths/contract';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/**
 * How many changed controls one read lists. A library sound changes a few dozen. A row is about 100 characters, and the
 * tool loop sends every result again on each later step, so the cap keeps one read near `describe_synth`'s own budget
 * (8,000 characters) however much of a DeepMind panel differs from its Default patch. `describe_synth` shows every control's current
 * value, section by section.
 */
const MAX_CHANGED = 100;
/**
 * How many cables one read lists in each list, for the same reason. A panel holds a handful; the panel
 * schema allows 500.
 */
const MAX_CABLES = 100;

const schema = z.object({}).strict();

type Args = z.infer<typeof schema>;

export interface ChangedControl {
  id: string;
  /** The control's panel label, made unambiguous (`VOLUME · osc 2`). */
  label: string;
  value: ControlValue;
  /** The value as the panel reads it (`3.2 · 420 ms`, `Sawtooth`, `On`). */
  shown: string;
}

export interface PanelData {
  synthId: string;
  synthName: string;
  /** The definition version the panel was made on. */
  version: number;
  /** The controls that differ from the synth's Default patch. */
  changed: ChangedControl[];
  /** Every cable in, each `[output jack id, input jack id]`. */
  cables: CablePair[];
  /** The Default patch's own cables, which a designed sound starts with. */
  defaultCables: CablePair[];
  /** The Default patch's cables that the learner has taken out. */
  unplugged: CablePair[];
  /** More controls differ, or more cables changed, than are listed. */
  truncated: boolean;
}

/**
 * `get_panel`: the panel as the learner has it now, as the stream route passed it, told as what they changed from the
 * Default patch they set at step 0 (`changedFromDefault`). Reads, never writes.
 */
export class GetPanelCapability extends BaseCapability<Args, PanelData> {
  readonly slug = 'get_panel';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_panel',
    description:
      "Read the synth panel as the learner has it now, and what they changed from the synth's Default patch (the panel step 0 of every lesson sets): the controls that differ from it (id, panel label and value), every cable in, the Default patch's own cables, and those of its cables the learner has taken out. Call it before explaining or changing the patch. Read-only.",
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  };

  execute(_args: Args, context: CapabilityContext): Promise<CapabilityResult<PanelData>> {
    const read = readPanel(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    const { def, values, cables } = read.panel;
    const diff = changedFromDefault(def, values, cables);
    const changed: ChangedControl[] = def.controls
      .filter((c) => Object.hasOwn(diff.values, c.id))
      .map((c) => ({
        id: c.id,
        label: displayName(def, c),
        value: diff.values[c.id],
        shown: formatValue(c, diff.values[c.id]),
      }));
    return Promise.resolve(
      this.success({
        synthId: def.id,
        synthName: `${def.maker} ${def.name}`,
        version: def.version,
        changed: changed.slice(0, MAX_CHANGED),
        cables: cables.slice(0, MAX_CABLES),
        defaultCables: diff.defaultCables.slice(0, MAX_CABLES),
        unplugged: diff.unplugged.slice(0, MAX_CABLES),
        // `unplugged` is a subset of `defaultCables`, so it is cut only when that is.
        truncated:
          changed.length > MAX_CHANGED ||
          cables.length > MAX_CABLES ||
          diff.defaultCables.length > MAX_CABLES,
      })
    );
  }
}
