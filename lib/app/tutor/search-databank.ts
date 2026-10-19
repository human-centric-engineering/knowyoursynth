import { z } from 'zod';
import { BANK_KINDS } from '@/lib/app/bank/read';
import { MAX_QUERY_LENGTH, searchBank, type BankSearchHit } from '@/lib/app/bank/search';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/**
 * How many rows one search returns. Each is about 600 characters with its links, and the tool loop sends every result
 * again on each later step, so a handful keeps a search near the other tools' budgets. The best match is usually
 * first; a narrower query or a `kind` finds the rest.
 */
const RESULTS = 6;

const schema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    kind: z.enum(BANK_KINDS).optional(),
  })
  .strict();

type Args = z.infer<typeof schema>;

export interface DatabankSearchData {
  results: BankSearchHit[];
  /** Said when nothing matched, so the model knows the databank has no answer rather than guessing one. */
  note?: string;
}

/**
 * `search_databank`: the databank's artists, innovators, instruments and records, by name and text
 * (`f-tutor-knowledge` t-57). Reads the tables, never writes, and reads no user. The meaning-based layer joins in at
 * t-58.
 */
export class SearchDatabankCapability extends BaseCapability<Args, DatabankSearchData> {
  readonly slug = 'search_databank';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'search_databank',
    description:
      'Search the app\'s databank of checked facts: artists, innovators (designers and engineers), instruments and records, with what each played on or made. Use it first for any question about a person, a record, a band or a real instrument, before answering from memory. Search by names and key words ("Vangelis Blade Runner", "Minimoog"); narrow with kind. Each result has its page\'s link (href) and the rows it links to. Read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Names and key words to look for.',
          minLength: 1,
          maxLength: MAX_QUERY_LENGTH,
        },
        kind: {
          type: 'string',
          enum: [...BANK_KINDS],
          description:
            'Only this kind of row: artists, makers (innovators), instruments or songs (records).',
        },
      },
      required: ['query'],
    },
  };

  async execute(
    args: Args,
    _context: CapabilityContext
  ): Promise<CapabilityResult<DatabankSearchData>> {
    const results = await searchBank(args.query, { kind: args.kind, limit: RESULTS });
    return this.success(
      results.length
        ? { results }
        : {
            results,
            note: 'Nothing in the databank matches. Try other names or fewer words; if it still finds nothing, the databank does not cover this.',
          }
    );
  }
}
