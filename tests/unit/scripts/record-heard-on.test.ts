/**
 * The "Heard on" recorder: writes each prototype synth's list, by synth id, and refuses to overwrite a recording
 * unless told to (D3: the prototype is the spec, so a port never re-records it to pass).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@/scripts/prototype-synths', () => ({
  loadPrototypeSynths: vi.fn(async () => [
    {
      id: 'zed',
      lineage: {
        heard: [
          { who: 'Z', what: 'W', on: 'O', text: 'T', song: 's', artists: ['z'], year: undefined },
        ],
      },
    },
    { id: 'abc', lineage: undefined },
    { id: 'mid', lineage: {} },
  ]),
}));

const { recordHeardOn, HEARD_ON_FILE } = await import('@/scripts/record-heard-on');

let out: string;
beforeEach(() => {
  out = join(mkdtempSync(join(tmpdir(), 'kys-heard-')), 'nested', 'heard-on.json');
});

describe('recordHeardOn', () => {
  it('writes every synth’s list by id, in id order, dropping undefined keys as the API does', async () => {
    await recordHeardOn([], out);
    const written: unknown = JSON.parse(readFileSync(out, 'utf8'));
    expect(written).toEqual({
      abc: [],
      mid: [],
      zed: [{ who: 'Z', what: 'W', on: 'O', text: 'T', song: 's', artists: ['z'] }],
    });
    expect(Object.keys(written as object)).toEqual(['abc', 'mid', 'zed']);
  });

  it('refuses to overwrite a recording, unless --rerecord', async () => {
    await recordHeardOn([], out);
    writeFileSync(out, '{}');
    await expect(recordHeardOn([], out)).rejects.toThrow(/already recorded/);
    expect(readFileSync(out, 'utf8')).toBe('{}');
    await recordHeardOn(['--rerecord'], out);
    expect(readFileSync(out, 'utf8')).toContain('"zed"');
  });

  it('records into the committed fixture by default', () => {
    expect(HEARD_ON_FILE.endsWith(join('tests', 'fixtures', 'bank', 'heard-on.json'))).toBe(true);
    expect(existsSync(HEARD_ON_FILE)).toBe(true);
  });
});
