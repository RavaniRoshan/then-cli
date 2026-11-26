import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HistoryWindow, Visit } from '../types.js';
import { normalizeUrl } from './bookmarks.js';
import { toIso } from './time.js';

export type HistoryData = {
  visits: Map<string, Visit>;
  window: HistoryWindow;
  cleanup: () => void;
};

const FILES = ['History', 'History-wal', 'History-shm'];

export function readHistory(historyPath: string): HistoryData {
  const copyDir = join(tmpdir(), `then-${process.pid}`);
  let cleaned = false;

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(copyDir, { recursive: true, force: true });
    } catch {
      // Best effort: a temp copy is never more important than the result.
    }
  };

  if (!historyPath || !existsSync(historyPath)) {
    return {
      visits: new Map(),
      window: { start: null, end: null, available: false },
      cleanup,
    };
  }

  mkdirSync(copyDir, { recursive: true });
  const copiedPath = join(copyDir, basename(historyPath));
  for (const name of FILES) {
    const source = join(historyPath, '..', name);
    if (existsSync(source)) {
      copyFileSync(source, join(copyDir, name));
    }
  }

  let db: DatabaseSync | undefined;
  try {
    // Chrome timestamps exceed MAX_SAFE_INTEGER; node:sqlite must return bigints.
    db = new DatabaseSync(copiedPath, { readOnly: true, readBigInts: true });

    const columns = new Set(
      (db.prepare('PRAGMA table_info(urls)').all() as Array<{ name: string }>).map((row) => row.name),
    );

    const visitCountExpr = columns.has('visit_count') ? 'visit_count' : '0';
    const rows = db
      .prepare(`SELECT url, last_visit_time, ${visitCountExpr} AS visit_count FROM urls`)
      .all() as Array<{ url: string; last_visit_time: number | bigint | null; visit_count: number | null }>;

    const visits = new Map<string, Visit>();
    for (const row of rows) {
      if (typeof row.url !== 'string') continue;
      const url = normalizeUrl(row.url);
      if (!url) continue;
      const lastVisitAt = toIso(row.last_visit_time);
      const previous = visits.get(url);
      const visitCount = Number(row.visit_count ?? 0) || 0;
      if (!previous || (lastVisitAt ?? '') > (previous.lastVisitAt ?? '')) {
        visits.set(url, { url, lastVisitAt, visitCount });
      }
    }

    let start: string | null = null;
    let end: string | null = null;
    const hasVisitsTable =
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='visits'").all() as unknown[]).length > 0;

    if (hasVisitsTable) {
      const bounds = db.prepare('SELECT MIN(visit_time) AS start, MAX(visit_time) AS end FROM visits').get() as {
        start: number | bigint | null;
        end: number | bigint | null;
      };
      start = toIso(bounds.start);
      end = toIso(bounds.end);
    } else {
      for (const visit of visits.values()) {
        if (!visit.lastVisitAt) continue;
        if (!start || visit.lastVisitAt < start) start = visit.lastVisitAt;
        if (!end || visit.lastVisitAt > end) end = visit.lastVisitAt;
      }
    }

    return { visits, window: { start, end, available: true }, cleanup };
  } catch {
    return {
      visits: new Map(),
      window: { start: null, end: null, available: false },
      cleanup,
    };
  } finally {
    db?.close();
  }
}

process.on('exit', () => {
  // Covers unexpected exits; normal runs call cleanup() in a finally block.
  rmSync(join(tmpdir(), `then-${process.pid}`), { recursive: true, force: true });
});
