import type { Snapshot } from './types.js';
import { USER_AGENT } from './check.js';
import { readJson, writeJson } from './output.js';

const CACHE_FILE = 'wayback-cache.json';
const CONCURRENCY = 2;
const ENDPOINT = 'https://archive.org/wayback/available';

type AvailabilityResponse = {
  archived_snapshots?: {
    closest?: {
      status?: string;
      timestamp?: string;
      url?: string;
    };
  };
};

function timestampToIso(timestamp: string | undefined): string | undefined {
  if (!timestamp || !/^\d{14}$/.test(timestamp)) return undefined;
  const iso = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : iso;
}

export function parseSnapshot(url: string, payload: AvailabilityResponse): Snapshot {
  const closest = payload?.archived_snapshots?.closest;
  const snapshotUrl = closest?.url;
  const ok = closest?.status === '200' && typeof snapshotUrl === 'string' && snapshotUrl.length > 0;

  const snapshot: Snapshot = { url, available: Boolean(ok) };
  if (ok && snapshotUrl) {
    snapshot.snapshotUrl = snapshotUrl;
    const at = timestampToIso(closest?.timestamp);
    if (at) snapshot.snapshotAt = at;
  }
  return snapshot;
}

async function lookup(url: string): Promise<Snapshot> {
  try {
    const response = await fetch(`${ENDPOINT}?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { url, available: false };
    return parseSnapshot(url, (await response.json()) as AvailabilityResponse);
  } catch {
    return { url, available: false };
  }
}

export async function lookupSnapshots(urls: string[]): Promise<Map<string, Snapshot>> {
  const cache = readJson<Record<string, Snapshot>>(CACHE_FILE, {});
  const result = new Map<string, Snapshot>(Object.entries(cache));
  const pending = [...new Set(urls)].filter((url) => !result.has(url));

  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const url = pending[cursor++]!;
      result.set(url, await lookup(url));
    }
  });
  await Promise.all(runners);

  writeJson(CACHE_FILE, Object.fromEntries(result));
  return result;
}
