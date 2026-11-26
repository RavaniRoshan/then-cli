import type { Bookmark, HistoryWindow, Row, Stats, Visit, YearStats } from './types.js';

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function countBy(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

function top(counts: Map<string, number>, limit: number): Array<{ domain: string; count: number }> {
  return [...counts.entries()]
    .filter(([domain]) => domain.length > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}

export type Joined = {
  rows: Row[];
  stats: Stats;
  window: HistoryWindow;
  regret: Row[];
};

const WINDOW_END_FLOOR = '9999-12-31T23:59:59.999Z';

export function buildRows(
  bookmarks: Bookmark[],
  visitMap: Map<string, Visit>,
  window: HistoryWindow,
): Joined {
  const duplicates = countBy(bookmarks.map((bookmark) => bookmark.url));
  const rows: Row[] = bookmarks.map((bookmark) => ({
    ...bookmark,
    visit: visitMap.get(bookmark.url) ?? { url: bookmark.url, lastVisitAt: null, visitCount: 0 },
    status: { url: bookmark.url, state: 'unchecked' },
    duplicateCount: duplicates.get(bookmark.url) ?? 1,
  }));

  return refresh({ rows, window });
}

// Recomputes every status-dependent number. Call again after link checks
// mutate row.status, so dead shares and the regret queue reflect real checks.
export function refresh(joined: Pick<Joined, 'rows' | 'window'>): Joined {
  const { rows, window } = joined;

  const byYear = new Map<number, Row[]>();
  for (const row of rows) {
    const yearText = row.addedAt.slice(0, 4);
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : 0;
    const bucket = byYear.get(year) ?? [];
    bucket.push(row);
    byYear.set(year, bucket);
  }

  const years: YearStats[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, bucket]) => ({
      year,
      count: bucket.length,
      dead: bucket.filter((row) => row.status.state === 'dead').length,
      topDomains: top(countBy(bucket.map((row) => domainOf(row.url))), 3),
    }));

  const deadRows = rows.filter((row) => row.status.state === 'dead');
  const knownYears = years.map((year) => year.year).filter((year) => year !== 0);

  const windowStart = window.available ? window.start : null;
  const notOpenedRecently = window.available
    ? rows.filter((row) => row.visit.lastVisitAt === null).length
    : 0;
  const neverOpened = windowStart
    ? rows.filter(
        (row) =>
          row.visit.lastVisitAt === null &&
          row.addedAt !== '' &&
          row.addedAt >= windowStart &&
          row.addedAt <= (window.end ?? WINDOW_END_FLOOR),
      ).length
    : 0;

  const stats: Stats = {
    total: rows.length,
    dead: deadRows.length,
    blocked: rows.filter((row) => row.status.state === 'blocked').length,
    unchecked: rows.filter((row) => row.status.state === 'unchecked').length,
    notOpenedRecently,
    neverOpened,
    years,
    earliestYear: knownYears.length ? Math.min(...knownYears) : null,
    latestYear: knownYears.length ? Math.max(...knownYears) : null,
    topDeadDomains: top(countBy(deadRows.map((row) => domainOf(row.url))), 5),
  };

  const regret = window.available
    ? rows
        .filter(
          (row) =>
            row.visit.lastVisitAt === null &&
            (row.status.state === 'alive' ||
              row.status.state === 'redirected' ||
              row.status.state === 'blocked'),
        )
        .sort((a, b) => (a.addedAt || '9999').localeCompare(b.addedAt || '9999'))
        .slice(0, 10)
    : [];

  return { rows, stats, window, regret };
}
