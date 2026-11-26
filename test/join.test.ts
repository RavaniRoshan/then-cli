import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseBookmarks } from '../src/parse/bookmarks.ts';
import { readHistory } from '../src/parse/history.ts';
import { buildRows, refresh } from '../src/join.ts';
import { renderReport } from '../src/report/html.ts';
import { createFixtureHistory, fixtureProfileDir } from './fixtures/make-history.mjs';
import type { Row } from '../src/types.ts';

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

function bareRow(url: string, addedAt: string): Row {
  return {
    url,
    title: '',
    folder: [],
    addedAt,
    browser: 'Chrome',
    profile: 'Default',
    visit: { url, lastVisitAt: null, visitCount: 0 },
    status: { url, state: 'unchecked' },
    duplicateCount: 1,
  };
}

describe('status-dependent output', () => {
  it('recomputes dead stats after statuses change', () => {
    const data = fixture();
    const row = data.rows.find((item) => item.url === 'https://gone.example.com/a');
    expect(row).toBeDefined();
    row!.status = { url: row!.url, state: 'dead', http: 404 };

    const after = refresh(data);
    expect(after.stats.dead).toBe(1);
    expect(after.stats.years.find((year) => year.year === 2014)?.dead).toBe(1);
    expect(after.stats.topDeadDomains[0]?.domain).toBe('gone.example.com');
  });

  it('says checks were skipped instead of inventing a check date', () => {
    const data = fixture();
    const html = renderReport(data, { redact: false, checkedAt: null });
    expect(html).toContain('link checks skipped');
    expect(html).not.toContain('checked 20');
  });

  it('opens the report at the requested year', () => {
    const data = fixture();
    const html = renderReport(data, { redact: false, checkedAt: null, focusYear: 2020 });
    expect(html).toContain('class="tab active" data-year="2020"');
    expect(html).toContain('.tab.active');
  });

  it('sorts each year page by save date', () => {
    const rows = [
      bareRow('https://late.test/x', '2014-12-01T00:00:00.000Z'),
      bareRow('https://early.test/x', '2014-01-05T00:00:00.000Z'),
    ];
    const data = refresh({ rows, window: { start: null, end: null, available: false } });
    const html = renderReport(data, { redact: false, checkedAt: null });
    expect(html.indexOf('2014-01-05')).toBeLessThan(html.indexOf('2014-12-01'));
  });
});
