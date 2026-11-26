import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseBookmarks } from '../src/parse/bookmarks.ts';
import { readHistory } from '../src/parse/history.ts';
import { buildRows } from '../src/join.ts';
import { renderReport } from '../src/report/html.ts';
import { createFixtureHistory, fixtureProfileDir } from './fixtures/make-history.mjs';

beforeAll(() => {
  createFixtureHistory();
});

function fixture() {
  const bookmarks = parseBookmarks(join(fixtureProfileDir, 'Bookmarks'), 'Chrome', 'Default');
  const history = readHistory(join(fixtureProfileDir, 'History'));
  return buildRows(bookmarks, history.visits, history.window);
}

describe('join and derived stats', () => {
  it('joins bookmarks with visits and counts duplicates', () => {
    const data = fixture();
    expect(data.stats.total).toBe(6);
    expect(data.stats.years.map((year) => year.year)).toEqual([2014, 2020, 2026]);
    const alpha = data.rows.filter((row) => row.url === 'https://github.com/alpha');
    expect(alpha).toHaveLength(2);
    expect(alpha.every((row) => row.duplicateCount === 2)).toBe(true);
    expect(alpha[0]?.visit.lastVisitAt).toBe('2026-11-20T00:00:00.000Z');
  });

  it('reports the retained window and honest labels', () => {
    const data = fixture();
    expect(data.window.available).toBe(true);
    expect(data.stats.notOpenedRecently).toBe(2);
    expect(data.stats.neverOpened).toBe(0);

    const html = renderReport(data, { redact: false, checkedAt: '2026-11-26T00:00:00.000Z' });
    expect(html).toContain('not opened in the last 89 days');
    expect(html).not.toContain('<td class="dim">never opened since saving</td>');
    expect(html).toContain('history window 89 days');
    expect(html).toContain('6 links unchecked');
  });

  it('strips full URLs when redacted', () => {
    const data = fixture();
    const html = renderReport(data, { redact: true, checkedAt: '2026-11-26T00:00:00.000Z' });
    expect(html).not.toContain('https://github.com/alpha');
    expect(html).not.toContain('https://gone.example.com/a');
    expect(html).toContain('github.com');
  });
});
