import { describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { classify, checkLinks, USER_AGENT } from '../src/check.ts';
import { outputPath } from '../src/output.ts';
import type { Row } from '../src/types.ts';

function row(url: string): Row {
  return {
    url,
    title: '',
    folder: [],
    addedAt: '2014-03-05T00:00:00.000Z',
    browser: 'Chrome',
    profile: 'Default',
    visit: { url, lastVisitAt: null, visitCount: 0 },
    status: { url, state: 'unchecked' },
    duplicateCount: 1,
  };
}

describe('link classification', () => {
  it('never calls a bot wall dead', () => {
    expect(classify(401, 'https://a.test', 'https://a.test')).toBe('blocked');
    expect(classify(403, 'https://a.test', 'https://a.test')).toBe('blocked');
    expect(classify(429, 'https://a.test', 'https://a.test')).toBe('blocked');
    expect(classify(999, 'https://a.test', 'https://a.test')).toBe('blocked');
  });

  it('classifies success, redirects, and failures', () => {
    expect(classify(200, 'https://a.test', 'https://a.test')).toBe('alive');
    expect(classify(200, 'https://b.test/', 'https://b.test')).toBe('alive');
    expect(classify(301, 'https://new.test/x', 'https://old.test/x')).toBe('redirected');
    expect(classify(404, '', 'https://a.test')).toBe('dead');
    expect(classify(410, '', 'https://a.test')).toBe('dead');
    expect(classify(null, '', 'https://a.test')).toBe('dead');
  });

  it('never counts transient server errors as link rot', () => {
    expect(classify(500, '', 'https://a.test')).toBe('unchecked');
    expect(classify(503, '', 'https://a.test')).toBe('unchecked');
    expect(classify(400, '', 'https://a.test')).toBe('unchecked');
  });
});

describe('checkLinks with stubbed fetch', () => {
  it('HEAD first, GET on 405, and records the final URL', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (init.method === 'HEAD') {
        return new Response(null, { status: 405 });
      }
      return new Response(null, { status: 200 });
    }));

    rmSync(outputPath('cache.json'), { force: true });
    const rows = [row('https://moving.test/a')];
    await checkLinks(rows);

    expect(calls).toContain('HEAD https://moving.test/a');
    expect(calls).toContain('GET https://moving.test/a');
    expect(rows[0]?.status.http).toBe(200);
    expect(USER_AGENT).toContain('then/0.1');
    vi.unstubAllGlobals();
  });
});
