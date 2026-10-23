import { z } from 'zod';
import { changedFromInit, readPanel } from '@/lib/app/tutor/panel';
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
 * (8,000 characters) however much of a DeepMind panel differs from init. `describe_synth` shows every control's current
 * value, section by section.
 */
const MAX_CHANGED = 100;
/** How many cables one read lists, for the same reason. A panel holds a handful; the panel schema allows 500. */
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
  /** The controls that differ from the synth's init patch. */
  changed: ChangedControl[];
  /** More controls differ, or more cables are in, than are listed. */
  truncated: boolean;
  /** The cables in, each `[output jack id, input jack id]`. */
  cables: CablePair[];
}

/** `get_panel`: the panel as the learner has it now, as the stream route passed it. Reads, never writes. */
export class GetPanelCapability extends BaseCapability<Args, PanelData> {
  readonly slug = 'get_panel';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_panel',
    description:
      "Read the synth panel as the learner has it now: the controls that differ from the synth's init patch (id, panel label and value) and the cables in. Call it before explaining or changing the patch. Read-only.",
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  };

  execute(_args: Args, context: CapabilityContext): Promise<CapabilityResult<PanelData>> {
    const read = readPanel(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    const { def, values, cables } = read.panel;
    const diff = changedFromInit(def, values);
    const changed: ChangedControl[] = def.controls
      .filter((c) => Object.hasOwn(diff, c.id))
      .map((c) => ({
        id: c.id,
        label: displayName(def, c),
        value: diff[c.id],
        shown: formatValue(c, diff[c.id]),
      }));
    return Promise.resolve(
      this.success({
        synthId: def.id,
        synthName: `${def.maker} ${def.name}`,
        version: def.version,
        changed: changed.slice(0, MAX_CHANGED),
        truncated: changed.length > MAX_CHANGED || cables.length > MAX_CABLES,
        cables: cables.slice(0, MAX_CABLES),
      })
    );
  }
}
