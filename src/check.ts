import type { LinkState, Row, Status } from './types.js';
import { normalizeUrl } from './parse/bookmarks.js';
import { readJson, writeJson } from './output.js';

export const USER_AGENT = 'then/0.1 (+https://github.com/RavaniRoshan/then-cli)';
const CACHE_FILE = 'cache.json';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;
const TRIES = 3;
const BLOCKED = new Set([401, 403, 429, 999]);

export function classify(status: number | null, finalUrl: string, originalUrl: string): LinkState {
  if (status === null) return 'dead';
  if (BLOCKED.has(status)) return 'blocked';
  if (status >= 200 && status < 400) {
    const final = normalizeUrl(finalUrl);
    return final && final !== normalizeUrl(originalUrl) ? 'redirected' : 'alive';
  }
  return 'dead';
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

async function request(url: string, method: 'HEAD' | 'GET'): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

async function checkOne(url: string): Promise<Status> {
  let response: Response | null = null;

  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    response = await request(url, 'HEAD');
    if (response && (response.status === 405 || response.status === 501)) {
      response = await request(url, 'GET');
    }
    if (response) break;
    if (attempt < TRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  const http = response?.status ?? null;
  const status: Status = {
    url,
    state: classify(http, response?.url ?? '', url),
    checkedAt: new Date().toISOString(),
  };
  if (http !== null) status.http = http;
  if (response && response.url && response.url !== url) status.finalUrl = response.url;

  void response?.body?.cancel().catch(() => undefined);
  return status;
}

export async function checkLinks(rows: Row[]): Promise<void> {
  const cache = readJson<Record<string, Status>>(CACHE_FILE, {});
  const fresh = new Map<string, Status>();
  const now = Date.now();

  for (const [url, status] of Object.entries(cache)) {
    if (!status.checkedAt || Date.parse(status.checkedAt) > now - CACHE_TTL_MS) {
      fresh.set(url, status);
    }
  }

  const pending = [...new Set(rows.map((row) => row.url))].filter((url) => !fresh.has(url));
  await mapLimit(pending, CONCURRENCY, async (url) => {
    fresh.set(url, await checkOne(url));
  });

  for (const row of rows) {
    const status = fresh.get(row.url);
    if (status) row.status = status;
  }

  writeJson(CACHE_FILE, Object.fromEntries(fresh));
}
