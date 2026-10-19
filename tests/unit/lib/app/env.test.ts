/**
 * The app's env vars, as `lib/env.ts` parses them at boot. A value that fails here stops the server, so what matters is
 * which values do: an unset or blank one takes the default, and a nonsensical one is refused.
 *
 * FORK NOTE — this reads the real `lib/app/env.ts` on purpose: it is Know Your Synth's own variables under test, not
 * the seam's default. A fork of this app that drops or renames `TUTOR_DAILY_TURNS` or `BRAVE_SEARCH_API_KEY` should change
 * this file with it.
 *
 * @see lib/app/env.ts
 */
import { describe, expect, it } from 'vitest';

import { appEnvSchema } from '@/lib/app/env';

describe('TUTOR_DAILY_TURNS', () => {
  const parse = (value: string | undefined) =>
    appEnvSchema.safeParse(value === undefined ? {} : { TUTOR_DAILY_TURNS: value });

  it('is 30 when unset, as BeatBuddy’s', () => {
    expect(parse(undefined)).toMatchObject({ success: true, data: { TUTOR_DAILY_TURNS: 30 } });
  });

  it('is 30 when set but blank, as an env file templated and left empty has it, rather than failing boot', () => {
    expect(parse('')).toMatchObject({ success: true, data: { TUTOR_DAILY_TURNS: 30 } });
  });

  it('takes a whole number from 1 to 1,000', () => {
    expect(parse('1')).toMatchObject({ success: true, data: { TUTOR_DAILY_TURNS: 1 } });
    expect(parse('1000')).toMatchObject({ success: true, data: { TUTOR_DAILY_TURNS: 1000 } });
  });

  it('refuses zero, a fraction, too many and a word', () => {
    for (const value of ['0', '2.5', '1001', 'thirty']) expect(parse(value).success).toBe(false);
  });
});

describe('BRAVE_SEARCH_API_KEY', () => {
  const parse = (value: string | undefined) =>
    appEnvSchema.safeParse(value === undefined ? {} : { BRAVE_SEARCH_API_KEY: value });

  it('is optional: unset or blank, the server boots with web search off', () => {
    for (const value of [undefined, '']) {
      const result = parse(value);
      expect(result.success).toBe(true);
      expect(result.data?.BRAVE_SEARCH_API_KEY).toBeUndefined();
    }
  });

  it('is kept as it is when set', () => {
    expect(parse('brave-key')).toMatchObject({
      success: true,
      data: { BRAVE_SEARCH_API_KEY: 'brave-key' },
    });
  });
});
