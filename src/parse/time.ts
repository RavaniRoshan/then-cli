export const CHROME_EPOCH_MS = Date.UTC(1601, 0, 1);

export type ChromeTimestamp = number | bigint | string | null | undefined;

/**
 * Chrome stores microseconds since 1601-01-01T00:00:00Z as a value that can
 * exceed Number.MAX_SAFE_INTEGER. Divide as bigint first, so the Date only
 * ever sees a safe millisecond value.
 */
export function toDate(value: ChromeTimestamp): Date | null {
  if (value === null || value === undefined || value === '') return null;

  let micros: bigint;
  try {
    if (typeof value === 'bigint') micros = value;
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      micros = BigInt(Math.trunc(value));
    } else {
      const text = value.trim();
      if (!text || !/^-?\d+$/.test(text)) return null;
      micros = BigInt(text);
    }
  } catch {
    return null;
  }

  if (micros === 0n) return null;

  const millis = CHROME_EPOCH_MS + Number(micros / 1000n);
  if (!Number.isFinite(millis)) return null;

  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIso(value: ChromeTimestamp): string | null {
  return toDate(value)?.toISOString() ?? null;
}

export function toYear(value: ChromeTimestamp): number | null {
  return toDate(value)?.getUTCFullYear() ?? null;
}

/** Whole days between two ISO timestamps, floored at zero. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** Length of the retained history window in whole days. */
export function windowLengthDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return daysBetween(start, end);
}
