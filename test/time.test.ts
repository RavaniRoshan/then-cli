import { describe, expect, it } from 'vitest';
import { CHROME_EPOCH_MS, toDate, toIso, toYear, windowLengthDays } from '../src/parse/time.ts';

describe('Chrome time conversion', () => {
  it('converts the 1601 epoch offset exactly', () => {
    expect(CHROME_EPOCH_MS).toBe(Date.UTC(1601, 0, 1));
  });

  it('converts a large microsecond value past MAX_SAFE_INTEGER', () => {
    const micros = 13_432_348_800_000_000n;
    expect(toIso(micros)).toBe('2026-08-28T00:00:00.000Z');
  });

  it('accepts bigint, number, and string inputs', () => {
    const micros = 13_038_451_200_000_000n;
    expect(toIso(micros)).toBe('2014-03-05T00:00:00.000Z');
    expect(toYear(micros)).toBe(2014);
    expect(toIso('13038451200000000')).toBe('2014-03-05T00:00:00.000Z');
  });

  it('treats zero, missing, and junk as unknown', () => {
    expect(toDate(0)).toBeNull();
    expect(toDate('0')).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('not-a-number')).toBeNull();
    expect(toIso(Number.NaN)).toBeNull();
  });

  it('reports the retained window length in whole days', () => {
    expect(windowLengthDays('2026-08-28T00:00:00.000Z', '2026-11-25T00:00:00.000Z')).toBe(89);
    expect(windowLengthDays(null, '2026-11-25T00:00:00.000Z')).toBeNull();
  });
});
