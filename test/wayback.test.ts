import { describe, expect, it } from 'vitest';
import { parseSnapshot } from '../src/wayback.ts';
import { renderNetscape } from '../src/rescue.ts';
import type { RescueItem } from '../src/rescue.ts';

describe('Wayback parsing', () => {
  it('only offers snapshots with HTTP 200', () => {
    const ok = parseSnapshot('https://a.test/x', {
      archived_snapshots: {
        closest: { status: '200', timestamp: '20140305010203', url: 'https://web.archive.org/web/20140305010203/https://a.test/x' },
      },
    });
    expect(ok.available).toBe(true);
    expect(ok.snapshotAt).toBe('2014-03-05T01:02:03Z');
    expect(ok.snapshotUrl).toContain('web.archive.org');

    const redirect = parseSnapshot('https://a.test/x', {
      archived_snapshots: { closest: { status: '302', timestamp: '20140305010203', url: 'https://web.archive.org/web/1/' } },
    });
    expect(redirect.available).toBe(false);
    expect(redirect.snapshotUrl).toBeUndefined();

    expect(parseSnapshot('https://a.test/x', {}).available).toBe(false);
  });
});

describe('Netscape rescue output', () => {
  const items: RescueItem[] = [{
    title: '[archived] A page that vanished',
    originalUrl: 'https://gone.example.com/a',
    snapshotUrl: 'https://web.archive.org/web/20140305/https://gone.example.com/a',
    snapshotAt: '2014-03-05T00:00:00.000Z',
  }];

  it('prefixes titles and uses snapshot URLs only', () => {
    const html = renderNetscape(items);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('[archived] A page that vanished');
    expect(html).toContain('https://web.archive.org/web/20140305/');
    expect(html).not.toContain('HREF="https://gone.example.com/a"');
  });
});
